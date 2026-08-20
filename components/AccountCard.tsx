import { getLinkTemplates } from '@/lib/config';
import { buildAccountLink, buildEditorLink } from '@/lib/links';
import {
  fmtCount,
  fmtMoney,
  fmtPct,
  fmtRoas,
  fmtThirtyRange,
  fmtWeekRange,
} from '@/lib/metrics/format';
import { pooledRoas } from '@/lib/metrics/compute';
import type { AccountReport } from '@/lib/metrics/types';
import { EditorRow } from './EditorRow';

const NEGATIVE = 'oklch(55% 0.19 25)';
const NEUTRAL = 'oklch(65% 0.01 250)';

function Badge({
  children,
  bg,
  fg,
}: {
  children: React.ReactNode;
  bg: string;
  fg: string;
}) {
  return (
    <span
      className={`whitespace-nowrap rounded-badge px-[9px] py-1 text-badge font-semibold ${bg} ${fg}`}
    >
      {children}
    </span>
  );
}

export function AccountCard({
  account,
  unassignedAlertPct,
}: {
  account: AccountReport;
  unassignedAlertPct: number;
}) {
  const templates = getLinkTemplates();
  const { week, thirty } = account.windows;

  const accountHref = buildAccountLink(templates, account.primaryMetaAccountId, week);

  const unassignedPct =
    account.week && account.week.spendCents > 0
      ? (account.week.unassignedSpendCents / account.week.spendCents) * 100
      : 0;
  const unassignedOver = unassignedPct >= unassignedAlertPct;

  const weekPipesRoas = account.week
    ? pooledRoas(account.week.pipesRevenueCents, account.week.spendCents)
    : null;
  const weekMetaRoas = account.week
    ? pooledRoas(account.week.metaValueCents, account.week.spendCents)
    : null;

  return (
    <div className="flex flex-col gap-[14px] rounded-card border border-card-border bg-card px-[22px] py-5">
      {/* Header: name, ad account id(s), target and floor badges */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <a
            href={accountHref}
            target="_blank"
            rel="noopener"
            className="text-acct font-bold no-underline"
          >
            {account.name}
          </a>
          <div className="mt-[2px] font-mono text-2xs text-muted-light">
            {/* X-ALL MPC spans two ad accounts; show both, link to the primary. */}
            {account.metaAccountIds.join(' + ')}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-[6px]">
          {account.targetRoas !== null ? (
            <Badge bg="bg-badge-target-bg" fg="text-badge-target-fg">
              Target {fmtRoas(account.targetRoas)}
            </Badge>
          ) : (
            // Spec section 1: "target not set" — and no verdicts anywhere below.
            <Badge bg="bg-badge-unset-bg" fg="text-badge-unset-fg">
              Target not set
            </Badge>
          )}
          <Badge bg="bg-badge-floor-bg" fg="text-badge-floor-fg">
            Floor {fmtMoney(account.spendFloorCents)}
          </Badge>
        </div>
      </div>

      {/* A failed pull is shown explicitly, never as a silent zero. */}
      {account.status === 'failed' && (
        <div className="rounded-tile border border-alert-border bg-alert-bg px-4 py-[14px] text-chip text-alert-fg">
          <strong className="font-bold">Pull failed.</strong>{' '}
          {account.errorMessage ?? 'This account did not report.'}
        </div>
      )}

      {/* This week */}
      {account.status !== 'failed' &&
        (account.week === null ? (
          <div className="rounded-tile bg-panel px-4 py-[14px] text-chip text-muted-deep">
            No spend this week · {fmtWeekRange(week)}
          </div>
        ) : (
          <div>
            <div className="mb-2 text-2xs font-semibold uppercase tracking-[.04em] text-muted">
              This week · {fmtWeekRange(week)}
            </div>
            <div className="grid grid-cols-4 gap-[10px]">
              <Stat value={fmtMoney(account.week.spendCents)} label="spend" />
              <Stat value={fmtCount(account.week.orders)} label="orders" />
              <Stat value={fmtRoas(weekPipesRoas)} label="Pipes ROAS" />
              <Stat value={fmtRoas(weekMetaRoas)} label="Meta ROAS" />
            </div>

            {/* The unassigned line is the health check on the report itself. */}
            <div
              className="mt-[10px] flex items-center justify-between border-t border-dashed border-rule-dashed pt-[10px] text-ad"
              style={{ color: unassignedOver ? NEGATIVE : NEUTRAL }}
            >
              <span>
                No editor name · {fmtCount(account.week.unassignedAdCount)} ads ·{' '}
                {fmtMoney(account.week.unassignedSpendCents)}
              </span>
              <span className="font-bold">{fmtPct(unassignedPct)} of spend</span>
            </div>
          </div>
        ))}

      {account.status !== 'failed' && <div className="mt-[2px] border-t border-rule" />}

      {/* Trailing 30 days — the only section carrying verdicts. */}
      {account.status !== 'failed' && (
        <div>
          <div className="mb-[10px] text-2xs font-semibold uppercase tracking-[.04em] text-muted">
            Trailing 30 days · {fmtThirtyRange(thirty)}
          </div>
          {account.editors.length === 0 ? (
            <div className="text-xs+ italic text-muted">
              No editor-attributed spend in this window.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {account.editors.map((editor) => (
                <EditorRow
                  key={editor.token}
                  editor={editor}
                  href={buildEditorLink(
                    templates,
                    account.primaryMetaAccountId,
                    thirty,
                    editor.token,
                  )}
                  showNoSpendNote={editor.week === null}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-acct font-bold">{value}</div>
      <div className="text-2xs text-muted">{label}</div>
    </div>
  );
}
