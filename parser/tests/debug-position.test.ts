/**
 * Simple debug test for position alignment
 */

import { describe, test, expect } from 'vitest';
import { verifyTokens } from './scanner2-testing-infrastructure.js';
import { createScanner2 } from '../scanner2.js';
import { SyntaxKind2 } from '../scanner2-token-types.js';

describe('Debug Position Alignment', () => {
  test('simple ampersand fallback debug', () => {
    const result = verifyTokens(`&amp
123
@1 AmpersandToken
@2 StringLiteral`);
    console.log('Result for &amp:');
    console.log(result);
    
    // Let's also manually test the scanner
    const scanner = createScanner2();
    scanner.initText('&amp');
    
    console.log('\nManual scanning:');
    while (scanner.token !== SyntaxKind2.EndOfFileToken) {
      scanner.scan();
      console.log(`Token: ${scanner.token}, Text: "${scanner.tokenText}", Start: ${scanner.tokenStart}, End: ${scanner.offsetNext}`);
      if (scanner.token === SyntaxKind2.EndOfFileToken) break;
    }
  });
});