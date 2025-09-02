import { isLineBreak, isWhiteSpaceSingleLine } from './character-codes.js';
/**
 * Scanner2 implementation with closure-based architecture
 * Stage 1: Basic text lines + whitespace/newlines only
 */
export function createScanner2() {
    // Scanner state - encapsulated within closure
    let source = '';
    let pos = 0;
    let end = 0;
    let line = 1;
    let column = 1;
    let lastLineStart = 0;
    // Content processing mode
    let contentMode = 0 /* ContentMode.Normal */;
    let endPattern = undefined;
    // Context flags
    let contextFlags = 1 /* ContextFlags.AtLineStart */;
    // Scanner interface fields - these are the 4 public fields
    let token = 0 /* SyntaxKind2.Unknown */;
    let tokenText = '';
    let tokenFlags = 0 /* TokenFlags2.None */;
    let offsetNext = 0;
    // Cross-line state continuity
    let currentIndentLevel = 0;
    let lastBlankLinePos = -1;
    /**
     * Helper functions reused from existing scanner
     */
    function updatePosition(newPos) {
        while (pos < newPos) {
            const ch = source.charCodeAt(pos);
            if (isLineBreak(ch)) {
                if (ch === 13 /* CharacterCodes.carriageReturn */ &&
                    pos + 1 < end &&
                    source.charCodeAt(pos + 1) === 10 /* CharacterCodes.lineFeed */) {
                    pos++; // Skip CR in CRLF
                }
                line++;
                column = 1;
                lastLineStart = pos + 1;
                contextFlags |= 1 /* ContextFlags.AtLineStart */;
                contextFlags |= 4 /* ContextFlags.PrecedingLineBreak */;
            }
            else {
                column++;
                if (ch !== 32 /* CharacterCodes.space */ && ch !== 9 /* CharacterCodes.tab */) {
                    contextFlags &= ~1 /* ContextFlags.AtLineStart */;
                }
            }
            pos++;
        }
    }
    function getCurrentIndentLevel() {
        if (!(contextFlags & 1 /* ContextFlags.AtLineStart */))
            return 0;
        let indent = 0;
        let i = lastLineStart;
        while (i < end) {
            const ch = source.charCodeAt(i);
            if (ch === 32 /* CharacterCodes.space */) {
                indent++;
            }
            else if (ch === 9 /* CharacterCodes.tab */) {
                indent += 4; // Tab = 4 spaces
            }
            else {
                break;
            }
            i++;
        }
        return indent;
    }
    function isBlankLine() {
        let i = lastLineStart;
        while (i < end && !isLineBreak(source.charCodeAt(i))) {
            const ch = source.charCodeAt(i);
            if (!isWhiteSpaceSingleLine(ch)) {
                return false;
            }
            i++;
        }
        return true;
    }
    function normalizeLineWhitespace(text) {
        // Normalize whitespace within a line according to CommonMark:
        // - Convert tabs to spaces (4-space tabs)
        // - Collapse multiple consecutive spaces to single space
        // - Trim leading and trailing whitespace
        return text.replace(/\t/g, '    ').replace(/ +/g, ' ').trim();
    }
    /**
     * Token emission functions
     */
    function emitToken(kind, start, endPos, flags = 0 /* TokenFlags2.None */) {
        token = kind;
        tokenText = source.substring(start, endPos);
        tokenFlags = flags;
        offsetNext = endPos;
        // Add context-based flags
        if (contextFlags & 4 /* ContextFlags.PrecedingLineBreak */) {
            tokenFlags |= 1 /* TokenFlags2.PrecedingLineBreak */;
        }
        if (contextFlags & 1 /* ContextFlags.AtLineStart */) {
            tokenFlags |= 2 /* TokenFlags2.IsAtLineStart */;
        }
        // Update position tracking
        updatePosition(endPos);
        // Reset preceding line break flag after first token
        contextFlags &= ~4 /* ContextFlags.PrecedingLineBreak */;
    }
    function emitTextContent(start) {
        const lineStart = start;
        let lineEnd = start;
        // Scan to end of line, but not including the line break
        while (lineEnd < end && !isLineBreak(source.charCodeAt(lineEnd))) {
            lineEnd++;
        }
        if (lineEnd > lineStart) {
            const rawText = source.substring(lineStart, lineEnd);
            const normalizedText = normalizeLineWhitespace(rawText);
            let flags = 0 /* TokenFlags2.None */;
            // Add rollback flags for safe restart points
            if (contextFlags & 1 /* ContextFlags.AtLineStart */) {
                flags |= 8 /* TokenFlags2.CanRollbackHere */;
            }
            // Add context flags
            if (contextFlags & 4 /* ContextFlags.PrecedingLineBreak */) {
                flags |= 1 /* TokenFlags2.PrecedingLineBreak */;
            }
            if (contextFlags & 1 /* ContextFlags.AtLineStart */) {
                flags |= 2 /* TokenFlags2.IsAtLineStart */;
            }
            // Manually set token fields instead of using emitToken to use normalized text
            token = 2 /* SyntaxKind2.StringLiteral */;
            tokenText = normalizedText;
            tokenFlags = flags;
            offsetNext = lineEnd;
            // Update position tracking
            updatePosition(lineEnd);
            // Reset preceding line break flag after first token
            contextFlags &= ~4 /* ContextFlags.PrecedingLineBreak */;
            // Update paragraph state
            if (normalizedText.length > 0) {
                contextFlags |= 2 /* ContextFlags.InParagraph */;
            }
        }
        else {
            // Empty line content - this shouldn't happen in normal flow
            emitToken(2 /* SyntaxKind2.StringLiteral */, start, start, 4 /* TokenFlags2.IsBlankLine */);
        }
    }
    function emitWhitespace(start) {
        let wsEnd = start;
        while (wsEnd < end && isWhiteSpaceSingleLine(source.charCodeAt(wsEnd))) {
            wsEnd++;
        }
        if (wsEnd > start) {
            emitToken(3 /* SyntaxKind2.WhitespaceTrivia */, start, wsEnd);
        }
    }
    function emitNewline(start) {
        let nlEnd = start;
        const ch = source.charCodeAt(nlEnd);
        if (ch === 13 /* CharacterCodes.carriageReturn */ &&
            nlEnd + 1 < end &&
            source.charCodeAt(nlEnd + 1) === 10 /* CharacterCodes.lineFeed */) {
            nlEnd += 2; // CRLF
        }
        else if (isLineBreak(ch)) {
            nlEnd++; // LF or other line break
        }
        let flags = 0 /* TokenFlags2.None */;
        // Check if this newline ends a blank line
        if (isBlankLine()) {
            flags |= 4 /* TokenFlags2.IsBlankLine */;
            lastBlankLinePos = start;
            contextFlags &= ~2 /* ContextFlags.InParagraph */; // Reset paragraph context
        }
        emitToken(4 /* SyntaxKind2.NewLineTrivia */, start, nlEnd, flags);
        contextFlags |= 1 /* ContextFlags.AtLineStart */ | 4 /* ContextFlags.PrecedingLineBreak */;
    }
    /**
     * Main scanning function - Stage 1 implementation
     */
    function scanImpl() {
        if (pos >= end) {
            emitToken(1 /* SyntaxKind2.EndOfFileToken */, pos, pos);
            return;
        }
        const start = pos;
        const ch = source.charCodeAt(pos);
        // Update indent level at line start
        if (contextFlags & 1 /* ContextFlags.AtLineStart */) {
            currentIndentLevel = getCurrentIndentLevel();
        }
        // Stage 1: Handle only text, whitespace, and newlines
        if (isLineBreak(ch)) {
            emitNewline(start);
        }
        else if (isWhiteSpaceSingleLine(ch) && (contextFlags & 1 /* ContextFlags.AtLineStart */)) {
            // Leading whitespace at line start
            emitWhitespace(start);
        }
        else {
            // Everything else is text content for Stage 1
            // This includes whitespace within text
            emitTextContent(start);
        }
    }
    /**
     * Public interface implementation
     */
    function setText(text, start = 0, length) {
        source = text;
        pos = start;
        end = length !== undefined ? start + length : text.length;
        line = 1;
        column = 1;
        lastLineStart = 0;
        // Reset state
        contentMode = 0 /* ContentMode.Normal */;
        endPattern = undefined;
        contextFlags = 1 /* ContextFlags.AtLineStart */;
        currentIndentLevel = 0;
        lastBlankLinePos = -1;
        // Reset token fields
        token = 0 /* SyntaxKind2.Unknown */;
        tokenText = '';
        tokenFlags = 0 /* TokenFlags2.None */;
        offsetNext = start;
    }
    function scan() {
        scanImpl();
    }
    function rollback(position, type) {
        // Simple rollback implementation for Stage 1
        if (position < 0 || position > source.length) {
            throw new Error(`Invalid rollback position: ${position}`);
        }
        // Reset position
        pos = position;
        // Recalculate line/column
        line = 1;
        column = 1;
        lastLineStart = 0;
        for (let i = 0; i < position; i++) {
            const ch = source.charCodeAt(i);
            if (isLineBreak(ch)) {
                if (ch === 13 /* CharacterCodes.carriageReturn */ &&
                    i + 1 < source.length &&
                    source.charCodeAt(i + 1) === 10 /* CharacterCodes.lineFeed */) {
                    i++; // Skip CR in CRLF
                }
                line++;
                column = 1;
                lastLineStart = i + 1;
            }
            else {
                column++;
            }
        }
        // Reset context flags
        contextFlags = 1 /* ContextFlags.AtLineStart */;
        if (position > 0) {
            contextFlags |= 4 /* ContextFlags.PrecedingLineBreak */;
        }
        // Reset token fields
        token = 0 /* SyntaxKind2.Unknown */;
        tokenText = '';
        tokenFlags = 0 /* TokenFlags2.None */;
        offsetNext = position;
    }
    function fillDebugState(state) {
        // Fill position state
        state.pos = pos;
        state.line = line;
        state.column = column;
        state.mode = contentMode === 0 /* ContentMode.Normal */ ? 'Normal' :
            contentMode === 1 /* ContentMode.RawText */ ? 'RawText' : 'RCData';
        // Fill context state
        state.atLineStart = !!(contextFlags & 1 /* ContextFlags.AtLineStart */);
        state.inParagraph = !!(contextFlags & 2 /* ContextFlags.InParagraph */);
        state.precedingLineBreak = !!(contextFlags & 4 /* ContextFlags.PrecedingLineBreak */);
        // Fill token state
        state.currentToken = token;
        state.currentTokenText = tokenText;
        state.currentTokenFlags = tokenFlags;
        state.nextOffset = offsetNext;
    }
    // Return the scanner interface object
    const scanner = {
        // Methods
        scan,
        rollback,
        fillDebugState,
        initText: setText,
        // Direct field access - these are the 4 public fields
        get token() { return token; },
        set token(value) { token = value; },
        get tokenText() { return tokenText; },
        set tokenText(value) { tokenText = value; },
        get tokenFlags() { return tokenFlags; },
        set tokenFlags(value) { tokenFlags = value; },
        get offsetNext() { return offsetNext; },
        set offsetNext(value) { offsetNext = value; }
    };
    return scanner;
}
