import { describe, expect, test } from 'vitest';

import { scanTokensStrings } from '../utils.test.js';

describe('Markdown Extensions — Thematic Breaks', () => {

  test('asterisk thematic break', () => {
    const tokens = scanTokensStrings('***');
    expect(tokens).toEqual(['*** AsteriskToken', 'EndOfFileToken']);
  });

  test('dash thematic break', () => {
    const tokens = scanTokensStrings('---');
    expect(tokens).toEqual(['--- DashToken', 'EndOfFileToken']);
  });

  test('underscore thematic break', () => {
    const tokens = scanTokensStrings('___');
    expect(tokens).toEqual(['___ UnderscoreToken', 'EndOfFileToken']);
  });

  test('thematic break with spaces', () => {
    const tokens = scanTokensStrings('* * * *');
    expect(tokens).toEqual([
      '* AsteriskToken',
      '" " WhitespaceTrivia',
      '* AsteriskToken',
      '" " WhitespaceTrivia',
      '* AsteriskToken',
      '" " WhitespaceTrivia',
      '* AsteriskToken',
      'EndOfFileToken'
    ]);
  });
});
