/**
 * Token types for Markdown scanner following TypeScript's SyntaxKind pattern
 * Includes both HTML and Markdown tokens as first-class citizens
 */

export const enum SyntaxKind {
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

/**
 * Token flags for additional token metadata
 */
export const enum TokenFlags {
  None = 0,
  Unterminated = 1 << 0,        // Token is not properly closed
  PrecedingLineBreak = 1 << 1,  // Token follows a line break
  ContainsHtml = 1 << 2,        // Token contains HTML content
  ContainsMath = 1 << 3,        // Token contains math content  
  IsEscaped = 1 << 4,           // Token is escaped with backslash
  IsAtLineStart = 1 << 5,       // Token appears at start of line
  IsInRawText = 1 << 6,         // Token is inside raw text element
  IsInRcdata = 1 << 7,          // Token is inside RCDATA element (textarea/title)
  ContainsHtmlBlock = 1 << 8,   // Token starts/part of a CommonMark HTML block
  CanOpen = 1 << 9,             // Delimiter can open emphasis/strong
  CanClose = 1 << 10,           // Delimiter can close emphasis/strong
  HardBreakHint = 1 << 11,      // Two or more spaces before newline
  IsAutolinkEmail = 1 << 12,    // Autolink token recognized as email
  IsAutolinkUrl = 1 << 13,      // Autolink token recognized as URL
  IsOrderedListMarker = 1 << 14,// Numeric run at line start followed by '.' or ')'
  OrderedListDelimiterParen = 1 << 15, // true if ')', false if '.'

  // Bits 16-21 reserved for run length encoding (e.g., backtick/tilde runs)
  // Use TokenFlagRunLengthMask/Shift to read/write the integer value (0-63)

  // Additional flags beyond the run-length bitfield
  MaybeDefinition = 1 << 22,     // Line-start '[' ... ']' ':' pattern hint
  IsBlankLine = 1 << 23,         // Newline token ends a whitespace-only line
  
  // Rollback safety flags (for Stage 1+ scanner architecture)
  CanRollbackHere = 1 << 24,     // Scanning can safely restart at this position
  RollbackTypeMask = 0x7 << 25,  // 3 bits for rollback type (8 types max)
  RollbackDocumentStart = 0 << 25,     // Position 0
  RollbackBlankLine = 1 << 25,         // After blank line
  RollbackRawText = 2 << 25,           // Within raw text
  RollbackCodeBlock = 3 << 25,         // Within code block
  RollbackHtmlInner = 4 << 25,         // Within HTML content
}

// Packed run-length for certain tokens (e.g., backtick/tilde). We pack the integer
// length into tokenFlags using the following mask/shift. This avoids allocations
// while giving the parser precise run sizes.
export const TokenFlagRunLengthShift = 16;
export const TokenFlagRunLengthMask = 0x3F << TokenFlagRunLengthShift; // 6 bits (0-63)

/**
 * Scanner error codes for diagnostics
 */
export enum ScannerErrorCode {
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
