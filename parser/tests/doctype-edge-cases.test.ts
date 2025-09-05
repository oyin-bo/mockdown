import { describe, test, expect } from 'vitest';
import { verifyTokens } from './verify-tokens';

describe('DOCTYPE Edge Cases (from 8-html-entities.md spec)', () => {
  test('handles > character inside quoted strings', () => {
    // This test should pass according to the spec but currently may fail
    const tokenTest = `
<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://example.com>in>quotes">
1
@1 HtmlDoctype "<!DOCTYPE html PUBLIC \\"-//W3C//DTD HTML 4.01//EN\\" \\"http://example.com>in>quotes\\">"`;
    
    // Let's see what the current implementation actually produces
    const result = verifyTokens(tokenTest);
    console.log('Current result:', result);
    
    // This will fail if the implementation is incorrect, showing us what it actually produces
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('handles unterminated DOCTYPE at EOF', () => {
    const tokenTest = `
<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN"
1
@1 HtmlDoctype "<!DOCTYPE html PUBLIC \\"-//W3C//DTD HTML 4.01//EN\\"" Unterminated`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('handles no-space-after-prefix edge case', () => {
    // The spec mentions <!DOCtype> should be accepted
    const tokenTest = `
<!DOCtype>
1
@1 HtmlDoctype "<!DOCtype>"`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });
});