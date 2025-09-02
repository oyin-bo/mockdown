import { createScanner2 } from './parser/scanner2.ts';

// Test to debug flags
const scanner = createScanner2();
scanner.initText('<div>');
scanner.scan();

console.log('Token:', scanner.token);
console.log('Text:', scanner.tokenText);
console.log('Flags:', scanner.tokenFlags);
console.log('Flags binary:', scanner.tokenFlags.toString(2));

// Calculate individual flags
console.log('IsAtLineStart (2):', !!(scanner.tokenFlags & 2));
console.log('ContainsHtmlBlock (16384):', !!(scanner.tokenFlags & 16384));
console.log('Unterminated (32768):', !!(scanner.tokenFlags & 32768));
console.log('PrecedingLineBreak (1):', !!(scanner.tokenFlags & 1));