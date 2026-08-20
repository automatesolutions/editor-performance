/**
 * Source client interfaces.
 *
 * The pipeline depends on these, never on a concrete implementation, so the
 * whole app runs on fixtures until the Phase 0 access spikes complete and the
 * live clients can be swapped in without touching the pipeline.
 */

import type { DateRange, MetaAdFact, PipesAdFact } from '../metrics/types';

export interface MetaClient {
  /**
   * Ad-level daily insights for one Meta ad account over a window.
   *
   * `range` dates are account-local; Meta interprets time_range in the ad
   * account's own timezone, so they pass straight through.
   */
  fetchAdInsights(metaAccountId: string, range: DateRange): Promise<MetaAdFact[]>;

  /**
   * First date each ad actually DELIVERED (spend > 0), keyed by ad id.
   * Not "created" — the new-vs-holdover split depends on delivery.
   */
  fetchFirstDeliveryDates(
    metaAccountId: string,
    adIds: string[],
  ): Promise<Map<string, string>>;

  /** The ad account's IANA reporting timezone, for window derivation. */
  fetchAccountTimezone(metaAccountId: string): Promise<string>;
}

export interface PipesClient {
  /**
   * Revenue and orders at ad level for one Pipes project over a window.
   *
   * `metaAccountIds` scopes the pull to the reporting account being processed.
   * All ten accounts share a single Pipes project string, so the project alone
   * does not identify them — without this scope, every other account's revenue
   * would look like revenue that failed to join, and the section 4 diagnostic
   * (the check that tells us whether ROAS is trustworthy at all) would read
   * ~90% on a perfectly healthy pull.
   */
  fetchAdRevenue(
    pipesProject: string,
    metaAccountIds: string[],
    range: DateRange,
  ): Promise<PipesAdFact[]>;
}
