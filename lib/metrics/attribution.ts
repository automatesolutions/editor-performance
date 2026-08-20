/**
 * Editor attribution from the ad name (spec section 1 and section 8).
 *
 * Pure module: no I/O, no framework imports. Tokens come from the database,
 * never from a hardcoded list.
 */

import type { Attribution } from './types';

/**
 * Characters that count as a token delimiter. Anything that is not a letter or
 * a digit: underscore, space, dash, dot, pipe, slash.
 *
 * WHY NOT \b: JavaScript's word-boundary treats `_` as a word character, so
 * /\bCB\b/i returns FALSE on "SF_CB_KitchenGrease_v6" — and underscore is the
 * delimiter in essentially every ad name in this account set. Using \b here
 * would silently route every CB ad into the unassigned bucket, which looks
 * like a naming-convention problem rather than a bug. Verified by test.
 */
const DELIM = '[^A-Za-z0-9]';

/** Escape regex metacharacters so a token from the DB can't alter the pattern. */
function escapeRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build the delimiter-bounded matcher for one token.
 *
 * Matches when the token is bounded by a non-alphanumeric character or by the
 * start/end of the string, so:
 *   "SF_CB_KitchenGrease_v6" -> matches CB
 *   "CB_intro" / "intro_CB" / "CB" -> match CB
 *   "SF_CBDOil_v2" / "Klemen_CBA_test" -> do NOT match CB
 */
export function buildTokenMatcher(token: string): RegExp {
  const t = escapeRegex(token);
  return new RegExp(`(?:^|${DELIM})${t}(?:${DELIM}|$)`, 'i');
}

/**
 * Attribute one ad name to exactly one editor, or to the unassigned bucket.
 *
 * Spec section 8: "Ads matching two tokens count for neither. Add them to the
 * unassigned line rather than double-counting." So two matches is NOT a
 * first-wins situation — it is explicitly unassigned.
 */
export function attributeEditor(adName: string, tokens: string[]): Attribution {
  const matched: string[] = [];

  for (const token of tokens) {
    if (buildTokenMatcher(token).test(adName)) {
      matched.push(token);
    }
  }

  if (matched.length === 1) {
    // Non-null: length checked above. Required by noUncheckedIndexedAccess.
    return { kind: 'editor', token: matched[0]! };
  }
  if (matched.length === 0) {
    return { kind: 'unassigned', reason: 'none' };
  }
  return { kind: 'unassigned', reason: 'ambiguous' };
}
