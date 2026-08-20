import { fmtMoney, fmtRoas, fmtWinning } from '@/lib/metrics/format';
import type { EditorReport } from '@/lib/metrics/types';
import { Sparkline } from './Sparkline';

const POSITIVE = 'oklch(55% 0.15 145)';
const NEGATIVE = 'oklch(55% 0.19 25)';
const NEUTRAL = 'oklch(65% 0.01 250)';

/**
 * One editor's 30-day row.
 *
 * The three places the spec overrides the mockup all live here:
 *
 *  1. `beatsTarget === null` (account target is "to confirm") renders NO dot.
 *     The mockup would have fallen through to a red one, which is a verdict
 *     nobody agreed to.
 *  2. `winning === null` renders NO winning-ad count, as distinct from
 *     "no ads cleared target", which means the target IS set and none did.
 *  3. "no spend this week" is an annotation beside the name, not a dot in the
 *     verdict position — it describes the WEEK, and this is the 30-day section.
 */
export function EditorRow({
  editor,
  href,
  showNoSpendNote,
}: {
  editor: EditorReport;
  href: string;
  showNoSpendNote: boolean;
}) {
  const hasVerdict = editor.beatsTarget !== null;
  const verdictColor = editor.beatsTarget ? POSITIVE : NEGATIVE;
  const sparkColor = hasVerdict ? verdictColor : NEUTRAL;
  const winningLabel = fmtWinning(editor.winning);

  return (
    <div className="rounded-tile border border-rule bg-tile px-[14px] py-3">
      <div className="flex items-start justify-between gap-[10px]">
        <div className="flex min-w-0 items-center gap-2">
          {hasVerdict && (
            <span
              className="h-[9px] w-[9px] flex-none rounded-full"
              style={{ background: verdictColor }}
              aria-label={editor.beatsTarget ? 'Above target' : 'Below target'}
            />
          )}
          <a
            href={href}
            target="_blank"
            rel="noopener"
            className="truncate text-editor font-bold no-underline"
          >
            {editor.token}
          </a>
          {showNoSpendNote && (
            <span className="whitespace-nowrap text-badge text-muted">no spend this week</span>
          )}
        </div>
        <Sparkline values={editor.trend} color={sparkColor} />
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-stat text-ink-soft">
        <span>
          <strong>{fmtMoney(editor.thirty.spendCents)}</strong> spend
        </span>
        <span>
          Pipes <strong>{fmtRoas(editor.thirtyPipesRoas)}</strong>
        </span>
        {/* Null winning => omitted entirely, not rendered as "0 winning ads". */}
        {winningLabel !== null && <span>{winningLabel}</span>}
      </div>

      {editor.topAds.length > 0 && (
        <div className="mt-2 flex flex-col gap-[3px]">
          {editor.topAds.map((ad, i) => (
            <div
              key={ad.metaAdId}
              className="flex justify-between gap-[10px] text-xs+ text-muted-deep"
            >
              <a
                href={href}
                target="_blank"
                rel="noopener"
                className="max-w-[230px] truncate no-underline"
                title={ad.adName}
              >
                {i + 1}. {ad.adName}
              </a>
              <span className="flex-none font-mono">
                {fmtMoney(ad.spendCents)} · {fmtRoas(ad.pipesRoas)}
                {ad.isNew && ' · new'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Only when the target IS set and genuinely nothing cleared it. */}
      {editor.winning !== null && editor.winning.total === 0 && (
        <div className="mt-2 text-xs+ italic text-muted">no ads cleared target in 30 days</div>
      )}
    </div>
  );
}
