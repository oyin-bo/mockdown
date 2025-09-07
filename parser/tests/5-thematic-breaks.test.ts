/**
 * Tests for Stage 5: Thematic Breaks
 * Following the annotated markdown testing approach used in other test files
 */

import { describe, test, expect } from 'vitest';
import { verifyTokens } from './verify-tokens.js';

describe('Stage 5: Thematic Breaks', () => {
  describe('Basic thematic break patterns', () => {
    test('triple asterisk', () => {
      const tokenTest = `
***
1
@1 ThematicBreak`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('triple dash', () => {
      const tokenTest = `
---
1
@1 ThematicBreak`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('triple underscore', () => {
      const tokenTest = `
___
1
@1 ThematicBreak`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });

  describe('Extended patterns with spaces', () => {
    test('asterisk with spaces', () => {
      const tokenTest = `
* * *
1
@1 ThematicBreak`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('dash with spaces', () => {
      const tokenTest = `
- - -
1
@1 ThematicBreak`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('underscore with spaces', () => {
      const tokenTest = `
_ _ _
1
@1 ThematicBreak`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });

  describe('More than three characters', () => {
    test('four asterisks', () => {
      const tokenTest = `
****
1
@1 ThematicBreak`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('five dashes with spaces', () => {
      const tokenTest = `
- - - - -
1
@1 ThematicBreak`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });

  describe('Leading spaces allowed', () => {
    test('one space before asterisks', () => {
      const tokenTest = `
 ***
1
@1 ThematicBreak`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('three spaces before dashes', () => {
      const tokenTest = `
   ---
1
@1 ThematicBreak`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });

  describe('Trailing spaces allowed', () => {
    test('asterisks with trailing spaces', () => {
      const tokenTest = `
***   
1
@1 ThematicBreak`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });

  describe('Invalid patterns (not thematic breaks)', () => {
    test('only two asterisks', () => {
      const tokenTest = `
**
1
@1 AsteriskAsterisk`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('only two dashes', () => {
      const tokenTest = `
--
1
@1 StringLiteral "--"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('mixed characters', () => {
      const tokenTest = `
*-*
1
@1 AsteriskToken`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('four spaces of indentation (becomes indented code)', () => {
      const tokenTest = `
    ---
1
@1 StringLiteral "---"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('text before markers', () => {
      const tokenTest = `
text---
1
@1 StringLiteral "text---"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('text after markers', () => {
      const tokenTest = `
---text
1
@1 StringLiteral "---text"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });

  describe('Context flags', () => {
    test('thematic break at line start', () => {
      const tokenTest = `
***
1
@1 ThematicBreak IsAtLineStart`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('thematic break after blank line', () => {
      const tokenTest = `

***
2
@2 ThematicBreak IsAtLineStart|PrecedingLineBreak`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });
});