import { AccountCard } from '@/components/AccountCard';
import { AlertBanner } from '@/components/AlertBanner';
import { Header } from '@/components/Header';
import { hasVerifiedLinkTemplates } from '@/lib/config';
import { loadAccounts, readLatestSnapshot } from '@/lib/db/queries';
import { fmtPullTimestamp } from '@/lib/metrics/format';

// The data changes once a day, but it is written by a cron rather than a
// request, so render per-request and let the DB read (a handful of indexed
// queries against one snapshot id) be the cost.
export const dynamic = 'force-dynamic';

/** Above this share of unjoined Pipes revenue, warn on the page (spec section 4). */
const UNJOINED_WARN_PCT = 2;

export default async function DashboardPage() {
  const [snapshot, accountConfigs] = await Promise.all([readLatestSnapshot(), loadAccounts()]);

  if (!snapshot) {
    return (
      <main className="min-h-screen px-10 pb-16 pt-9">
        <Header pullTimestamp="never" />
        <div className="mt-8 rounded-card border border-card-border bg-card px-6 py-8 text-chip text-muted-deep">
          No report has been generated yet. Run the daily pipeline to populate the dashboard:
          <div className="mt-3 font-mono text-xs+">npm run db:fixtures</div>
        </div>
      </main>
    );
  }

  const alertPctByAccount = new Map(accountConfigs.map((a) => [a.id, a.unassignedAlertPct]));
  const defaultAlertPct = accountConfigs[0]?.unassignedAlertPct ?? 20;

  // Which accounts have slipped past their unassigned threshold this week.
  const unassignedOver: string[] = [];
  for (const account of snapshot.accounts) {
    if (!account.week || account.week.spendCents === 0) continue;
    const pct = (account.week.unassignedSpendCents / account.week.spendCents) * 100;
    if (pct >= (alertPctByAccount.get(account.accountId) ?? defaultAlertPct)) {
      unassignedOver.push(account.name);
    }
  }

  const unjoinedOver = snapshot.accounts
    .filter((a) => a.unjoinedRevenuePct !== null && a.unjoinedRevenuePct >= UNJOINED_WARN_PCT)
    .map((a) => ({ name: a.name, pct: a.unjoinedRevenuePct! }));

  // The pull timestamp is printed in account-local terms (spec section 8).
  const displayTz = snapshot.accounts[0]?.timezone ?? 'UTC';
  const pulled = `${fmtPullTimestamp(new Date(snapshot.pulledAt), displayTz)} (account-local time)`;

  return (
    <main className="min-h-screen px-10 pb-16 pt-9">
      <Header pullTimestamp={pulled} />

      {!hasVerifiedLinkTemplates() && (
        <div className="my-[18px] rounded-[10px] border border-alert-border bg-alert-bg px-4 py-3 text-chip text-alert-fg">
          <strong className="font-bold">Ads Manager links are unverified.</strong> Capture the
          filtered URLs by hand and set ADS_MANAGER_*_URL_TEMPLATE — see
          docs/ads-manager-urls.md.
        </div>
      )}

      <AlertBanner
        unassignedAccounts={unassignedOver}
        thresholdPct={defaultAlertPct}
        unjoinedAccounts={unjoinedOver}
      />

      <div className="mt-5 grid grid-cols-accounts gap-[22px]">
        {snapshot.accounts.map((account) => (
          <AccountCard
            key={account.accountId}
            account={account}
            unassignedAlertPct={alertPctByAccount.get(account.accountId) ?? defaultAlertPct}
          />
        ))}
      </div>

      {/* The caveat from spec section 8, kept on the page deliberately. */}
      <div className="mx-auto mt-10 max-w-[760px] text-center text-ad leading-relaxed text-muted">
        This measures ads carrying an editor&apos;s name, not editor skill in isolation. Brief,
        offer, audience and budget are all confounded with who cut the ad.
      </div>
    </main>
  );
}
