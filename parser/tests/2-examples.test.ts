/**
 * Example tests using Scanner2 Testing Infrastructure
 * Demonstrates how to use the new annotated Markdown testing system
 * 
 * Following Stage 2 plan: Always use the same variable to pass to expect and toBe.
 * Do not pass two string literals separately.
 */

import { describe, test, expect } from 'vitest';
import { verifyTokens } from './verify-tokens.js';

describe('Scanner2 Testing Infrastructure - Examples', () => {
  test('example 1: simple text validation', () => {
    const tokenTest = `
Hello world from Scanner2
1
@1 StringLiteral "Hello world from Scanner2"`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('example 2: multi-line text with newlines', () => {
    const tokenTest = `
First line of content
Second line of content
1
@1 StringLiteral "Second line of content"`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('example 3: whitespace and text tokens', () => {
    const tokenTest = `
    Indented content here
1   2
@1 WhitespaceTrivia
@2 StringLiteral "Indented content here"`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('example 4: multiple position markers with flags', () => {
    const tokenTest = `
  Content with spacing
1 2
@1 WhitespaceTrivia 2
@2 StringLiteral 10`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('example 5: leading/trailing newlines preserved', () => {
    const tokenTest = `

Content with blank lines around
1
@1 StringLiteral "Content with blank lines around"

`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('example 6: error demonstration (wrong text)', () => {
    const tokenTest = `
Actual content
1
@1 StringLiteral "Expected different content"`;
    const result = verifyTokens(tokenTest);
    expect(result).toBe(`
Actual content
1
@1 StringLiteral "Actual content"
`);
  });

  test('example 8: simple whitespace and text', () => {
    const tokenTest = `
  Simple indented content
1 2
@1 WhitespaceTrivia
@2 StringLiteral "Simple indented content"`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });
});
