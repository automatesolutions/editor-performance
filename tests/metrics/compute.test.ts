import { describe, expect, it } from 'vitest';
import { computeAccountReport, pooledRoas } from '../../lib/metrics/compute';
import type { AccountConfig, AdWithDelivery } from '../../lib/metrics/types';
import { windowsForReportDate } from '../../lib/metrics/windows';

const TOKENS = ['Suzaine', 'Klemen', 'Santiago', 'CB', 'Ilias'];
const WINDOWS = windowsForReportDate('2026-08-16');

function account(overrides: Partial<AccountConfig> = {}): AccountConfig {
  return {
    id: 1,
    name: 'Splash Foam',
    slug: 'splash-foam',
    targetRoas: 1.3,
    spendFloorCents: 100_000, // $1,000
    timezone: 'America/Los_Angeles',
    pipesProject: 'admin.fourammedia.com/platforms',
    displayOrder: 1,
    metaAccounts: [{ metaAccountId: '258610945617994', isPrimary: true }],
    unassignedAlertPct: 20,
    ...overrides,
  };
}

/** One day's row for an ad. Money in dollars for readability; stored as cents. */
function ad(o: {
  id: string;
  name: string;
  date: string;
  spend: number;
  revenue?: number;
  metaValue?: number;
  orders?: number;
  firstDelivery?: string | null;
}): AdWithDelivery {
  return {
    metaAdId: o.id,
    adName: o.name,
    dateLocal: o.date,
    spendCents: Math.round(o.spend * 100),
    purchaseConversionValueCents: Math.round((o.metaValue ?? 0) * 100),
    pipesRevenueCents: Math.round((o.revenue ?? 0) * 100),
    orders: o.orders ?? 0,
    firstDeliveryDate: o.firstDelivery === undefined ? o.date : o.firstDelivery,
  };
}

function compute(ads: AdWithDelivery[], acct = account()) {
  return computeAccountReport({
    account: acct,
    windows: WINDOWS,
    ads,
    editorTokens: TOKENS,
    unjoinedRevenuePct: 0,
  });
}

describe('pooledRoas (spec section 3)', () => {
  it('is SUM(revenue)/SUM(spend), never an average of per-ad ratios', () => {
    // Ad A: $100 spend, $300 revenue -> 3.0x
    // Ad B: $10,000 spend, $5,000 revenue -> 0.5x
    // Average of ratios = 1.75x. Pooled = 5300/10100 = 0.5247x.
    const pooled = pooledRoas(530_000, 1_010_000)!;
    expect(pooled).toBeCloseTo(5300 / 10100, 10);
    expect(pooled).not.toBeCloseTo(1.75, 2);
  });

  it('returns null on zero spend rather than Infinity or NaN', () => {
    expect(pooledRoas(50_000, 0)).toBeNull();
    expect(pooledRoas(0, 0)).toBeNull();
  });
});

describe('pooled, not averaged, at the editor level', () => {
  it('pools an editor across their ads', () => {
    const report = compute([
      ad({ id: 'a', name: 'SF_Suzaine_Small_v1', date: '2026-08-11', spend: 100, revenue: 300 }),
      ad({ id: 'b', name: 'SF_Suzaine_Big_v1', date: '2026-08-11', spend: 10_000, revenue: 5_000 }),
    ]);

    const suzaine = report.editors.find((e) => e.token === 'Suzaine')!;
    expect(suzaine.thirtyPipesRoas).toBeCloseTo(5300 / 10100, 10);
    // The averaged figure would have cleared the 1.3x target. The pooled one must not.
    expect(suzaine.beatsTarget).toBe(false);
  });
});

describe('the spend floor accumulates across 30 days (spec section 5)', () => {
  // "Because the floor is measured across 30 days, an ad spending $600 a week
  //  accumulates past $1,000 and appears in its second week."
  const NAME = 'SF_Santiago_Slow_v1';

  it('does not count the ad in week one, when 30-day spend is $600', () => {
    const report = compute([
      ad({ id: 'slow', name: NAME, date: '2026-08-12', spend: 600, revenue: 1200 }),
    ]);
    const santiago = report.editors.find((e) => e.token === 'Santiago')!;
    expect(santiago.winning).toEqual({ total: 0, new: 0, holdover: 0 });
    expect(santiago.topAds).toHaveLength(0);
  });

  it('counts the ad in week two, once 30-day spend reaches $1,200', () => {
    const report = compute([
      ad({ id: 'slow', name: NAME, date: '2026-08-05', spend: 600, revenue: 1200 }),
      ad({ id: 'slow', name: NAME, date: '2026-08-12', spend: 600, revenue: 1200 }),
    ]);
    const santiago = report.editors.find((e) => e.token === 'Santiago')!;
    expect(santiago.winning!.total).toBe(1);
    expect(santiago.topAds[0]!.spendCents).toBe(120_000);
    expect(santiago.topAds[0]!.pipesRoas).toBeCloseTo(2.0, 5);
  });
});

describe('new vs holdover (spec section 5)', () => {
  it('counts a March ad still performing, as a holdover not an exclusion', () => {
    // "An ad from March still performing counts: the leaderboard has to
    //  reconcile with where the money went."
    const report = compute([
      ad({
        id: 'march',
        name: 'SF_CB_Evergreen_v1',
        date: '2026-08-12',
        spend: 5_000,
        revenue: 10_000,
        firstDelivery: '2026-03-04',
      }),
    ]);
    const cb = report.editors.find((e) => e.token === 'CB')!;
    expect(cb.winning).toEqual({ total: 1, new: 0, holdover: 1 });
    expect(cb.topAds[0]!.isNew).toBe(false);
  });

  it('counts an ad first delivered inside the window as new', () => {
    const report = compute([
      ad({
        id: 'fresh',
        name: 'SF_CB_Fresh_v1',
        date: '2026-08-12',
        spend: 5_000,
        revenue: 10_000,
        firstDelivery: '2026-08-01',
      }),
    ]);
    const cb = report.editors.find((e) => e.token === 'CB')!;
    expect(cb.winning).toEqual({ total: 1, new: 1, holdover: 0 });
    expect(cb.topAds[0]!.isNew).toBe(true);
  });

  it('treats an unknown delivery date as a holdover rather than guessing new', () => {
    const report = compute([
      ad({
        id: 'unknown',
        name: 'SF_CB_Unknown_v1',
        date: '2026-08-12',
        spend: 5_000,
        revenue: 10_000,
        firstDelivery: null,
      }),
    ]);
    const cb = report.editors.find((e) => e.token === 'CB')!;
    expect(cb.winning).toEqual({ total: 1, new: 0, holdover: 1 });
  });
});

describe('a null target suppresses every verdict (spec section 1)', () => {
  // "Where the target says 'to confirm', run the account but show no green
  //  checks and no winning-ad count [...] Never fall back to a default."
  const noTarget = account({ targetRoas: null, name: 'Splash Spotless' });

  const ads = [
    ad({ id: 'a', name: 'SS_Suzaine_Bubble_v2', date: '2026-08-12', spend: 6_200, revenue: 9_300 }),
  ];

  it('reports the account rather than skipping it', () => {
    const report = compute(ads, noTarget);
    expect(report.status).toBe('ok');
    expect(report.editors).toHaveLength(1);
  });

  it('still shows spend and pooled ROAS', () => {
    const report = compute(ads, noTarget);
    const suzaine = report.editors[0]!;
    expect(suzaine.thirty.spendCents).toBe(620_000);
    expect(suzaine.thirtyPipesRoas).toBeCloseTo(1.5, 5);
  });

  it('emits a NULL verdict, not a false one that would render a red dot', () => {
    const report = compute(ads, noTarget);
    expect(report.editors[0]!.beatsTarget).toBeNull();
  });

  it('emits a NULL winning count, distinct from zero', () => {
    const report = compute(ads, noTarget);
    expect(report.editors[0]!.winning).toBeNull();
    expect(report.editors[0]!.topAds).toHaveLength(0);
  });

  it('never substitutes a default target from another account', () => {
    const withTarget = compute(ads, account({ targetRoas: 1.3 }));
    const without = compute(ads, noTarget);
    // Same ads, 1.5x pooled: with a target it is a verdict; without, nothing.
    expect(withTarget.editors[0]!.beatsTarget).toBe(true);
    expect(without.editors[0]!.beatsTarget).toBeNull();
  });
});

describe('top ads are capped but never padded (spec section 8)', () => {
  const winner = (n: number, spend: number) =>
    ad({ id: `w${n}`, name: `SF_Ilias_W${n}`, date: '2026-08-12', spend, revenue: spend * 2 });

  it('caps at three, ordered by spend descending', () => {
    const report = compute([winner(1, 5_000), winner(2, 9_000), winner(3, 7_000), winner(4, 3_000)]);
    const ilias = report.editors.find((e) => e.token === 'Ilias')!;
    expect(ilias.winning!.total).toBe(4);
    expect(ilias.topAds).toHaveLength(3);
    expect(ilias.topAds.map((a) => a.metaAdId)).toEqual(['w2', 'w3', 'w1']);
  });

  it('shows only what exists when there are fewer than three', () => {
    const report = compute([winner(1, 5_000)]);
    const ilias = report.editors.find((e) => e.token === 'Ilias')!;
    expect(ilias.topAds).toHaveLength(1);
  });

  it('never pads with ads that missed target', () => {
    const report = compute([
      winner(1, 5_000),
      // Clears the floor but misses the 1.3x target: must not appear.
      ad({ id: 'miss', name: 'SF_Ilias_Miss', date: '2026-08-12', spend: 4_000, revenue: 4_000 }),
    ]);
    const ilias = report.editors.find((e) => e.token === 'Ilias')!;
    expect(ilias.winning!.total).toBe(1);
    expect(ilias.topAds.map((a) => a.metaAdId)).toEqual(['w1']);
  });
});

describe('unassigned spend (spec section 8)', () => {
  it('routes two-token ads to unassigned rather than double-counting', () => {
    const report = compute([
      ad({ id: 'clear', name: 'SF_Santiago_Clean_v1', date: '2026-08-12', spend: 8_000, revenue: 12_000 }),
      ad({ id: 'both', name: 'SF_Santiago_CB_v2', date: '2026-08-12', spend: 2_000, revenue: 3_000 }),
    ]);

    const santiago = report.editors.find((e) => e.token === 'Santiago')!;
    // The ambiguous ad's $2,000 must NOT appear in Santiago's total.
    expect(santiago.week!.spendCents).toBe(800_000);
    expect(report.editors.find((e) => e.token === 'CB')).toBeUndefined();

    expect(report.week!.unassignedSpendCents).toBe(200_000);
    expect(report.week!.unassignedAdCount).toBe(1);
    // The account total still includes it: the money was spent.
    expect(report.week!.spendCents).toBe(1_000_000);
  });

  it('counts ads with no token at all as unassigned', () => {
    const report = compute([
      ad({ id: 'x', name: 'SF_Generic_Promo_v1', date: '2026-08-12', spend: 2_410, revenue: 1_000 }),
      ad({ id: 'y', name: 'SF_Suzaine_v1', date: '2026-08-12', spend: 7_590, revenue: 12_000 }),
    ]);
    expect(report.week!.unassignedSpendCents).toBe(241_000);
    expect(report.week!.unassignedAdCount).toBe(1);
  });

  it('counts distinct ads, not daily rows, in the unassigned ad count', () => {
    const report = compute([
      ad({ id: 'x', name: 'SF_Generic_v1', date: '2026-08-11', spend: 500 }),
      ad({ id: 'x', name: 'SF_Generic_v1', date: '2026-08-12', spend: 500 }),
    ]);
    expect(report.week!.unassignedAdCount).toBe(1);
    expect(report.week!.unassignedSpendCents).toBe(100_000);
  });
});

describe('editor ordering and week/30d separation', () => {
  it('sorts editors by 30-day spend descending (spec section 5)', () => {
    const report = compute([
      ad({ id: 'a', name: 'SF_CB_v1', date: '2026-08-12', spend: 3_880, revenue: 4_000 }),
      ad({ id: 'b', name: 'SF_Santiago_v1', date: '2026-08-12', spend: 7_340, revenue: 14_000 }),
      ad({ id: 'c', name: 'SF_Suzaine_v1', date: '2026-08-12', spend: 5_110, revenue: 8_700 }),
    ]);
    expect(report.editors.map((e) => e.token)).toEqual(['Santiago', 'Suzaine', 'CB']);
  });

  it('marks an editor with 30-day spend but none this week as no-spend-this-week', () => {
    const report = compute([
      // Inside the 30-day window but before the week window.
      ad({ id: 'old', name: 'SF_Klemen_v1', date: '2026-07-20', spend: 4_000, revenue: 5_000 }),
      ad({ id: 'new', name: 'SF_Suzaine_v1', date: '2026-08-12', spend: 5_000, revenue: 8_000 }),
    ]);
    const klemen = report.editors.find((e) => e.token === 'Klemen')!;
    expect(klemen.week).toBeNull();
    expect(klemen.thirty.spendCents).toBe(400_000);
  });

  it('excludes spend outside the trailing-30 window entirely', () => {
    const report = compute([
      ad({ id: 'stale', name: 'SF_Suzaine_v1', date: '2026-07-01', spend: 9_999, revenue: 20_000 }),
      ad({ id: 'live', name: 'SF_Suzaine_v1', date: '2026-08-12', spend: 1_000, revenue: 2_000 }),
    ]);
    const suzaine = report.editors.find((e) => e.token === 'Suzaine')!;
    expect(suzaine.thirty.spendCents).toBe(100_000);
  });
});

describe('accounts with no spend still produce a report (spec section 2)', () => {
  // "Accounts with no spend still get a message saying so, so a missing
  //  message always means a broken pull."
  it('reports no_spend, distinct from failed', () => {
    const report = compute([]);
    expect(report.status).toBe('no_spend');
    expect(report.errorMessage).toBeNull();
    expect(report.week).toBeNull();
    expect(report.editors).toHaveLength(0);
  });
});

describe('X-ALL MPC spans two ad accounts (spec section 1)', () => {
  // "sum the raw numbers across both before calculating any ratio"
  const mpc = account({
    id: 10,
    name: 'X-ALL MPC',
    slug: 'x-all-mpc',
    targetRoas: 1.4,
    metaAccounts: [
      { metaAccountId: '514584538156509', isPrimary: true },
      { metaAccountId: '2620458594817497', isPrimary: false },
    ],
  });

  it('sums raw cents across both accounts before taking the ratio', () => {
    // Account A: $1,000 spend / $2,000 revenue -> 2.0x
    // Account B: $9,000 spend / $9,000 revenue -> 1.0x
    // Averaging the two ratios gives 1.5x (clears 1.4x). Pooling gives
    // 11000/10000 = 1.1x (misses). Pooling is correct.
    const report = compute(
      [
        ad({ id: 'a1', name: 'XMPC_Santiago_v1', date: '2026-08-12', spend: 1_000, revenue: 2_000 }),
        ad({ id: 'b1', name: 'XMPC_Santiago_v2', date: '2026-08-12', spend: 9_000, revenue: 9_000 }),
      ],
      mpc,
    );

    const santiago = report.editors[0]!;
    expect(santiago.thirtyPipesRoas).toBeCloseTo(1.1, 5);
    expect(santiago.beatsTarget).toBe(false);
    expect(report.metaAccountIds).toEqual(['514584538156509', '2620458594817497']);
  });

  it('exposes the primary account id for Ads Manager links', () => {
    const report = compute([], mpc);
    expect(report.primaryMetaAccountId).toBe('514584538156509');
  });
});

describe('verdicts use the pooled 30-day figure, not the week', () => {
  it('judges on 30 days even when the week looks different', () => {
    const report = compute([
      // Weak earlier in the 30-day window, strong this week. Pooled 30d is
      // 11000/10000 = 1.1x, which misses the 1.3x target despite a good week.
      ad({ id: 'x', name: 'SF_Ilias_v1', date: '2026-07-25', spend: 9_000, revenue: 9_000 }),
      ad({ id: 'x', name: 'SF_Ilias_v1', date: '2026-08-12', spend: 1_000, revenue: 2_000 }),
    ]);
    const ilias = report.editors.find((e) => e.token === 'Ilias')!;
    expect(ilias.thirtyPipesRoas).toBeCloseTo(1.1, 5);
    expect(ilias.beatsTarget).toBe(false);
  });

  it('treats meeting the target exactly as beating it', () => {
    const report = compute([
      ad({ id: 'x', name: 'SF_Ilias_v1', date: '2026-08-12', spend: 1_000, revenue: 1_300 }),
    ]);
    expect(report.editors[0]!.beatsTarget).toBe(true);
  });
});

describe('sparkline trend', () => {
  it('produces one pooled ROAS point per weekly bucket, oldest first', () => {
    const report = compute([
      // Buckets end on the report date (16 Aug), so they run:
      // [6-12 Jul] [13-19 Jul] [20-26 Jul] [27 Jul-2 Aug] [3-9 Aug] [10-16 Aug]
      ad({ id: 'x', name: 'SF_Suzaine_v1', date: '2026-07-20', spend: 1_000, revenue: 1_000 }),
      ad({ id: 'x', name: 'SF_Suzaine_v1', date: '2026-08-12', spend: 1_000, revenue: 2_000 }),
    ]);
    const trend = report.editors[0]!.trend;
    expect(trend).toHaveLength(6);
    expect(trend[2]).toBeCloseTo(1.0, 5); // 20-26 Jul bucket
    expect(trend[5]).toBeCloseTo(2.0, 5); // 10-16 Aug bucket
  });

  it('pools within each bucket rather than averaging daily ratios', () => {
    const report = compute([
      // Same week: $100 at 3.0x and $900 at 1.0x. Pooled = 1200/1000 = 1.2x.
      ad({ id: 'x', name: 'SF_Suzaine_v1', date: '2026-08-11', spend: 100, revenue: 300 }),
      ad({ id: 'y', name: 'SF_Suzaine_v2', date: '2026-08-12', spend: 900, revenue: 900 }),
    ]);
    expect(report.editors[0]!.trend[5]).toBeCloseTo(1.2, 5);
  });

  it('reports zero for a bucket with no spend rather than NaN', () => {
    const report = compute([
      ad({ id: 'x', name: 'SF_Suzaine_v1', date: '2026-08-12', spend: 1_000, revenue: 2_000 }),
    ]);
    const trend = report.editors[0]!.trend;
    expect(trend.every((v) => Number.isFinite(v))).toBe(true);
    expect(trend[0]).toBe(0);
  });
});
