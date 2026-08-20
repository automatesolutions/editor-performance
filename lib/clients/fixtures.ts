/**
 * Fixture source clients.
 *
 * Generate deterministic, spec-shaped ad-level data so the whole pipeline and
 * UI can run end to end before the Meta and Pipes credentials exist. The
 * numbers are invented; the SHAPES are real — ad-level daily rows carrying the
 * editor token in the ad name, which is what the pipeline actually exercises.
 *
 * Deliberately included in the generated data, so the UI is exercised against
 * the cases that matter rather than only the happy path:
 *   - unassigned ads (no token) and a two-token ad that counts for neither
 *   - an editor with 30-day spend but none in the current week
 *   - a long-running holdover winner alongside newly delivered ads
 *   - an account with no spend at all
 */

import type { DateRange, MetaAdFact, PipesAdFact } from '../metrics/types';
import { addDays, daysBetween } from '../metrics/windows';
import type { MetaClient, PipesClient } from './types';

/** Deterministic PRNG so fixture data is stable across runs. */
function makeRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

interface FixtureAd {
  adId: string;
  adName: string;
  /** Rough daily spend in dollars. */
  dailySpend: number;
  /** Pipes revenue multiple applied to spend. */
  roas: number;
  /** Meta reports a higher attributed value than Pipes, as in the mockup. */
  metaRoasBonus: number;
  /** Days before the window end that this ad first delivered. */
  firstDeliveryDaysAgo: number;
  /** Stop delivering this many days before the window end (0 = still running). */
  endedDaysAgo: number;
}

/** Per-account creative rosters, keyed by Meta ad account id. */
const ROSTERS: Record<string, FixtureAd[]> = {
  // Splash Foam — the account the spec walks through in section 7.
  '258610945617994': [
    { adId: 'sf-1', adName: 'SF_Santiago_FoamDemo_UGC_v4', dailySpend: 305, roas: 2.28, metaRoasBonus: 0.5, firstDeliveryDaysAgo: 90, endedDaysAgo: 0 },
    { adId: 'sf-2', adName: 'SF_Santiago_BeforeAfter_Static_v2', dailySpend: 224, roas: 1.86, metaRoasBonus: 0.5, firstDeliveryDaysAgo: 75, endedDaysAgo: 0 },
    { adId: 'sf-3', adName: 'SF_Santiago_SinkClog_Hook3', dailySpend: 147, roas: 1.54, metaRoasBonus: 0.6, firstDeliveryDaysAgo: 12, endedDaysAgo: 0 },
    { adId: 'sf-4', adName: 'SF_Suzaine_ScrubTest_v3', dailySpend: 263, roas: 1.95, metaRoasBonus: 0.5, firstDeliveryDaysAgo: 120, endedDaysAgo: 0 },
    { adId: 'sf-5', adName: 'SF_Suzaine_MorningRoutine_UGC', dailySpend: 175, roas: 1.72, metaRoasBonus: 0.5, firstDeliveryDaysAgo: 60, endedDaysAgo: 0 },
    { adId: 'sf-6', adName: 'SF_Suzaine_SplitScreen_v2', dailySpend: 70, roas: 1.44, metaRoasBonus: 0.6, firstDeliveryDaysAgo: 45, endedDaysAgo: 0 },
    { adId: 'sf-7', adName: 'SF_CB_KitchenGrease_v6', dailySpend: 133, roas: 1.41, metaRoasBonus: 0.7, firstDeliveryDaysAgo: 20, endedDaysAgo: 0 },
    { adId: 'sf-8', adName: 'SF_CB_DrainFoam_v2', dailySpend: 404, roas: 1.15, metaRoasBonus: 0.7, firstDeliveryDaysAgo: 80, endedDaysAgo: 0 },
    { adId: 'sf-9', adName: 'SF_Ilias_PipeClear_v1', dailySpend: 287, roas: 1.01, metaRoasBonus: 0.6, firstDeliveryDaysAgo: 50, endedDaysAgo: 0 },
    // Klemen: 30-day spend but nothing this week -> "no spend this week".
    { adId: 'sf-10', adName: 'SF_Klemen_TileScrub_v1', dailySpend: 210, roas: 1.12, metaRoasBonus: 0.6, firstDeliveryDaysAgo: 28, endedDaysAgo: 9 },
    // Unassigned: no editor token at all.
    { adId: 'sf-11', adName: 'SF_BrandAwareness_Generic_v3', dailySpend: 208, roas: 1.2, metaRoasBonus: 0.6, firstDeliveryDaysAgo: 40, endedDaysAgo: 0 },
    // Unassigned: two tokens, so it counts for NEITHER editor (section 8).
    { adId: 'sf-12', adName: 'SF_Santiago_CB_Collab_v1', dailySpend: 136, roas: 1.3, metaRoasBonus: 0.6, firstDeliveryDaysAgo: 15, endedDaysAgo: 0 },
  ],

  // Splash Spotless — target "to confirm": no verdicts, no winning counts.
  '271012631870595': [
    { adId: 'ss-1', adName: 'SS_Suzaine_BubbleWipe_v2', dailySpend: 207, roas: 1.5, metaRoasBonus: 0.6, firstDeliveryDaysAgo: 70, endedDaysAgo: 0 },
    { adId: 'ss-2', adName: 'SS_Suzaine_QuickClean_Hook', dailySpend: 103, roas: 1.38, metaRoasBonus: 0.6, firstDeliveryDaysAgo: 18, endedDaysAgo: 0 },
    { adId: 'ss-3', adName: 'SS_CB_StreakFree_v4', dailySpend: 407, roas: 1.15, metaRoasBonus: 0.55, firstDeliveryDaysAgo: 65, endedDaysAgo: 0 },
    { adId: 'ss-4', adName: 'SS_Klemen_GlassShine_v2', dailySpend: 300, roas: 0.88, metaRoasBonus: 0.6, firstDeliveryDaysAgo: 55, endedDaysAgo: 0 },
    { adId: 'ss-5', adName: 'SS_Seasonal_Promo_Generic', dailySpend: 115, roas: 1.1, metaRoasBonus: 0.6, firstDeliveryDaysAgo: 30, endedDaysAgo: 0 },
  ],

  // Denta Blast — no spend at all this period (spec section 2).
  '3484659138445892': [],

  '1472869896844785': [
    { adId: 'spr-1', adName: 'SPR_Santiago_NozzleClose_v1', dailySpend: 270, roas: 1.6, metaRoasBonus: 0.55, firstDeliveryDaysAgo: 85, endedDaysAgo: 0 },
    { adId: 'spr-2', adName: 'SPR_Santiago_YardFail_UGC', dailySpend: 197, roas: 1.4, metaRoasBonus: 0.6, firstDeliveryDaysAgo: 14, endedDaysAgo: 0 },
    { adId: 'spr-3', adName: 'SPR_Suzaine_HowTo_Static', dailySpend: 233, roas: 1.42, metaRoasBonus: 0.55, firstDeliveryDaysAgo: 95, endedDaysAgo: 0 },
    { adId: 'spr-4', adName: 'SPR_Suzaine_Testimonial_v2', dailySpend: 140, roas: 1.3, metaRoasBonus: 0.6, firstDeliveryDaysAgo: 40, endedDaysAgo: 0 },
    { adId: 'spr-5', adName: 'SPR_CB_PatioSpray_v3', dailySpend: 97, roas: 1.35, metaRoasBonus: 0.6, firstDeliveryDaysAgo: 10, endedDaysAgo: 0 },
    { adId: 'spr-6', adName: 'SPR_CB_HoseAttach_v1', dailySpend: 370, roas: 1.12, metaRoasBonus: 0.6, firstDeliveryDaysAgo: 60, endedDaysAgo: 0 },
    { adId: 'spr-7', adName: 'SPR_Retargeting_Generic_v2', dailySpend: 30, roas: 1.25, metaRoasBonus: 0.6, firstDeliveryDaysAgo: 35, endedDaysAgo: 0 },
  ],

  '810292903775985': [
    { adId: 'bnm-1', adName: 'BNM_Suzaine_BarkStop_UGC', dailySpend: 307, roas: 1.7, metaRoasBonus: 0.5, firstDeliveryDaysAgo: 100, endedDaysAgo: 0 },
    { adId: 'bnm-2', adName: 'BNM_Suzaine_NightSilence_v2', dailySpend: 203, roas: 1.55, metaRoasBonus: 0.5, firstDeliveryDaysAgo: 16, endedDaysAgo: 0 },
    { adId: 'bnm-3', adName: 'BNM_Ilias_QuietWalk_Static', dailySpend: 143, roas: 1.46, metaRoasBonus: 0.55, firstDeliveryDaysAgo: 70, endedDaysAgo: 0 },
    { adId: 'bnm-4', adName: 'BNM_Ilias_TrainingClicker_v3', dailySpend: 557, roas: 1.32, metaRoasBonus: 0.55, firstDeliveryDaysAgo: 45, endedDaysAgo: 0 },
    { adId: 'bnm-5', adName: 'BNM_CB_NeighborTest_v1', dailySpend: 300, roas: 0.95, metaRoasBonus: 0.55, firstDeliveryDaysAgo: 50, endedDaysAgo: 0 },
    // Heavy unassigned spend: pushes this account over the 20% alert threshold.
    { adId: 'bnm-6', adName: 'BNM_Prospecting_Broad_v7', dailySpend: 123, roas: 1.1, metaRoasBonus: 0.6, firstDeliveryDaysAgo: 38, endedDaysAgo: 0 },
    { adId: 'bnm-7', adName: 'BNM_Catalog_DPA_Evergreen', dailySpend: 190, roas: 1.4, metaRoasBonus: 0.6, firstDeliveryDaysAgo: 110, endedDaysAgo: 0 },
  ],

  '852183256500077': [
    { adId: 'xai-1', adName: 'XAI_Klemen_AirQuality_v2', dailySpend: 157, roas: 1.15, metaRoasBonus: 0.55, firstDeliveryDaysAgo: 60, endedDaysAgo: 0 },
    { adId: 'xai-2', adName: 'XAI_CB_SmokeTest_v1', dailySpend: 114, roas: 0.92, metaRoasBonus: 0.55, firstDeliveryDaysAgo: 42, endedDaysAgo: 0 },
    { adId: 'xai-3', adName: 'XAI_Ilias_PollenSeason_v3', dailySpend: 100, roas: 0.88, metaRoasBonus: 0.55, firstDeliveryDaysAgo: 25, endedDaysAgo: 0 },
    { adId: 'xai-4', adName: 'XAI_Generic_Awareness_v1', dailySpend: 96, roas: 1.0, metaRoasBonus: 0.55, firstDeliveryDaysAgo: 33, endedDaysAgo: 0 },
  ],

  '1078631533275563': [
    { adId: 'pb-1', adName: 'PB_Santiago_LeakProof_v4', dailySpend: 293, roas: 1.68, metaRoasBonus: 0.55, firstDeliveryDaysAgo: 88, endedDaysAgo: 0 },
    { adId: 'pb-2', adName: 'PB_Santiago_NightGuard_UGC', dailySpend: 203, roas: 1.52, metaRoasBonus: 0.55, firstDeliveryDaysAgo: 17, endedDaysAgo: 0 },
    { adId: 'pb-3', adName: 'PB_Suzaine_TrainingPad_Static', dailySpend: 173, roas: 1.55, metaRoasBonus: 0.55, firstDeliveryDaysAgo: 65, endedDaysAgo: 0 },
    { adId: 'pb-4', adName: 'PB_Suzaine_PuppyProof_v2', dailySpend: 360, roas: 1.44, metaRoasBonus: 0.55, firstDeliveryDaysAgo: 48, endedDaysAgo: 0 },
    { adId: 'pb-5', adName: 'PB_Klemen_OdourGone_v1', dailySpend: 333, roas: 1.2, metaRoasBonus: 0.55, firstDeliveryDaysAgo: 55, endedDaysAgo: 0 },
    { adId: 'pb-6', adName: 'PB_Broad_Prospecting_v2', dailySpend: 27, roas: 1.3, metaRoasBonus: 0.55, firstDeliveryDaysAgo: 22, endedDaysAgo: 0 },
  ],

  '3747514945517577': [
    { adId: 'xtc-1', adName: 'XTC_CB_BowlShine_v2', dailySpend: 233, roas: 1.55, metaRoasBonus: 0.5, firstDeliveryDaysAgo: 78, endedDaysAgo: 0 },
    { adId: 'xtc-2', adName: 'XTC_CB_TabletDrop_UGC', dailySpend: 140, roas: 1.4, metaRoasBonus: 0.55, firstDeliveryDaysAgo: 19, endedDaysAgo: 0 },
    { adId: 'xtc-3', adName: 'XTC_Ilias_FreshScent_Static', dailySpend: 170, roas: 1.38, metaRoasBonus: 0.55, firstDeliveryDaysAgo: 62, endedDaysAgo: 0 },
    { adId: 'xtc-4', adName: 'XTC_Ilias_LimescaleWar_v2', dailySpend: 297, roas: 1.26, metaRoasBonus: 0.55, firstDeliveryDaysAgo: 44, endedDaysAgo: 0 },
    { adId: 'xtc-5', adName: 'XTC_Klemen_RimClean_v3', dailySpend: 233, roas: 1.05, metaRoasBonus: 0.55, firstDeliveryDaysAgo: 36, endedDaysAgo: 0 },
    { adId: 'xtc-6', adName: 'XTC_Generic_Bundle_v1', dailySpend: 43, roas: 1.2, metaRoasBonus: 0.55, firstDeliveryDaysAgo: 27, endedDaysAgo: 0 },
  ],

  '1946131762522115': [
    { adId: 'xwm-1', adName: 'XWM_Suzaine_DrumClean_v3', dailySpend: 210, roas: 1.5, metaRoasBonus: 0.5, firstDeliveryDaysAgo: 72, endedDaysAgo: 0 },
    { adId: 'xwm-2', adName: 'XWM_Suzaine_TabletFizz_UGC', dailySpend: 130, roas: 1.38, metaRoasBonus: 0.55, firstDeliveryDaysAgo: 13, endedDaysAgo: 0 },
    { adId: 'xwm-3', adName: 'XWM_Santiago_MouldGone_v2', dailySpend: 433, roas: 1.28, metaRoasBonus: 0.55, firstDeliveryDaysAgo: 58, endedDaysAgo: 0 },
    { adId: 'xwm-4', adName: 'XWM_Ilias_FilterCheck_v1', dailySpend: 167, roas: 0.9, metaRoasBonus: 0.55, firstDeliveryDaysAgo: 39, endedDaysAgo: 0 },
    { adId: 'xwm-5', adName: 'XWM_Generic_Seasonal_v2', dailySpend: 50, roas: 1.15, metaRoasBonus: 0.55, firstDeliveryDaysAgo: 24, endedDaysAgo: 0 },
  ],

  // X-ALL MPC, ad account 1 of 2.
  '514584538156509': [
    { adId: 'mpc-a1', adName: 'XMPC_Santiago_BundleDemo_v5', dailySpend: 373, roas: 1.6, metaRoasBonus: 0.5, firstDeliveryDaysAgo: 92, endedDaysAgo: 0 },
    { adId: 'mpc-a2', adName: 'XMPC_Santiago_HouseholdWin_UGC', dailySpend: 247, roas: 1.44, metaRoasBonus: 0.5, firstDeliveryDaysAgo: 15, endedDaysAgo: 0 },
    { adId: 'mpc-a3', adName: 'XMPC_Suzaine_StackedDeal_Static', dailySpend: 297, roas: 1.48, metaRoasBonus: 0.5, firstDeliveryDaysAgo: 68, endedDaysAgo: 0 },
    { adId: 'mpc-a4', adName: 'XMPC_Generic_Retarget_v1', dailySpend: 97, roas: 1.3, metaRoasBonus: 0.55, firstDeliveryDaysAgo: 31, endedDaysAgo: 0 },
  ],
  // X-ALL MPC, ad account 2 of 2. Same editors, different ad account: the
  // pipeline must sum raw cents across both BEFORE taking any ratio.
  '2620458594817497': [
    { adId: 'mpc-b1', adName: 'XMPC_Suzaine_KitReveal_v2', dailySpend: 173, roas: 1.36, metaRoasBonus: 0.5, firstDeliveryDaysAgo: 11, endedDaysAgo: 0 },
    { adId: 'mpc-b2', adName: 'XMPC_CB_ValuePack_v1', dailySpend: 203, roas: 1.3, metaRoasBonus: 0.5, firstDeliveryDaysAgo: 74, endedDaysAgo: 0 },
    { adId: 'mpc-b3', adName: 'XMPC_CB_MultiRoom_v3', dailySpend: 363, roas: 1.18, metaRoasBonus: 0.5, firstDeliveryDaysAgo: 52, endedDaysAgo: 0 },
    { adId: 'mpc-b4', adName: 'XMPC_Klemen_StarterSet_v2', dailySpend: 300, roas: 0.98, metaRoasBonus: 0.55, firstDeliveryDaysAgo: 47, endedDaysAgo: 0 },
    { adId: 'mpc-b5', adName: 'XMPC_Seasonal_Generic_v4', dailySpend: 97, roas: 1.25, metaRoasBonus: 0.55, firstDeliveryDaysAgo: 29, endedDaysAgo: 0 },
  ],
};

/** Every ad id -> the account it belongs to, for the Pipes side. */
const AD_TO_ACCOUNT = new Map<string, string>();
for (const [accountId, ads] of Object.entries(ROSTERS)) {
  for (const ad of ads) AD_TO_ACCOUNT.set(ad.adId, accountId);
}

interface GeneratedRow {
  ad: FixtureAd;
  date: string;
  spendCents: number;
  metaValueCents: number;
  pipesRevenueCents: number;
  orders: number;
}

/** Generate daily rows for one account's roster across a window. */
function generateRows(metaAccountId: string, range: DateRange): GeneratedRow[] {
  const roster = ROSTERS[metaAccountId] ?? [];
  const rows: GeneratedRow[] = [];
  const days = daysBetween(range.start, range.end);

  for (const ad of roster) {
    const rand = makeRandom(hashString(ad.adId));
    for (let i = 0; i <= days; i++) {
      const date = addDays(range.start, i);
      const daysAgo = days - i;

      if (daysAgo < ad.endedDaysAgo) continue;
      if (daysAgo > ad.firstDeliveryDaysAgo) continue;

      // +/-20% daily variation, so sparklines and weekly figures move.
      const jitter = 0.8 + rand() * 0.4;
      const spend = ad.dailySpend * jitter;
      const spendCents = Math.round(spend * 100);
      if (spendCents <= 0) continue;

      const revenueJitter = 0.85 + rand() * 0.3;
      const pipesRevenueCents = Math.round(spendCents * ad.roas * revenueJitter);
      const metaValueCents = Math.round(spendCents * (ad.roas + ad.metaRoasBonus) * revenueJitter);
      // Roughly $30 average order value.
      const orders = Math.max(1, Math.round(pipesRevenueCents / 100 / 30));

      rows.push({ ad, date, spendCents, metaValueCents, pipesRevenueCents, orders });
    }
  }

  return rows;
}

export class FixtureMetaClient implements MetaClient {
  async fetchAdInsights(metaAccountId: string, range: DateRange): Promise<MetaAdFact[]> {
    return generateRows(metaAccountId, range).map((r) => ({
      metaAccountId,
      metaAdId: r.ad.adId,
      dateLocal: r.date,
      adName: r.ad.adName,
      spendCents: r.spendCents,
      purchaseConversionValueCents: r.metaValueCents,
    }));
  }

  async fetchFirstDeliveryDates(
    metaAccountId: string,
    adIds: string[],
  ): Promise<Map<string, string>> {
    // Fixtures anchor "days ago" to today, which is what the live client will
    // derive from accumulated delivery history.
    const today = new Date().toISOString().slice(0, 10);
    const roster = ROSTERS[metaAccountId] ?? [];
    const out = new Map<string, string>();
    for (const ad of roster) {
      if (!adIds.includes(ad.adId)) continue;
      out.set(ad.adId, addDays(today, -ad.firstDeliveryDaysAgo));
    }
    return out;
  }

  async fetchAccountTimezone(): Promise<string> {
    return 'America/Los_Angeles';
  }
}

export class FixturePipesClient implements PipesClient {
  /**
   * Pipes revenue keyed by Meta ad id.
   *
   * A slice of revenue is emitted under an unknown ad id so the unjoined
   * diagnostic has something real to report — the spec's section 4 health
   * check should be exercised, not always read zero.
   */
  async fetchAdRevenue(
    pipesProject: string,
    metaAccountIds: string[],
    range: DateRange,
  ): Promise<PipesAdFact[]> {
    const facts: PipesAdFact[] = [];

    for (const metaAccountId of metaAccountIds) {
      for (const r of generateRows(metaAccountId, range)) {
        facts.push({
          metaAdId: r.ad.adId,
          utmContent: r.ad.adName,
          dateLocal: r.date,
          revenueCents: r.pipesRevenueCents,
          orders: r.orders,
        });
      }
    }

    // ~1.5% of revenue that cannot be tied to any Meta ad.
    const total = facts.reduce((s, f) => s + f.revenueCents, 0);
    if (total > 0) {
      facts.push({
        metaAdId: 'unattributed-direct',
        utmContent: null,
        dateLocal: range.end,
        revenueCents: Math.round(total * 0.015),
        orders: 12,
      });
    }

    return facts;
  }
}
