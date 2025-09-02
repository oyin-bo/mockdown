/**
 * Parser Utilities
 * Helper functions for common parsing operations
 */
/**
 * Skips whitespace and trivia tokens
 */
export function skipTrivia(scanner) {
    while (true) {
        const token = scanner.getToken();
        if (token === 31 /* SyntaxKind.WhitespaceTrivia */ ||
            token === 33 /* SyntaxKind.TabTrivia */) {
            scanner.scan();
        }
        else {
            break;
        }
    }
}
/**
 * Parses an expected token, returns true if found
 */
export function parseExpected(scanner, kind) {
    if (scanner.getToken() === kind) {
        scanner.scan();
        return true;
    }
    return false;
}
/**
 * Parses an optional token, returns true if found
 */
export function parseOptional(scanner, kind) {
    if (scanner.getToken() === kind) {
        scanner.scan();
        return true;
    }
    return false;
}
/**
 * Tries to parse using a callback, returns result or undefined if failed
 */
export function tryParse(scanner, callback) {
    return scanner.tryScan(callback);
}
/**
 * Checks if current token is at line start
 */
export function isAtLineStart(scanner) {
    return !!(scanner.getTokenFlags() & 32 /* TokenFlags.IsAtLineStart */);
}
/**
 * Checks if current token has preceding line break
 */
export function hasPrecedingLineBreak(scanner) {
    return !!(scanner.getTokenFlags() & 2 /* TokenFlags.PrecedingLineBreak */);
}
/**
 * Checks if current token is a blank line
 */
export function isBlankLine(scanner) {
    return scanner.getToken() === 32 /* SyntaxKind.NewLineTrivia */ &&
        !!(scanner.getTokenFlags() & 8388608 /* TokenFlags.IsBlankLine */);
}
/**
 * Gets the run length from token flags (for backticks, tildes, etc.)
 */
export function getRunLength(scanner) {
    const flags = scanner.getTokenFlags();
    return (flags & 0x3F0000) >> 16; // Extract 6-bit run length
}
/**
 * Checks if current position could start a list marker
 */
export function isListMarkerAhead(scanner) {
    const token = scanner.getToken();
    const flags = scanner.getTokenFlags();
    if (!isAtLineStart(scanner)) {
        return false;
    }
    // Unordered list markers
    if (token === 14 /* SyntaxKind.AsteriskToken */ ||
        token === 12 /* SyntaxKind.DashToken */ ||
        token === 18 /* SyntaxKind.PlusToken */) {
        return true;
    }
    // Ordered list markers
    if (token === 35 /* SyntaxKind.NumericLiteral */ &&
        !!(flags & 16384 /* TokenFlags.IsOrderedListMarker */)) {
        return true;
    }
    return false;
}
/**
 * Checks if current position could be a thematic break
 */
export function isThematicBreakAhead(scanner) {
    const token = scanner.getToken();
    if (!isAtLineStart(scanner)) {
        return false;
    }
    if (token === 14 /* SyntaxKind.AsteriskToken */ ||
        token === 12 /* SyntaxKind.DashToken */ ||
        token === 15 /* SyntaxKind.UnderscoreToken */) {
        const runLength = getRunLength(scanner);
        return runLength >= 3;
    }
    return false;
}
/**
 * Checks if next line could be a setext underline
 */
export function isSetextUnderlineAhead(scanner) {
    return scanner.lookAhead(() => {
        // Skip to next line
        while (scanner.getToken() !== 32 /* SyntaxKind.NewLineTrivia */ &&
            scanner.getToken() !== 1 /* SyntaxKind.EndOfFileToken */) {
            scanner.scan();
        }
        if (scanner.getToken() === 32 /* SyntaxKind.NewLineTrivia */) {
            scanner.scan();
        }
        if (!isAtLineStart(scanner)) {
            return false;
        }
        const token = scanner.getToken();
        if (token === 19 /* SyntaxKind.EqualsToken */ || token === 12 /* SyntaxKind.DashToken */) {
            // Check if it's a valid setext underline (only = or - characters)
            const start = scanner.getTokenStart();
            let pos = start;
            const source = scanner.getTokenText();
            while (pos < scanner.getTokenEnd()) {
                const ch = source.charCodeAt(pos - start);
                if (ch !== 61 && ch !== 45) { // = or -
                    return false;
                }
                pos++;
            }
            return true;
        }
        return false;
    });
}
/**
 * Consumes tokens until a safe boundary for error recovery
 */
export function recoverToSafeBoundary(scanner) {
    const start = scanner.getTokenStart();
    let consumed = 0;
    const maxConsume = 1024; // Hard limit to avoid pathological cases
    while (scanner.getToken() !== 1 /* SyntaxKind.EndOfFileToken */ && consumed < maxConsume) {
        const token = scanner.getToken();
        // Stop at block-level constructs
        if (isAtLineStart(scanner)) {
            if (token === 11 /* SyntaxKind.HashToken */ ||
                token === 30 /* SyntaxKind.BlockquoteToken */ ||
                isListMarkerAhead(scanner) ||
                isThematicBreakAhead(scanner) ||
                token === 2 /* SyntaxKind.LessThanToken */) {
                break;
            }
        }
        // Stop at blank lines
        if (isBlankLine(scanner)) {
            break;
        }
        // Stop at line breaks in inline mode
        if (token === 32 /* SyntaxKind.NewLineTrivia */) {
            break;
        }
        scanner.scan();
        consumed++;
    }
    const end = scanner.getTokenStart();
    const text = scanner.getTokenText().substring(start, end);
    return { text, end };
}
/**
 * Checks if a character is a valid HTML tag name start
 */
export function isTagNameStart(ch) {
    return (ch >= 65 && ch <= 90) || // A-Z
        (ch >= 97 && ch <= 122); // a-z
}
/**
 * Checks if a character is valid in an HTML tag name
 */
export function isTagNameChar(ch) {
    return isTagNameStart(ch) ||
        (ch >= 48 && ch <= 57) || // 0-9
        ch === 45; // -
}
