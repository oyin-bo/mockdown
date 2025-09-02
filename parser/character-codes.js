/**
 * Character code constants and classification functions
 * Following TypeScript's character code pattern for consistent character handling
 */
/**
 * Check if character is a line break
 */
export function isLineBreak(ch) {
    return ch === 10 /* CharacterCodes.lineFeed */ ||
        ch === 13 /* CharacterCodes.carriageReturn */ ||
        ch === 8232 /* CharacterCodes.lineSeparator */ ||
        ch === 8233 /* CharacterCodes.paragraphSeparator */ ||
        ch === 133 /* CharacterCodes.nextLine */;
}
/**
 * Check if character is whitespace (excluding line breaks)
 */
export function isWhiteSpaceSingleLine(ch) {
    return ch === 32 /* CharacterCodes.space */ ||
        ch === 9 /* CharacterCodes.tab */ ||
        ch === 11 /* CharacterCodes.verticalTab */ ||
        ch === 12 /* CharacterCodes.formFeed */ ||
        ch === 160 /* CharacterCodes.nonBreakingSpace */ ||
        ch === 5760 /* CharacterCodes.ogham */ ||
        ch === 8239 /* CharacterCodes.narrowNoBreakSpace */ ||
        ch === 8287 /* CharacterCodes.mathematicalSpace */ ||
        ch === 12288 /* CharacterCodes.ideographicSpace */ ||
        (ch >= 8192 /* CharacterCodes.enQuad */ && ch <= 8203 /* CharacterCodes.zeroWidthSpace */);
}
/**
 * Check if character is any whitespace (including line breaks)
 */
export function isWhiteSpace(ch) {
    return isWhiteSpaceSingleLine(ch) || isLineBreak(ch);
}
/**
 * Check if character is an ASCII letter
 */
export function isLetter(ch) {
    return (ch >= 65 /* CharacterCodes.A */ && ch <= 90 /* CharacterCodes.Z */) ||
        (ch >= 97 /* CharacterCodes.a */ && ch <= 122 /* CharacterCodes.z */);
}
/**
 * Check if character is an ASCII digit
 */
export function isDigit(ch) {
    return ch >= 48 /* CharacterCodes.digit0 */ && ch <= 57 /* CharacterCodes.digit9 */;
}
/**
 * Check if character is a hexadecimal digit
 */
export function isHexDigit(ch) {
    return isDigit(ch) ||
        (ch >= 65 /* CharacterCodes.A */ && ch <= 70 /* CharacterCodes.F */) ||
        (ch >= 97 /* CharacterCodes.a */ && ch <= 102 /* CharacterCodes.f */);
}
/**
 * Check if character is an alphanumeric character
 */
export function isAlphaNumeric(ch) {
    return isLetter(ch) || isDigit(ch);
}
/**
 * Check if character can start an identifier
 */
export function isIdentifierStart(ch) {
    return isLetter(ch) ||
        ch === 95 /* CharacterCodes.underscore */ ||
        ch === 36 /* CharacterCodes.dollar */ ||
        isUnicodeIdentifierStart(ch);
}
/**
 * Check if character can be part of an identifier
 */
export function isIdentifierPart(ch) {
    return isAlphaNumeric(ch) ||
        ch === 95 /* CharacterCodes.underscore */ ||
        ch === 36 /* CharacterCodes.dollar */ ||
        isUnicodeIdentifierPart(ch);
}
/**
 * Check if character is ASCII punctuation that can be escaped in Markdown
 */
export function isMarkdownPunctuation(ch) {
    return ch === 33 /* CharacterCodes.exclamation */ ||
        ch === 34 /* CharacterCodes.doubleQuote */ ||
        ch === 35 /* CharacterCodes.hash */ ||
        ch === 36 /* CharacterCodes.dollar */ ||
        ch === 37 /* CharacterCodes.percent */ ||
        ch === 38 /* CharacterCodes.ampersand */ ||
        ch === 39 /* CharacterCodes.singleQuote */ ||
        ch === 40 /* CharacterCodes.openParen */ ||
        ch === 41 /* CharacterCodes.closeParen */ ||
        ch === 42 /* CharacterCodes.asterisk */ ||
        ch === 43 /* CharacterCodes.plus */ ||
        ch === 44 /* CharacterCodes.comma */ ||
        ch === 45 /* CharacterCodes.minus */ ||
        ch === 46 /* CharacterCodes.dot */ ||
        ch === 47 /* CharacterCodes.slash */ ||
        ch === 58 /* CharacterCodes.colon */ ||
        ch === 59 /* CharacterCodes.semicolon */ ||
        ch === 60 /* CharacterCodes.lessThan */ ||
        ch === 61 /* CharacterCodes.equals */ ||
        ch === 62 /* CharacterCodes.greaterThan */ ||
        ch === 63 /* CharacterCodes.question */ ||
        ch === 64 /* CharacterCodes.at */ ||
        ch === 91 /* CharacterCodes.openBracket */ ||
        ch === 92 /* CharacterCodes.backslash */ ||
        ch === 93 /* CharacterCodes.closeBracket */ ||
        ch === 94 /* CharacterCodes.caret */ ||
        ch === 95 /* CharacterCodes.underscore */ ||
        ch === 96 /* CharacterCodes.backtick */ ||
        ch === 123 /* CharacterCodes.openBrace */ ||
        ch === 124 /* CharacterCodes.bar */ ||
        ch === 125 /* CharacterCodes.closeBrace */ ||
        ch === 126 /* CharacterCodes.tilde */;
}
/**
 * Check if character can appear in an HTML tag name
 */
export function isTagNameCharacter(ch) {
    return isAlphaNumeric(ch) || ch === 45 /* CharacterCodes.minus */;
}
/**
 * Check if character can appear in an HTML attribute name
 */
export function isAttributeNameCharacter(ch) {
    return isAlphaNumeric(ch) ||
        ch === 45 /* CharacterCodes.minus */ ||
        ch === 95 /* CharacterCodes.underscore */ ||
        ch === 46 /* CharacterCodes.dot */ ||
        ch === 58 /* CharacterCodes.colon */;
}
// Simplified Unicode identifier functions - would need full Unicode tables in production
function isUnicodeIdentifierStart(ch) {
    // Simplified - would need full Unicode identifier tables
    return ch > 0x7F;
}
function isUnicodeIdentifierPart(ch) {
    // Simplified - would need full Unicode identifier tables  
    return ch > 0x7F;
}
