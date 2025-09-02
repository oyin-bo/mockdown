/**
 * Scanner2 Stage 4 Tests: HTML and Entities
 * Tests for HTML tag parsing and entity recognition using verifyTokens style
 */

import { describe, test, expect } from 'vitest';
import { verifyTokens } from './scanner2-testing-infrastructure.js';

describe('Scanner2 Stage 4: HTML Entities', () => {
  test('named entities are recognized', () => {
    expect(verifyTokens(`
&amp;
1
@1 HtmlEntity text: "&amp;"`)).toBe(`
&amp;
1
@1 HtmlEntity text: "&amp;"`);
  });
  
  test('multiple named entities', () => {
    expect(verifyTokens(`
&lt; &gt; &quot; &apos; &nbsp;
1     2     3       4       5
@1 HtmlEntity text: "&lt;"
@2 HtmlEntity text: "&gt;"
@3 HtmlEntity text: "&quot;"
@4 HtmlEntity text: "&apos;"
@5 HtmlEntity text: "&nbsp;"`)).toBe(`
&lt; &gt; &quot; &apos; &nbsp;
1     2     3       4       5
@1 HtmlEntity text: "&lt;"
@2 HtmlEntity text: "&gt;"
@3 HtmlEntity text: "&quot;"
@4 HtmlEntity text: "&apos;"
@5 HtmlEntity text: "&nbsp;"`);
  });

  test('numeric decimal entities', () => {
    expect(verifyTokens(`
&#65;
1
@1 HtmlEntity text: "&#65;"`)).toBe(`
&#65;
1
@1 HtmlEntity text: "&#65;"`);
  });

  test('numeric hexadecimal entities', () => {
    expect(verifyTokens(`
&#x41;
1
@1 HtmlEntity text: "&#x41;"`)).toBe(`
&#x41;
1
@1 HtmlEntity text: "&#x41;"`);
  });

  test('invalid entities fall back to ampersand', () => {
    expect(verifyTokens(`&invalid
1       2
@1 AmpersandToken text: "&"
@2 StringLiteral text: "invalid"`)).toBe(`&invalid
1       2
@1 AmpersandToken text: "&"
@2 StringLiteral text: "invalid"`);
  });

  test('unterminated entities fall back to ampersand', () => {
    expect(verifyTokens(`&amp
1   2
@1 AmpersandToken text: "&"
@2 StringLiteral text: "amp"`)).toBe(`&amp
1   2
@1 AmpersandToken text: "&"
@2 StringLiteral text: "amp"`);
  });

  test('entities mixed with text', () => {
    expect(verifyTokens(`Tom &amp; Jerry
1   2     3     4
@1 StringLiteral text: "Tom"
@2 HtmlEntity text: "&amp;"
@3 StringLiteral text: "Jerry"`)).toBe(`Tom &amp; Jerry
1   2     3     4
@1 StringLiteral text: "Tom"
@2 HtmlEntity text: "&amp;"
@3 StringLiteral text: "Jerry"`);
  });
});

describe('Scanner2 Stage 4: HTML Tags', () => {
  test('simple opening tag', () => {
    expect(verifyTokens(`
<div>
1
@1 HtmlText text: "<div>"`)).toBe(`
<div>
1
@1 HtmlText text: "<div>"`);
  });

  test('simple closing tag', () => {
    expect(verifyTokens(`
</div>
1
@1 HtmlText text: "</div>"`)).toBe(`
</div>
1
@1 HtmlText text: "</div>"`);
  });

  test('self-closing tag', () => {
    expect(verifyTokens(`
<br/>
1
@1 HtmlText text: "<br/>"`)).toBe(`
<br/>
1
@1 HtmlText text: "<br/>"`);
  });

  test('tag with attributes', () => {
    expect(verifyTokens(`
<div class="content" id="main">
1
@1 HtmlText text: "<div class=\"content\" id=\"main\">"`)).toBe(`
<div class="content" id="main">
1
@1 HtmlText text: "<div class=\"content\" id=\"main\">"`);
  });

  test('HTML comment', () => {
    expect(verifyTokens(`
<!-- This is a comment -->
1
@1 HtmlComment text: "<!-- This is a comment -->"`)).toBe(`
<!-- This is a comment -->
1
@1 HtmlComment text: "<!-- This is a comment -->"`);
  });

  test('isolated angle brackets', () => {
    expect(verifyTokens(`
x < y > z
1 2 3 4 5
@1 StringLiteral text: "x"
@2 LessThanToken text: "<"
@3 StringLiteral text: "y"
@4 GreaterThanToken text: ">"
@5 StringLiteral text: "z"`)).toBe(`
x < y > z
1 2 3 4 5
@1 StringLiteral text: "x"
@2 LessThanToken text: "<"
@3 StringLiteral text: "y"
@4 GreaterThanToken text: ">"
@5 StringLiteral text: "z"`);
  });

  test('block-level tag at line start gets HTML block flag', () => {
    expect(verifyTokens(`<div>
1
@1 HtmlText flags: 16386`)).toBe(`<div>
1
@1 HtmlText flags: 16386`);
  });

  test('inline tag does not get HTML block flag', () => {
    expect(verifyTokens(`
<span>
1
@1 HtmlText`)).toBe(`
<span>
1
@1 HtmlText`);
  });
});

describe('Scanner2 Stage 4: Raw Text Content', () => {
  test('script tag enables raw text mode', () => {
    expect(verifyTokens(`
<script>
var x = "not &amp; markdown";
</script>
1       2
@1 HtmlText text: "<script>"
@2 HtmlText flags: 4096`)).toBe(`
<script>
var x = "not &amp; markdown";
</script>
1       2
@1 HtmlText text: "<script>"
@2 HtmlText flags: 4096`);
  });

  test('style tag enables raw text mode', () => {
    expect(verifyTokens(`
<style>
body { font-size: 16px; }
</style>
1      2
@1 HtmlText text: "<style>"
@2 HtmlText flags: 4096`)).toBe(`
<style>
body { font-size: 16px; }
</style>
1      2
@1 HtmlText text: "<style>"
@2 HtmlText flags: 4096`);
  });
});

describe('Scanner2 Stage 4: RCDATA Content', () => {
  test('textarea tag enables RCDATA mode with entity processing', () => {
    expect(verifyTokens(`
<textarea>
Tom &amp; Jerry
</textarea>
1         2     3
@1 HtmlText text: "<textarea>"
@2 HtmlText flags: 8192
@3 HtmlEntity flags: 8192`)).toBe(`
<textarea>
Tom &amp; Jerry
</textarea>
1         2     3
@1 HtmlText text: "<textarea>"
@2 HtmlText flags: 8192
@3 HtmlEntity flags: 8192`);
  });

  test('title tag enables RCDATA mode', () => {
    expect(verifyTokens(`
<title>
Page &lt; Title
</title>
1      2    3
@1 HtmlText text: "<title>"
@2 HtmlText flags: 8192
@3 HtmlEntity flags: 8192`)).toBe(`
<title>
Page &lt; Title
</title>
1      2    3
@1 HtmlText text: "<title>"
@2 HtmlText flags: 8192
@3 HtmlEntity flags: 8192`);
  });
});

describe('Scanner2 Stage 4: Error Conditions', () => {
  test('unterminated HTML comment', () => {
    expect(verifyTokens(`
<!-- unterminated comment
1
@1 HtmlComment flags: 32768`)).toBe(`
<!-- unterminated comment
1
@1 HtmlComment flags: 32768`);
  });

  test('unterminated HTML tag', () => {
    expect(verifyTokens(`
<div class="test"
1
@1 HtmlText flags: 32768`)).toBe(`
<div class="test"
1
@1 HtmlText flags: 32768`);
  });

  test('unterminated raw text content', () => {
    expect(verifyTokens(`
<script>
var x = 1;
1       2
@1 HtmlText text: "<script>"
@2 HtmlText flags: 36864`)).toBe(`
<script>
var x = 1;
1       2
@1 HtmlText text: "<script>"
@2 HtmlText flags: 36864`);
  });
});

describe('Scanner2 Stage 4: Mixed Content', () => {
  test('HTML and markdown mixed properly', () => {
    expect(verifyTokens(`
Text with <em>emphasis</em> and **bold**
1         2            3     4   5
@1 StringLiteral text: "Text with"
@2 HtmlText text: "<em>"
@3 StringLiteral text: "emphasis"
@4 HtmlText text: "</em>"
@5 StringLiteral text: "and"`)).toBe(`
Text with <em>emphasis</em> and **bold**
1         2            3     4   5
@1 StringLiteral text: "Text with"
@2 HtmlText text: "<em>"
@3 StringLiteral text: "emphasis"
@4 HtmlText text: "</em>"
@5 StringLiteral text: "and"`);
  });

  test('entities and emphasis mixed', () => {
    expect(verifyTokens(`
*Tom &amp; Jerry*
1    2     3     4
@1 AsteriskToken
@2 StringLiteral text: "Tom"
@3 HtmlEntity text: "&amp;"
@4 StringLiteral text: "Jerry"`)).toBe(`
*Tom &amp; Jerry*
1    2     3     4
@1 AsteriskToken
@2 StringLiteral text: "Tom"
@3 HtmlEntity text: "&amp;"
@4 StringLiteral text: "Jerry"`);
  });
});