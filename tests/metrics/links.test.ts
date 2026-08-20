import { describe, expect, it } from 'vitest';
import { assertTemplatesValid, buildAccountLink, buildEditorLink } from '../../lib/links';
import type { LinkTemplates } from '../../lib/links';

// Stand-in shapes. The REAL templates must be captured by hand from a working
// Ads Manager view (see docs/ads-manager-urls.md) — these only exercise the
// substitution and validation logic.
const templates: LinkTemplates = {
  account:
    'https://adsmanager.facebook.com/adsmanager/manage/ads?act={ACCOUNT_ID}&date={START}_{END}',
  editor:
    'https://adsmanager.facebook.com/adsmanager/manage/ads?act={ACCOUNT_ID}&date={START}_{END}&filter_set=AD_NAME%7Ccontains%7C{TOKEN}',
};

const week = { start: '2026-08-10', end: '2026-08-16' };
const thirty = { start: '2026-07-18', end: '2026-08-16' };

describe('assertTemplatesValid (spec section 6)', () => {
  it('accepts templates carrying every placeholder', () => {
    expect(() => assertTemplatesValid(templates)).not.toThrow();
  });

  it('rejects an editor template with no {TOKEN} — the silent-filter-drop case', () => {
    // "A URL that silently drops the filter looks identical until clicked."
    // Without {TOKEN} every editor link would open the unfiltered account view.
    expect(() =>
      assertTemplatesValid({ ...templates, editor: templates.account }),
    ).toThrow(/missing \{TOKEN\}/);
  });

  it('rejects a template missing its date placeholders', () => {
    expect(() =>
      assertTemplatesValid({
        ...templates,
        account: 'https://adsmanager.facebook.com/adsmanager/manage/ads?act={ACCOUNT_ID}',
      }),
    ).toThrow(/missing \{START\}/);
  });
});

describe('link building', () => {
  it('templates account id and dates into the account link', () => {
    const url = buildAccountLink(templates, '258610945617994', week);
    expect(url).toContain('act=258610945617994');
    expect(url).toContain('date=2026-08-10_2026-08-16');
    expect(url).not.toContain('{');
  });

  it('keeps the ad-name filter in the editor link', () => {
    // A refactor that drops this fragment produces links that look right and
    // show unfiltered data. Assert the filter survives.
    const url = buildEditorLink(templates, '258610945617994', thirty, 'Santiago');
    expect(url).toContain('filter_set=');
    expect(url).toContain('Santiago');
    expect(url).not.toContain('{TOKEN}');
  });

  it('uses the window of the number the link sits next to', () => {
    // Account totals are a week figure; editor rows are a 30-day figure.
    expect(buildAccountLink(templates, '1', week)).toContain('2026-08-10_2026-08-16');
    expect(buildEditorLink(templates, '1', thirty, 'CB')).toContain('2026-07-18_2026-08-16');
  });

  it('url-encodes tokens and account ids', () => {
    const url = buildEditorLink(templates, '123', thirty, 'A B&C');
    expect(url).toContain('A%20B%26C');
  });

  it('substitutes every occurrence of a repeated placeholder', () => {
    const url = buildAccountLink(
      { ...templates, account: '{ACCOUNT_ID}/{ACCOUNT_ID}?d={START}' },
      '99',
      week,
    );
    expect(url).toBe('99/99?d=2026-08-10');
  });
});
