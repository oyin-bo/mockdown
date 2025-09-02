import { describe, expect, test } from 'vitest';
import { createScanner } from '../../scanner.js';
import { scanTokensStrings } from '../utils.test.js';
describe('HTML Tags and Disambiguation', () => {
    // use shared token-string helper where possible
    test('scans HTML tag', () => {
        const tokens = scanTokensStrings('<div class="test">');
        expect(tokens[0]).toBe('"<div class=\\"test\\">" HtmlText');
        // verify flags via scanner
        const s = createScanner();
        s.setText('<div class="test">');
        expect(s.scan()).toBe(6 /* SyntaxKind.HtmlText */);
        expect(s.getTokenFlags() & 4 /* TokenFlags.ContainsHtml */).toBeTruthy();
    });
    test('scans self-closing HTML tag', () => {
        const tokens = scanTokensStrings('<img src="test.jpg" />');
        expect(tokens[0]).toBe('"<img src=\\"test.jpg\\" />" HtmlText');
    });
    test('scans HTML comment', () => {
        const tokens = scanTokensStrings('<!-- This is a comment -->');
        expect(tokens[0]).toBe('"<!-- This is a comment -->" HtmlComment');
        const s2 = createScanner();
        s2.setText('<!-- This is a comment -->');
        expect(s2.scan()).toBe(7 /* SyntaxKind.HtmlComment */);
        expect(s2.getTokenValue()).toBe(' This is a comment ');
        expect(s2.getTokenFlags() & 4 /* TokenFlags.ContainsHtml */).toBeTruthy();
    });
    test('scans unterminated HTML comment', () => {
        const s3 = createScanner();
        s3.setText('<!-- Unterminated comment');
        expect(s3.scan()).toBe(7 /* SyntaxKind.HtmlComment */);
        expect(s3.getTokenFlags() & 1 /* TokenFlags.Unterminated */).toBeTruthy();
        expect(s3.getTokenFlags() & 4 /* TokenFlags.ContainsHtml */).toBeTruthy();
    });
    test('scans HTML CDATA', () => {
        const tokens = scanTokensStrings('<![CDATA[Some data]]>');
        expect(tokens[0]).toBe('"<![CDATA[Some data]]>" HtmlCDATA');
        const s4 = createScanner();
        s4.setText('<![CDATA[Some data]]>');
        expect(s4.scan()).toBe(8 /* SyntaxKind.HtmlCDATA */);
        expect(s4.getTokenValue()).toBe('Some data');
        expect(s4.getTokenFlags() & 4 /* TokenFlags.ContainsHtml */).toBeTruthy();
    });
    test('scans HTML DOCTYPE', () => {
        const tokens = scanTokensStrings('<!DOCTYPE html>');
        expect(tokens[0]).toBe('"<!DOCTYPE html>" HtmlDoctype');
    });
    test('scans processing instruction', () => {
        const tokens = scanTokensStrings('<?xml version="1.0"?>');
        expect(tokens[0]).toBe('"<?xml version=\\"1.0\\"?>" HtmlProcessingInstruction');
    });
    test('scans URL autolink', () => {
        const tokens = scanTokensStrings('<https://example.com>');
        expect(tokens[0]).toBe('<https://example.com> HtmlText');
    });
    test('scans email autolink', () => {
        const tokens = scanTokensStrings('<user@example.com>');
        expect(tokens[0]).toBe('<user@example.com> HtmlText');
    });
    test('disambiguates blockquote from HTML tag', () => {
        const tokens = scanTokensStrings('> This is a blockquote');
        expect(tokens[0]).toBe('> BlockquoteToken');
        const s5 = createScanner();
        s5.setText('> This is a blockquote');
        expect(s5.scan()).toBe(30 /* SyntaxKind.BlockquoteToken */);
        expect(s5.getTokenFlags() & 32 /* TokenFlags.IsAtLineStart */).toBeTruthy();
    });
});
