/**
 * Simple test for thematic breaks
 */

import { describe, test, expect } from 'vitest';
import { verifyTokens } from './verify-tokens.js';

describe('Simple Thematic Break Test', () => {
  test('verify thematic break token is emitted', () => {
    const tokenTest = `
***
1
@1 ThematicBreak`;
    
    const result = verifyTokens(tokenTest);
    expect(result).toBe(tokenTest);
  });
});