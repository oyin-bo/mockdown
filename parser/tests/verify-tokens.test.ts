/**
 * Test for the new @ numbered token verification system
 */

import { describe, test, expect } from 'vitest';
import { verifyTokens } from './testing-harness/verify-tokens.js';

describe('@ Numbered Token Verification System', () => {
  test('should verify simple token test', () => {
    const tokenTest = `Hello world
@1 StringLiteral text="Hello world" flags=IsAtLineStart|CanRollbackHere
@2 EndOfFileToken`;

    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('should verify multi-line test', () => {
    const tokenTest = `First line
Second line
@1 StringLiteral text="First line" flags=IsAtLineStart|CanRollbackHere
@2 NewLineTrivia
@3 StringLiteral text="Second line" flags=IsAtLineStart|PrecedingLineBreak|CanRollbackHere
@4 EndOfFileToken`;

    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('should handle whitespace', () => {
    const tokenTest = `  Indented
@1 WhitespaceTrivia text="  " flags=IsAtLineStart
@2 StringLiteral text="Indented"
@3 EndOfFileToken`;

    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });
});