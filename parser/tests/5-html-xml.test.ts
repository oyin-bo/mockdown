import { describe, expect, test } from 'vitest';
import { verifyTokens } from './verify-tokens';

describe('XML-like Constructs - Stage 4', () => {
  test('simple CDATA section', () => {
  const tokenTest = `<![CDATA[test]]>
1
@1 HtmlCdata "<![CDATA[test]]>"`;
  expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('simple processing instruction', () => {
  const tokenTest = `<?xml?>
1
@1 HtmlProcessingInstruction "<?xml?>"`;
  expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('CDATA with simple content', () => {
  const tokenTest = `<![CDATA[hello world]]>
1
@1 HtmlCdata "<![CDATA[hello world]]>"`;
  expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('processing instruction with version', () => {
  const tokenTest = `<?xml version=1.0?>
1
@1 HtmlProcessingInstruction "<?xml version=1.0?>"`;
  expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('CDATA with XML-like content', () => {
  const tokenTest = `<![CDATA[<tag>content</tag>]]>
1
@1 HtmlCdata "<![CDATA[<tag>content</tag>]]>"`;
  expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('empty CDATA section', () => {
  const tokenTest = `<![CDATA[]]>
1
@1 HtmlCdata "<![CDATA[]]>"`;
  expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('processing instruction with target', () => {
  const tokenTest = `<?target?>
1
@1 HtmlProcessingInstruction "<?target?>"`;
  expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('CDATA ignoring XML constructs inside', () => {
  const tokenTest = `<![CDATA[<!-- comment --> <?pi?>]]>
1
@1 HtmlCdata "<![CDATA[<!-- comment --> <?pi?>]]>"`;
  expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('CDATA with JavaScript-like content', () => {
  const tokenTest = `<![CDATA[if (x < 5) return;]]>
1
@1 HtmlCdata "<![CDATA[if (x < 5) return;]]>"`;
  expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('assertion line with escaped quotes does not hang', () => {
    // This reproduces the original failing pattern where an assertion contains escaped quotes
    // inside a JSON string, e.g. \"<test>\". The verifier must parse the assertion and
    // not enter an infinite loop.
  const tokenTest = `<![CDATA[ var x = \"<test>\"; ]]>
1
@1 HtmlCdata "<![CDATA[ var x = \\\"<test>\\\"; ]]>"`;
  expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('simple escaped quote inside JSON assertion', () => {
  const tokenTest = `<![CDATA[ var x = \"<test>\"; ]]>
1
@1 HtmlCdata "<![CDATA[ var x = \\\"<test>\\\"; ]]>"`;
  expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('double backslash before quote (even number) inside CDATA', () => {
  const tokenTest = `<![CDATA[ s = "end" ]]>
1
@1 HtmlCdata "<![CDATA[ s = \\\"end\\\" ]]>"`;
  expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('triple backslash before quote (odd number) inside CDATA', () => {
  const tokenTest = `<![CDATA[ s = \"end\" ]]>
1
@1 HtmlCdata "<![CDATA[ s = \\"end\\" ]]>"`;
  expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('named HTML entity for quote inside CDATA', () => {
  const tokenTest = `<![CDATA[ &quot;inside&quot; ]]>
1
@1 HtmlCdata "<![CDATA[ &quot;inside&quot; ]]>"`;
  expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('numeric decimal entity for quote inside CDATA', () => {
  const tokenTest = `<![CDATA[ &#34;number&#34; ]]>
1
@1 HtmlCdata "<![CDATA[ &#34;number&#34; ]]>"`;
  expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('numeric hex entity for quote inside CDATA', () => {
  const tokenTest = `<![CDATA[ &#x22;hex&#x22; ]]>
1
@1 HtmlCdata "<![CDATA[ &#x22;hex&#x22; ]]>"`;
  expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('combination: escaped quote plus entity inside CDATA', () => {
  const tokenTest = `<![CDATA[ mix = \"&quot;\" ]]>
1
@1 HtmlCdata "<![CDATA[ mix = \\\"&quot;\\\" ]]>"`;
  expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('unicode escape sequences inside JSON string within CDATA', () => {
  const tokenTest = `<![CDATA[ u = \"\\u0022\\u003C\\u003E\" ]]>
1
@1 HtmlCdata "<![CDATA[ u = \\"\\\\u0022\\\\u003C\\\\u003E\\" ]]>"`;
  expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });
});