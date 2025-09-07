/**
 * Minimal test to debug ordered lists
 */

import { describe, test, expect } from 'vitest';
import { verifyTokens } from './verify-tokens.js';

describe('Debug Ordered Lists', () => {
  test('simple ordered list - what do we get?', () => {
    // Let's see what the scanner actually produces
    const actual = verifyTokens(`
1. item
1
@1 ListMarkerOrdered "1."`);
    
    console.log('=== ACTUAL OUTPUT ===');
    console.log(actual);
    console.log('=== END OUTPUT ===');
    
    // Let's see what happens if we ask for two tokens
    try {
      const withTwo = verifyTokens(`
1. item
12
@1 ListMarkerOrdered "1."
@3 StringLiteral " item"`);
      console.log('=== TWO TOKEN TEST PASSED ===');
    } catch (e) {
      console.log('=== TWO TOKEN TEST FAILED ===');
      console.log(e.message);
    }
  });
});