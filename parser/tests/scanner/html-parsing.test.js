import { describe, expect, test } from 'vitest';
import { createScanner } from '../../scanner.js';
import { scanTokensStrings } from '../utils.test.js';
describe('HTML Parsing and Disambiguation', () => {
    describe('HTML Block Hinting', () => {
        test('hint persists until blank line', () => {
            const scanner = createScanner();
            scanner.setText(`<!-- c -->\npara\n\nnext`);
            // comment
            let k = scanner.scan();
            expect(k).toBe(7 /* SyntaxKind.HtmlComment */);
            expect(scanner.getTokenFlags() & 256 /* TokenFlags.ContainsHtmlBlock */).toBeTruthy();
            // newline
            k = scanner.scan();
            expect(k).toBe(32 /* SyntaxKind.NewLineTrivia */);
            expect(scanner.getTokenFlags() & 256 /* TokenFlags.ContainsHtmlBlock */).toBeTruthy();
            // identifier 'para'
            k = scanner.scan();
            expect(k).toBe(36 /* SyntaxKind.Identifier */);
            expect(scanner.getTokenFlags() & 256 /* TokenFlags.ContainsHtmlBlock */).toBeTruthy();
            // newline
            scanner.scan();
            // blank line newline
            scanner.scan();
            // now 'next' should not have the hint
            k = scanner.scan();
            expect(k).toBe(36 /* SyntaxKind.Identifier */);
            expect(scanner.getTokenFlags() & 256 /* TokenFlags.ContainsHtmlBlock */).toBeFalsy();
        });
        test('unterminated RAWTEXT sets Unterminated and error', () => {
            const scanner = createScanner();
            scanner.setText('<script>if (a < b) { x(); }');
            // opening tag
            expect(scanner.scan()).toBe(6 /* SyntaxKind.HtmlText */);
            // content token
            const k = scanner.scan();
            expect(k).toBe(6 /* SyntaxKind.HtmlText */);
            expect(scanner.getTokenFlags() & 64 /* TokenFlags.IsInRawText */).toBeTruthy();
            expect(scanner.getTokenFlags() & 1 /* TokenFlags.Unterminated */).toBeTruthy();
            expect(scanner.getErrorCode()).toBeDefined();
        });
        test('unterminated RCDATA sets Unterminated and error', () => {
            const scanner = createScanner();
            scanner.setText('<title>Tom &amp; Jerry');
            // opening tag
            expect(scanner.scan()).toBe(6 /* SyntaxKind.HtmlText */);
            // first content chunk
            let k = scanner.scan();
            expect(k).toBe(6 /* SyntaxKind.HtmlText */);
            expect(scanner.getTokenFlags() & 128 /* TokenFlags.IsInRcdata */).toBeTruthy();
            // entity chunk
            k = scanner.scan();
            expect(k).toBe(6 /* SyntaxKind.HtmlText */);
            // remainder (unterminated)
            k = scanner.scan();
            expect(k).toBe(6 /* SyntaxKind.HtmlText */);
            expect(scanner.getTokenFlags() & 1 /* TokenFlags.Unterminated */).toBeTruthy();
        });
        test('block-level tag at line start enables html block hint; clears on blank', () => {
            const scanner = createScanner();
            scanner.setText(`<div>\ntext\n\nnext`);
            // opening tag token (HtmlText)
            let k = scanner.scan();
            expect(k).toBe(6 /* SyntaxKind.HtmlText */);
            expect(scanner.getTokenFlags() & 256 /* TokenFlags.ContainsHtmlBlock */).toBeTruthy();
            // newline
            scanner.scan();
            // identifier 'text'
            k = scanner.scan();
            expect(k).toBe(36 /* SyntaxKind.Identifier */);
            expect(scanner.getTokenFlags() & 256 /* TokenFlags.ContainsHtmlBlock */).toBeTruthy();
            // newline then blank line newline
            scanner.scan();
            scanner.scan();
            // now 'next' should not have the hint
            k = scanner.scan();
            expect(k).toBe(36 /* SyntaxKind.Identifier */);
            expect(scanner.getTokenFlags() & 256 /* TokenFlags.ContainsHtmlBlock */).toBeFalsy();
        });
        test('inline tag at line start does not enable html block hint', () => {
            const scanner = createScanner();
            scanner.setText(`<span>\ntext`);
            // opening inline tag token (HtmlText)
            let k = scanner.scan();
            expect(k).toBe(6 /* SyntaxKind.HtmlText */);
            expect(scanner.getTokenFlags() & 256 /* TokenFlags.ContainsHtmlBlock */).toBeFalsy();
            // newline
            scanner.scan();
            // identifier 'text'
            k = scanner.scan();
            expect(k).toBe(36 /* SyntaxKind.Identifier */);
            expect(scanner.getTokenFlags() & 256 /* TokenFlags.ContainsHtmlBlock */).toBeFalsy();
        });
        test('CDATA/DOCTYPE/PI at line start enable hint and clear on blank', () => {
            const scanner = createScanner();
            // CDATA
            scanner.setText(`<![CDATA[x]]>\npara\n\nnext`);
            let k = scanner.scan();
            expect(k).toBe(8 /* SyntaxKind.HtmlCDATA */);
            expect(scanner.getTokenFlags() & 256 /* TokenFlags.ContainsHtmlBlock */).toBeTruthy();
            scanner.scan(); // nl
            k = scanner.scan(); // 'para'
            expect(k).toBe(36 /* SyntaxKind.Identifier */);
            expect(scanner.getTokenFlags() & 256 /* TokenFlags.ContainsHtmlBlock */).toBeTruthy();
            scanner.scan(); // nl
            scanner.scan(); // blank nl
            k = scanner.scan();
            expect(scanner.getTokenFlags() & 256 /* TokenFlags.ContainsHtmlBlock */).toBeFalsy();
            // DOCTYPE
            scanner.setText(`<!DOCTYPE html>\npara`);
            k = scanner.scan();
            expect(k).toBe(9 /* SyntaxKind.HtmlDoctype */);
            expect(scanner.getTokenFlags() & 256 /* TokenFlags.ContainsHtmlBlock */).toBeTruthy();
            // Processing Instruction
            scanner.setText(`<?xml foo?>\npara`);
            k = scanner.scan();
            expect(k).toBe(10 /* SyntaxKind.HtmlProcessingInstruction */);
            expect(scanner.getTokenFlags() & 256 /* TokenFlags.ContainsHtmlBlock */).toBeTruthy();
        });
    });
    describe('Autolink flags', () => {
        test('URL autolink flag set', () => {
            const scanner = createScanner();
            scanner.setText('<https://example.com>');
            const token = scanner.scan();
            expect(token).toBe(6 /* SyntaxKind.HtmlText */);
            expect(scanner.getTokenFlags() & 8192 /* TokenFlags.IsAutolinkUrl */).toBeTruthy();
        });
        test('Email autolink flag set', () => {
            const scanner = createScanner();
            scanner.setText('<foo.bar@baz.com>');
            const token = scanner.scan();
            expect(token).toBe(6 /* SyntaxKind.HtmlText */);
            expect(scanner.getTokenFlags() & 4096 /* TokenFlags.IsAutolinkEmail */).toBeTruthy();
        });
    });
    describe('Raw-text and RCDATA elements', () => {
        test('script raw-text content and closing tag', () => {
            const scanner = createScanner();
            scanner.setText('<script>if (a < b) { x(); }</script>');
            expect(scanner.scan()).toBe(6 /* SyntaxKind.HtmlText */); // <script>
            const contentKind = scanner.scan();
            expect(contentKind).toBe(6 /* SyntaxKind.HtmlText */);
            expect(scanner.getTokenFlags() & 64 /* TokenFlags.IsInRawText */).toBeTruthy();
            // Next should be closing tag start
            const ltSlash = scanner.scan();
            expect(ltSlash).toBe(3 /* SyntaxKind.LessThanSlashToken */);
        });
        test('style raw-text content', () => {
            const scanner = createScanner();
            scanner.setText('<style>.x{display:none}</style>');
            expect(scanner.scan()).toBe(6 /* SyntaxKind.HtmlText */); // <style>
            const contentKind = scanner.scan();
            expect(contentKind).toBe(6 /* SyntaxKind.HtmlText */);
            expect(scanner.getTokenFlags() & 64 /* TokenFlags.IsInRawText */).toBeTruthy();
        });
        test('textarea RCDATA content with entity stays active', () => {
            const scanner = createScanner();
            scanner.setText('<textarea>Tom &amp; Jerry</textarea>');
            expect(scanner.scan()).toBe(6 /* SyntaxKind.HtmlText */); // <textarea>
            // First chunk before entity
            let k = scanner.scan();
            expect(k).toBe(6 /* SyntaxKind.HtmlText */);
            expect(scanner.getTokenFlags() & 128 /* TokenFlags.IsInRcdata */).toBeTruthy();
            // Entity token
            k = scanner.scan();
            expect(k).toBe(6 /* SyntaxKind.HtmlText */);
            expect(scanner.getTokenValue()).toBe('&amp;');
            expect(scanner.getTokenFlags() & 128 /* TokenFlags.IsInRcdata */).toBeTruthy();
            // Remainder chunk
            k = scanner.scan();
            expect(k).toBe(6 /* SyntaxKind.HtmlText */);
            expect(scanner.getTokenFlags() & 128 /* TokenFlags.IsInRcdata */).toBeTruthy();
            // Closing tag
            k = scanner.scan();
            expect(k).toBe(3 /* SyntaxKind.LessThanSlashToken */);
        });
        test('title RCDATA content and closing', () => {
            const scanner = createScanner();
            scanner.setText('<title>Fish &amp; Chips</title>');
            expect(scanner.scan()).toBe(6 /* SyntaxKind.HtmlText */); // <title>
            let k = scanner.scan();
            expect(k).toBe(6 /* SyntaxKind.HtmlText */);
            expect(scanner.getTokenFlags() & 128 /* TokenFlags.IsInRcdata */).toBeTruthy();
            k = scanner.scan();
            expect(k).toBe(6 /* SyntaxKind.HtmlText */);
            expect(scanner.getTokenValue()).toBe('&amp;');
            k = scanner.scan();
            expect(k).toBe(6 /* SyntaxKind.HtmlText */);
            k = scanner.scan();
            expect(k).toBe(3 /* SyntaxKind.LessThanSlashToken */);
        });
    });
    describe('HTML Tag Recognition', () => {
        test('recognizes simple opening tag', () => {
            expect(scanTokensStrings('<div>')).toEqual([
                '<div> HtmlText',
                'EndOfFileToken'
            ]);
        });
        test('recognizes tag with attributes', () => {
            expect(scanTokensStrings('<span class="highlight" id="test">')).toEqual([
                '"<span class=\\"highlight\\" id=\\"test\\">" HtmlText',
                'EndOfFileToken'
            ]);
        });
        test('recognizes self-closing tag', () => {
            expect(scanTokensStrings('<img src="test.jpg" alt="Test" />')).toEqual([
                '"<img src=\\"test.jpg\\" alt=\\"Test\\" />" HtmlText',
                'EndOfFileToken'
            ]);
        });
        test('recognizes closing tag', () => {
            expect(scanTokensStrings('</div>')).toEqual([
                '</ LessThanSlashToken',
                'div Identifier',
                '> GreaterThanToken',
                'EndOfFileToken'
            ]);
        });
        test('handles malformed tags gracefully', () => {
            expect(scanTokensStrings('<div class=">')).toEqual([
                '< LessThanToken',
                'div Identifier',
                '" " WhitespaceTrivia',
                'class Identifier',
                '= EqualsToken',
                '"\\"" Unknown',
                '> GreaterThanToken',
                'EndOfFileToken'
            ]);
        });
    });
    describe('HTML Comments', () => {
        test('scans standard HTML comment', () => {
            expect(scanTokensStrings('<!-- This is a comment -->')).toEqual([
                '"<!-- This is a comment -->" HtmlComment',
                'EndOfFileToken'
            ]);
        });
        test('scans multiline HTML comment', () => {
            expect(scanTokensStrings(`<!-- 
        Multiline
        comment
      -->`)).toEqual([
                '"<!-- \\n        Multiline\\n        comment\\n      -->" HtmlComment',
                'EndOfFileToken'
            ]);
        });
        test('handles unterminated comment', () => {
            const scanner = createScanner();
            scanner.setText('<!-- This comment never ends');
            const token = scanner.scan();
            expect(token).toBe(7 /* SyntaxKind.HtmlComment */);
            expect(scanner.getTokenFlags() & 1 /* TokenFlags.Unterminated */).toBeTruthy();
            expect(scanner.getTokenFlags() & 4 /* TokenFlags.ContainsHtml */).toBeTruthy();
        });
        test('does not confuse dashes in comment content', () => {
            expect(scanTokensStrings('<!-- Comment with -- dashes inside -->')).toEqual([
                '"<!-- Comment with -- dashes inside -->" HtmlComment',
                'EndOfFileToken'
            ]);
        });
    });
    describe('CDATA Sections', () => {
        test('scans CDATA section', () => {
            expect(scanTokensStrings('<![CDATA[Some raw data]]>')).toEqual([
                '"<![CDATA[Some raw data]]>" HtmlCDATA',
                'EndOfFileToken'
            ]);
        });
        test('scans CDATA with special characters', () => {
            expect(scanTokensStrings('<![CDATA[<>&"\']]>')).toEqual([
                '"<![CDATA[<>&\\"\']]>" HtmlCDATA',
                'EndOfFileToken'
            ]);
        });
        test('handles unterminated CDATA', () => {
            const scanner = createScanner();
            scanner.setText('<![CDATA[Never closed');
            const token = scanner.scan();
            expect(token).toBe(8 /* SyntaxKind.HtmlCDATA */);
            expect(scanner.getTokenFlags() & 1 /* TokenFlags.Unterminated */).toBeTruthy();
        });
    });
    describe('DOCTYPE Declarations', () => {
        test('scans HTML5 DOCTYPE', () => {
            expect(scanTokensStrings('<!DOCTYPE html>')).toEqual([
                '"<!DOCTYPE html>" HtmlDoctype',
                'EndOfFileToken'
            ]);
        });
        test('scans HTML4 DOCTYPE', () => {
            expect(scanTokensStrings('<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">')).toEqual([
                '"<!DOCTYPE HTML PUBLIC \\"-//W3C//DTD HTML 4.01//EN\\" \\"http://www.w3.org/TR/html4/strict.dtd\\">" HtmlDoctype',
                'EndOfFileToken'
            ]);
        });
        test('handles case-insensitive DOCTYPE', () => {
            expect(scanTokensStrings('<!doctype html>')).toEqual([
                '"<!doctype html>" HtmlDoctype',
                'EndOfFileToken'
            ]);
        });
    });
    describe('Processing Instructions', () => {
        test('scans XML processing instruction', () => {
            expect(scanTokensStrings('<?xml version="1.0" encoding="UTF-8"?>')).toEqual([
                '"<?xml version=\\"1.0\\" encoding=\\"UTF-8\\"?>" HtmlProcessingInstruction',
                'EndOfFileToken'
            ]);
        });
        test('scans PHP processing instruction', () => {
            expect(scanTokensStrings('<?php echo "Hello World"; ?>')).toEqual([
                '"<?php echo \\"Hello World\\"; ?>" HtmlProcessingInstruction',
                'EndOfFileToken'
            ]);
        });
        test('handles unterminated processing instruction', () => {
            const scanner = createScanner();
            scanner.setText('<?xml never closed');
            const token = scanner.scan();
            expect(token).toBe(10 /* SyntaxKind.HtmlProcessingInstruction */);
            expect(scanner.getTokenFlags() & 1 /* TokenFlags.Unterminated */).toBeTruthy();
        });
    });
    describe('Autolinks', () => {
        test('recognizes HTTP URL autolink', () => {
            expect(scanTokensStrings('<https://example.com>')).toEqual([
                '<https://example.com> HtmlText',
                'EndOfFileToken'
            ]);
        });
        test('recognizes HTTPS URL autolink', () => {
            expect(scanTokensStrings('<https://secure.example.com/path?query=value>')).toEqual([
                '<https://secure.example.com/path?query=value> HtmlText',
                'EndOfFileToken'
            ]);
        });
        test('recognizes FTP URL autolink', () => {
            expect(scanTokensStrings('<ftp://ftp.example.com/file.txt>')).toEqual([
                '<ftp://ftp.example.com/file.txt> HtmlText',
                'EndOfFileToken'
            ]);
        });
        test('recognizes email autolink', () => {
            expect(scanTokensStrings('<user@example.com>')).toEqual([
                '<user@example.com> HtmlText',
                'EndOfFileToken'
            ]);
        });
        test('recognizes complex email autolink', () => {
            expect(scanTokensStrings('<first.last+tag@sub.example.com>')).toEqual([
                '<first.last+tag@sub.example.com> HtmlText',
                'EndOfFileToken'
            ]);
        });
        test('rejects invalid autolink', () => {
            expect(scanTokensStrings('<*not a valid url>')).toEqual([
                '< LessThanToken',
                '* AsteriskToken',
                'not Identifier',
                '" " WhitespaceTrivia',
                'a Identifier',
                '" " WhitespaceTrivia',
                'valid Identifier',
                '" " WhitespaceTrivia',
                'url Identifier',
                '> GreaterThanToken',
                'EndOfFileToken'
            ]);
        });
    });
    describe('HTML vs Text Disambiguation', () => {
        test('less than in math context', () => {
            expect(scanTokensStrings('x < y')).toEqual([
                'x Identifier',
                '" " WhitespaceTrivia',
                '< LessThanToken',
                '" " WhitespaceTrivia',
                'y Identifier',
                'EndOfFileToken'
            ]);
        });
        test('less than followed by number', () => {
            expect(scanTokensStrings('<5')).toEqual([
                '< LessThanToken',
                '5 NumericLiteral',
                'EndOfFileToken'
            ]);
        });
        test('less than followed by invalid tag name', () => {
            expect(scanTokensStrings('< invalid>')).toEqual([
                '< LessThanToken',
                '" " WhitespaceTrivia',
                'invalid Identifier',
                '> GreaterThanToken',
                'EndOfFileToken'
            ]);
        });
        test('blockquote vs HTML tag disambiguation', () => {
            const scanner = createScanner();
            scanner.setText('> blockquote');
            const token = scanner.scan();
            expect(token).toBe(30 /* SyntaxKind.BlockquoteToken */);
            expect(scanner.getTokenFlags() & 32 /* TokenFlags.IsAtLineStart */).toBeTruthy();
        });
        test('greater than not at line start', () => {
            expect(scanTokensStrings('text > more text')).toEqual([
                'text Identifier',
                '" " WhitespaceTrivia',
                '> GreaterThanToken',
                '" " WhitespaceTrivia',
                'more Identifier',
                '" " WhitespaceTrivia',
                'text Identifier',
                'EndOfFileToken'
            ]);
        });
    });
    describe('HTML Entities', () => {
        test('named entities', () => {
            expect(scanTokensStrings('&amp;')).toEqual([
                '&amp; HtmlText',
                'EndOfFileToken'
            ]);
            expect(scanTokensStrings('&lt;')).toEqual([
                '&lt; HtmlText',
                'EndOfFileToken'
            ]);
            expect(scanTokensStrings('&gt;')).toEqual([
                '&gt; HtmlText',
                'EndOfFileToken'
            ]);
            expect(scanTokensStrings('&quot;')).toEqual([
                '&quot; HtmlText',
                'EndOfFileToken'
            ]);
            expect(scanTokensStrings('&apos;')).toEqual([
                '&apos; HtmlText',
                'EndOfFileToken'
            ]);
            expect(scanTokensStrings('&nbsp;')).toEqual([
                '&nbsp; HtmlText',
                'EndOfFileToken'
            ]);
        });
        test('numeric entities', () => {
            expect(scanTokensStrings('&#65;')).toEqual([
                '&#65; HtmlText',
                'EndOfFileToken'
            ]);
        });
        test('hex entities', () => {
            expect(scanTokensStrings('&#x41;')).toEqual([
                '&#x41; HtmlText',
                'EndOfFileToken'
            ]);
        });
        test('invalid entities fall back to ampersand', () => {
            expect(scanTokensStrings('&invalid')).toEqual([
                '& AmpersandToken',
                'invalid Identifier',
                'EndOfFileToken'
            ]);
        });
        test('unterminated entities fall back to ampersand', () => {
            expect(scanTokensStrings('&amp')).toEqual([
                '& AmpersandToken',
                'amp Identifier',
                'EndOfFileToken'
            ]);
        });
    });
    describe('Rescanning Behavior', () => {
        test('reScanLessThanToken changes interpretation', () => {
            const scanner = createScanner();
            scanner.setText('<div>content</div>');
            // Initial scan might see it as less than
            const initial = scanner.scan();
            // Rescan to treat as HTML
            const rescanned = scanner.reScanLessThanToken();
            expect(rescanned).toBe(6 /* SyntaxKind.HtmlText */);
            expect(scanner.getTokenFlags() & 4 /* TokenFlags.ContainsHtml */).toBeTruthy();
        });
        test('lookAhead preserves scanner state', () => {
            const scanner = createScanner();
            scanner.setText('<test>');
            const initialPos = scanner.getTokenStart();
            const lookaheadResult = scanner.lookAhead(() => {
                const token = scanner.scan();
                return scanner.getTokenText();
            });
            expect(lookaheadResult).toBeDefined();
            expect(scanner.getTokenStart()).toBe(initialPos);
        });
    });
    describe('Edge Cases', () => {
        test('empty angle brackets', () => {
            expect(scanTokensStrings('<>')).toEqual([
                '< LessThanToken',
                '> GreaterThanToken',
                'EndOfFileToken'
            ]);
        });
        test('single less than at end of input', () => {
            expect(scanTokensStrings('<')).toEqual([
                '< LessThanToken',
                'EndOfFileToken'
            ]);
        });
        test('malformed tag with spaces', () => {
            expect(scanTokensStrings('< div >')).toEqual([
                '< LessThanToken',
                '" " WhitespaceTrivia',
                'div Identifier',
                '" " WhitespaceTrivia',
                '> GreaterThanToken',
                'EndOfFileToken'
            ]);
        });
        test('tag-like content in code spans', () => {
            expect(scanTokensStrings('`<div>`')).toEqual([
                '` BacktickToken',
                '<div> HtmlText',
                '` BacktickToken',
                'EndOfFileToken'
            ]);
        });
        test('multiple consecutive angle brackets', () => {
            expect(scanTokensStrings('<<<')).toEqual([
                '< LessThanToken',
                '< LessThanToken',
                '< LessThanToken',
                'EndOfFileToken'
            ]);
        });
    });
});
