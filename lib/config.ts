/**
 * Environment configuration, validated once at startup so a missing secret
 * fails loudly at boot rather than silently at 3am inside the cron.
 */

import { z } from 'zod';
import type { LinkTemplates } from './links';

const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Auth (v1 is a single shared password; see middleware.ts).
  APP_PASSWORD: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 chars').optional(),
  CRON_SECRET: z.string().min(16).optional(),

  // Source credentials. Absent until the Phase 0 access spikes complete, which
  // is why the app runs on fixtures by default.
  META_ACCESS_TOKEN: z.string().optional(),
  META_API_VERSION: z.string().default('v21.0'),
  /**
   * Which Meta action type carries purchase value. The two candidates differ
   * materially and the error is invisible once shipped, so it is configuration
   * rather than a buried constant. Settle it against real data in Phase 0.
   */
  META_PURCHASE_ACTION_TYPE: z.string().default('omni_purchase'),

  PIPES_API_BASE: z.string().optional(),
  PIPES_API_KEY: z.string().optional(),

  /**
   * Enable the UTM-content fallback ONLY once the Phase 0 spike has shown the
   * parameter carries the ad name consistently across all ten accounts.
   * Guessing here silently mis-attributes revenue between editors.
   */
  PIPES_ALLOW_UTM_FALLBACK: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  /**
   * Ads Manager URL templates, captured BY HAND from a working filtered view
   * (spec section 6). Not constructed in code: a URL that silently drops the
   * filter looks identical until clicked.
   */
  ADS_MANAGER_ACCOUNT_URL_TEMPLATE: z.string().optional(),
  ADS_MANAGER_EDITOR_URL_TEMPLATE: z.string().optional(),

  /** Serve fixture data instead of calling Meta/Pipes. Default while Phase 0 is open. */
  USE_FIXTURES: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

export type AppConfig = z.infer<typeof schema>;

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n  ${issues.join('\n  ')}`);
  }
  cached = parsed.data;
  return cached;
}

/**
 * Ads Manager link templates.
 *
 * Falls back to a clearly-marked placeholder when the real templates have not
 * been captured yet, so the dashboard renders during fixture development. The
 * placeholder deliberately omits a filter rather than faking one — see
 * docs/ads-manager-urls.md.
 */
export function getLinkTemplates(): LinkTemplates {
  const cfg = getConfig();
  return {
    account:
      cfg.ADS_MANAGER_ACCOUNT_URL_TEMPLATE ??
      'https://adsmanager.facebook.com/adsmanager/manage/ads?act={ACCOUNT_ID}&date={START}_{END}',
    editor:
      cfg.ADS_MANAGER_EDITOR_URL_TEMPLATE ??
      'https://adsmanager.facebook.com/adsmanager/manage/ads?act={ACCOUNT_ID}&date={START}_{END}#unverified-filter-{TOKEN}',
  };
}

/** True when the real, hand-captured editor template has been supplied. */
export function hasVerifiedLinkTemplates(): boolean {
  const cfg = getConfig();
  return Boolean(cfg.ADS_MANAGER_ACCOUNT_URL_TEMPLATE && cfg.ADS_MANAGER_EDITOR_URL_TEMPLATE);
}
