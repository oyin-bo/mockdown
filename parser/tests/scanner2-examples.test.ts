/**
 * Example tests using Scanner2 Testing Infrastructure
 * Demonstrates how to use the new annotated Markdown testing system
 */

import { describe, test, expect } from 'vitest';
import { verifyTokens } from '../scanner2.js';

describe('Scanner2 Testing Infrastructure - Examples', () => {
  test('example 1: simple text validation', () => {
    const tokenTest = `Hello world from Scanner2
1     2     3    4
@1 StringLiteral text: "Hello world from Scanner2"
@2 StringLiteral text: "Hello world from Scanner2"
@3 StringLiteral text: "Hello world from Scanner2"
@4 StringLiteral text: "Hello world from Scanner2"`;
    
    const result = verifyTokens(tokenTest);
    expect(result).toBe(tokenTest);
  });

  test('example 2: multi-line text with newlines', () => {
    const tokenTest = `First line of content
Second line of content
                     1
@1 StringLiteral text: "Second line of content"`;
    
    const result = verifyTokens(tokenTest);
    expect(result).toBe(tokenTest);
  });

  test('example 3: whitespace handling', () => {
    const tokenTest = `  Indented content here
1 2
@1 WhitespaceTrivia text: "  "
@2 StringLiteral text: "Indented content here"`;
    
    const result = verifyTokens(tokenTest);
    expect(result).toBe(tokenTest);
  });

  test('example 4: complex document structure', () => {
    const tokenTest = `  First paragraph

  Second paragraph
  1
@1 StringLiteral text: "Second paragraph"`;
    
    const result = verifyTokens(tokenTest);
    expect(result).toBe(tokenTest);
  });

  test('example 5: token flags validation', () => {
    const tokenTest = `  Hello
1
@1 WhitespaceTrivia flags: 2`;
    
    // WhitespaceTrivia at line start should have IsAtLineStart flag (1 << 1 = 2)
    const result = verifyTokens(tokenTest);
    expect(result).toBe(tokenTest);
  });

  test('example 6: demonstrating error injection', () => {
    const tokenTest = `Hello world
1
@1 WhitespaceTrivia`;
    
    // This should fail since "Hello world" produces StringLiteral, not WhitespaceTrivia
    const result = verifyTokens(tokenTest);
    expect(result).toContain("ERROR: Expected 'WhitespaceTrivia' but got 'StringLiteral'");
    expect(result).not.toBe(tokenTest);
  });

  test('example 7: using letter markers', () => {
    const tokenTest = `Content with letter markers
A       B       C
@A StringLiteral text: "Content with letter markers"
@B StringLiteral text: "Content with letter markers"
@C StringLiteral text: "Content with letter markers"`;
    
    const result = verifyTokens(tokenTest);
    expect(result).toBe(tokenTest);
  });

  test('example 8: real-world usage pattern', () => {
    // This demonstrates how future markdown constructs might be tested
    const tokenTest = `Regular text content
Multiple words here
         1
@1 StringLiteral text: "Multiple words here"`;
    
    const result = verifyTokens(tokenTest);
    expect(result).toBe(tokenTest);
  });
});