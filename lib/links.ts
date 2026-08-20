/**
 * Ads Manager deep links (spec section 6).
 *
 * "Build each filter once by hand in the UI, copy the URL, then template the
 * account ID, token and dates: a URL that silently drops the filter looks
 * identical until clicked."
 *
 * So this module does NOT construct Ads Manager filter syntax. It substitutes
 * placeholders into templates that a human captured from a working, verified
 * Ads Manager view. The filter_set encoding is undocumented and version-
 * dependent; guessing it produces a page that looks right and shows the wrong
 * (unfiltered) data.
 */

import type { DateRange } from './metrics/types';

/** Placeholders a template may contain. */
const P_ACCOUNT = '{ACCOUNT_ID}';
const P_START = '{START}';
const P_END = '{END}';
const P_TOKEN = '{TOKEN}';

export interface LinkTemplates {
  /** Account-level view for a window. Needs {ACCOUNT_ID} {START} {END}. */
  account: string;
  /** Adds the ad-name-contains filter. Needs the above plus {TOKEN}. */
  editor: string;
}

/**
 * Validate templates at startup rather than at click time.
 *
 * A missing {TOKEN} in the editor template is exactly the silent-filter-drop
 * failure the spec warns about: every editor link would quietly open the
 * unfiltered account view.
 */
export function assertTemplatesValid(templates: LinkTemplates): void {
  const problems: string[] = [];

  for (const required of [P_ACCOUNT, P_START, P_END]) {
    if (!templates.account.includes(required)) {
      problems.push(`account template is missing ${required}`);
    }
  }
  for (const required of [P_ACCOUNT, P_START, P_END, P_TOKEN]) {
    if (!templates.editor.includes(required)) {
      problems.push(`editor template is missing ${required}`);
    }
  }

  if (problems.length > 0) {
    throw new Error(
      'Ads Manager link templates are invalid: ' +
        problems.join('; ') +
        '. Capture a working URL by hand in Ads Manager (see docs/ads-manager-urls.md).',
    );
  }
}

function substitute(
  template: string,
  values: { accountId: string; range: DateRange; token?: string },
): string {
  let url = template
    .split(P_ACCOUNT)
    .join(encodeURIComponent(values.accountId))
    .split(P_START)
    .join(values.range.start)
    .split(P_END)
    .join(values.range.end);

  if (values.token !== undefined) {
    url = url.split(P_TOKEN).join(encodeURIComponent(values.token));
  }
  return url;
}

/**
 * Account total and the unassigned line open that account for that period.
 * Pass the window of the number the link sits next to (section 6).
 */
export function buildAccountLink(
  templates: LinkTemplates,
  accountId: string,
  range: DateRange,
): string {
  return substitute(templates.account, { accountId, range });
}

/** Editor names add the ad-name-contains filter for their token. */
export function buildEditorLink(
  templates: LinkTemplates,
  accountId: string,
  range: DateRange,
  token: string,
): string {
  return substitute(templates.editor, { accountId, range, token });
}
