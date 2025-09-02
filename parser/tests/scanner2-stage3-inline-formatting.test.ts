/**
 * Tests for Stage 3: Inline Formatting (Bold, Italic, Code)
 * Using Scanner2 Testing Infrastructure
 */

import { describe, test, expect } from 'vitest';
import { verifyTokens } from './scanner2-testing-infrastructure.js';

describe('Stage 3: Inline Formatting', () => {
  describe('Bold formatting', () => {
    test('double asterisk bold', () => {
      expect(verifyTokens(`
**bold text**
12            3
@1 AsteriskAsterisk flags: 512
@2 StringLiteral text: "bold text"
@3 AsteriskAsterisk flags: 1024`)).toBe(`
**bold text**
12            3
@1 AsteriskAsterisk flags: 512
@2 StringLiteral text: "bold text"
@3 AsteriskAsterisk flags: 1024`);
    });

    test('double underscore bold', () => {
      expect(verifyTokens(`
__bold text__
12           3
@1 UnderscoreUnderscore flags: 512
@2 StringLiteral text: "bold text"
@3 UnderscoreUnderscore flags: 1024`)).toBe(`
__bold text__
12           3
@1 UnderscoreUnderscore flags: 512
@2 StringLiteral text: "bold text"
@3 UnderscoreUnderscore flags: 1024`);
    });

    test('bold in text context', () => {
      expect(verifyTokens(`
This is **bold** text
        12      3
@1 AsteriskAsterisk flags: 512
@2 StringLiteral text: "bold"
@3 AsteriskAsterisk flags: 1024`)).toBe(`
This is **bold** text
        12      3
@1 AsteriskAsterisk flags: 512
@2 StringLiteral text: "bold"
@3 AsteriskAsterisk flags: 1024`);
    });
  });

  describe('Italic formatting', () => {
    test('single asterisk italic', () => {
      expect(verifyTokens(`
*italic text*
12           3
@1 AsteriskToken flags: 512
@2 StringLiteral text: "italic text"
@3 AsteriskToken flags: 1024`)).toBe(`
*italic text*
12           3
@1 AsteriskToken flags: 512
@2 StringLiteral text: "italic text"
@3 AsteriskToken flags: 1024`);
    });

    test('single underscore italic', () => {
      expect(verifyTokens(`
_italic text_
12           3
@1 UnderscoreToken flags: 512
@2 StringLiteral text: "italic text"
@3 UnderscoreToken flags: 1024`)).toBe(`
_italic text_
12           3
@1 UnderscoreToken flags: 512
@2 StringLiteral text: "italic text"
@3 UnderscoreToken flags: 1024`);
    });

    test('italic in text context', () => {
      expect(verifyTokens(`
This is *italic* text
        12      3
@1 AsteriskToken flags: 512
@2 StringLiteral text: "italic"
@3 AsteriskToken flags: 1024`)).toBe(`
This is *italic* text
        12      3
@1 AsteriskToken flags: 512
@2 StringLiteral text: "italic"
@3 AsteriskToken flags: 1024`);
    });
  });

  describe('Code spans', () => {
    test('single backtick code', () => {
      expect(verifyTokens(`
\`code\`
12    3
@1 BacktickToken
@2 StringLiteral text: "code"
@3 BacktickToken`)).toBe(`
\`code\`
12    3
@1 BacktickToken
@2 StringLiteral text: "code"
@3 BacktickToken`);
    });

    test('double backtick code with inner backtick', () => {
      expect(verifyTokens(`
\`\`code with \` backtick\`\`
12                       3
@1 BacktickToken
@2 StringLiteral text: "code with \` backtick"
@3 BacktickToken`)).toBe(`
\`\`code with \` backtick\`\`
12                       3
@1 BacktickToken
@2 StringLiteral text: "code with \` backtick"
@3 BacktickToken`);
    });

    test('code in text context', () => {
      expect(verifyTokens(`
Here is \`code\` span
        12    3
@1 BacktickToken
@2 StringLiteral text: "code"
@3 BacktickToken`)).toBe(`
Here is \`code\` span
        12    3
@1 BacktickToken
@2 StringLiteral text: "code"
@3 BacktickToken`);
    });
  });

  describe('Strikethrough', () => {
    test('double tilde strikethrough', () => {
      expect(verifyTokens(`
~~strikethrough~~
12               3
@1 TildeTilde
@2 StringLiteral text: "strikethrough"
@3 TildeTilde`)).toBe(`
~~strikethrough~~
12               3
@1 TildeTilde
@2 StringLiteral text: "strikethrough"
@3 TildeTilde`);
    });

    test('strikethrough in text context', () => {
      expect(verifyTokens(`
This is ~~deleted~~ text
        12         3
@1 TildeTilde
@2 StringLiteral text: "deleted"
@3 TildeTilde`)).toBe(`
This is ~~deleted~~ text
        12         3
@1 TildeTilde
@2 StringLiteral text: "deleted"
@3 TildeTilde`);
    });
  });

  describe('Complex nesting and combinations', () => {
    test('bold and italic combination', () => {
      expect(verifyTokens(`
***bold and italic***
123               456
@1 AsteriskToken flags: 512
@2 AsteriskAsterisk flags: 512  
@3 StringLiteral text: "bold and italic"
@4 AsteriskAsterisk flags: 1024
@5 AsteriskToken flags: 1024
@6 EndOfFileToken`)).toBe(`
***bold and italic***
123               456
@1 AsteriskToken flags: 512
@2 AsteriskAsterisk flags: 512  
@3 StringLiteral text: "bold and italic"
@4 AsteriskAsterisk flags: 1024
@5 AsteriskToken flags: 1024
@6 EndOfFileToken`);
    });

    test('code inside bold', () => {
      expect(verifyTokens(`
**bold with \`code\` inside**
12          34    5        6
@1 AsteriskAsterisk flags: 512
@2 StringLiteral text: "bold with "
@3 BacktickToken
@4 StringLiteral text: "code"
@5 BacktickToken
@6 AsteriskAsterisk flags: 1024`)).toBe(`
**bold with \`code\` inside**
12          34    5        6
@1 AsteriskAsterisk flags: 512
@2 StringLiteral text: "bold with "
@3 BacktickToken
@4 StringLiteral text: "code"
@5 BacktickToken
@6 AsteriskAsterisk flags: 1024`);
    });

    test('multiple inline elements', () => {
      expect(verifyTokens(`
*italic* **bold** \`code\` ~~strike~~
12      3 45     6 78    9 AB      C
@1 AsteriskToken flags: 512
@2 StringLiteral text: "italic"
@3 AsteriskToken flags: 1024
@4 AsteriskAsterisk flags: 512
@5 StringLiteral text: "bold"
@6 AsteriskAsterisk flags: 1024
@7 BacktickToken
@8 StringLiteral text: "code"
@9 BacktickToken
@A TildeTilde
@B StringLiteral text: "strike"
@C TildeTilde`)).toBe(`
*italic* **bold** \`code\` ~~strike~~
12      3 45     6 78    9 AB      C
@1 AsteriskToken flags: 512
@2 StringLiteral text: "italic"
@3 AsteriskToken flags: 1024
@4 AsteriskAsterisk flags: 512
@5 StringLiteral text: "bold"
@6 AsteriskAsterisk flags: 1024
@7 BacktickToken
@8 StringLiteral text: "code"
@9 BacktickToken
@A TildeTilde
@B StringLiteral text: "strike"
@C TildeTilde`);
    });
  });

  describe('Edge cases and error handling', () => {
    test('unmatched opening delimiter', () => {
      expect(verifyTokens(`
**bold without close
12
@1 AsteriskAsterisk flags: 512
@2 StringLiteral text: "bold without close"`)).toBe(`
**bold without close
12
@1 AsteriskAsterisk flags: 512
@2 StringLiteral text: "bold without close"`);
    });

    test('unmatched closing delimiter', () => {
      expect(verifyTokens(`
text with close**
               12
@1 StringLiteral text: "text with close"
@2 AsteriskAsterisk flags: 1024`)).toBe(`
text with close**
               12
@1 StringLiteral text: "text with close"
@2 AsteriskAsterisk flags: 1024`);
    });

    test('nested same delimiters', () => {
      expect(verifyTokens(`
**bold **inner** bold**
12     34     5      6
@1 AsteriskAsterisk flags: 512
@2 StringLiteral text: "bold "
@3 AsteriskAsterisk flags: 512
@4 StringLiteral text: "inner"
@5 AsteriskAsterisk flags: 1024
@6 AsteriskAsterisk flags: 1024`)).toBe(`
**bold **inner** bold**
12     34     5      6
@1 AsteriskAsterisk flags: 512
@2 StringLiteral text: "bold "
@3 AsteriskAsterisk flags: 512
@4 StringLiteral text: "inner"
@5 AsteriskAsterisk flags: 1024
@6 AsteriskAsterisk flags: 1024`);
    });

    test('underscore intraword handling', () => {
      expect(verifyTokens(`
snake_case_variable
1
@1 StringLiteral text: "snake_case_variable"`)).toBe(`
snake_case_variable
1
@1 StringLiteral text: "snake_case_variable"`);
    });

    test('backtick run length mismatch', () => {
      expect(verifyTokens(`
\`\`code with single \` backtick\`
12                             3
@1 BacktickToken
@2 StringLiteral text: "code with single \` backtick"
@3 BacktickToken`)).toBe(`
\`\`code with single \` backtick\`
12                             3
@1 BacktickToken
@2 StringLiteral text: "code with single \` backtick"
@3 BacktickToken`);
    });
  });
});