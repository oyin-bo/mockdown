/**
 * Test for Scanner2 Testing Infrastructure (Stage 2)
 * Testing the verifyTokens function with annotated Markdown format
 */

import { describe, test, expect } from 'vitest';
import { verifyTokens } from '../scanner2.js';

describe('Scanner2 Testing Infrastructure', () => {
  test('should return original string when all expectations match', () => {
    const tokenTest = `Hello world
1
@1 StringLiteral`;
    
    const result = verifyTokens(tokenTest);
    expect(result).toBe(tokenTest);
  });

  test('should handle simple text with position marker', () => {
    const tokenTest = `Simple text line
1
@1 StringLiteral`;
    
    const result = verifyTokens(tokenTest);
    expect(result).toBe(tokenTest);
  });

  test('should inject error for wrong token kind', () => {
    const tokenTest = `Hello world
1
@1 WhitespaceTrivia`;
    
    const result = verifyTokens(tokenTest);
    expect(result).toContain("ERROR: Expected 'WhitespaceTrivia' but got 'StringLiteral'");
    expect(result).not.toBe(tokenTest);
  });

  test('should handle multiple position markers', () => {
    const tokenTest = `  Hello world
1 2
@1 WhitespaceTrivia
@2 StringLiteral`;
    
    const result = verifyTokens(tokenTest);
    expect(result).toBe(tokenTest);
  });

  test('should handle text with attributes', () => {
    const tokenTest = `Hello world
1
@1 StringLiteral text: "Hello world"`;
    
    const result = verifyTokens(tokenTest);
    expect(result).toBe(tokenTest);
  });

  test('should inject error for wrong attribute value', () => {
    const tokenTest = `Hello world
1
@1 StringLiteral text: "Wrong text"`;
    
    const result = verifyTokens(tokenTest);
    expect(result).toContain('ERROR: Attribute \'text\' expected "Wrong text" but got "Hello world"');
    expect(result).not.toBe(tokenTest);
  });

  test('should handle multiple markers on same token', () => {
    const tokenTest = `Hello World
1    2    3
@1 StringLiteral text: "Hello World"
@2 StringLiteral text: "Hello World"  
@3 StringLiteral text: "Hello World"`;
    
    const result = verifyTokens(tokenTest);
    expect(result).toBe(tokenTest);
  });

  test('should handle newline tokens between lines', () => {
    const tokenTest = `Line1
Line2
1
@1 StringLiteral text: "Line2"`;
    
    const result = verifyTokens(tokenTest);
    expect(result).toBe(tokenTest);
  });

  test('should handle leading whitespace', () => {
    const tokenTest = `  Indented text
1 2
@1 WhitespaceTrivia
@2 StringLiteral`;
    
    const result = verifyTokens(tokenTest);
    expect(result).toBe(tokenTest);
  });

  test('should inject error for missing position marker', () => {
    const tokenTest = `Hello
World
1           2
@1 StringLiteral
@2 StringLiteral`;
    
    const result = verifyTokens(tokenTest);
    expect(result).toContain("ERROR: No token found at position marked by '2'");
    expect(result).not.toBe(tokenTest);
  });

  test('should handle leading whitespace tokens', () => {
    const tokenTest = `  Hello World
1 2
@1 WhitespaceTrivia
@2 StringLiteral text: "Hello World"`;
    
    const result = verifyTokens(tokenTest);
    expect(result).toBe(tokenTest);
  });

  test('should handle letter position markers', () => {
    const tokenTest = `Hello world test
A           B
@A StringLiteral
@B StringLiteral`;
    
    const result = verifyTokens(tokenTest);
    expect(result).toBe(tokenTest);
  });

  test('should validate flags attribute', () => {
    const tokenTest = `  Hello world
1
@1 WhitespaceTrivia flags: 2`;
    
    const result = verifyTokens(tokenTest);
    // WhitespaceTrivia should have IsAtLineStart flag (1 << 1 = 2)
    expect(result).toBe(tokenTest);
  });
});