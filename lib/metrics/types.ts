/**
 * Shared types for the Editor Performance Report.
 *
 * Imported by BOTH the daily pipeline and the UI. This module is pure data
 * shapes — it imports nothing from Next, Postgres, or the API clients.
 *
 * Money is carried as integer CENTS everywhere. Ratios (ROAS) are computed
 * from summed cents at the point of use and never stored pre-rounded, because
 * spec section 3 requires every ROAS to be SUM(revenue) / SUM(spend) over the
 * ads in scope — never an average of per-ad ROAS values.
 */

/** A calendar date range in an ad account's own reporting timezone. */
export interface DateRange {
  /** Inclusive start, 'YYYY-MM-DD' in account-local time. */
  start: string;
  /** Inclusive end, 'YYYY-MM-DD' in account-local time. */
  end: string;
}

/** The two windows every number belongs to (spec section 2). */
export interface ReportWindows {
  /** Previous Monday to Sunday. */
  week: DateRange;
  /** The 30 days ending that same Sunday. `thirty.end === week.end`. */
  thirty: DateRange;
  /** The Sunday both windows end on. */
  reportDate: string;
}

// ---------------------------------------------------------------------------
// Configuration (spec section 1) — lives in Postgres, never hardcoded.
// ---------------------------------------------------------------------------

export interface AccountConfig {
  id: number;
  name: string;
  slug: string;
  /**
   * NULL means "to confirm" (spec section 1). There is deliberately no default
   * anywhere in the schema or the code: a borrowed target produces checkmarks
   * nobody agreed to. A null target must suppress verdicts AND winning-ad
   * counts all the way to the UI.
   */
  targetRoas: number | null;
  spendFloorCents: number;
  /** IANA zone, synced from Meta. Windows are derived in this zone, not server time. */
  timezone: string;
  pipesProject: string;
  displayOrder: number;
  /** One account may span several Meta ad accounts (X-ALL MPC spans two). */
  metaAccounts: MetaAccountRef[];
  unassignedAlertPct: number;
}

export interface MetaAccountRef {
  metaAccountId: string;
  /** The account whose id is used when building Ads Manager links. */
  isPrimary: boolean;
}

// ---------------------------------------------------------------------------
// Raw facts from each source, at ad level, per day.
// ---------------------------------------------------------------------------

export interface MetaAdFact {
  metaAccountId: string;
  metaAdId: string;
  /** Date in the ad account's reporting timezone. */
  dateLocal: string;
  adName: string;
  spendCents: number;
  /** Meta's own attributed purchase conversion value. */
  purchaseConversionValueCents: number;
}

export interface PipesAdFact {
  /** Present when Pipes attributes directly to a Meta ad id. */
  metaAdId: string | null;
  /** Fallback join key, only usable if it carries the ad name consistently. */
  utmContent: string | null;
  dateLocal: string;
  revenueCents: number;
  orders: number;
}

/**
 * One ad's facts for a window, after the Meta<->Pipes join.
 *
 * Produced by a LEFT join FROM Meta: an ad with Meta spend and no Pipes
 * revenue survives with pipesRevenueCents = 0. It still counts toward spend
 * and toward the pooled-ROAS denominator. Dropping it would understate spend
 * and inflate every ROAS on the page.
 */
export interface JoinedAd {
  metaAdId: string;
  adName: string;
  dateLocal: string;
  spendCents: number;
  purchaseConversionValueCents: number;
  pipesRevenueCents: number;
  orders: number;
}

/** An ad plus the attributes needed to judge it over the trailing 30 days. */
export interface AdWithDelivery extends JoinedAd {
  /**
   * First date the ad actually DELIVERED (spend > 0), not when it was created.
   * Drives the new-vs-holdover split. Null when unknown, in which case the ad
   * is treated as a holdover rather than guessed as new.
   */
  firstDeliveryDate: string | null;
}

// ---------------------------------------------------------------------------
// Attribution (spec section 8)
// ---------------------------------------------------------------------------

export type Attribution =
  | { kind: 'editor'; token: string }
  /**
   * `none` = no editor token in the ad name.
   * `ambiguous` = two or more tokens matched, so it counts for NEITHER editor
   * and lands on the unassigned line rather than being double-counted.
   */
  | { kind: 'unassigned'; reason: 'none' | 'ambiguous' };

// ---------------------------------------------------------------------------
// The Meta <-> Pipes join diagnostic (spec section 4)
// ---------------------------------------------------------------------------

export interface JoinDiagnostic {
  totalPipesRevenueCents: number;
  unjoinedRevenueCents: number;
  /** If this is not near zero, every ROAS shown is understated. */
  unjoinedPct: number;
  /** A few unmatched keys, to make debugging possible without a re-pull. */
  unjoinedSamples: string[];
}

// ---------------------------------------------------------------------------
// Computed report shapes — what the pipeline writes and the UI reads.
// ---------------------------------------------------------------------------

export interface WinningAd {
  metaAdId: string;
  adName: string;
  spendCents: number;
  /** Pooled over the trailing 30 days: revenue / spend for this one ad. */
  pipesRoas: number;
  /** First delivered inside the trailing 30 days. */
  isNew: boolean;
}

export interface EditorReport {
  token: string;

  /** Null when the editor had no spend in the week (spec: "no spend this week"). */
  week: {
    spendCents: number;
    orders: number;
    pipesRevenueCents: number;
    metaValueCents: number;
  } | null;

  thirty: {
    spendCents: number;
    pipesRevenueCents: number;
  };

  /**
   * Pooled 30-day Pipes ROAS: total Pipes revenue over total Meta spend.
   * Null when spend is zero (never Infinity or NaN).
   */
  thirtyPipesRoas: number | null;

  /**
   * true / false / null, where NULL means the account has no target set.
   * Null must render as NO dot at all — not a red one (spec section 1).
   */
  beatsTarget: boolean | null;

  /**
   * Null when the account has no target: show no winning-ad count at all.
   * `{ total: 0, new: 0 }` is meaningfully different — it means the target IS
   * set and nothing cleared it.
   */
  winning: { total: number; new: number; holdover: number } | null;

  /** Winning ads only, by spend desc, capped at 3, NEVER padded. */
  topAds: WinningAd[];

  /** 6 weekly pooled Pipes ROAS values, oldest first. May be shorter early on. */
  trend: number[];
}

export type AccountStatus = 'ok' | 'no_spend' | 'failed';

export interface AccountReport {
  accountId: number;
  name: string;
  slug: string;
  metaAccountIds: string[];
  primaryMetaAccountId: string;
  targetRoas: number | null;
  spendFloorCents: number;
  timezone: string;
  windows: ReportWindows;

  /**
   * 'no_spend' and 'failed' are deliberately distinct. A missing report must
   * always mean a broken pull, never a quiet zero (spec section 2).
   */
  status: AccountStatus;
  errorMessage: string | null;

  /** Null when there was no spend at all this week. */
  week: {
    spendCents: number;
    orders: number;
    pipesRevenueCents: number;
    metaValueCents: number;
    unassignedSpendCents: number;
    unassignedAdCount: number;
  } | null;

  /** Sorted by 30-day spend, descending (spec section 5). */
  editors: EditorReport[];

  unjoinedRevenuePct: number | null;
}

export interface ReportSnapshot {
  id: number;
  reportDate: string;
  status: 'running' | 'complete' | 'partial' | 'failed';
  pulledAt: string;
  accounts: AccountReport[];
}
