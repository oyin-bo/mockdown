/**
 * Tests for Stage 6: Lists
 * Following the annotated markdown testing approach used in other test files
 */

import { describe, test, expect } from 'vitest';
import { verifyTokens } from './verify-tokens.js';

describe('Stage 6: Lists', () => {
  describe('Unordered list markers', () => {
    test('dash marker with text content', () => {
      const tokenTest = `
- item
1 2
@1 ListMarkerUnordered "- "
@2 StringLiteral "item"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('asterisk marker with text content', () => {
      const tokenTest = `
* item
1 2
@1 ListMarkerUnordered "* "
@2 StringLiteral "item"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('plus marker with text content', () => {
      const tokenTest = `
+ item
1 2
@1 ListMarkerUnordered "+ "
@2 StringLiteral "item"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('list marker with multiple spaces before text', () => {
      const tokenTest = `
-    content with extra spaces
1    2
@1 ListMarkerUnordered "- "
@2 StringLiteral "content with extra spaces"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });

  describe('Ordered list markers', () => {
    test('numbered with dot and text', () => {
      const tokenTest = `
1. item
1  2
@1 ListMarkerOrdered "1. "
@2 StringLiteral "item"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('numbered with parenthesis and text', () => {
      const tokenTest = `
1) item
1  2
@1 ListMarkerOrdered "1) "
@2 StringLiteral "item"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('multi-digit number with text', () => {
      const tokenTest = `
123. item
1
@1 ListMarkerOrdered "123."`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('ordered list with extra whitespace after marker', () => {
      const tokenTest = `
1.     spaced content
1      2
@1 ListMarkerOrdered "1. "
@2 StringLiteral "spaced content"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });

  describe('Invalid list patterns', () => {
    test('dash without space', () => {
      const tokenTest = `
-item
1
@1 StringLiteral "-item"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('number without space', () => {
      const tokenTest = `
1.item
1
@1 StringLiteral "1.item"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('too many digits (over 9)', () => {
      const tokenTest = `
1234567890. item
1
@1 StringLiteral "1234567890. item"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('number with extra spaces at start (indented)', () => {
      const tokenTest = `
    1. indented list
1
@1 StringLiteral "1. indented list"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });

  describe('Nested and complex list patterns', () => {
    test('nested unordered list with indentation', () => {
      const tokenTest = `
  - nested item
1 2 3
@1 WhitespaceTrivia "  "
@2 ListMarkerUnordered "- "
@3 StringLiteral "nested item"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('mixed list markers', () => {
      const tokenTest = `
- first item
+ second item  
1 2      3 4
@1 ListMarkerUnordered "- "
@2 StringLiteral "first item"
@3 ListMarkerUnordered "+ "
@4 StringLiteral "second item"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });
});