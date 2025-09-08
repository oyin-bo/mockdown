import { describe, test, expect } from 'vitest';

import { verifyTokens } from './verify-tokens.js';

describe('Stage 8: Extensions Group A (Code & Math)', () => {
  describe('Math inline delimiters', () => {
    test('single dollar for inline math', () => {
      const tokenTest = `
$x$
1 2
@1 MathInlineDelimiter "$"
@2 MathInlineDelimiter "$"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('math with text content', () => {
      const tokenTest = `
Text $E = mc^2$ more text
     6         F
@6 MathInlineDelimiter "$"
@F MathInlineDelimiter "$"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('single stray dollar should be text', () => {
      const tokenTest = `
Just a $ sign
1
@1 StringLiteral "Just a $ sign"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('odd number of dollars - should parse first pair and leave remainder as text', () => {
      const tokenTest = `
$math$ and $
1    2
@1 MathInlineDelimiter "$"
@2 MathInlineDelimiter "$"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('escaped dollar should be text', () => {
      const tokenTest = `
\\$not math\\$
1
@1 StringLiteral`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('inline math cannot span multiple lines', () => {
      const tokenTest = `
$incomplete
1
@1 StringLiteral "$incomplete"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('empty block math', () => {
      const tokenTest = `
$$
1
@1 MathBlockDelimiter "$$"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('nested inline math not allowed', () => {
      const tokenTest = `
$outer $inner$ text$
1
@1 StringLiteral "$outer $inner$ text$"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });

  describe('Math block delimiters', () => {
    test('double dollar for block math', () => {
      const tokenTest = `
$$
1
@1 MathBlockDelimiter "$$"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('block math delimiters on same line', () => {
      const tokenTest = `
$$ E = mc^2 $$
1           2
@1 MathBlockDelimiter "$$"
@2 MathBlockDelimiter "$$"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('unmatched opening block math delimiter', () => {
      const tokenTest = `
$$
1
incomplete block
@1 MathBlockDelimiter "$$"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('disbalanced dollar count - three dollars should be treated as text', () => {
      const tokenTest = `
$$$
1
@1 StringLiteral "$$$"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('block math with extra whitespace', () => {
      const tokenTest = `
$$  content  $$
1            2
@1 MathBlockDelimiter "$$"
@2 MathBlockDelimiter "$$"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('block math spans multiple lines', () => {
      const tokenTest = `
$$
1
@1 MathBlockDelimiter "$$"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });

  describe('Fenced code blocks', () => {
    test('triple backtick code fence', () => {
      const tokenTest = `
\`\`\`
1
@1 CodeFence "\`\`\`"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('triple tilde code fence', () => {
      const tokenTest = `
~~~
1
@1 CodeFence "~~~"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('code fence with language', () => {
      const tokenTest = `
\`\`\`javascript
1
@1 CodeFence "\`\`\`javascript"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('code fence with language and attributes', () => {
      const tokenTest = `
\`\`\`javascript {.highlight}
1
@1 CodeFence "\`\`\`javascript {.highlight}"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('unmatched opening code fence', () => {
      const tokenTest = `
\`\`\`
1
code content
@1 CodeFence "\`\`\`"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('closing fence must match length', () => {
      const tokenTest = `
\`\`\`\`
1
@1 CodeFence "\`\`\`\`"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('insufficient backticks for fence (only 2)', () => {
      const tokenTest = `
\`\`code\`\`
1 2   3
@1 InlineCodeDelimiter "\`\`"
@2 StringLiteral "code"
@3 InlineCodeDelimiter "\`\`"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('tildes and backticks cannot be mixed', () => {
      const tokenTest = `
~~~
1
code
\`\`\`
@1 CodeFence "~~~"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('indented code fence (up to 3 spaces allowed)', () => {
      const tokenTest = `
   \`\`\`
1
@1 CodeFence "   \`\`\`"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });
});