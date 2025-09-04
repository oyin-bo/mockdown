/**
 * Test for Scanner2 Testing Infrastructure (Stage 2)
 * Testing the verifyTokens function with annotated Markdown format
 * 
 * Following Stage 2 plan: Always use the same variable to pass to expect and toBe.
 * Do not pass two string literals separately.
 */

import { describe, test, expect } from 'vitest';
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
@1 WhitespaceTrivia`;
    const result = verifyTokens(tokenTest);
    expect(result).toBe(`
Hello world
1
@1 StringLiteral
`);
  });

  test('should handle multiple position markers', () => {
    const tokenTest = `
  Hello world
1 2
@1 WhitespaceTrivia
@2 StringLiteral`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('should handle text with attributes', () => {
    const tokenTest = `
Hello world
1
@1 StringLiteral "Hello world"`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('should inject error for wrong attribute value', () => {
    const tokenTest = `
Hello world
1
@1 StringLiteral "Wrong text"`;
    const result = verifyTokens(tokenTest);
    expect(result).toBe(`
Hello world
1
@1 StringLiteral "Hello world"
`);
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
1 2
@1 WhitespaceTrivia
@2 StringLiteral`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('should handle leading whitespace tokens', () => {
    const tokenTest = `
  Hello World
1 2
@1 WhitespaceTrivia
@2 StringLiteral "Hello World"`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('should handle letter position markers', () => {
    const tokenTest = `
Hello world test
A           B
@A StringLiteral
@B StringLiteral`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('should validate flags attribute', () => {
    // WhitespaceTrivia should have IsAtLineStart flag (1 << 1 = 2)
    const tokenTest = `
  Hello world
1
@1 WhitespaceTrivia 2`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('infrastructure failure: wrong position marker should inject descriptive error', () => {
    // Position 12 should be beyond the "Hello world" token (which ends at position 10)
    const tokenTest = `
 Hello world
1      2
@1 WhitespaceTrivia
@2 StringLiteral`;
    const result = verifyTokens(tokenTest);
    expect(result).toBe(`
 Hello world
12
@1 WhitespaceTrivia
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
    
    // Test that digit 1 aligns with the start of whitespace, digit 2 with "Hello"
    // For "  Hello world":
    // Position 0-1: "  " (WhitespaceTrivia)
    // Position 2-12: "Hello world" (StringLiteral)
    const tokenTest2 = `
  Hello world
1 2
@1 WhitespaceTrivia
@2 StringLiteral`;
    expect(verifyTokens(tokenTest2)).toBe(tokenTest2);
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
});
