import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayOfWeek,
  daysBetween,
  deriveWindows,
  mostRecentSunday,
  todayInTimezone,
  trendRange,
  weeklyBuckets,
  windowsForReportDate,
} from '../../lib/metrics/windows';

describe('windowsForReportDate', () => {
  // The spec's own worked example: "Week of Mon 10 Aug to Sun 16 Aug 2026"
  // with "Trailing 30 days - 18 Jul to 16 Aug".
  const w = windowsForReportDate('2026-08-16');

  it('derives the week as the Monday-to-Sunday ending on the report date', () => {
    expect(w.week).toEqual({ start: '2026-08-10', end: '2026-08-16' });
  });

  it('derives the trailing 30 days as 30 inclusive days ending the same Sunday', () => {
    expect(w.thirty).toEqual({ start: '2026-07-18', end: '2026-08-16' });
    expect(daysBetween(w.thirty.start, w.thirty.end)).toBe(29); // 30 days inclusive
  });

  it('ends both windows on the same day', () => {
    expect(w.thirty.end).toBe(w.week.end);
  });

  it('rejects a report date that is not a Sunday', () => {
    expect(() => windowsForReportDate('2026-08-17')).toThrow(/must be a Sunday/);
  });
});

describe('mostRecentSunday', () => {
  it('returns yesterday when the pipeline runs on a Monday', () => {
    // The spec's cadence is a Monday run reporting on the week that just closed.
    expect(dayOfWeek('2026-08-17')).toBe(1); // Monday
    expect(mostRecentSunday('2026-08-17')).toBe('2026-08-16');
  });

  it('returns the same day when called on a Sunday', () => {
    expect(mostRecentSunday('2026-08-16')).toBe('2026-08-16');
  });

  it('walks back correctly from mid-week', () => {
    expect(mostRecentSunday('2026-08-20')).toBe('2026-08-16'); // Thursday
  });
});

describe('DST safety', () => {
  // Windows are civil-date arithmetic, so a clock change must not shift them.
  it('keeps a 7-day week across the US spring-forward transition', () => {
    // US DST began Sunday 8 Mar 2026.
    const w = windowsForReportDate('2026-03-08');
    expect(w.week).toEqual({ start: '2026-03-02', end: '2026-03-08' });
    expect(daysBetween(w.week.start, w.week.end)).toBe(6);
  });

  it('keeps a 7-day week across the autumn fall-back transition', () => {
    // US DST ended Sunday 1 Nov 2026.
    const w = windowsForReportDate('2026-11-01');
    expect(w.week).toEqual({ start: '2026-10-26', end: '2026-11-01' });
    expect(daysBetween(w.week.start, w.week.end)).toBe(6);
  });

  it('spans a month boundary without drift', () => {
    const w = windowsForReportDate('2026-03-01');
    expect(w.week).toEqual({ start: '2026-02-23', end: '2026-03-01' });
    expect(w.thirty.start).toBe('2026-01-31');
  });

  it('handles a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
  });
});

describe('deriveWindows (timezone-aware, spec section 8)', () => {
  it('uses the ad account timezone, not server time, to pick the report date', () => {
    // 2026-08-17T04:00Z is still Sunday 16 Aug in Los Angeles but already
    // Monday 17 Aug in London. Both must report on Sunday 16 Aug, but they
    // get there from different local dates.
    const at = new Date('2026-08-17T04:00:00Z');

    expect(todayInTimezone('America/Los_Angeles', at)).toBe('2026-08-16');
    expect(todayInTimezone('Europe/London', at)).toBe('2026-08-17');

    expect(deriveWindows('America/Los_Angeles', at).reportDate).toBe('2026-08-16');
    expect(deriveWindows('Europe/London', at).reportDate).toBe('2026-08-16');
  });

  it('does not roll to a new report date until the local week has closed', () => {
    // Monday 17 Aug 23:00 in Los Angeles is Tuesday 18 Aug in London, but both
    // are still reporting on the Sunday that closed on 16 Aug.
    const at = new Date('2026-08-18T06:00:00Z');
    expect(deriveWindows('America/Los_Angeles', at).reportDate).toBe('2026-08-16');
    expect(deriveWindows('Europe/London', at).reportDate).toBe('2026-08-16');
  });
});

describe('weeklyBuckets (sparkline)', () => {
  const REPORT_DATE = '2026-08-16';

  it('produces 6 full weekly buckets, oldest first, ending on the report date', () => {
    const buckets = weeklyBuckets(REPORT_DATE, 6);
    expect(buckets).toHaveLength(6);
    expect(buckets[5]).toEqual({ start: '2026-08-10', end: '2026-08-16' });
  });

  it('reaches back 42 days, further than the 30-day verdict window', () => {
    // Six 7-day buckets need 42 days. Clamping them to the trailing-30 window
    // would yield 5 points plus a stub, which is not what the design shows.
    const buckets = weeklyBuckets(REPORT_DATE, 6);
    expect(buckets[0]!.start).toBe('2026-07-06');
    expect(daysBetween(buckets[0]!.start, buckets[5]!.end)).toBe(41);
    expect(trendRange(REPORT_DATE, 6)).toEqual({ start: '2026-07-06', end: '2026-08-16' });
  });

  it('makes every bucket exactly 7 days', () => {
    for (const b of weeklyBuckets(REPORT_DATE, 6)) {
      expect(daysBetween(b.start, b.end)).toBe(6);
    }
  });

  it('leaves no gaps or overlaps between buckets', () => {
    const buckets = weeklyBuckets(REPORT_DATE, 6);
    for (let i = 1; i < buckets.length; i++) {
      expect(buckets[i]!.start).toBe(addDays(buckets[i - 1]!.end, 1));
    }
  });
});
