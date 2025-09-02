// @ts-check
/**
 * Tests for HTML entities and links
 */
import { beforeEach, describe, expect, test } from 'vitest';
import { createScanner } from '../../scanner.js';
import { scanTokens, scanTokensStrings } from '../utils.test.js';
describe('HTML Entities and Links', () => {
    let scanner;
    beforeEach(() => {
        scanner = createScanner();
    });
    describe('HTML Entities', () => {
        test('scans named HTML entity', () => {
            expect(scanTokensStrings('&amp;')).toEqual(['&amp; HtmlText', 'EndOfFileToken']);
        });
        test('scans numeric HTML entity', () => {
            expect(scanTokensStrings('&#123;')).toEqual(['&#123; HtmlText', 'EndOfFileToken']);
        });
        test('scans hex HTML entity', () => {
            expect(scanTokensStrings('&#x1F;')).toEqual(['&#x1F; HtmlText', 'EndOfFileToken']);
        });
        test('does not scan invalid entity', () => {
            expect(scanTokensStrings('&invalid')).toEqual(['& AmpersandToken', 'invalid Identifier', 'EndOfFileToken']);
        });
    });
    describe('Links and References', () => {
        test('scans link syntax tokens', () => {
            expect(scanTokensStrings('[link text](url)')).toEqual([
                '[ OpenBracketToken',
                'link Identifier',
                '" " WhitespaceTrivia',
                'text Identifier',
                '] CloseBracketToken',
                '( OpenParenToken',
                'url Identifier',
                ') CloseParenToken',
                'EndOfFileToken',
            ]);
        });
        test('scans image syntax tokens', () => {
            const tokens = scanTokensStrings('![alt text](image.jpg)');
            expect(tokens[0]).toBe('! ExclamationToken');
            expect(tokens[1]).toBe('[ OpenBracketToken');
            expect(scanTokensStrings('![alt text](image.jpg)')).toEqual([
                '! ExclamationToken',
                '[ OpenBracketToken',
                'alt Identifier',
                '" " WhitespaceTrivia',
                'text Identifier',
                '] CloseBracketToken',
                '( OpenParenToken',
                'image Identifier',
                '. Unknown',
                'jpg Identifier',
                ') CloseParenToken',
                'EndOfFileToken',
            ]);
        });
    });
    describe('Reference Definition Hint', () => {
        test('line-start [label]: sets MaybeDefinition on [', () => {
            const tokens = scanTokens('[label]: url');
            expect(tokens.map(String)).toEqual([
                '[ OpenBracketToken',
                'label Identifier',
                '] CloseBracketToken',
                ': ColonToken',
                '" " WhitespaceTrivia',
                'url Identifier',
                'EndOfFileToken',
            ]);
            expect(tokens[0].flags & 4194304 /* TokenFlags.MaybeDefinition */).toBeTruthy();
        });
        test('not at line start -> no MaybeDefinition', () => {
            const tokens = scanTokens('text [label]: url');
            expect(tokens.map(String)).toEqual([
                'text Identifier',
                '" " WhitespaceTrivia',
                '[ OpenBracketToken',
                'label Identifier',
                '] CloseBracketToken',
                ': ColonToken',
                '" " WhitespaceTrivia',
                'url Identifier',
                'EndOfFileToken',
            ]);
            expect(tokens[2].flags & 4194304 /* TokenFlags.MaybeDefinition */).toBeFalsy();
        });
        test('missing colon after ] -> no MaybeDefinition', () => {
            const tokens = scanTokens('[label] url');
            expect(tokens.map(String)).toEqual([
                '[ OpenBracketToken',
                'label Identifier',
                '] CloseBracketToken',
                '" " WhitespaceTrivia',
                'url Identifier',
                'EndOfFileToken',
            ]);
            expect(tokens[0].flags & 4194304 /* TokenFlags.MaybeDefinition */).toBeFalsy();
        });
    });
});
