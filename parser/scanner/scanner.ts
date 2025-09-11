import {
  CharacterCodes,
  isAttributeNameCharacter,
  isAttributeNameStart,
  isLineBreak,
  isWhiteSpace,
  isWhiteSpaceSingleLine
} from './character-codes';
import {
  Diagnostics,
  RollbackType,
  ScannerErrorCode,
  SyntaxKind,
  TokenFlags
} from './token-types';

export interface Scanner {
  /** Initialize scanner text and optional start/length. */
  initText(text: string, start?: number, length?: number): void;

  /** Advances to the next token and updates all public token fields. */
  scan(): void;

  /** Structured rollback to a previous position. */
  rollback(pos: number, type: RollbackType): void;

  /** Fill a zero-allocation diagnostics state object. */
  fillDebugState(state: ScannerDebugState): void;

  /** Current token type. Updated by scan() and rollback(). */
  token: SyntaxKind;

  /** Current token text (always materialized). */
  tokenText: string;

  /** Token flags including rollback safety and contextual flags. */
  tokenFlags: TokenFlags;

  /** Where the next token will start (offset into the source). */
  offsetNext: number;
}

/** Content processing mode - only one active at a time. */
const enum ContentMode {
  /** Regular Markdown tokenization. */
  Normal = 0,

  /** Literal text until end tag (e.g. <script>, <style>). */
  RawText = 1,

  /** Text with entities until end tag (e.g. <textarea>, <title>). */
  RCData = 2,
}

/** Context flags that affect token emission. */
const enum ContextFlags {
  /** No flags set. */
  None = 0,

  /** 0x01 - Currently at the start of a line. */
  AtLineStart = 1 << 0,

  /** 0x02 - Inside paragraph content. */
  InParagraph = 1 << 1,

  /** 0x04 - There was a line break before the current position. */
  PrecedingLineBreak = 1 << 2,
}

/**
 * Line classification flags that determine a line's structural potential.
 * These are the "big flags" set by the initial line prescan.
 */
const enum LineClassification {
  None = 0,
  BLANK_LINE = 1 << 0,
  ATX_HEADING = 1 << 1,
  SETEXT_UNDERLINE_CANDIDATE = 1 << 2,
  THEMATIC_BREAK = 1 << 3,
  FENCED_CODE_OPEN = 1 << 4,
  FENCED_CODE_CLOSE = 1 << 5,
  BLOCKQUOTE_MARKER = 1 << 6,
  LIST_UNORDERED_MARKER = 1 << 7,
  LIST_ORDERED_MARKER = 1 << 8,
  TABLE_ALIGNMENT_ROW = 1 << 9,
  TABLE_PIPE_HEADER_CANDIDATE = 1 << 10,
  PARAGRAPH_PLAIN = 1 << 11,
  HTML_BLOCK_START = 1 << 12,
  INDENTED_CODE = 1 << 13,
}

/** Cached token text for common fixed tokens to avoid substring allocation. */
const TokenTextCache = {
  TILDE_TILDE: '~~',
  ASTERISK_ASTERISK: '**',
  UNDERSCORE_UNDERSCORE: '__',
  SINGLE_ASTERISK: '*',
  SINGLE_UNDERSCORE: '_',
  SINGLE_BACKTICK: '`',
  SPACE: ' ',
  TAB: '\t',
  NEWLINE_LF: '\n',
  NEWLINE_CRLF: '\r\n',
  // Stage 4: HTML structural tokens
  LESS_THAN: '<',
  LESS_THAN_SLASH: '</',
  GREATER_THAN: '>',
  SLASH_GREATER_THAN: '/>',
  EQUALS: '=',
  AMPERSAND: '&',
} as const;

/**
 * Debug state interface for zero-allocation diagnostics
 */
export interface ScannerDebugState {
  /** Current absolute position (index) in the source. */
  pos: number;

  /** Current 1-based line number. */
  line: number;

  /** Current 1-based column number. */
  column: number;

  /** Human-readable mode name (e.g. 'Normal', 'RawText', 'RCData'). */
  mode: string;

  /** True when the scanner is at the start of a line. */
  atLineStart: boolean;

  /** True when currently inside paragraph content. */
  inParagraph: boolean;

  /** True when there was a line break immediately before the current pos. */
  precedingLineBreak: boolean;

  /** The current token kind reported by the scanner. */
  currentToken: SyntaxKind;

  /** The current token's text. */
  currentTokenText: string;

  /** Flags associated with the current token. */
  currentTokenFlags: TokenFlags;

  /** The offset where the next token will start. */
  nextOffset: number;
}


/**
 * Scanner2 implementation with closure-based architecture
 * Stage 1: Basic text lines + whitespace/newlines only
 */
export function createScanner(): Scanner {
  // Scanner state - encapsulated within closure
  let source = '';
  let pos = 0;
  let end = 0;
  let line = 1;
  let column = 1;
  let lastLineStart = 0;

  // Content processing mode
  let contentMode: ContentMode = ContentMode.Normal;
  let endPattern: string | undefined = undefined;

  // HTML tag coarsening: emit name-only tokens for tag starts.
  // HTML tag coarsening: emit name-only tokens for tag starts.
  // When a tag-name is emitted we enter a short-lived "inTagScanning" mode
  // so subsequent scan() calls will return attribute-related tokens one by one.
  let inTagScanning = false;
  let tagScanEnd = 0;
  // Diagnostics collected by scanner (out-of-band, zero-allocation style)
  const diagnostics: { code: number, start: number, length: number }[] = [];
  // Context flags
  let contextFlags: ContextFlags = ContextFlags.AtLineStart;

  // Line classification flags for the current line
  let currentLineFlags: LineClassification = LineClassification.None;

  // Track whether list marker has been consumed for current line
  let listMarkerConsumed: boolean = false;

  // Scanner interface fields - these are the 4 public fields
  let token: SyntaxKind = SyntaxKind.Unknown;
  let tokenText: string = '';
  let tokenFlags: TokenFlags = TokenFlags.None;
  let offsetNext: number = 0;

  // Cross-line state continuity
  let currentIndentLevel = 0;
  let lastBlankLinePos = -1;

  // Phase 0.1: Unified Span Buffer Infrastructure
  // Reusable span buffer for both normalization and cross-line accumulation
  let spanBuffer: number[] = [];           // Reusable array: [start1, len1, start2, len2, ...]
  let spanCount: number = 0;               // Number of text spans in buffer
  let pendingStringStart: number = -1;     // Start position of spanning token (-1 = none)
  let pendingStringFlags: TokenFlags = TokenFlags.None; // Original token context flags

  /**
   * Helper functions reused from existing scanner
   */

  function updatePosition(newPos: number): void {
    while (pos < newPos) {
      const ch = source.charCodeAt(pos); // Read character at current position
      if (isLineBreak(ch)) {
        if (ch === CharacterCodes.carriageReturn &&
          pos + 1 < end &&
          source.charCodeAt(pos + 1) === CharacterCodes.lineFeed) {
          pos++; // Skip CR in CRLF
        }
        line++;
        column = 1;
        lastLineStart = pos + 1;
        contextFlags |= ContextFlags.AtLineStart;
        contextFlags |= ContextFlags.PrecedingLineBreak;
      } else {
        column++;
        if (ch !== CharacterCodes.space && ch !== CharacterCodes.tab) {
          contextFlags &= ~ContextFlags.AtLineStart;
        }
      }
      pos++;
    }
  }

  function getCurrentIndentLevel(): number {
    if (!(contextFlags & ContextFlags.AtLineStart)) return 0;

    let indent = 0;
    let i = lastLineStart;
    while (i < end) {
      const ch = source.charCodeAt(i);
      if (ch === CharacterCodes.space) {
        indent++;
      } else if (ch === CharacterCodes.tab) {
        indent += 4; // Tab = 4 spaces
      } else {
        break;
      }
      i++;
    }
    return indent;
  }

  function isBlankLine(): boolean {
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

  /**
   * Phase 0.1: Unified Span Buffer Operations
   * Core operations for both normalization and cross-line accumulation
   */

  function addSpanToPending(start: number, length: number): void {
    // Ensure buffer capacity (grow but never shrink)
    const neededSlots = (spanCount + 1) * 2;
    if (spanBuffer.length < neededSlots) {
      // Grow by doubling (amortized allocation)
      spanBuffer.length = Math.max(neededSlots, spanBuffer.length * 2);
    }

    spanBuffer[spanCount * 2] = start;
    spanBuffer[spanCount * 2 + 1] = length;
    spanCount++;
  }

  function materializePendingString(): string {
    if (spanCount === 0) return '';
    if (spanCount === 1) {
      // Single span - direct substring (common case, same as current fast path)
      const start = spanBuffer[0];
      const length = spanBuffer[1];
      return source.substr(start, length);
    }

    // Multiple spans - join with spaces (handles both normalization AND line joining)
    const parts: string[] = [];
    for (let i = 0; i < spanCount; i++) {
      const start = spanBuffer[i * 2];
      const length = spanBuffer[i * 2 + 1];
      if (i > 0) parts.push(' '); // Implied space between ALL spans

      // Apply normalization to each span individually
      const spanText = processStringTokenLegacy(start, start + length);
      parts.push(spanText);
    }
    return parts.join('');
  }

  function clearPendingString(): void {
    spanCount = 0; // Don't shrink array - reuse it
    pendingStringStart = -1;
    pendingStringFlags = TokenFlags.None;
  }

  function startPendingString(start: number, flags: TokenFlags): void {
    pendingStringStart = start;
    pendingStringFlags = flags;
    spanCount = 0; // Reset span count for new token
  }

  /**
   * Unified string processing using span buffer approach.
   * For Phase 0.1, maintains backward compatibility by calling existing logic.
   */
  function processStringTokenWithSpans(start: number, endPos: number): string {
    // For Phase 0.1, just use the existing logic to maintain compatibility
    // The span buffer infrastructure is ready for Phase 0.2
    return processStringTokenLegacy(start, endPos);
  }

  /**
   * Legacy string processing function (original implementation)
   */
  function processStringTokenLegacy(start: number, endPos: number): string {
    // Fast path for very short strings (single-char only). Keep two-char runs
    // going through the normal normalization path so that two-space runs get
    // collapsed to a single space as expected by tests.
    const length = endPos - start;
    if (length <= 1) {
      return source.substring(start, endPos);
    }

    // First pass - check if normalization is needed at all
    let needsNormalization = false;
    let hasTrailingSpace = false;

    // If the substring contains only spaces/tabs, either preserve or normalize
    let onlyWhitespace = true;
    for (let i = start; i < endPos; i++) {
      const ch = source.charCodeAt(i);
      if (ch !== CharacterCodes.space && ch !== CharacterCodes.tab) {
        onlyWhitespace = false;
        break;
      }
    }
    if (onlyWhitespace) {
      // Normalize any whitespace-only run to a single space for consistent
      // inline formatting behavior. Do not return an empty string for
      // whitespace-only inputs.
      return ' ';
    }

    for (let i = start; i < endPos; i++) {
      const ch = source.charCodeAt(i);
      if (ch === CharacterCodes.tab) {
        needsNormalization = true;
        break;
      }
      if (ch === CharacterCodes.space) {
        // Check for multiple consecutive spaces
        if (i + 1 < endPos && source.charCodeAt(i + 1) === CharacterCodes.space) {
          needsNormalization = true;
          break;
        }
        // Check for trailing space
        if (i === endPos - 1) {
          hasTrailingSpace = true;
        }
      }
    }

    // If no normalization needed and no trailing space, return clean substring
    if (!needsNormalization && !hasTrailingSpace) {
      return source.substring(start, endPos);
    }

    // If only trailing space needs to be handled, preserve it for inline content 
    if (!needsNormalization && hasTrailingSpace) {
      return source.substring(start, endPos); // Keep the trailing space
    }

    // Need normalization - build result with array
    let result: string[] = [];
    let lastCleanStart = start;
    let inSpaceRun = false;

    for (let i = start; i < endPos; i++) {
      const ch = source.charCodeAt(i);

      if (ch === CharacterCodes.tab || (ch === CharacterCodes.space && inSpaceRun)) {
        // Need to normalize - flush clean content up to this point
        if (i > lastCleanStart) {
          result.push(source.substring(lastCleanStart, i));
        }

        // Add single space if not already in a space run
        if (!inSpaceRun) {
          result.push(' ');
          inSpaceRun = true;
        }

        // Mark next clean start after this character
        lastCleanStart = i + 1;
      } else if (ch === CharacterCodes.space) {
        // Single space - mark that we're in a space run but don't process yet
        inSpaceRun = true;
      } else {
        // Regular character - if we were in a space run, it's over
        if (inSpaceRun) {
          // Include the space(s) in the clean span
          inSpaceRun = false;
        }
      }
    }

    // Add any remaining clean content
    if (lastCleanStart < endPos) {
      result.push(source.substring(lastCleanStart, endPos));
    }

    // Join result and build final normalized string
    const joined = result.join('');

    // If the original substring was only whitespace we returned early above.
    // For normalized inline content, trim by default but preserve a single
    // leading/trailing space when the original text had whitespace that
    // bordered a neighboring non-whitespace token. This keeps separation
    // between adjacent elements (e.g. emphasis tokens and text).

    // Detect original leading/trailing whitespace in the raw slice
    const originalHasLeadingWhitespace = start < endPos &&
      (source.charCodeAt(start) === CharacterCodes.space || source.charCodeAt(start) === CharacterCodes.tab);
    const originalHasTrailingWhitespace = endPos - 1 >= start &&
      (source.charCodeAt(endPos - 1) === CharacterCodes.space || source.charCodeAt(endPos - 1) === CharacterCodes.tab);

    let preserveLeft = false;
    let preserveRight = false;

    // Preserve left whitespace only when there's a non-whitespace character immediately before
    if (originalHasLeadingWhitespace && start > 0) {
      const prev = source.charCodeAt(start - 1);
      if (!isWhiteSpaceSingleLine(prev) && !isLineBreak(prev)) {
        preserveLeft = true;
      }
    }

    // Preserve right whitespace only when there's a non-whitespace character immediately after
    if (originalHasTrailingWhitespace && endPos < end) {
      const next = source.charCodeAt(endPos);
      if (!isWhiteSpaceSingleLine(next) && !isLineBreak(next)) {
        preserveRight = true;
      }
    }

    // Default normalized content (trimmed)
    let normalized = joined.trim();

    if (preserveLeft) normalized = ' ' + normalized;
    if (preserveRight) normalized = normalized + ' ';

    return normalized;
  }

  /**
   * Skip whitespace characters until we hit non-whitespace or endPos
   */
  function skipWhitespaceUntil(start: number, endPos: number): number {
    let pos = start;
    while (pos < endPos && isWhiteSpaceSingleLine(source.charCodeAt(pos))) {
      pos++;
    }
    return pos;
  }

  /**
   * Phase 0.2: Cross-Line Integration
   * Determines if a StringLiteral should continue to the next line
   */
  function shouldContinueStringLiteral(lineFlags: LineClassification): boolean {
    // Terminate on blank lines
    if (lineFlags & LineClassification.BLANK_LINE) return false;

    // Terminate on structural block elements
    if (lineFlags & (
      LineClassification.ATX_HEADING |
      LineClassification.THEMATIC_BREAK |
      LineClassification.FENCED_CODE_OPEN |
      LineClassification.BLOCKQUOTE_MARKER |
      LineClassification.LIST_UNORDERED_MARKER |
      LineClassification.LIST_ORDERED_MARKER |
      LineClassification.INDENTED_CODE
    )) return false;

    // Continue on paragraph-like content
    if (lineFlags & LineClassification.PARAGRAPH_PLAIN) return true;

    // Default: terminate (conservative)
    return false;
  }

  /**
   * Emit accumulated cross-line StringLiteral token
   */
  function emitAccumulatedStringLiteral(): void {
    if (pendingStringStart < 0 || spanCount === 0) return;

    // Compute end position from last span so we advance the scanner correctly
    const lastSpanIndex = spanCount - 1;
    const lastSpanStart = spanBuffer[lastSpanIndex * 2];
    const lastSpanLen = spanBuffer[lastSpanIndex * 2 + 1];
    const endPos = lastSpanStart + lastSpanLen;

    token = SyntaxKind.StringLiteral;
    tokenText = materializePendingString(); // Unified materialization for both cases
    tokenFlags = pendingStringFlags;
    offsetNext = endPos; // Token ends at end of accumulated spans

    // Add context-based flags from when the token was started
    if (pendingStringFlags & TokenFlags.PrecedingLineBreak) {
      tokenFlags |= TokenFlags.PrecedingLineBreak;
    }
    if (pendingStringFlags & TokenFlags.IsAtLineStart) {
      tokenFlags |= TokenFlags.IsAtLineStart;
    }

    // Update position tracking to the end of the accumulated spans
    updatePosition(endPos);
    pos = endPos;

    // Update paragraph state
    if (tokenText.length > 0) {
      contextFlags |= ContextFlags.InParagraph;
    }

    // Clear pending state after emission
    clearPendingString();
  }

  /**
   * Legacy function maintained for backward compatibility during transition
   */
  function processStringToken(start: number, endPos: number): string {
    // Fast path for very short strings (single-char only). Keep two-char runs
    // going through the normal normalization path so that two-space runs get
    // collapsed to a single space as expected by tests.
    const length = endPos - start;
    if (length <= 1) {
      return source.substring(start, endPos);
    }

    // First pass - check if normalization is needed at all
    let needsNormalization = false;
    let hasTrailingSpace = false;

    // If the substring contains only spaces/tabs, either preserve or normalize
    let onlyWhitespace = true;
    for (let i = start; i < endPos; i++) {
      const ch = source.charCodeAt(i);
      if (ch !== CharacterCodes.space && ch !== CharacterCodes.tab) {
        onlyWhitespace = false;
        break;
      }
    }
    if (onlyWhitespace) {
      // Normalize any whitespace-only run to a single space for consistent
      // inline formatting behavior. Do not return an empty string for
      // whitespace-only inputs.
      return ' ';
    }

    for (let i = start; i < endPos; i++) {
      const ch = source.charCodeAt(i);
      if (ch === CharacterCodes.tab) {
        needsNormalization = true;
        break;
      }
      if (ch === CharacterCodes.space) {
        // Check for multiple consecutive spaces
        if (i + 1 < endPos && source.charCodeAt(i + 1) === CharacterCodes.space) {
          needsNormalization = true;
          break;
        }
        // Check for trailing space
        if (i === endPos - 1) {
          hasTrailingSpace = true;
        }
      }
    }

    // If no normalization needed and no trailing space, return clean substring
    if (!needsNormalization && !hasTrailingSpace) {
      return source.substring(start, endPos);
    }

    // If only trailing space needs to be handled, preserve it for inline content 
    if (!needsNormalization && hasTrailingSpace) {
      return source.substring(start, endPos); // Keep the trailing space
    }

    // Need normalization - build result with array
    let result: string[] = [];
    let lastCleanStart = start;
    let inSpaceRun = false;

    for (let i = start; i < endPos; i++) {
      const ch = source.charCodeAt(i);

      if (ch === CharacterCodes.tab || (ch === CharacterCodes.space && inSpaceRun)) {
        // Need to normalize - flush clean content up to this point
        if (i > lastCleanStart) {
          result.push(source.substring(lastCleanStart, i));
        }

        // Add single space if not already in a space run
        if (!inSpaceRun) {
          result.push(' ');
          inSpaceRun = true;
        }

        // Mark next clean start after this character
        lastCleanStart = i + 1;
      } else if (ch === CharacterCodes.space) {
        // Single space - mark that we're in a space run but don't process yet
        inSpaceRun = true;
      } else {
        // Regular character - if we were in a space run, it's over
        if (inSpaceRun) {
          // Include the space(s) in the clean span
          inSpaceRun = false;
        }
      }
    }

    // Add any remaining clean content
    if (lastCleanStart < endPos) {
      result.push(source.substring(lastCleanStart, endPos));
    }

    // Join result and build final normalized string
    const joined = result.join('');

    // If the original substring was only whitespace we returned early above.
    // For normalized inline content, trim by default but preserve a single
    // leading/trailing space when the original text had whitespace that
    // bordered a neighboring non-whitespace token. This keeps separation
    // between adjacent elements (e.g. emphasis tokens and text).

    // Detect original leading/trailing whitespace in the raw slice
    const originalHasLeadingWhitespace = start < endPos &&
      (source.charCodeAt(start) === CharacterCodes.space || source.charCodeAt(start) === CharacterCodes.tab);
    const originalHasTrailingWhitespace = endPos - 1 >= start &&
      (source.charCodeAt(endPos - 1) === CharacterCodes.space || source.charCodeAt(endPos - 1) === CharacterCodes.tab);

    let preserveLeft = false;
    let preserveRight = false;

    // Preserve left whitespace only when there's a non-whitespace character immediately before
    if (originalHasLeadingWhitespace && start > 0) {
      const prev = source.charCodeAt(start - 1);
      if (!isWhiteSpaceSingleLine(prev) && !isLineBreak(prev)) {
        preserveLeft = true;
      }
    }

    // Preserve right whitespace only when there's a non-whitespace character immediately after
    if (originalHasTrailingWhitespace && endPos < end) {
      const next = source.charCodeAt(endPos);
      if (!isWhiteSpaceSingleLine(next) && !isLineBreak(next)) {
        preserveRight = true;
      }
    }

    // Default normalized content (trimmed)
    let normalized = joined.trim();

    if (preserveLeft) normalized = ' ' + normalized;
    if (preserveRight) normalized = normalized + ' ';

    return normalized;
  }

  /**
   * Token emission functions
   */

  function emitToken(kind: SyntaxKind, start: number, endPos: number, flags: TokenFlags = TokenFlags.None): void {
    token = kind;

    // Use cached text for common fixed tokens to avoid substring allocation
    const length = endPos - start;
    if (length === 1) {
      const ch = source.charCodeAt(start);
      switch (ch) {
        case CharacterCodes.asterisk:
          tokenText = TokenTextCache.SINGLE_ASTERISK;
          break;
        case CharacterCodes.underscore:
          tokenText = TokenTextCache.SINGLE_UNDERSCORE;
          break;
        case CharacterCodes.backtick:
          tokenText = TokenTextCache.SINGLE_BACKTICK;
          break;
        case CharacterCodes.space:
          tokenText = TokenTextCache.SPACE;
          break;
        case CharacterCodes.tab:
          tokenText = TokenTextCache.TAB;
          break;
        case CharacterCodes.lineFeed:
          tokenText = TokenTextCache.NEWLINE_LF;
          break;
        case CharacterCodes.lessThan:
          tokenText = TokenTextCache.LESS_THAN;
          break;
        case CharacterCodes.greaterThan:
          tokenText = TokenTextCache.GREATER_THAN;
          break;
        case CharacterCodes.ampersand:
          tokenText = TokenTextCache.AMPERSAND;
          break;
        case CharacterCodes.equals:
          tokenText = TokenTextCache.EQUALS;
          break;
        default:
          tokenText = source.substring(start, endPos);
          break;
      }
    } else if (length === 2) {
      // Check for common 2-character tokens
      if (kind === SyntaxKind.TildeTilde) {
        tokenText = TokenTextCache.TILDE_TILDE;
      } else if (kind === SyntaxKind.AsteriskAsterisk) {
        tokenText = TokenTextCache.ASTERISK_ASTERISK;
      } else if (kind === SyntaxKind.UnderscoreUnderscore) {
        tokenText = TokenTextCache.UNDERSCORE_UNDERSCORE;
      } else if (kind === SyntaxKind.SlashGreaterThanToken) {
        tokenText = TokenTextCache.SLASH_GREATER_THAN;
      } else if (start + 1 < source.length &&
        source.charCodeAt(start) === CharacterCodes.carriageReturn &&
        source.charCodeAt(start + 1) === CharacterCodes.lineFeed) {
        tokenText = TokenTextCache.NEWLINE_CRLF;
      } else {
        tokenText = source.substring(start, endPos);
      }
    } else {
      tokenText = source.substring(start, endPos);
    }

    tokenFlags = flags;
    offsetNext = endPos;

    // Add context-based flags
    if (contextFlags & ContextFlags.PrecedingLineBreak) {
      tokenFlags |= TokenFlags.PrecedingLineBreak;
    }
    if (contextFlags & ContextFlags.AtLineStart) {
      tokenFlags |= TokenFlags.IsAtLineStart;
    }

    // Update position tracking
    updatePosition(endPos);

    // Reset preceding line break flag after first token
    contextFlags &= ~ContextFlags.PrecedingLineBreak;
  }

  // Emit HtmlAttributeValue with special tokenText semantics: span covers raw (including quotes),
  // but tokenText is the logical decoded value per spec (quote removal, entity + percent decoding,
  // whitespace normalization for unquoted, and newline normalization for quoted).
  function emitAttributeValueToken(spanStart: number, spanEnd: number, isQuoted: boolean, flags: TokenFlags = TokenFlags.None): void {
    token = SyntaxKind.HtmlAttributeValue;

    // Compute inner raw slice (without surrounding quotes when available)
    let innerStart = spanStart;
    let innerEnd = spanEnd;
    if (isQuoted) {
      // If properly terminated quoted value, source at spanStart is quote and spanEnd-1 is same quote.
      const quoteCh = source.charCodeAt(spanStart);
      const hasClosing = (spanEnd > spanStart + 1) && source.charCodeAt(spanEnd - 1) === quoteCh && (flags & TokenFlags.Unterminated) === 0;
      innerStart = spanStart + 1;
      innerEnd = hasClosing ? spanEnd - 1 : spanEnd; // Unterminated doesn't have a closing quote
    }

    // Optimized: decode directly from source span without intermediate string allocation
    tokenText = decodeAttributeLogicalValueFromSpan(innerStart, innerEnd, isQuoted);
    tokenFlags = flags;
    offsetNext = spanEnd;

    if (contextFlags & ContextFlags.PrecedingLineBreak) tokenFlags |= TokenFlags.PrecedingLineBreak;
    if (contextFlags & ContextFlags.AtLineStart) tokenFlags |= TokenFlags.IsAtLineStart;

    updatePosition(spanEnd);
    contextFlags &= ~ContextFlags.PrecedingLineBreak;
  }

  // Optimized version that works directly on source span using run-based slicing
  function decodeAttributeLogicalValueFromSpan(start: number, end: number, quoted: boolean): string {
    if (start >= end) return '';

    // Single-pass processing with run collection for optimal performance
    let result = '';
    let i = start;
    let runStart = start; // Start of current normal character run

    while (i < end) {
      const ch = source.charCodeAt(i);

      if (ch === CharacterCodes.ampersand) {
        // Slice any accumulated normal run before processing entity
        if (runStart < i) {
          result += source.substring(runStart, i);
        }

        // Try entity decoding
        const entityResult = tryDecodeEntityFromSpan(i, end);
        if (entityResult) {
          result += entityResult.value;
          i = entityResult.next;
        } else {
          // Not a valid entity -> keep literal '&'
          result += '&';
          i++;
        }
        runStart = i; // Reset run start after special processing
        continue;
      }

      if (ch === CharacterCodes.percent) {
        // Slice any accumulated normal run before processing percent encoding
        if (runStart < i) {
          result += source.substring(runStart, i);
        }

        // Percent-decoding: %HH
        if (i + 2 < end) {
          const h1 = source.charCodeAt(i + 1);
          const h2 = source.charCodeAt(i + 2);
          if (isHexDigit(h1) && isHexDigit(h2)) {
            // Parse hex directly without substring
            const code = (h1 >= CharacterCodes._0 && h1 <= CharacterCodes._9 ? h1 - CharacterCodes._0 :
              h1 >= CharacterCodes.A && h1 <= CharacterCodes.F ? h1 - CharacterCodes.A + 10 :
                h1 - CharacterCodes.a + 10) * 16 +
              (h2 >= CharacterCodes._0 && h2 <= CharacterCodes._9 ? h2 - CharacterCodes._0 :
                h2 >= CharacterCodes.A && h2 <= CharacterCodes.F ? h2 - CharacterCodes.A + 10 :
                  h2 - CharacterCodes.a + 10);
            result += String.fromCharCode(code);
            i += 3;
          } else {
            // Invalid percent sequence -> keep '%'
            result += '%';
            i++;
          }
        } else {
          // Invalid percent sequence -> keep '%'
          result += '%';
          i++;
        }
        runStart = i; // Reset run start after special processing
        continue;
      }

      // Handle whitespace normalization for unquoted values
      if (!quoted && (ch === CharacterCodes.tab || ch === CharacterCodes.space)) {
        // Slice any accumulated normal run before processing whitespace
        if (runStart < i) {
          result += source.substring(runStart, i);
        }

        // Collapse whitespace: skip consecutive whitespace and add single space
        result += ' ';
        i++;
        while (i < end) {
          const nextCh = source.charCodeAt(i);
          if (nextCh === CharacterCodes.tab || nextCh === CharacterCodes.space) {
            i++;
          } else {
            break;
          }
        }
        runStart = i; // Reset run start after whitespace processing
        continue;
      }

      // Handle newline normalization for quoted values
      if (quoted && ch === CharacterCodes.carriageReturn) {
        // Slice any accumulated normal run before processing newline
        if (runStart < i) {
          result += source.substring(runStart, i);
        }

        // CR or CRLF -> LF
        result += '\n';
        i++;
        if (i < end && source.charCodeAt(i) === CharacterCodes.lineFeed) {
          i++; // Skip LF in CRLF
        }
        runStart = i; // Reset run start after newline processing
        continue;
      }

      if (quoted && ch === CharacterCodes.lineFeed) {
        // Slice any accumulated normal run before processing newline
        if (runStart < i) {
          result += source.substring(runStart, i);
        }

        result += '\n';
        i++;
        runStart = i; // Reset run start after newline processing
        continue;
      }

      // Regular character - just advance, will be included in the next run slice
      i++;
    }

    // Slice any remaining normal run at the end
    if (runStart < i) {
      result += source.substring(runStart, i);
    }

    // Final trimming for unquoted values
    if (!quoted) {
      result = result.trim();
    }

    return result;
  }

  function tryDecodeEntity(text: string, startIndex: number): { value: string, next: number } | null {
    const len = text.length;
    let i = startIndex + 1; // after '&'
    if (i >= len) return null;

    if (text.charCodeAt(i) === CharacterCodes.hash) {
      // Numeric: decimal or hex
      i++;
      let isHexNum = false;
      if (i < len && (text.charCodeAt(i) === CharacterCodes.x || text.charCodeAt(i) === CharacterCodes.X)) {
        isHexNum = true; i++;
      }
      const digitsStart = i;
      while (i < len) {
        const c = text.charCodeAt(i);
        if (isHexNum ? isHexDigit(c) : isDigit(c)) i++; else break;
      }
      if (i === digitsStart) return null; // no digits
      if (i >= len || text.charCodeAt(i) !== CharacterCodes.semicolon) return null; // require ';'
      const digits = text.substring(digitsStart, i);
      i++; // consume ';'

      // Parse the numeric value directly without substring
      let codePoint = 0;
      if (isHexNum) {
        for (let j = digitsStart; j < i - 1; j++) {
          const c = text.charCodeAt(j);
          codePoint = codePoint * 16 + (
            c >= CharacterCodes._0 && c <= CharacterCodes._9 ? c - CharacterCodes._0 :
              c >= CharacterCodes.A && c <= CharacterCodes.F ? c - CharacterCodes.A + 10 :
                c - CharacterCodes.a + 10
          );
        }
      } else {
        for (let j = digitsStart; j < i - 1; j++) {
          codePoint = codePoint * 10 + (text.charCodeAt(j) - CharacterCodes._0);
        }
      }
      if (!Number.isFinite(codePoint)) return null;
      try {
        return { value: String.fromCodePoint(codePoint), next: i };
      } catch {
        return null; // invalid cp -> literal
      }
    } else {
      // Named entity: [a-z]+;
      const nameStart = i;
      while (i < len) {
        const c = text.charCodeAt(i);
        if ((c >= CharacterCodes.a && c <= CharacterCodes.z) || (c >= CharacterCodes.A && c <= CharacterCodes.Z)) i++; else break;
        if (i - nameStart > 32) break; // soft cap
      }
      if (i === nameStart) return null;
      if (i >= len || text.charCodeAt(i) !== CharacterCodes.semicolon) return null;

      // Use span-based comparison instead of substring
      const value = decodeNamedEntityFromSpan(text, nameStart, i);
      if (value == null) return null; // unknown -> literal
      i++;
      return { value, next: i };
    }
  }

  // Optimized version that works directly on source span
  function tryDecodeEntityFromSpan(startIndex: number, endIndex: number): { value: string, next: number } | null {
    let i = startIndex + 1; // after '&'
    if (i >= endIndex) return null;

    if (source.charCodeAt(i) === CharacterCodes.hash) {
      // Numeric: decimal or hex
      i++;
      let isHexNum = false;
      if (i < endIndex && (source.charCodeAt(i) === CharacterCodes.x || source.charCodeAt(i) === CharacterCodes.X)) {
        isHexNum = true; i++;
      }
      const digitsStart = i;
      while (i < endIndex) {
        const c = source.charCodeAt(i);
        if (isHexNum ? isHexDigit(c) : isDigit(c)) i++; else break;
      }
      if (i === digitsStart) return null; // no digits
      if (i >= endIndex || source.charCodeAt(i) !== CharacterCodes.semicolon) return null; // require ';'

      // Parse the numeric value directly without substring
      let codePoint = 0;
      if (isHexNum) {
        for (let j = digitsStart; j < i; j++) {
          const c = source.charCodeAt(j);
          codePoint = codePoint * 16 + (
            c >= CharacterCodes._0 && c <= CharacterCodes._9 ? c - CharacterCodes._0 :
              c >= CharacterCodes.A && c <= CharacterCodes.F ? c - CharacterCodes.A + 10 :
                c - CharacterCodes.a + 10
          );
        }
      } else {
        for (let j = digitsStart; j < i; j++) {
          codePoint = codePoint * 10 + (source.charCodeAt(j) - CharacterCodes._0);
        }
      }

      i++; // consume ';'
      if (!Number.isFinite(codePoint)) return null;
      try {
        return { value: String.fromCharCode(codePoint), next: i };
      } catch {
        return { value: '\uFFFD', next: i }; // replacement character
      }
    } else {
      // Named entity
      const nameStart = i;
      while (i < endIndex && i - nameStart < 32) { // Max length 32
        const ch = source.charCodeAt(i);
        if (isLetter(ch)) {
          i++;
        } else {
          break;
        }
      }

      if (i === nameStart || i >= endIndex || source.charCodeAt(i) !== CharacterCodes.semicolon) {
        return null;
      }

      // Check if it's a known entity by comparing spans directly
      const decoded = decodeNamedEntityFromSourceSpan(nameStart, i);
      if (decoded !== null) {
        return { value: decoded, next: i + 1 }; // +1 for semicolon
      }

      return null;
    }
  }

  function decodeNamedEntity(name: string): string | null {
    switch (name) {
      case 'amp': return '&';
      case 'lt': return '<';
      case 'gt': return '>';
      case 'quot': return '"';
      case 'apos': return "'";
      case 'nbsp': return '\u00A0';
      default: return null;
    }
  }

  // Optimized version that works on text span without substring
  function decodeNamedEntityFromSpan(text: string, start: number, end: number): string | null {
    const length = end - start;

    // Check each known entity by length and character comparison
    switch (length) {
      case 2: // 'lt', 'gt'
        if (text.charCodeAt(start) === CharacterCodes.l && text.charCodeAt(start + 1) === CharacterCodes.t) return '<';
        if (text.charCodeAt(start) === CharacterCodes.g && text.charCodeAt(start + 1) === CharacterCodes.t) return '>';
        return null;

      case 3: // 'amp'
        if (text.charCodeAt(start) === CharacterCodes.a &&
          text.charCodeAt(start + 1) === CharacterCodes.m &&
          text.charCodeAt(start + 2) === CharacterCodes.p) return '&';
        return null;

      case 4: // 'quot', 'apos', 'nbsp'
        if (text.charCodeAt(start) === CharacterCodes.q &&
          text.charCodeAt(start + 1) === CharacterCodes.u &&
          text.charCodeAt(start + 2) === CharacterCodes.o &&
          text.charCodeAt(start + 3) === CharacterCodes.t) return '"';

        if (text.charCodeAt(start) === CharacterCodes.a &&
          text.charCodeAt(start + 1) === CharacterCodes.p &&
          text.charCodeAt(start + 2) === CharacterCodes.o &&
          text.charCodeAt(start + 3) === CharacterCodes.s) return "'";

        if (text.charCodeAt(start) === CharacterCodes.n &&
          text.charCodeAt(start + 1) === CharacterCodes.b &&
          text.charCodeAt(start + 2) === CharacterCodes.s &&
          text.charCodeAt(start + 3) === CharacterCodes.p) return '\u00A0';

        return null;

      default:
        return null;
    }
  }

  // Helper function for source span entity decoding  
  function decodeNamedEntityFromSourceSpan(start: number, end: number): string | null {
    const length = end - start;

    // Check each known entity by length and character comparison
    switch (length) {
      case 2: // 'lt', 'gt'
        if (source.charCodeAt(start) === CharacterCodes.l && source.charCodeAt(start + 1) === CharacterCodes.t) return '<';
        if (source.charCodeAt(start) === CharacterCodes.g && source.charCodeAt(start + 1) === CharacterCodes.t) return '>';
        return null;

      case 3: // 'amp'
        if (source.charCodeAt(start) === CharacterCodes.a &&
          source.charCodeAt(start + 1) === CharacterCodes.m &&
          source.charCodeAt(start + 2) === CharacterCodes.p) return '&';
        return null;

      case 4: // 'quot', 'apos', 'nbsp'
        if (source.charCodeAt(start) === CharacterCodes.q &&
          source.charCodeAt(start + 1) === CharacterCodes.u &&
          source.charCodeAt(start + 2) === CharacterCodes.o &&
          source.charCodeAt(start + 3) === CharacterCodes.t) return '"';

        if (source.charCodeAt(start) === CharacterCodes.a &&
          source.charCodeAt(start + 1) === CharacterCodes.p &&
          source.charCodeAt(start + 2) === CharacterCodes.o &&
          source.charCodeAt(start + 3) === CharacterCodes.s) return "'";

        if (source.charCodeAt(start) === CharacterCodes.n &&
          source.charCodeAt(start + 1) === CharacterCodes.b &&
          source.charCodeAt(start + 2) === CharacterCodes.s &&
          source.charCodeAt(start + 3) === CharacterCodes.p) return '\u00A0';

        return null;

      default:
        return null;
    }
  }

  function emitStringLiteralToken(start: number, endPos: number, flags: TokenFlags = TokenFlags.None): void {
    token = SyntaxKind.StringLiteral;

    // Use unified span buffer approach for string processing to handle cross-line literals
    tokenText = processStringTokenWithSpans(start, endPos);

    tokenFlags = flags;
    offsetNext = endPos;

    // Add context-based flags
    if (contextFlags & ContextFlags.PrecedingLineBreak) {
      tokenFlags |= TokenFlags.PrecedingLineBreak;
    }
    if (contextFlags & ContextFlags.AtLineStart) {
      tokenFlags |= TokenFlags.IsAtLineStart;
    }

    // Update position tracking
    updatePosition(endPos);

    // Reset preceding line break flag after first token
    contextFlags &= ~ContextFlags.PrecedingLineBreak;

    // Update paragraph state
    if (tokenText.length > 0) {
      contextFlags |= ContextFlags.InParagraph;
    }
  }

  /**
   * Stage 3: Inline formatting scanner functions
   */

  function scanAsterisk(start: number): void {
    // Count consecutive asterisks from current position
    let runEnd = start;
    while (runEnd < end && source.charCodeAt(runEnd) === CharacterCodes.asterisk) {
      runEnd++;
    }

    const runLength = runEnd - start;
    let tokenType: SyntaxKind;
    let flags = TokenFlags.None;

    // For runs of 2 or more, emit double asterisk token
    if (runLength >= 2) {
      tokenType = SyntaxKind.AsteriskAsterisk;
      // Consume only 2 characters for double asterisk
      runEnd = start + 2;
    } else {
      tokenType = SyntaxKind.AsteriskToken;
      // Single asterisk - runEnd is already start + 1
    }

    // Apply flanking rules for CanOpen/CanClose flags
    flags |= computeFlankingFlags(start, runEnd, CharacterCodes.asterisk);

    emitToken(tokenType, start, runEnd, flags);
  }

  function scanUnderscore(start: number): void {
    // Count consecutive underscores from current position
    let runEnd = start;
    while (runEnd < end && source.charCodeAt(runEnd) === CharacterCodes.underscore) {
      runEnd++;
    }

    const runLength = runEnd - start;
    let tokenType: SyntaxKind;
    let flags = TokenFlags.None;

    // For runs of 2 or more, emit double underscore token
    if (runLength >= 2) {
      tokenType = SyntaxKind.UnderscoreUnderscore;
      // Consume only 2 characters for double underscore
      runEnd = start + 2;
    } else {
      tokenType = SyntaxKind.UnderscoreToken;
      // Single underscore - runEnd is already start + 1
    }

    // Apply flanking rules for CanOpen/CanClose flags
    flags |= computeFlankingFlags(start, runEnd, CharacterCodes.underscore);

    emitToken(tokenType, start, runEnd, flags);
  }

  function scanBacktick(start: number): void {
    let runEnd = start;

    // Count consecutive backticks
    while (runEnd < end && source.charCodeAt(runEnd) === CharacterCodes.backtick) {
      runEnd++;
    }

    const runLength = runEnd - start;
    let flags = TokenFlags.None;

    // For runs of 2 or more backticks, emit InlineCodeDelimiter  
    if (runLength >= 2) {
      emitToken(SyntaxKind.InlineCodeDelimiter, start, runEnd, flags);
    } else {
      // Single backtick - emit BacktickToken
      emitToken(SyntaxKind.BacktickToken, start, runEnd, flags);
    }
  }

  function scanTilde(start: number): void {
    // This should only be called for double tildes now, since emitTextRun handles single tildes
    // Double check that we have at least 2 tildes
    if (start + 1 < end && source.charCodeAt(start + 1) === CharacterCodes.tilde) {
      // This is a double tilde - emit TildeTilde token
      emitToken(SyntaxKind.TildeTilde, start, start + 2, TokenFlags.None);
    } else {
      // This shouldn't happen now, but fallback to text
      emitTextRun(start);
    }
  }

  function scanDollar(start: number): void {
    // Check for double dollar (block math)
    if (start + 1 < end && source.charCodeAt(start + 1) === CharacterCodes.dollar) {
      // Count consecutive dollars to handle edge cases like $$$
      let dollarCount = 0;
      let i = start;
      while (i < end && source.charCodeAt(i) === CharacterCodes.dollar) {
        dollarCount++;
        i++;
      }

      // If exactly 2 dollars, emit block math delimiter
      if (dollarCount === 2) {
        emitToken(SyntaxKind.MathBlockDelimiter, start, start + 2, TokenFlags.None);
      } else {
        // Wrong number of dollars (3+), emit as text (this should rarely happen due to canDollarBeDelimiter check)
        emitStringLiteralToken(start, start + dollarCount, TokenFlags.None);
      }
    } else {
      // Single dollar - emit inline math delimiter
      emitToken(SyntaxKind.MathInlineDelimiter, start, start + 1, TokenFlags.None);
    }
  }



  /**
   * Stage 4: HTML scanning functions
   */

  function scanLessThan(start: number): void {
    // Minimal lookahead via direct charCode reads (no substring allocation)
    const c1 = start + 1 < end ? source.charCodeAt(start + 1) : -1;

    if (c1 === CharacterCodes.slash) {
      // Closing tag start - emit close-name token with name-only span when possible
      if (scanHtmlTagStart(start)) return;
      // Fallback to emitting the raw text as a StringLiteral for malformed starts
      emitStringLiteralToken(start, Math.min(start + 2, end), TokenFlags.None);
      return;
    }

    // Detect comment start <!--
    if (c1 === CharacterCodes.exclamation && matchSequence(start, '<!--')) {
      scanHtmlComment(start);
      return;
    }

    // Detect CDATA <![CDATA[
    if (c1 === CharacterCodes.exclamation && matchSequence(start, '<![CDATA[')) {
      scanHtmlCdata(start);
      return;
    }

    // Detect DOCTYPE <!DOCTYPE (case insensitive)
    if (c1 === CharacterCodes.exclamation && matchSequenceCaseInsensitive(start, '<!DOCTYPE')) {
      scanHtmlDoctype(start);
      return;
    }

    // Detect processing instruction <? ... ?>
    if (c1 === CharacterCodes.question) {
      scanHtmlProcessingInstruction(start);
      return;
    }

    // Check if this could be a tag name after <
    if (c1 >= 0 && isLetter(c1)) {
      // Opening tag start - emit open-name token with name-only span when possible
      if (scanHtmlTagStart(start)) {
        // If we just emitted an open-name, enter in-tag scanning mode so the
        // next scan() invocation will emit the first attribute or the closing
        // '>' or '/>' token. We must NOT emit multiple tokens from a single
        // scan() call because the public scanner API expects exactly one
        // token per scan() invocation.
        if (token === SyntaxKind.HtmlTagOpenName || token === SyntaxKind.HtmlTagCloseName) {
          inTagScanning = true;
          tagScanEnd = pos; // pos was advanced to just after the name
          // Compute the next non-whitespace offset so the internal cursor is positioned
          // at the first attribute/terminator character. Also advance offsetNext so the
          // previous token's end covers the intra-tag whitespace as tests expect.
          let next = pos;
          while (next < end && isWhiteSpaceSingleLine(source.charCodeAt(next))) next++;
          pos = next;
          offsetNext = next; // shift the externally observed next-start to first attr/terminator
        }
        return;
      }

      // Fallback: emit the raw '<' as text for malformed starts
      emitStringLiteralToken(start, Math.min(start + 1, end), TokenFlags.None);
      return;
    }

    // Regular '<' for anything else (including malformed tags like <1bad>) - emit as text
    emitStringLiteralToken(start, Math.min(start + 1, end), TokenFlags.None);
  }

  function scanGreaterThan(start: number): void {
    // Check if this might be part of />
    if (start > 0 && source.charCodeAt(start - 1) === CharacterCodes.slash) {
      // This is part of /> which should be handled as SlashGreaterThanToken
      // But we need to be in the right context - for now, just emit regular >
      emitToken(SyntaxKind.GreaterThanToken, start, start + 1);
    } else {
      emitToken(SyntaxKind.GreaterThanToken, start, start + 1);
    }
  }

  function scanAmpersand(start: number): void {
    // Named or numeric entities MUST terminate with ';' to be recognized.
    // Strategy: probe character-by-character without substring allocation.
    const after = start + 1;
    if (after < end && source.charCodeAt(after) === CharacterCodes.hash) {
      if (scanNumericEntity(start)) return; // Emits HtmlEntity or falls through
    } else if (scanNamedEntity(start)) {
      return; // Emits HtmlEntity
    }
    emitToken(SyntaxKind.AmpersandToken, start, start + 1); // Bare '&'
  }

  function scanEquals(start: number): void {
    emitToken(SyntaxKind.EqualsToken, start, start + 1);
  }

  function scanHtmlTagName(start: number): boolean {
    let nameEnd = start;

    // Tag name start: [A-Za-z]
    if (nameEnd >= end) return false;
    const firstChar = source.charCodeAt(nameEnd);
    if (!isLetter(firstChar)) return false;

    nameEnd++;

    // Continue: [A-Za-z0-9-]*
    while (nameEnd < end) {
      const ch = source.charCodeAt(nameEnd);
      if (isLetter(ch) || isDigit(ch) || ch === CharacterCodes.minus) {
        nameEnd++;
      } else {
        break;
      }
    }

    if (nameEnd > start) {
      // Determine if this name was preceded by '<' or '</' to choose open/close name token
      let sawSlash = false;
      if (start > 0 && source.charCodeAt(start - 1) === CharacterCodes.slash) {
        // If immediately preceded by '/', consider it a close name
        sawSlash = true;
      } else if (start > 1 && source.charCodeAt(start - 2) === CharacterCodes.lessThan && source.charCodeAt(start - 1) === CharacterCodes.slash) {
        sawSlash = true;
      }

      if (sawSlash) {
        emitToken(SyntaxKind.HtmlTagCloseName, start, nameEnd);
      } else {
        emitToken(SyntaxKind.HtmlTagOpenName, start, nameEnd);
      }
      return true;
    }

    return false;
  }

  /**
   * Attempt to scan a combined tag start token: '<name' or '</name'.
   * Emits a single HtmlTagName token spanning from the '<' (or '</') through the tag name.
   * Returns true if a combined token was emitted.
   */
  function scanHtmlTagStart(start: number): boolean {
    // start points at '<'
    if (start >= end || source.charCodeAt(start) !== CharacterCodes.lessThan) return false;

    let i = start + 1;
    let sawSlash = false;
    if (i < end && source.charCodeAt(i) === CharacterCodes.slash) {
      sawSlash = true;
      i++;
    }

    if (i >= end) return false;

    const firstChar = source.charCodeAt(i);
    if (!isLetter(firstChar)) return false;

    // Scan tag name characters [A-Za-z0-9-]*
    let nameEnd = i + 1;
    while (nameEnd < end) {
      const ch = source.charCodeAt(nameEnd);
      if (isLetter(ch) || isDigit(ch) || ch === CharacterCodes.minus) {
        nameEnd++;
      } else {
        break;
      }
    }

    if (nameEnd > i) {
      // Emit a coarsened token that contains only the tag name text (callers only need the name).
      const nameStart = i;
      const nameEndPos = nameEnd; // do not include following whitespace/attributes or angle brackets
      if (sawSlash) {
        // Emit close-name token but only the name slice
        emitToken(SyntaxKind.HtmlTagCloseName, nameStart, nameEndPos);
      } else {
        // Emit open-name token but only the name slice
        emitToken(SyntaxKind.HtmlTagOpenName, nameStart, nameEndPos);
      }

      // Advance scanner position to the end of the name so subsequent attribute
      // scanning can proceed from the correct location.
      updatePosition(nameEndPos);
      pos = nameEndPos;
      return true;
    }

    return false;
  }

  function scanNumericEntity(start: number): boolean {
    // Expect patterns: "&#<digits>;" or "&#x<hex>;"
    if (!matchSequence(start, '&#')) return false;

    let pos = start + 2;
    if (pos >= end) return false;

    let isHex = false;
    if (source.charCodeAt(pos) === CharacterCodes.x || source.charCodeAt(pos) === CharacterCodes.X) {
      isHex = true;
      pos++;
    }

    const digitStart = pos;

    // Scan digits
    while (pos < end) {
      const ch = source.charCodeAt(pos);
      if (isHex ? isHexDigit(ch) : isDigit(ch)) {
        pos++;
      } else {
        break;
      }
    }

    // Must have at least one digit and end with semicolon
    if (pos === digitStart || pos >= end || source.charCodeAt(pos) !== CharacterCodes.semicolon) {
      return false;
    }

    // Digit length cap: 8
    if (pos - digitStart > 8) {
      return false;
    }

    emitToken(SyntaxKind.HtmlEntity, start, pos + 1);
    return true;
  }

  /**
   * Scan HTML attributes starting at `pos` (position after the tag-name).
   * Emits HtmlAttributeName and HtmlAttributeValue tokens and consumes
   * the terminating '>' or '/>' if present.
   */
  function scanHtmlAttributes(afterNamePos: number): void {
    let p = afterNamePos;

    // Loop scanning attributes until we hit '>' or '/>' or newline/EOF
    while (p < end) {
      // Skip whitespace between attributes
      while (p < end && isWhiteSpaceSingleLine(source.charCodeAt(p))) p++;

      if (p >= end) break;

      const ch = source.charCodeAt(p);

      // End of tag
      if (ch === CharacterCodes.greaterThan) {
        emitToken(SyntaxKind.GreaterThanToken, p, p + 1);
        p++;
        break;
      }

      // Self-closing '/>'
      if (ch === CharacterCodes.slash && p + 1 < end && source.charCodeAt(p + 1) === CharacterCodes.greaterThan) {
        emitToken(SyntaxKind.SlashGreaterThanToken, p, p + 2);
        p += 2;
        break;
      }

      // Attribute name start
      if (isAttributeNameCharacter(ch)) {
        const nameStart = p;
        p++;
        while (p < end && isAttributeNameCharacter(source.charCodeAt(p))) p++;
        emitToken(SyntaxKind.HtmlAttributeName, nameStart, p);

        // After name, skip whitespace
        while (p < end && isWhiteSpaceSingleLine(source.charCodeAt(p))) p++;

        // If there's an equals sign, parse a value
        if (p < end && source.charCodeAt(p) === CharacterCodes.equals) {
          // Peek next non-whitespace to decide if this is a malformed a=> case
          let peek = p + 1;
          while (peek < end && isWhiteSpaceSingleLine(source.charCodeAt(peek))) peek++;
          const peekCh = peek < end ? source.charCodeAt(peek) : -1;

          // Malformed: '=' followed immediately by '>' or '/>' or EOF -> do not emit '=' or a value
          if (peekCh === CharacterCodes.greaterThan || (peekCh === CharacterCodes.slash && peek + 1 < end && source.charCodeAt(peek + 1) === CharacterCodes.greaterThan) || peekCh === -1) {
            // Skip the '=' and continue scanning attributes (treat as boolean-like missing value)
            p = peek;
            continue;
          }

          // emit equals as token for parser context
          emitToken(SyntaxKind.EqualsToken, p, p + 1);
          p++;
          while (p < end && isWhiteSpaceSingleLine(source.charCodeAt(p))) p++;

          // Parse attribute value
          if (p < end) {
            const vch = source.charCodeAt(p);
            if (vch === CharacterCodes.doubleQuote || vch === CharacterCodes.singleQuote) {
              // Quoted value
              const quote = vch;
              const valStart = p;
              p++;
              while (p < end && source.charCodeAt(p) !== quote) p++;
              if (p < end && source.charCodeAt(p) === quote) {
                p++; // include closing quote
                emitAttributeValueToken(valStart, p, /*isQuoted*/true);
              } else {
                // Unterminated quoted value: emit as unterminated and stop at EOF or '>'
                let scanTo = p;
                while (scanTo < end && source.charCodeAt(scanTo) !== CharacterCodes.greaterThan) scanTo++;
                emitAttributeValueToken(valStart, scanTo, /*isQuoted*/true, TokenFlags.Unterminated);
                diagnostics.push({ code: Diagnostics.UnterminatedHtmlAttributeValue, start: valStart, length: scanTo - valStart });
                p = scanTo;
              }
            } else {
              // Unquoted value: scan until whitespace or '>' or '/>'
              const valStart = p;
              while (p < end) {
                const c = source.charCodeAt(p);
                if (isWhiteSpaceSingleLine(c) || c === CharacterCodes.greaterThan || (c === CharacterCodes.slash && p + 1 < end && source.charCodeAt(p + 1) === CharacterCodes.greaterThan)) break;
                p++;
              }
              emitAttributeValueToken(valStart, p, /*isQuoted*/false);
            }
          }
          continue;
        }

        // No '=' -> boolean attribute, continue loop
        continue;
      }

      // Unexpected char inside tag - treat as text run and stop attribute scanning
      emitTextRun(p);
      return;
    }

    // Advance main scanner position to p
    updatePosition(p);
    pos = p;
  }

  function scanNamedEntity(start: number): boolean {
    // Scan for named entity pattern: &name;
    if (source.charCodeAt(start) !== CharacterCodes.ampersand) return false;

    let pos = start + 1;
    const nameStart = pos;

    // Scan entity name (letters only for now)
    while (pos < end && pos - nameStart < 32) { // Max length 32
      const ch = source.charCodeAt(pos);
      if (isLetter(ch)) {
        pos++;
      } else {
        break;
      }
    }

    // Must have name and end with semicolon
    if (pos === nameStart || pos >= end || source.charCodeAt(pos) !== CharacterCodes.semicolon) {
      return false;
    }

    // Check if it's a known entity by comparing spans directly
    if (isValidEntityNameFromSpan(nameStart, pos)) {
      emitToken(SyntaxKind.HtmlEntity, start, pos + 1);
      return true;
    }

    return false;
  }

  function scanHtmlComment(start: number): void {
    // Scan HTML comment: <!-- ... -->
    let commentPos = start + 4; // Skip <!--

    while (commentPos <= end - 3) {
      if (source.charCodeAt(commentPos) === CharacterCodes.minus &&
        source.charCodeAt(commentPos + 1) === CharacterCodes.minus &&
        source.charCodeAt(commentPos + 2) === CharacterCodes.greaterThan) {
        // Found end -->
        emitToken(SyntaxKind.HtmlComment, start, commentPos + 3);
        return;
      }
      commentPos++;
    }

    // Unterminated comment - fast-break to first of line break or '<' to limit reparsing
    let fastEnd = end;
    for (let i = start + 1; i < end; i++) {
      const ch = source.charCodeAt(i);
      if (isLineBreak(ch) || ch === CharacterCodes.lessThan) {
        fastEnd = i;
        break;
      }
    }

    emitToken(SyntaxKind.HtmlComment, start, fastEnd, TokenFlags.Unterminated);
  }

  function scanHtmlCdata(start: number): void {
    // Scan CDATA: <![CDATA[ ... ]]>
    let cdataPos = start + 9; // Skip <![CDATA[

    while (cdataPos <= end - 3) {
      if (source.charCodeAt(cdataPos) === CharacterCodes.closeBracket &&
        source.charCodeAt(cdataPos + 1) === CharacterCodes.closeBracket &&
        source.charCodeAt(cdataPos + 2) === CharacterCodes.greaterThan) {
        // Found end ]]>
        emitToken(SyntaxKind.HtmlCdata, start, cdataPos + 3);
        return;
      }
      cdataPos++;
    }

    // Unterminated CDATA - fast-break to first of line break or '<' to limit reparsing
    let fastEnd = end;
    for (let i = start + 1; i < end; i++) {
      const ch = source.charCodeAt(i);
      if (isLineBreak(ch) || ch === CharacterCodes.lessThan) {
        fastEnd = i;
        break;
      }
    }

    emitToken(SyntaxKind.HtmlCdata, start, fastEnd, TokenFlags.Unterminated);
  }

  function scanHtmlProcessingInstruction(start: number): void {
    // Scan PI: <? ... ?>
    let piPos = start + 2; // Skip <?

    while (piPos <= end - 2) {
      if (source.charCodeAt(piPos) === CharacterCodes.question &&
        source.charCodeAt(piPos + 1) === CharacterCodes.greaterThan) {
        // Found end ?>
        emitToken(SyntaxKind.HtmlProcessingInstruction, start, piPos + 2);
        return;
      }
      piPos++;
    }

    // Unterminated PI - fast-break to first of line break or '<' to limit reparsing
    let fastEnd = end;
    for (let i = start + 1; i < end; i++) {
      const ch = source.charCodeAt(i);
      if (isLineBreak(ch) || ch === CharacterCodes.lessThan) {
        fastEnd = i;
        break;
      }
    }

    emitToken(SyntaxKind.HtmlProcessingInstruction, start, fastEnd, TokenFlags.Unterminated);
  }

  function scanHtmlDoctype(start: number): void {
    // Scan DOCTYPE: <!DOCTYPE ... >
    let doctypePos = start + 9; // Skip <!DOCTYPE
    let inQuote: string | null = null;

    while (doctypePos < end) {
      const ch = source.charCodeAt(doctypePos);

      if (inQuote) {
        // Inside quoted string - only exit on matching quote
        if ((inQuote === '"' && ch === CharacterCodes.doubleQuote) ||
          (inQuote === "'" && ch === CharacterCodes.singleQuote)) {
          inQuote = null;
        }
        doctypePos++;
        continue;
      }

      // Not in quote - check for quote start or end
      if (ch === CharacterCodes.doubleQuote) {
        inQuote = '"';
        doctypePos++;
        continue;
      }

      if (ch === CharacterCodes.singleQuote) {
        inQuote = "'";
        doctypePos++;
        continue;
      }

      if (ch === CharacterCodes.greaterThan) {
        // Found closing > outside quotes
        emitToken(SyntaxKind.HtmlDoctype, start, doctypePos + 1);
        return;
      }

      doctypePos++;
    }

    // EOF reached without closing '>' - fast-break to limit reparsing on editor edits.
    // The token should include only from start to the first of: line break or '<' (exclusive).
    // Search should begin after the <!DOCTYPE prefix (doctypePos) to avoid zero-length tokens.
    let fastEnd = end;

    // Find first line break or '<' after the start (skip the initial '<' at `start`)
    for (let i = start + 1; i < end; i++) {
      const ch = source.charCodeAt(i);
      if (isLineBreak(ch) || ch === CharacterCodes.lessThan) {
        fastEnd = i;
        break;
      }
    }

    // If we found a line break, emit up to that point (exclude the break). If none found,
    // fastEnd will be end and we emit to EOF as before.
    emitToken(SyntaxKind.HtmlDoctype, start, fastEnd, TokenFlags.Unterminated);
  }

  // Helper functions
  function matchSequence(pos: number, sequence: string): boolean {
    if (pos + sequence.length > end) return false;
    for (let i = 0; i < sequence.length; i++) {
      if (source.charCodeAt(pos + i) !== sequence.charCodeAt(i)) {
        return false;
      }
    }
    return true;
  }

  function matchSequenceCaseInsensitive(pos: number, sequence: string): boolean {
    if (pos + sequence.length > end) return false;
    for (let i = 0; i < sequence.length; i++) {
      const sourceChar = source.charCodeAt(pos + i);
      const expectedChar = sequence.charCodeAt(i);

      // ASCII case-insensitive comparison
      const sourceLower = (sourceChar >= 65 && sourceChar <= 90) ? sourceChar + 32 : sourceChar;
      const expectedLower = (expectedChar >= 65 && expectedChar <= 90) ? expectedChar + 32 : expectedChar;

      if (sourceLower !== expectedLower) {
        return false;
      }
    }
    return true;
  }

  function isValidEntityName(name: string): boolean {
    // Stage 4 curated set
    const NAMED_ENTITIES = new Set(['amp', 'lt', 'gt', 'quot', 'apos', 'nbsp']);
    return NAMED_ENTITIES.has(name);
  }

  // Optimized version that works directly on source span
  function isValidEntityNameFromSpan(start: number, end: number): boolean {
    const length = end - start;

    // Check each known entity by length and character comparison
    switch (length) {
      case 2: // 'lt', 'gt'
        return (source.charCodeAt(start) === CharacterCodes.l && source.charCodeAt(start + 1) === CharacterCodes.t) ||
          (source.charCodeAt(start) === CharacterCodes.g && source.charCodeAt(start + 1) === CharacterCodes.t);

      case 3: // 'amp'
        return source.charCodeAt(start) === CharacterCodes.a &&
          source.charCodeAt(start + 1) === CharacterCodes.m &&
          source.charCodeAt(start + 2) === CharacterCodes.p;

      case 4: // 'quot', 'apos', 'nbsp'
        if (source.charCodeAt(start) === CharacterCodes.q &&
          source.charCodeAt(start + 1) === CharacterCodes.u &&
          source.charCodeAt(start + 2) === CharacterCodes.o &&
          source.charCodeAt(start + 3) === CharacterCodes.t) return true;

        if (source.charCodeAt(start) === CharacterCodes.a &&
          source.charCodeAt(start + 1) === CharacterCodes.p &&
          source.charCodeAt(start + 2) === CharacterCodes.o &&
          source.charCodeAt(start + 3) === CharacterCodes.s) return true;

        if (source.charCodeAt(start) === CharacterCodes.n &&
          source.charCodeAt(start + 1) === CharacterCodes.b &&
          source.charCodeAt(start + 2) === CharacterCodes.s &&
          source.charCodeAt(start + 3) === CharacterCodes.p) return true;

        return false;

      default:
        return false;
    }
  }

  function isLetter(ch: number): boolean {
    return (ch >= CharacterCodes.A && ch <= CharacterCodes.Z) ||
      (ch >= CharacterCodes.a && ch <= CharacterCodes.z);
  }

  function isDigit(ch: number): boolean {
    return ch >= CharacterCodes._0 && ch <= CharacterCodes._9;
  }

  function isHexDigit(ch: number): boolean {
    return (ch >= CharacterCodes._0 && ch <= CharacterCodes._9) ||
      (ch >= CharacterCodes.A && ch <= CharacterCodes.F) ||
      (ch >= CharacterCodes.a && ch <= CharacterCodes.f);
  }

  function emitTextRun(start: number): void {
    let textEnd = start;

    // Special case: if we start with a malformed < tag (like <1bad>), scan until we find the closing >
    if (start < end && source.charCodeAt(start) === CharacterCodes.lessThan && !isValidHtmlStart(start)) {
      // This is a malformed tag, scan until we find > or end of line
      textEnd = start + 1; // Skip the <
      while (textEnd < end) {
        const ch = source.charCodeAt(textEnd);
        if (isLineBreak(ch)) {
          break;
        }
        textEnd++;
        if (ch === CharacterCodes.greaterThan) {
          // Include the > and stop
          break;
        }
      }
    } else {
      // Regular text scanning
      while (textEnd < end) {
        const ch = source.charCodeAt(textEnd);

        if (isLineBreak(ch)) {
          break;
        }

        // Check for special characters, but handle some specially
        if (ch === CharacterCodes.asterisk ||
          ch === CharacterCodes.backtick ||
          ch === CharacterCodes.greaterThan ||
          ch === CharacterCodes.ampersand ||
          ch === CharacterCodes.equals) {
          break;
        }

        // Special handling for < - only break if it starts a valid HTML construct
        if (ch === CharacterCodes.lessThan) {
          if (isValidHtmlStart(textEnd)) {
            break;
          }
          // Otherwise include it in the text
        }

        // Special handling for underscores - only break if they can be emphasis delimiters
        if (ch === CharacterCodes.underscore) {
          if (canUnderscoreBeDelimiter(textEnd)) {
            break;
          }
        }

        // Special handling for tildes - only break if they are part of double tilde
        if (ch === CharacterCodes.tilde) {
          // Check if this is a double tilde
          if (textEnd + 1 < end && source.charCodeAt(textEnd + 1) === CharacterCodes.tilde) {
            break; // This is start of ~~, let scanner handle it
          }
          // Single tilde - include it in text
        }

        // Special handling for dollars - only break if they can be math delimiters
        if (ch === CharacterCodes.dollar) {
          if (canDollarBeDelimiter(textEnd)) {
            break;
          }
        }

        textEnd++;
      }
    }

    if (textEnd > start) {
      // Check if we scanned to end of line
      const scannedToLineEnd = textEnd >= end || isLineBreak(source.charCodeAt(textEnd));

      let flags = TokenFlags.None;

      if (contextFlags & ContextFlags.PrecedingLineBreak) {
        flags |= TokenFlags.PrecedingLineBreak;
      }
      if (contextFlags & ContextFlags.AtLineStart) {
        flags |= TokenFlags.IsAtLineStart;

        // Add rollback flags for safe restart points when at line start and scanning to line end
        if (scannedToLineEnd) {
          flags |= TokenFlags.CanRollbackHere;
        }
      }

      // Phase 0.2: When scanning reaches the end of a line, we may want to
      // begin cross-line accumulation, but only if the following line looks
      // like a paragraph continuation. Otherwise emit the single-line token
      // immediately to preserve existing behavior for single-line inputs.
      if (scannedToLineEnd) {
        // Determine newline length (CRLF vs LF) so we can locate next line start
        let nlLen = 0;
        if (textEnd < end) {
          const ch = source.charCodeAt(textEnd);
          if (ch === CharacterCodes.carriageReturn) {
            if (textEnd + 1 < end && source.charCodeAt(textEnd + 1) === CharacterCodes.lineFeed) nlLen = 2; else nlLen = 1;
          } else if (isLineBreak(ch)) {
            nlLen = 1;
          }
        }

        const nextLineStart = Math.min(end, textEnd + nlLen);

        // If there's more content after this line, classify the next line to
        // decide whether to continue the StringLiteral across lines.
        if (nextLineStart < end) {
          const nextLineFlags = classifyLine(nextLineStart);
          if (shouldContinueStringLiteral(nextLineFlags)) {
            // Begin or continue accumulation: add current segment to span buffer
            if (pendingStringStart < 0) startPendingString(start, flags);
            scanTextSegmentsIntoSpansForCrossLine(start, textEnd);

            // Advance scanner position to start of next line (consume newline)
            updatePosition(nextLineStart);
            pos = nextLineStart;

            // Do not emit a token now; continuation will proceed on next scan
            return;
          }
        }

        // Not continuing - if there's an existing pending accumulation, emit it first
        if (pendingStringStart >= 0 && spanCount > 0) {
          emitAccumulatedStringLiteral();
          return;
        }

        // No continuation - emit single-line token
        emitStringLiteralToken(start, textEnd, flags);
        contextFlags &= ~ContextFlags.AtLineStart;
      } else {
        // Hit special character, EOF, or forced termination — emit as usual
        // If we have a pending accumulated multi-line token, emit it before
        // emitting the current single-line fragment to preserve correctness.
        if (pendingStringStart >= 0 && spanCount > 0) {
          emitAccumulatedStringLiteral();
          return;
        }

        emitStringLiteralToken(start, textEnd, flags);
        contextFlags &= ~ContextFlags.AtLineStart;
      }
    }
  }

  /**
   * Simple version for cross-line scanning that adds text segments to span buffer
   */
  function scanTextSegmentsIntoSpansForCrossLine(start: number, endPos: number): void {
    // For Phase 0.2, simply add the raw text segment
    // The normalization will happen in materializePendingString()
    if (endPos > start) {
      addSpanToPending(start, endPos - start);
    }
  }

  function canDollarBeDelimiter(pos: number): boolean {
    // Check for escaped dollar
    if (pos > 0 && source.charCodeAt(pos - 1) === CharacterCodes.backslash) {
      return false;
    }

    // Check for double dollar (block math)
    if (pos + 1 < end && source.charCodeAt(pos + 1) === CharacterCodes.dollar) {
      return true; // $$ is always a math delimiter
    }

    // For single dollar, find the line boundaries
    let lineStart = pos;
    while (lineStart > 0 && !isLineBreak(source.charCodeAt(lineStart - 1))) {
      lineStart--;
    }

    let lineEnd = pos;
    while (lineEnd < end && !isLineBreak(source.charCodeAt(lineEnd))) {
      lineEnd++;
    }

    // Find all unescaped dollar positions on this line
    const dollarPositions: number[] = [];
    for (let i = lineStart; i < lineEnd; i++) {
      if (source.charCodeAt(i) === CharacterCodes.dollar) {
        // Check if this dollar is escaped
        if (i > 0 && source.charCodeAt(i - 1) === CharacterCodes.backslash) {
          continue; // Skip escaped dollars
        }
        dollarPositions.push(i);
      }
    }

    // If there are more than 2 unescaped dollars, special logic:
    // - If there are exactly 3 dollars, the first 2 can be delimiters
    // - If there are 4 or more dollars, treat as all text (nested case)
    if (dollarPositions.length > 2) {
      if (dollarPositions.length === 3) {
        // Allow first pair to be delimiters: positions 0 and 1 in the array
        const currentIndex = dollarPositions.indexOf(pos);
        return currentIndex === 0 || currentIndex === 1;
      } else {
        // 4+ dollars: treat all as text (nested/complex case)
        return false;
      }
    }

    // If exactly 2 dollars, both can be delimiters
    if (dollarPositions.length === 2) {
      return true;
    }

    // If only 1 dollar (odd number), cannot be delimiter
    return false;
  }

  function canUnderscoreBeDelimiter(pos: number): boolean {
    // Check if underscore at position pos can be an emphasis delimiter
    // According to CommonMark, intraword underscores (surrounded by alphanumeric) cannot be delimiters

    const prevChar = pos > 0 ? source.charCodeAt(pos - 1) : 0;
    const nextChar = pos + 1 < end ? source.charCodeAt(pos + 1) : 0;

    const prevIsAlnum = isAlphaNumeric(prevChar);
    const nextIsAlnum = isAlphaNumeric(nextChar);

    // If surrounded by alphanumeric characters, it's intraword and can't be a delimiter
    if (prevIsAlnum && nextIsAlnum) {
      return false;
    }

    return true;
  }

  function computeFlankingFlags(start: number, end: number, char: number): TokenFlags {
    let flags = TokenFlags.None;

    // Get previous and next characters for flanking rules
    const prevChar = start > 0 ? source.charCodeAt(start - 1) : 0;
    const nextChar = end < source.length ? source.charCodeAt(end) : 0;

    // Simplified flanking rules - can be refined later
    const prevIsWhitespace = prevChar === 0 || isWhiteSpace(prevChar);
    const nextIsWhitespace = nextChar === 0 || isWhiteSpace(nextChar);
    const prevIsPunctuation = !prevIsWhitespace && isPunctuation(prevChar);
    const nextIsPunctuation = !nextIsWhitespace && isPunctuation(nextChar);

    // Left-flanking: not followed by whitespace and either:
    // - not followed by punctuation, or
    // - followed by punctuation and preceded by whitespace or punctuation
    const leftFlanking = !nextIsWhitespace &&
      (!nextIsPunctuation || prevIsWhitespace || prevIsPunctuation);

    // Right-flanking: not preceded by whitespace and either:
    // - not preceded by punctuation, or  
    // - preceded by punctuation and followed by whitespace or punctuation
    const rightFlanking = !prevIsWhitespace &&
      (!prevIsPunctuation || nextIsWhitespace || nextIsPunctuation);

    if (leftFlanking) {
      flags |= TokenFlags.CanOpen;
    }
    if (rightFlanking) {
      flags |= TokenFlags.CanClose;
    }

    // Special rule for underscore: intraword underscore can't open/close
    if (char === CharacterCodes.underscore) {
      const prevIsAlnum = isAlphaNumeric(prevChar);
      const nextIsAlnum = isAlphaNumeric(nextChar);

      if (prevIsAlnum && nextIsAlnum) {
        // Intraword underscore - remove flanking capabilities
        flags &= ~(TokenFlags.CanOpen | TokenFlags.CanClose);
      }
    }

    return flags;
  }

  function isPunctuation(ch: number): boolean {
    // Basic punctuation check - can be refined
    return (ch >= 0x21 && ch <= 0x2F) ||
      (ch >= 0x3A && ch <= 0x40) ||
      (ch >= 0x5B && ch <= 0x60) ||
      (ch >= 0x7B && ch <= 0x7E);
  }

  function isAlphaNumeric(ch: number): boolean {
    return (ch >= CharacterCodes.a && ch <= CharacterCodes.z) ||
      (ch >= CharacterCodes.A && ch <= CharacterCodes.Z) ||
      (ch >= CharacterCodes.digit0 && ch <= CharacterCodes.digit9);
  }

  /**
   * Check if a '<' character at the given position starts a valid HTML construct
   */
  function isValidHtmlStart(pos: number): boolean {
    if (pos >= end || source.charCodeAt(pos) !== CharacterCodes.lessThan) {
      return false;
    }

    const c1 = pos + 1 < end ? source.charCodeAt(pos + 1) : -1;

    // Check for valid HTML constructs that start with <
    if (c1 === CharacterCodes.slash) {
      // </ - could be closing tag
      return true;
    }

    if (c1 === CharacterCodes.exclamation) {
      // Check for comments, CDATA, DOCTYPE
      if (matchSequence(pos, '<!--') ||
        matchSequence(pos, '<![CDATA[') ||
        matchSequenceCaseInsensitive(pos, '<!DOCTYPE')) {
        return true;
      }
    }

    if (c1 === CharacterCodes.question) {
      // <? processing instruction
      return true;
    }

    // Check for valid tag name (must start with letter)
    if (c1 >= 0 && isLetter(c1)) {
      return true;
    }

    // Everything else (like <1bad>) is not a valid HTML start
    return false;
  }


  /**
   * This is the new line-level prescan function. It quickly classifies a line
   * to determine its structural potential without emitting any tokens.
   */
  function classifyLine(lineStart: number): LineClassification {
    let i = lineStart;
    let indent = 0;

    // 1. Calculate indent and find first non-space/tab character
    while (i < end) {
      const c = source.charCodeAt(i);
      if (c === CharacterCodes.space) { indent++; i++; continue; }
      if (c === CharacterCodes.tab) { indent = (indent + 4) & ~3; i++; continue; }
      break;
    }

    const firstChar = i < end ? source.charCodeAt(i) : -1;

    // 2. Check for blank line (highest priority)
    if (firstChar === -1 || isLineBreak(firstChar)) {
      return LineClassification.BLANK_LINE;
    }

    // 3. Check for indented code
    if (indent >= 4) {
      return LineClassification.INDENTED_CODE;
    }

    // 4. Check for high-precedence block markers based on `firstChar`
    switch (firstChar) {
      case CharacterCodes.hash: {
        let hLevel = 0;
        while (i < end && source.charCodeAt(i) === CharacterCodes.hash) {
          hLevel++;
          i++;
        }
        if (hLevel > 0 && hLevel <= 6 && (i >= end || isWhiteSpace(source.charCodeAt(i)) || isLineBreak(source.charCodeAt(i)))) {
          return LineClassification.ATX_HEADING;
        }
        break; // Fall through to paragraph if not a valid heading
      }
      case CharacterCodes.greaterThan:
        return LineClassification.BLOCKQUOTE_MARKER;

      case CharacterCodes.plus: {
        // Check for unordered list with + marker
        if (i + 1 < end && isWhiteSpace(source.charCodeAt(i + 1))) {
          return LineClassification.LIST_UNORDERED_MARKER;
        }
        break;
      }

      case CharacterCodes.backtick:
      case CharacterCodes.tilde: {
        const fenceChar = firstChar;
        let fenceLen = 0;
        while (i < end && source.charCodeAt(i) === fenceChar) {
          fenceLen++;
          i++;
        }
        if (fenceLen >= 3) {
          // TODO: Differentiate open/close based on parser state
          return LineClassification.FENCED_CODE_OPEN;
        }
        break;
      }
      case CharacterCodes.minus:
      case CharacterCodes.asterisk:
      case CharacterCodes.underscore: {
        const markerChar = firstChar;

        // First check for simple list marker (single character followed by space)
        if ((markerChar === CharacterCodes.minus || markerChar === CharacterCodes.asterisk) &&
          i + 1 < end && isWhiteSpace(source.charCodeAt(i + 1))) {
          // Quick check: if there are 3+ marker characters total on this line, it's a thematic break
          let totalMarkers = 0;
          let p = i;
          while (p < end && !isLineBreak(source.charCodeAt(p))) {
            if (source.charCodeAt(p) === markerChar) totalMarkers++;
            p++;
          }
          if (totalMarkers >= 3) {
            // This is actually a thematic break like "- - -", continue to thematic break check
          } else {
            return LineClassification.LIST_UNORDERED_MARKER;
          }
        }

        // Then check for thematic break (3+ characters of same type)
        let markerCount = 0;
        let p = i;
        while (p < end && !isLineBreak(source.charCodeAt(p))) {
          const ch = source.charCodeAt(p);
          if (ch === markerChar || isWhiteSpace(ch)) {
            if (ch === markerChar) markerCount++;
          } else {
            markerCount = 0; // Not a thematic break
            break;
          }
          p++;
        }
        if (markerCount >= 3) return LineClassification.THEMATIC_BREAK;
        break;
      }
    }

    // 4.5. Check for ordered list markers (digits followed by . or ))
    if (firstChar >= CharacterCodes._0 && firstChar <= CharacterCodes._9) {
      let p = i;
      let digitCount = 0;
      while (p < end && source.charCodeAt(p) >= CharacterCodes._0 && source.charCodeAt(p) <= CharacterCodes._9) {
        digitCount++;
        p++;
        if (digitCount > 9) break; // CommonMark limits to 9 digits
      }
      if (digitCount > 0 && digitCount <= 9 && p < end) {
        const nextChar = source.charCodeAt(p);
        if ((nextChar === CharacterCodes.dot || nextChar === CharacterCodes.closeParen) &&
          p + 1 < end && isWhiteSpace(source.charCodeAt(p + 1))) {
          return LineClassification.LIST_ORDERED_MARKER;
        }
      }
    }

    // 5. If no specific marker found, check for patterns like tables or paragraphs
    // This requires scanning the whole line content
    let hasPipe = false;
    let isAlignmentRow = true;
    let p = lineStart;
    while (p < end && !isLineBreak(source.charCodeAt(p))) {
      const ch = source.charCodeAt(p);
      if (ch === CharacterCodes.bar) { // Changed from .pipe to .bar
        hasPipe = true;
      } else if (ch !== CharacterCodes.colon && ch !== CharacterCodes.minus && ch !== CharacterCodes.space && ch !== CharacterCodes.tab) {
        isAlignmentRow = false;
      }
      p++;
    }

    if (hasPipe && isAlignmentRow) {
      // More thorough check for alignment row
      p = lineStart;
      while (p < end && !isLineBreak(source.charCodeAt(p))) {
        const ch = source.charCodeAt(p);
        if (ch !== CharacterCodes.bar && ch !== CharacterCodes.colon && ch !== CharacterCodes.minus && ch !== CharacterCodes.space && ch !== CharacterCodes.tab) {
          isAlignmentRow = false;
          break;
        }
        p++;
      }
      if (isAlignmentRow) return LineClassification.TABLE_ALIGNMENT_ROW;
    }
    if (hasPipe) {
      return LineClassification.TABLE_PIPE_HEADER_CANDIDATE;
    }

    // Check for Setext underline
    p = lineStart;
    while (p < end && isWhiteSpace(source.charCodeAt(p))) p++;
    const firstNonSpace = source.charCodeAt(p);
    if (firstNonSpace === CharacterCodes.equals || firstNonSpace === CharacterCodes.minus) {
      let p2 = p;
      while (p2 < end && source.charCodeAt(p2) === firstNonSpace) p2++;
      while (p2 < end && isWhiteSpace(source.charCodeAt(p2))) p2++;
      if (p2 >= end || isLineBreak(source.charCodeAt(p2))) {
        return LineClassification.SETEXT_UNDERLINE_CANDIDATE;
      }
    }

    return LineClassification.PARAGRAPH_PLAIN;
  }


  // Leading inline whitespace tokens removed. Leading indentation is handled by classifyLine
  // and block decisions. For rare cases where a single space must be preserved as text,
  // `StringLiteral` will be emitted with that single space.

  function emitNewline(start: number): void {
    let nlEnd = start;
    const ch = source.charCodeAt(nlEnd);

    if (ch === CharacterCodes.carriageReturn &&
      nlEnd + 1 < end &&
      source.charCodeAt(nlEnd + 1) === CharacterCodes.lineFeed) {
      nlEnd += 2; // CRLF
    } else if (isLineBreak(ch)) {
      nlEnd++; // LF or other line break
    }

    let flags = TokenFlags.None;

    // Check if this newline ends a blank line
    if (currentLineFlags & LineClassification.BLANK_LINE) {
      flags |= TokenFlags.IsBlankLine;
      lastBlankLinePos = start;
      contextFlags &= ~ContextFlags.InParagraph; // Reset paragraph context

      // Emit any leading whitespace on the blank line as a StringLiteral so
      // callers that expect to see visible whitespace receive a token.
      if (start > lastLineStart) {
        emitStringLiteralToken(lastLineStart, start, TokenFlags.None);
      }
    }

    // Detect hard line break pattern: two or more spaces immediately before the newline
    // or a single trailing backslash before the newline. If found, emit a HardLineBreak
    // token instead of treating the trailing spaces as separate trivia.
    let hardBreakStart = -1;
    // Look backwards from start to find trailing run of spaces or a backslash
    let j = start - 1;
    let spaceCount = 0;
    while (j >= lastLineStart) {
      const pc = source.charCodeAt(j);
      if (pc === CharacterCodes.space) {
        spaceCount++; j--; continue;
      }
      if (pc === CharacterCodes.backslash && spaceCount === 0) {
        // backslash hard break
        hardBreakStart = j;
      }
      break;
    }

    if (spaceCount >= 2) {
      hardBreakStart = start - spaceCount;
    }

    if (hardBreakStart >= 0) {
      // Emit StringLiteral for any content up to hardBreakStart, if needed, then emit HardLineBreak
      if (hardBreakStart > lastLineStart) {
        // emit text before the trailing spaces/backslash as a StringLiteral
        emitStringLiteralToken(lastLineStart, hardBreakStart, TokenFlags.None);
      }
      emitToken(SyntaxKind.HardLineBreak, hardBreakStart, nlEnd, flags);
      contextFlags |= ContextFlags.AtLineStart | ContextFlags.PrecedingLineBreak;
      return;
    }

    emitToken(SyntaxKind.NewLineTrivia, start, nlEnd, flags);
    contextFlags |= ContextFlags.AtLineStart | ContextFlags.PrecedingLineBreak;
  }

  /**
   * Main scanning function - Stage 3 implementation with inline formatting
   */
  function scanImpl(): void {
    // Main single-entry loop: continue until we emit a token or hit EOF
    const SCAN_DEBUG = typeof process !== 'undefined' && !!process.env.SCAN_DEBUG;
    while (true) {
      if (SCAN_DEBUG) console.log('[SCAN] loop start', { pos, offsetNext, pendingStringStart, spanCount, token });
      // Handle EOF and pending emission deterministically
      if (pos >= end) {
        if (pendingStringStart >= 0) {
          // Only attempt to emit accumulated token when we actually have spans
          if (spanCount > 0) {
            emitAccumulatedStringLiteral();
            return;
          }
          // Pending without spans at EOF -> clear pending and fall through to EOF
          clearPendingString();
        }

        // Emit EOF once
        if (token !== SyntaxKind.EndOfFileToken) {
          emitToken(SyntaxKind.EndOfFileToken, pos, pos);
        }
        return;
      }

      // If at the start of a line, classify it first.
      if (contextFlags & ContextFlags.AtLineStart) {
        currentLineFlags = classifyLine(pos);
        if (SCAN_DEBUG) console.log('[SCAN] classifyLine', { pos, currentLineFlags });

        // Phase 0.2: Check continuation decision for any pending spanning token
        if (pendingStringStart >= 0) {
          if (!shouldContinueStringLiteral(currentLineFlags)) {
            // Only emit accumulated token when we have collected spans
            if (spanCount > 0) {
              emitAccumulatedStringLiteral();
              return; // token emitted
            } else {
              // No spans collected yet -> clear pending and continue scanning this line
              clearPendingString();
            }
          }
          // else: continuation should proceed - fallthrough to scanCurrentLine()
        }

        // Only reset list marker flag if we're actually at the start of a new line
        if (pos == lastLineStart) {
          listMarkerConsumed = false; // Reset list marker flag for new line
        }
      }

      // Record progress sentinel
      const posBefore = pos;
      const oldOffsetNext = offsetNext;

      // Delegate to the appropriate line-level scanner
      scanCurrentLine();

      if (SCAN_DEBUG) console.log('[SCAN] after scanCurrentLine', { posBefore, pos, oldOffsetNext, offsetNext, token, tokenText: tokenText && tokenText.length > 50 ? tokenText.slice(0, 50) + '...' : tokenText });

      // If a token was emitted during scanCurrentLine()/emitters, return to caller
      if (offsetNext !== oldOffsetNext) {
        if (SCAN_DEBUG) console.log('[SCAN] token emitted -> return', { offsetNext });
        return;
      }

      // If we made forward progress on the input, continue the loop to produce a token
      if (pos !== posBefore) {
        continue;
      }

      // Safety net: no progress and no token emitted -> clear pending and emit EOF to avoid infinite loop
      clearPendingString();
      if (token !== SyntaxKind.EndOfFileToken) {
        emitToken(SyntaxKind.EndOfFileToken, pos, pos);
      }
      return;
    }
  }

  /**
   * New top-level dispatcher that decides which specialized scanner to use
   * based on the pre-calculated line classification flags.
   */
  function scanCurrentLine(): void {
    if (currentLineFlags & LineClassification.BLANK_LINE) {
      // Delegate to paragraph scanner so it can find the actual newline char
      // and emit any whitespace run correctly as a StringLiteral before the newline.
      scanParagraphContent();
    } else if (currentLineFlags & LineClassification.ATX_HEADING) {
      scanAtxHeadingLine();
    } else if (currentLineFlags & (LineClassification.FENCED_CODE_OPEN | LineClassification.FENCED_CODE_CLOSE)) {
      scanFenceLine();
    } else if (currentLineFlags & LineClassification.THEMATIC_BREAK) {
      scanThematicBreakLine();
    } else if (currentLineFlags & LineClassification.INDENTED_CODE) {
      scanIndentedCodeLine();
    } else if (currentLineFlags & (LineClassification.LIST_UNORDERED_MARKER | LineClassification.LIST_ORDERED_MARKER)) {
      if (!listMarkerConsumed) {
        scanListMarkerLine();
      } else {
        // List marker already consumed, treat rest as paragraph content  
        scanParagraphContent();
      }
    } else if (currentLineFlags & LineClassification.TABLE_PIPE_HEADER_CANDIDATE) {
      scanTableHeaderLine();
    } else if (currentLineFlags & LineClassification.TABLE_ALIGNMENT_ROW) {
      scanTableAlignmentLine();
    } else if (currentLineFlags & LineClassification.PARAGRAPH_PLAIN || currentLineFlags & LineClassification.SETEXT_UNDERLINE_CANDIDATE) {
      // Fallback to detailed inline parsing for anything that looks like a paragraph
      scanParagraphContent();
    } else {
      // Default fallback for unhandled line types
      scanParagraphContent();
    }
  }

  /**
   * Scans a line that has been identified as an ATX Heading.
   */
  function scanAtxHeadingLine(): void {
    const start = pos;
    let i = start;

    // 1. Emit Hash tokens (e.g., ##)
    while (i < end && source.charCodeAt(i) === CharacterCodes.hash) { i++; }
    emitToken(SyntaxKind.HashToken, start, i);
    // updatePosition is called in emitToken

    // 2. Consume separator whitespace after ATX hashes. Preserve a single space as text
    const wsStart = i;
    while (i < end && isWhiteSpaceSingleLine(source.charCodeAt(i))) { i++; }
    if (i > wsStart) {
      // If there's at least one whitespace character, emit a single-space StringLiteral marker
      // to represent the visual separator (rarely semantically significant beyond text).
      emitStringLiteralToken(wsStart, Math.min(wsStart + 1, i), TokenFlags.None);
      // Advance position was handled by emitStringLiteralToken
    }

    // 3. The rest of the line is paragraph content
    scanParagraphContent();
  }

  /**
   * Scans a line that is a code fence.
   */
  function scanFenceLine(): void {
    let i = pos;

    // If we're already at a newline or end of file, emit newline token instead
    if (i >= end || isLineBreak(source.charCodeAt(i))) {
      if (i < end) {
        emitNewline(i);
      } else {
        // Don't emit another EOF if we are already at the end.
        if (token !== SyntaxKind.EndOfFileToken) {
          emitToken(SyntaxKind.EndOfFileToken, i, i);
        }
      }
      return;
    }

    while (i < end && !isLineBreak(source.charCodeAt(i))) {
      i++;
    }

    emitToken(SyntaxKind.CodeFence, pos, i);

    // Clear AtLineStart flag to prevent re-classification
    contextFlags &= ~ContextFlags.AtLineStart;

    // The newline will be handled in the next scan() call
  }

  /**
   * Scans a line that is a thematic break.
   */
  function scanThematicBreakLine(): void {
    let i = pos;

    // If we're already at a newline or end of file, this shouldn't be a thematic break
    if (i >= end || isLineBreak(source.charCodeAt(i))) {
      // Delegate to paragraph scanner to handle the newline properly
      scanParagraphContent();
      return;
    }

    while (i < end && !isLineBreak(source.charCodeAt(i))) {
      i++;
    }
    emitToken(SyntaxKind.ThematicBreak, pos, i);
    // The newline will be handled in the next scan() call
  }

  /**
   * Scans a line that is indented code (4+ spaces).
   */
  function scanIndentedCodeLine(): void {
    // Use lastLineStart instead of scanning backwards inefficiently
    // The line classification already determined this is indented code

    // Check if we're already at or past the line content (e.g., at the newline)
    if (pos >= end || isLineBreak(source.charCodeAt(pos))) {
      // We're at a line break, handle it as a newline token
      emitNewline(pos);
      return;
    }

    // Find the end of the current line
    let i = pos;
    while (i < end && !isLineBreak(source.charCodeAt(i))) {
      i++;
    }

    // If pos is already beyond the start of the line, only emit remaining content
    const contentStart = Math.max(pos, lastLineStart);

    // Emit the line content
    emitStringLiteralToken(contentStart, i, TokenFlags.None);
    // The newline will be handled in the next scan() call
  }

  /**
   * Scans a line that starts with a list marker.
   */
  function scanListMarkerLine(): void {
    let tokenStart = pos;

    // Find any leading whitespace indentation
    while (pos < end && isWhiteSpaceSingleLine(source.charCodeAt(pos))) {
      pos++;
    }

    if (currentLineFlags & LineClassification.LIST_UNORDERED_MARKER) {
      // Unordered list markers: -, *, +
      // Include the marker and the required single space
      let markerEnd = pos + 1;
      if (markerEnd < end && isWhiteSpaceSingleLine(source.charCodeAt(markerEnd))) {
        markerEnd++; // Consume the space after the marker
      }

      // Include any additional whitespace after the marker in the token 
      while (markerEnd < end && isWhiteSpaceSingleLine(source.charCodeAt(markerEnd))) {
        markerEnd++;
      }

      // Determine logical marker text (just the bullet character) while still
      // emitting a token whose span covers leading/trailing whitespace.
      const bulletChar = source.substring(pos, pos + 1);

      // Emit token that includes leading whitespace and trailing whitespace in both text and position range
      emitToken(SyntaxKind.ListMarkerUnordered, tokenStart, markerEnd);
      // Override tokenText with the logical marker (no surrounding whitespace)
      tokenText = bulletChar;
      listMarkerConsumed = true; // Mark marker as consumed

      // Position is already at the end of all whitespace, no need for additional advancement
      // The rest of the line will be handled in the next scan() call
    } else if (currentLineFlags & LineClassification.LIST_ORDERED_MARKER) {
      // Ordered list markers: 1., 2), etc.
      let i = pos;
      // Skip digits
      while (i < end && source.charCodeAt(i) >= CharacterCodes._0 && source.charCodeAt(i) <= CharacterCodes._9) {
        i++;
      }
      // Capture numeric text (digits only) as logical marker
      const numberText = source.substring(pos, i);

      // Skip the . or )
      if (i < end && (source.charCodeAt(i) === CharacterCodes.dot || source.charCodeAt(i) === CharacterCodes.closeParen)) {
        i++;
      }
      // Include the marker and the required single space
      if (i < end && isWhiteSpaceSingleLine(source.charCodeAt(i))) {
        i++; // Consume the space after the marker
      }

      // Include any additional whitespace after the marker in the token
      while (i < end && isWhiteSpaceSingleLine(source.charCodeAt(i))) {
        i++;
      }

      // Emit token that includes leading whitespace and trailing whitespace in both text and position range
      emitToken(SyntaxKind.ListMarkerOrdered, tokenStart, i);
      // Override tokenText with numeric logical marker (digits only)
      tokenText = numberText;
      listMarkerConsumed = true; // Mark marker as consumed

      // Position is already at the end of all whitespace, no need for additional advancement
      // The rest of the line will be handled in the next scan() call
    } else {
      // Fallback to paragraph content if classification was wrong
      scanParagraphContent();
    }
  }

  /**
   * Scans a table header line (contains pipe characters).
   * According to speculatives.md, isolated pipe lines should be treated as paragraphs
   * unless confirmed by a valid table structure (header + alignment row).
   * 
   * For now, we treat TABLE_PIPE_HEADER_CANDIDATE lines as paragraphs until
   * proper table disambiguation is implemented.
   */
  function scanTableHeaderLine(): void {
    // TODO: Implement proper table disambiguation per speculatives.md
    // Lines with pipes should only be parsed as table tokens when there's
    // a confirmed table structure (header + alignment row).
    // For now, treat as paragraph content.
    scanParagraphContent();
  }

  /**
   * Scans a table alignment line (contains :, -, |).
   * According to speculatives.md, isolated alignment rows should be treated as paragraphs
   * unless they're part of a confirmed table structure.
   * 
   * For now, we treat TABLE_ALIGNMENT_ROW lines as paragraphs until
   * proper table disambiguation is implemented.
   */
  function scanTableAlignmentLine(): void {
    // TODO: Implement proper table disambiguation per speculatives.md
    // Alignment rows should only be parsed as table tokens when they're
    // part of a confirmed table structure (header + alignment row + content).
    // For now, treat as paragraph content.
    scanParagraphContent();
  }

  /**
   * This function contains the original inline scanning logic, now used for
   * paragraph-like content within any line type.
   */
  function scanParagraphContent(): void {
    // If we are in a tag scanning state (after emitting the tag-name), emit
    // one attribute-related token per scan() call.
    if (inTagScanning) {
      scanHtmlAttributeToken();
      return;
    }
    if (pos >= end) {
      // Don't emit another EOF if we are already at the end.
      if (token !== SyntaxKind.EndOfFileToken) {
        emitToken(SyntaxKind.EndOfFileToken, pos, pos);
      }
      return;
    }

    let start = pos;
    let ch = source.charCodeAt(pos);

    // Handle newlines
    if (isLineBreak(ch)) {
      emitNewline(start);
      return;
    }

    // Handle leading whitespace at line start: consume it and only emit as text when
    // the rest of the line contains no other non-whitespace characters (rare case).
    if (isWhiteSpaceSingleLine(ch) && (contextFlags & ContextFlags.AtLineStart)) {
      let wsEnd = start;
      while (wsEnd < end && isWhiteSpaceSingleLine(source.charCodeAt(wsEnd))) wsEnd++;

      // If the rest of the line is only whitespace/newline, emit it as StringLiteral so callers
      // that expect a visible space get a token. Otherwise, consume the leading whitespace and
      // let the following text emission produce a single normalized StringLiteral (no consecutive
      // StringLiterals).
      let p = wsEnd;
      while (p < end && !isLineBreak(source.charCodeAt(p))) {
        if (!isWhiteSpaceSingleLine(source.charCodeAt(p))) break;
        p++;
      }

      const restHasNonWhite = (p < end && !isLineBreak(source.charCodeAt(p)));
      if (!restHasNonWhite) {
        // Whole line is whitespace - emit it so blank-line detection can follow
        emitStringLiteralToken(start, wsEnd, TokenFlags.None);
        return;
      }

      // Otherwise, skip leading whitespace and continue scanning the rest of the line
      pos = wsEnd;
      ch = source.charCodeAt(pos);
    }

    // Stage 4: HTML character scanning
    if (ch === CharacterCodes.lessThan) {
      // Only treat as HTML if it starts a valid HTML construct
      if (isValidHtmlStart(start)) {
        scanLessThan(start);
      } else {
        // Check if this looks like a malformed tag (has content after < before >)
        let hasTagContent = false;
        let pos = start + 1;
        while (pos < end && !isLineBreak(source.charCodeAt(pos))) {
          const ch = source.charCodeAt(pos);
          if (ch === CharacterCodes.greaterThan) {
            // Found closing >, if we had content, it's a malformed tag
            if (hasTagContent) {
              emitTextRun(start);
              return;
            }
            break;
          }
          if (ch !== CharacterCodes.space && ch !== CharacterCodes.tab) {
            hasTagContent = true;
          }
          pos++;
        }

        // If no tag content found (e.g., "< "), emit as LessThanToken
        scanLessThan(start);
      }
    } else if (ch === CharacterCodes.greaterThan) {
      scanGreaterThan(start);
    } else if (ch === CharacterCodes.ampersand) {
      scanAmpersand(start);
    } else if (ch === CharacterCodes.equals) {
      scanEquals(start);
    } else if (ch === CharacterCodes.slash && pos + 1 < end && source.charCodeAt(pos + 1) === CharacterCodes.greaterThan) {
      // This is /> - check if this could be a self-closing tag
      emitToken(SyntaxKind.SlashGreaterThanToken, start, start + 2);
      return;
    } else if (isLetter(ch)) {
      // Check if this could be an HTML tag name (only at appropriate positions)
      if (pos > 0 && (source.charCodeAt(pos - 1) === CharacterCodes.lessThan ||
        (pos > 1 && source.charCodeAt(pos - 2) === CharacterCodes.lessThan && source.charCodeAt(pos - 1) === CharacterCodes.slash))) {
        scanHtmlTagName(start);
      } else {
        // Regular text content - scan until next special character
        emitTextRun(start);
      }
    }
    // Direct character-based scanning - no line look-ahead needed
    else if (ch === CharacterCodes.asterisk) {
      scanAsterisk(start);
    } else if (ch === CharacterCodes.underscore && canUnderscoreBeDelimiter(pos)) {
      scanUnderscore(start);
    } else if (ch === CharacterCodes.backtick) {
      scanBacktick(start);
    } else if (ch === CharacterCodes.tilde && isDoubleTilde(start)) {
      scanTilde(start);
    } else if (ch === CharacterCodes.dollar && canDollarBeDelimiter(start)) {
      scanDollar(start);
    } else {
      // Regular text content - scan until next special character
      emitTextRun(start);
    }
  }

  function scanHtmlAttributeToken(): void {
    // Single-iteration attribute scanner: mirror scanHtmlAttributes but emit exactly one token
    let p = pos;

    // If there's intra-tag whitespace, skip it (tests currently do not assert whitespace tokens)
    if (p < end && isWhiteSpaceSingleLine(source.charCodeAt(p)) && !isLineBreak(source.charCodeAt(p))) {
      while (p < end && isWhiteSpaceSingleLine(source.charCodeAt(p)) && !isLineBreak(source.charCodeAt(p))) p++;
      pos = p;
      // Recurse once to emit the actual next token without returning control to caller
      scanHtmlAttributeToken();
      return;
    }

    // Ensure p is synced
    p = pos;

    if (p >= end) {
      // Don't emit another EOF if we are already at the end.
      if (token !== SyntaxKind.EndOfFileToken) {
        emitToken(SyntaxKind.EndOfFileToken, p, p);
      }
      return;
    }

    const ch = source.charCodeAt(p);

    // If the previous emitted token was '=', then the next token must be the value
    // (quoted or unquoted). This avoids misclassifying attribute names as values.
    if (token === SyntaxKind.EqualsToken) {
      if (ch === CharacterCodes.doubleQuote || ch === CharacterCodes.singleQuote) {
        const quote = ch;
        const valStart = p;
        p++;
        while (p < end && source.charCodeAt(p) !== quote) p++;
        if (p < end && source.charCodeAt(p) === quote) {
          p++;
          emitAttributeValueToken(valStart, p, /*isQuoted*/true);
          while (p < end && isWhiteSpaceSingleLine(source.charCodeAt(p))) p++;
          pos = p;
          offsetNext = p;
          return;
        } else {
          // Unterminated: scan from just after opening quote to the first '>' or line break
          let scanTo = valStart + 1;
          while (scanTo < end) {
            const c = source.charCodeAt(scanTo);
            if (c === CharacterCodes.greaterThan || isLineBreak(c)) break;
            scanTo++;
          }
          emitAttributeValueToken(valStart, scanTo, /*isQuoted*/true, TokenFlags.Unterminated);
          pos = scanTo;
          offsetNext = scanTo;
          inTagScanning = false; // stop scanning tag; do not emit '>' per spec/test
          return;
        }
      } else {
        // Unquoted value following '='
        const valStart = p;
        while (p < end) {
          const c = source.charCodeAt(p);
          if (isWhiteSpaceSingleLine(c) || c === CharacterCodes.greaterThan || (c === CharacterCodes.slash && p + 1 < end && source.charCodeAt(p + 1) === CharacterCodes.greaterThan)) break;
          p++;
        }
        emitAttributeValueToken(valStart, p, /*isQuoted*/false);
        while (p < end && isWhiteSpaceSingleLine(source.charCodeAt(p))) p++;
        pos = p;
        offsetNext = p;
        return;
      }
    }

    // End of tag
    if (ch === CharacterCodes.greaterThan) {
      inTagScanning = false;
      emitToken(SyntaxKind.GreaterThanToken, p, p + 1);
      pos = p + 1;
      return;
    }

    // Self-closing '/>'
    if (ch === CharacterCodes.slash && p + 1 < end && source.charCodeAt(p + 1) === CharacterCodes.greaterThan) {
      inTagScanning = false;
      emitToken(SyntaxKind.SlashGreaterThanToken, p, p + 2);
      pos = p + 2;
      return;
    }

    // Otherwise proceed to name/equals/end handling

    // Attribute name (use start-specific check)
    if (isAttributeNameStart(ch)) {
      const nameStart = p;
      p++;
      while (p < end && isAttributeNameCharacter(source.charCodeAt(p))) p++;
      emitToken(SyntaxKind.HtmlAttributeName, nameStart, p);
      // Move to next non-whitespace meaningful char
      while (p < end && isWhiteSpaceSingleLine(source.charCodeAt(p))) p++;
      // If the next char is '=' and after optional whitespace we hit '>' or '/>' or EOF,
      // treat this as malformed (missing value). Do not emit '='; instead advance to the
      // terminator so the next scan emits the correct GreaterThanToken at its own column.
      if (p < end && source.charCodeAt(p) === CharacterCodes.equals) {
        let peek = p + 1;
        while (peek < end && isWhiteSpaceSingleLine(source.charCodeAt(peek))) peek++;
        const peekCh = peek < end ? source.charCodeAt(peek) : -1;
        if (peekCh === CharacterCodes.greaterThan) {
          diagnostics.push({ code: Diagnostics.InvalidHtmlAttribute, start: p, length: 1 });
          pos = peek; offsetNext = peek; return;
        }
        if (peekCh === CharacterCodes.slash && peek + 1 < end && source.charCodeAt(peek + 1) === CharacterCodes.greaterThan) {
          diagnostics.push({ code: Diagnostics.InvalidHtmlAttribute, start: p, length: 1 });
          pos = peek; offsetNext = peek; return;
        }
        if (peekCh === -1) {
          diagnostics.push({ code: Diagnostics.InvalidHtmlAttribute, start: p, length: 1 });
          pos = end; offsetNext = end; return;
        }
      }
      pos = p;
      offsetNext = p;
      return;
    }

    // Equals sign
    if (ch === CharacterCodes.equals) {
      // Peek next non-whitespace to decide if this is malformed per Equals-token rule
      let peek = p + 1;
      while (peek < end && isWhiteSpaceSingleLine(source.charCodeAt(peek))) peek++;
      const peekCh = peek < end ? source.charCodeAt(peek) : -1;

      // If '=' is followed (after optional whitespace) by '>' or EOF or '/>' then it's malformed
      if (peekCh === CharacterCodes.greaterThan || (peekCh === CharacterCodes.slash && peek + 1 < end && source.charCodeAt(peek + 1) === CharacterCodes.greaterThan) || peekCh === -1) {
        // Record diagnostic for invalid html attribute - associate with the '=' position
        diagnostics.push({ code: Diagnostics.InvalidHtmlAttribute, start: p, length: 1 });

        // Advance to peek and emit the token found there (or EOF)
        if (peekCh === CharacterCodes.greaterThan) {
          inTagScanning = false;
          emitToken(SyntaxKind.GreaterThanToken, peek, peek + 1);
          pos = peek + 1;
          return;
        }
        if (peekCh === CharacterCodes.slash && peek + 1 < end && source.charCodeAt(peek + 1) === CharacterCodes.greaterThan) {
          inTagScanning = false;
          emitToken(SyntaxKind.SlashGreaterThanToken, peek, peek + 2);
          pos = peek + 2;
          return;
        }
        // EOF-ish
        // Don't emit another EOF if we are already at the end.
        if (token !== SyntaxKind.EndOfFileToken) {
          emitToken(SyntaxKind.EndOfFileToken, peek, peek);
        }
        pos = peek;
        return;
      }

      // Normal '=' that introduces a value - emit equals token
      emitToken(SyntaxKind.EqualsToken, p, p + 1);
      // Skip any whitespace after '=' so next scan hits value immediately
      p = p + 1;
      while (p < end && isWhiteSpaceSingleLine(source.charCodeAt(p))) p++;
      pos = p;
      offsetNext = p;
      return;
    }

    // Quoted value
    if (ch === CharacterCodes.doubleQuote || ch === CharacterCodes.singleQuote) {
      const quote = ch;
      const valStart = p;
      p++;
      while (p < end && source.charCodeAt(p) !== quote) p++;
      if (p < end && source.charCodeAt(p) === quote) {
        p++; // include closing quote
        emitAttributeValueToken(valStart, p, /*isQuoted*/true);
        // After closing quote, advance to next non-whitespace so '>' or next attr aligns
        while (p < end && isWhiteSpaceSingleLine(source.charCodeAt(p))) p++;
        pos = p;
        offsetNext = p;
        return;
      } else {
        // Unterminated quoted value: emit until first '>' or line break with flag
        let scanTo = valStart + 1;
        while (scanTo < end) {
          const c = source.charCodeAt(scanTo);
          if (c === CharacterCodes.greaterThan || isLineBreak(c)) break;
          scanTo++;
        }
        emitAttributeValueToken(valStart, scanTo, /*isQuoted*/true, TokenFlags.Unterminated);
        // Do not exit tag scanning; let next scan emit '>' if present
        while (scanTo < end && isWhiteSpaceSingleLine(source.charCodeAt(scanTo))) scanTo++;
        pos = scanTo;
        offsetNext = scanTo;
        // Keep inTagScanning so caller can still receive the '>' token next
        return;
      }
    }

    // Unquoted value
    if (!isWhiteSpaceSingleLine(ch) && ch !== CharacterCodes.greaterThan) {
      const valStart = p;
      while (p < end) {
        const c = source.charCodeAt(p);
        if (isWhiteSpaceSingleLine(c) || c === CharacterCodes.greaterThan || (c === CharacterCodes.slash && p + 1 < end && source.charCodeAt(p + 1) === CharacterCodes.greaterThan)) break;
        p++;
      }
      emitAttributeValueToken(valStart, p, /*isQuoted*/false);
      while (p < end && isWhiteSpaceSingleLine(source.charCodeAt(p))) p++;
      pos = p;
      offsetNext = p;
      return;
    }

    // Fallback - emit text run and exit tag scanning
    inTagScanning = false;
    emitTextRun(p);
  }

  function isDoubleTilde(pos: number): boolean {
    return pos + 1 < end && source.charCodeAt(pos + 1) === CharacterCodes.tilde;
  }

  /**
   * Public interface implementation
   */

  function setText(text: string, start: number = 0, length?: number): void {
    source = text;
    pos = start;
    end = length !== undefined ? start + length : text.length;
    line = 1;
    column = 1;
    lastLineStart = 0;

    // Reset state
    contentMode = ContentMode.Normal;
    endPattern = undefined;
    contextFlags = ContextFlags.AtLineStart;
    currentIndentLevel = 0;
    lastBlankLinePos = -1;

    // Reset span buffer state
    spanCount = 0;
    pendingStringStart = -1;
    pendingStringFlags = TokenFlags.None;

    // Reset token fields
    token = SyntaxKind.Unknown;
    tokenText = '';
    tokenFlags = TokenFlags.None;
    offsetNext = start;
  }

  function scan(): void {
    scanImpl();
  }

  function rollback(position: number, type: RollbackType): void {
    // Simple rollback implementation for Stage 1
    // Clear any pending span-buffer state to avoid stale pending accumulation
    // after parser-initiated rollbacks. This is required before larger span
    // changes are applied repository-wide.
    clearPendingString();
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
        if (ch === CharacterCodes.carriageReturn &&
          i + 1 < source.length &&
          source.charCodeAt(i + 1) === CharacterCodes.lineFeed) {
          i++; // Skip CR in CRLF
        }
        line++;
        column = 1;
        lastLineStart = i + 1;
      } else {
        column++;
      }
    }

    // Reset context flags
    contextFlags = ContextFlags.AtLineStart;
    if (position > 0) {
      contextFlags |= ContextFlags.PrecedingLineBreak;
    }

    // Reset token fields
    token = SyntaxKind.Unknown;
    tokenText = '';
    tokenFlags = TokenFlags.None;
    offsetNext = position;
  }

  function fillDebugState(state: ScannerDebugState): void {
    // Fill position state
    state.pos = pos;
    state.line = line;
    state.column = column;
    state.mode = contentMode === ContentMode.Normal ? 'Normal' :
      contentMode === ContentMode.RawText ? 'RawText' : 'RCData';

    // Fill context state
    state.atLineStart = !!(contextFlags & ContextFlags.AtLineStart);
    state.inParagraph = !!(contextFlags & ContextFlags.InParagraph);
    state.precedingLineBreak = !!(contextFlags & ContextFlags.PrecedingLineBreak);

    // Fill token state
    state.currentToken = token;
    state.currentTokenText = tokenText;
    state.currentTokenFlags = tokenFlags;
    state.nextOffset = offsetNext;
  }

  // Return the scanner interface object
  const scanner: Scanner = {
    // Methods
    scan,
    rollback,
    fillDebugState,
    initText: setText,

    // Direct field access - these are the 4 public fields
    get token() { return token; },
    set token(value: SyntaxKind) { token = value; },

    get tokenText() { return tokenText; },
    set tokenText(value: string) { tokenText = value; },

    get tokenFlags() { return tokenFlags; },
    set tokenFlags(value: TokenFlags) { tokenFlags = value; },

    get offsetNext() { return offsetNext; },
    set offsetNext(value: number) { offsetNext = value; }
  };

  return scanner;
}