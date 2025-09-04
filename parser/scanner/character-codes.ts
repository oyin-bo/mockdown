/**
 * Character code constants and classification functions
 * Following TypeScript's character code pattern for consistent character handling
 */

export const enum CharacterCodes {
  nullCharacter = 0,
  maxAsciiCharacter = 0x7F,

  lineFeed = 0x0A,              // \n
  carriageReturn = 0x0D,        // \r
  lineSeparator = 0x2028,
  paragraphSeparator = 0x2029,
  nextLine = 0x0085,

  // Control characters
  tab = 0x09,
  verticalTab = 0x0B,
  formFeed = 0x0C,
  
  // ASCII printable characters
  space = 0x20,
  exclamation = 0x21,           // !
  doubleQuote = 0x22,           // "
  hash = 0x23,                  // #
  dollar = 0x24,                // $
  percent = 0x25,               // %
  ampersand = 0x26,             // &
  singleQuote = 0x27,           // '
  openParen = 0x28,             // (
  closeParen = 0x29,            // )
  asterisk = 0x2A,              // *
  plus = 0x2B,                  // +
  comma = 0x2C,                 // ,
  minus = 0x2D,                 // -
  dot = 0x2E,                   // .
  slash = 0x2F,                 // /

  _0 = 0x30,                    // 0
  _1 = 0x31,                    // 1
  _2 = 0x32,                    // 2
  _3 = 0x33,                    // 3
  _4 = 0x34,                    // 4
  _5 = 0x35,                    // 5
  _6 = 0x36,                    // 6
  _7 = 0x37,                    // 7
  _8 = 0x38,                    // 8
  _9 = 0x39,                    // 9

  colon = 0x3A,                 // :
  semicolon = 0x3B,             // ;
  lessThan = 0x3C,              // <
  equals = 0x3D,                // =
  greaterThan = 0x3E,           // >
  question = 0x3F,              // ?
  at = 0x40,                    // @

  A = 0x41, B = 0x42, C = 0x43, D = 0x44, E = 0x45, F = 0x46, G = 0x47, H = 0x48,
  I = 0x49, J = 0x4A, K = 0x4B, L = 0x4C, M = 0x4D, N = 0x4E, O = 0x4F, P = 0x50,
  Q = 0x51, R = 0x52, S = 0x53, T = 0x54, U = 0x55, V = 0x56, W = 0x57, X = 0x58,
  Y = 0x59, Z = 0x5A,

  openBracket = 0x5B,           // [
  backslash = 0x5C,             // \
  closeBracket = 0x5D,          // ]
  caret = 0x5E,                 // ^
  underscore = 0x5F,            // _
  backtick = 0x60,              // `

  a = 0x61, b = 0x62, c = 0x63, d = 0x64, e = 0x65, f = 0x66, g = 0x67, h = 0x68,
  i = 0x69, j = 0x6A, k = 0x6B, l = 0x6C, m = 0x6D, n = 0x6E, o = 0x6F, p = 0x70,
  q = 0x71, r = 0x72, s = 0x73, t = 0x74, u = 0x75, v = 0x76, w = 0x77, x = 0x78,
  y = 0x79, z = 0x7A,

  openBrace = 0x7B,             // {
  bar = 0x7C,                   // |
  closeBrace = 0x7D,            // }
  tilde = 0x7E,                 // ~

  // Unicode categories
  nonBreakingSpace = 0x00A0,
  enQuad = 0x2000,
  emQuad = 0x2001,
  enSpace = 0x2002,
  emSpace = 0x2003,
  threePerEmSpace = 0x2004,
  fourPerEmSpace = 0x2005,
  sixPerEmSpace = 0x2006,
  figureSpace = 0x2007,
  punctuationSpace = 0x2008,
  thinSpace = 0x2009,
  hairSpace = 0x200A,
  zeroWidthSpace = 0x200B,
  narrowNoBreakSpace = 0x202F,
  ideographicSpace = 0x3000,
  mathematicalSpace = 0x205F,
  ogham = 0x1680,

  // Common digit ranges for fast checking
  digit0 = CharacterCodes._0,
  digit9 = CharacterCodes._9,
}

/**
 * Check if character is a line break
 */
export function isLineBreak(ch: number): boolean {
  return ch === CharacterCodes.lineFeed ||
         ch === CharacterCodes.carriageReturn ||
         ch === CharacterCodes.lineSeparator ||
         ch === CharacterCodes.paragraphSeparator ||
         ch === CharacterCodes.nextLine;
}

/**
 * Check if character is whitespace (excluding line breaks)
 */
export function isWhiteSpaceSingleLine(ch: number): boolean {
  return ch === CharacterCodes.space ||
         ch === CharacterCodes.tab ||
         ch === CharacterCodes.verticalTab ||
         ch === CharacterCodes.formFeed ||
         ch === CharacterCodes.nonBreakingSpace ||
         ch === CharacterCodes.ogham ||
         ch === CharacterCodes.narrowNoBreakSpace ||
         ch === CharacterCodes.mathematicalSpace ||
         ch === CharacterCodes.ideographicSpace ||
         (ch >= CharacterCodes.enQuad && ch <= CharacterCodes.zeroWidthSpace);
}

/**
 * Check if character is any whitespace (including line breaks)
 */
export function isWhiteSpace(ch: number): boolean {
  return isWhiteSpaceSingleLine(ch) || isLineBreak(ch);
}

/**
 * Check if character is an ASCII letter
 */
export function isLetter(ch: number): boolean {
  return (ch >= CharacterCodes.A && ch <= CharacterCodes.Z) ||
         (ch >= CharacterCodes.a && ch <= CharacterCodes.z);
}

/**
 * Check if character is an ASCII digit
 */
export function isDigit(ch: number): boolean {
  return ch >= CharacterCodes.digit0 && ch <= CharacterCodes.digit9;
}

/**
 * Check if character is a hexadecimal digit
 */
export function isHexDigit(ch: number): boolean {
  return isDigit(ch) ||
         (ch >= CharacterCodes.A && ch <= CharacterCodes.F) ||
         (ch >= CharacterCodes.a && ch <= CharacterCodes.f);
}

/**
 * Check if character is an alphanumeric character
 */
export function isAlphaNumeric(ch: number): boolean {
  return isLetter(ch) || isDigit(ch);
}

/**
 * Check if character can start an identifier
 */
export function isIdentifierStart(ch: number): boolean {
  return isLetter(ch) ||
         ch === CharacterCodes.underscore ||
         ch === CharacterCodes.dollar ||
         isUnicodeIdentifierStart(ch);
}

/**
 * Check if character can be part of an identifier
 */
export function isIdentifierPart(ch: number): boolean {
  return isAlphaNumeric(ch) ||
         ch === CharacterCodes.underscore ||
         ch === CharacterCodes.dollar ||
         isUnicodeIdentifierPart(ch);
}

/**
 * Check if character is ASCII punctuation that can be escaped in Markdown
 */
export function isMarkdownPunctuation(ch: number): boolean {
  return ch === CharacterCodes.exclamation ||
         ch === CharacterCodes.doubleQuote ||
         ch === CharacterCodes.hash ||
         ch === CharacterCodes.dollar ||
         ch === CharacterCodes.percent ||
         ch === CharacterCodes.ampersand ||
         ch === CharacterCodes.singleQuote ||
         ch === CharacterCodes.openParen ||
         ch === CharacterCodes.closeParen ||
         ch === CharacterCodes.asterisk ||
         ch === CharacterCodes.plus ||
         ch === CharacterCodes.comma ||
         ch === CharacterCodes.minus ||
         ch === CharacterCodes.dot ||
         ch === CharacterCodes.slash ||
         ch === CharacterCodes.colon ||
         ch === CharacterCodes.semicolon ||
         ch === CharacterCodes.lessThan ||
         ch === CharacterCodes.equals ||
         ch === CharacterCodes.greaterThan ||
         ch === CharacterCodes.question ||
         ch === CharacterCodes.at ||
         ch === CharacterCodes.openBracket ||
         ch === CharacterCodes.backslash ||
         ch === CharacterCodes.closeBracket ||
         ch === CharacterCodes.caret ||
         ch === CharacterCodes.underscore ||
         ch === CharacterCodes.backtick ||
         ch === CharacterCodes.openBrace ||
         ch === CharacterCodes.bar ||
         ch === CharacterCodes.closeBrace ||
         ch === CharacterCodes.tilde;
}

/**
 * Check if character can appear in an HTML tag name
 */
export function isTagNameCharacter(ch: number): boolean {
  return isAlphaNumeric(ch) || ch === CharacterCodes.minus;
}

/**
 * Check if character can appear in an HTML attribute name
 */
export function isAttributeNameCharacter(ch: number): boolean {
  return isAlphaNumeric(ch) ||
         ch === CharacterCodes.minus ||
         ch === CharacterCodes.underscore ||
         ch === CharacterCodes.dot ||
         ch === CharacterCodes.colon;
}

// Simplified Unicode identifier functions - would need full Unicode tables in production
function isUnicodeIdentifierStart(ch: number): boolean {
  // Simplified - would need full Unicode identifier tables
  return ch > 0x7F;
}

function isUnicodeIdentifierPart(ch: number): boolean {
  // Simplified - would need full Unicode identifier tables  
  return ch > 0x7F;
}

// Additional character code constants
export const enum SpecialCharacterCodes {
  byteOrderMark = 0xFEFF,
}
