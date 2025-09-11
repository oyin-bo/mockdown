/**
 * Additional Edge Case Tests for Scanner2 Stage 1
 * Testing robustness and edge cases of the text lines + whitespace/newlines implementation
 */

import { beforeEach, describe, expect, test } from 'vitest';
import { createScanner, type Scanner, type ScannerDebugState } from '../scanner/scanner.js';
import { RollbackType, SyntaxKind, TokenFlags } from '../scanner/token-types.js';
import { verifyTokens } from './verify-tokens.js';

describe('Scanner2 Stage 1: Edge Cases', () => {
  let scanner: Scanner;
  let debugState: ScannerDebugState;

  beforeEach(() => {
    scanner = createScanner();
    debugState = {
      pos: 0,
      line: 0,
      column: 0,
      mode: '',
      atLineStart: false,
      inParagraph: false,
      precedingLineBreak: false,
      currentToken: SyntaxKind.Unknown,
      currentTokenText: '',
      currentTokenFlags: TokenFlags.None,
      nextOffset: 0
    };
  });

  test('should handle only whitespace', () => {
    scanner.initText('   \t   ');

    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.StringLiteral);
    expect(scanner.tokenText).toBe(' ');

    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.EndOfFileToken);
  });

  test('should handle only newlines', () => {
    scanner.initText('\n\n\n');

    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.NewLineTrivia);
    expect(scanner.tokenText).toBe('\n');

    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.NewLineTrivia);
    expect(scanner.tokenText).toBe('\n');
    expect(scanner.tokenFlags & TokenFlags.IsBlankLine).toBeTruthy();

    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.NewLineTrivia);
    expect(scanner.tokenText).toBe('\n');
    expect(scanner.tokenFlags & TokenFlags.IsBlankLine).toBeTruthy();

    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.EndOfFileToken);
  });

  test('should handle mixed line endings', () => {
    scanner.initText('Line 1\nLine 2\r\nLine 3\rLine 4');

    const tokens = [];
    while (scanner.token !== SyntaxKind.EndOfFileToken) {
      scanner.scan();
      if ((scanner.token as SyntaxKind.EndOfFileToken) !== SyntaxKind.EndOfFileToken) {
        tokens.push({
          kind: scanner.token,
          text: scanner.tokenText
        });
      }
    }

    expect(tokens).toEqual([
      { kind: SyntaxKind.StringLiteral, text: 'Line 1' },
      { kind: SyntaxKind.NewLineTrivia, text: '\n' },
      { kind: SyntaxKind.StringLiteral, text: 'Line 2' },
      { kind: SyntaxKind.NewLineTrivia, text: '\r\n' },
      { kind: SyntaxKind.StringLiteral, text: 'Line 3' },
      { kind: SyntaxKind.NewLineTrivia, text: '\r' },
      { kind: SyntaxKind.StringLiteral, text: 'Line 4' }
    ]);
  });

  test('should handle lines with only whitespace', () => {
    scanner.initText('Line 1\n   \t   \nLine 2');

    scanner.scan(); // Line 1
    expect(scanner.token).toBe(SyntaxKind.StringLiteral);
    expect(scanner.tokenText).toBe('Line 1');

    scanner.scan(); // First newline
    expect(scanner.token).toBe(SyntaxKind.NewLineTrivia);

    scanner.scan(); // Whitespace line (emitted as StringLiteral)
    expect(scanner.token).toBe(SyntaxKind.StringLiteral);
    expect(scanner.tokenText).toBe(' ');

    scanner.scan(); // Second newline (blank line) -> HardLineBreak when trailing spaces exist
    expect(scanner.token).toBe(SyntaxKind.HardLineBreak);
    expect(scanner.tokenFlags & TokenFlags.IsBlankLine).toBeTruthy();

    scanner.scan(); // Line 2
    expect(scanner.token).toBe(SyntaxKind.StringLiteral);
    expect(scanner.tokenText).toBe('Line 2');
  });

  test('should handle very long lines', () => {
    const longText = 'A'.repeat(10000);
    scanner.initText(longText);

    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.StringLiteral);
    expect(scanner.tokenText).toBe(longText);
    expect(scanner.offsetNext).toBe(10000);
  });

  test('should handle unicode characters', () => {
    scanner.initText('Hello 世界\nBonjour 🌍');

    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.StringLiteral);
    expect(scanner.tokenText).toBe('Hello 世界');

    scanner.scan(); // newline
    expect(scanner.token).toBe(SyntaxKind.NewLineTrivia);

    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.StringLiteral);
    expect(scanner.tokenText).toBe('Bonjour 🌍');
  });

  test('should handle line ending at EOF without newline', () => {
    scanner.initText('Line 1\nLine 2 without newline');

    scanner.scan(); // Line 1
    expect(scanner.token).toBe(SyntaxKind.StringLiteral);
    expect(scanner.tokenText).toBe('Line 1');

    scanner.scan(); // newline
    expect(scanner.token).toBe(SyntaxKind.NewLineTrivia);

    scanner.scan(); // Line 2
    expect(scanner.token).toBe(SyntaxKind.StringLiteral);
    expect(scanner.tokenText).toBe('Line 2 without newline');

    scanner.scan(); // EOF
    expect(scanner.token).toBe(SyntaxKind.EndOfFileToken);
  });

  test('should handle multiple consecutive spaces and tabs', () => {
    scanner.initText('  \t  \t  Text with\t\t\tspaces  \t  ');

    // Scanner now emits a single normalized StringLiteral for the whole run
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.StringLiteral);
    expect(scanner.tokenText).toBe('Text with spaces');

    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.EndOfFileToken);
  });

  test('should preserve exact whitespace in whitespace tokens', () => {
    scanner.initText('\t  \t');

    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.StringLiteral);
    expect(scanner.tokenText).toBe(' '); // Normalization for whitespace tokens -> single space
  });

  test('should handle rollback to various positions', () => {
    scanner.initText('Line 1\nLine 2\nLine 3');

    // Scan several tokens
    scanner.scan(); // Line 1
    scanner.scan(); // newline
    scanner.scan(); // Line 2

    const midPosition = scanner.offsetNext;

    // Rollback to middle position
    scanner.rollback(midPosition, RollbackType.BlankLineBoundary);

    scanner.fillDebugState(debugState);
    expect(debugState.pos).toBe(midPosition);

    // Should be able to continue scanning from rollback position
    scanner.scan(); // newline after Line 2
    expect(scanner.token).toBe(SyntaxKind.NewLineTrivia);

    scanner.scan(); // Line 3
    expect(scanner.token).toBe(SyntaxKind.StringLiteral);
    expect(scanner.tokenText).toBe('Line 3');
  });

  test('should handle setText with various boundary conditions', () => {
    const fullText = 'PREFIX: Line 1\nLine 2\nLine 3 :SUFFIX';

    // Test start boundary
    scanner.initText(fullText, 8, 6); // Just "Line 1"
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.StringLiteral);
    expect(scanner.tokenText).toBe('Line 1');

    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.EndOfFileToken);

    // Test middle section with newline
    scanner.initText(fullText, 8, 14); // "Line 1\nLine 2"
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.StringLiteral);
    expect(scanner.tokenText).toBe('Line 1');

    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.NewLineTrivia);

    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.StringLiteral);
    expect(scanner.tokenText).toBe('Line 2');
  });

  test('should handle debug state correctly', () => {
    scanner.initText('Line 1\n  Line 2');

    // Initial state
    scanner.fillDebugState(debugState);
    expect(debugState).toMatchObject({
      pos: 0,
      line: 1,
      column: 1,
      atLineStart: true,
      mode: 'Normal'
    });

    // After scanning first line
    scanner.scan();
    scanner.fillDebugState(debugState);
    expect(debugState).toMatchObject({
      pos: 6,
      line: 1,
      currentToken: SyntaxKind.StringLiteral,
      currentTokenText: 'Line 1'
    });

    // After newline
    scanner.scan();
    scanner.fillDebugState(debugState);
    expect(debugState).toMatchObject({
      pos: 7,
      line: 2,
      column: 1,
      atLineStart: true,
      currentToken: SyntaxKind.NewLineTrivia
    });
  });

  describe('Extended normalisation inputs (Phase 0.0) - edge cases', () => {
    function firstStringLiteralFor(input: string) {
      const scanner = createScanner();
      scanner.initText(input);
      while (scanner.token !== SyntaxKind.EndOfFileToken && scanner.token !== SyntaxKind.StringLiteral) scanner.scan();
      return scanner.token === SyntaxKind.StringLiteral ? scanner.tokenText : '';
    }

    test('trailing two spaces for hard break preserved as trailing spaces', () => {
      const tokenTest = `
Trailing two spaces for hard break  
1
@1 StringLiteral "Trailing two spaces for hard break"
`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('single space followed by newline normalized', () => {
      const tokenTest = `
Single space followed by newline 
1
@1 StringLiteral "Single space followed by newline "
`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('only tabs normalized to single space or empty', () => {
      const tokenTest = `
Onlytabs\t\t\t
1
@1 StringLiteral "Onlytabs"
`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('mixed-leading tabs and spaces normalized', () => {
      const tokenTest = `
Mixed-leading tabs\t  and spaces  
1
@1 StringLiteral "Mixed-leading tabs and spaces"
`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('long run of whitespace collapses', () => {
      const tokenTest = `
Long run of whitespace:                    
1
@1 StringLiteral "Long run of whitespace:"
`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('tab at end trimmed', () => {
      const tokenTest = `
Tab at end\t
1
@1 StringLiteral "Tab at end"
`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('line with entity at end preserved', () => {
      const tokenTest = `
Line with entity at end &amp;
1
@1 StringLiteral "Line with entity at end "
`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('numeric and hex entities preserved', () => {
      const tokenTest = `
Line with numeric entity &#169; and hex &#x1F600;
1
@1 StringLiteral "Line with numeric entity "
`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });

  test('should handle rollback type parameter correctly', () => {
    scanner.initText('Test content');

    // Test different rollback types
    scanner.rollback(0, RollbackType.DocumentStart);
    scanner.fillDebugState(debugState);
    expect(debugState.pos).toBe(0);

    scanner.rollback(5, RollbackType.BlankLineBoundary);
    scanner.fillDebugState(debugState);
    expect(debugState.pos).toBe(5);

    scanner.rollback(8, RollbackType.RawTextContent);
    scanner.fillDebugState(debugState);
    expect(debugState.pos).toBe(8);
  });

  test('should throw error for invalid rollback positions', () => {
    scanner.initText('Test');

    expect(() => scanner.rollback(-1, RollbackType.DocumentStart))
      .toThrow('Invalid rollback position: -1');

    expect(() => scanner.rollback(100, RollbackType.DocumentStart))
      .toThrow('Invalid rollback position: 100');
  });

  test('should handle edge case of empty lines at end', () => {
    scanner.initText('Content\n\n');

    scanner.scan(); // Content
    expect(scanner.token).toBe(SyntaxKind.StringLiteral);
    expect(scanner.tokenText).toBe('Content');

    scanner.scan(); // First newline
    expect(scanner.token).toBe(SyntaxKind.NewLineTrivia);

    scanner.scan(); // Second newline (blank line)
    expect(scanner.token).toBe(SyntaxKind.NewLineTrivia);
    expect(scanner.tokenFlags & TokenFlags.IsBlankLine).toBeTruthy();

    scanner.scan(); // EOF
    expect(scanner.token).toBe(SyntaxKind.EndOfFileToken);
  });
});