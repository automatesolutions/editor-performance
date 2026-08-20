import { describe, expect, it } from 'vitest';
import { attributeEditor, buildTokenMatcher } from '../../lib/metrics/attribution';

const TOKENS = ['Suzaine', 'Klemen', 'Santiago', 'CB', 'Ilias'];

describe('attributeEditor', () => {
  describe('the CB false-positive problem (spec section 8)', () => {
    // "CB is two characters and will false-positive inside other words.
    //  Require a delimiter around it, never a raw substring match."
    const cases: Array<[string, 'editor' | 'unassigned', string?]> = [
      ['SF_CB_KitchenGrease_v6', 'editor', 'CB'],
      ['CB', 'editor', 'CB'],
      ['CB_intro', 'editor', 'CB'],
      ['intro_CB', 'editor', 'CB'],
      ['Splash-CB-Hook3', 'editor', 'CB'],
      ['Splash CB Hook3', 'editor', 'CB'],
      ['SF_CBDOil_v2', 'unassigned'],
      ['SF_CBA_test', 'unassigned'],
      ['SF_MyCB_v1', 'unassigned'],
      ['BLACKBERRY_v2', 'unassigned'],
    ];

    for (const [adName, kind, token] of cases) {
      it(`${adName} -> ${kind}${token ? ` (${token})` : ''}`, () => {
        const result = attributeEditor(adName, TOKENS);
        expect(result.kind).toBe(kind);
        if (result.kind === 'editor' && token) {
          expect(result.token).toBe(token);
        }
      });
    }
  });

  it('does not use \\b, which would break on underscore delimiters', () => {
    // This is the bug this module exists to avoid. JavaScript's word boundary
    // treats _ as a word character, so /\bCB\b/ fails on the dominant ad-name
    // format. If someone "simplifies" the matcher to \b, this test fails.
    const adName = 'SF_CB_KitchenGrease_v6';
    expect(/\bCB\b/i.test(adName)).toBe(false); // documents the trap
    expect(buildTokenMatcher('CB').test(adName)).toBe(true); // our matcher works
  });

  it('credits a real token even when a near-miss substring sits beside it', () => {
    // "Klemen_CBA_test" contains Klemen (delimiter-bounded) and CBA (which is
    // NOT the CB token). That is one match, so it belongs to Klemen — it must
    // not be dragged into unassigned by the near-miss.
    expect(attributeEditor('Klemen_CBA_test', TOKENS)).toEqual({
      kind: 'editor',
      token: 'Klemen',
    });
  });

  it('matches case-insensitively', () => {
    expect(attributeEditor('sf_suzaine_scrubtest', TOKENS)).toEqual({
      kind: 'editor',
      token: 'Suzaine',
    });
    expect(attributeEditor('SF_SANTIAGO_v1', TOKENS)).toEqual({
      kind: 'editor',
      token: 'Santiago',
    });
  });

  it('matches across the delimiters that appear in real ad names', () => {
    for (const adName of [
      'SF_Ilias_Hook3',
      'Splash-Ilias-Hook3',
      'Splash Ilias Hook3',
      'Splash.Ilias.Hook3',
      'Splash|Ilias|Hook3',
    ]) {
      expect(attributeEditor(adName, TOKENS)).toEqual({ kind: 'editor', token: 'Ilias' });
    }
  });

  describe('two-token ads count for neither editor (spec section 8)', () => {
    // "Ads matching two tokens count for neither. Add them to the unassigned
    //  line rather than double-counting."
    it('routes a two-token ad to unassigned, not to the first match', () => {
      const result = attributeEditor('SF_Santiago_CB_v2', TOKENS);
      expect(result).toEqual({ kind: 'unassigned', reason: 'ambiguous' });
    });

    it('distinguishes ambiguous from no-token so the cause is debuggable', () => {
      expect(attributeEditor('SF_Generic_Ad_v1', TOKENS)).toEqual({
        kind: 'unassigned',
        reason: 'none',
      });
      expect(attributeEditor('SF_Suzaine_Klemen_v1', TOKENS)).toEqual({
        kind: 'unassigned',
        reason: 'ambiguous',
      });
    });
  });

  it('treats a regex metacharacter in a token as a literal', () => {
    // Tokens come from the database; one containing "." must not match anything.
    expect(attributeEditor('SF_AXB_v1', ['A.B'])).toEqual({
      kind: 'unassigned',
      reason: 'none',
    });
    expect(attributeEditor('SF_A.B_v1', ['A.B'])).toEqual({ kind: 'editor', token: 'A.B' });
  });

  it('handles an empty token list without matching anything', () => {
    expect(attributeEditor('SF_Suzaine_v1', [])).toEqual({
      kind: 'unassigned',
      reason: 'none',
    });
  });
});
