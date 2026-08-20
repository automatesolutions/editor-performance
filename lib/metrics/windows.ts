/**
 * Window derivation (spec section 2 and section 8).
 *
 * Every number belongs to one of two windows:
 *   - This week: previous Monday to Sunday.
 *   - Trailing 30 days: the 30 days ending that same Sunday.
 *
 * Both are derived in the AD ACCOUNT's reporting timezone, never server time.
 * Meta's Insights API interprets time_range since/until in the ad account's
 * timezone, so these plain 'YYYY-MM-DD' strings pass straight through with no
 * conversion. Pipes may not — convert its timestamps to account-local before
 * bucketing, or revenue lands on the wrong day and leaks across the boundary.
 *
 * Pure module: calendar arithmetic on 'YYYY-MM-DD' strings only. Working in
 * plain civil dates (rather than instants) sidesteps DST entirely — a calendar
 * day is a calendar day regardless of whether the clocks moved that night.
 */

import type { DateRange, ReportWindows } from './types';

const MS_PER_DAY = 86_400_000;

/** Parse 'YYYY-MM-DD' into a UTC-anchored epoch ms for pure calendar math. */
function parseCivil(date: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Expected a YYYY-MM-DD date, got: ${date}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Format a UTC-anchored epoch ms back to 'YYYY-MM-DD'. */
function formatCivil(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return formatCivil(parseCivil(date) + days * MS_PER_DAY);
}

/** Days between two civil dates (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseCivil(b) - parseCivil(a)) / MS_PER_DAY);
}

/** 0 = Sunday ... 6 = Saturday, for a civil date. */
export function dayOfWeek(date: string): number {
  return new Date(parseCivil(date)).getUTCDay();
}

export function isWithin(date: string, range: DateRange): boolean {
  return date >= range.start && date <= range.end;
}

/**
 * Today's civil date in a given IANA timezone.
 *
 * Uses en-CA because it formats as YYYY-MM-DD, which is exactly the shape we
 * carry everywhere else.
 */
export function todayInTimezone(timezone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * The most recent Sunday on or before `date`.
 *
 * When the pipeline runs on a Monday (the spec's cadence), this returns
 * *yesterday* — the Sunday that just closed — so the week window is the
 * Monday-to-Sunday that just completed, not the one still in progress.
 */
export function mostRecentSunday(date: string): string {
  return addDays(date, -dayOfWeek(date));
}

/**
 * Derive both windows from the Sunday they end on.
 *
 * The trailing-30 window is 30 days INCLUSIVE of that Sunday, so it starts 29
 * days earlier. Both windows end on the same day: thirty.end === week.end.
 */
export function windowsForReportDate(reportDate: string): ReportWindows {
  if (dayOfWeek(reportDate) !== 0) {
    throw new Error(`Report date must be a Sunday, got ${reportDate}`);
  }
  return {
    reportDate,
    week: { start: addDays(reportDate, -6), end: reportDate },
    thirty: { start: addDays(reportDate, -29), end: reportDate },
  };
}

/**
 * The windows an account should report on right now, in its own timezone.
 *
 * `asOf` defaults to the current instant; pass it explicitly in tests.
 */
export function deriveWindows(timezone: string, asOf: Date = new Date()): ReportWindows {
  const localToday = todayInTimezone(timezone, asOf);
  return windowsForReportDate(mostRecentSunday(localToday));
}

/**
 * Consecutive 7-day buckets ending on the report date, oldest first, for the
 * per-editor sparkline.
 *
 * Note this deliberately reaches back FURTHER than the trailing-30 window:
 * six 7-day buckets span 42 days, not 30. The sparkline is a trend leading
 * into the 30-day verdict, so it wants more history than the verdict itself —
 * clamping it to 30 days would yield only five points, one of them a stub.
 * Callers must therefore supply facts covering the full span, which
 * `trendRange` computes.
 *
 * The buckets are contiguous and non-overlapping, and the last one always
 * ends on `reportDate`.
 */
export function weeklyBuckets(reportDate: string, count = 6): DateRange[] {
  const buckets: DateRange[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const end = addDays(reportDate, -7 * i);
    buckets.push({ start: addDays(end, -6), end });
  }
  return buckets;
}

/**
 * The full date range the sparkline needs: `count` weeks ending on the report
 * date. Use this when deciding how much history to fetch or retain.
 */
export function trendRange(reportDate: string, count = 6): DateRange {
  return { start: addDays(reportDate, -(7 * count - 1)), end: reportDate };
}
