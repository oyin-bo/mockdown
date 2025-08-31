import { describe, it, expect } from 'vitest';

import { createScanner } from '../scanner';
import { ScannerErrorCode, SyntaxKind, TokenFlags } from '../token-types';

export function scanTokensWithErrors(input: string, scanner = createScanner()) {
  let errors: undefined | (string | undefined)[];

  scanner.setOnError((start, end, code, message) => {
    if (!errors) errors = [];
    errors.push(syntaxError(code));
  });
  const tokens = scanTokens(input, scanner);
  return { tokens, errors };
}

export function syntaxError(code: ScannerErrorCode): string | undefined {
  if (!code && code !== 0) return undefined;
  return ScannerErrorCodeShadow[code] || 'ScannerErrorCode:0x' + code.toString(16).toUpperCase();
}

export enum ScannerErrorCodeShadow {
  None,
  UnterminatedString,
  UnterminatedComment,
  UnterminatedCDATA,
  InvalidCharacter,
  InvalidEscape,
  InvalidEntity,
  MalformedTag,
  UnexpectedEndOfFile,
}

export function scanTokens(input: string, scanner = createScanner()) {
  scanner.setText(input);
  const tokens: ({
    kind: SyntaxKind;
    text: string;
    value: string;
    start: number;
    end: number;
    flags: TokenFlags;
  }[]) = [];

  let token: SyntaxKind;
  do {
    token = scanner.scan();
    tokens.push(wrapToken(token));
  } while (token !== SyntaxKind.EndOfFileToken);

  return tokens;

  function wrapToken(token: SyntaxKind) {
    return {
      kind: token,
      text: scanner.getTokenText(),
      value: scanner.getTokenValue(),
      start: scanner.getTokenStart(),
      end: scanner.getTokenEnd(),
      flags: scanner.getTokenFlags(),
      toString: function () {
        return (
          (!this.text ? '' :
            /\s/.test(this.text) ||  JSON.stringify(this.text) !== '"' + this.text + '"' ?
              JSON.stringify(this.text) + ' ' :
              this.text + ' '
          ) +
          syntaxKind(this.kind)
        )
      },
      toJSON: function () { return this.toString() }
    };
  }
}

export function scanTokensStrings(input: string, scanner = createScanner()) {
  return scanTokens(input, scanner).map(t => t.toString());
}


export function syntaxKind(kind: SyntaxKind): string | undefined {
  if (!kind && kind !== 0) return undefined;
  return SyntaxKindShadow[kind] || 'SyntaxKind:0x' + kind.toString(16).toUpperCase();
}

export enum SyntaxKindShadow {
  Unknown,
  EndOfFileToken,

  // HTML Tokens
  LessThanToken,              // <
  LessThanSlashToken,         // </
  GreaterThanToken,           // >
  SlashGreaterThanToken,      // />
  HtmlText,                   // text content
  HtmlComment,                // <!-- comment -->
  HtmlCDATA,                  // <![CDATA[...]]>
  HtmlDoctype,                // <!DOCTYPE html>
  HtmlProcessingInstruction,  // <?xml ?>

  // Markdown Structure Tokens  
  HashToken,                  // #
  DashToken,                  // -
  DashDashDash,              // --- (frontmatter fence)
  AsteriskToken,              // *
  UnderscoreToken,            // _
  BacktickToken,              // `
  TildeToken,                 // ~
  PlusToken,                  // +
  EqualsToken,                // =

  // Math Tokens
  DollarToken,                // $
  DollarDollar,               // $$

  // Link/Reference Tokens
  OpenBracketToken,           // [
  CloseBracketToken,          // ]
  OpenParenToken,             // (
  CloseParenToken,            // )
  ExclamationToken,           // !
  ColonToken,                 // :

  // Table Tokens
  PipeToken,                  // |

  // Code/Escape Tokens  
  BackslashToken,             // \

  // Blockquote Tokens
  BlockquoteToken,            // > (blockquote)

  // Whitespace & Control
  WhitespaceTrivia,
  NewLineTrivia,
  TabTrivia,

  // Literal Content
  StringLiteral,
  NumericLiteral,
  Identifier,

  // Special Cases
  AtToken,                    // @
  PercentToken,               // %
  CaretToken,                 // ^
  AmpersandToken,             // &
  SemicolonToken,             // ;
  CommaToken,                 // ,
  DotToken,                   // .
  QuestionToken,              // ?
  SingleQuoteToken,           // '
  DoubleQuoteToken,           // "
  OpenBraceToken,             // {
  CloseBraceToken,            // }

  // Multi-character sequences
  DashDash,                   // --
  AsteriskAsterisk,           // **
  UnderscoreUnderscore,       // __
  TildeTilde,                 // ~~
}

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
