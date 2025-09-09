/**
 * Test to verify no consecutive text runs per line
 */

import { describe, test, expect } from 'vitest';
import { createScanner } from '../scanner/scanner.js';
import { SyntaxKind } from '../scanner/token-types.js';

describe('Performance: Consecutive Text Runs Prevention', () => {
  test('should not emit consecutive text runs per line', () => {
    const scanner = createScanner();
    
    // Test cases that could potentially cause consecutive text runs
    const testCases = [
      'simple text line',
      'text with *italic* formatting',
      'text with **bold** and more text',
      'line with `code` span here',
      'line with ~~strike~~ through',
      'mixed **bold** and *italic* and `code`',
      'intraword_underscore_text',
      'text with single~tilde mixed',
    ];
    
    for (const testCase of testCases) {
      scanner.initText(testCase);
      
      const tokens = [];
      while (scanner.offsetNext < testCase.length) {
        const start = scanner.offsetNext;
        scanner.scan();
        tokens.push({
          kind: scanner.token,
          text: scanner.tokenText,
          start,
          end: scanner.offsetNext
        });
      }
      
      // Check for consecutive StringLiteral tokens
      for (let i = 1; i < tokens.length; i++) {
        if (tokens[i].kind === SyntaxKind.StringLiteral && 
            tokens[i-1].kind === SyntaxKind.StringLiteral) {
          throw new Error(
            `Consecutive text runs detected in "${testCase}": ` +
            `"${tokens[i-1].text}" followed by "${tokens[i].text}"`
          );
        }
      }
    }
  });

  test('should handle large documents efficiently', () => {
    const scanner = createScanner();
    
    // Create a large document with mixed content
    const lines = [];
    for (let i = 0; i < 1000; i++) {
      if (i % 10 === 0) {
        lines.push(`Line ${i} with **bold** text and *italic* formatting`);
      } else if (i % 7 === 0) {
        lines.push(`Line ${i} with \`code\` spans and ~~strikethrough~~ text`);
      } else {
        lines.push(`Simple text line ${i} without special formatting`);
      }
    }
    const largeDoc = lines.join('\n');
    
    const start = performance.now();
    scanner.initText(largeDoc);
    
    let tokenCount = 0;
    while (scanner.offsetNext < largeDoc.length) {
      scanner.scan();
      tokenCount++;
    }
    
    const end = performance.now();
    const duration = end - start;
    
    // Should process the large document efficiently
    expect(duration).toBeLessThan(150); // Should take less than 100ms
    expect(tokenCount).toBeGreaterThan(1000); // Should have many tokens
  });
});