/**
 * Token types for Markdown scanner following TypeScript's SyntaxKind pattern
 * Includes both HTML and Markdown tokens as first-class citizens
 */
// Packed run-length for certain tokens (e.g., backtick/tilde). We pack the integer
// length into tokenFlags using the following mask/shift. This avoids allocations
// while giving the parser precise run sizes.
export const TokenFlagRunLengthShift = 16;
export const TokenFlagRunLengthMask = 0x3F << TokenFlagRunLengthShift; // 6 bits (0-63)
/**
 * Scanner error codes for diagnostics
 */
export var ScannerErrorCode;
(function (ScannerErrorCode) {
    ScannerErrorCode[ScannerErrorCode["None"] = 0] = "None";
    ScannerErrorCode[ScannerErrorCode["UnterminatedString"] = 1] = "UnterminatedString";
    ScannerErrorCode[ScannerErrorCode["UnterminatedComment"] = 2] = "UnterminatedComment";
    ScannerErrorCode[ScannerErrorCode["UnterminatedCDATA"] = 3] = "UnterminatedCDATA";
    ScannerErrorCode[ScannerErrorCode["InvalidCharacter"] = 4] = "InvalidCharacter";
    ScannerErrorCode[ScannerErrorCode["InvalidEscape"] = 5] = "InvalidEscape";
    ScannerErrorCode[ScannerErrorCode["InvalidEntity"] = 6] = "InvalidEntity";
    ScannerErrorCode[ScannerErrorCode["MalformedTag"] = 7] = "MalformedTag";
    ScannerErrorCode[ScannerErrorCode["UnexpectedEndOfFile"] = 8] = "UnexpectedEndOfFile";
})(ScannerErrorCode || (ScannerErrorCode = {}));
