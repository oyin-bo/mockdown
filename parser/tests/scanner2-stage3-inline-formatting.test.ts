/**
 * Tests for Stage 3: Inline Formatting (Bold, Italic, Code)
 * Using Scanner2 Testing Infrastructure
 */

import { describe, test, expect } from 'vitest';
import { verifyTokens } from './scanner2-testing-infrastructure.js';

describe('Stage 3: Inline Formatting', () => {
  describe('Basic token recognition', () => {
    test('double asterisk at line start', () => {
      expect(verifyTokens(`
**bold**
1      2
@1 AsteriskAsterisk flags: 514
@2 AsteriskAsterisk flags: 1024`)).toBe(`
**bold**
1      2
@1 AsteriskAsterisk flags: 514
@2 AsteriskAsterisk flags: 1024`);
    });

    test('single asterisk recognition', () => {
      expect(verifyTokens(`
*italic*
1      2
@1 AsteriskToken flags: 514
@2 AsteriskToken flags: 1024`)).toBe(`
*italic*
1      2
@1 AsteriskToken flags: 514
@2 AsteriskToken flags: 1024`);
    });

    test('underscore in context', () => {
      expect(verifyTokens(`
_text_
1    2
@1 UnderscoreToken flags: 514
@2 UnderscoreToken flags: 1024`)).toBe(`
_text_
1    2
@1 UnderscoreToken flags: 514
@2 UnderscoreToken flags: 1024`);
    });

    test('backtick code spans', () => {
      expect(verifyTokens(`
\`code\`
1    2
@1 BacktickToken
@2 BacktickToken`)).toBe(`
\`code\`
1    2
@1 BacktickToken
@2 BacktickToken`);
    });

    test('double tilde strikethrough', () => {
      expect(verifyTokens(`
~~strike~~
1        2
@1 TildeTilde
@2 TildeTilde`)).toBe(`
~~strike~~
1        2
@1 TildeTilde
@2 TildeTilde`);
    });
  });

  describe('Text and intraword handling', () => {
    test('intraword underscores remain as text', () => {
      expect(verifyTokens(`
snake_case_variable
1
@1 StringLiteral text: "snake_case_variable"`)).toBe(`
snake_case_variable
1
@1 StringLiteral text: "snake_case_variable"`);
    });

    test('text between formatting', () => {
      expect(verifyTokens(`
**bold text**
1 2        3
@1 AsteriskAsterisk flags: 514
@2 StringLiteral text: "bold text"
@3 AsteriskAsterisk flags: 1024`)).toBe(`
**bold text**
1 2        3
@1 AsteriskAsterisk flags: 514
@2 StringLiteral text: "bold text"
@3 AsteriskAsterisk flags: 1024`);
    });

    test('mixed content in line', () => {
      expect(verifyTokens(`
text *italic* more
     1      2
@1 AsteriskToken flags: 512
@2 AsteriskToken flags: 1024`)).toBe(`
text *italic* more
     1      2
@1 AsteriskToken flags: 512
@2 AsteriskToken flags: 1024`);
    });
  });

  describe('Edge cases', () => {
    test('single tilde not recognized as formatting', () => {
      expect(verifyTokens(`
single~tilde
1
@1 StringLiteral text: "single~tilde"`)).toBe(`
single~tilde
1
@1 StringLiteral text: "single~tilde"`);
    });

  });
});