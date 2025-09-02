/**
 * Test file for the Stage 2 Testing Infrastructure
 * 
 * This file demonstrates the new @ numbered token verification system
 * that replaces the previous HTML comment-based annotated testing.
 */

import { describe, test, expect } from 'vitest';
import { verifyTokens } from './testing-harness/verify-tokens.js';

describe('Stage 2: Testing Infrastructure', () => {
  
  test('should verify basic text tokenization', () => {
    const tokenTest = `Hello world
@1 StringLiteral text="Hello world" flags=IsAtLineStart|CanRollbackHere
@2 EndOfFileToken`;

    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });
  
  test('should handle multi-line text with whitespace', () => {
    const tokenTest = `  First line
    Second line
@1 WhitespaceTrivia text="  " flags=IsAtLineStart
@2 StringLiteral text="First line" flags=IsAtLineStart|CanRollbackHere
@3 NewLineTrivia
@4 WhitespaceTrivia text="    " flags=PrecedingLineBreak|IsAtLineStart
@5 StringLiteral text="Second line" flags=IsAtLineStart|CanRollbackHere
@6 EndOfFileToken`;

    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });
  
  test('should handle blank lines correctly', () => {
    const tokenTest = `Text

More text
@1 StringLiteral text="Text" flags=IsAtLineStart|CanRollbackHere
@2 NewLineTrivia
@3 NewLineTrivia flags=PrecedingLineBreak|IsAtLineStart|IsBlankLine
@4 StringLiteral text="More text" flags=PrecedingLineBreak|IsAtLineStart|CanRollbackHere
@5 EndOfFileToken`;

    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });
  
  test('should handle complex whitespace scenarios', () => {
    const tokenTest = `		Tabs and spaces
  Mixed	whitespace
@1 WhitespaceTrivia text="		" flags=IsAtLineStart
@2 StringLiteral text="Tabs and spaces" flags=IsAtLineStart|CanRollbackHere
@3 NewLineTrivia
@4 WhitespaceTrivia text="  " flags=PrecedingLineBreak|IsAtLineStart
@5 StringLiteral text="Mixed	whitespace" flags=IsAtLineStart|CanRollbackHere
@6 EndOfFileToken`;

    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });
  
  test('should handle edge case with empty input', () => {
    const tokenTest = `@1 EndOfFileToken`;

    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });
  
  test('should handle unicode content', () => {
    const tokenTest = `Hello 🌍 World
@1 StringLiteral text="Hello 🌍 World" flags=IsAtLineStart|CanRollbackHere
@2 EndOfFileToken`;

    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });
  
  test('should handle leading whitespace preservation', () => {
    const tokenTest = `    Indented text
@1 WhitespaceTrivia text="    " flags=IsAtLineStart
@2 StringLiteral text="Indented text" flags=IsAtLineStart|CanRollbackHere
@3 EndOfFileToken`;

    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });
  
  test('should handle trailing whitespace', () => {
    // Input needs to explicitly include the newline
    const tokenTest = `Text with trailing spaces
@1 StringLiteral text="Text with trailing spaces" flags=IsAtLineStart|CanRollbackHere
@2 EndOfFileToken`;

    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });
  
  test('should handle multiple blank lines', () => {
    const tokenTest = `First


Last
@1 StringLiteral text="First" flags=IsAtLineStart|CanRollbackHere
@2 NewLineTrivia
@3 NewLineTrivia flags=PrecedingLineBreak|IsAtLineStart|IsBlankLine
@4 NewLineTrivia flags=PrecedingLineBreak|IsAtLineStart|IsBlankLine
@5 StringLiteral text="Last" flags=PrecedingLineBreak|IsAtLineStart|CanRollbackHere
@6 EndOfFileToken`;

    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });
});