/**
 * Tests for Stage 6: Lists
 * Following the annotated markdown testing approach used in other test files
 */

import { describe, test, expect } from 'vitest';
import { verifyTokens } from './verify-tokens.js';

describe('Stage 6: Lists', () => {
  describe('Unordered list markers', () => {
    test('dash marker', () => {
      const tokenTest = `
- item
1
@1 ListMarkerUnordered`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('asterisk marker', () => {
      const tokenTest = `
* item
1
@1 ListMarkerUnordered`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('plus marker', () => {
      const tokenTest = `
+ item
1
@1 ListMarkerUnordered`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });

  describe('Ordered list markers', () => {
    test('numbered with dot', () => {
      const tokenTest = `
1. item
1
@1 ListMarkerOrdered`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('numbered with parenthesis', () => {
      const tokenTest = `
1) item
1
@1 ListMarkerOrdered`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('multi-digit number', () => {
      const tokenTest = `
123. item
1
@1 ListMarkerOrdered`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });

  describe('Invalid list patterns', () => {
    test('dash without space', () => {
      const tokenTest = `
-item
1
@1 StringLiteral`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('number without space', () => {
      const tokenTest = `
1.item
1
@1 StringLiteral`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('too many digits', () => {
      const tokenTest = `
1234567890. item
1
@1 StringLiteral`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });
});