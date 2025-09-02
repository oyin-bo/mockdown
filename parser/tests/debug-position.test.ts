/**
 * Debug test to understand position mapping
 */

import { describe, test } from 'vitest';
import { verifyTokens } from './scanner2-test-infrastructure.js';

describe('Scanner2 Position Debug', () => {
  test('debug position mapping', () => {
    console.log('=== Debug Test 1: Hello World ===');
    const test1 = `Hello World
1          E
@1 StringLiteral
@E EndOfFileToken`;
    
    const result1 = verifyTokens(test1);
    console.log('Result 1:', result1);
    
    console.log('\n=== Debug Test 2: Empty Input ===');
    const test2 = `
1
@1 EndOfFileToken`;
    
    const result2 = verifyTokens(test2);
    console.log('Result 2:', result2);
  });
});