/**
 * Test for Scanner2 Stage 1 implementation
 * Testing basic text lines + whitespace/newlines functionality
 */

import { beforeEach, describe, expect, test } from 'vitest';
import { createScanner, type Scanner, type ScannerDebugState } from '../scanner/scanner.js';
import { SyntaxKind, TokenFlags } from '../scanner/token-types.js';
import { verifyTokens } from './verify-tokens.js';

describe('Scanner2 Stage 1: Text Lines + Whitespace/Newlines', () => {
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

  test('should handle empty input', () => {
    scanner.initText('');
    scanner.scan();

    expect(scanner.token).toBe(SyntaxKind.EndOfFileToken);
    expect(scanner.tokenText).toBe('');
    expect(scanner.offsetNext).toBe(0);
  });

  test('should tokenize simple text line', () => {
    scanner.initText('Hello world');
    scanner.scan();

    expect(scanner.token).toBe(SyntaxKind.StringLiteral);
    expect(scanner.tokenText).toBe('Hello world');
    expect(scanner.tokenFlags & TokenFlags.IsAtLineStart).toBeTruthy();
    expect(scanner.offsetNext).toBe(11);

    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.EndOfFileToken);
  });

  test('should handle line breaks', () => {
    scanner.initText('Line 1\nLine 2');

    // First line
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.StringLiteral);
    expect(scanner.tokenText).toBe('Line 1');
    expect(scanner.offsetNext).toBe(6);

    // Newline
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.NewLineTrivia);
    expect(scanner.tokenText).toBe('\n');
    expect(scanner.offsetNext).toBe(7);

    // Second line
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.StringLiteral);
    expect(scanner.tokenText).toBe('Line 2');
    expect(scanner.tokenFlags & TokenFlags.IsAtLineStart).toBeTruthy();
    expect(scanner.offsetNext).toBe(13);

    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.EndOfFileToken);
  });

  test('should handle CRLF line breaks', () => {
    scanner.initText('Line 1\r\nLine 2');

    // First line
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.StringLiteral);
    expect(scanner.tokenText).toBe('Line 1');

    // CRLF newline
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.NewLineTrivia);
    expect(scanner.tokenText).toBe('\r\n');
    expect(scanner.offsetNext).toBe(8);

    // Second line
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.StringLiteral);
    expect(scanner.tokenText).toBe('Line 2');
  });

  test('should handle whitespace', () => {
    scanner.initText('  Hello  \t  world  ');
    // Leading/trailing whitespace should be trimmed; internal runs normalized
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.StringLiteral);
    expect(scanner.tokenText).toBe('Hello world'); // Trimmed and normalized
  });

  test('should handle blank lines', () => {
    scanner.initText('Line 1\n\nLine 2');

    // First line
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.StringLiteral);
    expect(scanner.tokenText).toBe('Line 1');

    // First newline
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.NewLineTrivia);
    expect(scanner.tokenText).toBe('\n');

    // Blank line newline
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.NewLineTrivia);
    expect(scanner.tokenText).toBe('\n');
    expect(scanner.tokenFlags & TokenFlags.IsBlankLine).toBeTruthy();

    // Second line
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.StringLiteral);
    expect(scanner.tokenText).toBe('Line 2');
  });

  test('should normalize whitespace within lines', () => {
    scanner.initText('  Text\twith\t\tmultiple   spaces  ');
    // Leading whitespace is absorbed; result is a single normalized StringLiteral
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.StringLiteral);
    expect(scanner.tokenText).toBe('Text with multiple spaces'); // Normalized and trimmed
  });

  test('should track position correctly', () => {
    scanner.initText('Line 1\nLine 2\nLine 3');

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
    scanner.initText('Line 1\nLine 2\nLine 3');

    // Scan first line
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.StringLiteral);
    expect(scanner.tokenText).toBe('Line 1');

    // Scan newline
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.NewLineTrivia);

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
    expect(scanner.token).toBe(SyntaxKind.StringLiteral);
    expect(scanner.tokenText).toBe('Line 1');
  });

  describe('Extended normalisation inputs (Phase 0.0)', () => {
    test('Hello  world -> normalized', () => {
      const tokenTest = `
Hello  world
1
@1 StringLiteral "Hello world"
`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('Leading and trailing spaces normalized', () => {
      const tokenTest = `
  Leading and trailing  	 spaces  
1
@1 StringLiteral "Leading and trailing spaces"
`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('Tabs and multiple spaces normalized', () => {
      const tokenTest = `
Tabs	and	multiple		spaces
1
@1 StringLiteral "Tabs and multiple spaces"
`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('SingleSpace preserved', () => {
      const tokenTest = `
SingleSpace
1
@1 StringLiteral "SingleSpace"
`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('Blank/whitespace-only line produces single space token', () => {
      const tokenTest = `
  	  
1
@1 StringLiteral " "
`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('Emoji and CJK with multiple spaces normalized', () => {
      const tokenTest = `
Emoji and CJK: こんにちは  世界  🌍
1
@1 StringLiteral "Emoji and CJK: こんにちは 世界 🌍"
`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('Mixed whitespace and punctuation normalized', () => {
      const tokenTest = `
Mixed	 whitespace  and  punctuation!,? ;:
1
@1 StringLiteral "Mixed whitespace and punctuation!,? ;:"
`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('Multiple spaces inside words collapsed', () => {
      const tokenTest = `
Multiple    spaces    inside    words
1
@1 StringLiteral "Multiple spaces inside words"
`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('Asterisk between words - first literal segment', () => {
      const tokenTest = `
Asterisk*between*stars
1
@1 StringLiteral "Asterisk"
`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('Underscore within words preserved', () => {
      const tokenTest = `
Underscore_between_underscores
1
@1 StringLiteral "Underscore_between_underscores"
`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('Backtick inline code - first token', () => {
      const tokenTest = `
` + "`code`" + `
1
@1 BacktickToken
`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('HTML entities preserved and normalized spacing', () => {
      const tokenTest = `
Ampersand &amp; &lt; &gt;
1
@1 StringLiteral "Ampersand "
`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('Unicode combining and emoji preserved', () => {
      const tokenTest = `
Unicode combining: e\u000301 and emoji 👍🏼
1
@1 StringLiteral "Unicode combining: e\\u000301 and emoji 👍🏼"
`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });

  test('should handle complex multi-line text', () => {
    const tokenTest = `
First line of text
1
@1 "First line of text Second line with more content Third line here"
Second line with more content
Third line here

Final line after blank
1
@1 "Final line after blank"
`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('should set rollback flags appropriately', () => {
    const tokenTest = `
Line 1
1
@1 "Line 1 Line 2"
Line 2
`;

    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('should handle setText with start and length parameters', () => {
    scanner.initText('PREFIX:Line 1\nLine 2:SUFFIX', 7, 13); // Just "Line 1\nLine 2"

    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.StringLiteral);
    expect(scanner.tokenText).toBe('Line 1 Line 2');

    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.EndOfFileToken);
  });
});