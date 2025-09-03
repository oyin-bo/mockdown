/**
 * Example tests using Scanner2 Testing Infrastructure
 * Demonstrates how to use the new annotated Markdown testing system
 * 
 * Following Stage 2 plan: Always use the same variable to pass to expect and toBe.
 * Do not pass two string literals separately.
 */

import { describe, test, expect } from 'vitest';
import { verifyTokens } from './testing-infrastructure.js';

describe('Scanner2 Testing Infrastructure - Examples', () => {
  test('example 1: simple text validation', () => {
    const tokenTest = `
Hello world from Scanner2
1
@1 StringLiteral text: "Hello world from Scanner2"`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('example 2: multi-line text with newlines', () => {
    const tokenTest = `
First line of content
Second line of content
1
@1 StringLiteral text: "Second line of content"`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('example 3: whitespace and text tokens', () => {
    const tokenTest = `
    Indented content here
1   2
@1 WhitespaceTrivia
@2 StringLiteral text: "Indented content here"`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('example 4: multiple position markers with flags', () => {
    const tokenTest = `
  Content with spacing
1 2
@1 WhitespaceTrivia flags: 2
@2 StringLiteral flags: 10`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('example 5: leading/trailing newlines preserved', () => {
    const tokenTest = `

Content with blank lines around
1
@1 StringLiteral text: "Content with blank lines around"

`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('example 6: error demonstration (wrong text)', () => {
    const tokenTest = `
Actual content
1
@1 StringLiteral text: "Expected different content"`;
    const result = verifyTokens(tokenTest);
    expect(result).toContain('ERROR: Attribute \'text\' expected "Expected different content" but got "Actual content"');
    expect(result).not.toBe(tokenTest);
  });

  test('example 7: mixed letter and number markers', () => {
    const tokenTest = `
Test content example
1    A       B
@1 StringLiteral text: "Test content example"
@A StringLiteral text: "Test content example"
@B StringLiteral text: "Test content example"`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });
});
