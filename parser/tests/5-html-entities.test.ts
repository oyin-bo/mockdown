import { describe, expect, test } from 'vitest';
import { verifyTokens } from './verify-tokens';

describe('HTML Entities - Stage 4', () => {
  test('named entities', () => {
    expect(verifyTokens(`
&amp; &lt; &gt; &quot; &apos; &nbsp;
1    2    3    4      5      6
@1 HtmlEntity "&amp;"
@2 HtmlEntity "&lt;"
@3 HtmlEntity "&gt;"
@4 HtmlEntity "&quot;"
@5 HtmlEntity "&apos;"
@6 HtmlEntity "&nbsp;"
`)).toBe(`
&amp; &lt; &gt; &quot; &apos; &nbsp;
1    2    3    4      5      6
@1 HtmlEntity "&amp;"
@2 HtmlEntity "&lt;"
@3 HtmlEntity "&gt;"
@4 HtmlEntity "&quot;"
@5 HtmlEntity "&apos;"
@6 HtmlEntity "&nbsp;"
`);
  });

  test('numeric entities', () => {
    expect(verifyTokens(`
&#65; &#x41;
1     2
@1 HtmlEntity "&#65;"
@2 HtmlEntity "&#x41;"
`)).toBe(`
&#65; &#x41;
1     2
@1 HtmlEntity "&#65;"
@2 HtmlEntity "&#x41;"
`);
  });

  test('invalid entities fallback to ampersand', () => {
    expect(verifyTokens(`
&invalid &amp &#; &#x; &#x1G;
1        2   3  4   5
@1 AmpersandToken "&"
@2 AmpersandToken "&"
@3 AmpersandToken "&"
@4 AmpersandToken "&"
@5 AmpersandToken "&"
`)).toBe(`
&invalid &amp &#; &#x; &#x1G;
1        2   3  4   5
@1 AmpersandToken "&"
@2 AmpersandToken "&"
@3 AmpersandToken "&"
@4 AmpersandToken "&"
@5 AmpersandToken "&"
`);
  });

  test('bare ampersand', () => {
    expect(verifyTokens(`
&
1
@1 AmpersandToken "&"
`)).toBe(`
&
1
@1 AmpersandToken "&"
`);
  });
});