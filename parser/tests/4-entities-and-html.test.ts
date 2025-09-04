/**
 * Tests for Stage 4: Entities and HTML
 * Using Scanner2 Testing Infrastructure
 * 
 * Tests basic HTML tag recognition and character entity parsing
 * according to the Stage 4 plan.
 */

import { describe, test, expect } from 'vitest';
import { verifyTokens } from './verify-tokens.js';

describe('Stage 4: Entities and HTML', () => {
  describe('Character Entities', () => {
    test('named entity recognition', () => {
      const tokenTest = `
&amp;
1
@1 EntityToken "&amp;"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('multiple named entities', () => {
      const tokenTest = `
&lt;&gt;&amp;
1   2   3
@1 EntityToken "&lt;"
@2 EntityToken "&gt;"
@3 EntityToken "&amp;"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('numeric entity recognition', () => {
      const tokenTest = `
&#65;
1
@1 EntityToken "&#65;"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('hex numeric entity recognition', () => {
      const tokenTest = `
&#x41;
1
@1 EntityToken "&#x41;"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('hex entity with capital X', () => {
      const tokenTest = `
&#X41;
1
@1 EntityToken "&#X41;"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('entity with text content', () => {
      const tokenTest = `
text &amp; more
     1
@1 EntityToken "&amp;"`;
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
1                2
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

    test('HTML with entities', () => {
      const tokenTest = `
<div>&amp;</div>
1    2        3
@1 LessThanToken "<"
@2 EntityToken "&amp;"
@3 LessThanSlashToken "</"`;
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

    test('standalone slash', () => {
      const tokenTest = `
text / more
1
@1 StringLiteral "text / more"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });

  describe('Complex mixed content', () => {
    test('entities and formatting together', () => {
      const tokenTest = `
**bold** &amp; *italic*
1        2     3       4
@1 AsteriskAsterisk 514
@2 EntityToken "&amp;"
@3 AsteriskToken 512
@4 AsteriskToken 1024`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('HTML tags and formatting together', () => {
      const tokenTest = `
<em>**bold**</em>
1   2        3
@1 LessThanToken "<"
@2 AsteriskAsterisk 514
@3 LessThanSlashToken "</"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('complex HTML with attributes', () => {
      const tokenTest = `
<span class="test">content</span>
1
@1 LessThanToken "<"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });

  describe('Edge cases', () => {
    test('empty entity reference', () => {
      const tokenTest = `
&;
1
@1 StringLiteral "&;"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('numeric entity with no digits', () => {
      const tokenTest = `
&#;
1
@1 StringLiteral "&#;"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('hex entity with no hex digits', () => {
      const tokenTest = `
&#x;
1
@1 StringLiteral "&#x;"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });

    test('multiple special characters in sequence', () => {
      const tokenTest = `
&<>
1
@1 StringLiteral "&<>"`;
      expect(verifyTokens(tokenTest)).toBe(tokenTest);
    });
  });
});