/**
 * Tests for Scanner2 Stage 2 Testing Infrastructure
 * Verifies that the annotated test format works correctly
 */

import { describe, test, expect } from 'vitest';
import { verifyTokens } from './scanner2-test-infrastructure.js';

describe('Scanner2 Stage 2: Testing Infrastructure', () => {
  
  test('should pass when token assertions are correct', () => {
    const annotatedTest = `Hello World
@0 StringLiteral
@11 EndOfFileToken`;
    
    const result = verifyTokens(annotatedTest);
    expect(result).toBe(annotatedTest);
  });
  
  test('should inject error when token type is wrong', () => {
    const annotatedTest = `Hello World
@0 WhitespaceTrivia`;
    
    const result = verifyTokens(annotatedTest);
    expect(result).toContain('ERROR: At position 0, expected WhitespaceTrivia but got StringLiteral');
  });
  
  test('should handle multiple tokens correctly', () => {
    const annotatedTest = `Line1
Line2
@0 StringLiteral
@5 NewLineTrivia
@6 StringLiteral
@11 EndOfFileToken`;
    
    const result = verifyTokens(annotatedTest);
    expect(result).toBe(annotatedTest);
  });
  
  test('should handle whitespace tokens', () => {
    const annotatedTest = `  Hello
@0 WhitespaceTrivia
@2 StringLiteral
@7 EndOfFileToken`;
    
    const result = verifyTokens(annotatedTest);
    expect(result).toBe(annotatedTest);
  });
  
  test('should verify token attributes', () => {
    const annotatedTest = `Test
@0 StringLiteral text: "Test"
@4 EndOfFileToken`;
    
    const result = verifyTokens(annotatedTest);
    expect(result).toBe(annotatedTest);
  });
  
  test('should inject error when attribute is wrong', () => {
    const annotatedTest = `Test
@0 StringLiteral text: "Wrong"
@4 EndOfFileToken`;
    
    const result = verifyTokens(annotatedTest);
    expect(result).toContain('ERROR: At position 0, expected text: "Wrong" but got "Test"');
  });
  
  test('should handle empty input', () => {
    const annotatedTest = `
@0 EndOfFileToken`;
    
    const result = verifyTokens(annotatedTest);
    expect(result).toBe(annotatedTest);
  });
  
  test('should handle newlines properly', () => {
    const annotatedTest = `First
Second
@0 StringLiteral
@5 NewLineTrivia
@6 StringLiteral
@12 EndOfFileToken`;
    
    const result = verifyTokens(annotatedTest);
    expect(result).toBe(annotatedTest);
  });

  test('comprehensive example with all Stage 1 token types', () => {
    // Note: no trailing newline in this input
    const annotatedTest = `  Line1
  Line2
@0 WhitespaceTrivia
@2 StringLiteral
@7 NewLineTrivia
@8 WhitespaceTrivia
@10 StringLiteral
@15 EndOfFileToken`;
    
    const result = verifyTokens(annotatedTest);
    expect(result).toBe(annotatedTest);
  });

});