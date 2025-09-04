/**
 * Simple test to debug Stage 4 implementation
 */

import { describe, test, expect } from 'vitest';
import { createScanner } from '../scanner/scanner.js';
import { SyntaxKind } from '../scanner/token-types.js';

describe('Stage 4 Debug', () => {
  test('simple entity test', () => {
    const scanner = createScanner();
    scanner.initText('&amp;');
    
    scanner.scan();
    console.log('Token:', scanner.token, 'Text:', JSON.stringify(scanner.tokenText));
    expect(scanner.token).toBe(SyntaxKind.EntityToken);
    expect(scanner.tokenText).toBe('&amp;');
  });
});