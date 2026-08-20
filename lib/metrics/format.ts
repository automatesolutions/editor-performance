/**
 * Display formatting. Shared by the pipeline (logs, diagnostics) and the UI so
 * a number never renders two different ways in two places.
 *
 * Pure module.
 */

import type { DateRange } from './types';

/** "$20,830" — whole dollars, from integer cents. */
export function fmtMoney(cents: number): string {
  return '$' + Math.round(cents / 100).toLocaleString('en-US');
}

/**
 * "1.55x" — always two decimals.
 *
 * The mockup used Math.round(n*100)/100, which drops trailing zeros and turns
 * 2.30 into "2.3x". Two fixed decimals keep the figures aligned in the mono
 * column where they sit next to each other.
 */
export function fmtRoas(roas: number | null): string {
  if (roas === null) return '—';
  return roas.toFixed(2) + 'x';
}

/** "12%" — whole percent. */
export function fmtPct(pct: number): string {
  return Math.round(pct) + '%';
}

export function fmtCount(n: number): string {
  return n.toLocaleString('en-US');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parts(date: string): { y: number; m: number; d: number; dow: number } {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const d = Number(date.slice(8, 10));
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { y, m, d, dow };
}

/** "Mon 10 Aug" */
export function fmtDayDate(date: string): string {
  const { m, d, dow } = parts(date);
  return `${DAYS[dow]} ${d} ${MONTHS[m - 1]}`;
}

/** "18 Jul" */
export function fmtShortDate(date: string): string {
  const { m, d } = parts(date);
  return `${d} ${MONTHS[m - 1]}`;
}

/** "Mon 10 Aug – Sun 16 Aug 2026" — the week header format from the spec. */
export function fmtWeekRange(range: DateRange): string {
  const end = parts(range.end);
  return `${fmtDayDate(range.start)} – ${fmtDayDate(range.end)} ${end.y}`;
}

/** "18 Jul – 16 Aug" — the trailing-30 header format from the spec. */
export function fmtThirtyRange(range: DateRange): string {
  return `${fmtShortDate(range.start)} – ${fmtShortDate(range.end)}`;
}

/**
 * The winning-ad summary for an editor row.
 *
 * Returns null when the account has no target: show no count at all, rather
 * than "0 winning ads", which would read as a verdict nobody agreed to
 * (spec section 1).
 */
export function fmtWinning(winning: { total: number; new: number } | null): string | null {
  if (winning === null) return null;
  if (winning.total === 0) return 'no ads cleared target';
  const noun = winning.total === 1 ? 'winning ad' : 'winning ads';
  return `${winning.total} ${noun} (${winning.new} new)`;
}

/** "Mon 17 Aug 2026, 2:14pm" in a given IANA timezone. */
export function fmtPullTimestamp(at: Date, timezone: string): string {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return fmt.format(at).replace(/,\s*(\d)/, ', $1');
}
