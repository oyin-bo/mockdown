import { describe, test, expect } from 'vitest';
import { createScanner } from '../index.js';

describe('Direct Scanner Test', () => {
  test('check what scanner produces for thematic break', () => {
    const scanner = createScanner();
    scanner.initText('***\n');
    
    console.log('=== Scanning *** with newline ===');
    console.log('Initial state:', { token: scanner.token, text: scanner.tokenText, offset: scanner.offsetNext });
    
    scanner.scan();
    console.log('After 1st scan:', { token: scanner.token, text: JSON.stringify(scanner.tokenText), offset: scanner.offsetNext });
    
    scanner.scan();  
    console.log('After 2nd scan:', { token: scanner.token, text: JSON.stringify(scanner.tokenText), offset: scanner.offsetNext });
    
    scanner.scan();
    console.log('After 3rd scan:', { token: scanner.token, text: JSON.stringify(scanner.tokenText), offset: scanner.offsetNext });
    
    expect(true).toBe(true);
  });

  test('check two asterisks vs three', () => {
    console.log('=== Two asterisks ===');
    const scanner1 = createScanner();
    scanner1.initText('**\n');
    scanner1.scan();
    console.log('Two asterisks:', { token: scanner1.token, text: JSON.stringify(scanner1.tokenText) });
    
    console.log('=== Three asterisks ===');
    const scanner2 = createScanner();
    scanner2.initText('***\n');
    scanner2.scan();
    console.log('Three asterisks:', { token: scanner2.token, text: JSON.stringify(scanner2.tokenText) });
    
    expect(true).toBe(true);
  });
});