/**
 * Example tests using Scanner2 Testing Infrastructure
 * Demonstrates how to use the new annotated Markdown testing system
 */

import { describe, test, expect } from 'vitest';
import { verifyTokens } from './scanner2-testing-infrastructure.js';

describe('Scanner2 Testing Infrastructure - Examples', () => {
  test('example 1: simple text validation', () => {
    expect(verifyTokens(`
Hello world from Scanner2
1
@1 StringLiteral text: "Hello world from Scanner2"`)).toBe(`
Hello world from Scanner2
1
@1 StringLiteral text: "Hello world from Scanner2"`);
  });

  test('example 2: multi-line text with newlines', () => {
    expect(verifyTokens(`
First line of content
Second line of content
1
@1 StringLiteral text: "Second line of content"`)).toBe(`
First line of content
Second line of content
1
@1 StringLiteral text: "Second line of content"`);
  });

  test('example 3: whitespace handling', () => {
    expect(verifyTokens(`
  Indented content here
1 2
@1 WhitespaceTrivia text: "  "
@2 StringLiteral text: "Indented content here"`)).toBe(`
  Indented content here
1 2
@1 WhitespaceTrivia text: "  "
@2 StringLiteral text: "Indented content here"`);
  });

  test('example 4: complex document structure', () => {
    expect(verifyTokens(`
  First paragraph

Second paragraph
1
@1 StringLiteral text: "Second paragraph"`)).toBe(`
  First paragraph

Second paragraph
1
@1 StringLiteral text: "Second paragraph"`);
  });

  test('example 5: token flags validation', () => {
    // WhitespaceTrivia at line start should have IsAtLineStart flag (1 << 1 = 2)
    expect(verifyTokens(`
  Hello
1
@1 WhitespaceTrivia flags: 2`)).toBe(`
  Hello
1
@1 WhitespaceTrivia flags: 2`);
  });

  test('example 6: demonstrating error injection', () => {
    // This should fail since "Hello world" produces StringLiteral, not WhitespaceTrivia
    const result = verifyTokens(`
Hello world
1
@1 WhitespaceTrivia`);
    expect(result).toContain("ERROR: Expected 'WhitespaceTrivia' but got 'StringLiteral'");
    expect(result).not.toBe(`
Hello world
1
@1 WhitespaceTrivia`);
  });

  test('example 7: using letter markers for distant positions', () => {
    expect(verifyTokens(`
Content with letter markers
1       A               B
@1 StringLiteral text: "Content with letter markers"
@A StringLiteral text: "Content with letter markers"
@B StringLiteral text: "Content with letter markers"`)).toBe(`
Content with letter markers
1       A               B
@1 StringLiteral text: "Content with letter markers"
@A StringLiteral text: "Content with letter markers"
@B StringLiteral text: "Content with letter markers"`);
  });

  test('example 8: real-world usage pattern', () => {
    // This demonstrates how future markdown constructs might be tested
    expect(verifyTokens(`
Regular text content
Multiple words here
1
@1 StringLiteral text: "Multiple words here"`)).toBe(`
Regular text content
Multiple words here
1
@1 StringLiteral text: "Multiple words here"`);
  });
});