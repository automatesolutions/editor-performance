import { describe, expect, it, vi } from 'vitest';
import { FixtureMetaClient, FixturePipesClient } from '../../lib/clients/fixtures';
import type { MetaClient } from '../../lib/clients/types';
import { processAccount } from '../../lib/pipeline/run';
import type { AccountConfig } from '../../lib/metrics/types';
import { windowsForReportDate } from '../../lib/metrics/windows';

// processAccount reads PIPES_ALLOW_UTM_FALLBACK via getConfig(), which
// validates the whole environment. Provide the minimum it requires.
process.env.DATABASE_URL ??= 'postgres://localhost:5432/test';

const TOKENS = ['Suzaine', 'Klemen', 'Santiago', 'CB', 'Ilias'];
const WINDOWS = windowsForReportDate('2026-08-16');

function account(overrides: Partial<AccountConfig> = {}): AccountConfig {
  return {
    id: 1,
    name: 'Splash Foam',
    slug: 'splash-foam',
    targetRoas: 1.3,
    spendFloorCents: 100_000,
    timezone: 'America/Los_Angeles',
    pipesProject: 'admin.fourammedia.com/platforms',
    displayOrder: 1,
    metaAccounts: [{ metaAccountId: '258610945617994', isPrimary: true }],
    unassignedAlertPct: 20,
    ...overrides,
  };
}

describe('processAccount', () => {
  it('produces a report from the fixture clients', async () => {
    const report = await processAccount(account(), WINDOWS, TOKENS, {
      meta: new FixtureMetaClient(),
      pipes: new FixturePipesClient(),
    });

    expect(report.status).toBe('ok');
    expect(report.editors.length).toBeGreaterThan(0);
    // Editors are ordered by 30-day spend, descending.
    const spends = report.editors.map((e) => e.thirty.spendCents);
    expect([...spends].sort((a, b) => b - a)).toEqual(spends);
  });

  it('scopes the Pipes pull to the account, keeping unjoined revenue near zero', async () => {
    // All ten accounts share one Pipes project string. If the pull is not
    // scoped to this account's Meta ad accounts, every other account's revenue
    // reads as "failed to join" and the section 4 diagnostic — the check that
    // tells us whether ROAS is trustworthy at all — reports ~90% on a healthy
    // pull. This asserts the scoping actually happens.
    const report = await processAccount(account(), WINDOWS, TOKENS, {
      meta: new FixtureMetaClient(),
      pipes: new FixturePipesClient(),
    });

    expect(report.unjoinedRevenuePct).not.toBeNull();
    expect(report.unjoinedRevenuePct!).toBeLessThan(5);
  });

  it('sums across both ad accounts for a multi-account reporting account', async () => {
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

    const report = await processAccount(mpc, WINDOWS, TOKENS, {
      meta: new FixtureMetaClient(),
      pipes: new FixturePipesClient(),
    });

    // CB and Klemen only run in the SECOND ad account, so their presence
    // proves both were pulled and summed rather than only the primary.
    const tokens = report.editors.map((e) => e.token);
    expect(tokens).toContain('CB');
    expect(tokens).toContain('Klemen');
    expect(report.metaAccountIds).toHaveLength(2);
  });

  it('propagates a source failure so the caller can isolate it', async () => {
    const failing: MetaClient = {
      fetchAdInsights: vi.fn().mockRejectedValue(new Error('Meta token expired')),
      fetchFirstDeliveryDates: vi.fn().mockResolvedValue(new Map()),
      fetchAccountTimezone: vi.fn().mockResolvedValue('UTC'),
    };

    await expect(
      processAccount(account(), WINDOWS, TOKENS, {
        meta: failing,
        pipes: new FixturePipesClient(),
      }),
    ).rejects.toThrow('Meta token expired');
  });

  it('reports no_spend rather than failing when an account has no ads', async () => {
    // Denta Blast has an empty fixture roster.
    const empty = account({
      id: 3,
      name: 'Denta Blast',
      slug: 'denta-blast',
      targetRoas: null,
      metaAccounts: [{ metaAccountId: '3484659138445892', isPrimary: true }],
    });

    const report = await processAccount(empty, WINDOWS, TOKENS, {
      meta: new FixtureMetaClient(),
      pipes: new FixturePipesClient(),
    });

    expect(report.status).toBe('no_spend');
    expect(report.errorMessage).toBeNull();
  });
});
