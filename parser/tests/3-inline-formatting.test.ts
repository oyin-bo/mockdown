/**
 * Tests for Stage 3: Inline Formatting (Bold, Italic, Code)
 * Using Scanner2 Testing Infrastructure
 * 
 * Following Stage 2 plan: Always use the same variable to pass to expect and toBe.
 * Do not pass two string literals separately.
 */

import { describe, test, expect } from 'vitest';
import { verifyTokens } from './verify-tokens.js';

describe('Stage 3: Inline Formatting', () => {
  describe('Basic token recognition', () => {
    test('double asterisk at line start', () => {
      const tokenTest = `
**bold**
1     2
@1 AsteriskAsterisk flags: 514
@2 AsteriskAsterisk flags: 1024`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('ERROR in position: double asterisk at line start', () => {
      const tokenTest = `
**bold**
1      2
@1 AsteriskAsterisk flags: 514
@2 AsteriskAsterisk flags: 1024`;
      expect(verifyTokens(tokenTest)).toBe(`
**bold**
1     2
@1 AsteriskAsterisk flags: 514
@2 AsteriskAsterisk flags: 1024
`);
    });

    test('single asterisk recognition', () => {
      const tokenTest = `
*italic*
1      2
@1 AsteriskToken flags: 514
@2 AsteriskToken flags: 1024`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('underscore in context', () => {
      const tokenTest = `
_text_
1    2
@1 UnderscoreToken flags: 514
@2 UnderscoreToken flags: 1024`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('backtick code spans', () => {
      const tokenTest =
'`code`' + '\n' +
'1    2' + `
@1 BacktickToken
@2 BacktickToken`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('double tilde strikethrough', () => {
      const tokenTest = `
~~strike~~
1       2
@1 TildeTilde
@2 TildeTilde`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });

  describe('Text and intraword handling', () => {
    test('intraword underscores remain as text', () => {
      const tokenTest = `
snake_case_variable
1
@1 StringLiteral text: "snake_case_variable"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('text between formatting', () => {
      const tokenTest = `
**bold text**
1 2        3
@1 AsteriskAsterisk flags: 514
@2 StringLiteral text: "bold text"
@3 AsteriskAsterisk flags: 1024`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('mixed content in line', () => {
      const tokenTest = `
text *italic* more
     1      2
@1 AsteriskToken flags: 512
@2 AsteriskToken flags: 1024`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });

  describe('Edge cases', () => {
    test('single tilde not recognized as formatting', () => {
      const tokenTest = `
single~tilde
1
@1 StringLiteral text: "single~tilde"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });
});
