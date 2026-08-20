/**
 * The report logic, per account (spec section 5).
 *
 * Pure module: takes plain fact arrays, returns plain results. Imports nothing
 * from Next, Postgres, or the API clients — which is what makes every edge
 * case in section 5 unit-testable without a database.
 *
 * Scope is deliberately ONE account. Spec section 5: "Never rank or pool
 * editors across accounts. Targets and margins differ, so a blended figure
 * means nothing." Keeping the function per-account makes that mistake
 * structurally impossible rather than a rule someone has to remember.
 */

import { attributeEditor } from './attribution';
import type {
  AccountConfig,
  AccountReport,
  AdWithDelivery,
  EditorReport,
  ReportWindows,
  WinningAd,
} from './types';
import { isWithin, weeklyBuckets } from './windows';

/** Max top creatives listed per editor. Never padded to reach this (section 8). */
const TOP_ADS_LIMIT = 3;

/**
 * Pooled ROAS: SUM(revenue) / SUM(spend).
 *
 * Spec section 3: "Any ROAS shown is SUM(revenue) / SUM(spend) over the ads in
 * scope, never an average of per-ad ROAS values."
 *
 * Returns null when spend is zero — never Infinity or NaN, which would leak
 * into the UI as "Infinityx".
 */
export function pooledRoas(revenueCents: number, spendCents: number): number | null {
  if (spendCents <= 0) return null;
  return revenueCents / spendCents;
}

interface Totals {
  spendCents: number;
  metaValueCents: number;
  pipesRevenueCents: number;
  orders: number;
}

function emptyTotals(): Totals {
  return { spendCents: 0, metaValueCents: 0, pipesRevenueCents: 0, orders: 0 };
}

function accumulate(into: Totals, ad: AdWithDelivery): void {
  into.spendCents += ad.spendCents;
  into.metaValueCents += ad.purchaseConversionValueCents;
  into.pipesRevenueCents += ad.pipesRevenueCents;
  into.orders += ad.orders;
}

/** Sum an ad's daily rows within a window into one per-ad total. */
interface AdRollup {
  metaAdId: string;
  adName: string;
  firstDeliveryDate: string | null;
  totals: Totals;
}

function rollupByAd(ads: AdWithDelivery[], range: { start: string; end: string }): Map<string, AdRollup> {
  const byAd = new Map<string, AdRollup>();
  for (const ad of ads) {
    if (!isWithin(ad.dateLocal, range)) continue;
    let entry = byAd.get(ad.metaAdId);
    if (!entry) {
      entry = {
        metaAdId: ad.metaAdId,
        adName: ad.adName,
        firstDeliveryDate: ad.firstDeliveryDate,
        totals: emptyTotals(),
      };
      byAd.set(ad.metaAdId, entry);
    }
    // Keep the earliest known delivery date across the ad's daily rows.
    if (ad.firstDeliveryDate) {
      if (!entry.firstDeliveryDate || ad.firstDeliveryDate < entry.firstDeliveryDate) {
        entry.firstDeliveryDate = ad.firstDeliveryDate;
      }
    }
    accumulate(entry.totals, ad);
  }
  return byAd;
}

/**
 * Decide which of an editor's ads are "winning" over the trailing 30 days.
 *
 * Spec section 5: "A winning ad clears both the spend floor and the ROAS target
 * over the trailing 30 days, whatever its launch date. An ad from March still
 * performing counts."
 *
 * Returns null when the account has no target — show no winning-ad count at
 * all (section 1). That is different from an empty result, which means the
 * target IS set and nothing cleared it.
 *
 * The "$600/week accumulates past $1,000 and appears in its second week"
 * behaviour (section 5) needs no special casing: because the floor is measured
 * against freshly re-summed 30-day spend every run, the ad simply crosses the
 * threshold on the week it crosses it.
 */
export function determineWinningAds(
  rollups: AdRollup[],
  targetRoas: number | null,
  spendFloorCents: number,
  thirty: { start: string; end: string },
): { winners: WinningAd[]; newCount: number; holdoverCount: number } | null {
  if (targetRoas === null) return null;

  const winners: WinningAd[] = [];
  for (const entry of rollups) {
    const { spendCents, pipesRevenueCents } = entry.totals;
    if (spendCents < spendFloorCents) continue;

    const roas = pooledRoas(pipesRevenueCents, spendCents);
    if (roas === null || roas < targetRoas) continue;

    // Unknown delivery date is treated as a holdover rather than guessed as
    // new: claiming an ad is new when we don't know is the worse error, since
    // it overstates an editor's current output.
    const isNew = entry.firstDeliveryDate !== null && isWithin(entry.firstDeliveryDate, thirty);

    winners.push({
      metaAdId: entry.metaAdId,
      adName: entry.adName,
      spendCents,
      pipesRoas: roas,
      isNew,
    });
  }

  winners.sort((a, b) => b.spendCents - a.spendCents);

  return {
    winners,
    newCount: winners.filter((w) => w.isNew).length,
    holdoverCount: winners.filter((w) => !w.isNew).length,
  };
}

/**
 * 6 weekly pooled Pipes ROAS values for the sparkline, oldest first.
 *
 * Spans 42 days, reaching further back than the 30-day verdict window, so
 * `ads` must cover that span (see `trendRange`). Weeks with no spend come
 * through as 0 rather than NaN.
 */
export function buildTrend(ads: AdWithDelivery[], reportDate: string): number[] {
  const trend: number[] = [];
  for (const bucket of weeklyBuckets(reportDate)) {
    let spend = 0;
    let revenue = 0;
    for (const ad of ads) {
      if (!isWithin(ad.dateLocal, bucket)) continue;
      spend += ad.spendCents;
      revenue += ad.pipesRevenueCents;
    }
    const roas = pooledRoas(revenue, spend);
    trend.push(roas ?? 0);
  }
  return trend;
}

export interface ComputeInput {
  account: AccountConfig;
  windows: ReportWindows;
  /** Ad-level daily facts spanning at least the trailing-30 window. */
  ads: AdWithDelivery[];
  editorTokens: string[];
  unjoinedRevenuePct: number | null;
}

/**
 * Compute one account's full report.
 *
 * For X-ALL MPC, `ads` must already contain the rows from BOTH Meta ad
 * accounts. Spec section 1: "sum the raw numbers across both before
 * calculating any ratio" — which happens naturally here, because every ratio
 * in this module is computed from summed cents at the end.
 */
export function computeAccountReport(input: ComputeInput): AccountReport {
  const { account, windows, ads, editorTokens, unjoinedRevenuePct } = input;
  const { week, thirty } = windows;
  const target = account.targetRoas;

  // --- Attribute every ad once, then bucket by editor. ---------------------
  const adsByEditor = new Map<string, AdWithDelivery[]>();
  const unassignedAds: AdWithDelivery[] = [];

  // Attribution depends only on the ad NAME, so cache it per name rather than
  // re-running five regexes for every daily row of every ad.
  const attributionCache = new Map<string, ReturnType<typeof attributeEditor>>();

  for (const ad of ads) {
    let attribution = attributionCache.get(ad.adName);
    if (!attribution) {
      attribution = attributeEditor(ad.adName, editorTokens);
      attributionCache.set(ad.adName, attribution);
    }

    if (attribution.kind === 'editor') {
      const bucket = adsByEditor.get(attribution.token);
      if (bucket) bucket.push(ad);
      else adsByEditor.set(attribution.token, [ad]);
    } else {
      // Both 'none' and 'ambiguous' land here. Section 8: an ad matching two
      // tokens counts for NEITHER editor.
      unassignedAds.push(ad);
    }
  }

  // --- Account-level week totals ------------------------------------------
  const accountWeek = emptyTotals();
  for (const ad of ads) {
    if (isWithin(ad.dateLocal, week)) accumulate(accountWeek, ad);
  }

  let unassignedSpendCents = 0;
  const unassignedAdIds = new Set<string>();
  for (const ad of unassignedAds) {
    if (!isWithin(ad.dateLocal, week)) continue;
    unassignedSpendCents += ad.spendCents;
    unassignedAdIds.add(ad.metaAdId);
  }

  // --- Per-editor reports --------------------------------------------------
  const editors: EditorReport[] = [];

  for (const token of editorTokens) {
    const editorAds = adsByEditor.get(token) ?? [];

    const weekTotals = emptyTotals();
    const thirtyTotals = emptyTotals();
    for (const ad of editorAds) {
      if (isWithin(ad.dateLocal, week)) accumulate(weekTotals, ad);
      if (isWithin(ad.dateLocal, thirty)) accumulate(thirtyTotals, ad);
    }

    // An editor with no activity at all in either window is not listed.
    if (thirtyTotals.spendCents === 0 && weekTotals.spendCents === 0) continue;

    const rollups = [...rollupByAd(editorAds, thirty).values()];
    const winning = determineWinningAds(rollups, target, account.spendFloorCents, thirty);

    const thirtyPipesRoas = pooledRoas(thirtyTotals.pipesRevenueCents, thirtyTotals.spendCents);

    editors.push({
      token,
      week:
        weekTotals.spendCents > 0
          ? {
              spendCents: weekTotals.spendCents,
              orders: weekTotals.orders,
              pipesRevenueCents: weekTotals.pipesRevenueCents,
              metaValueCents: weekTotals.metaValueCents,
            }
          : null,
      thirty: {
        spendCents: thirtyTotals.spendCents,
        pipesRevenueCents: thirtyTotals.pipesRevenueCents,
      },
      thirtyPipesRoas,
      // Null target => null verdict => the UI renders NO dot (section 1).
      beatsTarget: target === null || thirtyPipesRoas === null ? null : thirtyPipesRoas >= target,
      winning: winning
        ? { total: winning.winners.length, new: winning.newCount, holdover: winning.holdoverCount }
        : null,
      // Capped at 3, never padded with ads that missed target (section 8).
      topAds: winning ? winning.winners.slice(0, TOP_ADS_LIMIT) : [],
      trend: buildTrend(editorAds, windows.reportDate),
    });
  }

  // Sort by 30-day spend descending (section 5).
  editors.sort((a, b) => b.thirty.spendCents - a.thirty.spendCents);

  const primary = account.metaAccounts.find((m) => m.isPrimary) ?? account.metaAccounts[0];
  if (!primary) {
    throw new Error(`Account ${account.slug} has no Meta ad account configured`);
  }

  // A no-spend account still produces a report saying so, so that a MISSING
  // report always means a broken pull (section 2).
  const hasWeekSpend = accountWeek.spendCents > 0;
  const hasAnySpend = hasWeekSpend || editors.some((e) => e.thirty.spendCents > 0);

  return {
    accountId: account.id,
    name: account.name,
    slug: account.slug,
    metaAccountIds: account.metaAccounts.map((m) => m.metaAccountId),
    primaryMetaAccountId: primary.metaAccountId,
    targetRoas: target,
    spendFloorCents: account.spendFloorCents,
    timezone: account.timezone,
    windows,
    status: hasAnySpend ? 'ok' : 'no_spend',
    errorMessage: null,
    week: hasWeekSpend
      ? {
          spendCents: accountWeek.spendCents,
          orders: accountWeek.orders,
          pipesRevenueCents: accountWeek.pipesRevenueCents,
          metaValueCents: accountWeek.metaValueCents,
          unassignedSpendCents,
          unassignedAdCount: unassignedAdIds.size,
        }
      : null,
    editors,
    unjoinedRevenuePct,
  };
}
