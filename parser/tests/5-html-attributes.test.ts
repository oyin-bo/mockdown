import { describe, expect, test } from 'vitest';
import { verifyTokens } from './verify-tokens';

describe('HTML Attributes - Stage 4', () => {
  test('quoted double-quote attribute', () => {
    const tokenTest = `
<div class="value">
1    2    34      5
@1 HtmlTagOpenName "div"
@2 HtmlAttributeName "class"
@3 EqualsToken
@4 HtmlAttributeValue "value"
@5 GreaterThanToken
`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('quoted single-quote attribute', () => {
    const tokenTest = `
<div title='hello world'>
1    2    34            5
@1 HtmlTagOpenName "div"
@2 HtmlAttributeName "title"
@3 EqualsToken
@4 HtmlAttributeValue "hello world"
@5 GreaterThanToken
`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('unquoted attribute value', () => {
    const tokenTest = `
<div data-val=abc-123>
1    2       34      5
@1 HtmlTagOpenName "div"
@2 HtmlAttributeName "data-val"
@3 EqualsToken
@4 HtmlAttributeValue "abc-123"
@5 GreaterThanToken
`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('boolean attributes (no value)', () => {
    const tokenTest = `
<input disabled checked>
1      2        3      4
@1 HtmlTagOpenName "input"
@2 HtmlAttributeName "disabled"
@3 HtmlAttributeName "checked"
@4 GreaterThanToken
`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('attributes with entities inside quoted value', () => {
    const tokenTest = `
<div aria-label='Main &amp; Secondary'>
1    2         34                     5
@1 HtmlTagOpenName "div"
@2 HtmlAttributeName "aria-label"
@3 EqualsToken
@4 HtmlAttributeValue "Main & Secondary"
@5 GreaterThanToken
`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('malformed missing value after =', () => {
    const tokenTest = `
<div a=>
1    2 3
@1 HtmlTagOpenName "div"
@2 HtmlAttributeName "a"
@3 GreaterThanToken
`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('unterminated quoted value', () => {
    const tokenTest = `
<div a="unterminated>
1    2 3
@1 HtmlTagOpenName "div"
@2 HtmlAttributeName "a"
@3 HtmlAttributeValue "unterminated" Unterminated
`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('multiple attributes mix', () => {
    const tokenTest = `
<div class="cls" disabled data-user_id=abc-123 aria-label='x'>
1    2    34     5        6           78       9         AB  C
@1 HtmlTagOpenName "div"
@2 HtmlAttributeName "class"
@3 EqualsToken
@4 HtmlAttributeValue "cls"
@5 HtmlAttributeName "disabled"
@6 HtmlAttributeName "data-user_id"
@7 EqualsToken
@8 HtmlAttributeValue "abc-123"
@9 HtmlAttributeName "aria-label"
@A EqualsToken
@B HtmlAttributeValue "x"
@C GreaterThanToken
`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('attribute name with colon and dots', () => {
    const tokenTest = `
<div xml:lang="en-US" data.test='ok'>
1    2       34       5        67   8
@1 HtmlTagOpenName "div"
@2 HtmlAttributeName "xml:lang"
@3 EqualsToken
@4 HtmlAttributeValue "en-US"
@5 HtmlAttributeName "data.test"
@6 EqualsToken
@7 HtmlAttributeValue "ok"
@8 GreaterThanToken
`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('percent-decoding in quoted value', () => {
    const tokenTest = `
<a href="https%3A//example.com">
1  2   34                      5
@1 HtmlTagOpenName "a"
@2 HtmlAttributeName "href"
@3 EqualsToken
@4 HtmlAttributeValue "https://example.com"
@5 GreaterThanToken
`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('newline via numeric entity normalized in quoted', () => {
    const tokenTest = `
<p title="Line 1&#10;Line 2">
1  2    34                  5
@1 HtmlTagOpenName "p"
@2 HtmlAttributeName "title"
@3 EqualsToken
@4 HtmlAttributeValue "Line 1\\nLine 2"
@5 GreaterThanToken
`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });
});
