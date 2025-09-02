/**
 * Example Usage of Stage 2 Testing Infrastructure
 * 
 * This file demonstrates the new @ numbered token verification system
 * with practical examples that showcase the declarative testing approach for Scanner2.
 */

import { describe, test, expect } from 'vitest';
import { verifyTokens } from './testing-harness/verify-tokens.js';

describe('Stage 2: Testing Infrastructure Examples', () => {
  
  test('demonstrates basic annotated test usage', () => {
    const tokenTest = `Hello world
Second line
@1 StringLiteral text="Hello world" flags=IsAtLineStart|CanRollbackHere
@2 NewLineTrivia
@3 StringLiteral text="Second line" flags=IsAtLineStart|PrecedingLineBreak|CanRollbackHere
@4 EndOfFileToken`;

    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });
  
  test('demonstrates whitespace handling', () => {
    const tokenTest = `    Indented text
@1 WhitespaceTrivia text="    " flags=IsAtLineStart
@2 StringLiteral text="Indented text" flags=IsAtLineStart|CanRollbackHere
@3 EndOfFileToken`;

    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });
  
  test('demonstrates blank line detection', () => {
    const tokenTest = `Text

More text
@1 StringLiteral text="Text" flags=IsAtLineStart|CanRollbackHere
@2 NewLineTrivia
@3 NewLineTrivia flags=PrecedingLineBreak|IsAtLineStart|IsBlankLine
@4 StringLiteral text="More text" flags=PrecedingLineBreak|IsAtLineStart|CanRollbackHere
@5 EndOfFileToken`;

    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });
  
  test('demonstrates edge case testing', () => {
    const tokenTest = `@1 EndOfFileToken`;

    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('demonstrates unicode content', () => {
    const tokenTest = `Hello 🌍 World
@1 StringLiteral text="Hello 🌍 World" flags=IsAtLineStart|CanRollbackHere
@2 EndOfFileToken`;

    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });
});

// This example shows how the testing infrastructure will extend for future stages
describe('Future Stage Patterns (Examples)', () => {
  
  test('shows pattern for Stage 3: inline formatting (future)', () => {
    // When Stage 3 is implemented, tests could look like:
    const tokenTest = `**bold text**
@1 StringLiteral text="**bold text**" flags=IsAtLineStart|CanRollbackHere
@2 EndOfFileToken`;

    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });
  
  test('shows pattern for Stage 4: HTML entities (future)', () => {
    // When Stage 4 is implemented, tests could look like:
    const tokenTest = `&lt;tag&gt;
@1 StringLiteral text="&lt;tag&gt;" flags=IsAtLineStart|CanRollbackHere
@2 EndOfFileToken`;

    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });
});

/*
 * Key Benefits Demonstrated:
 * 
 * 1. **Readable**: Tests use @ numbered token expectations inline with content
 * 2. **Maintainable**: Easy to update expectations when behavior changes
 * 3. **Comprehensive**: Can test tokens, text content, flags, and positions
 * 4. **Extensible**: Ready for future stages with minimal changes
 * 5. **Integrated**: Works seamlessly with existing Vitest infrastructure
 * 6. **Debugging**: Clear error messages show exactly what differed
 * 7. **Consistent**: Single pattern for all test definitions
 * 
 * This testing infrastructure provides the foundation for testing all subsequent
 * parser-scanner stages while maintaining the high quality and comprehensive
 * coverage that the project requires.
 */