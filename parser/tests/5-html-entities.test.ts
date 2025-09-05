import { describe, expect, test } from 'vitest';
import { verifyTokens } from './verify-tokens';

describe('HTML Entities - Stage 4', () => {
  test('named entities', () => {
  const tokenTest = `
&amp; &lt; &gt; &quot; &apos; &nbsp;
1     7    13   20      28      35
@1 HtmlEntity "&amp;"
@7 HtmlEntity "&lt;"
@A HtmlEntity "&gt;"
@B HtmlEntity "&quot;"
@C HtmlEntity "&apos;"
@D HtmlEntity "&nbsp;"
`;
  expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('numeric entities', () => {
  const tokenTest = `
&#65; &#x41;
1     2
@1 HtmlEntity "&#65;"
@2 HtmlEntity "&#x41;"
`;
  expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('invalid entities fallback to ampersand', () => {
  const tokenTest = `
&invalid &amp &#; &#x; &#x1G;
1        A   C   F   H
@1 AmpersandToken "&"
@A AmpersandToken "&"
@C AmpersandToken "&"
@F AmpersandToken "&"
@H AmpersandToken "&"
`;
  expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('bare ampersand', () => {
  const tokenTest = `
&
1
@1 AmpersandToken "&"
`;
  expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });
});