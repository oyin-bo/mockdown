import { describe, expect, test } from 'vitest';
import { verifyTokens } from './verify-tokens';

describe('HTML Entities - Stage 4', () => {
  test('named entities', () => {
    expect(verifyTokens(`
&amp; &lt; &gt; &quot; &apos; &nbsp;
1     7    13   20      28      35
@1 HtmlEntity "&amp;"
@7 HtmlEntity "&lt;"
@A HtmlEntity "&gt;"
@B HtmlEntity "&quot;"
@C HtmlEntity "&apos;"
@D HtmlEntity "&nbsp;"
`)).toBe(`
&amp; &lt; &gt; &quot; &apos; &nbsp;
1     7    13   20      28      35
@1 HtmlEntity "&amp;"
@7 HtmlEntity "&lt;"
@A HtmlEntity "&gt;"
@B HtmlEntity "&quot;"
@C HtmlEntity "&apos;"
@D HtmlEntity "&nbsp;"
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
1        A   C   F   H
@1 AmpersandToken "&"
@A AmpersandToken "&"
@C AmpersandToken "&"
@F AmpersandToken "&"
@H AmpersandToken "&"
`)).toBe(`
&invalid &amp &#; &#x; &#x1G;
1        A   C   F   H
@1 AmpersandToken "&"
@A AmpersandToken "&"
@C AmpersandToken "&"
@F AmpersandToken "&"
@H AmpersandToken "&"
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