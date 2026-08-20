# Phase 0 — access spikes

Two things are unknown, and neither can be resolved from this repo. The app is
built and running on fixtures so nothing is blocked in the meantime; these
spikes gate only the *wiring* of live data.

---

## 0a. Meta Marketing API access

**Status: nothing set up yet.**

### Steps

1. Create (or identify) a Meta app with Marketing API access.
2. In Business Manager, create a **system user**.
3. Grant that system user `ads_read` on all **11** ad account IDs below.
4. Generate a long-lived system user token → set as `META_ACCESS_TOKEN`.

### The 11 ad accounts

| # | Account | Meta ad account ID |
|---|---|---|
| 1 | Splash Foam | 258610945617994 |
| 2 | Splash Spotless | 271012631870595 |
| 3 | Denta Blast | 3484659138445892 |
| 4 | Splash Spray | 1472869896844785 |
| 5 | Barks No More EST | 810292903775985 |
| 6 | X-All Air Ionizer -EST | 852183256500077 |
| 7 | Pee Buster - EST | 1078631533275563 |
| 8 | X-ALL Toilet Cleaner | 3747514945517577 |
| 9 | X-ALL Washing Machine | 1946131762522115 |
| 10 | X-ALL MPC | 514584538156509 **and** 2620458594817497 |

Ten reporting accounts, eleven ad accounts — X-ALL MPC spans two.

### Verification

```bash
npm run preflight:meta
```

Must print 11 green rows. It also reads each account's `timezone_name` and
writes it to `accounts.timezone`, which is what the week and trailing-30
boundaries are derived from (spec section 8: timezone follows each ad account's
reporting timezone, not server time).

### Also settle here: which purchase action type

`purchase_conversion_value` is not a flat field — it comes out of
`action_values`, and the two candidates differ materially:

- `omni_purchase`
- `offsite_conversion.fb_pixel_purchase`

Picking the wrong one silently mis-states Meta ROAS with **no visible symptom**.
Compare both against a known account's Ads Manager figures, then pin the answer
in `META_PURCHASE_ACTION_TYPE`.

---

## 0b. The Pipes join spike — the project risk

**Status: not confirmed at all.**

Spec section 4 is unusually direct about this:

> Confirm this before scoping anything else. [...] If Pipes cannot attribute
> revenue to a specific Meta ad, nothing here works.

Everything in this report is a sum over individual ads, because editors are
identified by ad name. Revenue that cannot be tied to an ad cannot be tied to an
editor.

### Questions to answer at `admin.fourammedia.com/platforms`

1. **Auth and endpoint shape.** How is the API authenticated? What does a
   revenue query look like, and what does it return?
2. **Can a revenue row be tied to one Meta ad ID?** Is there a direct `ad_id`
   field, or only a UTM `content` value?
3. **If UTM content — is it consistent across all ten accounts?** A convention
   that holds for eight accounts and not two produces a report that is quietly
   wrong for those two.
4. **What share of Pipes revenue fails to join?** Spec: must be near zero. The
   pipeline already computes and displays this (`unjoined_revenue_pct`), and
   warns on the page above 2%.
5. **What timezone do Pipes timestamps use?** If UTC, they must be converted to
   account-local *before* bucketing into `date_local`, or revenue lands on the
   wrong day and leaks across the week boundary. This is the second most likely
   source of quiet wrongness after the join itself.

### Deliverable

`docs/pipes-findings.md`, plus a saved sample response committed as a fixture.

### The gate

If (2) and (3) both fail, **stop and escalate** — the agreed decision. The
pipeline must not compute Pipes ROAS or verdicts, the dashboard shows an
explicit blocked state, and the findings go to whoever owns Pipes.

Specifically: do **not** substitute Meta ROAS for Pipes ROAS. The account
targets are Pipes-based, so doing that would produce green checks against a
number nobody agreed to — the same failure spec section 1 warns about for
borrowed targets.

---

## Wiring live data once both are done

1. Implement `lib/clients/meta.ts` and `lib/clients/pipes.ts` against the
   `MetaClient` / `PipesClient` interfaces in `lib/clients/types.ts`.
2. Set `USE_FIXTURES=false`.
3. Run `scripts/backfill.ts` for ~13 months so `first_delivery_date` is derived
   from real delivery history — until then the new-vs-holdover split is not
   trustworthy, because an ad from March would look new.
4. Set `PIPES_ALLOW_UTM_FALLBACK=true` **only** if question 3 was answered yes.
