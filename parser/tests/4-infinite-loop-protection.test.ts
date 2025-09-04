/**
 * Test for Scanner2 infinite loop protection
 * Testing that the scanner can handle edge cases that might cause infinite loops
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { createScanner, type Scanner, type ScannerDebugState } from '../scanner/scanner.js';
import { SyntaxKind, TokenFlags } from '../scanner/token-types.js';

describe('Scanner2 Infinite Loop Protection', () => {
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

  test('scanner makes progress on every call to scan()', () => {
    const text = 'Hello *world* with **bold** text';
    scanner.initText(text);
    
    const positions: number[] = [];
    let iterations = 0;
    const maxIterations = text.length + 10; // Safety limit
    
    // Start scanning
    scanner.scan();
    
    while ((scanner.token as SyntaxKind) !== SyntaxKind.EndOfFileToken && iterations < maxIterations) {
      const positionBefore = scanner.offsetNext;
      scanner.scan();
      const positionAfter = scanner.offsetNext;
      
      positions.push(positionAfter);
      
      // Verify position always advances (except for EOF)
      if ((scanner.token as SyntaxKind) !== SyntaxKind.EndOfFileToken) {
        expect(positionAfter).toBeGreaterThan(positionBefore);
      }
      
      iterations++;
    }
    
    // Should reach EOF without hitting iteration limit
    expect(iterations).toBeLessThan(maxIterations);
    expect(scanner.token as SyntaxKind).toBe(SyntaxKind.EndOfFileToken);
  });

  test('scanner handles malformed input gracefully', () => {
    // Test with various potentially problematic inputs
    const testCases = [
      '\0\0\0', // null characters
      '\u0001\u0002\u0003', // control characters
      'abc\x00def', // embedded null
      '\uFFFE\uFFFF', // non-characters
    ];
    
    for (const testText of testCases) {
      scanner.initText(testText);
      
      let iterations = 0;
      const maxIterations = testText.length + 10;
      
      scanner.scan(); // Start scanning
      while ((scanner.token as SyntaxKind) !== SyntaxKind.EndOfFileToken && iterations < maxIterations) {
        scanner.scan();
        iterations++;
      }
      
      // Should always terminate
      expect(iterations).toBeLessThan(maxIterations);
      expect(scanner.token as SyntaxKind).toBe(SyntaxKind.EndOfFileToken);
    }
  });

  test('scanner emits error tokens for problematic characters', () => {
    // This test would require actually triggering the infinite loop protection
    // For now, we test that the scanner can handle edge cases without crashing
    const text = '*_`~**__``~~';
    scanner.initText(text);
    
    const tokens: { kind: SyntaxKind; text: string; flags: TokenFlags }[] = [];
    
    scanner.scan(); // Start scanning
    while ((scanner.token as SyntaxKind) !== SyntaxKind.EndOfFileToken) {
      tokens.push({
        kind: scanner.token as SyntaxKind,
        text: scanner.tokenText,
        flags: scanner.tokenFlags
      });
      scanner.scan();
    }
    
    // Should successfully tokenize all characters
    expect(tokens.length).toBeGreaterThan(0);
    
    // Check that all character content is captured
    const totalTextLength = tokens
      .filter(t => t.kind !== SyntaxKind.EndOfFileToken)
      .reduce((sum, t) => sum + t.text.length, 0);
    
    expect(totalTextLength).toBe(text.length);
  });

  test('scanner position tracking remains consistent', () => {
    const text = 'Line 1\nLine 2\r\nLine 3\rLine 4';
    scanner.initText(text);
    
    let lastOffset = 0;
    
    scanner.scan(); // Start scanning
    while ((scanner.token as SyntaxKind) !== SyntaxKind.EndOfFileToken) {
      // Position should never go backwards
      expect(scanner.offsetNext).toBeGreaterThanOrEqual(lastOffset);
      
      // Fill debug state and verify consistency
      scanner.fillDebugState(debugState);
      expect(debugState.nextOffset).toBe(scanner.offsetNext);
      expect(debugState.currentToken).toBe(scanner.token as SyntaxKind);
      expect(debugState.currentTokenText).toBe(scanner.tokenText);
      expect(debugState.currentTokenFlags).toBe(scanner.tokenFlags);
      
      lastOffset = scanner.offsetNext;
      scanner.scan();
    }
  });

  test('scanner handles empty and whitespace-only input', () => {
    const testCases = ['', ' ', '\n', '\r\n', '\t', '   \n  \n  '];
    
    for (const testText of testCases) {
      scanner.initText(testText);
      
      let tokenCount = 0;
      scanner.scan(); // Start scanning
      while ((scanner.token as SyntaxKind) !== SyntaxKind.EndOfFileToken) {
        tokenCount++;
        
        // Should not get stuck in infinite loop
        expect(tokenCount).toBeLessThan(100);
        
        scanner.scan();
      }
      
      expect(scanner.token as SyntaxKind).toBe(SyntaxKind.EndOfFileToken);
    }
  });
});
