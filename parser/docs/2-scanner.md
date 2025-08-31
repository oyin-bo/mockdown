## Recent Scanner Changes (Applied)

- **Run-length metadata**: Added packed run-length in `tokenFlags` (`TokenFlagRunLengthShift`, `TokenFlagRunLengthMask`) for backtick/tilde runs; emitted by `scanBacktick()` and `scanTilde()`.
- **Reference definition hint**: Added `TokenFlags.MaybeDefinition`; set by `scanOpenBracket()` at line start when the outline matches `[label]:`.
- **Thematic breaks strictness**: `scanAsterisk()`, `scanMinus()`, `scanUnderscore()` accept spaced markers (`* * *`, `- - -`, `_ _ _`) with only spaces/tabs otherwise, then EOL.
- **HTML/Markdown policy**: Kept RAWTEXT/RCDATA mode switching; no suppression elsewhere. `ContainsHtmlBlock` remains a structural hint only.
- **Blank line signaling**: Added `TokenFlags.IsBlankLine` on `NewLineTrivia` that ends a whitespace-only line; enables parser to emit explicit `WhitespaceSeparation` nodes for consecutive blank lines.

# Scanner Module Implementation Plan

A detailed implementation plan for the lexical analyzer component of the Markdown parser, designed for native HTML parsing following TypeScript's scanner architecture with micromark's construct resolution logic.

## Policy: Markdown Inside HTML

- Inline Markdown remains active inside all HTML elements by default.
- Exceptions: RAWTEXT (`<script>`, `<style>`) and RCDATA (`<title>`, `<textarea>`) keep their HTML content models (no Markdown; entities only active in RCDATA).
- `ContainsHtmlBlock` is a structural hint (HTML began at line start) and does not imply Markdown suspension.

## Blank Lines and Separation

- Scanner emits one `NewLineTrivia` per physical newline; it does not collapse sequences.
- A `NewLineTrivia` token is marked with `TokenFlags.IsBlankLine` if the segment from the previous `lastLineStart` up to the newline consists only of spaces and/or tabs (or is empty).
- Examples:
  - `abcd\n` → newline has no `IsBlankLine`.
  - `abcd\n\nefgh` → second newline is `IsBlankLine` (represents an empty line between paragraphs).
  - `a\n\t\nb` and `a\r\n\r\nb` → blank-line newlines are flagged (tabs-only and CRLF supported).
- Parser guidance:
  - Emit a `WhitespaceSeparation` node for each contiguous run of `IsBlankLine` newlines; the count equals the run length.
  - Do not treat the flag as a hard break; `HardBreakHint` remains a separate concept (two trailing spaces before newline).

## Architecture Overview

**Core Philosophy**: Single mutable scanner instance like TypeScript's `scanner.ts`, with micromark-style construct dispatch for token selection. No global state, no mode switching functions - everything encapsulated in scanner instance.

**Token Resolution**: Character code dispatch to construct handlers following micromark's pattern, but producing TypeScript-style tokens directly instead of events.

**Memory Requirements**: HTML parsed natively without external parsers, treated as first-class citizen alongside Markdown. Markdown continues inside HTML (except RAWTEXT/RCDATA) without scanner-level suspension.

## File Structure and Exports

### `scanner.ts` (Primary Interface)
**Size Estimate**: ~600-700 lines

**Core Exports** (following TypeScript exactly):
```typescript
// Primary scanner interface - matches TypeScript's Scanner interface
export interface Scanner {
  getToken(): SyntaxKind;
  getTokenStart(): number;
  getTokenEnd(): number;
  getTokenText(): string;
  getTokenValue(): string;
  isUnterminated(): boolean;
  hasPrecedingLineBreak(): boolean;
  
  // Context-sensitive rescanning (TypeScript pattern)
  reScanLessThanToken(): SyntaxKind;
  reScanGreaterToken(): SyntaxKind;
  reScanSlashToken(): SyntaxKind;
  reScanBacktickToken(): SyntaxKind;
  reScanDollarToken(): SyntaxKind;
  reScanPipeToken(): SyntaxKind;
  reScanHashToken(): SyntaxKind;
  
  // Tentative scanning (TypeScript pattern)
  lookAhead<T>(callback: () => T): T;
  tryScan<T>(callback: () => T): T;
  
  // Core scanning
  scan(): SyntaxKind;
  setText(text: string, start?: number, length?: number): void;
  setOnError(onError: ErrorCallback | undefined): void;
  resetTokenState(pos: number): void;
}

// Factory function
export function createScanner(): Scanner;

// No global mode functions - everything encapsulated in scanner instance
```

**Internal Scanner State** (private to implementation):
```typescript
class ScannerImpl implements Scanner {
  private source: string;
  private pos: number;
  private end: number;
  private startPos: number;
  private tokenPos: number;
  private token: SyntaxKind;
  private tokenValue: string;
  private tokenFlags: TokenFlags;
  private precedingLineBreak: boolean;
  
  // Context tracking (not "modes" - just internal state)
  private inRawText: string | undefined; // which raw text tag we're in
  private constructContext: ConstructContext; // what constructs are active
}
```

### `scanner.ts` (Core Scanning Implementation)
**Size Estimate**: ~800-1200 lines

**Core Implementation** (TypeScript-style explicit control flow):
```typescript
class ScannerImpl implements Scanner {
  private source: string = "";
  private pos: number = 0;
  private end: number = 0;
  private startPos: number = 0;
  private tokenPos: number = 0;
  private token: SyntaxKind = SyntaxKind.Unknown;
  private tokenValue: string = "";
  private tokenFlags: TokenFlags = TokenFlags.None;
  private precedingLineBreak: boolean = false;
  
  // Context tracking (not "modes" - just internal state)
  private inRawText: string | undefined; // which raw text tag we're in
  private containerStack: ContainerBlock[] = [];
  private atLineStart: boolean = true;
  private inParagraph: boolean = false;

  scan(): SyntaxKind {
    this.fullStartPos = this.pos;
    this.tokenFlags = TokenFlags.None;
    
    while (true) {
      this.tokenPos = this.pos;
      
      if (this.pos >= this.end) {
        return this.token = SyntaxKind.EndOfFileToken;
      }
      
      const ch = this.source.charCodeAt(this.pos);
      
      // Skip trivia
      if (isWhiteSpaceSingleLine(ch)) {
        this.pos++;
        while (this.pos < this.end && isWhiteSpaceSingleLine(this.source.charCodeAt(this.pos))) {
          this.pos++;
        }
        return this.token = SyntaxKind.WhitespaceTrivia;
      }
      
      if (isLineBreak(ch)) {
        this.precedingLineBreak = true;
        this.atLineStart = true;
        this.pos++;
        if (ch === CharacterCodes.carriageReturn && this.pos < this.end && this.source.charCodeAt(this.pos) === CharacterCodes.lineFeed) {
          this.pos++;
        }
        return this.token = SyntaxKind.NewLineTrivia;
      }
      
      this.atLineStart = false;
      return this.scanNonTrivia(ch);
    }
  }
  
  private scanNonTrivia(ch: number): SyntaxKind {
    switch (ch) {
      case CharacterCodes.lessThan:
        return this.scanLessThan();
      case CharacterCodes.greaterThan:
        this.pos++;
        return this.token = SyntaxKind.GreaterThanToken;
      case CharacterCodes.hash:
        return this.scanHash();
      case CharacterCodes.asterisk:
        return this.scanAsterisk();
      case CharacterCodes.underscore:
        return this.scanUnderscore();
      case CharacterCodes.minus:
        return this.scanMinus();
      case CharacterCodes.plus:
        this.pos++;
        return this.token = SyntaxKind.PlusToken;
      case CharacterCodes.openBracket:
        this.pos++;
        return this.token = SyntaxKind.OpenBracketToken;
      case CharacterCodes.closeBracket:
        this.pos++;
        return this.token = SyntaxKind.CloseBracketToken;
      case CharacterCodes.openParen:
        this.pos++;
        return this.token = SyntaxKind.OpenParenToken;
      case CharacterCodes.closeParen:
        this.pos++;
        return this.token = SyntaxKind.CloseParenToken;
      case CharacterCodes.backtick:
        return this.scanBacktick();
      case CharacterCodes.bar:
        return this.scanPipe();
      case CharacterCodes.dollar:
        return this.scanDollar();
      case CharacterCodes.backslash:
        return this.scanBackslash();
      case CharacterCodes.ampersand:
        return this.scanAmpersand();
      case CharacterCodes.exclamation:
        this.pos++;
        return this.token = SyntaxKind.ExclamationToken;
      case CharacterCodes.equals:
        this.pos++;
        return this.token = SyntaxKind.EqualsToken;
      case CharacterCodes.doubleQuote:
      case CharacterCodes.singleQuote:
        return this.scanString();
      default:
        if (isIdentifierStart(ch)) {
          return this.scanIdentifier();
        }
        if (isDigit(ch)) {
          return this.scanNumber();
        }
        // Unknown character - consume as text
        this.pos++;
        return this.token = SyntaxKind.HtmlText;
    }
  }
  
  private scanLessThan(): SyntaxKind {
    this.pos++; // consume '<'
    
    if (this.pos >= this.end) {
      return this.token = SyntaxKind.LessThanToken;
    }
    
    const ch = this.source.charCodeAt(this.pos);
    
    // Check for HTML comment: <!--
    if (ch === CharacterCodes.exclamation) {
      if (this.pos + 1 < this.end && this.source.charCodeAt(this.pos + 1) === CharacterCodes.minus &&
          this.pos + 2 < this.end && this.source.charCodeAt(this.pos + 2) === CharacterCodes.minus) {
        return this.scanHtmlComment();
      }
      // Check for CDATA: <![CDATA[
      if (this.source.substring(this.pos, this.pos + 8) === "![CDATA[") {
        return this.scanHtmlCDATA();
      }
      // Check for DOCTYPE: <!DOCTYPE
      if (this.source.substring(this.pos, this.pos + 8).toLowerCase() === "!doctype") {
        return this.scanHtmlDoctype();
      }
    }
    
    // Check for closing tag: </
    if (ch === CharacterCodes.slash) {
      this.pos++; // consume '/'
      return this.token = SyntaxKind.LessThanSlashToken;
    }
    
    // Check for HTML tag start
    if (isHtmlNameStart(ch)) {
      // This is likely an HTML tag
      return this.token = SyntaxKind.LessThanToken;
    }
    
    // Check for autolink: <http://...> or <email@domain.com>
    if (this.tryParseAutolink()) {
      return this.token = SyntaxKind.StringLiteral; // autolink content
    }
    
    // Default to literal less-than
    return this.token = SyntaxKind.LessThanToken;
  }
  
  private scanHash(): SyntaxKind {
    // Hash can be:
    // 1. ATX heading at line start: # Heading
    // 2. HTML fragment identifier in autolink: <http://example.com#fragment>
    // 3. Literal hash character
    
    if (this.atLineStart) {
      // Count consecutive hashes for ATX heading
      let hashCount = 0;
      let tempPos = this.pos;
      while (tempPos < this.end && this.source.charCodeAt(tempPos) === CharacterCodes.hash) {
        hashCount++;
        tempPos++;
      }
      
      // Valid ATX heading: 1-6 hashes followed by space or end
      if (hashCount >= 1 && hashCount <= 6) {
        if (tempPos >= this.end || isWhiteSpaceSingleLine(this.source.charCodeAt(tempPos))) {
          this.pos = tempPos;
          return this.token = SyntaxKind.HashToken;
        }
      }
    }
    
    // Single hash
    this.pos++;
    return this.token = SyntaxKind.HashToken;
  }
  
  private scanAsterisk(): SyntaxKind {
    this.pos++; // consume first '*'
    
    // Check for emphasis/strong patterns
    if (this.pos < this.end && this.source.charCodeAt(this.pos) === CharacterCodes.asterisk) {
      // Could be ** strong
      return this.token = SyntaxKind.AsteriskToken;
    }
    
    // Check for list marker at line start
    if (this.atLineStart && this.pos < this.end && 
        isWhiteSpaceSingleLine(this.source.charCodeAt(this.pos))) {
      // This is a list marker
      return this.token = SyntaxKind.AsteriskToken;
    }
    
    // Check for thematic break: *** (at line start)
    if (this.atLineStart) {
      let tempPos = this.pos;
      let asteriskCount = 1; // we already consumed one
      while (tempPos < this.end && this.source.charCodeAt(tempPos) === CharacterCodes.asterisk) {
        asteriskCount++;
        tempPos++;
      }
      if (asteriskCount >= 3) {
        // Skip any spaces
        while (tempPos < this.end && this.source.charCodeAt(tempPos) === CharacterCodes.space) {
          tempPos++;
        }
        // If we hit end or newline, it's a thematic break
        if (tempPos >= this.end || isLineBreak(this.source.charCodeAt(tempPos))) {
          return this.token = SyntaxKind.AsteriskToken;
        }
      }
    }
    
    return this.token = SyntaxKind.AsteriskToken;
  }
  
  // ... similar explicit methods for other characters
}
```

### `token-types.ts` (Token Definitions)  
**Size Estimate**: ~200-300 lines

**Core Exports** (TypeScript-style token enumeration):
```typescript
export enum SyntaxKind {
  // Core punctuation (TypeScript pattern)
  OpenBraceToken,         // {
  CloseBraceToken,        // }
  OpenParenToken,         // (
  CloseParenToken,        // )
  OpenBracketToken,       // [
  CloseBracketToken,      // ]
  DotToken,               // .
  DotDotDotToken,         // ...
  SemicolonToken,         // ;
  CommaToken,             // ,
  QuestionToken,          // ?
  ColonToken,             // :
  
  // Markdown/HTML specific punctuation
  LessThanToken,          // <
  GreaterThanToken,       // >
  LessThanSlashToken,     // </
  SlashGreaterThanToken,  // />
  EqualsToken,            // =
  ExclamationToken,       // !
  HashToken,              // #
  AsteriskToken,          // *
  UnderscoreToken,        // _
  DashToken,              // -
  PlusToken,              // +
  BacktickToken,          // `
  TildeToken,             // ~
  PipeToken,              // |
  DollarToken,            // $
  BackslashToken,         // \
  
  // Content tokens (TypeScript pattern)
  Identifier,             // HTML tag names, attribute names
  StringLiteral,          // "quoted strings" and 'quoted strings'
  NoSubstitutionTemplateLiteral, // `template without ${}`
  NumericLiteral,         // 123, 0xFF
  
  // Whitespace and structure
  WhitespaceTrivia,       // spaces, tabs
  NewLineTrivia,          // \n, \r\n
  EndOfFileToken,         // EOF
  
  // HTML-specific tokens
  HtmlComment,            // <!-- comment -->
  HtmlCDATA,              // <![CDATA[ content ]]>
  HtmlDoctype,            // <!DOCTYPE html>
  HtmlText,               // text content inside elements
  
  // Extended syntax tokens
  FrontmatterYaml,        // --- yaml content ---
  FrontmatterToml,        // +++ toml content +++
  MathInline,             // $ math $
  MathBlock,              // $$ math $$
  
  // Compound tokens (for specific rescanning)
  DashDashDash,           // --- (frontmatter or thematic break)
  // Note: TOML frontmatter fence '+++' uses PlusToken semantics in this codebase; no PlusPlusPlus token.
  DollarDollar,           // $$ (block math)
  
  Unknown                 // fallback
}

// Token classification (TypeScript pattern)
export function isTrivia(kind: SyntaxKind): boolean {
  return kind === SyntaxKind.WhitespaceTrivia || 
         kind === SyntaxKind.NewLineTrivia;
}

export function isPunctuation(kind: SyntaxKind): boolean {
  return kind >= SyntaxKind.OpenBraceToken && kind <= SyntaxKind.BackslashToken;
}

export function isLiteral(kind: SyntaxKind): boolean {
  return kind === SyntaxKind.StringLiteral ||
         kind === SyntaxKind.NumericLiteral ||
         kind === SyntaxKind.NoSubstitutionTemplateLiteral;
}
```

### `character-codes.ts` (Character Classification)
**Size Estimate**: ~300-400 lines

**Core Exports** (TypeScript pattern exactly):
```typescript
// Character code constants (complete ASCII range - TypeScript style)
export const enum CharacterCodes {
  nullCharacter = 0,
  maxAsciiCharacter = 0x7F,
  
  lineFeed = 0x0A,              // \n
  carriageReturn = 0x0D,        // \r
  lineSeparator = 0x2028,
  paragraphSeparator = 0x2029,
  nextLine = 0x0085,
  
  // ASCII whitespace
  space = 0x20,
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
  
  tab = 0x09,
  verticalTab = 0x0B,
  formFeed = 0x0C,
  
  // Punctuation
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
  
  // Digits
  _0 = 0x30,
  _1 = 0x31,
  _2 = 0x32,
  _3 = 0x33,
  _4 = 0x34,
  _5 = 0x35,
  _6 = 0x36,
  _7 = 0x37,
  _8 = 0x38,
  _9 = 0x39,
  
  colon = 0x3A,                 // :
  semicolon = 0x3B,             // ;
  lessThan = 0x3C,              // <
  equals = 0x3D,                // =
  greaterThan = 0x3E,           // >
  question = 0x3F,              // ?
  at = 0x40,                    // @
  
  // Uppercase letters
  A = 0x41, B = 0x42, C = 0x43, D = 0x44, E = 0x45, F = 0x46,
  G = 0x47, H = 0x48, I = 0x49, J = 0x4A, K = 0x4B, L = 0x4C,
  M = 0x4D, N = 0x4E, O = 0x4F, P = 0x50, Q = 0x51, R = 0x52,
  S = 0x53, T = 0x54, U = 0x55, V = 0x56, W = 0x57, X = 0x58,
  Y = 0x59, Z = 0x5A,
  
  openBracket = 0x5B,           // [
  backslash = 0x5C,             // \
  closeBracket = 0x5D,          // ]
  caret = 0x5E,                 // ^
  underscore = 0x5F,            // _
  backtick = 0x60,              // `
  
  // Lowercase letters
  a = 0x61, b = 0x62, c = 0x63, d = 0x64, e = 0x65, f = 0x66,
  g = 0x67, h = 0x68, i = 0x69, j = 0x6A, k = 0x6B, l = 0x6C,
  m = 0x6D, n = 0x6E, o = 0x6F, p = 0x70, q = 0x71, r = 0x72,
  s = 0x73, t = 0x74, u = 0x75, v = 0x76, w = 0x77, x = 0x78,
  y = 0x79, z = 0x7A,
  
  openBrace = 0x7B,             // {
  bar = 0x7C,                   // |
  closeBrace = 0x7D,            // }
  tilde = 0x7E,                 // ~
  
  // Unicode ranges
  highSurrogateStart = 0xD800,
  highSurrogateEnd = 0xDBFF,
  lowSurrogateStart = 0xDC00,
  lowSurrogateEnd = 0xDFFF,
}

// Character classification (TypeScript pattern)
export function isWhiteSpaceLike(ch: number): boolean {
  return isWhiteSpaceSingleLine(ch) || isLineBreak(ch);
}

export function isWhiteSpaceSingleLine(ch: number): boolean {
  return ch === CharacterCodes.space ||
         ch === CharacterCodes.tab ||
         ch === CharacterCodes.verticalTab ||
         ch === CharacterCodes.formFeed ||
         ch === CharacterCodes.nonBreakingSpace ||
         ch === CharacterCodes.narrowNoBreakSpace ||
         ch === CharacterCodes.mathematicalSpace ||
         ch === CharacterCodes.ideographicSpace ||
         ch === CharacterCodes.ogham ||
         (ch >= CharacterCodes.enQuad && ch <= CharacterCodes.zeroWidthSpace) ||
         ch === CharacterCodes.nextLine;
}

export function isLineBreak(ch: number): boolean {
  return ch === CharacterCodes.lineFeed ||
         ch === CharacterCodes.carriageReturn ||
         ch === CharacterCodes.lineSeparator ||
         ch === CharacterCodes.paragraphSeparator;
}

export function isDigit(ch: number): boolean {
  return ch >= CharacterCodes._0 && ch <= CharacterCodes._9;
}

export function isLetter(ch: number): boolean {
  return (ch >= CharacterCodes.A && ch <= CharacterCodes.Z) ||
         (ch >= CharacterCodes.a && ch <= CharacterCodes.z) ||
         isUnicodeLetter(ch);
}

export function isIdentifierStart(ch: number): boolean {
  return ch >= CharacterCodes.A && ch <= CharacterCodes.Z ||
         ch >= CharacterCodes.a && ch <= CharacterCodes.z ||
         ch === CharacterCodes.dollar ||
         ch === CharacterCodes.underscore ||
         isUnicodeIdentifierStart(ch);
}

export function isIdentifierPart(ch: number): boolean {
  return ch >= CharacterCodes.A && ch <= CharacterCodes.Z ||
         ch >= CharacterCodes.a && ch <= CharacterCodes.z ||
         ch >= CharacterCodes._0 && ch <= CharacterCodes._9 ||
         ch === CharacterCodes.dollar ||
         ch === CharacterCodes.underscore ||
         isUnicodeIdentifierPart(ch);
}

// HTML name character rules (XML specification)
export function isHtmlNameStart(ch: number): boolean {
  return isLetter(ch) || ch === CharacterCodes.underscore || ch === CharacterCodes.colon;
}

export function isHtmlNameChar(ch: number): boolean {
  return isHtmlNameStart(ch) || isDigit(ch) || ch === CharacterCodes.minus || ch === CharacterCodes.dot;
}

// Unicode helpers (TypeScript pattern)
export function isHighSurrogate(charCode: number): boolean {
  return charCode >= CharacterCodes.highSurrogateStart && charCode <= CharacterCodes.highSurrogateEnd;
}

export function isLowSurrogate(charCode: number): boolean {
  return charCode >= CharacterCodes.lowSurrogateStart && charCode <= CharacterCodes.lowSurrogateEnd;
}

export function combineSurrogates(high: number, low: number): number {
  return CharacterCodes.highSurrogateStart + 
         ((high - CharacterCodes.highSurrogateStart) << 10) +
         (low - CharacterCodes.lowSurrogateStart) + 0x10000;
}

// Unicode classification stubs (would need full Unicode tables)
function isUnicodeLetter(ch: number): boolean {
  // Simplified - would need full Unicode category lookup
  return ch > 0x7F;
}

function isUnicodeIdentifierStart(ch: number): boolean {
  // Simplified - would need full Unicode identifier tables
  return ch > 0x7F;
}

function isUnicodeIdentifierPart(ch: number): boolean {
  // Simplified - would need full Unicode identifier tables
  return ch > 0x7F;
}
```

  
  private scanMinus(): SyntaxKind {
    this.pos++; // consume first '-'
    
    // Check for frontmatter fence at document start: ---
    if (this.pos === 1) { // we're at document start
      if (this.pos + 1 < this.end && this.source.charCodeAt(this.pos) === CharacterCodes.minus &&
          this.pos + 2 < this.end && this.source.charCodeAt(this.pos + 1) === CharacterCodes.minus) {
        // Check if this is a frontmatter fence (--- followed by newline)
        let tempPos = this.pos + 2;
        while (tempPos < this.end && this.source.charCodeAt(tempPos) === CharacterCodes.minus) {
          tempPos++;
        }
        if (tempPos < this.end && isLineBreak(this.source.charCodeAt(tempPos))) {
          this.pos = tempPos;
          return this.token = SyntaxKind.DashDashDash;
        }
      }
    }
    
    // Check for list marker at line start: - item
    if (this.atLineStart && this.pos < this.end && 
        isWhiteSpaceSingleLine(this.source.charCodeAt(this.pos))) {
      return this.token = SyntaxKind.DashToken;
    }
    
    // Check for setext underline: --- (at line start, after paragraph)
    if (this.atLineStart && this.inParagraph) {
      let tempPos = this.pos;
      let dashCount = 1;
      while (tempPos < this.end && this.source.charCodeAt(tempPos) === CharacterCodes.minus) {
        dashCount++;
        tempPos++;
      }
      // Skip spaces
      while (tempPos < this.end && this.source.charCodeAt(tempPos) === CharacterCodes.space) {
        tempPos++;
      }
      // Must end with newline or EOF
      if (tempPos >= this.end || isLineBreak(this.source.charCodeAt(tempPos))) {
        this.pos = tempPos;
        return this.token = SyntaxKind.DashToken;
      }
    }
    
    // Check for thematic break: --- (3+ dashes)
    if (this.atLineStart) {
      let tempPos = this.pos;
      let dashCount = 1;
      while (tempPos < this.end && this.source.charCodeAt(tempPos) === CharacterCodes.minus) {
        dashCount++;
        tempPos++;
      }
      if (dashCount >= 3) {
        // Skip spaces
        while (tempPos < this.end && this.source.charCodeAt(tempPos) === CharacterCodes.space) {
          tempPos++;
        }
        if (tempPos >= this.end || isLineBreak(this.source.charCodeAt(tempPos))) {
          this.pos = tempPos;
          return this.token = SyntaxKind.DashToken;
        }
      }
    }
    
    return this.token = SyntaxKind.DashToken;
  }
  
  private scanBacktick(): SyntaxKind {
    let backtickCount = 0;
    let tempPos = this.pos;
    
    // Count consecutive backticks
    while (tempPos < this.end && this.source.charCodeAt(tempPos) === CharacterCodes.backtick) {
      backtickCount++;
      tempPos++;
    }
    
    this.pos = tempPos;
    
    // Code fences at line start: ```
    if (this.atLineStart && backtickCount >= 3) {
      return this.token = SyntaxKind.BacktickToken;
    }
    
    // Inline code: `code` or ``code with ` backtick``
    if (backtickCount >= 1) {
      return this.token = SyntaxKind.BacktickToken;
    }
    
    return this.token = SyntaxKind.BacktickToken;
  }
  
  private scanDollar(): SyntaxKind {
    let dollarCount = 0;
    let tempPos = this.pos;
    
    // Count consecutive dollars
    while (tempPos < this.end && this.source.charCodeAt(tempPos) === CharacterCodes.dollar) {
      dollarCount++;
      tempPos++;
    }
    
    // Block math: $$
    if (dollarCount === 2) {
      if (this.atLineStart) {
        this.pos = tempPos;
        return this.token = SyntaxKind.DollarDollar;
      }
    }
    
    // Inline math: $ (not at start of line, not followed by whitespace)
    if (dollarCount === 1) {
      if (!this.atLineStart && tempPos < this.end && 
          !isWhiteSpaceSingleLine(this.source.charCodeAt(tempPos))) {
        this.pos = tempPos;
        return this.token = SyntaxKind.DollarToken;
      }
    }
    
    // Default: consume single dollar as literal
    this.pos++;
    return this.token = SyntaxKind.DollarToken;
  }
  
  private scanPipe(): SyntaxKind {
    // Pipe can be:
    // 1. Table cell separator: | col1 | col2 |
    // 2. Literal pipe character
    
    this.pos++;
    return this.token = SyntaxKind.PipeToken;
  }
  
  private scanBackslash(): SyntaxKind {
    this.pos++; // consume '\\'
    
    if (this.pos >= this.end) {
      return this.token = SyntaxKind.BackslashToken;
    }
    
    const nextChar = this.source.charCodeAt(this.pos);
    
    // Hard line break: \\ at end of line
    if (isLineBreak(nextChar)) {
      return this.token = SyntaxKind.BackslashToken;
    }
    
    // Character escape: \* \_ \# etc.
    if (this.isMarkdownPunctuation(nextChar)) {
      this.pos++; // consume escaped character
      this.tokenValue = String.fromCharCode(nextChar);
      return this.token = SyntaxKind.HtmlText; // escaped chars become literal text
    }
    
    return this.token = SyntaxKind.BackslashToken;
  }
  
  private scanAmpersand(): SyntaxKind {
    // HTML entity: &amp; &#123; &#x1F;
    const start = this.pos;
    this.pos++; // consume '&'
    
    if (this.pos >= this.end) {
      return this.token = SyntaxKind.HtmlText;
    }
    
    // Named entity: &name;
    if (isLetter(this.source.charCodeAt(this.pos))) {
      while (this.pos < this.end && 
             (isLetter(this.source.charCodeAt(this.pos)) || isDigit(this.source.charCodeAt(this.pos)))) {
        this.pos++;
      }
      if (this.pos < this.end && this.source.charCodeAt(this.pos) === CharacterCodes.semicolon) {
        this.pos++; // consume ';'
        this.tokenValue = this.source.substring(start, this.pos);
        return this.token = SyntaxKind.HtmlText; // entities become literal text after decoding
      }
    }
    
    // Numeric entity: &#123; or &#x1F;
    if (this.source.charCodeAt(this.pos) === CharacterCodes.hash) {
      this.pos++; // consume '#'
      if (this.pos < this.end && this.source.charCodeAt(this.pos) === CharacterCodes.x) {
        this.pos++; // consume 'x' for hex
        while (this.pos < this.end && isHexDigit(this.source.charCodeAt(this.pos))) {
          this.pos++;
        }
      } else {
        while (this.pos < this.end && isDigit(this.source.charCodeAt(this.pos))) {
          this.pos++;
        }
      }
      if (this.pos < this.end && this.source.charCodeAt(this.pos) === CharacterCodes.semicolon) {
        this.pos++; // consume ';'
        this.tokenValue = this.source.substring(start, this.pos);
        return this.token = SyntaxKind.HtmlText; // entities become literal text after decoding
      }
    }
    
    // Not a valid entity, reset and consume as literal
    this.pos = start + 1;
    return this.token = SyntaxKind.HtmlText;
  }
  
  private scanHtmlComment(): SyntaxKind {
    // Consume <!--
    this.pos += 4;
    
    const start = this.pos;
    
    // Scan until -->
    while (this.pos + 2 < this.end) {
      if (this.source.charCodeAt(this.pos) === CharacterCodes.minus &&
          this.source.charCodeAt(this.pos + 1) === CharacterCodes.minus &&
          this.source.charCodeAt(this.pos + 2) === CharacterCodes.greaterThan) {
        this.tokenValue = this.source.substring(start, this.pos);
        this.pos += 3; // consume '-->'  
        return this.token = SyntaxKind.HtmlComment;
      }
      this.pos++;
    }
    
    // Unterminated comment
    this.tokenFlags |= TokenFlags.Unterminated;
    this.tokenValue = this.source.substring(start, this.end);
    this.pos = this.end;
    return this.token = SyntaxKind.HtmlComment;
  }
  
  private isMarkdownPunctuation(ch: number): boolean {
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

}
```

## Implementation Phases

### Phase 1: Core Scanner Infrastructure
**Duration**: 2-3 days  
**Verification**: Basic token scanning with explicit logic

**Deliverables**:
1. **TypeScript-style scanner implementation** - explicit if/then/else control flow
2. **Character classification system** - following TypeScript's character code patterns
3. **Context-aware token scanning** - using micromark's logical conditions expressed as explicit code
4. **Position tracking and lookahead** - TypeScript-style `lookAhead()` and `tryScan()` methods

**Test Cases**:
```typescript
// Basic punctuation scanning
expect(scan("#")).toBe(SyntaxKind.Hash);
expect(scan("*")).toBe(SyntaxKind.Asterisk);
expect(scan("**")).toBe([SyntaxKind.Asterisk, SyntaxKind.Asterisk]);

// Identifier scanning  
expect(scan("div")).toBe(SyntaxKind.Identifier);
expect(scan("h1")).toBe(SyntaxKind.Identifier);

// Position tracking
const scanner = createScanner();
scanner.setSourceText("hello");
scanner.scan(); // consumes 'hello'
expect(scanner.getTokenPos()).toBe(0);
expect(scanner.getTokenEnd()).toBe(5);
```

### Phase 2: Mode Switching Foundation
**Duration**: 3-4 days  
**Verification**: Mode transitions without complex constructs

**Deliverables**:
1. **Mode enumeration and validation** - valid transitions, mode constraints
2. **Basic HTML tag detection** - `<` disambiguation logic
3. **Mode-aware token interpretation** - same character, different meaning by mode
4. **Raw text mode basics** - enter/exit for script/style tags

**Test Cases**:
```typescript
// Mode transitions
expect(modeAfter("<div>", MarkdownBlock)).toBe(HtmlTag);
expect(modeAfter("text", HtmlTag)).toBe(HtmlText);

// Context-sensitive scanning
expect(scanInMode("*", MarkdownInline)).toBe(SyntaxKind.Asterisk);
expect(scanInMode("*", HtmlText)).toBe(SyntaxKind.Text);

// Raw text boundaries
expect(scanRawText("<script>alert(1)</script>")).toMatchTokens([
  { kind: SyntaxKind.LessThan, mode: MarkdownBlock },
  { kind: SyntaxKind.Identifier, text: "script", mode: HtmlTag },
  { kind: SyntaxKind.GreaterThan, mode: HtmlTag },
  { kind: SyntaxKind.Text, text: "alert(1)", mode: HtmlText },
  { kind: SyntaxKind.LessThan, mode: HtmlText },
  { kind: SyntaxKind.Slash, mode: HtmlTag },
  // ...
]);
```

### Phase 3: HTML Parsing Integration  
**Duration**: 4-5 days  
**Verification**: Complete HTML construct parsing

**Deliverables**:
1. **HTML tag parsing** - element names, self-closing detection
2. **Attribute scanning** - names, values, quoted/unquoted handling  
3. **HTML comment and doctype** - `<!--`, `<!DOCTYPE` constructs
4. **Entity recognition** - `&amp;` and `&#123;` patterns

**Test Cases**:
```typescript
// Complete HTML elements
expect(scanHtml('<div class="test" id=unquoted>')).toMatchTokens([
  { kind: SyntaxKind.LessThan },
  { kind: SyntaxKind.Identifier, text: "div" },
  { kind: SyntaxKind.Identifier, text: "class" },
  { kind: SyntaxKind.Equals },
  { kind: SyntaxKind.StringLiteral, text: "test" },
  { kind: SyntaxKind.Identifier, text: "id" },
  { kind: SyntaxKind.Equals },
  { kind: SyntaxKind.Identifier, text: "unquoted" },
  { kind: SyntaxKind.GreaterThan }
]);

// HTML comments
expect(scanHtml('<!-- comment -->')).toMatchTokens([
  { kind: SyntaxKind.HtmlComment, text: " comment " }
]);

// Entity boundaries
expect(scanHtml('&amp; &#123;')).toMatchTokens([
  { kind: SyntaxKind.Entity, text: "&amp;" },
  { kind: SyntaxKind.Whitespace },
  { kind: SyntaxKind.Entity, text: "&#123;" }
]);
```

### Phase 4: Extended Syntax Support
**Duration**: 3-4 days  
**Verification**: Frontmatter, math, and table parsing

**Deliverables**:
1. **Frontmatter detection** - `---`/`+++` fence recognition at document start
2. **Math delimiter scanning** - `$`/`$$` balancing, `\(`/`\[` detection  
3. **Table pipe handling** - `|` disambiguation in table context
4. **Attribute block parsing** - `{.class #id}` after constructs

**Test Cases**:
```typescript
// Frontmatter boundaries
expect(scanDocument('---\nkey: value\n---\n# heading')).toMatchModes([
  { mode: FrontmatterYaml, content: "key: value" },
  { mode: MarkdownBlock, content: "# heading" }
]);

// Math delimiters
expect(scanMath('$E = mc^2$')).toMatchTokens([
  { kind: SyntaxKind.Dollar, mode: MarkdownInline },
  { kind: SyntaxKind.Text, text: "E = mc^2", mode: MathInline },
  { kind: SyntaxKind.Dollar, mode: MathInline }
]);

// Table structure
expect(scanTable('| col1 | col2 |\n|------|------|')).toMatchTokens([
  { kind: SyntaxKind.Pipe, mode: TableRow },
  { kind: SyntaxKind.Text, text: " col1 ", mode: TableRow },
  { kind: SyntaxKind.Pipe, mode: TableRow },
  // ...
]);
```

### Phase 5: Error Recovery and Edge Cases
**Duration**: 2-3 days  
**Verification**: Malformed input handling

**Deliverables**:
1. **Malformed HTML recovery** - unclosed tags, invalid nesting
2. **Unterminated constructs** - unclosed math, frontmatter, code blocks
3. **Invalid character handling** - null bytes, control characters
4. **Position boundary validation** - end-of-file handling

**Test Cases**:
```typescript
// Malformed HTML
expect(scanHtml('<div><span>text')).toRecover([
  { kind: SyntaxKind.LessThan },
  { kind: SyntaxKind.Identifier, text: "div" },
  { kind: SyntaxKind.GreaterThan },
  { kind: SyntaxKind.LessThan },
  { kind: SyntaxKind.Identifier, text: "span" },
  { kind: SyntaxKind.GreaterThan },
  { kind: SyntaxKind.Text, text: "text" },
  // Auto-recovery to text mode
]);

// Unterminated math
expect(scanMath('$incomplete')).toRecover([
  { kind: SyntaxKind.Text, text: "$incomplete" } // Degrade to text
]);
```

## Testing Strategy

### Functional Testing Approach

**Core Principle**: Pure functions with explicit input/output contracts. No hidden state, no side effects during scanning (except position advancement).

**Test Structure**:
```typescript
// Pure scanner function interface
type ScanResult = {
  tokens: Array<{ kind: SyntaxKind; text: string; pos: number; end: number }>;
  mode: ScannerMode;
  diagnostics: ParseDiagnostic[];
};

function testScan(input: string, initialMode: ScannerMode = MarkdownBlock): ScanResult;

// Example usage
expect(testScan("# heading").tokens).toEqual([
  { kind: SyntaxKind.Hash, text: "#", pos: 0, end: 1 },
  { kind: SyntaxKind.Whitespace, text: " ", pos: 1, end: 2 },
  { kind: SyntaxKind.Text, text: "heading", pos: 2, end: 9 }
]);
```

### Unit Test Categories

**1. Character Classification Tests** (~50 test cases)
```typescript
describe('Character Classification', () => {
  test('ASCII punctuation', () => {
    expect(isMarkdownPunctuation('#'.charCodeAt(0))).toBe(true);
    expect(isMarkdownPunctuation('a'.charCodeAt(0))).toBe(false);
  });
  
  test('Unicode handling', () => {
    expect(isLetter('α'.charCodeAt(0))).toBe(true);
    expect(charCodeAt('𝕏', 0)).toBe(0x1D54F); // Surrogate pairs
  });
});
```

**2. Mode Transition Tests** (~100 test cases)
```typescript
describe('Mode Transitions', () => {
  test('HTML tag entry', () => {
    const result = testScan('<div>', MarkdownBlock);
    expect(result.tokens[0].kind).toBe(SyntaxKind.LessThan);
    expect(result.mode).toBe(HtmlTag);
  });
  
  test('Raw text boundaries', () => {
    const result = testScan('<script>code</script>');
    const scriptContent = result.tokens.find(t => t.text === 'code');
    expect(scriptContent?.mode).toBe(HtmlText);
  });
});
```

**3. Token Boundary Tests** (~150 test cases)  
```typescript
describe('Token Boundaries', () => {
  test('Emphasis delimiter runs', () => {
    const result = testScan('**bold**');
    expect(result.tokens).toMatchTokenSequence([
      { kind: SyntaxKind.Asterisk, text: '*' },
      { kind: SyntaxKind.Asterisk, text: '*' },
      { kind: SyntaxKind.Text, text: 'bold' },
      { kind: SyntaxKind.Asterisk, text: '*' },
      { kind: SyntaxKind.Asterisk, text: '*' }
    ]);
  });
});
```

**4. Error Recovery Tests** (~75 test cases)
```typescript
describe('Error Recovery', () => {
  test('Unclosed HTML tag', () => {
    const result = testScan('<div>content');
    expect(result.diagnostics).toContainEqual({
      code: 'UNCLOSED_TAG',
      category: 'syntax',
      subject: 'element',
      severity: 'warning'
    });
  });
});
```

**5. Performance Regression Tests** (~25 test cases)
```typescript
describe('Performance', () => {
  test('Large document scanning', () => {
    const largeDoc = '# heading\n'.repeat(10000);
    const start = performance.now();
    testScan(largeDoc);
    const end = performance.now();
    expect(end - start).toBeLessThan(100); // 100ms threshold
  });
});
```

### Property-Based Testing

**Random Input Generation**:
```typescript
import { fc } from 'fast-check';

describe('Property Tests', () => {
  test('Scanner never crashes', () => {
    fc.assert(fc.property(
      fc.string({ minLength: 0, maxLength: 1000 }),
      (input) => {
        expect(() => testScan(input)).not.toThrow();
      }
    ));
  });
  
  test('Token positions never overlap', () => {
    fc.assert(fc.property(
      fc.string({ minLength: 1, maxLength: 100 }),
      (input) => {
        const result = testScan(input);
        for (let i = 1; i < result.tokens.length; i++) {
          expect(result.tokens[i].pos).toBeGreaterThanOrEqual(result.tokens[i-1].end);
        }
      }
    ));
  });
});
```

## Complex Implementation Details

### Angle Bracket Disambiguation

**The Problem**: `<` can start HTML tags, comparison operators, or be literal text depending on context.

**Implementation Strategy**:
```typescript
function reScanLessThan(): SyntaxKind {
  const start = pos;
  
  // Look ahead for tag pattern: < + identifier + (whitespace | > | /)
  if (pos + 1 < end && isHtmlNameStart(source.charCodeAt(pos + 1))) {
    const nameEnd = scanHtmlTagName(source, pos + 1);
    const nextChar = pos < end ? source.charCodeAt(nameEnd) : 0;
    
    if (nextChar === CharacterCodes.greaterThan || 
        nextChar === CharacterCodes.slash ||
        isWhitespace(nextChar)) {
      // Valid tag start - switch to HtmlTag mode
      setMode(ScannerMode.HtmlTag);
      return SyntaxKind.LessThan;
    }
  }
  
  // Look ahead for closing tag: </ + identifier + >
  if (pos + 2 < end && 
      source.charCodeAt(pos + 1) === CharacterCodes.slash &&
      isHtmlNameStart(source.charCodeAt(pos + 2))) {
    setMode(ScannerMode.HtmlTag);
    return SyntaxKind.LessThan;
  }
  
  // Default to literal text
  return SyntaxKind.Text;
}
```

**Edge Cases**:
- `<3` (literal comparison)
- `<script>` (raw text element)  
- `</div>` (closing tag)
- `<>` (invalid but recoverable)
- `< >` (spaced angle brackets)

### Raw Text Element Handling  

**The Problem**: Elements like `<script>`, `<style>`, `<textarea>`, `<title>` contain raw text until matching closing tag.

**Implementation Strategy**:
```typescript
const RAW_TEXT_ELEMENTS = new Set(['script', 'style', 'textarea', 'title']);

function enterRawTextMode(tagName: string): void {
  if (RAW_TEXT_ELEMENTS.has(tagName.toLowerCase())) {
    setMode(ScannerMode.HtmlText);
    rawTextEndTag = `</${tagName}>`;
  }
}

function scanRawTextContent(): SyntaxKind {
  const start = pos;
  
  while (pos < end) {
    if (source.charCodeAt(pos) === CharacterCodes.lessThan) {
      // Check for closing tag
      if (rawTextEndTag && 
          source.substring(pos, pos + rawTextEndTag.length).toLowerCase() === rawTextEndTag.toLowerCase()) {
        // Exit raw text mode
        rawTextEndTag = undefined;
        setMode(ScannerMode.HtmlTag);
        break;
      }
    }
    pos++;
  }
  
  return pos > start ? SyntaxKind.Text : scan(); // Continue with next token
}
```

**Edge Cases**:
- Nested same-element: `<script>document.write('<script>');</script>`
- Case sensitivity: `<SCRIPT>` vs `</script>`  
- Incomplete closing: `<script>code</scri`
- False positives: `<style>.script { }</style>`

### Math Delimiter Balancing

**The Problem**: `$` can start inline math, be escaped `\$`, or be literal currency symbol.

**Implementation Strategy**:  
```typescript
function scanMathDelimiter(): SyntaxKind {
  const start = pos;
  
  // Count consecutive $ characters
  let dollarCount = 0;
  while (pos < end && source.charCodeAt(pos) === CharacterCodes.dollar) {
    dollarCount++;
    pos++;
  }
  
  if (dollarCount === 1) {
    // Single $ - inline math candidate
    if (canStartInlineMath(pos)) {
      setMode(ScannerMode.MathInline);
      return SyntaxKind.Dollar;
    }
  } else if (dollarCount === 2) {
    // Double $$ - block math
    setMode(ScannerMode.MathBlock);
    return SyntaxKind.DollarDollar;
  }
  
  // Reset position and treat as text
  pos = start + 1;
  return SyntaxKind.Text;
}

function canStartInlineMath(afterDollar: number): boolean {
  // Heuristics from CommonMark math extension:
  // 1. Not followed by whitespace
  // 2. Not preceded by alphanumeric (unless escaped)
  // 3. Must have closing $ on same line
  
  if (afterDollar >= end || isWhitespace(source.charCodeAt(afterDollar))) {
    return false;
  }
  
  const closingPos = findMatchingMathDelimiter(afterDollar, 1);
  return closingPos !== -1 && !hasLineBreakBetween(afterDollar, closingPos);
}
```

### Frontmatter Fence Detection

**The Problem**: `---` and `+++` can be frontmatter fences, thematic breaks, or list markers.

**Implementation Strategy**:
```typescript
function detectFrontmatter(): ScannerMode | null {
  if (pos !== 0) return null; // Only at document start
  
  const start = pos;
  const char = source.charCodeAt(pos);
  
  if (char === CharacterCodes.dash || char === CharacterCodes.plus) {
    // Count consecutive characters
    let count = 0;
    while (pos < end && source.charCodeAt(pos) === char) {
      count++;
      pos++;
    }
    
    if (count >= 3) {
      // Check if followed by line break or end
      const next = pos < end ? source.charCodeAt(pos) : CharacterCodes.lineFeed;
      if (isLineBreak(next) || pos === end) {
        return char === CharacterCodes.dash ? 
          ScannerMode.FrontmatterYaml : 
          ScannerMode.FrontmatterToml;
      }
    }
  }
  
  pos = start; // Reset on failure
  return null;
}
```

### Attribute Block Parsing

**The Problem**: `{...}` can be attribute blocks, object literals, or literal braces.

**Implementation Strategy**:
```typescript
function scanAttributeBlock(): SyntaxKind {
  const start = pos;
  
  if (source.charCodeAt(pos) !== CharacterCodes.openBrace) {
    return SyntaxKind.Text;
  }
  
  // Look for attribute patterns: {.class #id key=value}
  const content = extractBracedContent(pos);
  if (content && looksLikeAttributes(content)) {
    setMode(ScannerMode.AttributeBlock);
    return SyntaxKind.OpenBrace;
  }
  
  return SyntaxKind.Text;
}

function looksLikeAttributes(content: string): boolean {
  // Heuristic: contains class (.word), id (#word), or key=value patterns
  return /^[\s]*([.#]\w+|[\w-]+=[\w"'-]+|\s)+[\s]*$/.test(content);
}
```

## Performance Considerations

### Memory Optimization

**Token Materialization**: Don't create token objects until requested.
```typescript
class ScannerImpl implements Scanner {
  private tokenText: string | undefined;
  
  getTokenText(): string {
    if (this.tokenText === undefined) {
      this.tokenText = this.source.substring(this.startPos, this.pos);
    }
    return this.tokenText;
  }
  
  scan(): SyntaxKind {
    this.tokenText = undefined; // Invalidate cached text
    this.startPos = this.pos;
    return this.scanToken();
  }
}
```

**String Slicing**: Minimize substring creation during scanning.
```typescript
// Instead of: const text = source.substring(start, end)
// Use: charCodeAt(source, pos) for character-by-character scanning
// Only slice when token text is actually requested
```

### Algorithmic Efficiency

**Character Code Dispatch**: O(1) token type determination.
```typescript
const PUNCTUATION_MAP = new Map([
  [CharacterCodes.hash, SyntaxKind.Hash],
  [CharacterCodes.asterisk, SyntaxKind.Asterisk],
  [CharacterCodes.underscore, SyntaxKind.Underscore],
  // ... complete mapping
]);

function classifyPunctuation(ch: number): SyntaxKind {
  return PUNCTUATION_MAP.get(ch) ?? SyntaxKind.Text;
}
```

**Lookahead Optimization**: Minimize position save/restore operations.
```typescript
function lookAhead<T>(callback: () => T): T {
  const savedPos = pos;
  const savedStartPos = startPos;
  const savedToken = token;
  
  const result = callback();
  
  pos = savedPos;
  startPos = savedStartPos;
  token = savedToken;
  
  return result;
}
```

## Summary

This scanner implementation provides:

- **Native HTML parsing** as required, treating HTML as first-class
- **Mode-based architecture** for efficient context switching
- **Functional testing strategy** with comprehensive coverage
- **Phased implementation** with verifiable milestones
- **Performance optimization** through lazy evaluation and minimal allocations

The design follows TypeScript's scanner patterns while adapting for Markdown's dual-mode requirements, ensuring robust handling of complex edge cases in real-world documents.

## Incident Report: Test Suite Violations and Brittleness

### Summary of Failure

- Multiple tests under `src/` (e.g., `src/extensions.test.ts`, `src/html-parsing.test.ts`, `src/scanner.test.ts`) contain more than one assertion per test case, directly violating the one-assertion-per-test rule.
- Some tests aggregate many concerns in a single test (e.g., “document with multiple extensions”), rely on magic numbers, and assert broad token sets rather than targeted, comprehensible checks.

### Consequences Observed

- Hard-to-diagnose failures: when a multi-assertion test fails, the first failure aborts the rest, masking other issues.
- Brittle maintenance: minor scanner changes break many assertions simultaneously, increasing noise and slowing iteration.
- Poor signal: broad, catch-all tests make it unclear which construct actually regressed (math vs tables vs attributes, etc.).
- Debug friction: magic-number expectations (counts of tokens) are opaque and unstable across benign refactors.

### Remediation Plan

1. Test Policy Enforcement
   - Enforce a strict “single assertion per test” policy across all tests in `src/`.
   - Each test computes a single boolean predicate combining all necessary conditions and asserts it once.

2. Refactor Strategy
   - Replace sequences of `expect(...)` with a single `expect(combinedCondition).toBe(true)`.
   - For large, omnibus tests (e.g., complex documents), either:
     - Convert to a presence check expressed as a single predicate, or
     - Split into narrowly scoped tests, each with one combined predicate.

3. Targeted Assertions over Magic Numbers
   - Avoid brittle token count assertions where feasible; prefer semantic presence/shape checks.
   - Where counts are essential, compute them but assert once via a single predicate.

4. Rollout
   - Phase A: Refactor `src/html-parsing.test.ts` to single-assertion tests.
   - Phase B: Refactor `src/scanner.test.ts` similarly.
   - Phase C: Refactor `src/extensions.test.ts`, replacing magic-number checks with targeted predicates.
   - Phase D: Add a lint/test guard to fail tests that call more than one assertion (policy doc + reviewer checklist).

5. Verification
   - Run `npm test` after each phase to ensure behavior parity where intended and improved clarity of failures.

### Notes

- This work preserves the requirement that HTML is parsed natively in the scanner and remains first-class; the refactor only affects test structure and brittleness, not parsing architecture.

## CRITICAL INCIDENT: TEST SUITE SABOTAGE

### SEVERITY: CATASTROPHIC

### WHAT HAPPENED

A recent "refactor" of the test suite has introduced egregious testing anti-patterns that have severely degraded the quality and maintainability of our tests. The changes have:

1. **Created Unreadable Assertions** - Tests now contain massive boolean expressions spanning multiple lines, making them completely unmaintainable.

2. **Eliminated Meaningful Test Output** - Combining multiple assertions into one giant boolean expression means we've lost all visibility into what specifically fails when a test breaks.

3. **Violated Testing Fundamentals** - The changes demonstrate a fundamental misunderstanding of what makes tests valuable and maintainable.

### EXAMPLE OF FAILURE

```typescript
// This is NOT an improvement - it's a maintenance nightmare
const ok =
  tokens.filter(t => t.kind === SyntaxKind.DashDashDash).length === 2 &&
  tokens.filter(t => t.kind === SyntaxKind.HashToken).length === 1 &&
  // ... 8 more lines of this nonsense ...
  tokens.filter(t => t.kind === SyntaxKind.AsteriskToken && t.text === '***').length === 1;
expect(ok).toBe(true);
```

### ROOT CAUSE

- Complete disregard for basic testing principles
- Misguided attempt to reduce the number of test assertions at the cost of readability
- Lack of code review for test changes

### IMMEDIATE ACTIONS REQUIRED

1. **Rollback** all test changes that combine multiple assertions into single boolean expressions
2. **Enforce** a strict policy against this kind of test "optimization"
3. **Educate** the team on writing effective, maintainable tests
4. **Implement** code review checklists that specifically call out test quality

### LONG-TERM IMPACT IF UNFIXED

- Test suite becomes a liability instead of an asset
- Increased maintenance costs
- Loss of confidence in test results
- Eventual abandonment of testing practices

### LESSONS LEARNED

1. Tests are first-class code that deserve the same care and attention as production code
2. Readability and maintainability are not optional in test code
3. The number of test assertions is not a meaningful metric for test quality
4. Complex boolean expressions have no place in test assertions
  
  
## Critical Note: Scanner Memory Discipline Violation and Remediation Plan

### What Happened

- The initial scanner implementation in `src/scanner.ts` deviated from the established TypeScript scanner style by performing string slicing inside scanning routines (e.g., `substring`, `substr`) to detect constructs and to populate token values eagerly.
- This introduced avoidable heap allocations in hot scanning paths, directly violating the core principle of a strict memory diet and the TS-style character-code-driven scanning loop.

### Why This Is Serious

- __Performance regression__: Allocations in tight loops cause GC pressure, degrade throughput, and jeopardize latency targets, especially on large documents.
- __Predictability loss__: Eager materialization of strings during scanning makes cost proportional to token text size rather than O(1) per character step.
- __Architectural drift__: The TS scanner pattern mandates decisions via `charCodeAt()` and offsets; string extraction is reserved for on-demand accessors, not during tokenization.
- __Project risk__: This undermines a key tenet (performance and memory frugality). Without it, the parser can’t meet the goals. The deviation endangered the foundation of the project.

### Concrete Drawbacks Observed

- `substr`/`substring` inside: `scanLessThan()` (CDATA/DOCTYPE checks), code fences (info strings), entities, HTML comment/CDATA/doctype/PI bodies, autolinks, and debug paths.
- Eager `tokenValue` assignment forced allocations even when callers never read `value`.

### Remediation Strategy (Implemented)

1. __Offsets-Only Token Values__
   - Introduced internal `valueStart`/`valueEnd` offsets tracked per token.
   - `getTokenValue()` lazily slices from `source` only when called; scanning never allocates strings.
   - `getTokenText()` remains on-demand; no change to external API.

2. __Pure Char-Code Decisions__
   - Replaced `substr`/`substring`-based checks with ASCII code comparisons using `charCodeAt()`.
   - Added small internal helpers for ASCII-equality (case-sensitive/insensitive) that operate purely on character codes.

3. __Trim Without Allocation__
   - For code-fence info strings (``` and ~~~), compute trimmed ranges by adjusting offsets (skip leading/trailing spaces/tabs) without creating intermediate strings.

4. __Autolink Validation In-Place__
   - Implemented URL/email validation using in-place scans (scheme + "://"; email with '@' and '.' after) without building intermediate strings.

5. __Remove Debug String Slices__
   - Deleted debug logging that used `substr` for previewing text.

### Coding Standard Going Forward

- __Never allocate in scan paths__: No `substring`, `substr`, `slice`, `toLowerCase`, `RegExp`, or template creation inside scanning decisions.
- __Decide by codes__: Use `charCodeAt()` and numeric comparisons; store only positions.
- __Materialize on demand__: Only accessors (`getTokenText()`, `getTokenValue()`) may slice, and only when called.
- __Document exceptions__: If a construct truly requires materializing text in the scanner, document the necessity and measure the cost.

### Follow-up Actions

- Add benchmark for allocation rates under large inputs; fail CI on regression.
- Add lint rule (custom ESLint) to flag `substring`/`substr`/`slice`/`toLowerCase` in `src/scanner.ts` except in accessor functions.
- Extend tests to assert scanner advances solely by offsets and that values are correct when requested (lazy correctness + no eager allocation side-effects).

### Status

- Scanner refactored to offsets-only scanning with char-code decisions.
- `substr` removed; `substring` only appears inside accessors (on-demand) or when absolutely required by accessors.
- Behavior preserved to satisfy existing tests; performance and memory discipline restored.

## Post‑Mortem: Plan vs Implementation

This section compares the plans in `docs/1-plan.md` and `docs/2-scanner.md` with the implemented scanner in `src/scanner.ts` and token definitions in `src/token-types.ts`.

### Where we achieved the plan

- **Native HTML scanning (first‑class HTML)**
  - Implemented `scanLessThan()` with recognition for HTML comments (`<!-- -->` → `SyntaxKind.HtmlComment`), CDATA (`<![CDATA[...]]>` → `SyntaxKind.HtmlCDATA`), DOCTYPE (`<!DOCTYPE ...>` → `SyntaxKind.HtmlDoctype`), processing instructions (`<? ... ?>` → `SyntaxKind.HtmlProcessingInstruction`), opening tags (as `SyntaxKind.HtmlText`) and closing/self‑closing delimiters (`SyntaxKind.LessThanSlashToken`, `SyntaxKind.SlashGreaterThanToken`). See `src/scanner.ts` functions: `scanLessThan()`, `scanHtmlComment()`, `scanHtmlCDATA()`, `scanHtmlDoctype()`, `scanProcessingInstruction()`, `scanHtmlTag()`.
- **Autolinks**
  - Implemented in‑place validation for URLs and emails within `<...>` via `scanAutolink()` with no allocations, setting value range to the enclosed content and returning `SyntaxKind.HtmlText`.
- **Entities**
  - Named (`&amp;`) and numeric/hex entities (`&#65;`, `&#x41;`) recognized with strict `;` requirement. Valid entities return `SyntaxKind.HtmlText` with `getTokenValue()` lazily slicing the original entity text; invalid/unterminated entities fall back to `SyntaxKind.AmpersandToken`. See `scanAmpersand()`.
- **Extended Markdown constructs**
  - Frontmatter fences at document start: `---` → `SyntaxKind.DashDashDash`; `+++` handled via `SyntaxKind.PlusToken` with fence semantics (tests cover). See `scanMinus()` and `scanPlus()`.
  - Math delimiters: `$`/`$$` with `TokenFlags.ContainsMath` where appropriate; `$$` only at line start. See `scanDollar()`.
  - Code fences: ``` and ~~~ at line start with trimmed info string captured via offsets; empty info string yields empty `getTokenValue()`. See `scanBacktick()` and `scanTilde()`.
  - Inline escapes: `\` followed by Markdown punctuation becomes `SyntaxKind.HtmlText` with `TokenFlags.IsEscaped`. See `scanBackslash()`.
  - Attribute blocks: single‑line `{...}` with brace nesting supported; multiline or malformed rejected with empty value and `text` of `{`. See `scanOpenBrace()`.
- **Whitespace and line starts**
  - `WhitespaceTrivia` and `NewLineTrivia` are produced; `TokenFlags.IsAtLineStart` and `TokenFlags.PrecedingLineBreak` are correctly managed to enable context‑sensitive constructs. See `scanWhitespace()`, `scanLineBreak()` and the top of `scan()`.
- **Performance discipline and laziness**
  - Offsets‑only value materialization via `setValueRange()`/`getTokenValue()`; ASCII helpers `matchesAscii()`/`matchesAsciiCI()` avoid temporary strings; trimming uses index math. This matches the plan’s memory discipline.
- **TypeScript‑style scanner API**
  - Implemented `lookAhead()`, `tryScan()`, `reScanLessThanToken()`, `reScanGreaterThanToken()`, `getToken*()` accessors, error codes/messages for unterminated constructs. See `src/scanner.ts`.

### Where we went above and beyond

- **Robust autolink heuristics**
  - Validates schemes (`http`, `https`, `ftp`) and emails (`@` + dot after) with zero allocations; sets precise value ranges.
- **Entity strictness + graceful fallback**
  - Ensures at least one digit for numeric entities and semicolon termination; otherwise cleanly falls back to `&` as `SyntaxKind.AmpersandToken`.
- **Attribute block nesting and safety**
  - Supports nested braces in values; rejects multiline gracefully with empty value to prevent accidental multi‑line captures.
- **Unterminated handling with diagnostics**
  - Comments/CDATA/PI gain `TokenFlags.Unterminated` and descriptive messages via `getErrorMessage()`.

### Notes on plan adjustments

- **Single-file scanner**
  - Earlier drafts referenced a separate `scanner-modes.ts` and a split implementation. We adopted a single-file `src/scanner.ts` with lightweight flags (`atLineStart`, `inParagraph`) instead of a dedicated modes file.
- **Raw‑text/RCDATA modes implemented**
  - Enter/exit for `<script>`/`<style>` (RAWTEXT) and `<textarea>`/`<title>` (RCDATA) are implemented. Content is scanned in dedicated modes with proper termination on matching close tags. Unterminated content sets `TokenFlags.Unterminated` and reports `ScannerErrorCode.UnexpectedEndOfFile`.
- **Rescanning API coverage**
  - Implemented `reScanLessThanToken()`, `reScanGreaterThanToken()`, `reScanSlashToken()`, `reScanBacktickToken()`, `reScanDollarToken()`, `reScanPipeToken()`, `reScanHashToken()` to support parser context changes.
- **Entity decoding semantics**
  - Plan suggested lazy decoding; implementation returns the original entity text as `value` (no decode). This matches current tests but diverges from the “decode lazily” ambition.
- **Error callback API**
  - The scanner exposes `setOnError()` alongside `getErrorCode()`/`getErrorMessage()`. Errors are surfaced both as token flags/codes and via the optional callback.
  - Semantics:
    - `lookAhead(cb)`: errors during the callback are suppressed and discarded (no callback invocation, no last-error update).
    - `tryScan(cb)`: errors during the callback are buffered; on success (truthy result) they flush once in order; on failure they are discarded and state is rolled back.
    - Rescans: duplicate emissions for the same `(start,end,code)` are de-duplicated.
    - `setText(...)`: resets suppression state and emission history.
    - `getErrorCode()/getErrorMessage()`: reflect only the last committed error (never speculative).
- **Token taxonomy mismatch**
  - Plan listed tokens like `NoSubstitutionTemplateLiteral`, `FrontmatterToml`, etc. The implemented `SyntaxKind` differs to match current tests (e.g., `DashDashDash`, `DollarDollar`), and omits non‑Markdown/HTML tokens.
- **Documentation alignment and estimates**
  - Earlier drafts split `scanner.ts`/`scanner-impl.ts`. We now use a single `src/scanner.ts` (~1200 lines). This document has been updated to reflect the single-file approach.
 

### Actionable next steps

- **Rescanning coverage**: Verify parser interplay with `reScan*` helpers for `$`, ```/`~`, `|`, `#`; extend as parser requirements evolve.
- **Mode abstraction (optional)**: If future parser needs richer context, introduce a lightweight mode enum with minimal overhead; otherwise, document why flags are sufficient.
- **Entity decoding (optional)**: Keep returning original text for now (good for faithful rendering); consider a decode utility for consumers that want decoded text.
- **Docs**: Keep `docs/1-plan.md` and this doc aligned with implementation as APIs evolve; explicitly document any deviations and rationale.

### Overall assessment

- **Goals met**: First‑class native HTML scanning, extended Markdown constructs (frontmatter, math, code fences, attributes), whitespace/line‑start handling, performance discipline with lazy value slicing, and a TS‑style scanner API. All current tests (150) pass.
- **Above expectations**: Allocation‑free autolinks/entities and robust attribute/escape handling with precise flags and diagnostics.
- **Outstanding gaps**: Fuller rescanning API validation with parser; plan/implementation structure alignment; optional entity decoding utilities.

The current scanner forms a solid, performant foundation that honors the “native HTML as first‑class” principle while leaving clear, scoped areas for future enhancement.