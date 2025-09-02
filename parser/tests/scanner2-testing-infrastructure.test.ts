/**
 * Test for Scanner2 Testing Infrastructure (Stage 2)
 * Testing the verifyTokens function with annotated Markdown format
 */

import { describe, test, expect } from 'vitest';
import { verifyTokens } from './scanner2-testing-infrastructure.js';
import { createScanner2 } from '../scanner2.js';

describe('Scanner2 Testing Infrastructure', () => {
  test('should return original string when all expectations match', () => {
    const tokenTest = `
Hello world
1
@1 StringLiteral`;
    
    const expected = `Hello world
1
@1 StringLiteral`;
    
    const result = verifyTokens(tokenTest);
    expect(result).toBe(expected);
  });

  test('should handle simple text with position marker', () => {
    const tokenTest = `
Simple text line
1
@1 StringLiteral`;
    
    const expected = `Simple text line
1
@1 StringLiteral`;
    
    const result = verifyTokens(tokenTest);
    expect(result).toBe(expected);
  });

  test('should inject error for wrong token kind', () => {
    const tokenTest = `
Hello world
1
@1 WhitespaceTrivia`;
    
    const result = verifyTokens(tokenTest);
    expect(result).toContain("ERROR: Expected 'WhitespaceTrivia' but got 'StringLiteral'");
    expect(result).not.toBe(tokenTest);
  });

  test('should handle multiple position markers', () => {
    const tokenTest = `
  Hello world
1 2
@1 WhitespaceTrivia
@2 StringLiteral`;
    
    const expected = `  Hello world
1 2
@1 WhitespaceTrivia
@2 StringLiteral`;
    
    const result = verifyTokens(tokenTest);
    expect(result).toBe(expected);
  });

  test('should handle text with attributes', () => {
    const tokenTest = `
Hello world
1
@1 StringLiteral text: "Hello world"`;
    
    const expected = `Hello world
1
@1 StringLiteral text: "Hello world"`;
    
    const result = verifyTokens(tokenTest);
    expect(result).toBe(expected);
  });

  test('should inject error for wrong attribute value', () => {
    const tokenTest = `
Hello world
1
@1 StringLiteral text: "Wrong text"`;
    
    const result = verifyTokens(tokenTest);
    expect(result).toContain('ERROR: Attribute \'text\' expected "Wrong text" but got "Hello world"');
    expect(result).not.toBe(tokenTest);
  });

  test('should handle multiple markers on same token', () => {
    const tokenTest = `
Hello World
1    2    3
@1 StringLiteral text: "Hello World"
@2 StringLiteral text: "Hello World"  
@3 StringLiteral text: "Hello World"`;
    
    const expected = `Hello World
1    2    3
@1 StringLiteral text: "Hello World"
@2 StringLiteral text: "Hello World"  
@3 StringLiteral text: "Hello World"`;
    
    const result = verifyTokens(tokenTest);
    expect(result).toBe(expected);
  });

  test('should handle newline tokens between lines', () => {
    const tokenTest = `
Line1
Line2
1
@1 StringLiteral text: "Line2"`;
    
    const expected = `Line1
Line2
1
@1 StringLiteral text: "Line2"`;
    
    const result = verifyTokens(tokenTest);
    expect(result).toBe(expected);
  });

  test('should handle leading whitespace', () => {
    const tokenTest = `
  Indented text
1 2
@1 WhitespaceTrivia
@2 StringLiteral`;
    
    const expected = `  Indented text
1 2
@1 WhitespaceTrivia
@2 StringLiteral`;
    
    const result = verifyTokens(tokenTest);
    expect(result).toBe(expected);
  });

  test('should inject error for missing position marker', () => {
    const tokenTest = `
Hello
World
1           2
@1 StringLiteral
@2 StringLiteral`;
    
    const result = verifyTokens(tokenTest);
    expect(result).toContain("ERROR: No token found at position marked by '2'");
    expect(result).not.toBe(tokenTest);
  });

  test('should handle leading whitespace tokens', () => {
    const tokenTest = `
  Hello World
1 2
@1 WhitespaceTrivia
@2 StringLiteral text: "Hello World"`;
    
    const expected = `  Hello World
1 2
@1 WhitespaceTrivia
@2 StringLiteral text: "Hello World"`;
    
    const result = verifyTokens(tokenTest);
    expect(result).toBe(expected);
  });

  test('should handle letter position markers', () => {
    const tokenTest = `
Hello world test
A           B
@A StringLiteral
@B StringLiteral`;
    
    const expected = `Hello world test
A           B
@A StringLiteral
@B StringLiteral`;
    
    const result = verifyTokens(tokenTest);
    expect(result).toBe(expected);
  });

  test('should validate flags attribute', () => {
    const tokenTest = `
  Hello world
1
@1 WhitespaceTrivia flags: 2`;
    
    const expected = `  Hello world
1
@1 WhitespaceTrivia flags: 2`;
    
    const result = verifyTokens(tokenTest);
    // WhitespaceTrivia should have IsAtLineStart flag (1 << 1 = 2)
    expect(result).toBe(expected);
  });

  test('infrastructure failure: wrong position marker should inject descriptive error', () => {
    // Position 12 should be beyond the "Hello world" token (which ends at position 10)
    const tokenTest = `
Hello world
            1
@1 StringLiteral`;
    
    const result = verifyTokens(tokenTest);
    expect(result).toContain("ERROR: No token found at position marked by '1'");
    expect(result).not.toBe(tokenTest);
    
    // The error should be injected below the expectation line
    const lines = result.split('\n');
    const expectationLineIndex = lines.findIndex(line => line.includes('@1 StringLiteral'));
    expect(expectationLineIndex).toBeGreaterThan(-1);
    expect(lines[expectationLineIndex + 1]).toContain("ERROR: No token found at position marked by '1'");
  });

  test('infrastructure failure: wrong attribute value should show actual vs expected', () => {
    const tokenTest = `
Hello world
1
@1 StringLiteral text: "Wrong content"`;
    
    const result = verifyTokens(tokenTest);
    expect(result).toContain('ERROR: Attribute \'text\' expected "Wrong content" but got "Hello world"');
    expect(result).not.toBe(tokenTest);
    
    // Verify error is in the right place
    const lines = result.split('\n');
    const expectationLineIndex = lines.findIndex(line => line.includes('@1 StringLiteral text:'));
    expect(expectationLineIndex).toBeGreaterThan(-1);
    expect(lines[expectationLineIndex + 1]).toContain('ERROR: Attribute \'text\' expected "Wrong content" but got "Hello world"');
  });

  test('infrastructure failure: unknown attribute should produce error', () => {
    const tokenTest = `
Hello world
1
@1 StringLiteral unknownAttr: "value"`;
    
    const result = verifyTokens(tokenTest);
    expect(result).toContain("ERROR: Unknown attribute 'unknownAttr' for token validation");
    expect(result).not.toBe(tokenTest);
  });

  test('should strip single leading/trailing newlines', () => {
    const tokenTestWithNewlines = `
Hello world
1
@1 StringLiteral
`;
    
    const tokenTestClean = `Hello world
1
@1 StringLiteral`;
    
    const result = verifyTokens(tokenTestWithNewlines);
    expect(result).toBe(tokenTestClean);
  });

  test('should properly align position markers with token starts', () => {
    // Test that digit 1 aligns with the start of "Hello" (position 0)
    const tokenTest = `
Hello world
1
@1 StringLiteral`;
    
    const expected = `Hello world
1
@1 StringLiteral`;
    
    const result = verifyTokens(tokenTest);
    expect(result).toBe(expected);
    
    // Test that digit 1 aligns with the start of whitespace, digit 2 with "Hello"
    // For "  Hello world":
    // Position 0-1: "  " (WhitespaceTrivia)
    // Position 2-12: "Hello world" (StringLiteral)
    const tokenTest2 = `
  Hello world
1 2
@1 WhitespaceTrivia
@2 StringLiteral`;
    
    const expected2 = `  Hello world
1 2
@1 WhitespaceTrivia
@2 StringLiteral`;
    
    const result2 = verifyTokens(tokenTest2);
    expect(result2).toBe(expected2);
  });
});