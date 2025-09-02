/**
 * Token verification system using @ numbered expectations
 * 
 * This implements the pattern requested by @mihailik where tests use
 * a format like:
 * 
 * const tokenTest = `
 * # Heading1
 * 1 2
 * @1 HeadingMarker ...optionally attributes to expect...
 * @2 Text
 * `;
 * 
 * expect(verifyTokens(tokenTest)).toBe(tokenTest);
 */

import { createScanner2 } from '../../scanner2.js';
import { SyntaxKind2, TokenFlags2 } from '../../scanner2-token-types.js';

/**
 * Verifies that the input text produces tokens matching the @numbered expectations
 * Returns the original input if verification passes, throws if it fails
 */
export function verifyTokens(tokenTest: string): string {
  const lines = tokenTest.split('\n');
  const inputLines: string[] = [];
  const expectations: TokenExpectation[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Check for @number expectation
    const expectMatch = trimmed.match(/^@(\d+)\s+(.+)$/);
    if (expectMatch) {
      const expectedIndex = parseInt(expectMatch[1], 10);
      const expectationText = expectMatch[2];
      
      expectations.push({
        index: expectedIndex,
        line: line,
        ...parseExpectation(expectationText)
      });
      continue;
    }
    
    // Regular input line
    inputLines.push(line);
  }
  
  // Extract actual input text (without @number lines)
  // If the first line is empty and we started with a template literal newline, remove it
  if (inputLines.length > 0 && inputLines[0] === '' && tokenTest.startsWith('\n')) {
    inputLines.shift();
  }
  
  const inputText = inputLines.join('\n');
  
  // Scan the input and verify tokens
  const scanner = createScanner2();
  scanner.setText(inputText);
  
  const actualTokens: ActualToken[] = [];
  let tokenCounter = 1;
  
  while (true) {
    scanner.scan();
    
    actualTokens.push({
      index: tokenCounter,
      kind: scanner.token,
      text: scanner.tokenText,
      flags: scanner.tokenFlags,
      pos: scanner.offset,
      end: scanner.offsetNext
    });
    
    if (scanner.token === SyntaxKind2.EndOfFileToken) {
      break;
    }
    
    tokenCounter++;
  }
  
  // Verify expectations against actual tokens
  for (const expectation of expectations) {
    const actualToken = actualTokens.find(t => t.index === expectation.index);
    
    if (!actualToken) {
      throw new Error(`Expected token @${expectation.index} not found. Only ${actualTokens.length} tokens were scanned.`);
    }
    
    // Verify token type
    if (expectation.kind && actualToken.kind !== expectation.kind) {
      throw new Error(
        `Token @${expectation.index}: Expected ${SyntaxKind2[expectation.kind]} but got ${SyntaxKind2[actualToken.kind]}\n` +
        `Expected: ${expectation.line}\n` +
        `Actual token: "${actualToken.text}"`
      );
    }
    
    // Verify token text
    if (expectation.text !== undefined && actualToken.text !== expectation.text) {
      throw new Error(
        `Token @${expectation.index}: Expected text "${expectation.text}" but got "${actualToken.text}"\n` +
        `Expected: ${expectation.line}`
      );
    }
    
    // Verify flags
    if (expectation.flags !== undefined && actualToken.flags !== expectation.flags) {
      const expectedFlags = describeFlagsFromNumber(expectation.flags);
      const actualFlags = describeFlagsFromNumber(actualToken.flags);
      throw new Error(
        `Token @${expectation.index}: Expected flags ${expectedFlags} but got ${actualFlags}\n` +
        `Expected: ${expectation.line}`
      );
    }
  }
  
  // If all verifications pass, return the original input
  return tokenTest;
}

interface TokenExpectation {
  index: number;
  line: string;
  kind?: SyntaxKind2;
  text?: string;
  flags?: TokenFlags2;
}

interface ActualToken {
  index: number;
  kind: SyntaxKind2;
  text: string;
  flags: TokenFlags2;
  pos: number;
  end: number;
}

/**
 * Parse an expectation line like "HeadingMarker flags=IsAtLineStart"
 */
function parseExpectation(expectationText: string): Partial<TokenExpectation> {
  const parts = expectationText.split(/\s+/);
  const result: Partial<TokenExpectation> = {};
  
  // First part is token type
  const tokenType = parts[0];
  if (tokenType && tokenType in SyntaxKind2) {
    result.kind = SyntaxKind2[tokenType as keyof typeof SyntaxKind2];
  }
  
  // Parse additional attributes
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    
    // Parse text="value"
    const textMatch = part.match(/^text="([^"]*)"$/);
    if (textMatch) {
      result.text = textMatch[1];
      continue;
    }
    
    // Parse flags=value
    const flagsMatch = part.match(/^flags=(.+)$/);
    if (flagsMatch) {
      result.flags = parseFlagsFromString(flagsMatch[1]);
      continue;
    }
  }
  
  return result;
}

/**
 * Parse flags from string like "IsAtLineStart|PrecedingLineBreak"
 */
function parseFlagsFromString(flagsStr: string): TokenFlags2 {
  if (flagsStr === 'None' || flagsStr === '0') {
    return TokenFlags2.None;
  }
  
  const flagNames = flagsStr.split('|');
  let flags = TokenFlags2.None;
  
  for (const flagName of flagNames) {
    const trimmed = flagName.trim();
    if (trimmed in TokenFlags2) {
      flags |= TokenFlags2[trimmed as keyof typeof TokenFlags2];
    }
  }
  
  return flags;
}

/**
 * Convert flags number back to readable string
 */
function describeFlagsFromNumber(flags: TokenFlags2): string {
  if (flags === TokenFlags2.None) {
    return 'None';
  }
  
  const flagNames: string[] = [];
  
  for (const [name, value] of Object.entries(TokenFlags2)) {
    if (typeof value === 'number' && value !== 0 && (flags & value) === value) {
      flagNames.push(name);
    }
  }
  
  return flagNames.length > 0 ? flagNames.join('|') : 'None';
}