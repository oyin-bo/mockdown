/**
 * Additional Edge Case Tests for Scanner2 Stage 1
 * Testing robustness and edge cases of the text lines + whitespace/newlines implementation
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { createScanner2, type Scanner2, type ScannerDebugState, RollbackType } from '../scanner2.js';
import { SyntaxKind, TokenFlags } from '../token-types.js';

describe('Scanner2 Stage 1: Edge Cases', () => {
  let scanner: Scanner2;
  let debugState: ScannerDebugState;
  
  beforeEach(() => {
    scanner = createScanner2();
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
    scanner.setText('   \t   ');
    
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.WhitespaceTrivia);
    expect(scanner.tokenText).toBe('   \t   ');
    
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.EndOfFileToken);
  });

  test('should handle only newlines', () => {
    scanner.setText('\n\n\n');
    
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
    scanner.setText('Line 1\nLine 2\r\nLine 3\rLine 4');
    
    const tokens = [];
    while (scanner.token !== SyntaxKind.EndOfFileToken) {
      scanner.scan();
      if (scanner.token !== SyntaxKind.EndOfFileToken) {
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
    scanner.setText('Line 1\n   \t   \nLine 2');
    
    scanner.scan(); // Line 1
    expect(scanner.token).toBe(SyntaxKind.StringLiteral);
    expect(scanner.tokenText).toBe('Line 1');
    
    scanner.scan(); // First newline
    expect(scanner.token).toBe(SyntaxKind.NewLineTrivia);
    
    scanner.scan(); // Whitespace line
    expect(scanner.token).toBe(SyntaxKind.WhitespaceTrivia);
    expect(scanner.tokenText).toBe('   \t   ');
    
    scanner.scan(); // Second newline (blank line)
    expect(scanner.token).toBe(SyntaxKind.NewLineTrivia);
    expect(scanner.tokenFlags & TokenFlags.IsBlankLine).toBeTruthy();
    
    scanner.scan(); // Line 2
    expect(scanner.token).toBe(SyntaxKind.StringLiteral);
    expect(scanner.tokenText).toBe('Line 2');
  });

  test('should handle very long lines', () => {
    const longText = 'A'.repeat(10000);
    scanner.setText(longText);
    
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.StringLiteral);
    expect(scanner.tokenText).toBe(longText);
    expect(scanner.offsetNext).toBe(10000);
  });

  test('should handle unicode characters', () => {
    scanner.setText('Hello 世界\nBonjour 🌍');
    
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
    scanner.setText('Line 1\nLine 2 without newline');
    
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
    scanner.setText('  \t  \t  Text with\t\t\tspaces  \t  ');
    
    scanner.scan(); // Leading whitespace
    expect(scanner.token).toBe(SyntaxKind.WhitespaceTrivia);
    expect(scanner.tokenText).toBe('  \t  \t  ');
    
    scanner.scan(); // Text content (normalized)
    expect(scanner.token).toBe(SyntaxKind.StringLiteral);
    expect(scanner.tokenText).toBe('Text with spaces');
  });

  test('should preserve exact whitespace in whitespace tokens', () => {
    scanner.setText('\t  \t');
    
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.WhitespaceTrivia);
    expect(scanner.tokenText).toBe('\t  \t'); // Exact preservation for whitespace tokens
  });

  test('should handle rollback to various positions', () => {
    scanner.setText('Line 1\nLine 2\nLine 3');
    
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
    scanner.setText(fullText, 8, 6); // Just "Line 1"
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.StringLiteral);
    expect(scanner.tokenText).toBe('Line 1');
    
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.EndOfFileToken);
    
    // Test middle section with newline
    scanner.setText(fullText, 8, 14); // "Line 1\nLine 2"
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
    scanner.setText('Line 1\n  Line 2');
    
    // Initial state
    scanner.fillDebugState(debugState);
    expect(debugState.pos).toBe(0);
    expect(debugState.line).toBe(1);
    expect(debugState.column).toBe(1);
    expect(debugState.atLineStart).toBe(true);
    expect(debugState.mode).toBe('Normal');
    
    // After scanning first line
    scanner.scan();
    scanner.fillDebugState(debugState);
    expect(debugState.pos).toBe(6);
    expect(debugState.line).toBe(1);
    expect(debugState.currentToken).toBe(SyntaxKind.StringLiteral);
    expect(debugState.currentTokenText).toBe('Line 1');
    
    // After newline
    scanner.scan();
    scanner.fillDebugState(debugState);
    expect(debugState.pos).toBe(7);
    expect(debugState.line).toBe(2);
    expect(debugState.column).toBe(1);
    expect(debugState.atLineStart).toBe(true);
    expect(debugState.currentToken).toBe(SyntaxKind.NewLineTrivia);
  });

  test('should handle rollback type parameter correctly', () => {
    scanner.setText('Test content');
    
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
    scanner.setText('Test');
    
    expect(() => scanner.rollback(-1, RollbackType.DocumentStart))
      .toThrow('Invalid rollback position: -1');
    
    expect(() => scanner.rollback(100, RollbackType.DocumentStart))
      .toThrow('Invalid rollback position: 100');
  });

  test('should handle edge case of empty lines at end', () => {
    scanner.setText('Content\n\n');
    
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