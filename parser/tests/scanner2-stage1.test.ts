/**
 * Test for Scanner2 Stage 1 implementation
 * Testing basic text lines + whitespace/newlines functionality
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { createScanner2, type Scanner2, type ScannerDebugState } from '../scanner2.js';
import { SyntaxKind2, TokenFlags2 } from '../scanner2-token-types.js';

describe('Scanner2 Stage 1: Text Lines + Whitespace/Newlines', () => {
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
      currentToken: SyntaxKind2.Unknown,
      currentTokenText: '',
      currentTokenFlags: TokenFlags2.None,
      nextOffset: 0
    };
  });

  test('should handle empty input', () => {
    scanner.setText('');
    scanner.scan();
    
    expect(scanner.token).toBe(SyntaxKind2.EndOfFileToken);
    expect(scanner.tokenText).toBe('');
    expect(scanner.offsetNext).toBe(0);
  });

  test('should tokenize simple text line', () => {
    scanner.setText('Hello world');
    scanner.scan();
    
    expect(scanner.token).toBe(SyntaxKind2.StringLiteral);
    expect(scanner.tokenText).toBe('Hello world');
    expect(scanner.tokenFlags & TokenFlags2.IsAtLineStart).toBeTruthy();
    expect(scanner.offsetNext).toBe(11);
    
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind2.EndOfFileToken);
  });

  test('should handle line breaks', () => {
    scanner.setText('Line 1\nLine 2');
    
    // First line
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind2.StringLiteral);
    expect(scanner.tokenText).toBe('Line 1');
    expect(scanner.offsetNext).toBe(6);
    
    // Newline
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind2.NewLineTrivia);
    expect(scanner.tokenText).toBe('\n');
    expect(scanner.offsetNext).toBe(7);
    
    // Second line
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind2.StringLiteral);
    expect(scanner.tokenText).toBe('Line 2');
    expect(scanner.tokenFlags & TokenFlags2.IsAtLineStart).toBeTruthy();
    expect(scanner.offsetNext).toBe(13);
    
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind2.EndOfFileToken);
  });

  test('should handle CRLF line breaks', () => {
    scanner.setText('Line 1\r\nLine 2');
    
    // First line
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind2.StringLiteral);
    expect(scanner.tokenText).toBe('Line 1');
    
    // CRLF newline
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind2.NewLineTrivia);
    expect(scanner.tokenText).toBe('\r\n');
    expect(scanner.offsetNext).toBe(8);
    
    // Second line
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind2.StringLiteral);
    expect(scanner.tokenText).toBe('Line 2');
  });

  test('should handle whitespace', () => {
    scanner.setText('  Hello  \t  world  ');
    
    // Leading whitespace
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind2.WhitespaceTrivia);
    expect(scanner.tokenText).toBe('  ');
    
    // Text content (should be normalized)
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind2.StringLiteral);
    expect(scanner.tokenText).toBe('Hello world'); // Normalized whitespace
  });

  test('should handle blank lines', () => {
    scanner.setText('Line 1\n\nLine 2');
    
    // First line
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind2.StringLiteral);
    expect(scanner.tokenText).toBe('Line 1');
    
    // First newline
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind2.NewLineTrivia);
    expect(scanner.tokenText).toBe('\n');
    
    // Blank line newline
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind2.NewLineTrivia);
    expect(scanner.tokenText).toBe('\n');
    expect(scanner.tokenFlags & TokenFlags2.IsBlankLine).toBeTruthy();
    
    // Second line
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind2.StringLiteral);
    expect(scanner.tokenText).toBe('Line 2');
  });

  test('should normalize whitespace within lines', () => {
    scanner.setText('  Text\twith\t\tmultiple   spaces  ');
    
    // Leading whitespace
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind2.WhitespaceTrivia);
    
    // Normalized text content
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind2.StringLiteral);
    expect(scanner.tokenText).toBe('Text with multiple spaces'); // Normalized
  });

  test('should track position correctly', () => {
    scanner.setText('Line 1\nLine 2\nLine 3');
    
    scanner.fillDebugState(debugState);
    expect(debugState.pos).toBe(0);
    expect(debugState.line).toBe(1);
    expect(debugState.column).toBe(1);
    expect(debugState.atLineStart).toBe(true);
    
    scanner.scan(); // Line 1
    scanner.fillDebugState(debugState);
    expect(debugState.pos).toBe(6);
    expect(debugState.line).toBe(1);
    
    scanner.scan(); // First newline
    scanner.fillDebugState(debugState);
    expect(debugState.pos).toBe(7);
    expect(debugState.line).toBe(2);
    expect(debugState.column).toBe(1);
    expect(debugState.atLineStart).toBe(true);
  });

  test('should support rollback functionality', () => {
    scanner.setText('Line 1\nLine 2\nLine 3');
    
    // Scan first line
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind2.StringLiteral);
    expect(scanner.tokenText).toBe('Line 1');
    
    // Scan newline
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind2.NewLineTrivia);
    
    // Rollback to beginning
    scanner.rollback(0, 0 /* DocumentStart */);
    
    // Should be back at start
    scanner.fillDebugState(debugState);
    expect(debugState.pos).toBe(0);
    expect(debugState.line).toBe(1);
    expect(debugState.column).toBe(1);
    expect(debugState.atLineStart).toBe(true);
    
    // Should scan same content again
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind2.StringLiteral);
    expect(scanner.tokenText).toBe('Line 1');
  });

  test('should handle complex multi-line text', () => {
    const text = `First line of text
Second line with more content
Third line here

Final line after blank`;
    
    scanner.setText(text);
    
    const tokens: Array<{kind: SyntaxKind, text: string, flags: TokenFlags}> = [];
    
    while (scanner.token !== SyntaxKind2.EndOfFileToken) {
      scanner.scan();
      if (scanner.token !== SyntaxKind2.EndOfFileToken) {
        tokens.push({
          kind: scanner.token,
          text: scanner.tokenText,
          flags: scanner.tokenFlags
        });
      }
    }
    
    // Should have text tokens, newline tokens, and blank line detection
    expect(tokens.length).toBeGreaterThan(5); // Multiple lines and newlines
    
    // Check that we have the expected token types
    const textTokens = tokens.filter(t => t.kind === SyntaxKind2.StringLiteral);
    const newlineTokens = tokens.filter(t => t.kind === SyntaxKind2.NewLineTrivia);
    const blankLineTokens = tokens.filter(t => t.flags & TokenFlags2.IsBlankLine);
    
    expect(textTokens.length).toBe(4); // Four lines of text
    expect(newlineTokens.length).toBe(4); // Four newlines
    expect(blankLineTokens.length).toBe(1); // One blank line marker
  });

  test('should set rollback flags appropriately', () => {
    scanner.setText('Line 1\nLine 2');
    
    // First line should have rollback capability (at line start)
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind2.StringLiteral);
    expect(scanner.tokenFlags & TokenFlags2.CanRollbackHere).toBeTruthy();
    expect(scanner.tokenFlags & TokenFlags2.IsAtLineStart).toBeTruthy();
    
    scanner.scan(); // newline
    scanner.scan(); // second line
    expect(scanner.token).toBe(SyntaxKind2.StringLiteral);
    expect(scanner.tokenFlags & TokenFlags2.CanRollbackHere).toBeTruthy();
    expect(scanner.tokenFlags & TokenFlags2.IsAtLineStart).toBeTruthy();
  });
  
  test('should handle setText with start and length parameters', () => {
    scanner.setText('PREFIX: Line 1\nLine 2 :SUFFIX', 8, 14); // Just "Line 1\nLine 2"
    
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind2.StringLiteral);
    expect(scanner.tokenText).toBe('Line 1');
    
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind2.NewLineTrivia);
    
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind2.StringLiteral);
    expect(scanner.tokenText).toBe('Line 2');
    
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind2.EndOfFileToken);
  });
});