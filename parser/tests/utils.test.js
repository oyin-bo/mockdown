import { describe, it, expect } from 'vitest';
import { createScanner } from '../scanner';
import { ScannerErrorCode, SyntaxKind } from '../token-types';
export function scanTokensWithErrors(input, scanner = createScanner()) {
    let errors;
    scanner.setOnError((start, end, code, message) => {
        if (!errors)
            errors = [];
        errors.push(syntaxError(code));
    });
    const tokens = scanTokens(input, scanner);
    return { tokens, errors };
}
export function syntaxError(code) {
    if (!code && code !== 0)
        return undefined;
    return ScannerErrorCodeShadow[code] || 'ScannerErrorCode:0x' + code.toString(16).toUpperCase();
}
export var ScannerErrorCodeShadow;
(function (ScannerErrorCodeShadow) {
    ScannerErrorCodeShadow[ScannerErrorCodeShadow["None"] = 0] = "None";
    ScannerErrorCodeShadow[ScannerErrorCodeShadow["UnterminatedString"] = 1] = "UnterminatedString";
    ScannerErrorCodeShadow[ScannerErrorCodeShadow["UnterminatedComment"] = 2] = "UnterminatedComment";
    ScannerErrorCodeShadow[ScannerErrorCodeShadow["UnterminatedCDATA"] = 3] = "UnterminatedCDATA";
    ScannerErrorCodeShadow[ScannerErrorCodeShadow["InvalidCharacter"] = 4] = "InvalidCharacter";
    ScannerErrorCodeShadow[ScannerErrorCodeShadow["InvalidEscape"] = 5] = "InvalidEscape";
    ScannerErrorCodeShadow[ScannerErrorCodeShadow["InvalidEntity"] = 6] = "InvalidEntity";
    ScannerErrorCodeShadow[ScannerErrorCodeShadow["MalformedTag"] = 7] = "MalformedTag";
    ScannerErrorCodeShadow[ScannerErrorCodeShadow["UnexpectedEndOfFile"] = 8] = "UnexpectedEndOfFile";
})(ScannerErrorCodeShadow || (ScannerErrorCodeShadow = {}));
export function scanTokens(input, scanner = createScanner()) {
    scanner.setText(input);
    const tokens = [];
    let token;
    do {
        token = scanner.scan();
        tokens.push(wrapToken(token));
    } while (token !== SyntaxKind.EndOfFileToken);
    return tokens;
    function wrapToken(token) {
        return {
            kind: token,
            text: scanner.getTokenText(),
            value: scanner.getTokenValue(),
            start: scanner.getTokenStart(),
            end: scanner.getTokenEnd(),
            flags: scanner.getTokenFlags(),
            toString: function () {
                return ((!this.text ? '' :
                    /\s/.test(this.text) || JSON.stringify(this.text) !== '"' + this.text + '"' ?
                        JSON.stringify(this.text) + ' ' :
                        this.text + ' ') +
                    syntaxKind(this.kind));
            },
            toJSON: function () { return this.toString(); }
        };
    }
}
export function scanTokensStrings(input, scanner = createScanner()) {
    return scanTokens(input, scanner).map(t => t.toString());
}
export function syntaxKind(kind) {
    if (!kind && kind !== 0)
        return undefined;
    return SyntaxKindShadow[kind] || 'SyntaxKind:0x' + kind.toString(16).toUpperCase();
}
export var SyntaxKindShadow;
(function (SyntaxKindShadow) {
    SyntaxKindShadow[SyntaxKindShadow["Unknown"] = 0] = "Unknown";
    SyntaxKindShadow[SyntaxKindShadow["EndOfFileToken"] = 1] = "EndOfFileToken";
    // HTML Tokens
    SyntaxKindShadow[SyntaxKindShadow["LessThanToken"] = 2] = "LessThanToken";
    SyntaxKindShadow[SyntaxKindShadow["LessThanSlashToken"] = 3] = "LessThanSlashToken";
    SyntaxKindShadow[SyntaxKindShadow["GreaterThanToken"] = 4] = "GreaterThanToken";
    SyntaxKindShadow[SyntaxKindShadow["SlashGreaterThanToken"] = 5] = "SlashGreaterThanToken";
    SyntaxKindShadow[SyntaxKindShadow["HtmlText"] = 6] = "HtmlText";
    SyntaxKindShadow[SyntaxKindShadow["HtmlComment"] = 7] = "HtmlComment";
    SyntaxKindShadow[SyntaxKindShadow["HtmlCDATA"] = 8] = "HtmlCDATA";
    SyntaxKindShadow[SyntaxKindShadow["HtmlDoctype"] = 9] = "HtmlDoctype";
    SyntaxKindShadow[SyntaxKindShadow["HtmlProcessingInstruction"] = 10] = "HtmlProcessingInstruction";
    // Markdown Structure Tokens  
    SyntaxKindShadow[SyntaxKindShadow["HashToken"] = 11] = "HashToken";
    SyntaxKindShadow[SyntaxKindShadow["DashToken"] = 12] = "DashToken";
    SyntaxKindShadow[SyntaxKindShadow["DashDashDash"] = 13] = "DashDashDash";
    SyntaxKindShadow[SyntaxKindShadow["AsteriskToken"] = 14] = "AsteriskToken";
    SyntaxKindShadow[SyntaxKindShadow["UnderscoreToken"] = 15] = "UnderscoreToken";
    SyntaxKindShadow[SyntaxKindShadow["BacktickToken"] = 16] = "BacktickToken";
    SyntaxKindShadow[SyntaxKindShadow["TildeToken"] = 17] = "TildeToken";
    SyntaxKindShadow[SyntaxKindShadow["PlusToken"] = 18] = "PlusToken";
    SyntaxKindShadow[SyntaxKindShadow["EqualsToken"] = 19] = "EqualsToken";
    // Math Tokens
    SyntaxKindShadow[SyntaxKindShadow["DollarToken"] = 20] = "DollarToken";
    SyntaxKindShadow[SyntaxKindShadow["DollarDollar"] = 21] = "DollarDollar";
    // Link/Reference Tokens
    SyntaxKindShadow[SyntaxKindShadow["OpenBracketToken"] = 22] = "OpenBracketToken";
    SyntaxKindShadow[SyntaxKindShadow["CloseBracketToken"] = 23] = "CloseBracketToken";
    SyntaxKindShadow[SyntaxKindShadow["OpenParenToken"] = 24] = "OpenParenToken";
    SyntaxKindShadow[SyntaxKindShadow["CloseParenToken"] = 25] = "CloseParenToken";
    SyntaxKindShadow[SyntaxKindShadow["ExclamationToken"] = 26] = "ExclamationToken";
    SyntaxKindShadow[SyntaxKindShadow["ColonToken"] = 27] = "ColonToken";
    // Table Tokens
    SyntaxKindShadow[SyntaxKindShadow["PipeToken"] = 28] = "PipeToken";
    // Code/Escape Tokens  
    SyntaxKindShadow[SyntaxKindShadow["BackslashToken"] = 29] = "BackslashToken";
    // Blockquote Tokens
    SyntaxKindShadow[SyntaxKindShadow["BlockquoteToken"] = 30] = "BlockquoteToken";
    // Whitespace & Control
    SyntaxKindShadow[SyntaxKindShadow["WhitespaceTrivia"] = 31] = "WhitespaceTrivia";
    SyntaxKindShadow[SyntaxKindShadow["NewLineTrivia"] = 32] = "NewLineTrivia";
    SyntaxKindShadow[SyntaxKindShadow["TabTrivia"] = 33] = "TabTrivia";
    // Literal Content
    SyntaxKindShadow[SyntaxKindShadow["StringLiteral"] = 34] = "StringLiteral";
    SyntaxKindShadow[SyntaxKindShadow["NumericLiteral"] = 35] = "NumericLiteral";
    SyntaxKindShadow[SyntaxKindShadow["Identifier"] = 36] = "Identifier";
    // Special Cases
    SyntaxKindShadow[SyntaxKindShadow["AtToken"] = 37] = "AtToken";
    SyntaxKindShadow[SyntaxKindShadow["PercentToken"] = 38] = "PercentToken";
    SyntaxKindShadow[SyntaxKindShadow["CaretToken"] = 39] = "CaretToken";
    SyntaxKindShadow[SyntaxKindShadow["AmpersandToken"] = 40] = "AmpersandToken";
    SyntaxKindShadow[SyntaxKindShadow["SemicolonToken"] = 41] = "SemicolonToken";
    SyntaxKindShadow[SyntaxKindShadow["CommaToken"] = 42] = "CommaToken";
    SyntaxKindShadow[SyntaxKindShadow["DotToken"] = 43] = "DotToken";
    SyntaxKindShadow[SyntaxKindShadow["QuestionToken"] = 44] = "QuestionToken";
    SyntaxKindShadow[SyntaxKindShadow["SingleQuoteToken"] = 45] = "SingleQuoteToken";
    SyntaxKindShadow[SyntaxKindShadow["DoubleQuoteToken"] = 46] = "DoubleQuoteToken";
    SyntaxKindShadow[SyntaxKindShadow["OpenBraceToken"] = 47] = "OpenBraceToken";
    SyntaxKindShadow[SyntaxKindShadow["CloseBraceToken"] = 48] = "CloseBraceToken";
    // Multi-character sequences
    SyntaxKindShadow[SyntaxKindShadow["DashDash"] = 49] = "DashDash";
    SyntaxKindShadow[SyntaxKindShadow["AsteriskAsterisk"] = 50] = "AsteriskAsterisk";
    SyntaxKindShadow[SyntaxKindShadow["UnderscoreUnderscore"] = 51] = "UnderscoreUnderscore";
    SyntaxKindShadow[SyntaxKindShadow["TildeTilde"] = 52] = "TildeTilde";
})(SyntaxKindShadow || (SyntaxKindShadow = {}));
describe('SyntaxKind', () => {
    it('Unknown', () => expect(SyntaxKindShadow.Unknown).toBe(SyntaxKind.Unknown));
    it('EndOfFileToken', () => expect(SyntaxKindShadow.EndOfFileToken).toBe(SyntaxKind.EndOfFileToken));
    it('TildeTilde', () => expect(SyntaxKindShadow.TildeTilde).toBe(SyntaxKind.TildeTilde));
    it('Max', () => {
        let maxSyntaxKind = 0;
        for (const key in SyntaxKindShadow) {
            if (Number.isFinite(Number(key)))
                maxSyntaxKind = Math.max(Number(key), maxSyntaxKind);
        }
        expect(maxSyntaxKind).toBe(SyntaxKind.TildeTilde);
    });
});
describe('ScannerErrorCode', () => {
    it('Unknown', () => expect(ScannerErrorCodeShadow.None).toBe(ScannerErrorCode.None));
    it('UnexpectedToken', () => expect(ScannerErrorCodeShadow.UnexpectedEndOfFile).toBe(ScannerErrorCode.UnexpectedEndOfFile));
    it('Max', () => {
        let maxErrorCode = 0;
        for (const key in ScannerErrorCode) {
            if (Number.isFinite(Number(key)))
                maxErrorCode = Math.max(Number(key), maxErrorCode);
        }
        expect(maxErrorCode).toBe(ScannerErrorCode.UnexpectedEndOfFile);
    });
});
