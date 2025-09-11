import { describe, expect, test } from 'vitest';
import { verifyTokens } from './verify-tokens.js';

describe('Scanner Cross-Line StringLiteral accumulation (Phase 0.2)', () => {
  test('simple paragraph lines join with single space', () => {
    const tokenTest = `
Hello
1 @1 StringLiteral "Hello world"
world
`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('lines separated by blank line do not join', () => {
    const tokenTest = `
Hello
1 @1 StringLiteral "Hello"

world
`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('line followed by heading does not join', () => {
    const tokenTest = `
Hello
1
@1 StringLiteral "Hello"
# Heading
`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });
});
