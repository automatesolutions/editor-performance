/**
 * The daily pipeline.
 *
 * Pulls ad-level data from Meta and Pipes for every account, joins it,
 * computes the two windows per spec section 5, and writes one versioned
 * snapshot to Postgres. The page reads that snapshot; it never calls a source
 * API itself.
 */

import type { MetaClient, PipesClient } from '../clients/types';
import { getConfig } from '../config';
import {
  createSnapshot,
  finalizeSnapshot,
  loadAccounts,
  loadEditorTokens,
  writeAccountReport,
} from '../db/queries';
import { computeAccountReport } from '../metrics/compute';
import { joinMetaPipes } from '../metrics/join';
import type {
  AccountConfig,
  AccountReport,
  AdWithDelivery,
  MetaAdFact,
  ReportWindows,
} from '../metrics/types';
import { deriveWindows, trendRange } from '../metrics/windows';

export interface PipelineResult {
  snapshotId: number;
  reportDate: string;
  status: 'complete' | 'partial' | 'failed';
  accounts: Array<{
    accountId: number;
    name: string;
    status: AccountReport['status'];
    error?: string;
    unjoinedRevenuePct: number | null;
  }>;
}

export interface RunOptions {
  meta: MetaClient;
  pipes: PipesClient;
  /** Defaults to now; pass explicitly in tests. */
  now?: Date;
  /** Restrict the run to certain account ids, for targeted re-runs. */
  accountIds?: number[];
}

/**
 * Process one account end to end.
 *
 * Throws on source failure; the caller isolates it so one account cannot
 * poison the other nine.
 */
export async function processAccount(
  account: AccountConfig,
  windows: ReportWindows,
  editorTokens: string[],
  clients: { meta: MetaClient; pipes: PipesClient },
): Promise<AccountReport> {
  const cfg = getConfig();

  // Fetch across the sparkline span, which reaches further back than the
  // 30-day verdict window; the shorter windows are subsets of these rows, so
  // one pull serves all of them and they cannot disagree.
  const fetchRange = trendRange(windows.reportDate);

  // An account may span several Meta ad accounts (X-ALL MPC spans two). Fetch
  // each and concatenate the RAW rows — every ratio is taken later, from
  // summed cents, which is what spec section 1 requires.
  const metaFacts: MetaAdFact[] = [];
  for (const ref of account.metaAccounts) {
    const facts = await clients.meta.fetchAdInsights(ref.metaAccountId, fetchRange);
    metaFacts.push(...facts);
  }

  // Scoped to this account's Meta ad accounts: all ten share one Pipes project,
  // so an unscoped pull would make every other account's revenue look unjoined.
  const pipesFacts = await clients.pipes.fetchAdRevenue(
    account.pipesProject,
    account.metaAccounts.map((m) => m.metaAccountId),
    fetchRange,
  );

  const { joined, diagnostic } = joinMetaPipes(
    metaFacts,
    pipesFacts,
    cfg.PIPES_ALLOW_UTM_FALLBACK,
  );

  // First delivery dates drive the new-vs-holdover split, so they are fetched
  // per ad account and merged before computing.
  const deliveryByAd = new Map<string, string>();
  for (const ref of account.metaAccounts) {
    const adIds = [
      ...new Set(
        metaFacts.filter((f) => f.metaAccountId === ref.metaAccountId).map((f) => f.metaAdId),
      ),
    ];
    if (adIds.length === 0) continue;
    const dates = await clients.meta.fetchFirstDeliveryDates(ref.metaAccountId, adIds);
    for (const [adId, date] of dates) deliveryByAd.set(adId, date);
  }

  const ads: AdWithDelivery[] = joined.map((ad) => ({
    ...ad,
    firstDeliveryDate: deliveryByAd.get(ad.metaAdId) ?? null,
  }));

  return computeAccountReport({
    account,
    windows,
    ads,
    editorTokens,
    unjoinedRevenuePct: diagnostic.unjoinedPct,
  });
}

/**
 * Run the pipeline for every configured account.
 *
 * Each account is isolated: a failure writes a 'failed' row and the run
 * continues, so one expired token cannot cost the other nine their report.
 * The snapshot finalizes as 'partial' when any account failed.
 */
export async function runDailyPipeline(opts: RunOptions): Promise<PipelineResult> {
  const now = opts.now ?? new Date();

  const [allAccounts, editorTokens] = await Promise.all([loadAccounts(), loadEditorTokens()]);

  const accounts = opts.accountIds
    ? allAccounts.filter((a) => opts.accountIds!.includes(a.id))
    : allAccounts;

  if (accounts.length === 0) {
    throw new Error('No active accounts configured — run `npm run db:seed` first.');
  }

  // Every account's windows end on the same Sunday, but each is derived in its
  // own timezone, so the report date comes from the first account's zone and
  // per-account windows are derived individually below.
  const reportDate = deriveWindows(accounts[0]!.timezone, now).reportDate;
  const snapshotId = await createSnapshot(reportDate, now);

  const results: PipelineResult['accounts'] = [];
  let anyFailed = false;
  let anySucceeded = false;

  for (const account of accounts) {
    const windows = deriveWindows(account.timezone, now);
    try {
      const report = await processAccount(account, windows, editorTokens, {
        meta: opts.meta,
        pipes: opts.pipes,
      });
      await writeAccountReport(snapshotId, report);
      anySucceeded = true;
      results.push({
        accountId: account.id,
        name: account.name,
        status: report.status,
        unjoinedRevenuePct: report.unjoinedRevenuePct,
      });
    } catch (error) {
      anyFailed = true;
      const message = error instanceof Error ? error.message : String(error);

      // A failed account still gets a row, so the UI can show an explicit
      // error rather than silently omitting the card (spec section 2).
      await writeAccountReport(snapshotId, {
        accountId: account.id,
        name: account.name,
        slug: account.slug,
        metaAccountIds: account.metaAccounts.map((m) => m.metaAccountId),
        primaryMetaAccountId:
          account.metaAccounts.find((m) => m.isPrimary)?.metaAccountId ??
          account.metaAccounts[0]?.metaAccountId ??
          '',
        targetRoas: account.targetRoas,
        spendFloorCents: account.spendFloorCents,
        timezone: account.timezone,
        windows,
        status: 'failed',
        errorMessage: message,
        week: null,
        editors: [],
        unjoinedRevenuePct: null,
      }).catch(() => {
        // If even the failure row cannot be written, keep going: the other
        // accounts still deserve their reports.
      });

      results.push({
        accountId: account.id,
        name: account.name,
        status: 'failed',
        error: message,
        unjoinedRevenuePct: null,
      });
    }
  }

  const status = anyFailed ? (anySucceeded ? 'partial' : 'failed') : 'complete';
  await finalizeSnapshot(snapshotId, status);

  return { snapshotId, reportDate, status, accounts: results };
}
