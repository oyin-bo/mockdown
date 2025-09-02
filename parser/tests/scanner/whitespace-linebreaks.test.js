// @ts-check
/**
 * Tests for whitespace handling and line breaks
 */
import { beforeEach, describe, expect, test } from 'vitest';
import { createScanner } from '../../scanner.js';
import { scanTokensStrings } from '../utils.test.js';
describe('Whitespace and Line Breaks', () => {
    let scanner;
    beforeEach(() => {
        scanner = createScanner();
    });
    // use shared helper for token string assertions when possible
    test('scans whitespace trivia', () => {
        const tokens = scanTokensStrings('   ');
        expect(tokens[0]).toBe('"   " WhitespaceTrivia');
    });
    test('scans line break trivia', () => {
        const tokens = scanTokensStrings('\n');
        expect(tokens[0]).toBe('"\\n" NewLineTrivia');
    });
    test('scans CRLF line break', () => {
        const tokens = scanTokensStrings('\r\n');
        expect(tokens[0]).toBe('"\\r\\n" NewLineTrivia');
    });
    test('single newline after content is not a blank line', () => {
        const tokens = scanTokensStrings('abcd\n'.replace('\\n', '\n'));
        // locate the NewLineTrivia token string and then use scanner to verify flags
        const scanner2 = createScanner();
        scanner2.setText('abcd\n'.replace('\\n', '\n'));
        scanner2.scan(); // 'abcd'
        const k = scanner2.scan(); // newline
        expect(k).toBe(32 /* SyntaxKind.NewLineTrivia */);
        expect(scanner2.getTokenFlags() & 8388608 /* TokenFlags.IsBlankLine */).toBeFalsy();
    });
    test('consecutive newlines: middle newline is a blank line', () => {
        const s = createScanner();
        s.setText('abcd\n\nefgh'.replace('\\n', '\n'));
        s.scan(); // 'abcd'
        const firstNl = s.scan(); // first newline
        expect(firstNl).toBe(32 /* SyntaxKind.NewLineTrivia */);
        expect(s.getTokenFlags() & 8388608 /* TokenFlags.IsBlankLine */).toBeFalsy();
        const secondNl = s.scan(); // second newline (blank line)
        expect(secondNl).toBe(32 /* SyntaxKind.NewLineTrivia */);
        expect(s.getTokenFlags() & 8388608 /* TokenFlags.IsBlankLine */).toBeTruthy();
    });
    test('whitespace-only line counts as blank line', () => {
        // This test inspects flags; use scanner directly
        const s = createScanner();
        s.setText('a\n   \n\n b'.replace('\\n', '\n'));
        s.scan(); // 'a'
        s.scan(); // newline
        s.scan(); // whitespace-only line
        const k1 = s.scan(); // newline after spaces
        expect(k1).toBe(32 /* SyntaxKind.NewLineTrivia */);
        expect(s.getTokenFlags() & 8388608 /* TokenFlags.IsBlankLine */).toBeTruthy();
        s.scan(); // next newline
        expect(s.getTokenFlags() & 8388608 /* TokenFlags.IsBlankLine */).toBeTruthy();
    });
    test('tabs-only blank line is flagged', () => {
        // Use scanner directly for tab blank line flags
        const s2 = createScanner();
        s2.setText('a\n\t\nb'.replace('\\n', '\n').replace('\\t', '\t'));
        s2.scan(); // 'a'
        s2.scan(); // newline
        s2.scan(); // tab whitespace
        const k2 = s2.scan(); // newline
        expect(k2).toBe(32 /* SyntaxKind.NewLineTrivia */);
        expect(s2.getTokenFlags() & 8388608 /* TokenFlags.IsBlankLine */).toBeTruthy();
    });
    test('CRLF blank line is flagged', () => {
        const s3 = createScanner();
        s3.setText('a\r\n\r\nb');
        s3.scan(); // 'a'
        s3.scan(); // CRLF
        s3.scan(); // CRLF
        expect(s3.getToken()).toBe(32 /* SyntaxKind.NewLineTrivia */);
        expect(s3.getTokenFlags() & 8388608 /* TokenFlags.IsBlankLine */).toBeTruthy();
    });
    test('hard break hint: 0 trailing spaces -> no hint', () => {
        scanner.setText('line\n');
        // identifier
        scanner.scan();
        // newline
        const k = scanner.scan();
        expect(k).toBe(32 /* SyntaxKind.NewLineTrivia */);
        expect(scanner.getTokenFlags() & 2048 /* TokenFlags.HardBreakHint */).toBeFalsy();
    });
    test('hard break hint: 1 trailing space -> no hint', () => {
        scanner.setText('line \n'.replace('\\n', '\n'));
        scanner.scan(); // identifier
        scanner.scan(); // whitespace
        const k = scanner.scan();
        expect(k).toBe(32 /* SyntaxKind.NewLineTrivia */);
        expect(scanner.getTokenFlags() & 2048 /* TokenFlags.HardBreakHint */).toBeFalsy();
    });
    test('hard break hint: 2 trailing spaces -> hint set', () => {
        scanner.setText('line  \n'.replace('\\n', '\n'));
        scanner.scan(); // identifier
        scanner.scan(); // whitespace
        const k = scanner.scan();
        expect(k).toBe(32 /* SyntaxKind.NewLineTrivia */);
        expect(scanner.getTokenFlags() & 2048 /* TokenFlags.HardBreakHint */).toBeTruthy();
    });
    test('hard break hint: 3 trailing spaces -> hint set', () => {
        scanner.setText('line   \n'.replace('\\n', '\n'));
        scanner.scan(); // identifier
        scanner.scan(); // whitespace
        const k = scanner.scan();
        expect(k).toBe(32 /* SyntaxKind.NewLineTrivia */);
        expect(scanner.getTokenFlags() & 2048 /* TokenFlags.HardBreakHint */).toBeTruthy();
    });
    test('tab-based column calculation (two tabs then identifier => col 8)', () => {
        scanner.setText('\t\tfoo');
        // first token: WhitespaceTrivia (tabs)
        const ws = scanner.scan();
        expect(ws).toBe(31 /* SyntaxKind.WhitespaceTrivia */);
        const id = scanner.scan();
        expect(id).toBe(36 /* SyntaxKind.Identifier */);
        expect(scanner.getTokenText()).toBe('foo');
        expect(scanner.getColumn()).toBe(8);
    });
    test('tab-based column calculation (space then tab then identifier => col 4)', () => {
        scanner.setText(' \tfoo');
        // whitespace run
        const ws = scanner.scan();
        expect(ws).toBe(31 /* SyntaxKind.WhitespaceTrivia */);
        const id = scanner.scan();
        expect(id).toBe(36 /* SyntaxKind.Identifier */);
        expect(scanner.getColumn()).toBe(4);
    });
});
