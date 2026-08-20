# Ads Manager URL templates

Spec section 6:

> Build each filter once by hand in the UI, copy the URL, then template the
> account ID, token and dates: **a URL that silently drops the filter looks
> identical until clicked.**

This is why the app does not construct Ads Manager filter syntax. The
`filter_set` encoding is undocumented and changes; a wrong filter renders a
page that looks correct but shows *unfiltered* data, which would quietly
misinform anyone checking an editor's numbers.

Until real templates are configured, the dashboard shows an amber
"Ads Manager links are unverified" banner. That banner disappears once both
environment variables below are set.

## What to capture

### 1. Account-level template

1. Open Ads Manager for one of the accounts.
2. Switch to the **Ads** tab (ad level — the breakdown must be by creative).
3. Set a custom date range.
4. Copy the URL from the address bar.
5. Replace the parts that vary with placeholders:
   - the `act=` value → `{ACCOUNT_ID}`
   - the range start date → `{START}`
   - the range end date → `{END}`

Set it as:

```
ADS_MANAGER_ACCOUNT_URL_TEMPLATE="https://adsmanager.facebook.com/adsmanager/manage/ads?act={ACCOUNT_ID}&..."
```

### 2. Editor template (with the ad-name filter)

Same as above, but **before copying the URL**, add the filter:

1. Click **Filters**.
2. Add `Ad Name` → `contains` → type an editor token, e.g. `Santiago`.
3. Confirm the table actually narrows to that editor's ads.
4. Copy the URL.
5. Replace as above, plus the token itself → `{TOKEN}`.

```
ADS_MANAGER_EDITOR_URL_TEMPLATE="https://adsmanager.facebook.com/adsmanager/manage/ads?act={ACCOUNT_ID}&...filter_set=...{TOKEN}..."
```

Dates are substituted as `YYYY-MM-DD`. If Ads Manager uses a different date
format in the URL, tell us and we will adjust the substitution.

## Validation

`assertTemplatesValid()` in `lib/links.ts` throws at startup if either template
is missing a required placeholder — in particular an editor template with no
`{TOKEN}`, which would silently open the unfiltered account view for every
editor.

## Verification checklist (before launch)

Placeholders being present is not the same as the filter working. Click through
and confirm:

- [ ] An **account** link opens that account, at ad level, for the week shown.
- [ ] An **editor** link opens with the ad-name filter *visibly applied* in the
      Filters bar.
- [ ] The filtered ad list contains only that editor's ads.
- [ ] The date range matches the figure the link sits next to — week windows for
      the account total and unassigned line, 30-day windows for editor rows and
      top ads.
- [ ] Repeat for **X-ALL MPC**, which spans two ad accounts. Links target the
      primary (`514584538156509`); the card labels both. Ads Manager cannot show
      two ad accounts in one view, so the second account's ads will not appear —
      confirm that is acceptable, or we can render two links instead.
