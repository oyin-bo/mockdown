import { describe, expect, test } from 'vitest';

import { verifyTokens } from './verify-tokens';

describe('HTML Tags - Stage 4', () => {
  test('basic opening tags', () => {
    const tokenTest = `
<div>
1   2
@1 HtmlTagOpenName "div"  
@2 GreaterThanToken
`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('basic closing tags', () => {
    const tokenTest = `
</span>
1     2
@1 HtmlTagCloseName "span"
@2 GreaterThanToken
`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('self-closing tags', () => {
    const tokenTest = `
<br/>
1  2
@1 HtmlTagOpenName "br"
@2 SlashGreaterThanToken
`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('custom element tags', () => {
    const tokenTest = `
<x-custom-el>
1           2
@1 HtmlTagOpenName "x-custom-el"
@2 GreaterThanToken
`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('malformed tags fallback to text', () => {
    const tokenTest = `
<1bad>
1
@1 StringLiteral "<1bad>"
`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('bare less than and greater than', () => {
    const tokenTest = `
< >
1 2
@1 StringLiteral "<"
@2 GreaterThanToken
`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });
});