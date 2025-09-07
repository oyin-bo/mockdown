/**
 * Tests for Stage 8: Extensions Group A (Code & Math)
 * Following the annotated markdown testing approach used in other test files
 */

import { describe, test, expect } from 'vitest';
import { verifyTokens } from './verify-tokens.js';

describe('Stage 8: Extensions Group A (Code & Math)', () => {
  describe('Math inline delimiters', () => {
    test('single dollar for inline math', () => {
      const tokenTest = `
$x$
1 2
@1 MathInlineDelimiter
@2 MathInlineDelimiter`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('math with text content', () => {
      const tokenTest = `
Text $E = mc^2$ more text
     6         15
@6 MathInlineDelimiter
@15 MathInlineDelimiter`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });

  describe('Math block delimiters', () => {
    test('double dollar for block math', () => {
      const tokenTest = `
$$
1
@1 MathBlockDelimiter`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('block math delimiters on same line', () => {
      const tokenTest = `
$$ E = mc^2 $$
1          13
@1 MathBlockDelimiter
@13 MathBlockDelimiter`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });

  describe('Fenced code blocks', () => {
    test('triple backtick code fence', () => {
      const tokenTest = `
\`\`\`
1
@1 CodeFence`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('triple tilde code fence', () => {
      const tokenTest = `
~~~
1
@1 CodeFence`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('code fence with language', () => {
      const tokenTest = `
\`\`\`javascript
1
@1 CodeFence`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });
});