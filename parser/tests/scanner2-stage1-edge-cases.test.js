/**
 * Additional Edge Case Tests for Scanner2 Stage 1
 * Testing robustness and edge cases of the text lines + whitespace/newlines implementation
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { createScanner2 } from '../scanner2.js';
describe('Scanner2 Stage 1: Edge Cases', () => {
    let scanner;
    let debugState;
    beforeEach(() => {
        scanner = createScanner2();
        debugState = {
            pos: 0,
            line: 0,
            column: 0,
            mode: '',
            atLineStart: false,
            inParagraph: false,
            precedingLineBreak: false,
            currentToken: 0 /* SyntaxKind2.Unknown */,
            currentTokenText: '',
            currentTokenFlags: 0 /* TokenFlags2.None */,
            nextOffset: 0
        };
    });
    test('should handle only whitespace', () => {
        scanner.initText('   \t   ');
        scanner.scan();
        expect(scanner.token).toBe(3 /* SyntaxKind2.WhitespaceTrivia */);
        expect(scanner.tokenText).toBe('   \t   ');
        scanner.scan();
        expect(scanner.token).toBe(1 /* SyntaxKind2.EndOfFileToken */);
    });
    test('should handle only newlines', () => {
        scanner.initText('\n\n\n');
        scanner.scan();
        expect(scanner.token).toBe(4 /* SyntaxKind2.NewLineTrivia */);
        expect(scanner.tokenText).toBe('\n');
        scanner.scan();
        expect(scanner.token).toBe(4 /* SyntaxKind2.NewLineTrivia */);
        expect(scanner.tokenText).toBe('\n');
        expect(scanner.tokenFlags & 4 /* TokenFlags2.IsBlankLine */).toBeTruthy();
        scanner.scan();
        expect(scanner.token).toBe(4 /* SyntaxKind2.NewLineTrivia */);
        expect(scanner.tokenText).toBe('\n');
        expect(scanner.tokenFlags & 4 /* TokenFlags2.IsBlankLine */).toBeTruthy();
        scanner.scan();
        expect(scanner.token).toBe(1 /* SyntaxKind2.EndOfFileToken */);
    });
    test('should handle mixed line endings', () => {
        scanner.initText('Line 1\nLine 2\r\nLine 3\rLine 4');
        const tokens = [];
        while (scanner.token !== 1 /* SyntaxKind2.EndOfFileToken */) {
            scanner.scan();
            if (scanner.token !== 1 /* SyntaxKind2.EndOfFileToken */) {
                tokens.push({
                    kind: scanner.token,
                    text: scanner.tokenText
                });
            }
        }
        expect(tokens).toEqual([
            { kind: 2 /* SyntaxKind2.StringLiteral */, text: 'Line 1' },
            { kind: 4 /* SyntaxKind2.NewLineTrivia */, text: '\n' },
            { kind: 2 /* SyntaxKind2.StringLiteral */, text: 'Line 2' },
            { kind: 4 /* SyntaxKind2.NewLineTrivia */, text: '\r\n' },
            { kind: 2 /* SyntaxKind2.StringLiteral */, text: 'Line 3' },
            { kind: 4 /* SyntaxKind2.NewLineTrivia */, text: '\r' },
            { kind: 2 /* SyntaxKind2.StringLiteral */, text: 'Line 4' }
        ]);
    });
    test('should handle lines with only whitespace', () => {
        scanner.initText('Line 1\n   \t   \nLine 2');
        scanner.scan(); // Line 1
        expect(scanner.token).toBe(2 /* SyntaxKind2.StringLiteral */);
        expect(scanner.tokenText).toBe('Line 1');
        scanner.scan(); // First newline
        expect(scanner.token).toBe(4 /* SyntaxKind2.NewLineTrivia */);
        scanner.scan(); // Whitespace line
        expect(scanner.token).toBe(3 /* SyntaxKind2.WhitespaceTrivia */);
        expect(scanner.tokenText).toBe('   \t   ');
        scanner.scan(); // Second newline (blank line)
        expect(scanner.token).toBe(4 /* SyntaxKind2.NewLineTrivia */);
        expect(scanner.tokenFlags & 4 /* TokenFlags2.IsBlankLine */).toBeTruthy();
        scanner.scan(); // Line 2
        expect(scanner.token).toBe(2 /* SyntaxKind2.StringLiteral */);
        expect(scanner.tokenText).toBe('Line 2');
    });
    test('should handle very long lines', () => {
        const longText = 'A'.repeat(10000);
        scanner.initText(longText);
        scanner.scan();
        expect(scanner.token).toBe(2 /* SyntaxKind2.StringLiteral */);
        expect(scanner.tokenText).toBe(longText);
        expect(scanner.offsetNext).toBe(10000);
    });
    test('should handle unicode characters', () => {
        scanner.initText('Hello 世界\nBonjour 🌍');
        scanner.scan();
        expect(scanner.token).toBe(2 /* SyntaxKind2.StringLiteral */);
        expect(scanner.tokenText).toBe('Hello 世界');
        scanner.scan(); // newline
        expect(scanner.token).toBe(4 /* SyntaxKind2.NewLineTrivia */);
        scanner.scan();
        expect(scanner.token).toBe(2 /* SyntaxKind2.StringLiteral */);
        expect(scanner.tokenText).toBe('Bonjour 🌍');
    });
    test('should handle line ending at EOF without newline', () => {
        scanner.initText('Line 1\nLine 2 without newline');
        scanner.scan(); // Line 1
        expect(scanner.token).toBe(2 /* SyntaxKind2.StringLiteral */);
        expect(scanner.tokenText).toBe('Line 1');
        scanner.scan(); // newline
        expect(scanner.token).toBe(4 /* SyntaxKind2.NewLineTrivia */);
        scanner.scan(); // Line 2
        expect(scanner.token).toBe(2 /* SyntaxKind2.StringLiteral */);
        expect(scanner.tokenText).toBe('Line 2 without newline');
        scanner.scan(); // EOF
        expect(scanner.token).toBe(1 /* SyntaxKind2.EndOfFileToken */);
    });
    test('should handle multiple consecutive spaces and tabs', () => {
        scanner.initText('  \t  \t  Text with\t\t\tspaces  \t  ');
        scanner.scan(); // Leading whitespace
        expect(scanner.token).toBe(3 /* SyntaxKind2.WhitespaceTrivia */);
        expect(scanner.tokenText).toBe('  \t  \t  ');
        scanner.scan(); // Text content (normalized)
        expect(scanner.token).toBe(2 /* SyntaxKind2.StringLiteral */);
        expect(scanner.tokenText).toBe('Text with spaces');
    });
    test('should preserve exact whitespace in whitespace tokens', () => {
        scanner.initText('\t  \t');
        scanner.scan();
        expect(scanner.token).toBe(3 /* SyntaxKind2.WhitespaceTrivia */);
        expect(scanner.tokenText).toBe('\t  \t'); // Exact preservation for whitespace tokens
    });
    test('should handle rollback to various positions', () => {
        scanner.initText('Line 1\nLine 2\nLine 3');
        // Scan several tokens
        scanner.scan(); // Line 1
        scanner.scan(); // newline
        scanner.scan(); // Line 2
        const midPosition = scanner.offsetNext;
        // Rollback to middle position
        scanner.rollback(midPosition, 1 /* RollbackType.BlankLineBoundary */);
        scanner.fillDebugState(debugState);
        expect(debugState.pos).toBe(midPosition);
        // Should be able to continue scanning from rollback position
        scanner.scan(); // newline after Line 2
        expect(scanner.token).toBe(4 /* SyntaxKind2.NewLineTrivia */);
        scanner.scan(); // Line 3
        expect(scanner.token).toBe(2 /* SyntaxKind2.StringLiteral */);
        expect(scanner.tokenText).toBe('Line 3');
    });
    test('should handle setText with various boundary conditions', () => {
        const fullText = 'PREFIX: Line 1\nLine 2\nLine 3 :SUFFIX';
        // Test start boundary
        scanner.initText(fullText, 8, 6); // Just "Line 1"
        scanner.scan();
        expect(scanner.token).toBe(2 /* SyntaxKind2.StringLiteral */);
        expect(scanner.tokenText).toBe('Line 1');
        scanner.scan();
        expect(scanner.token).toBe(1 /* SyntaxKind2.EndOfFileToken */);
        // Test middle section with newline
        scanner.initText(fullText, 8, 14); // "Line 1\nLine 2"
        scanner.scan();
        expect(scanner.token).toBe(2 /* SyntaxKind2.StringLiteral */);
        expect(scanner.tokenText).toBe('Line 1');
        scanner.scan();
        expect(scanner.token).toBe(4 /* SyntaxKind2.NewLineTrivia */);
        scanner.scan();
        expect(scanner.token).toBe(2 /* SyntaxKind2.StringLiteral */);
        expect(scanner.tokenText).toBe('Line 2');
    });
    test('should handle debug state correctly', () => {
        scanner.initText('Line 1\n  Line 2');
        // Initial state
        scanner.fillDebugState(debugState);
        expect(debugState.pos).toBe(0);
        expect(debugState.line).toBe(1);
        expect(debugState.column).toBe(1);
        expect(debugState.atLineStart).toBe(true);
        expect(debugState.mode).toBe('Normal');
        // After scanning first line
        scanner.scan();
        scanner.fillDebugState(debugState);
        expect(debugState.pos).toBe(6);
        expect(debugState.line).toBe(1);
        expect(debugState.currentToken).toBe(2 /* SyntaxKind2.StringLiteral */);
        expect(debugState.currentTokenText).toBe('Line 1');
        // After newline
        scanner.scan();
        scanner.fillDebugState(debugState);
        expect(debugState.pos).toBe(7);
        expect(debugState.line).toBe(2);
        expect(debugState.column).toBe(1);
        expect(debugState.atLineStart).toBe(true);
        expect(debugState.currentToken).toBe(4 /* SyntaxKind2.NewLineTrivia */);
    });
    test('should handle rollback type parameter correctly', () => {
        scanner.initText('Test content');
        // Test different rollback types
        scanner.rollback(0, 0 /* RollbackType.DocumentStart */);
        scanner.fillDebugState(debugState);
        expect(debugState.pos).toBe(0);
        scanner.rollback(5, 1 /* RollbackType.BlankLineBoundary */);
        scanner.fillDebugState(debugState);
        expect(debugState.pos).toBe(5);
        scanner.rollback(8, 2 /* RollbackType.RawTextContent */);
        scanner.fillDebugState(debugState);
        expect(debugState.pos).toBe(8);
    });
    test('should throw error for invalid rollback positions', () => {
        scanner.initText('Test');
        expect(() => scanner.rollback(-1, 0 /* RollbackType.DocumentStart */))
            .toThrow('Invalid rollback position: -1');
        expect(() => scanner.rollback(100, 0 /* RollbackType.DocumentStart */))
            .toThrow('Invalid rollback position: 100');
    });
    test('should handle edge case of empty lines at end', () => {
        scanner.initText('Content\n\n');
        scanner.scan(); // Content
        expect(scanner.token).toBe(2 /* SyntaxKind2.StringLiteral */);
        expect(scanner.tokenText).toBe('Content');
        scanner.scan(); // First newline
        expect(scanner.token).toBe(4 /* SyntaxKind2.NewLineTrivia */);
        scanner.scan(); // Second newline (blank line)
        expect(scanner.token).toBe(4 /* SyntaxKind2.NewLineTrivia */);
        expect(scanner.tokenFlags & 4 /* TokenFlags2.IsBlankLine */).toBeTruthy();
        scanner.scan(); // EOF
        expect(scanner.token).toBe(1 /* SyntaxKind2.EndOfFileToken */);
    });
});
