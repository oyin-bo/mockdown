/**
 * Token types for Scanner2 - New Parser-Scanner Architecture
 * 
 * This is a simplified, focused token set for the new scanner architecture.
 * Unlike the original token-types.ts, this focuses only on tokens needed
 * for the stage-based Scanner2 implementation.
 */

/**
 * Token types for Scanner2 - Stage 1 focuses on basic text tokenization
 */
export const enum SyntaxKind {
  Unknown,
  EndOfFileToken,

  // Stage 1: Basic text and whitespace tokens
  StringLiteral,            // Text content (normalized, one per line)
  HardLineBreak,            // Hard line break (two or more trailing spaces before newline or trailing backslash)
  NewLineTrivia,            // Line breaks (LF, CRLF, CR)

  // Block-level tokens from line classification
  HashToken,                // #, ##, etc. for ATX headings
  CodeFence,                // ``` or ~~~
  ThematicBreak,            // ---, ***, ___

  // Stage 3: Inline formatting tokens
  AsteriskToken,            // *
  AsteriskAsterisk,         // **
  UnderscoreToken,          // _
  UnderscoreUnderscore,     // __
  BacktickToken,            // `
  TildeTilde,               // ~~

  // Stage 4: HTML and entities
  // HTML Structural Delimiters
  GreaterThanToken,         // >
  SlashGreaterThanToken,    // /> (recognized as a single token after a tag/attribute sequence)
  EqualsToken,              // = (only meaningful inside tag attribute context)
  AmpersandToken,           // & (when not forming a valid entity)

  // HTML Name / Value Tokens
  // Note: Tag name-only tokens are used for open/close forms.
  HtmlTagOpenName,          // Combined '<name' open tag-start (coarsened token)
  HtmlTagCloseName,         // Combined '</name' close tag-start (coarsened token)
  HtmlAttributeName,        // Attribute name (data-id, aria-label, xml:lang, etc.)
  HtmlAttributeValue,       // Quoted or unquoted attribute value (raw slice, quotes included for quoted)
  HtmlTagWhitespace,        // Whitespace inside an HTML tag (between name, attrs, and >)
  HtmlEntity,               // Complete named or numeric entity WITH terminating ';'

  // HTML Aggregate / Content Tokens
  HtmlComment,              // <!-- ... --> (full span)
  HtmlCdata,                // <![CDATA[ ... ]]> (full span)
  HtmlProcessingInstruction,// <? ... ?> (full span)
  HtmlDoctype,              // <!DOCTYPE html> (full span)
  HtmlRawText,              // Content inside <script>/<style> (no entity scanning)
  HtmlRCDataText,           // Content inside <textarea>/<title> (entity scanning active)

  // Future stages will add more tokens as needed:
  // Later stages: Progressive Markdown construct addition
}

/**
 * Token flags for Scanner2 - simplified and focused on new architecture needs
 */
export const enum TokenFlags {
  None = 0,

  // Line and position context
  PrecedingLineBreak = 1 << 0,   // Token follows a line break
  IsAtLineStart = 1 << 1,        // Token appears at start of line
  IsBlankLine = 1 << 2,          // Newline token ends a whitespace-only line

  // Rollback safety flags for new scanner architecture
  CanRollbackHere = 1 << 3,      // Scanning can safely restart at this position
  RollbackTypeMask = 0x7 << 4,   // 3 bits for rollback type (8 types max)

  // Specific rollback type flags
  RollbackDocumentStart = 0 << 4,     // Position 0 - always safe
  RollbackBlankLine = 1 << 4,         // After blank line - resets block context
  RollbackRawText = 2 << 4,           // Within raw text content
  RollbackCodeBlock = 3 << 4,         // Within code block content
  RollbackHtmlInner = 4 << 4,         // Within HTML element content
  RollbackHtmlTagBoundary = 5 << 4,   // Immediately after completing '>' or '/>' of a tag
  RollbackHtmlEntityComplete = 6 << 4,// Immediately after emitting a HtmlEntity token
  RollbackContentModeBoundary = 7 << 4,// Right after switching into or out of RawText / RCData

  // Stage 3: Emphasis delimiter flags
  CanOpen = 1 << 9,              // Delimiter can open emphasis/strong
  CanClose = 1 << 10,            // Delimiter can close emphasis/strong

  // Stage 4: HTML construct flags
  Unterminated = 1 << 11,        // Token was not properly terminated (missing closing delimiter)
}

/**
 * Rollback type enumeration for structured rollback
 */
export const enum RollbackType {
  DocumentStart = 0,        // Position 0 - always safe
  BlankLineBoundary = 1,    // After blank line - resets block context
  RawTextContent = 2,       // Within <script>/<style> - any position safe
  CodeBlockContent = 3,     // Within fenced code - line boundaries safe
  HtmlElementInner = 4,     // Within HTML element content (non-raw)
  HtmlTagBoundary = 5,      // Immediately after completing '>' or '/>' of a tag
  HtmlEntityComplete = 6,   // Immediately after emitting a HtmlEntity token
  ContentModeBoundary = 7,  // Right after switching into or out of RawText / RCData
}

/**
 * Scanner error codes for Scanner2 diagnostics
 */
export enum ScannerErrorCode {
  None,
  UnexpectedEndOfFile,
  InvalidCharacter,
  InvalidRollbackPosition,
  InvalidRollbackType,
}

/**
 * Specific scanner diagnostics emitted for HTML scanning issues
 */
export enum Diagnostics {
  None = 0,
  InvalidHtmlAttribute,
  UnterminatedHtmlAttributeValue,
}