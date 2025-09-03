/**
 * Parser Utilities
 * Helper functions for common parsing operations
 */

import { Scanner } from './scanner.js';
import { SyntaxKind, TokenFlags } from './token-types.js';

/**
 * Skips whitespace and trivia tokens
 */
export function skipTrivia(scanner: Scanner): void {
  while (true) {
    const token = scanner.getToken();
    if (token === SyntaxKind.WhitespaceTrivia || 
        token === SyntaxKind.TabTrivia) {
      scanner.scan();
    } else {
      break;
    }
  }
}

/**
 * Parses an expected token, returns true if found
 */
export function parseExpected(scanner: Scanner, kind: SyntaxKind): boolean {
  if (scanner.getToken() === kind) {
    scanner.scan();
    return true;
  }
  return false;
}

/**
 * Parses an optional token, returns true if found
 */
export function parseOptional(scanner: Scanner, kind: SyntaxKind): boolean {
  if (scanner.getToken() === kind) {
    scanner.scan();
    return true;
  }
  return false;
}

/**
 * Tries to parse using a callback, returns result or undefined if failed
 */
export function tryParse<T>(scanner: Scanner, callback: () => T | undefined): T | undefined {
  return scanner.tryScan(callback);
}

/**
 * Checks if current token is at line start
 */
export function isAtLineStart(scanner: Scanner): boolean {
  return !!(scanner.getTokenFlags() & TokenFlags.IsAtLineStart);
}

/**
 * Checks if current token has preceding line break
 */
export function hasPrecedingLineBreak(scanner: Scanner): boolean {
  return !!(scanner.getTokenFlags() & TokenFlags.PrecedingLineBreak);
}

/**
 * Checks if current token is a blank line
 */
export function isBlankLine(scanner: Scanner): boolean {
  return scanner.getToken() === SyntaxKind.NewLineTrivia && 
         !!(scanner.getTokenFlags() & TokenFlags.IsBlankLine);
}

/**
 * Gets the run length from token flags (for backticks, tildes, etc.)
 */
export function getRunLength(scanner: Scanner): number {
  const flags = scanner.getTokenFlags();
  return (flags & 0x3F0000) >> 16; // Extract 6-bit run length
}

/**
 * Checks if current position could start a list marker
 */
export function isListMarkerAhead(scanner: Scanner): boolean {
  const token = scanner.getToken();
  const flags = scanner.getTokenFlags();
  
  if (!isAtLineStart(scanner)) {
    return false;
  }
  
  // Unordered list markers
  if (token === SyntaxKind.AsteriskToken || 
      token === SyntaxKind.DashToken || 
      token === SyntaxKind.PlusToken) {
    return true;
  }
  
  // Ordered list markers
  if (token === SyntaxKind.NumericLiteral && 
      !!(flags & TokenFlags.IsOrderedListMarker)) {
    return true;
  }
  
  return false;
}

/**
 * Checks if current position could be a thematic break
 */
export function isThematicBreakAhead(scanner: Scanner): boolean {
  const token = scanner.getToken();
  
  if (!isAtLineStart(scanner)) {
    return false;
  }
  
  if (token === SyntaxKind.AsteriskToken || 
      token === SyntaxKind.DashToken || 
      token === SyntaxKind.UnderscoreToken) {
    const runLength = getRunLength(scanner);
    return runLength >= 3;
  }
  
  return false;
}

/**
 * Checks if next line could be a setext underline
 */
export function isSetextUnderlineAhead(scanner: Scanner): boolean {
  return scanner.lookAhead(() => {
    // Skip to next line
    while (scanner.getToken() !== SyntaxKind.NewLineTrivia && 
           scanner.getToken() !== SyntaxKind.EndOfFileToken) {
      scanner.scan();
    }
    
    if (scanner.getToken() === SyntaxKind.NewLineTrivia) {
      scanner.scan();
    }
    
    if (!isAtLineStart(scanner)) {
      return false;
    }
    
    const token = scanner.getToken();
    if (token === SyntaxKind.EqualsToken || token === SyntaxKind.DashToken) {
      // Check if it's a valid setext underline (only = or - characters)
      const start = scanner.getTokenStart();
      let pos = start;
      const source = scanner.getTokenText();
      
      while (pos < scanner.getTokenEnd()) {
        const ch = source.charCodeAt(pos - start);
        if (ch !== 61 && ch !== 45) { // = or -
          return false;
        }
        pos++;
      }
      return true;
    }
    
    return false;
  });
}

/**
 * Consumes tokens until a safe boundary for error recovery
 */
export function recoverToSafeBoundary(scanner: Scanner): { text: string; end: number } {
  const start = scanner.getTokenStart();
  let consumed = 0;
  const maxConsume = 1024; // Hard limit to avoid pathological cases
  
  while (scanner.getToken() !== SyntaxKind.EndOfFileToken && consumed < maxConsume) {
    const token = scanner.getToken();
    
    // Stop at block-level constructs
    if (isAtLineStart(scanner)) {
      if (token === SyntaxKind.HashToken ||
          token === SyntaxKind.BlockquoteToken ||
          isListMarkerAhead(scanner) ||
          isThematicBreakAhead(scanner) ||
          token === SyntaxKind.LessThanToken) {
        break;
      }
    }
    
    // Stop at blank lines
    if (isBlankLine(scanner)) {
      break;
    }
    
    // Stop at line breaks in inline mode
    if (token === SyntaxKind.NewLineTrivia) {
      break;
    }
    
    scanner.scan();
    consumed++;
  }
  
  const end = scanner.getTokenStart();
  const text = scanner.getTokenText().substring(start, end);
  
  return { text, end };
}

/**
 * Checks if a character is a valid HTML tag name start
 */
export function isTagNameStart(ch: number): boolean {
  return (ch >= 65 && ch <= 90) ||   // A-Z
         (ch >= 97 && ch <= 122);    // a-z
}

/**
 * Checks if a character is valid in an HTML tag name
 */
export function isTagNameChar(ch: number): boolean {
  return isTagNameStart(ch) ||
         (ch >= 48 && ch <= 57) ||   // 0-9
         ch === 45;                  // -
}
