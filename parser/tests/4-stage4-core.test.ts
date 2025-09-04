/**
 * Tests for Stage 4: Entities and HTML - Core Functionality
 * Using Scanner2 Testing Infrastructure
 * 
 * Tests focused on Stage 4 entity and HTML tag recognition.
 */

import { describe, test, expect } from 'vitest';
import { verifyTokens } from './verify-tokens.js';

describe('Stage 4: Entities and HTML', () => {
  describe('Character Entities', () => {
    test('named entity recognition', () => {
      const tokenTest = `
&amp;
1
@1 EntityToken "&"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('multiple named entities', () => {
      const tokenTest = `
&lt;&gt;&amp;
1   2   3
@1 EntityToken "<"
@2 EntityToken ">"
@3 EntityToken "&"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('numeric entity recognition', () => {
      const tokenTest = `
&#65;
1
@1 EntityToken "A"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('hex numeric entity recognition', () => {
      const tokenTest = `
&#x41;
1
@1 EntityToken "A"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('hex entity with capital X', () => {
      const tokenTest = `
&#X41;
1
@1 EntityToken "A"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('entity within text', () => {
      const tokenTest = `
text &amp; more
     1
@1 EntityToken "&"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('incomplete entity treated as text', () => {
      const tokenTest = `
&incomplete
1
@1 StringLiteral "&incomplete"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('entity without semicolon treated as text', () => {
      const tokenTest = `
&amp more
1
@1 StringLiteral "&amp more"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('numeric entity without semicolon treated as text', () => {
      const tokenTest = `
&#65 more
1
@1 StringLiteral "&#65 more"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('empty entity reference treated as text', () => {
      const tokenTest = `
&;
1
@1 StringLiteral "&;"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });

  describe('HTML Tags', () => {
    test('basic opening tag', () => {
      const tokenTest = `
<div>
1
@1 LessThanToken "<"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('closing tag', () => {
      const tokenTest = `
</div>
1
@1 LessThanSlashToken "</"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('greater than token', () => {
      const tokenTest = `
<div>
    1
@1 GreaterThanToken ">"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('self-closing tag', () => {
      const tokenTest = `
<img />
     1
@1 SlashGreaterThanToken "/>"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('HTML tag with content', () => {
      const tokenTest = `
<div>content</div>
1           2
@1 LessThanToken "<"
@2 LessThanSlashToken "</"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('mixed HTML and text', () => {
      const tokenTest = `
text <span> more
     1
@1 LessThanToken "<"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('less than not followed by letter treated as text', () => {
      const tokenTest = `
< not a tag
1
@1 StringLiteral "< not a tag"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('standalone greater than', () => {
      const tokenTest = `
text > more
     1
@1 GreaterThanToken ">"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });

  describe('Comprehensive HTML Tests', () => {
    test('tag names are handled as StringLiteral tokens', () => {
      const tokenTest = `
<div>
1234
@1 LessThanToken "<"
@2 StringLiteral "div"
@3 GreaterThanToken ">"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('HTML tags at start of line', () => {
      const tokenTest = `
<span>text</span>
1     2   3
@1 LessThanToken "<"
@2 StringLiteral "text"
@3 LessThanSlashToken "</"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('HTML tags in middle of text', () => {
      const tokenTest = `
Some text <em>emphasized</em> more text.
          1             2
@1 LessThanToken "<"
@2 LessThanSlashToken "</"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('nested HTML tags', () => {
      const tokenTest = `
<div><span>content</span></div>
1    2     3        4
@1 LessThanToken "<"
@2 LessThanToken "<"
@3 StringLiteral "content"
@4 StringLiteral "span"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('self-closing tags with attributes', () => {
      const tokenTest = `
<img src="test.jpg" alt="test" />
                               1
@1 SlashGreaterThanToken "/>"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('HTML with entities inside', () => {
      const tokenTest = `
<p>Text &amp; more &lt;text&gt;</p>
        1          2       3
@1 EntityToken "&"
@2 EntityToken "<"
@3 EntityToken ">"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('complex nested HTML with multiple scenarios', () => {
      const tokenTest = `
<div class="main">
1
@1 LessThanToken "<"
  <h1>Title &amp; Subtitle</h1>
  1         2
  @1 LessThanToken "<"
  @2 EntityToken "&"
  <p>Some text with <em>emphasis &lt;strong&gt;</em> and more.</p>
                    1            2         3   4
  @1 LessThanToken "<"
  @2 EntityToken "<"
  @3 EntityToken ">"
  @4 LessThanSlashToken "</"
  <img src="image.jpg" alt="description" />
                                         1
  @1 SlashGreaterThanToken "/>"
  <ul>
  1
  @1 LessThanToken "<"
    <li>Item 1 &gt; special</li>
    1          2
    @1 LessThanToken "<"
    @2 EntityToken ">"
    <li>Item 2</li>
    1
    @1 LessThanToken "<"
  </ul>
  1
  @1 LessThanSlashToken "</"
</div>
1
@1 LessThanSlashToken "</"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });
});