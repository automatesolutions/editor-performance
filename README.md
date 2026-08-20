# Editor Performance Report

A dashboard ranking creative editors by ad performance across 10 accounts.
Editors are identified by a token in the Meta ad name, so every figure is a sum
over individual ads.

`editor-performance-report-spec.pdf` is the source of truth for **logic**.
`Editor Performance Dashboard.html` (the design handoff) is the source of truth
for **visual design only** — where the two disagree, the spec wins. See
[Mockup deviations](#mockup-deviations).

## Status

| Phase | State |
|---|---|
| Metric engine + tests | Done — 88 tests passing |
| Schema, config, seed | Done |
| Pipeline + snapshots | Done (running on fixtures) |
| Dashboard UI | Done |
| Auth gate + cron routes | Done |
| **Meta API access** | **Blocked — see `docs/phase-0-access.md`** |
| **Pipes API join** | **Blocked — see `docs/phase-0-access.md`** |
| Ads Manager URL templates | Awaiting hand-captured URLs (`docs/ads-manager-urls.md`) |

The app runs end to end on fixture data today. Live clients swap in behind
`MetaClient` / `PipesClient` once the Phase 0 spikes land — no pipeline or UI
changes needed.

## Running locally

```bash
npm install

# Postgres (any instance; this is the local dev one)
docker run -d --name epr-postgres \
  -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=editor_performance \
  -p 55432:5432 postgres:16-alpine

cp .env.example .env.local     # then fill in DATABASE_URL etc.

npm run db:migrate             # apply schema
npm run db:seed                # 10 accounts, 5 editor tokens
npm run db:fixtures            # run the pipeline, write a snapshot

npm run dev                    # http://localhost:3000
```

Sign in with `APP_PASSWORD`.

```bash
npm test        # metric engine + pipeline tests
npm run typecheck
```

## Architecture

```
Daily cron ─► /api/cron/refresh ─► Meta + Pipes ─► join ─► compute ─► Postgres snapshot
                                                                          │
                                                    app/page.tsx (RSC) ◄──┘
```

The page never calls Meta or Pipes. It reads one versioned snapshot, so a
mid-run refresh can never render half-written data.

### Module boundaries

- **`lib/metrics/`** — pure. Imports nothing from Next, Postgres, or the API
  clients. All of spec section 5 lives here, which is why the edge cases are
  unit-testable without a database.
- **`lib/clients/`** — source interfaces plus fixture and (later) live impls.
- **`lib/pipeline/`** — the only place I/O and domain logic mix.
- **`components/`, `app/`** — server components reading computed snapshots.

## Rules worth knowing before changing anything

These are the places where an innocuous-looking edit breaks the report:

**Editor token matching must not use `\b`.** JavaScript's word boundary treats
`_` as a word character, so `/\bCB\b/i` returns *false* on
`SF_CB_KitchenGrease_v6` — and underscore is the delimiter in nearly every ad
name here. Every CB ad would silently vanish into unassigned. See
`lib/metrics/attribution.ts`; there is a test that fails if someone
"simplifies" it.

**A null target must stay null.** Three accounts have targets marked "to
confirm". They render with no verdict dots and no winning-ad counts. The column
is nullable with **no default** so this is structural, not a convention. A
borrowed target produces checkmarks nobody agreed to.

**ROAS is always `SUM(revenue) / SUM(spend)`,** never an average of per-ad
ratios. Money is stored as integer cents; ratios are computed at the point of
use and never stored pre-rounded and re-aggregated.

**The Meta↔Pipes join is a LEFT join from Meta.** An ad with spend and no Pipes
revenue must survive with `pipesRevenue = 0` — it stays in the pooled-ROAS
denominator. An inner join would drop it, understating spend and inflating every
ROAS on the page: a failure that looks like good news.

**`no_spend` and `failed` are different.** An account with no spend still gets a
card saying so, so that a *missing* card always means a broken pull.

**Ads Manager URLs are templated, never constructed.** A URL that silently drops
its filter looks identical until clicked.

## Mockup deviations

The design mockup's logic script contains bugs relative to the spec. Fixed here:

1. Verdict dots rendered red on null-target accounts → now no dot at all.
2. Winning-ad counts shown on null-target accounts → now omitted entirely.
3. `&search=` URL param → replaced with hand-captured templates.
4. Sparkline undefined in the spec → 6 weekly pooled Pipes ROAS values.
5. `fmtRoas` dropped trailing zeros (`2.30` → `2.3x`) → now always 2 decimals.
6. MPC's account id parsed from a string → junction table with `is_primary`.
7. The "no spend this week" marker occupied the 30-day verdict slot → now an
   annotation beside the name.

## Open questions

- Three accounts still show "target not set" (Splash Spotless, Denta Blast,
  X-All Air Ionizer). They work, but carry no verdicts until real targets are
  supplied.
- Which Meta purchase action type feeds Meta ROAS — see `docs/phase-0-access.md`.
