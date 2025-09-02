// @ts-check
/**
 * Tests for ATX headings and lists
 */
import { describe, expect, test } from 'vitest';
import { createScanner } from '../../scanner.js';
import { scanTokensStrings, syntaxKind } from '../utils.test.js';
describe('ATX Headings and Lists', () => {
    describe('ATX Headings', () => {
        test('scans ATX heading at line start', () => {
            const tokens = scanTokensStrings('# Heading 1');
            expect(tokens[0]).toBe('# HashToken');
            const s = createScanner();
            s.setText('# Heading 1');
            expect(syntaxKind(s.scan())).toBe('HashToken');
            expect(s.getTokenFlags() & 32 /* TokenFlags.IsAtLineStart */).toBeTruthy();
        });
        test('scans multiple hash ATX heading', () => {
            const tokens2 = scanTokensStrings('### Heading 3');
            expect(tokens2[0]).toBe('### HashToken');
        });
        test('does not scan hash not at line start as heading', () => {
            const tokens3 = scanTokensStrings('text # not heading');
            expect(tokens3[0].includes('Identifier')).toBeTruthy();
            expect(tokens3[1]).toBe('" " WhitespaceTrivia');
            expect(tokens3[2]).toBe('# HashToken');
        });
    });
    describe('Lists', () => {
        test('scans unordered list asterisk', () => {
            const tokens4 = scanTokensStrings('* Item 1');
            expect(tokens4[0]).toBe('* AsteriskToken');
            const s2 = createScanner();
            s2.setText('* Item 1');
            expect(s2.scan()).toBe(14 /* SyntaxKind.AsteriskToken */);
            expect(s2.getTokenFlags() & 32 /* TokenFlags.IsAtLineStart */).toBeTruthy();
        });
        test('scans unordered list dash', () => {
            const tokens5 = scanTokensStrings('- Item 1');
            expect(tokens5[0]).toBe('- DashToken');
            const s3 = createScanner();
            s3.setText('- Item 1');
            expect(s3.scan()).toBe(12 /* SyntaxKind.DashToken */);
            expect(s3.getTokenFlags() & 32 /* TokenFlags.IsAtLineStart */).toBeTruthy();
        });
        test('scans unordered list plus', () => {
            const tokens6 = scanTokensStrings('+ Item 1');
            expect(tokens6[0]).toBe('+ PlusToken');
            const s4 = createScanner();
            s4.setText('+ Item 1');
            expect(s4.scan()).toBe(18 /* SyntaxKind.PlusToken */);
            expect(s4.getTokenFlags() & 32 /* TokenFlags.IsAtLineStart */).toBeTruthy();
        });
        test('scans ordered list', () => {
            const tokens7 = scanTokensStrings('1. Item 1');
            expect(tokens7[0].includes('NumericLiteral')).toBeTruthy();
            expect(tokens7[1].includes('Unknown')).toBeTruthy();
        });
        test('ordered list marker with parenthesis delimiter', () => {
            const scanner = createScanner();
            scanner.setText('3) item');
            const k = scanner.scan();
            expect(k).toBe(35 /* SyntaxKind.NumericLiteral */);
            const flags = scanner.getTokenFlags();
            expect(flags & 16384 /* TokenFlags.IsOrderedListMarker */).toBeTruthy();
            expect(flags & 32768 /* TokenFlags.OrderedListDelimiterParen */).toBeTruthy();
            expect(scanner.getOrderedListStart()).toBe(3);
        });
        test('tab indent prevents ordered list marker (column >=4)', () => {
            const scanner = createScanner();
            scanner.setText('\t1. item');
            // Tab is a whitespace trivia token
            expect(scanner.scan()).toBe(31 /* SyntaxKind.WhitespaceTrivia */);
            const k2 = scanner.scan();
            expect(k2).toBe(35 /* SyntaxKind.NumericLiteral */);
            expect(scanner.getTokenFlags() & 16384 /* TokenFlags.IsOrderedListMarker */).toBeFalsy();
        });
    });
});
