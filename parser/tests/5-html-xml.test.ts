import { describe, expect, test } from 'vitest';
import { verifyTokens } from './verify-tokens';

describe('XML-like Constructs - Stage 4', () => {
  test('simple CDATA section', () => {
    expect(verifyTokens(`<![CDATA[test]]>
1
@1 HtmlCdata "<![CDATA[test]]>"`)).toBe(`<![CDATA[test]]>
1
@1 HtmlCdata "<![CDATA[test]]>"`);
  });

  test('simple processing instruction', () => {
    expect(verifyTokens(`<?xml?>
1
@1 HtmlProcessingInstruction "<?xml?>"`)).toBe(`<?xml?>
1
@1 HtmlProcessingInstruction "<?xml?>"`);
  });

  test('CDATA with simple content', () => {
    expect(verifyTokens(`<![CDATA[hello world]]>
1
@1 HtmlCdata "<![CDATA[hello world]]>"`)).toBe(`<![CDATA[hello world]]>
1
@1 HtmlCdata "<![CDATA[hello world]]>"`);
  });

  test('processing instruction with version', () => {
    expect(verifyTokens(`<?xml version=1.0?>
1
@1 HtmlProcessingInstruction "<?xml version=1.0?>"`)).toBe(`<?xml version=1.0?>
1
@1 HtmlProcessingInstruction "<?xml version=1.0?>"`);
  });

  test('CDATA with XML-like content', () => {
    expect(verifyTokens(`<![CDATA[<tag>content</tag>]]>
1
@1 HtmlCdata "<![CDATA[<tag>content</tag>]]>"`)).toBe(`<![CDATA[<tag>content</tag>]]>
1
@1 HtmlCdata "<![CDATA[<tag>content</tag>]]>"`);
  });

  test('empty CDATA section', () => {
    expect(verifyTokens(`<![CDATA[]]>
1
@1 HtmlCdata "<![CDATA[]]>"`)).toBe(`<![CDATA[]]>
1
@1 HtmlCdata "<![CDATA[]]>"`);
  });

  test('processing instruction with target', () => {
    expect(verifyTokens(`<?target?>
1
@1 HtmlProcessingInstruction "<?target?>"`)).toBe(`<?target?>
1
@1 HtmlProcessingInstruction "<?target?>"`);
  });

  test('CDATA ignoring XML constructs inside', () => {
    expect(verifyTokens(`<![CDATA[<!-- comment --> <?pi?>]]>
1
@1 HtmlCdata "<![CDATA[<!-- comment --> <?pi?>]]>"`)).toBe(`<![CDATA[<!-- comment --> <?pi?>]]>
1
@1 HtmlCdata "<![CDATA[<!-- comment --> <?pi?>]]>"`);
  });

  test('CDATA with JavaScript-like content', () => {
    expect(verifyTokens(`<![CDATA[if (x < 5) return;]]>
1
@1 HtmlCdata "<![CDATA[if (x < 5) return;]]>"`)).toBe(`<![CDATA[if (x < 5) return;]]>
1
@1 HtmlCdata "<![CDATA[if (x < 5) return;]]>"`);
  });
});