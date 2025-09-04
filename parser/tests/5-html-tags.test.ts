import { describe, expect, test } from 'vitest';
import { verifyTokens } from './verify-tokens';

describe('HTML Tags - Stage 4', () => {
  test('basic opening tags', () => {
    expect(verifyTokens(`
<div>
1234
@1 LessThanToken
@2 HtmlTagName "div"  
@4 GreaterThanToken
`)).toBe(`
<div>
1234
@1 LessThanToken
@2 HtmlTagName "div"  
@4 GreaterThanToken
`);
  });

  test('basic closing tags', () => {
    expect(verifyTokens(`
</span>
12    6
@1 LessThanSlashToken
@2 HtmlTagName "span"
@6 GreaterThanToken
`)).toBe(`
</span>
12    6
@1 LessThanSlashToken
@2 HtmlTagName "span"
@6 GreaterThanToken
`);
  });

  test('self-closing tags', () => {
    expect(verifyTokens(`
<br/>
12 4
@1 LessThanToken
@2 HtmlTagName "br"
@4 SlashGreaterThanToken
`)).toBe(`
<br/>
12 4
@1 LessThanToken
@2 HtmlTagName "br"
@4 SlashGreaterThanToken
`);
  });

  test('custom element tags', () => {
    expect(verifyTokens(`
<x-custom-el>
12          A
@1 LessThanToken
@2 HtmlTagName "x-custom-el"
@A GreaterThanToken
`)).toBe(`
<x-custom-el>
12          A
@1 LessThanToken
@2 HtmlTagName "x-custom-el"
@A GreaterThanToken
`);
  });

  test('malformed tags fallback to text', () => {
    expect(verifyTokens(`
<1bad>
12   6
@1 LessThanToken
@2 StringLiteral "1bad"
@6 GreaterThanToken
`)).toBe(`
<1bad>
12   6
@1 LessThanToken
@2 StringLiteral "1bad"
@6 GreaterThanToken
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