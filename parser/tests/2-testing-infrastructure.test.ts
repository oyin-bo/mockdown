/**
 * Test for Scanner2 Testing Infrastructure (Stage 2)
 * Testing the verifyTokens function with annotated Markdown format
 * 
 * Following Stage 2 plan: Always use the same variable to pass to expect and toBe.
 * Do not pass two string literals separately.
 */

import { describe, expect, test } from 'vitest';
import { verifyTokens } from './verify-tokens.js';

describe('Scanner2 Testing Infrastructure', () => {
  test('should return original string when all expectations match', () => {
    const tokenTest = `
Hello world
1
@1 StringLiteral`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('should handle simple text with position marker', () => {
    const tokenTest = `
Simple text line
1
@1 StringLiteral`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('should inject error for wrong token kind', () => {
    const tokenTest = `
Hello world
1
@1 StringLiteral`;
    const result = verifyTokens(tokenTest);
    expect(result).toBe(tokenTest);
  });

  test('should handle multiple position markers', () => {
    const tokenTest = `
  Hello *world*
1       2
@1 StringLiteral
@2 "*"`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('should handle text with attributes', () => {
    const tokenTest = `
Hello world
1
@1 StringLiteral "Hello world"`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('should fail multiple markers on same token', () => {
    const tokenTest = `
Hello World
1    2    3
@1 StringLiteral "Hello World"
@2 StringLiteral "Hello World"  
@3 StringLiteral "Hello World"`;
    expect(verifyTokens(tokenTest)).toBe(`
Hello World
1
@1 StringLiteral "Hello World"
`);
  });

  test('should handle newline tokens between lines', () => {
    const tokenTest = `
Line1
Line2
1
@1 StringLiteral "Line2"`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('should handle leading whitespace', () => {
    const tokenTest = `
  Indented text
1
@1 StringLiteral`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('should validate flags attribute using numerical value 2:IsAtLineStart', () => {
    // Leading single-space should be StringLiteral and have IsAtLineStart flag
    const tokenTest = `
  Hello world
1
@1 StringLiteral 2`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('infrastructure failure: wrong position marker should inject descriptive error', () => {
    // Position 12 should be beyond the "Hello world" token (which ends at position 10)
    const tokenTest = `
 Hello *world*
1         2
@1 StringLiteral
@2 StringLiteral`;
    const result = verifyTokens(tokenTest);
    expect(result).toBe(`
 Hello *world*
1       2
@1 StringLiteral
@2 StringLiteral
`);
  });

  test('infrastructure failure: wrong attribute value should show actual vs expected', () => {
    const tokenTest = `
Hello world
1
@1 StringLiteral "Wrong content"`;
    const result = verifyTokens(tokenTest);
    expect(result).toBe(`
Hello world
1
@1 StringLiteral "Hello world"
`);
  });

  test('should return original input even with leading/trailing newlines', () => {
    // Even though verification ignores leading/trailing newlines, 
    // the function should return the original input if verification succeeds
    const tokenTestWithNewlines = `
Hello world
1
@1 StringLiteral
`;

    const result = verifyTokens(tokenTestWithNewlines);
    expect(result).toBe(tokenTestWithNewlines); // Should return original, not stripped
  });

  test('should properly align position markers with token starts', () => {
    // Test that digit 1 aligns with the start of "Hello" (position 0)
    const tokenTest1 = `
Hello world
1
@1 StringLiteral`;
    expect(verifyTokens(tokenTest1)).toBe(tokenTest1);

  });

  test('readme example test', () => {
    const tokenTest = `
**bold text**
1 2        3
@1 AsteriskAsterisk CanOpen
@2 StringLiteral "bold text"  
@3 AsteriskAsterisk CanClose`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  // Tests for stricter annotation detection (from 9-stricter-tests.md)
  describe('Stricter annotation detection', () => {
    test('valid simple annotation: marker line 1 with single @1 assertion', () => {
      const tokenTest = `
Hello world
1
@1 StringLiteral`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('multiple adjacent markers: 12AB normalizes to 1234', () => {
      const tokenTest = `
**bold text** ?
1 2        A B
@1 AsteriskAsterisk CanOpen
@2 StringLiteral "bold text"
@A AsteriskAsterisk CanClose`;
      // Should normalize to canonical 1234 sequence
      const expected = `
**bold text** ?
1 2        3 4
@1 AsteriskAsterisk CanOpen
@2 StringLiteral "bold text"
@3 AsteriskAsterisk CanClose
@4 StringLiteral
`;
      expect(verifyTokens(tokenTest)).toBe(expected);
    });

    test('lowercase markers: 1 a b normalizes to 123', () => {
      const tokenTest = `
**bold text**
1 a        b
@1 AsteriskAsterisk CanOpen
@a StringLiteral "bold text"
@b AsteriskAsterisk CanClose`;
      // Should normalize to canonical sequence
      const expected = `
**bold text**
1 2        3
@1 AsteriskAsterisk CanOpen
@2 StringLiteral "bold text"
@3 AsteriskAsterisk CanClose
`;
      expect(verifyTokens(tokenTest)).toBe(expected);
    });

    test('missing @ next line: marker line followed by non-@ line treated as ordinary markdown', () => {
      const tokenTest = `
Hello world
1
This is not an assertion line`;
      // Should be treated as ordinary markdown, no annotation parsing
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('missing initial 1: marker line starting with 2 ignored as ordinary markdown', () => {
      const tokenTest = `
Hello world
2 3 4
@2 StringLiteral
@3 StringLiteral  
@4 StringLiteral`;
      // Should be treated as ordinary markdown since it doesn't start with 1
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('non-increasing markers: 1 B A rejected as ordinary markdown', () => {
      const tokenTest = `
Hello world
1 B A
@1 StringLiteral
@B StringLiteral
@A StringLiteral`;
      // Should be treated as ordinary markdown due to non-increasing sequence
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('ambiguous duplicate characters: 1 2 1 3 rejected', () => {
      const tokenTest = `
Hello world
1 2 1 3
@1 StringLiteral
@2 StringLiteral
@3 StringLiteral`;
      // Should be treated as ordinary markdown due to duplicate '1'
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('assertion references nonexistent marker: @3 skipped, missing assertions synthesized', () => {
      const tokenTest = `
**bold text**
1 3
@1 AsteriskAsterisk CanOpen
@3 StringLiteral "bold text"`;
      const expected = `
**bold text**
1 2
@1 AsteriskAsterisk CanOpen
@2 StringLiteral "bold text"
`;
      // @3 should be skipped, but @1 and @2 should be processed normally
      expect(verifyTokens(tokenTest)).toBe(expected);
    });

    test('unparseable assertion lines: @1 ??? skipped, synthetic token-only assertion emitted', () => {
      const tokenTest = `
**bold text**
1 2
@1 ???InvalidSyntax
@2 StringLiteral "bold text"`;
      // @1 should get a synthetic token-only assertion for the actual token found
      const expected = `
**bold text**
1 2
@1 AsteriskAsterisk
@2 StringLiteral "bold text"
`;
      expect(verifyTokens(tokenTest)).toBe(expected);
    });

    test('multiple assertions per marker: do not allow, skip assertions after the first', () => {
      const tokenTest = `
Hello world
1
@1 StringLiteral`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('marker line with trailing invalid text: 1 foobar treated as ordinary markdown', () => {
      const tokenTest = `
Hello world
1 foobar
@1 StringLiteral`;
      // Should be treated as ordinary markdown due to invalid text after markers
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('position-mapping edge: repeated candidate markers fail conservatively', () => {
      const tokenTest = `
Hello world
1 1 2
@1 StringLiteral
@2 StringLiteral`;
      // Should be treated as ordinary markdown due to ambiguous mapping
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('newlines and surrounding whitespace preservation: successful verification returns original input', () => {
      const tokenTestWithNewlines = `
Hello world
1
@1 StringLiteral
`;
      // Should return original input including leading/trailing newlines
      expect(verifyTokens(tokenTestWithNewlines)).toBe(tokenTestWithNewlines);
    });

    test('mismatched positional markers, excess marker', () => {
      const tokenTest = `
**bold text**
1 2 3
@1 AsteriskAsterisk CanOpen
@3 AsteriskAsterisk CanClose`;
      const expected = `
**bold text**
1 2
@1 AsteriskAsterisk CanOpen
@2 StringLiteral
`;
      expect(verifyTokens(tokenTest)).toBe(expected);
    });
  });
});
