import { describe, expect, test } from 'vitest';
import { verifyTokens } from './verify-tokens';

describe('XML-like Constructs - Stage 4', () => {
  test('CDATA section', () => {
    console.log('About to test CDATA section...');
    const inputStr = `<![CDATA[ var x = "<test>"; ]]>
1
@1 HtmlCdata "<![CDATA[ var x = \\"<test>\\"; ]]>"`;
    console.log('Input string:', JSON.stringify(inputStr));
    
    const result = verifyTokens(inputStr);
    console.log('verifyTokens completed, result:', JSON.stringify(result));
    
    expect(result).toBe(inputStr);
    console.log('Test completed successfully');
  });
});