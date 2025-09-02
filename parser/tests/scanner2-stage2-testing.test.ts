/**
 * Tests for Scanner2 Stage 2 Testing Infrastructure
 * Verifies that the annotated test format works correctly
 */

import { describe, test, expect } from 'vitest';
import { verifyTokens } from './scanner2-test-infrastructure.js';

describe('Scanner2 Stage 2: Testing Infrastructure', () => {
  
  test('should pass when token assertions are correct', () => {
    const annotatedTest = `Hello World
1          E
@1 StringLiteral
@E EndOfFileToken`;
    
    const result = verifyTokens(annotatedTest);
    expect(result).toBe(annotatedTest);
  });
  
  test('should inject error when token type is wrong', () => {
    const annotatedTest = `Hello World
1
@1 WhitespaceTrivia`;
    
    const result = verifyTokens(annotatedTest);
    expect(result).toContain('ERROR: At position 0 (marker \'1\'), expected WhitespaceTrivia but got StringLiteral');
  });
  
  test('should handle multiple tokens correctly', () => {
    const annotatedTest = `Line1
Line2
1    56    E
@1 StringLiteral
@5 NewLineTrivia
@6 StringLiteral
@E EndOfFileToken`;
    
    const result = verifyTokens(annotatedTest);
    expect(result).toBe(annotatedTest);
  });
  
  test('should handle whitespace tokens', () => {
    const annotatedTest = `  Hello
12     E
@1 WhitespaceTrivia
@2 StringLiteral
@E EndOfFileToken`;
    
    const result = verifyTokens(annotatedTest);
    expect(result).toBe(annotatedTest);
  });
  
  test('should verify token attributes', () => {
    const annotatedTest = `Test
1   E
@1 StringLiteral text: "Test"
@E EndOfFileToken`;
    
    const result = verifyTokens(annotatedTest);
    expect(result).toBe(annotatedTest);
  });
  
  test('should inject error when attribute is wrong', () => {
    const annotatedTest = `Test
1   E
@1 StringLiteral text: "Wrong"
@E EndOfFileToken`;
    
    const result = verifyTokens(annotatedTest);
    expect(result).toContain('ERROR: At position 0 (marker \'1\'), expected text: "Wrong" but got "Test"');
  });
  
  test('should handle empty input', () => {
    // For empty input, the EndOfFileToken is at position 0
    const annotatedTest = `
1
@1 EndOfFileToken`;
    
    const result = verifyTokens(annotatedTest);
    expect(result).toBe(annotatedTest);
  });
  
  test('should handle newlines properly', () => {
    const annotatedTest = `First
Second
1    56    E
@1 StringLiteral
@5 NewLineTrivia
@6 StringLiteral
@E EndOfFileToken`;
    
    const result = verifyTokens(annotatedTest);
    expect(result).toBe(annotatedTest);
  });

});