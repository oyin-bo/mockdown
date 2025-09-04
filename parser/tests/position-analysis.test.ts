/**
 * Debug token positions carefully
 */
import { describe, test, expect } from 'vitest';
import { createScanner } from '../scanner/scanner.js';

describe('Token Position Analysis', () => {
  test('analyze token positions in multiline text', () => {
    const text = '  Hello\nWorld';
    console.log('Text:', JSON.stringify(text));
    console.log('Text character by character:');
    for (let i = 0; i < text.length; i++) {
      console.log(`  ${i}: ${JSON.stringify(text[i])} (${text.charCodeAt(i)})`);
    }
    
    const scanner = createScanner();
    scanner.initText(text);
    
    let tokenCount = 0;
    console.log('\nTokens:');
    while (scanner.token !== 1) { // EndOfFileToken
      scanner.scan();
      if (scanner.token === 1) break; // EndOfFileToken
      
      const start = scanner.offsetNext - scanner.tokenText.length;
      const end = scanner.offsetNext;
      
      console.log(`Token ${tokenCount}:`);
      console.log(`  Type: ${scanner.token}`);
      console.log(`  Text: ${JSON.stringify(scanner.tokenText)}`);
      console.log(`  Start: ${start}`);
      console.log(`  End: ${end}`);
      console.log(`  Flags: ${scanner.tokenFlags}`);
      
      tokenCount++;
    }
  });
});
