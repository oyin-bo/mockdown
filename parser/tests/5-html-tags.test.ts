import { describe, expect, test } from 'vitest';
import { verifyTokens } from './verify-tokens';

describe('HTML Tags - Stage 4', () => {
  test('basic opening tags', () => {
  const tokenTest = `
<div>
12  3
@1 LessThanToken
@2 HtmlTagName "div"  
@3 GreaterThanToken
`;
  expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('basic closing tags', () => {
  const tokenTest = `
</span>
1 2   3
@1 LessThanSlashToken
@2 HtmlTagName "span"
@3 GreaterThanToken
`;
  expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('self-closing tags', () => {
  const tokenTest = `
<br/>
12 3
@1 LessThanToken
@2 HtmlTagName "br"
@3 SlashGreaterThanToken
`;
  expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('custom element tags', () => {
  const tokenTest = `
<x-custom-el>
12          3
@1 LessThanToken
@2 HtmlTagName "x-custom-el"
@3 GreaterThanToken
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
@1 LessThanToken
@2 GreaterThanToken
`;
  expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });
});