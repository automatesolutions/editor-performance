import { describe, expect, it } from 'vitest';
import { joinMetaPipes } from '../../lib/metrics/join';
import type { MetaAdFact, PipesAdFact } from '../../lib/metrics/types';

function meta(o: Partial<MetaAdFact> & { metaAdId: string; spendCents: number }): MetaAdFact {
  return {
    metaAccountId: '258610945617994',
    dateLocal: '2026-08-12',
    adName: 'SF_Suzaine_v1',
    purchaseConversionValueCents: 0,
    ...o,
  };
}

function pipes(o: Partial<PipesAdFact> & { revenueCents: number }): PipesAdFact {
  return {
    metaAdId: null,
    utmContent: null,
    dateLocal: '2026-08-12',
    orders: 1,
    ...o,
  };
}

describe('joinMetaPipes', () => {
  it('joins on the Meta ad id (spec section 4)', () => {
    const { joined, diagnostic } = joinMetaPipes(
      [meta({ metaAdId: 'a1', spendCents: 100_000 })],
      [pipes({ metaAdId: 'a1', revenueCents: 200_000, orders: 12 })],
    );

    expect(joined).toHaveLength(1);
    expect(joined[0]!.pipesRevenueCents).toBe(200_000);
    expect(joined[0]!.orders).toBe(12);
    expect(diagnostic.unjoinedPct).toBe(0);
  });

  it('keeps a Meta ad with no Pipes revenue in the denominator', () => {
    // The join direction is load-bearing. An inner join would drop this ad,
    // understating spend and INFLATING every ROAS on the page — a failure
    // that looks like good news.
    const { joined } = joinMetaPipes(
      [
        meta({ metaAdId: 'a1', spendCents: 100_000 }),
        meta({ metaAdId: 'a2', spendCents: 900_000 }),
      ],
      [pipes({ metaAdId: 'a1', revenueCents: 200_000 })],
    );

    expect(joined).toHaveLength(2);
    const totalSpend = joined.reduce((s, a) => s + a.spendCents, 0);
    const totalRevenue = joined.reduce((s, a) => s + a.pipesRevenueCents, 0);
    expect(totalSpend).toBe(1_000_000);
    // 0.2x pooled, not the 2.0x an inner join would have produced.
    expect(totalRevenue / totalSpend).toBeCloseTo(0.2, 5);
  });

  it('sums multiple Pipes rows for the same ad and day', () => {
    const { joined } = joinMetaPipes(
      [meta({ metaAdId: 'a1', spendCents: 100_000 })],
      [
        pipes({ metaAdId: 'a1', revenueCents: 50_000, orders: 2 }),
        pipes({ metaAdId: 'a1', revenueCents: 30_000, orders: 1 }),
      ],
    );
    expect(joined[0]!.pipesRevenueCents).toBe(80_000);
    expect(joined[0]!.orders).toBe(3);
  });

  it('does not bleed revenue across days for the same ad', () => {
    const { joined } = joinMetaPipes(
      [
        meta({ metaAdId: 'a1', dateLocal: '2026-08-11', spendCents: 50_000 }),
        meta({ metaAdId: 'a1', dateLocal: '2026-08-12', spendCents: 50_000 }),
      ],
      [pipes({ metaAdId: 'a1', dateLocal: '2026-08-12', revenueCents: 90_000 })],
    );
    expect(joined.find((a) => a.dateLocal === '2026-08-11')!.pipesRevenueCents).toBe(0);
    expect(joined.find((a) => a.dateLocal === '2026-08-12')!.pipesRevenueCents).toBe(90_000);
  });

  describe('the unjoined-revenue diagnostic (spec section 4)', () => {
    // "Report the share of Pipes revenue that failed to join: if it is not
    //  near zero, every ROAS shown is understated."
    it('reports the share that failed to join', () => {
      const { diagnostic } = joinMetaPipes(
        [meta({ metaAdId: 'a1', spendCents: 100_000 })],
        [
          pipes({ metaAdId: 'a1', revenueCents: 75_000 }),
          pipes({ metaAdId: 'ghost', revenueCents: 25_000 }),
        ],
      );
      expect(diagnostic.totalPipesRevenueCents).toBe(100_000);
      expect(diagnostic.unjoinedRevenueCents).toBe(25_000);
      expect(diagnostic.unjoinedPct).toBeCloseTo(25, 5);
      expect(diagnostic.unjoinedSamples).toContain('ghost');
    });

    it('never merges unjoined revenue into an editor total', () => {
      const { joined } = joinMetaPipes(
        [meta({ metaAdId: 'a1', spendCents: 100_000 })],
        [pipes({ metaAdId: 'ghost', revenueCents: 500_000 })],
      );
      expect(joined[0]!.pipesRevenueCents).toBe(0);
    });

    it('reports 0% when there is no Pipes revenue at all', () => {
      const { diagnostic } = joinMetaPipes([meta({ metaAdId: 'a1', spendCents: 100_000 })], []);
      expect(diagnostic.unjoinedPct).toBe(0);
    });
  });

  describe('UTM content fallback', () => {
    it('is off by default, so unproven UTM data cannot silently mis-attribute', () => {
      const { joined, diagnostic } = joinMetaPipes(
        [meta({ metaAdId: 'a1', adName: 'SF_Suzaine_v1', spendCents: 100_000 })],
        [pipes({ utmContent: 'SF_Suzaine_v1', revenueCents: 200_000 })],
      );
      expect(joined[0]!.pipesRevenueCents).toBe(0);
      expect(diagnostic.unjoinedPct).toBeCloseTo(100, 5);
    });

    it('matches on the normalized ad name when explicitly enabled', () => {
      const { joined, diagnostic } = joinMetaPipes(
        [meta({ metaAdId: 'a1', adName: 'SF_Suzaine_v1', spendCents: 100_000 })],
        [pipes({ utmContent: '  sf_suzaine_v1 ', revenueCents: 200_000 })],
        true,
      );
      expect(joined[0]!.pipesRevenueCents).toBe(200_000);
      expect(diagnostic.unjoinedPct).toBe(0);
    });

    it('prefers the ad id when both keys are available', () => {
      const { joined } = joinMetaPipes(
        [meta({ metaAdId: 'a1', adName: 'SF_Suzaine_v1', spendCents: 100_000 })],
        [
          pipes({ metaAdId: 'a1', revenueCents: 200_000 }),
          pipes({ utmContent: 'SF_Suzaine_v1', revenueCents: 999_000 }),
        ],
        true,
      );
      // The ad-id match wins; the UTM row is not double-counted onto it.
      expect(joined[0]!.pipesRevenueCents).toBe(200_000);
    });
  });
});
