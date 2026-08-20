/**
 * Database reads and writes.
 *
 * The boundary between Postgres row shapes and the domain types in
 * lib/metrics/types.ts lives here: numerics arrive as strings from the driver
 * and are converted once, so nothing downstream has to think about it.
 */

import type {
  AccountConfig,
  AccountReport,
  AccountStatus,
  EditorReport,
  ReportSnapshot,
  WinningAd,
} from '../metrics/types';
import { getSql } from './client';

/** postgres numeric/bigint columns come back as strings; normalize once. */
function num(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : Number(value);
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'number' ? value : Number(value);
}

/** postgres `date` columns come back as Date objects; we carry 'YYYY-MM-DD'. */
function dateStr(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export async function loadAccounts(): Promise<AccountConfig[]> {
  const sql = getSql();
  const rows = await sql<
    Array<{
      id: number;
      name: string;
      slug: string;
      target_roas: string | null;
      spend_floor_cents: string;
      unassigned_alert_pct: string;
      timezone: string;
      pipes_project: string;
      display_order: number;
      meta_account_id: string;
      is_primary: boolean;
    }>
  >`
    select a.id, a.name, a.slug, a.target_roas, a.spend_floor_cents,
           a.unassigned_alert_pct, a.timezone, a.pipes_project, a.display_order,
           m.meta_account_id, m.is_primary
    from accounts a
    join meta_ad_accounts m on m.account_id = a.id
    where a.is_active
    order by a.display_order, m.is_primary desc, m.meta_account_id
  `;

  const byId = new Map<number, AccountConfig>();
  for (const r of rows) {
    let acct = byId.get(r.id);
    if (!acct) {
      acct = {
        id: r.id,
        name: r.name,
        slug: r.slug,
        // Preserved as null when "to confirm" — never coerced to a default.
        targetRoas: numOrNull(r.target_roas),
        spendFloorCents: num(r.spend_floor_cents),
        timezone: r.timezone,
        pipesProject: r.pipes_project,
        displayOrder: r.display_order,
        metaAccounts: [],
        unassignedAlertPct: num(r.unassigned_alert_pct),
      };
      byId.set(r.id, acct);
    }
    acct.metaAccounts.push({ metaAccountId: r.meta_account_id, isPrimary: r.is_primary });
  }

  return [...byId.values()];
}

export async function loadEditorTokens(): Promise<string[]> {
  const sql = getSql();
  const rows = await sql<Array<{ token: string }>>`
    select token from editor_tokens where is_active order by token
  `;
  return rows.map((r) => r.token);
}

// ---------------------------------------------------------------------------
// Snapshot lifecycle
// ---------------------------------------------------------------------------

export async function createSnapshot(reportDate: string, pulledAt: Date): Promise<number> {
  const sql = getSql();
  const [row] = await sql<Array<{ id: string }>>`
    insert into report_snapshots (report_date, status, pulled_at)
    values (${reportDate}, 'running', ${pulledAt})
    returning id
  `;
  return Number(row!.id);
}

/**
 * Flip a snapshot to a terminal status. Only after this does the page see it,
 * which is what keeps a mid-run refresh from rendering half-written data.
 */
export async function finalizeSnapshot(
  snapshotId: number,
  status: 'complete' | 'partial' | 'failed',
): Promise<void> {
  const sql = getSql();
  await sql`update report_snapshots set status = ${status} where id = ${snapshotId}`;
}

export async function writeAccountReport(
  snapshotId: number,
  report: AccountReport,
): Promise<void> {
  const sql = getSql();

  await sql.begin(async (tx) => {
    await tx`
      insert into snapshot_accounts (
        snapshot_id, account_id, status, error_message,
        week_start, week_end, thirty_start, thirty_end,
        week_spend_cents, week_orders, week_pipes_revenue_cents, week_meta_value_cents,
        week_unassigned_spend_cents, week_unassigned_ad_count, unjoined_revenue_pct
      ) values (
        ${snapshotId}, ${report.accountId}, ${report.status}, ${report.errorMessage},
        ${report.windows.week.start}, ${report.windows.week.end},
        ${report.windows.thirty.start}, ${report.windows.thirty.end},
        ${report.week?.spendCents ?? null}, ${report.week?.orders ?? null},
        ${report.week?.pipesRevenueCents ?? null}, ${report.week?.metaValueCents ?? null},
        ${report.week?.unassignedSpendCents ?? null}, ${report.week?.unassignedAdCount ?? null},
        ${report.unjoinedRevenuePct}
      )
      on conflict (snapshot_id, account_id) do update set
        status = excluded.status,
        error_message = excluded.error_message,
        week_spend_cents = excluded.week_spend_cents,
        week_orders = excluded.week_orders,
        week_pipes_revenue_cents = excluded.week_pipes_revenue_cents,
        week_meta_value_cents = excluded.week_meta_value_cents,
        week_unassigned_spend_cents = excluded.week_unassigned_spend_cents,
        week_unassigned_ad_count = excluded.week_unassigned_ad_count,
        unjoined_revenue_pct = excluded.unjoined_revenue_pct
    `;

    for (const ed of report.editors) {
      await tx`
        insert into snapshot_editors (
          snapshot_id, account_id, editor_token,
          week_spend_cents, week_orders, week_pipes_revenue_cents, week_meta_value_cents,
          thirty_spend_cents, thirty_pipes_revenue_cents,
          beats_target, winning_ads_new, winning_ads_holdover, trend_roas
        ) values (
          ${snapshotId}, ${report.accountId}, ${ed.token},
          ${ed.week?.spendCents ?? null}, ${ed.week?.orders ?? null},
          ${ed.week?.pipesRevenueCents ?? null}, ${ed.week?.metaValueCents ?? null},
          ${ed.thirty.spendCents}, ${ed.thirty.pipesRevenueCents},
          ${ed.beatsTarget}, ${ed.winning?.new ?? null}, ${ed.winning?.holdover ?? null},
          ${ed.trend}
        )
        on conflict (snapshot_id, account_id, editor_token) do update set
          week_spend_cents = excluded.week_spend_cents,
          week_orders = excluded.week_orders,
          week_pipes_revenue_cents = excluded.week_pipes_revenue_cents,
          week_meta_value_cents = excluded.week_meta_value_cents,
          thirty_spend_cents = excluded.thirty_spend_cents,
          thirty_pipes_revenue_cents = excluded.thirty_pipes_revenue_cents,
          beats_target = excluded.beats_target,
          winning_ads_new = excluded.winning_ads_new,
          winning_ads_holdover = excluded.winning_ads_holdover,
          trend_roas = excluded.trend_roas
      `;

      await tx`
        delete from snapshot_top_ads
        where snapshot_id = ${snapshotId}
          and account_id = ${report.accountId}
          and editor_token = ${ed.token}
      `;

      for (const [i, adRow] of ed.topAds.entries()) {
        await tx`
          insert into snapshot_top_ads (
            snapshot_id, account_id, editor_token, rank,
            meta_ad_id, ad_name, spend_cents, pipes_roas, is_new
          ) values (
            ${snapshotId}, ${report.accountId}, ${ed.token}, ${i + 1},
            ${adRow.metaAdId}, ${adRow.adName}, ${adRow.spendCents},
            ${adRow.pipesRoas}, ${adRow.isNew}
          )
        `;
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Reads (the page)
// ---------------------------------------------------------------------------

/**
 * The newest snapshot the page may render.
 *
 * Filters on a terminal status so an in-flight run is invisible, and orders by
 * id so a re-run for the same report date wins over the earlier attempt.
 */
export async function readLatestSnapshot(): Promise<ReportSnapshot | null> {
  const sql = getSql();

  const [snap] = await sql<
    Array<{ id: string; report_date: Date; status: string; pulled_at: Date }>
  >`
    select id, report_date, status, pulled_at
    from report_snapshots
    where status in ('complete','partial')
    order by report_date desc, id desc
    limit 1
  `;
  if (!snap) return null;

  const snapshotId = Number(snap.id);

  const [accountRows, editorRows, adRows] = await Promise.all([
    sql<Array<Record<string, unknown>>>`
      select sa.*, a.name, a.slug, a.target_roas, a.spend_floor_cents, a.timezone,
             a.display_order
      from snapshot_accounts sa
      join accounts a on a.id = sa.account_id
      where sa.snapshot_id = ${snapshotId}
      order by a.display_order
    `,
    sql<Array<Record<string, unknown>>>`
      select * from snapshot_editors
      where snapshot_id = ${snapshotId}
      order by thirty_spend_cents desc
    `,
    sql<Array<Record<string, unknown>>>`
      select * from snapshot_top_ads
      where snapshot_id = ${snapshotId}
      order by account_id, editor_token, rank
    `,
  ]);

  const metaRows = await sql<Array<{ account_id: number; meta_account_id: string; is_primary: boolean }>>`
    select account_id, meta_account_id, is_primary
    from meta_ad_accounts
    order by account_id, is_primary desc, meta_account_id
  `;

  const topAdsByEditor = new Map<string, WinningAd[]>();
  for (const r of adRows) {
    const key = `${r.account_id}|${r.editor_token}`;
    const list = topAdsByEditor.get(key) ?? [];
    list.push({
      metaAdId: String(r.meta_ad_id),
      adName: String(r.ad_name),
      spendCents: num(r.spend_cents),
      pipesRoas: num(r.pipes_roas),
      isNew: Boolean(r.is_new),
    });
    topAdsByEditor.set(key, list);
  }

  const editorsByAccount = new Map<number, EditorReport[]>();
  for (const r of editorRows) {
    const accountId = Number(r.account_id);
    const token = String(r.editor_token);
    const thirtySpend = num(r.thirty_spend_cents);
    const thirtyRevenue = num(r.thirty_pipes_revenue_cents);
    const newCount = numOrNull(r.winning_ads_new);
    const holdoverCount = numOrNull(r.winning_ads_holdover);
    const topAds = topAdsByEditor.get(`${accountId}|${token}`) ?? [];

    const list = editorsByAccount.get(accountId) ?? [];
    list.push({
      token,
      week:
        r.week_spend_cents === null || r.week_spend_cents === undefined
          ? null
          : {
              spendCents: num(r.week_spend_cents),
              orders: num(r.week_orders),
              pipesRevenueCents: num(r.week_pipes_revenue_cents),
              metaValueCents: num(r.week_meta_value_cents),
            },
      thirty: { spendCents: thirtySpend, pipesRevenueCents: thirtyRevenue },
      thirtyPipesRoas: thirtySpend > 0 ? thirtyRevenue / thirtySpend : null,
      // NULL in the column means the account has no target: no dot, no count.
      beatsTarget: r.beats_target === null || r.beats_target === undefined
        ? null
        : Boolean(r.beats_target),
      winning:
        newCount === null || holdoverCount === null
          ? null
          : { total: newCount + holdoverCount, new: newCount, holdover: holdoverCount },
      topAds,
      trend: Array.isArray(r.trend_roas) ? r.trend_roas.map(num) : [],
    });
    editorsByAccount.set(accountId, list);
  }

  const accounts: AccountReport[] = accountRows.map((r) => {
    const accountId = Number(r.account_id);
    const metas = metaRows.filter((m) => Number(m.account_id) === accountId);
    const primary = metas.find((m) => m.is_primary) ?? metas[0];

    return {
      accountId,
      name: String(r.name),
      slug: String(r.slug),
      metaAccountIds: metas.map((m) => m.meta_account_id),
      primaryMetaAccountId: primary?.meta_account_id ?? '',
      targetRoas: numOrNull(r.target_roas),
      spendFloorCents: num(r.spend_floor_cents),
      timezone: String(r.timezone),
      windows: {
        reportDate: dateStr(r.thirty_end),
        week: { start: dateStr(r.week_start), end: dateStr(r.week_end) },
        thirty: { start: dateStr(r.thirty_start), end: dateStr(r.thirty_end) },
      },
      status: String(r.status) as AccountStatus,
      errorMessage: r.error_message === null ? null : String(r.error_message),
      week:
        r.week_spend_cents === null || r.week_spend_cents === undefined
          ? null
          : {
              spendCents: num(r.week_spend_cents),
              orders: num(r.week_orders),
              pipesRevenueCents: num(r.week_pipes_revenue_cents),
              metaValueCents: num(r.week_meta_value_cents),
              unassignedSpendCents: num(r.week_unassigned_spend_cents),
              unassignedAdCount: num(r.week_unassigned_ad_count),
            },
      editors: editorsByAccount.get(accountId) ?? [],
      unjoinedRevenuePct: numOrNull(r.unjoined_revenue_pct),
    };
  });

  return {
    id: snapshotId,
    reportDate: dateStr(snap.report_date),
    status: snap.status as ReportSnapshot['status'],
    pulledAt: snap.pulled_at.toISOString(),
    accounts,
  };
}
