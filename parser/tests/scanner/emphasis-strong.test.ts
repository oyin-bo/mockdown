import { describe, expect, test } from 'vitest';

import { TokenFlags } from '../../token-types.js';
import { scanTokens, scanTokensStrings } from '../utils.test.js';

describe('Emphasis and Strong', () => {
  describe('Emphasis and Strong flanking', () => {
    test('asterisk flanking: a*bc*', () => {
      const tokens = scanTokens('a*bc*');
      expect(tokens.map(String)).toEqual([
        'a Identifier',
        '* AsteriskToken',
        'bc Identifier',
        '* AsteriskToken',
        'EndOfFileToken',
      ]);
      const open = tokens[1];
      const close = tokens[3];
      // For '*' both open and close can be set in flanking position
      expect(open.flags & TokenFlags.CanClose).toBeTruthy();
      expect(close.flags & TokenFlags.CanOpen).toBeFalsy();

      expect(close.flags & TokenFlags.CanOpen).toBeFalsy();
    });

    test('double asterisk strong: a**b**', () => {
      const tokens = scanTokens('a**b**');
      expect(tokens.map(String)).toEqual([
        'a Identifier',
        '** AsteriskAsterisk',
        'b Identifier',
        '** AsteriskAsterisk',
        'EndOfFileToken',
      ]);
      const open = tokens[1];
      expect(open.flags & TokenFlags.CanOpen).toBeTruthy();
      expect(open.flags & TokenFlags.CanClose).toBeTruthy();
      const close = tokens[3];
      expect(close.flags & TokenFlags.CanOpen).toBeFalsy();
      expect(close.flags & TokenFlags.CanClose).toBeTruthy();
    });

    test('underscore intraword stays identifier (no delimiter tokens)', () => {
      expect(scanTokensStrings('a_b_')).toEqual([
        'a_b_ Identifier',
        'EndOfFileToken',
      ]);
    });
  });

  test('scans double asterisk for strong', () => {
    expect(scanTokensStrings('**strong**')).toEqual([
      '** AsteriskAsterisk',
      'strong Identifier',
      '** AsteriskAsterisk',
      'EndOfFileToken',
    ]);
  });

  test('scans double underscore for strong', () => {
    expect(scanTokensStrings('__strong__')).toEqual([
      '__ UnderscoreUnderscore',
      'strong Identifier',
      '__ UnderscoreUnderscore',
      'EndOfFileToken',
    ]);
  });

  test('scans double tilde for strikethrough', () => {
    expect(scanTokensStrings('~~strikethrough~~')).toEqual([
      '~~ TildeTilde',
      'strikethrough Identifier',
      '~~ TildeTilde',
      'EndOfFileToken',
    ]);
  });

  // Note: full CommonMark flanking/intraword rules to be tested after implementation
});
