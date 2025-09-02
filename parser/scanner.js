/**
 * Markdown Scanner with native HTML support
 * Following TypeScript's explicit scanner architecture with micromark-inspired logical conditions
 */
import { ScannerErrorCode, TokenFlagRunLengthMask, TokenFlagRunLengthShift } from './token-types.js';
import { isLineBreak, isWhiteSpaceSingleLine, isWhiteSpace, isLetter, isDigit, isHexDigit, isAlphaNumeric, isIdentifierStart, isMarkdownPunctuation, isTagNameCharacter, isAttributeNameCharacter } from './character-codes.js';
// CommonMark HTML block tags (lowercased)
const CM_BLOCK_TAGS = new Set([
    'address', 'article', 'aside', 'base', 'basefont', 'blockquote', 'body', 'caption', 'center', 'col', 'colgroup', 'dd', 'details', 'dialog', 'dir', 'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'frame', 'frameset', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hr', 'html', 'iframe', 'legend', 'li', 'link', 'main', 'menu', 'menuitem', 'meta', 'nav', 'noframes', 'ol', 'optgroup', 'option', 'p', 'param', 'section', 'source', 'summary', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'title', 'tr', 'track', 'ul', 'pre', 'script', 'style'
]);
function isCMBlockTagName(name) {
    return CM_BLOCK_TAGS.has(name);
}
/**
 * Scanner implementation with explicit TypeScript-style control flow
 */
export function createScanner() {
    // Scanner state - encapsulated within closure, no global state
    let source = '';
    let pos = 0;
    let end = 0;
    let startPos = 0;
    let token = 0 /* SyntaxKind.Unknown */;
    let tokenValue = undefined;
    let tokenFlags = 0 /* TokenFlags.None */;
    let errorCode = ScannerErrorCode.None;
    let errorMessage = '';
    let onError = undefined;
    let errorQueue = [];
    let suppressErrorDepth = 0; // >0 => suppress emissions; queue instead
    let emittedErrorKeys = new Set(); // de-duplicate committed emissions
    // Lazy value materialization range
    let valueStart = -1;
    let valueEnd = -1;
    // Context tracking for parsing decisions
    let atLineStart = true;
    let inParagraph = false;
    let precedingLineBreak = false;
    let scanMode = 0 /* InternalScanMode.Normal */;
    let rawTextEndTag = undefined; // constant string like '</script>'
    // Track RCDATA end tag separately for clarity
    let rcdataEndTag = undefined;
    // Track current line start for column computations
    let lastLineStart = 0;
    // Track HTML block hint lifecycle (CommonMark types 1–7). When active, OR ContainsHtmlBlock into tokens
    let htmlBlockHintActive = false;
    // Ordered list start value surfaced for the last scanned numeric token if marked as list marker
    let orderedListStartValue = -1;
    // Helpers: ASCII matching without allocation
    function matchesAscii(at, text) {
        const len = text.length;
        if (at + len > end)
            return false;
        for (let i = 0; i < len; i++) {
            if (source.charCodeAt(at + i) !== text.charCodeAt(i))
                return false;
        }
        return true;
    }
    function setOnError(cb) {
        onError = cb;
    }
    function emitError(code, message) {
        const e = { start: startPos, end: pos, code, message };
        if (suppressErrorDepth > 0) {
            // During speculation: queue; do not record as emitted yet
            errorQueue.push(e);
            return;
        }
        // Immediate commit path with de-duplication
        const key = `${e.start}|${e.end}|${e.code}`;
        if (!emittedErrorKeys.has(key)) {
            // Update last error state on commit
            errorCode = e.code;
            errorMessage = e.message;
            if (onError) {
                try {
                    onError(e.start, e.end, e.code, e.message);
                }
                catch { /* ignore user errors */ }
            }
            emittedErrorKeys.add(key);
        }
    }
    function matchesAsciiCI(at, text) {
        const len = text.length;
        if (at + len > end)
            return false;
        for (let i = 0; i < len; i++) {
            const a = source.charCodeAt(at + i);
            const b = text.charCodeAt(i);
            if (a === b)
                continue;
            // Uppercase to lowercase fold for ASCII letters
            const al = (a >= 65 && a <= 90) ? a + 32 : a;
            const bl = (b >= 65 && b <= 90) ? b + 32 : b;
            if (al !== bl)
                return false;
        }
        return true;
    }
    function setValueRange(start, endPos) {
        valueStart = start;
        valueEnd = endPos;
    }
    function clearValueRange() {
        valueStart = -1;
        valueEnd = -1;
    }
    return {
        getToken: () => token,
        getTokenStart: () => startPos,
        getTokenEnd: () => pos,
        getTokenText: () => source.substring(startPos, pos),
        getTokenValue: () => {
            if (tokenValue !== undefined)
                return tokenValue;
            if (valueStart >= 0)
                return source.substring(valueStart, valueEnd);
            return source.substring(startPos, pos);
        },
        getTokenFlags: () => tokenFlags,
        getColumn: () => {
            // Compute column from lastLineStart to current startPos
            let col = 0;
            for (let i = lastLineStart; i < startPos; i++) {
                const c = source.charCodeAt(i);
                if (c === 9 /* CharacterCodes.tab */) {
                    const offset = col % 4;
                    col += (offset === 0 ? 4 : 4 - offset);
                }
                else {
                    col++;
                }
            }
            return col;
        },
        getOrderedListStart: () => orderedListStartValue,
        isUnterminated: () => !!(tokenFlags & 1 /* TokenFlags.Unterminated */),
        hasPrecedingLineBreak: () => !!(tokenFlags & 2 /* TokenFlags.PrecedingLineBreak */),
        getErrorCode: () => errorCode,
        getErrorMessage: () => errorMessage,
        setText,
        resetTokenState,
        setOnError,
        scan,
        lookAhead,
        tryScan,
        reScanLessThanToken,
        reScanGreaterThanToken,
        reScanSlashToken,
        reScanBacktickToken,
        reScanDollarToken,
        reScanPipeToken,
        reScanHashToken,
    };
    function setText(text, start, length) {
        source = text;
        pos = start || 0;
        end = length !== undefined ? pos + length : source.length;
        startPos = pos;
        token = 0 /* SyntaxKind.Unknown */;
        tokenValue = undefined;
        tokenFlags = 0 /* TokenFlags.None */;
        errorCode = ScannerErrorCode.None;
        errorMessage = '';
        // Reset error emission machinery for new text
        errorQueue = [];
        suppressErrorDepth = 0;
        emittedErrorKeys.clear();
        clearValueRange();
        // Reset context
        atLineStart = pos === 0 || (pos > 0 && isLineBreak(source.charCodeAt(pos - 1)));
        inParagraph = false;
        precedingLineBreak = false;
        // containerStack removed
        scanMode = 0 /* InternalScanMode.Normal */;
        rawTextEndTag = undefined;
        rcdataEndTag = undefined;
        lastLineStart = pos;
        htmlBlockHintActive = false;
        orderedListStartValue = -1;
    }
    function resetTokenState(position) {
        pos = position;
        startPos = position;
        token = 0 /* SyntaxKind.Unknown */;
        tokenValue = undefined;
        tokenFlags = 0 /* TokenFlags.None */;
        errorCode = ScannerErrorCode.None;
        errorMessage = '';
        // Update flags based on position context
        if (pos === 0 || (pos > 0 && isLineBreak(source.charCodeAt(pos - 1)))) {
            atLineStart = true;
            tokenFlags |= 32 /* TokenFlags.IsAtLineStart */;
            tokenFlags |= 2 /* TokenFlags.PrecedingLineBreak */;
        }
        else {
            atLineStart = false;
        }
        precedingLineBreak = false;
        orderedListStartValue = -1;
    }
    function lookAhead(callback) {
        const savedPos = pos;
        const savedStartPos = startPos;
        const savedToken = token;
        const savedTokenValue = tokenValue;
        const savedTokenFlags = tokenFlags;
        // Suppress and discard any errors during pure lookahead
        suppressErrorDepth++;
        const boundary = errorQueue.length;
        const result = callback();
        // Discard any queued speculative errors and exit suppression
        errorQueue.length = boundary;
        suppressErrorDepth--;
        // Restore state
        pos = savedPos;
        startPos = savedStartPos;
        token = savedToken;
        tokenValue = savedTokenValue;
        tokenFlags = savedTokenFlags;
        return result;
    }
    function tryScan(callback) {
        const savedPos = pos;
        // Buffer errors during trial; flush only on success
        suppressErrorDepth++;
        const boundary = errorQueue.length;
        const result = callback();
        suppressErrorDepth--;
        if (!result) {
            // Roll back position and forget any queued errors
            pos = savedPos;
            errorQueue.length = boundary;
            return result;
        }
        // Commit: flush queued errors from this boundary with de-duplication
        for (let i = boundary; i < errorQueue.length; i++) {
            const e = errorQueue[i];
            const key = `${e.start}|${e.end}|${e.code}`;
            if (!emittedErrorKeys.has(key)) {
                // Update last error state for committed speculative errors
                errorCode = e.code;
                errorMessage = e.message;
                if (onError) {
                    try {
                        onError(e.start, e.end, e.code, e.message);
                    }
                    catch { /* ignore user errors */ }
                }
                emittedErrorKeys.add(key);
            }
        }
        // Truncate queue to boundary now that errors are flushed
        errorQueue.length = boundary;
        return result;
    }
    function scan() {
        startPos = pos;
        tokenFlags = 0 /* TokenFlags.None */;
        tokenValue = undefined;
        clearValueRange();
        errorCode = ScannerErrorCode.None;
        errorMessage = '';
        orderedListStartValue = -1;
        if (precedingLineBreak) {
            tokenFlags |= 2 /* TokenFlags.PrecedingLineBreak */;
            precedingLineBreak = false;
        }
        if (atLineStart) {
            tokenFlags |= 32 /* TokenFlags.IsAtLineStart */;
        }
        // Mark tokens scanned in raw-text with flag
        if (scanMode === 1 /* InternalScanMode.RawText */) {
            tokenFlags |= 64 /* TokenFlags.IsInRawText */;
        }
        else if (scanMode === 2 /* InternalScanMode.Rcdata */) {
            tokenFlags |= 128 /* TokenFlags.IsInRcdata */;
        }
        while (pos < end) {
            const ch = source.charCodeAt(pos);
            // Raw-text content scanning: consume until the exact closing tag sequence
            if (scanMode === 1 /* InternalScanMode.RawText */) {
                // If we're at a potential end tag, allow normal scanning to proceed
                if (rawTextEndTag && ch === 60 /* CharacterCodes.lessThan */) {
                    if (matchesAsciiCI(pos, rawTextEndTag)) {
                        // Exit raw-text mode before scanning the closing tag
                        scanMode = 0 /* InternalScanMode.Normal */;
                        rawTextEndTag = undefined;
                        // Fall through to normal scanning (will return LessThanToken/closing handling)
                    }
                    else {
                        // Not the end tag; treat '<' as literal text inside raw text
                        return scanRawTextContent();
                    }
                }
                else {
                    return scanRawTextContent();
                }
            }
            else if (scanMode === 2 /* InternalScanMode.Rcdata */) {
                // RCDATA: entities remain active; stop on end tag, but allow & to be scanned
                if (rcdataEndTag && ch === 60 /* CharacterCodes.lessThan */ && matchesAsciiCI(pos, rcdataEndTag)) {
                    // Exit before scanning end tag
                    scanMode = 0 /* InternalScanMode.Normal */;
                    rcdataEndTag = undefined;
                    // fall through
                }
                else if (ch === 38 /* CharacterCodes.ampersand */) {
                    return scanAmpersand();
                }
                else {
                    return scanRcdataContent();
                }
            }
            // Skip whitespace trivia
            if (isWhiteSpaceSingleLine(ch)) {
                return scanWhitespace();
            }
            // Handle line breaks
            if (isLineBreak(ch)) {
                return scanLineBreak();
            }
            // Store line start context for scan functions
            const wasAtLineStart = atLineStart;
            // Explicit character-based scanning with micromark-inspired conditions
            let result;
            switch (ch) {
                case 60 /* CharacterCodes.lessThan */:
                    result = scanLessThan();
                    break;
                case 62 /* CharacterCodes.greaterThan */:
                    result = scanGreaterThan();
                    break;
                case 35 /* CharacterCodes.hash */:
                    result = scanHash();
                    break;
                case 42 /* CharacterCodes.asterisk */:
                    result = scanAsterisk();
                    break;
                case 95 /* CharacterCodes.underscore */:
                    result = scanUnderscore();
                    break;
                case 45 /* CharacterCodes.minus */:
                    result = scanMinus();
                    break;
                case 96 /* CharacterCodes.backtick */:
                    result = scanBacktick();
                    break;
                case 126 /* CharacterCodes.tilde */:
                    result = scanTilde();
                    break;
                case 43 /* CharacterCodes.plus */:
                    result = scanPlus();
                    break;
                case 61 /* CharacterCodes.equals */:
                    result = scanEquals();
                    break;
                case 36 /* CharacterCodes.dollar */:
                    result = scanDollar();
                    break;
                case 91 /* CharacterCodes.openBracket */:
                    result = scanOpenBracket();
                    break;
                case 93 /* CharacterCodes.closeBracket */:
                    result = scanCloseBracket();
                    break;
                case 40 /* CharacterCodes.openParen */:
                    result = scanOpenParen();
                    break;
                case 41 /* CharacterCodes.closeParen */:
                    result = scanCloseParen();
                    break;
                case 33 /* CharacterCodes.exclamation */:
                    result = scanExclamation();
                    break;
                case 58 /* CharacterCodes.colon */:
                    result = scanColon();
                    break;
                case 124 /* CharacterCodes.bar */:
                    result = scanPipe();
                    break;
                case 92 /* CharacterCodes.backslash */:
                    result = scanBackslash();
                    break;
                case 38 /* CharacterCodes.ampersand */:
                    result = scanAmpersand();
                    break;
                case 123 /* CharacterCodes.openBrace */:
                    result = scanOpenBrace();
                    break;
                case 125 /* CharacterCodes.closeBrace */:
                    result = scanCloseBrace();
                    break;
                case 47 /* CharacterCodes.slash */:
                    result = scanSlash();
                    break;
                default:
                    if (isIdentifierStart(ch)) {
                        result = scanIdentifier();
                    }
                    else if (isDigit(ch)) {
                        result = scanNumber();
                    }
                    else {
                        result = scanUnknown();
                    }
                    break;
            }
            // Update line start context after scanning - this allows scan functions
            // to use the original context for decisions but updates it for subsequent tokens
            if (wasAtLineStart && !isWhiteSpaceSingleLine(ch) && !isLineBreak(ch)) {
                atLineStart = false;
            }
            // While HTML block hint is active, mark tokens accordingly
            if (htmlBlockHintActive)
                tokenFlags |= 256 /* TokenFlags.ContainsHtmlBlock */;
            return result;
        }
        return token = 1 /* SyntaxKind.EndOfFileToken */;
    }
    // Character-specific scanning methods with explicit logic
    function scanLessThan() {
        const nextChar = source.charCodeAt(pos + 1);
        // HTML comment: <!--
        if (nextChar === 33 /* CharacterCodes.exclamation */ && pos + 4 <= end &&
            source.charCodeAt(pos + 2) === 45 /* CharacterCodes.minus */ &&
            source.charCodeAt(pos + 3) === 45 /* CharacterCodes.minus */) {
            return scanHtmlComment();
        }
        // HTML CDATA: <![CDATA[
        if (nextChar === 33 /* CharacterCodes.exclamation */ && matchesAscii(pos, '<![CDATA[')) {
            return scanHtmlCDATA();
        }
        // HTML DOCTYPE: <!DOCTYPE (case insensitive)
        if (nextChar === 33 /* CharacterCodes.exclamation */ && matchesAsciiCI(pos, '<!DOCTYPE')) {
            return scanHtmlDoctype();
        }
        // Processing instruction: <?...
        if (nextChar === 63 /* CharacterCodes.question */) {
            return scanProcessingInstruction();
        }
        // Closing tag: </
        if (nextChar === 47 /* CharacterCodes.slash */) {
            pos += 2; // consume '</'
            return token = 3 /* SyntaxKind.LessThanSlashToken */;
        }
        // Check for possible autolinks (URLs and emails)
        if (isLetter(nextChar) || isDigit(nextChar)) {
            let tempPos = pos + 1;
            let foundColon = false;
            let foundAt = false;
            let hasSpaces = false;
            // Scan ahead to see what we have
            while (tempPos < end && source.charCodeAt(tempPos) !== 62 /* CharacterCodes.greaterThan */) {
                const char = source.charCodeAt(tempPos);
                if (isWhiteSpace(char)) {
                    hasSpaces = true;
                    break;
                }
                if (char === 58 /* CharacterCodes.colon */)
                    foundColon = true;
                if (char === 64 /* CharacterCodes.at */)
                    foundAt = true;
                tempPos++;
            }
            // Only try autolink if we found > without spaces and have @ or :
            if (!hasSpaces && tempPos < end && source.charCodeAt(tempPos) === 62 /* CharacterCodes.greaterThan */ &&
                (foundColon || foundAt)) {
                return scanAutolink();
            }
        }
        // HTML tag: <div>, <span class="foo">, etc.
        if (isTagNameCharacter(nextChar)) {
            const tagResult = scanHtmlTag();
            // If scanHtmlTag failed to find a valid tag, it returns LessThanToken
            return tagResult;
        }
        // Default: consume '<' and return LessThanToken
        pos++;
        return token = 2 /* SyntaxKind.LessThanToken */;
    }
    function scanGreaterThan() {
        // Blockquote at line start: > 
        if (atLineStart) {
            pos++; // consume '>'
            if (pos < end && isWhiteSpaceSingleLine(source.charCodeAt(pos))) {
                return token = 30 /* SyntaxKind.BlockquoteToken */;
            }
            return token = 4 /* SyntaxKind.GreaterThanToken */;
        }
        pos++; // consume '>'
        return token = 4 /* SyntaxKind.GreaterThanToken */;
    }
    function scanHash() {
        let hashCount = 0;
        let tempPos = pos;
        // Count consecutive hashes
        while (tempPos < end && source.charCodeAt(tempPos) === 35 /* CharacterCodes.hash */) {
            hashCount++;
            tempPos++;
        }
        // ATX heading at line start: # ## ### (including more than 6)
        if (atLineStart && hashCount >= 1) {
            // Must be followed by space or end of line
            if (tempPos >= end || isWhiteSpace(source.charCodeAt(tempPos))) {
                pos = tempPos;
                return token = 11 /* SyntaxKind.HashToken */;
            }
        }
        // Default: single hash
        pos++;
        return token = 11 /* SyntaxKind.HashToken */;
    }
    function scanAsterisk() {
        let asteriskCount = 0;
        let tempPos = pos;
        // Count consecutive asterisks
        while (tempPos < end && source.charCodeAt(tempPos) === 42 /* CharacterCodes.asterisk */) {
            asteriskCount++;
            tempPos++;
        }
        // List marker at line start: * item
        if (atLineStart && asteriskCount === 1) {
            if (tempPos < end && isWhiteSpaceSingleLine(source.charCodeAt(tempPos))) {
                pos = tempPos;
                return token = 14 /* SyntaxKind.AsteriskToken */;
            }
        }
        // Thematic break at line start: *** (3+ contiguous asterisks)
        if (atLineStart && asteriskCount >= 3) {
            // Skip trailing spaces/tabs
            while (tempPos < end) {
                const c = source.charCodeAt(tempPos);
                if (c !== 32 /* CharacterCodes.space */ && c !== 9 /* CharacterCodes.tab */)
                    break;
                tempPos++;
            }
            if (tempPos >= end || isLineBreak(source.charCodeAt(tempPos))) {
                pos = tempPos;
                return token = 14 /* SyntaxKind.AsteriskToken */;
            }
        }
        // Emphasis/strong flanking flags
        const prev = startPos > 0 ? source.charCodeAt(startPos - 1) : 32 /* CharacterCodes.space */;
        const next = tempPos < end ? source.charCodeAt(tempPos) : 32 /* CharacterCodes.space */;
        const prevWs = isWhiteSpace(prev);
        const nextWs = isWhiteSpace(next);
        const prevP = isMarkdownPunctuation(prev);
        const nextP = isMarkdownPunctuation(next);
        const leftFlanking = !nextWs && !(nextP && !prevWs && !prevP);
        const rightFlanking = !prevWs && !(prevP && !nextWs && !nextP);
        const canOpen = leftFlanking;
        const canClose = rightFlanking;
        if (asteriskCount === 2) {
            pos += 2;
            if (canOpen)
                tokenFlags |= 512 /* TokenFlags.CanOpen */;
            if (canClose)
                tokenFlags |= 1024 /* TokenFlags.CanClose */;
            return token = 50 /* SyntaxKind.AsteriskAsterisk */;
        }
        pos++;
        if (canOpen)
            tokenFlags |= 512 /* TokenFlags.CanOpen */;
        if (canClose)
            tokenFlags |= 1024 /* TokenFlags.CanClose */;
        return token = 14 /* SyntaxKind.AsteriskToken */;
    }
    function scanUnderscore() {
        let underscoreCount = 0;
        let tempPos = pos;
        // Count consecutive underscores
        while (tempPos < end && source.charCodeAt(tempPos) === 95 /* CharacterCodes.underscore */) {
            underscoreCount++;
            tempPos++;
        }
        // Thematic break at line start: ___ (3+ contiguous underscores)
        if (atLineStart && underscoreCount >= 3) {
            // Skip trailing spaces/tabs
            while (tempPos < end) {
                const c = source.charCodeAt(tempPos);
                if (c !== 32 /* CharacterCodes.space */ && c !== 9 /* CharacterCodes.tab */)
                    break;
                tempPos++;
            }
            if (tempPos >= end || isLineBreak(source.charCodeAt(tempPos))) {
                pos = tempPos;
                return token = 15 /* SyntaxKind.UnderscoreToken */;
            }
        }
        // Emphasis/strong flanking flags (underscore constraints)
        const prev = startPos > 0 ? source.charCodeAt(startPos - 1) : 32 /* CharacterCodes.space */;
        const next = tempPos < end ? source.charCodeAt(tempPos) : 32 /* CharacterCodes.space */;
        const prevWs = isWhiteSpace(prev);
        const nextWs = isWhiteSpace(next);
        const prevP = isMarkdownPunctuation(prev);
        const nextP = isMarkdownPunctuation(next);
        const prevAlnum = isAlphaNumeric(prev);
        const nextAlnum = isAlphaNumeric(next);
        const leftFlanking = !nextWs && !(nextP && !prevWs && !prevP);
        const rightFlanking = !prevWs && !(prevP && !nextWs && !nextP);
        const intraword = prevAlnum && nextAlnum;
        const canOpen = !intraword && leftFlanking;
        const canClose = !intraword && rightFlanking;
        if (underscoreCount === 2) {
            pos += 2;
            if (canOpen)
                tokenFlags |= 512 /* TokenFlags.CanOpen */;
            if (canClose)
                tokenFlags |= 1024 /* TokenFlags.CanClose */;
            return token = 51 /* SyntaxKind.UnderscoreUnderscore */;
        }
        pos++;
        if (canOpen)
            tokenFlags |= 512 /* TokenFlags.CanOpen */;
        if (canClose)
            tokenFlags |= 1024 /* TokenFlags.CanClose */;
        return token = 15 /* SyntaxKind.UnderscoreToken */;
    }
    function scanMinus() {
        pos++; // consume first '-'
        // Check for frontmatter fence at document start: ---
        if (pos === 1) { // we're at document start
            if (pos + 1 < end && source.charCodeAt(pos) === 45 /* CharacterCodes.minus */ &&
                pos + 2 < end && source.charCodeAt(pos + 1) === 45 /* CharacterCodes.minus */) {
                // Check if this is a frontmatter fence (--- followed by newline)
                let tempPos = pos + 2;
                while (tempPos < end && source.charCodeAt(tempPos) === 45 /* CharacterCodes.minus */) {
                    tempPos++;
                }
                // Skip trailing spaces
                while (tempPos < end && source.charCodeAt(tempPos) === 32 /* CharacterCodes.space */) {
                    tempPos++;
                }
                if (tempPos >= end || isLineBreak(source.charCodeAt(tempPos))) {
                    pos = tempPos;
                    return token = 13 /* SyntaxKind.DashDashDash */;
                }
            }
        }
        // Check for list marker at line start: - item
        if (atLineStart && pos < end &&
            isWhiteSpaceSingleLine(source.charCodeAt(pos))) {
            return token = 12 /* SyntaxKind.DashToken */;
        }
        // Check for setext underline: --- (at line start, after paragraph)
        if (atLineStart && inParagraph) {
            let tempPos = pos;
            let dashCount = 1;
            while (tempPos < end && source.charCodeAt(tempPos) === 45 /* CharacterCodes.minus */) {
                dashCount++;
                tempPos++;
            }
            // Skip spaces
            while (tempPos < end && source.charCodeAt(tempPos) === 32 /* CharacterCodes.space */) {
                tempPos++;
            }
            // Must end with newline or EOF
            if (tempPos >= end || isLineBreak(source.charCodeAt(tempPos))) {
                pos = tempPos;
                return token = 12 /* SyntaxKind.DashToken */;
            }
        }
        // Check for thematic break: --- (3+ contiguous dashes)
        if (atLineStart) {
            let tempPos = pos;
            let dashCount = 1;
            while (tempPos < end && source.charCodeAt(tempPos) === 45 /* CharacterCodes.minus */) {
                dashCount++;
                tempPos++;
            }
            if (dashCount >= 3) {
                // Skip spaces/tabs
                while (tempPos < end) {
                    const c = source.charCodeAt(tempPos);
                    if (c !== 32 /* CharacterCodes.space */ && c !== 9 /* CharacterCodes.tab */)
                        break;
                    tempPos++;
                }
                if (tempPos >= end || isLineBreak(source.charCodeAt(tempPos))) {
                    pos = tempPos;
                    return token = 12 /* SyntaxKind.DashToken */;
                }
            }
        }
        return token = 12 /* SyntaxKind.DashToken */;
    }
    function scanBacktick() {
        let backtickCount = 0;
        let tempPos = pos;
        // Count consecutive backticks
        while (tempPos < end && source.charCodeAt(tempPos) === 96 /* CharacterCodes.backtick */) {
            backtickCount++;
            tempPos++;
        }
        pos = tempPos;
        // Code fences at line start: ```
        if ((tokenFlags & 32 /* TokenFlags.IsAtLineStart */) && backtickCount >= 3) {
            // Compute info string range without allocation
            const infoStart = pos;
            while (pos < end && !isLineBreak(source.charCodeAt(pos))) {
                pos++;
            }
            // Trim spaces/tabs
            let s = infoStart;
            while (s < pos && (source.charCodeAt(s) === 32 /* CharacterCodes.space */ || source.charCodeAt(s) === 9 /* CharacterCodes.tab */))
                s++;
            let e = pos;
            while (e > s && (source.charCodeAt(e - 1) === 32 /* CharacterCodes.space */ || source.charCodeAt(e - 1) === 9 /* CharacterCodes.tab */))
                e--;
            if (e > s) {
                setValueRange(s, e);
            }
            else {
                // Explicitly set empty value so getTokenValue() doesn't fall back to token text
                tokenValue = '';
                clearValueRange();
            }
            // store run length
            tokenFlags = (tokenFlags & ~TokenFlagRunLengthMask) | ((backtickCount << TokenFlagRunLengthShift) & TokenFlagRunLengthMask);
            return token = 16 /* SyntaxKind.BacktickToken */;
        }
        // Inline code: `code` or ``code with ` backtick``
        tokenFlags = (tokenFlags & ~TokenFlagRunLengthMask) | ((backtickCount << TokenFlagRunLengthShift) & TokenFlagRunLengthMask);
        return token = 16 /* SyntaxKind.BacktickToken */;
    }
    function scanTilde() {
        let tildeCount = 0;
        let tempPos = pos;
        // Count consecutive tildes
        while (tempPos < end && source.charCodeAt(tempPos) === 126 /* CharacterCodes.tilde */) {
            tildeCount++;
            tempPos++;
        }
        // Code fences at line start: ~~~
        if (atLineStart && tildeCount >= 3) {
            pos = tempPos;
            // Compute info string range without allocation
            const infoStart = pos;
            while (pos < end && !isLineBreak(source.charCodeAt(pos))) {
                pos++;
            }
            // Trim spaces/tabs
            let s = infoStart;
            while (s < pos && (source.charCodeAt(s) === 32 /* CharacterCodes.space */ || source.charCodeAt(s) === 9 /* CharacterCodes.tab */))
                s++;
            let e = pos;
            while (e > s && (source.charCodeAt(e - 1) === 32 /* CharacterCodes.space */ || source.charCodeAt(e - 1) === 9 /* CharacterCodes.tab */))
                e--;
            if (e > s)
                setValueRange(s, e);
            else
                clearValueRange();
            tokenFlags = (tokenFlags & ~TokenFlagRunLengthMask) | ((tildeCount << TokenFlagRunLengthShift) & TokenFlagRunLengthMask);
            return token = 17 /* SyntaxKind.TildeToken */;
        }
        // Strikethrough: ~~ 
        if (tildeCount === 2) {
            pos += 2;
            return token = 52 /* SyntaxKind.TildeTilde */;
        }
        pos++;
        tokenFlags = (tokenFlags & ~TokenFlagRunLengthMask) | ((1 << TokenFlagRunLengthShift) & TokenFlagRunLengthMask);
        return token = 17 /* SyntaxKind.TildeToken */;
    }
    function scanPlus() {
        pos++; // consume '+'
        // Check for frontmatter fence at document start: +++
        if (pos === 1) { // we're at document start
            if (pos + 1 < end && source.charCodeAt(pos) === 43 /* CharacterCodes.plus */ &&
                pos + 2 < end && source.charCodeAt(pos + 1) === 43 /* CharacterCodes.plus */) {
                // Check if this is a TOML frontmatter fence (+++ followed by newline)
                let tempPos = pos + 2;
                while (tempPos < end && source.charCodeAt(tempPos) === 43 /* CharacterCodes.plus */) {
                    tempPos++;
                }
                // Skip trailing spaces
                while (tempPos < end && source.charCodeAt(tempPos) === 32 /* CharacterCodes.space */) {
                    tempPos++;
                }
                if (tempPos >= end || isLineBreak(source.charCodeAt(tempPos))) {
                    pos = tempPos;
                    return token = 18 /* SyntaxKind.PlusToken */; // Use generic token, could add specific TOML fence token
                }
            }
        }
        // List marker at line start: + item
        if (atLineStart && pos < end &&
            isWhiteSpaceSingleLine(source.charCodeAt(pos))) {
            return token = 18 /* SyntaxKind.PlusToken */;
        }
        return token = 18 /* SyntaxKind.PlusToken */;
    }
    function scanEquals() {
        pos++; // consume first '='
        // Setext underline: === (at line start, after paragraph)
        if (atLineStart && inParagraph) {
            let tempPos = pos;
            let equalsCount = 1;
            while (tempPos < end && source.charCodeAt(tempPos) === 61 /* CharacterCodes.equals */) {
                equalsCount++;
                tempPos++;
            }
            // Skip spaces
            while (tempPos < end && source.charCodeAt(tempPos) === 32 /* CharacterCodes.space */) {
                tempPos++;
            }
            // Must end with newline or EOF
            if (tempPos >= end || isLineBreak(source.charCodeAt(tempPos))) {
                pos = tempPos;
                return token = 19 /* SyntaxKind.EqualsToken */;
            }
        }
        return token = 19 /* SyntaxKind.EqualsToken */;
    }
    function scanDollar() {
        pos++; // consume first $
        // Check if next char is also $ (for potential $$)
        if (pos < end && source.charCodeAt(pos) === 36 /* CharacterCodes.dollar */) {
            // This is $$, but only return DollarDollar if at line start
            if (tokenFlags & 32 /* TokenFlags.IsAtLineStart */) {
                pos++; // consume second $
                tokenFlags |= 8 /* TokenFlags.ContainsMath */;
                return token = 21 /* SyntaxKind.DollarDollar */;
            }
            // Not at line start, return single $ token (don't consume second $)
        }
        // For single $ tokens, check if it's valid math (has closing $)
        let searchPos = pos;
        let foundClosing = false;
        while (searchPos < end) {
            if (source.charCodeAt(searchPos) === 36 /* CharacterCodes.dollar */) {
                foundClosing = true;
                break;
            }
            searchPos++;
        }
        if (foundClosing && pos < end && !isWhiteSpaceSingleLine(source.charCodeAt(pos))) {
            tokenFlags |= 8 /* TokenFlags.ContainsMath */;
        }
        return token = 20 /* SyntaxKind.DollarToken */;
    }
    function scanOpenBracket() {
        // Reference definition hint: [label]: at line start
        if (tokenFlags & 32 /* TokenFlags.IsAtLineStart */) {
            let i = pos + 1; // after '['
            let sawClose = false;
            while (i < end) {
                const c = source.charCodeAt(i);
                if (c === 93 /* CharacterCodes.closeBracket */) {
                    sawClose = true;
                    break;
                }
                if (isLineBreak(c))
                    break;
                i++;
            }
            if (sawClose) {
                let j = i + 1;
                // optional spaces/tabs
                while (j < end && (source.charCodeAt(j) === 32 /* CharacterCodes.space */ || source.charCodeAt(j) === 9 /* CharacterCodes.tab */))
                    j++;
                if (j < end && source.charCodeAt(j) === 58 /* CharacterCodes.colon */) {
                    tokenFlags |= 4194304 /* TokenFlags.MaybeDefinition */;
                }
            }
        }
        pos++;
        return token = 22 /* SyntaxKind.OpenBracketToken */;
    }
    function scanCloseBracket() {
        pos++;
        return token = 23 /* SyntaxKind.CloseBracketToken */;
    }
    function scanOpenParen() {
        pos++;
        return token = 24 /* SyntaxKind.OpenParenToken */;
    }
    function scanCloseParen() {
        pos++;
        return token = 25 /* SyntaxKind.CloseParenToken */;
    }
    function scanExclamation() {
        pos++;
        return token = 26 /* SyntaxKind.ExclamationToken */;
    }
    function scanColon() {
        pos++;
        return token = 27 /* SyntaxKind.ColonToken */;
    }
    function scanPipe() {
        pos++; // consume '|'
        // Table pipe disambiguation:
        // - At line start or after whitespace: likely table row
        // - Following alphanumeric content: likely table cell separator
        // For now, always return pipe token - parser will handle table context
        return token = 28 /* SyntaxKind.PipeToken */;
    }
    function scanBackslash() {
        pos++; // consume '\\'
        if (pos >= end) {
            return token = 29 /* SyntaxKind.BackslashToken */;
        }
        const nextChar = source.charCodeAt(pos);
        // Hard line break: \\ at end of line
        if (isLineBreak(nextChar)) {
            return token = 29 /* SyntaxKind.BackslashToken */;
        }
        // Character escape: \\* \\_ \\# etc.
        if (isMarkdownPunctuation(nextChar)) {
            pos++; // consume escaped character
            tokenValue = String.fromCharCode(nextChar);
            tokenFlags |= 16 /* TokenFlags.IsEscaped */;
            return token = 6 /* SyntaxKind.HtmlText */; // escaped chars become literal text
        }
        return token = 29 /* SyntaxKind.BackslashToken */;
    }
    function scanAmpersand() {
        // HTML entity: &amp; &#123; &#x1F;
        const start = startPos;
        pos++; // consume '&'
        if (pos >= end) {
            return token = 40 /* SyntaxKind.AmpersandToken */;
        }
        // We'll scan ahead using a temporary position and only commit on success
        let tempPos = pos;
        // Named entity: &name;
        if (isLetter(source.charCodeAt(tempPos))) {
            while (tempPos < end && (isLetter(source.charCodeAt(tempPos)) || isDigit(source.charCodeAt(tempPos)))) {
                tempPos++;
            }
            if (tempPos < end && source.charCodeAt(tempPos) === 59 /* CharacterCodes.semicolon */) {
                tempPos++; // include ';'
                setValueRange(start, tempPos);
                pos = tempPos;
                return token = 6 /* SyntaxKind.HtmlText */;
            }
            // Invalid named entity (no ';') -> fall back to '&'
            pos = start + 1;
            return token = 40 /* SyntaxKind.AmpersandToken */;
        }
        // Numeric entity: &#123; or &#x1F;
        if (source.charCodeAt(tempPos) === 35 /* CharacterCodes.hash */) {
            tempPos++; // consume '#'
            let isHex = false;
            if (tempPos < end && (source.charCodeAt(tempPos) === 120 /* CharacterCodes.x */ || source.charCodeAt(tempPos) === 88 /* CharacterCodes.X */)) {
                isHex = true;
                tempPos++;
            }
            const digitsStart = tempPos;
            if (isHex) {
                while (tempPos < end && isHexDigit(source.charCodeAt(tempPos)))
                    tempPos++;
            }
            else {
                while (tempPos < end && isDigit(source.charCodeAt(tempPos)))
                    tempPos++;
            }
            // Require at least one digit and a terminating semicolon
            if (tempPos > digitsStart && tempPos < end && source.charCodeAt(tempPos) === 59 /* CharacterCodes.semicolon */) {
                tempPos++; // include ';'
                setValueRange(start, tempPos);
                pos = tempPos;
                return token = 6 /* SyntaxKind.HtmlText */;
            }
            // Invalid numeric entity -> fall back to '&'
            pos = start + 1;
            return token = 40 /* SyntaxKind.AmpersandToken */;
        }
        // Not an entity -> just '&'
        return token = 40 /* SyntaxKind.AmpersandToken */;
    }
    function scanWhitespace() {
        while (pos < end && isWhiteSpaceSingleLine(source.charCodeAt(pos))) {
            pos++;
        }
        return token = 31 /* SyntaxKind.WhitespaceTrivia */;
    }
    function scanLineBreak() {
        const ch = source.charCodeAt(pos);
        // Capture where the line break starts to examine the preceding line content
        const lineBreakStart = pos;
        pos++;
        // Handle CRLF
        if (ch === 13 /* CharacterCodes.carriageReturn */ && pos < end &&
            source.charCodeAt(pos) === 10 /* CharacterCodes.lineFeed */) {
            pos++;
        }
        // Update context flags
        atLineStart = true;
        precedingLineBreak = true;
        tokenFlags |= 2 /* TokenFlags.PrecedingLineBreak */;
        // Blank line flag: if the segment from lastLineStart to the start of the
        // line break contains only spaces/tabs (or is empty), mark as blank line.
        let isBlank = true;
        for (let i = lastLineStart; i < lineBreakStart; i++) {
            const c = source.charCodeAt(i);
            if (c !== 32 /* CharacterCodes.space */ && c !== 9 /* CharacterCodes.tab */) {
                isBlank = false;
                break;
            }
        }
        if (isBlank)
            tokenFlags |= 8388608 /* TokenFlags.IsBlankLine */;
        // Hard line break hint: if at least two spaces before newline
        let s = pos - 2; // pos is after consuming LF or CRLF
        let spaceCount = 0;
        while (s >= 0 && source.charCodeAt(s) === 32 /* CharacterCodes.space */) {
            spaceCount++;
            s--;
        }
        if (spaceCount >= 2)
            tokenFlags |= 2048 /* TokenFlags.HardBreakHint */;
        lastLineStart = pos;
        // If an HTML block is active, propagate hint to this newline token as well
        if (htmlBlockHintActive)
            tokenFlags |= 256 /* TokenFlags.ContainsHtmlBlock */;
        // Determine if next line is blank (only spaces/tabs until next line break or EOF)
        let i = pos;
        while (i < end && (source.charCodeAt(i) === 32 /* CharacterCodes.space */ || source.charCodeAt(i) === 9 /* CharacterCodes.tab */))
            i++;
        if (i >= end || isLineBreak(source.charCodeAt(i))) {
            htmlBlockHintActive = false;
        }
        return token = 32 /* SyntaxKind.NewLineTrivia */;
    }
    function scanIdentifier() {
        // In Markdown context, identifiers can include underscores, but we must
        // avoid consuming a double-underscore run here because that sequence is
        // handled by `scanUnderscore()` (for strong emphasis tokens). This keeps
        // intraword single underscores (like `a_b_`) as part of the Identifier
        // while leaving `__` available as a separate token.
        while (pos < end) {
            const ch = source.charCodeAt(pos);
            if (!isAlphaNumeric(ch) && ch !== 95 /* CharacterCodes.underscore */) {
                break;
            }
            // If we see an underscore and the next character is also an
            // underscore, stop here so the double-underscore can be tokenized by
            // scanUnderscore(). Otherwise consume the underscore as part of the
            // identifier (preserving intraword behavior).
            if (ch === 95 /* CharacterCodes.underscore */ && pos + 1 < end && source.charCodeAt(pos + 1) === 95 /* CharacterCodes.underscore */) {
                break;
            }
            pos++;
        }
        return token = 36 /* SyntaxKind.Identifier */;
    }
    function scanNumber() {
        const numStart = pos;
        while (pos < end && isDigit(source.charCodeAt(pos))) {
            pos++;
        }
        // Ordered list marker detection at line start (indent 0–3): digits+ ('.' or ')') followed by space
        if (tokenFlags & 32 /* TokenFlags.IsAtLineStart */) {
            // compute visual column from lastLineStart to numStart
            let col = 0;
            for (let i = lastLineStart; i < numStart; i++) {
                const c = source.charCodeAt(i);
                if (c === 9 /* CharacterCodes.tab */) {
                    const offset = col % 4;
                    col += (offset === 0 ? 4 : 4 - offset);
                }
                else {
                    col++;
                }
            }
            if (pos < end && (source.charCodeAt(pos) === 46 /* CharacterCodes.dot */ || source.charCodeAt(pos) === 41 /* CharacterCodes.closeParen */)) {
                const delim = source.charCodeAt(pos);
                const after = pos + 1;
                if (col <= 3 && after < end && isWhiteSpaceSingleLine(source.charCodeAt(after))) {
                    tokenFlags |= 16384 /* TokenFlags.IsOrderedListMarker */;
                    if (delim === 41 /* CharacterCodes.closeParen */)
                        tokenFlags |= 32768 /* TokenFlags.OrderedListDelimiterParen */;
                    // compute numeric value without allocation
                    let v = 0;
                    for (let i = numStart; i < pos; i++) {
                        v = v * 10 + (source.charCodeAt(i) - 48 /* CharacterCodes._0 */);
                        // Clamp to safe integer range (not strictly necessary here)
                        if (v > 2147483647) {
                            v = 2147483647;
                            break;
                        }
                    }
                    orderedListStartValue = v;
                }
            }
        }
        return token = 35 /* SyntaxKind.NumericLiteral */;
    }
    function scanUnknown() {
        pos++;
        return token = 0 /* SyntaxKind.Unknown */;
    }
    function scanHtmlComment() {
        // Skip '<!--'
        pos += 4; // consume '<!--'
        const contentStart = pos;
        // Scan until -->
        while (pos + 2 < end) {
            if (source.charCodeAt(pos) === 45 /* CharacterCodes.minus */ &&
                source.charCodeAt(pos + 1) === 45 /* CharacterCodes.minus */ &&
                source.charCodeAt(pos + 2) === 62 /* CharacterCodes.greaterThan */) {
                setValueRange(contentStart, pos);
                pos += 3; // consume '-->'  
                tokenFlags |= 4 /* TokenFlags.ContainsHtml */;
                if (tokenFlags & 32 /* TokenFlags.IsAtLineStart */) {
                    tokenFlags |= 256 /* TokenFlags.ContainsHtmlBlock */;
                    htmlBlockHintActive = true;
                }
                return token = 7 /* SyntaxKind.HtmlComment */;
            }
            pos++;
        }
        // Unterminated comment
        tokenFlags |= 1 /* TokenFlags.Unterminated */;
        tokenFlags |= 4 /* TokenFlags.ContainsHtml */;
        if (tokenFlags & 32 /* TokenFlags.IsAtLineStart */) {
            tokenFlags |= 256 /* TokenFlags.ContainsHtmlBlock */;
            htmlBlockHintActive = true;
        }
        setValueRange(contentStart, end);
        pos = end;
        emitError(ScannerErrorCode.UnterminatedComment, 'Unterminated HTML comment');
        return token = 7 /* SyntaxKind.HtmlComment */;
    }
    function scanHtmlCDATA() {
        // Skip '<![CDATA['
        pos += 9; // consume '<![CDATA['
        const contentStart = pos;
        // Scan until ]]>
        while (pos + 2 < end) {
            if (source.charCodeAt(pos) === 93 /* CharacterCodes.closeBracket */ &&
                source.charCodeAt(pos + 1) === 93 /* CharacterCodes.closeBracket */ &&
                source.charCodeAt(pos + 2) === 62 /* CharacterCodes.greaterThan */) {
                setValueRange(contentStart, pos);
                pos += 3; // consume ']]>'
                tokenFlags |= 4 /* TokenFlags.ContainsHtml */;
                if (tokenFlags & 32 /* TokenFlags.IsAtLineStart */) {
                    tokenFlags |= 256 /* TokenFlags.ContainsHtmlBlock */;
                    htmlBlockHintActive = true;
                }
                return token = 8 /* SyntaxKind.HtmlCDATA */;
            }
            pos++;
        }
        // Unterminated CDATA
        tokenFlags |= 1 /* TokenFlags.Unterminated */;
        tokenFlags |= 4 /* TokenFlags.ContainsHtml */;
        if (tokenFlags & 32 /* TokenFlags.IsAtLineStart */) {
            tokenFlags |= 256 /* TokenFlags.ContainsHtmlBlock */;
            htmlBlockHintActive = true;
        }
        setValueRange(contentStart, end);
        pos = end;
        emitError(ScannerErrorCode.UnterminatedCDATA, 'Unterminated CDATA section');
        return token = 8 /* SyntaxKind.HtmlCDATA */;
    }
    function scanHtmlDoctype() {
        // Skip '<!DOCTYPE' or '<!doctype'
        pos += 9; // consume '<!DOCTYPE' or '<!doctype'
        const contentStart = pos;
        // Scan until >
        while (pos < end && source.charCodeAt(pos) !== 62 /* CharacterCodes.greaterThan */) {
            pos++;
        }
        if (pos < end && source.charCodeAt(pos) === 62 /* CharacterCodes.greaterThan */) {
            // Exclude closing '>' and trim without allocation
            const rawEnd = pos; // points to '>'
            pos++; // consume '>'
            let s = contentStart;
            while (s < rawEnd && isWhiteSpace(source.charCodeAt(s)))
                s++;
            let e = rawEnd - 1;
            while (e >= s && isWhiteSpace(source.charCodeAt(e)))
                e--;
            setValueRange(s, e + 1);
            tokenFlags |= 4 /* TokenFlags.ContainsHtml */;
            if (tokenFlags & 32 /* TokenFlags.IsAtLineStart */) {
                tokenFlags |= 256 /* TokenFlags.ContainsHtmlBlock */;
                htmlBlockHintActive = true;
            }
            return token = 9 /* SyntaxKind.HtmlDoctype */;
        }
        // Unterminated DOCTYPE
        tokenFlags |= 1 /* TokenFlags.Unterminated */;
        tokenFlags |= 4 /* TokenFlags.ContainsHtml */;
        if (tokenFlags & 32 /* TokenFlags.IsAtLineStart */) {
            tokenFlags |= 256 /* TokenFlags.ContainsHtmlBlock */;
            htmlBlockHintActive = true;
        }
        setValueRange(contentStart, end);
        pos = end;
        return token = 9 /* SyntaxKind.HtmlDoctype */;
    }
    function scanProcessingInstruction() {
        // Skip '<?'
        pos += 2;
        const contentStart = pos;
        // Scan until ?>
        while (pos + 1 < end) {
            if (source.charCodeAt(pos) === 63 /* CharacterCodes.question */ &&
                source.charCodeAt(pos + 1) === 62 /* CharacterCodes.greaterThan */) {
                setValueRange(contentStart, pos);
                pos += 2; // consume '?>'
                tokenFlags |= 4 /* TokenFlags.ContainsHtml */;
                if (tokenFlags & 32 /* TokenFlags.IsAtLineStart */) {
                    tokenFlags |= 256 /* TokenFlags.ContainsHtmlBlock */;
                    htmlBlockHintActive = true;
                }
                return token = 10 /* SyntaxKind.HtmlProcessingInstruction */;
            }
            pos++;
        }
        // Unterminated processing instruction
        tokenFlags |= 1 /* TokenFlags.Unterminated */;
        tokenFlags |= 4 /* TokenFlags.ContainsHtml */;
        if (tokenFlags & 32 /* TokenFlags.IsAtLineStart */) {
            tokenFlags |= 256 /* TokenFlags.ContainsHtmlBlock */;
            htmlBlockHintActive = true;
        }
        setValueRange(contentStart, end);
        pos = end;
        return token = 10 /* SyntaxKind.HtmlProcessingInstruction */;
    }
    function scanAutolink() {
        const start = pos; // remember start position
        pos++; // consume '<'
        const contentStart = pos;
        // Scan until >
        while (pos < end && source.charCodeAt(pos) !== 62 /* CharacterCodes.greaterThan */ &&
            !isWhiteSpace(source.charCodeAt(pos))) {
            pos++;
        }
        if (pos < end && source.charCodeAt(pos) === 62 /* CharacterCodes.greaterThan */) {
            // Validate email or URL in-place without allocation
            let i = contentStart;
            let hasAt = false;
            let atPos = -1;
            let hasDotAfterAt = false;
            while (i < pos) {
                const c = source.charCodeAt(i);
                if (c === 64 /* CharacterCodes.at */) {
                    hasAt = true;
                    atPos = i;
                }
                else if (c === 46 /* CharacterCodes.dot */) {
                    if (hasAt && i > atPos + 1)
                        hasDotAfterAt = true;
                }
                i++;
            }
            const emailValid = hasAt && hasDotAfterAt && atPos > contentStart && atPos < pos - 1;
            // URL: (http|https|ftp):// and at least one '.' after scheme
            let urlValid = false;
            let p = contentStart;
            // match 'http' or 'https' or 'ftp'
            if (matchesAscii(p, 'http')) {
                p += 4;
                if (p < pos && source.charCodeAt(p) === 115 /* CharacterCodes.s */)
                    p++;
            }
            else if (matchesAscii(p, 'ftp')) {
                p += 3;
            }
            if (p > contentStart) {
                if (p + 2 < pos && source.charCodeAt(p) === 58 /* CharacterCodes.colon */ &&
                    source.charCodeAt(p + 1) === 47 /* CharacterCodes.slash */ &&
                    source.charCodeAt(p + 2) === 47 /* CharacterCodes.slash */) {
                    let q = p + 3;
                    let hasDot = false;
                    while (q < pos) {
                        if (source.charCodeAt(q) === 46 /* CharacterCodes.dot */) {
                            hasDot = true;
                            break;
                        }
                        q++;
                    }
                    urlValid = hasDot;
                }
            }
            if (emailValid || urlValid) {
                // Set value range to enclosed content
                setValueRange(contentStart, pos);
                pos++; // consume '>'
                if (emailValid)
                    tokenFlags |= 4096 /* TokenFlags.IsAutolinkEmail */;
                else
                    tokenFlags |= 8192 /* TokenFlags.IsAutolinkUrl */;
                return token = 6 /* SyntaxKind.HtmlText */;
            }
        }
        // Not a valid autolink, reset and return LessThanToken
        pos = start + 1;
        return token = 2 /* SyntaxKind.LessThanToken */;
    }
    function scanHtmlTag() {
        const start = startPos; // include '<'
        pos++; // consume '<'
        // Scan tag name - must be at least one character and valid
        const tagNameStart = pos;
        while (pos < end && isTagNameCharacter(source.charCodeAt(pos))) {
            pos++;
        }
        // Must have a valid tag name (at least one character)
        if (pos === tagNameStart) {
            pos = start + 1;
            return token = 2 /* SyntaxKind.LessThanToken */;
        }
        // Detect raw-text and RCDATA elements by tag name without allocation
        const tagLen = pos - tagNameStart;
        let rawTextCandidate = undefined;
        let rcdataCandidate = undefined;
        // Compare case-insensitively by length + ascii match
        if (tagLen === 6 && matchesAsciiCI(tagNameStart, 'script'))
            rawTextCandidate = '</script>';
        else if (tagLen === 5 && matchesAsciiCI(tagNameStart, 'style'))
            rawTextCandidate = '</style>';
        else if (tagLen === 8 && matchesAsciiCI(tagNameStart, 'textarea'))
            rcdataCandidate = '</textarea>';
        else if (tagLen === 5 && matchesAsciiCI(tagNameStart, 'title'))
            rcdataCandidate = '</title>';
        // If next character is whitespace, check if it's followed by valid attributes or >
        if (pos < end && isWhiteSpace(source.charCodeAt(pos))) {
            const afterTagName = pos;
            // Skip whitespace
            while (pos < end && isWhiteSpace(source.charCodeAt(pos))) {
                pos++;
            }
            // If we don't find valid attributes or closing >, this isn't a valid tag
            if (pos >= end ||
                (!isAttributeNameCharacter(source.charCodeAt(pos)) &&
                    source.charCodeAt(pos) !== 62 /* CharacterCodes.greaterThan */ &&
                    source.charCodeAt(pos) !== 47 /* CharacterCodes.slash */)) {
                pos = start + 1;
                return token = 2 /* SyntaxKind.LessThanToken */;
            }
            pos = afterTagName; // reset for attribute scanning
        }
        // Skip attributes
        while (pos < end && source.charCodeAt(pos) !== 62 /* CharacterCodes.greaterThan */ &&
            source.charCodeAt(pos) !== 47 /* CharacterCodes.slash */) {
            if (isWhiteSpace(source.charCodeAt(pos))) {
                // Skip whitespace
                while (pos < end && isWhiteSpace(source.charCodeAt(pos))) {
                    pos++;
                }
            }
            else if (isAttributeNameCharacter(source.charCodeAt(pos))) {
                // Skip attribute name
                while (pos < end && isAttributeNameCharacter(source.charCodeAt(pos))) {
                    pos++;
                }
                // Skip = and value
                if (pos < end && source.charCodeAt(pos) === 61 /* CharacterCodes.equals */) {
                    pos++; // consume '='
                    // Skip attribute value (quoted or unquoted)
                    if (pos < end && (source.charCodeAt(pos) === 34 /* CharacterCodes.doubleQuote */ ||
                        source.charCodeAt(pos) === 39 /* CharacterCodes.singleQuote */)) {
                        const quote = source.charCodeAt(pos);
                        pos++; // consume opening quote
                        while (pos < end && source.charCodeAt(pos) !== quote) {
                            pos++;
                        }
                        if (pos < end)
                            pos++; // consume closing quote
                    }
                    else {
                        // Unquoted attribute value
                        while (pos < end && !isWhiteSpace(source.charCodeAt(pos)) &&
                            source.charCodeAt(pos) !== 62 /* CharacterCodes.greaterThan */ &&
                            source.charCodeAt(pos) !== 47 /* CharacterCodes.slash */) {
                            pos++;
                        }
                    }
                }
            }
            else {
                pos++; // skip unknown character
            }
        }
        // Handle tag ending
        if (pos < end && source.charCodeAt(pos) === 47 /* CharacterCodes.slash */) {
            pos++; // consume '/'
            if (pos < end && source.charCodeAt(pos) === 62 /* CharacterCodes.greaterThan */) {
                pos++; // consume '>'
                tokenFlags |= 4 /* TokenFlags.ContainsHtml */;
                return token = 6 /* SyntaxKind.HtmlText */;
            }
        }
        else if (pos < end && source.charCodeAt(pos) === 62 /* CharacterCodes.greaterThan */) {
            pos++; // consume '>'
            tokenFlags |= 4 /* TokenFlags.ContainsHtml */;
            if (tokenFlags & 32 /* TokenFlags.IsAtLineStart */) {
                // Only set HTML block hint for CommonMark block tags
                const tagName = source.substring(tagNameStart, tagNameStart + tagLen).toLowerCase();
                if (isCMBlockTagName(tagName)) {
                    tokenFlags |= 256 /* TokenFlags.ContainsHtmlBlock */;
                    htmlBlockHintActive = true;
                }
            }
            // Enter raw-text mode for specific elements (only for opening tags)
            if (rawTextCandidate) {
                rawTextEndTag = rawTextCandidate; // constant string e.g. '</script>'
                scanMode = 1 /* InternalScanMode.RawText */;
            }
            else if (rcdataCandidate) {
                rcdataEndTag = rcdataCandidate;
                scanMode = 2 /* InternalScanMode.Rcdata */;
            }
            return token = 6 /* SyntaxKind.HtmlText */;
        }
        // Not a complete tag, reset
        pos = startPos + 1;
        return token = 2 /* SyntaxKind.LessThanToken */;
    }
    function reScanLessThanToken() {
        pos = startPos;
        // Decide based on the actual character at start
        if (source.charCodeAt(pos) === 60 /* CharacterCodes.lessThan */)
            return scanLessThan();
        return scan();
    }
    function reScanGreaterThanToken() {
        pos = startPos;
        if (source.charCodeAt(pos) === 62 /* CharacterCodes.greaterThan */)
            return scanGreaterThan();
        return scan();
    }
    function reScanSlashToken() {
        pos = startPos;
        if (source.charCodeAt(pos) === 47 /* CharacterCodes.slash */)
            return scanSlash();
        return scan();
    }
    function reScanBacktickToken() {
        pos = startPos;
        if (source.charCodeAt(pos) === 96 /* CharacterCodes.backtick */)
            return scanBacktick();
        return scan();
    }
    function reScanDollarToken() {
        pos = startPos;
        if (source.charCodeAt(pos) === 36 /* CharacterCodes.dollar */)
            return scanDollar();
        return scan();
    }
    function reScanPipeToken() {
        pos = startPos;
        if (source.charCodeAt(pos) === 124 /* CharacterCodes.bar */)
            return scanPipe();
        return scan();
    }
    function reScanHashToken() {
        pos = startPos;
        if (source.charCodeAt(pos) === 35 /* CharacterCodes.hash */)
            return scanHash();
        return scan();
    }
    function scanRawTextContent() {
        const start = pos;
        while (pos < end) {
            const ch = source.charCodeAt(pos);
            if (ch === 60 /* CharacterCodes.lessThan */) {
                if (rawTextEndTag && matchesAsciiCI(pos, rawTextEndTag)) {
                    break; // do not consume the closing tag start
                }
            }
            pos++;
        }
        if (pos > start) {
            setValueRange(start, pos);
            tokenFlags |= 4 /* TokenFlags.ContainsHtml */;
            tokenFlags |= 64 /* TokenFlags.IsInRawText */;
            // If we reached EOF without finding a closing tag, flag unterminated
            if (pos >= end && rawTextEndTag) {
                tokenFlags |= 1 /* TokenFlags.Unterminated */;
                emitError(ScannerErrorCode.UnexpectedEndOfFile, 'Unterminated RAWTEXT element content');
            }
            return token = 6 /* SyntaxKind.HtmlText */;
        }
        // Fallback if nothing consumed
        return scan();
    }
    function scanRcdataContent() {
        const start = pos;
        while (pos < end) {
            const ch = source.charCodeAt(pos);
            if (ch === 38 /* CharacterCodes.ampersand */)
                break;
            if (rcdataEndTag && ch === 60 /* CharacterCodes.lessThan */ && matchesAsciiCI(pos, rcdataEndTag))
                break;
            pos++;
        }
        if (pos > start) {
            setValueRange(start, pos);
            tokenFlags |= 4 /* TokenFlags.ContainsHtml */;
            tokenFlags |= 128 /* TokenFlags.IsInRcdata */;
            if (pos >= end && rcdataEndTag) {
                tokenFlags |= 1 /* TokenFlags.Unterminated */;
                emitError(ScannerErrorCode.UnexpectedEndOfFile, 'Unterminated RCDATA element content');
            }
            return token = 6 /* SyntaxKind.HtmlText */;
        }
        return scan();
    }
    function scanOpenBrace() {
        pos++; // consume '{'
        // Attribute block: {#id .class key=value}
        // This is used in extended Markdown for attaching attributes to elements
        const start = pos;
        let braceDepth = 1;
        while (pos < end && braceDepth > 0) {
            const ch = source.charCodeAt(pos);
            if (ch === 123 /* CharacterCodes.openBrace */) {
                braceDepth++;
            }
            else if (ch === 125 /* CharacterCodes.closeBrace */) {
                braceDepth--;
            }
            else if (isLineBreak(ch)) {
                // Attribute blocks don't span lines
                break;
            }
            pos++;
        }
        if (braceDepth === 0 && pos > start + 1) {
            setValueRange(start, pos - 1); // exclude closing brace
            return token = 47 /* SyntaxKind.OpenBraceToken */;
        }
        // Not a valid attribute block or malformed, always return empty value
        pos = startPos + 1;
        tokenValue = '';
        clearValueRange();
        return token = 47 /* SyntaxKind.OpenBraceToken */;
    }
    function scanCloseBrace() {
        pos++; // consume '}'
        tokenValue = ''; // Empty value for simple tokens
        return token = 48 /* SyntaxKind.CloseBraceToken */;
    }
    function scanSlash() {
        pos++; // consume '/'
        // Check for self-closing tag: />
        if (pos < end && source.charCodeAt(pos) === 62 /* CharacterCodes.greaterThan */) {
            pos++; // consume '>'
            return token = 5 /* SyntaxKind.SlashGreaterThanToken */;
        }
        return token = 0 /* SyntaxKind.Unknown */; // slash by itself is not a valid Markdown token
    }
}
