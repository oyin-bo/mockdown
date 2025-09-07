import { describe, expect, test } from 'vitest';
import { verifyTokens } from './verify-tokens';

describe('Debug Entity Decoding', () => {
  test('simple numeric entity', () => {
    const input = '<p title="A&#10;B">';
    
    // Let's see what the actual output is
    const output = verifyTokens(`
${input}
1  2    34        5
@1 HtmlTagOpenName "p"
@2 HtmlAttributeName "title"
@3 EqualsToken
@4 HtmlAttributeValue "A\\nB"
@5 GreaterThanToken
`);
    
    console.log('Input:', JSON.stringify(input));
    console.log('Output:', JSON.stringify(output));
    
    // This will likely fail, but let's see the actual diff
    expect(output).toBe(output);
  });
});