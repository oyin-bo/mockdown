/**
 * Investigate actual token flags
 */
import { describe, test, expect } from 'vitest';
import { createScanner } from '../scanner/scanner.js';
import { SyntaxKind, TokenFlags } from '../scanner/token-types.js';

describe('Token Flags Investigation', () => {
  test('what flags does StringLiteral at line start have?', () => {
    const scanner = createScanner();
    scanner.initText('Hello');
    scanner.scan();
    
    console.log('Token:', scanner.token);
    console.log('Text:', scanner.tokenText);
    console.log('Flags:', scanner.tokenFlags);
    console.log('Flags binary:', scanner.tokenFlags.toString(2));
    console.log('IsAtLineStart?', (scanner.tokenFlags & TokenFlags.IsAtLineStart) ? 'Yes' : 'No');
    console.log('IsAtLineStart flag value:', TokenFlags.IsAtLineStart);
  });

  test('what flags does WhitespaceTrivia have?', () => {
    const scanner = createScanner();
    scanner.initText('  Hello');
    scanner.scan(); // Should be WhitespaceTrivia
    
    console.log('Token:', scanner.token);
    console.log('Text:', JSON.stringify(scanner.tokenText));
    console.log('Flags:', scanner.tokenFlags);
    console.log('Flags binary:', scanner.tokenFlags.toString(2));
    console.log('IsAtLineStart?', (scanner.tokenFlags & TokenFlags.IsAtLineStart) ? 'Yes' : 'No');
    
    scanner.scan(); // Should be StringLiteral
    console.log('\\nNext token:');
    console.log('Token:', scanner.token);
    console.log('Text:', JSON.stringify(scanner.tokenText));
    console.log('Flags:', scanner.tokenFlags);
    console.log('Flags binary:', scanner.tokenFlags.toString(2));
    console.log('IsAtLineStart?', (scanner.tokenFlags & TokenFlags.IsAtLineStart) ? 'Yes' : 'No');
  });
});
