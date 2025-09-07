/**
 * Tests for Stage 7: Tables
 * Following the annotated markdown testing approach used in other test files
 */

import { describe, test, expect } from 'vitest';
import { verifyTokens } from './verify-tokens.js';

describe('Stage 7: Tables', () => {
  describe('Table header detection', () => {
    test('simple table header with pipes', () => {
      const tokenTest = `
| Header 1 | Header 2 |
1          3
@1 PipeToken
@3 PipeToken`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('table header without leading pipe', () => {
      const tokenTest = `
Header 1 | Header 2 |
         1
@1 PipeToken`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });

  describe('Table alignment row', () => {
    test('basic alignment row', () => {
      const tokenTest = `
|---|---|
1   2   3
@1 PipeToken
@2 MinusToken
@3 PipeToken`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('alignment with colons', () => {
      const tokenTest = `
|:--|:-:|--:|
1   2   3
@1 PipeToken
@2 ColonToken
@3 ColonToken`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('left align, center align, right align', () => {
      const tokenTest = `
:--|:-:|--:
1  2   3
@1 ColonToken
@2 ColonToken
@3 MinusToken`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });

  describe('Invalid table patterns', () => {
    test('no pipes - should be paragraph', () => {
      const tokenTest = `
Header 1 Header 2
1
@1 StringLiteral`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });
});