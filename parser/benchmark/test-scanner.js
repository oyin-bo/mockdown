// Simple test to verify the scanner import works
import { createScanner } from '../scanner/scanner.ts';

console.log('Testing scanner import...');

try {
  const scanner = createScanner();
  console.log('✓ Scanner created successfully');
  
  const testContent = 'Hello **world**!';
  scanner.initText(testContent);
  
  let tokenCount = 0;
  while (scanner.offsetNext < testContent.length) {
    scanner.scan();
    tokenCount++;
    console.log(`Token ${tokenCount}: ${scanner.token} "${scanner.tokenText}"`);
  }
  
  console.log(`✓ Scanned ${tokenCount} tokens successfully`);
  
} catch (error) {
  console.error('✗ Error:', error.message);
  process.exit(1);
}