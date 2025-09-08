import { describe, test, expect } from 'vitest';

import { verifyTokens } from './verify-tokens.js';

describe('Stage 7: Tables', () => {
  describe('Table header detection', () => {
    test('isolated pipe line should be paragraph (no table confirmation)', () => {
      const tokenTest = `
| Header 1 | Header 2 |
1
@1 StringLiteral "| Header 1 | Header 2 |"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('pipe line without leading pipe should be paragraph', () => {
      const tokenTest = `
Header 1 | Header 2 |
1
@1 StringLiteral "Header 1 | Header 2 |"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });

  describe('Table alignment row', () => {
    test('isolated alignment row should be paragraph (no table confirmation)', () => {
      const tokenTest = `
|---|---|
1
@1 StringLiteral "|---|---|"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('isolated alignment with colons should be paragraph', () => {
      const tokenTest = `
|:--|:-:|--:|
1
@1 StringLiteral "|:--|:-:|--:|"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('isolated left align, center align, right align should be paragraph', () => {
      const tokenTest = `
:--|:-:|--:
1
@1 StringLiteral ":--|:-:|--:"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });

  describe('Invalid table patterns', () => {
    test('no pipes - should be paragraph', () => {
      const tokenTest = `
Header 1 Header 2
1
@1 StringLiteral "Header 1 Header 2"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });

  describe('Valid table structures (TODO: implement proper table disambiguation)', () => {
    test('complete table should currently be parsed as separate paragraphs', () => {
      // TODO: This test should change once proper table disambiguation is implemented
      // For now, it documents that each table line is treated as a separate paragraph
      const tokenTest = `
| Name | Age |
1
@1 StringLiteral "| Name | Age |"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });
});