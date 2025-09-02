/**
 * Debug script directly in a test to understand Scanner2 behavior
 */

import { describe, test } from 'vitest';
import { createScanner2 } from '../scanner2.js';
import { SyntaxKind2 } from '../scanner2-token-types.js';

function getTokenName(kind: SyntaxKind2): string {
  switch (kind) {
    case SyntaxKind2.Unknown: return 'Unknown';
    case SyntaxKind2.EndOfFileToken: return 'EndOfFileToken';
    case SyntaxKind2.StringLiteral: return 'StringLiteral';
    case SyntaxKind2.WhitespaceTrivia: return 'WhitespaceTrivia';
    case SyntaxKind2.NewLineTrivia: return 'NewLineTrivia';
    default: return `Unknown(${kind})`;
  }
}

function debugScan(text: string) {
  console.log(`=== Scanning "${text}" ===`);
  const scanner = createScanner2();
  scanner.initText(text);
  
  let tokenIndex = 0;
  while (true) {
    const prevOffset = scanner.offsetNext;
    scanner.scan();
    
    console.log(`Token ${tokenIndex}: kind=${scanner.token} (${getTokenName(scanner.token)}) text="${scanner.tokenText}" start=${prevOffset} end=${scanner.offsetNext}`);
    tokenIndex++;
    
    if (scanner.token === SyntaxKind2.EndOfFileToken) break;
  }
  console.log('');
}

describe('Scanner2 Debug', () => {
  test('debug various inputs', () => {
    debugScan('Hello World');
    debugScan('  Hello');
    debugScan('Line1\nLine2');
    debugScan('');
  });
});