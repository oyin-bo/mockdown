/**
 * Tests for Stage 3: Inline Formatting (Bold, Italic, Code)
 * Using Scanner2 Testing Infrastructure
 * 
 * Following Stage 2 plan: Always use the same variable to pass to expect and toBe.
 * Do not pass two string literals separately.
 */

import { describe, test, expect } from 'vitest';
import { verifyTokens } from './verify-tokens.js';
import { createScanner } from '../scanner/scanner.js';
import { SyntaxKind } from '../scanner/token-types.js';

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
    test('line-start text with excessive whitespace gets normalized into a single StringLiteral', () => {
      const tokenTest = `
  Text\twith\t\tmultiple   spaces  
1
@1 StringLiteral "Text with multiple spaces"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('line-start after whitespace trivia gets normalized', () => {
      const tokenTest = `
  Text\twith\t\tmultiple   spaces
1
@1 StringLiteral "Text with multiple spaces"`;
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
1
@1 StringLiteral "Leading spaces first"`;
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

  describe('Extended normalisation inputs (Phase 0.0) - inline formatting area', () => {
    test('This is *emphasised* and **strong**', () => {
      const tokenTest = `
This is *emphasised* text and **strong** emphasis
1
@1 StringLiteral "This is "
`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('underscore emphasis and strong preserved', () => {
      const tokenTest = `
Underscore_emphasis_ and __strong__
1
@1 StringLiteral "Underscore_emphasis"
`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('inline code span preserved (first literal)', () => {
      const tokenTest = `"` + `
Inline ` + "`code span`" + ` with surrounding spaces
1
@1 StringLiteral "Inline "
`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('escaped asterisk preserved (first literal)', () => {
      const tokenTest = `
Escaped asterisk \\*not emphasis\\*
1
@1 StringLiteral "Escaped asterisk \\\\"
`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('html entities and punctuation (first literal)', () => {
      const tokenTest = `
HTML entity &copy; &hellip; &mdash;
1
@1 StringLiteral "HTML entity "
`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('emoji sequences preserved', () => {
      const tokenTest = `
Emoji sequences: 😀😁😂
1
@1 StringLiteral "Emoji sequences: 😀😁😂"
`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('math symbols preserved', () => {
      const tokenTest = `
Mathematical symbols: ≤ ≥ ≈ ≡
1
@1 StringLiteral "Mathematical symbols: ≤ ≥ ≈ ≡"
`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('percent sign and percent-encoded preserved', () => {
      const tokenTest = `
Percent % sign and percent-encoded %25
1
@1 StringLiteral "Percent % sign and percent-encoded %25"
`;
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
@1 StringLiteral "text " PrecedingLineBreak|IsAtLineStart
@2 AsteriskAsterisk "**" CanOpen
@3 StringLiteral "bold"
@4 AsteriskAsterisk "**" CanClose`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('start **bold** end produces correct tokens with both spaces preserved', () => {
      const tokenTest = `
start **bold** end
1     2 3   4 5
@1 StringLiteral "start " PrecedingLineBreak|IsAtLineStart
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
12     3 4 5       6
@1 AsteriskToken "*" PrecedingLineBreak|IsAtLineStart|CanOpen
@2 StringLiteral "first"
@3 StringLiteral
@4 AsteriskAsterisk "**" CanOpen
@5 StringLiteral "second"
@6 StringLiteral " third"`;
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
@4 StringLiteral " and "
@5 AsteriskAsterisk "**" CanOpen
@6 StringLiteral "end"
@7 AsteriskAsterisk "**" CanClose`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });
});
