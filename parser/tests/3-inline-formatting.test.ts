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
@1 AsteriskAsterisk 514
@2 AsteriskAsterisk 1024`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('ERROR in position: double asterisk at line start', () => {
      const tokenTestWrong = `
**bold**
1      2
@1 AsteriskAsterisk 514
@2 AsteriskAsterisk 1024`;
      const tokenTestCorrect = `
**bold**
1     2
@1 AsteriskAsterisk 514
@2 AsteriskAsterisk 1024
`;
      expect(verifyTokens(tokenTestWrong)).toBe(tokenTestCorrect);
    });

    test('single asterisk recognition', () => {
      const tokenTest = `
*italic*
1      2
@1 AsteriskToken 514
@2 AsteriskToken 1024`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('underscore in context', () => {
      const tokenTest = `
_text_
1    2
@1 UnderscoreToken 514
@2 UnderscoreToken 1024`;
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
@1 StringLiteral "snake_case_variable"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('text between formatting', () => {
      const tokenTest = `
**bold text**
1 2        3
@1 AsteriskAsterisk 514
@2 StringLiteral "bold text"
@3 AsteriskAsterisk 1024`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('mixed content in line', () => {
      const tokenTest = `
text *italic* more
     1      2
@1 AsteriskToken 512
@2 AsteriskToken 1024`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });

  describe('Edge cases', () => {
    test('single tilde not recognized as formatting', () => {
      const tokenTest = `
single~tilde
1
@1 StringLiteral "single~tilde"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });

  describe('Whitespace handling in StringLiteral tokens', () => {
    test('line-start text with excessive whitespace gets normalized after leading whitespace', () => {
      const tokenTest = `
  Text\twith\t\tmultiple   spaces  
1 2
@1 WhitespaceTrivia "  "
@2 StringLiteral "Text with multiple spaces"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('line-start after whitespace trivia gets normalized', () => {
      const tokenTest = `
    Text\twith\t\tmultiple   spaces
1   2
@1 WhitespaceTrivia "    "
@2 StringLiteral "Text with multiple spaces"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('mid-line text with excessive whitespace gets normalized consistently', () => {
      const tokenTest = `
**bold** text\twith\t\tmultiple   spaces
1       2
@1 AsteriskAsterisk "**" PrecedingLineBreak|IsAtLineStart|CanOpen
@2 StringLiteral " text with multiple spaces"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('text after other formatting tokens gets normalized consistently', () => {
      const tokenTest = `
*italic* and\tthen\t\tmore   text
12     34
@1 AsteriskToken "*" PrecedingLineBreak|IsAtLineStart|CanOpen
@2 StringLiteral "italic"
@3 AsteriskToken "*" CanClose
@4 StringLiteral " and then more text"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('all text positions have consistent whitespace normalization behavior', () => {
      const tokenTest = `
  Leading\t\tspaces   first
1 2
@1 WhitespaceTrivia "  "
@2 StringLiteral "Leading spaces first"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('text with only trailing whitespace gets trimmed', () => {
      const tokenTest = `
Text\t\twith\t\ttrailing   
1
@1 StringLiteral "Text with trailing" PrecedingLineBreak|IsAtLineStart`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });

  describe('Consecutive emphasis with whitespace separation', () => {
    test('**bold** text produces correct tokens with preserved leading space', () => {
      const tokenTest = `
**bold** text
1 2   3 4
@1 AsteriskAsterisk "**" PrecedingLineBreak|IsAtLineStart|CanOpen
@2 StringLiteral "bold"
@3 AsteriskAsterisk "**" CanClose
@4 StringLiteral " text"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('text **bold** produces correct tokens with preserved trailing space', () => {
      const tokenTest = `
text **bold**
1    2 3   4
@1 StringLiteral "text" PrecedingLineBreak|IsAtLineStart
@2 AsteriskAsterisk "**" CanOpen
@3 StringLiteral "bold"
@4 AsteriskAsterisk "**" CanClose`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('start **bold** end produces correct tokens with both spaces preserved', () => {
      const tokenTest = `
start **bold** end
1     2 3   4 5
@1 StringLiteral "start" PrecedingLineBreak|IsAtLineStart
@2 AsteriskAsterisk "**" CanOpen
@3 StringLiteral "bold"
@4 AsteriskAsterisk "**" CanClose
@5 StringLiteral " end"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('*italic* start **bold** text *italic* produces correct complex tokenization', () => {
      const tokenTest = `
*italic* start **bold** text *italic*
12     34      5 6   7 8     9A     B
@1 AsteriskToken "*" PrecedingLineBreak|IsAtLineStart|CanOpen
@2 StringLiteral "italic"
@3 AsteriskToken "*" CanClose
@4 StringLiteral " start "
@5 AsteriskAsterisk "**" CanOpen
@6 StringLiteral "bold"
@7 AsteriskAsterisk "**" CanClose
@8 StringLiteral " text "
@9 AsteriskToken "*" CanOpen
@A StringLiteral "italic"
@B AsteriskToken "*" CanClose`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('multiple consecutive emphasis with various whitespace patterns', () => {
      const tokenTest = `
**bold**  *italic*   ~~strike~~
1 2   3 4 56     78  9 A     B
@1 AsteriskAsterisk "**" PrecedingLineBreak|IsAtLineStart|CanOpen
@2 StringLiteral "bold"
@3 AsteriskAsterisk "**" CanClose
@4 StringLiteral " "
@5 AsteriskToken "*" CanOpen
@6 StringLiteral "italic"
@7 AsteriskToken "*" CanClose
@8 StringLiteral " "
@9 TildeTilde "~~"
@A StringLiteral "strike"
@B TildeTilde "~~"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('emphasis with tab and multiple space separation', () => {
      // First, let's create a simpler test to see what tokens are actually produced
      const debugTest = `
*first*
12    3
@1 AsteriskToken "*" PrecedingLineBreak|IsAtLineStart|CanOpen
@2 StringLiteral "first"
@3 AsteriskToken "*" CanClose`;
      expect(verifyTokens(debugTest)).toBe(debugTest);

      // Now let's build up to the more complex test step by step
      const tokenTest = `
*first*\t\t**second**   third
12    34 5 6     7 8
@1 AsteriskToken "*" PrecedingLineBreak|IsAtLineStart|CanOpen
@2 StringLiteral "first"
@3 AsteriskToken "*" CanClose
@4 StringLiteral " "
@5 AsteriskAsterisk "**" CanOpen
@6 StringLiteral "second"
@7 AsteriskAsterisk "**" CanClose
@8 StringLiteral " third"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('nested and adjacent emphasis patterns', () => {
      const tokenTest = `
text **bold *nested* bold** more
1    2 3    45     67    8 9
@1 StringLiteral "text " PrecedingLineBreak|IsAtLineStart
@2 AsteriskAsterisk "**" CanOpen
@3 StringLiteral "bold "
@4 AsteriskToken "*" CanOpen
@5 StringLiteral "nested"
@6 AsteriskToken "*" CanClose
@7 StringLiteral " bold"
@8 AsteriskAsterisk "**" CanClose
@9 StringLiteral " more"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('emphasis at line boundaries preserves logical separation', () => {
      const tokenTest = `
**start** and **end**
1 2    3 4    5 6  7
@1 AsteriskAsterisk "**" PrecedingLineBreak|IsAtLineStart|CanOpen
@2 StringLiteral "start"
@3 AsteriskAsterisk "**" CanClose
@4 StringLiteral " and"
@5 AsteriskAsterisk "**" CanOpen
@6 StringLiteral "end"
@7 AsteriskAsterisk "**" CanClose`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });
});
