import { describe, expect, test } from 'vitest';
import { verifyTokens } from './verify-tokens';

describe('HTML Tags - Stage 4', () => {
  test('basic opening tags', () => {
    expect(verifyTokens(`
<div>
1 2 3
@1 LessThanToken
@2 HtmlTagName "div"  
@3 GreaterThanToken
`)).toBe(`
<div>
1 2 3
@1 LessThanToken
@2 HtmlTagName "div"  
@3 GreaterThanToken
`);
  });

  test('basic closing tags', () => {
    expect(verifyTokens(`
</span>
1  2   3
@1 LessThanSlashToken
@2 HtmlTagName "span"
@3 GreaterThanToken
`)).toBe(`
</span>
1  2   3
@1 LessThanSlashToken
@2 HtmlTagName "span"
@3 GreaterThanToken
`);
  });

  test('self-closing tags', () => {
    expect(verifyTokens(`
<br/>
1 2 3
@1 LessThanToken
@2 HtmlTagName "br"
@3 SlashGreaterThanToken
`)).toBe(`
<br/>
1 2 3
@1 LessThanToken
@2 HtmlTagName "br"
@3 SlashGreaterThanToken
`);
  });

  test('custom element tags', () => {
    expect(verifyTokens(`
<x-custom-el>
1 2 3
@1 LessThanToken
@2 HtmlTagName "x-custom-el"
@3 GreaterThanToken
`)).toBe(`
<x-custom-el>
1 2 3
@1 LessThanToken
@2 HtmlTagName "x-custom-el"
@3 GreaterThanToken
`);
  });

  test('malformed tags fallback to text', () => {
    expect(verifyTokens(`
<1bad>
1 2
@1 LessThanToken
@2 StringLiteral "1bad>"
`)).toBe(`
<1bad>
1 2
@1 LessThanToken
@2 StringLiteral "1bad>"
`);
  });

  test('bare less than and greater than', () => {
    expect(verifyTokens(`
< >
1 2
@1 LessThanToken
@2 GreaterThanToken
`)).toBe(`
< >
1 2
@1 LessThanToken
@2 GreaterThanToken
`);
  });
});