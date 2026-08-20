/**
 * The account roster from spec section 1, used to SEED the database.
 *
 * This is seed data, not runtime config: the pipeline and UI read accounts
 * from Postgres, because spec section 1 requires targets and the spend floor
 * to live in a table rather than in code so they can be changed without a
 * deploy.
 *
 * Three accounts have target "to confirm" in the spec. They are seeded as
 * NULL, never as a borrowed default.
 */

export interface AccountSeed {
  id: number;
  name: string;
  slug: string;
  /** null = "to confirm" in the spec. Never defaulted. */
  targetRoas: number | null;
  metaAccountIds: string[];
  pipesProject: string;
  /** Placeholder until the Meta preflight syncs each account's real zone. */
  timezone: string;
}

const PIPES_PROJECT = 'admin.fourammedia.com/platforms';

/** Until Phase 0a reads the real value from Meta for each account. */
const PLACEHOLDER_TZ = 'America/Los_Angeles';

export const ACCOUNT_SEEDS: AccountSeed[] = [
  {
    id: 1,
    name: 'Splash Foam',
    slug: 'splash-foam',
    targetRoas: 1.3,
    metaAccountIds: ['258610945617994'],
    pipesProject: PIPES_PROJECT,
    timezone: PLACEHOLDER_TZ,
  },
  {
    id: 2,
    name: 'Splash Spotless',
    slug: 'splash-spotless',
    targetRoas: null, // "to confirm"
    metaAccountIds: ['271012631870595'],
    pipesProject: PIPES_PROJECT,
    timezone: PLACEHOLDER_TZ,
  },
  {
    id: 3,
    name: 'Denta Blast',
    slug: 'denta-blast',
    targetRoas: null, // "to confirm"
    metaAccountIds: ['3484659138445892'],
    pipesProject: PIPES_PROJECT,
    timezone: PLACEHOLDER_TZ,
  },
  {
    id: 4,
    name: 'Splash Spray',
    slug: 'splash-spray',
    targetRoas: 1.3,
    metaAccountIds: ['1472869896844785'],
    pipesProject: PIPES_PROJECT,
    timezone: PLACEHOLDER_TZ,
  },
  {
    id: 5,
    name: 'Barks No More EST',
    slug: 'barks-no-more-est',
    targetRoas: 1.45,
    metaAccountIds: ['810292903775985'],
    pipesProject: PIPES_PROJECT,
    timezone: PLACEHOLDER_TZ,
  },
  {
    id: 6,
    name: 'X-All Air Ionizer -EST',
    slug: 'x-all-air-ionizer-est',
    targetRoas: null, // "to confirm"
    metaAccountIds: ['852183256500077'],
    pipesProject: PIPES_PROJECT,
    timezone: PLACEHOLDER_TZ,
  },
  {
    id: 7,
    name: 'Pee Buster - EST',
    slug: 'pee-buster-est',
    targetRoas: 1.4,
    metaAccountIds: ['1078631533275563'],
    pipesProject: PIPES_PROJECT,
    timezone: PLACEHOLDER_TZ,
  },
  {
    id: 8,
    name: 'X-ALL Toilet Cleaner',
    slug: 'x-all-toilet-cleaner',
    targetRoas: 1.4,
    metaAccountIds: ['3747514945517577'],
    pipesProject: PIPES_PROJECT,
    timezone: PLACEHOLDER_TZ,
  },
  {
    id: 9,
    name: 'X-ALL Washing Machine',
    slug: 'x-all-washing-machine',
    targetRoas: 1.4,
    metaAccountIds: ['1946131762522115'],
    pipesProject: PIPES_PROJECT,
    timezone: PLACEHOLDER_TZ,
  },
  {
    id: 10,
    name: 'X-ALL MPC',
    slug: 'x-all-mpc',
    targetRoas: 1.4,
    // Spans two ad accounts. Raw numbers are summed across both BEFORE any
    // ratio is taken (spec section 1). The first is the link target.
    metaAccountIds: ['514584538156509', '2620458594817497'],
    pipesProject: PIPES_PROJECT,
    timezone: PLACEHOLDER_TZ,
  },
];

/** Editor tokens from spec section 1. */
export const EDITOR_TOKEN_SEEDS = ['Suzaine', 'Klemen', 'Santiago', 'CB', 'Ilias'];

/** Default spend floor: $1,000 (spec section 1). */
export const DEFAULT_SPEND_FLOOR_CENTS = 100_000;
