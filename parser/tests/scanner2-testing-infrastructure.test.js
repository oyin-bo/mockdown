/**
 * Test for Scanner2 Testing Infrastructure (Stage 2)
 * Testing the verifyTokens function with annotated Markdown format
 */
import { describe, test, expect } from 'vitest';
import { verifyTokens } from './scanner2-testing-infrastructure.js';
describe('Scanner2 Testing Infrastructure', () => {
    test('should return original string when all expectations match', () => {
        expect(verifyTokens(`
Hello world
1
@1 StringLiteral`)).toBe(`
Hello world
1
@1 StringLiteral`);
    });
    test('should handle simple text with position marker', () => {
        expect(verifyTokens(`
Simple text line
1
@1 StringLiteral`)).toBe(`
Simple text line
1
@1 StringLiteral`);
    });
    test('should inject error for wrong token kind', () => {
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
    test('should handle multiple position markers', () => {
        expect(verifyTokens(`
  Hello world
1 2
@1 WhitespaceTrivia
@2 StringLiteral`)).toBe(`
  Hello world
1 2
@1 WhitespaceTrivia
@2 StringLiteral`);
    });
    test('should handle text with attributes', () => {
        expect(verifyTokens(`
Hello world
1
@1 StringLiteral text: "Hello world"`)).toBe(`
Hello world
1
@1 StringLiteral text: "Hello world"`);
    });
    test('should inject error for wrong attribute value', () => {
        const result = verifyTokens(`
Hello world
1
@1 StringLiteral text: "Wrong text"`);
        expect(result).toContain('ERROR: Attribute \'text\' expected "Wrong text" but got "Hello world"');
        expect(result).not.toBe(`
Hello world
1
@1 StringLiteral text: "Wrong text"`);
    });
    test('should handle multiple markers on same token', () => {
        expect(verifyTokens(`
Hello World
1    2    3
@1 StringLiteral text: "Hello World"
@2 StringLiteral text: "Hello World"  
@3 StringLiteral text: "Hello World"`)).toBe(`
Hello World
1    2    3
@1 StringLiteral text: "Hello World"
@2 StringLiteral text: "Hello World"  
@3 StringLiteral text: "Hello World"`);
    });
    test('should handle newline tokens between lines', () => {
        expect(verifyTokens(`
Line1
Line2
1
@1 StringLiteral text: "Line2"`)).toBe(`
Line1
Line2
1
@1 StringLiteral text: "Line2"`);
    });
    test('should handle leading whitespace', () => {
        expect(verifyTokens(`
  Indented text
1 2
@1 WhitespaceTrivia
@2 StringLiteral`)).toBe(`
  Indented text
1 2
@1 WhitespaceTrivia
@2 StringLiteral`);
    });
    test('should inject error for missing position marker', () => {
        const result = verifyTokens(`
Hello
World
1           2
@1 StringLiteral
@2 StringLiteral`);
        expect(result).toContain("ERROR: No token found at position marked by '2'");
        expect(result).not.toBe(`
Hello
World
1           2
@1 StringLiteral
@2 StringLiteral`);
    });
    test('should handle leading whitespace tokens', () => {
        expect(verifyTokens(`
  Hello World
1 2
@1 WhitespaceTrivia
@2 StringLiteral text: "Hello World"`)).toBe(`
  Hello World
1 2
@1 WhitespaceTrivia
@2 StringLiteral text: "Hello World"`);
    });
    test('should handle letter position markers', () => {
        expect(verifyTokens(`
Hello world test
A           B
@A StringLiteral
@B StringLiteral`)).toBe(`
Hello world test
A           B
@A StringLiteral
@B StringLiteral`);
    });
    test('should validate flags attribute', () => {
        // WhitespaceTrivia should have IsAtLineStart flag (1 << 1 = 2)
        expect(verifyTokens(`
  Hello world
1
@1 WhitespaceTrivia flags: 2`)).toBe(`
  Hello world
1
@1 WhitespaceTrivia flags: 2`);
    });
    test('infrastructure failure: wrong position marker should inject descriptive error', () => {
        // Position 12 should be beyond the "Hello world" token (which ends at position 10)
        const result = verifyTokens(`
Hello world
            1
@1 StringLiteral`);
        expect(result).toContain("ERROR: No token found at position marked by '1'");
        expect(result).not.toBe(`
Hello world
            1
@1 StringLiteral`);
        // The error should be injected below the expectation line
        const lines = result.split('\n');
        const expectationLineIndex = lines.findIndex(line => line.includes('@1 StringLiteral'));
        expect(expectationLineIndex).toBeGreaterThan(-1);
        expect(lines[expectationLineIndex + 1]).toContain("ERROR: No token found at position marked by '1'");
    });
    test('infrastructure failure: wrong attribute value should show actual vs expected', () => {
        const result = verifyTokens(`
Hello world
1
@1 StringLiteral text: "Wrong content"`);
        expect(result).toContain('ERROR: Attribute \'text\' expected "Wrong content" but got "Hello world"');
        expect(result).not.toBe(`
Hello world
1
@1 StringLiteral text: "Wrong content"`);
        // Verify error is in the right place
        const lines = result.split('\n');
        const expectationLineIndex = lines.findIndex(line => line.includes('@1 StringLiteral text:'));
        expect(expectationLineIndex).toBeGreaterThan(-1);
        expect(lines[expectationLineIndex + 1]).toContain('ERROR: Attribute \'text\' expected "Wrong content" but got "Hello world"');
    });
    test('infrastructure failure: unknown attribute should produce error', () => {
        const result = verifyTokens(`
Hello world
1
@1 StringLiteral unknownAttr: "value"`);
        expect(result).toContain("ERROR: Unknown attribute 'unknownAttr' for token validation");
        expect(result).not.toBe(`
Hello world
1
@1 StringLiteral unknownAttr: "value"`);
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
        expect(verifyTokens(`
Hello world
1
@1 StringLiteral`)).toBe(`
Hello world
1
@1 StringLiteral`);
        // Test that digit 1 aligns with the start of whitespace, digit 2 with "Hello"
        // For "  Hello world":
        // Position 0-1: "  " (WhitespaceTrivia)
        // Position 2-12: "Hello world" (StringLiteral)
        expect(verifyTokens(`
  Hello world
1 2
@1 WhitespaceTrivia
@2 StringLiteral`)).toBe(`
  Hello world
1 2
@1 WhitespaceTrivia
@2 StringLiteral`);
    });
});
