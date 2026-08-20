/**
 * Report health warnings.
 *
 * Spec section 8: the unassigned percentage is the health check on the report
 * itself — "when it climbs, the naming convention has slipped. Make the bot
 * shout above 20%."
 *
 * The unjoined-revenue warning is the section 4 check: if Pipes revenue that
 * failed to join is not near zero, every ROAS on the page is understated, and
 * that has to be visible rather than buried in a log.
 */
export function AlertBanner({
  unassignedAccounts,
  thresholdPct,
  unjoinedAccounts,
}: {
  unassignedAccounts: string[];
  thresholdPct: number;
  unjoinedAccounts: Array<{ name: string; pct: number }>;
}) {
  if (unassignedAccounts.length === 0 && unjoinedAccounts.length === 0) return null;

  return (
    <div className="my-[18px] flex flex-col gap-2">
      {unassignedAccounts.length > 0 && (
        <div className="flex flex-wrap items-center gap-[10px] rounded-[10px] border border-alert-border bg-alert-bg px-4 py-3 text-chip text-alert-fg">
          <strong className="font-bold">
            Unassigned spend over {Math.round(thresholdPct)}%
          </strong>
          <span>
            {unassignedAccounts.join(', ')} — naming convention likely slipped on these accounts.
          </span>
        </div>
      )}

      {unjoinedAccounts.length > 0 && (
        <div className="flex flex-wrap items-center gap-[10px] rounded-[10px] border border-alert-border bg-alert-bg px-4 py-3 text-chip text-alert-fg">
          <strong className="font-bold">Pipes revenue failed to join</strong>
          <span>
            {unjoinedAccounts.map((a) => `${a.name} (${a.pct.toFixed(1)}%)`).join(', ')} — every
            ROAS shown for these accounts is understated.
          </span>
        </div>
      )}
    </div>
  );
}
