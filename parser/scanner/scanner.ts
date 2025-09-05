import {
  SyntaxKind,
  TokenFlags,
  RollbackType,
  ScannerErrorCode
} from './token-types';
import {
  CharacterCodes,
  isLineBreak,
  isWhiteSpaceSingleLine,
  isWhiteSpace
} from './character-codes';

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
  
  // Context flags
  let contextFlags: ContextFlags = ContextFlags.AtLineStart;
  
  // Scanner interface fields - these are the 4 public fields
  let token: SyntaxKind = SyntaxKind.Unknown;
  let tokenText: string = '';
  let tokenFlags: TokenFlags = TokenFlags.None;
  let offsetNext: number = 0;
  
  // Cross-line state continuity
  let currentIndentLevel = 0;
  let lastBlankLinePos = -1;
  
  /**
   * Helper functions reused from existing scanner
   */
  
  function updatePosition(newPos: number): void {
    while (pos < newPos) {
      const ch = source.charCodeAt(pos);
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
   * Single-pass string processing that returns either a clean substring or normalized string
   * Optimized for the common case where no normalization is needed
   */
  function processStringToken(start: number, endPos: number): string {
    // Fast path for very short strings
    const length = endPos - start;
    if (length <= 2) {
      return source.substring(start, endPos);
    }
    
    // First pass - check if normalization is needed at all
    let needsNormalization = false;
    let hasTrailingSpace = false;
    
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
    
    // If only trailing space needs to be removed, do it efficiently
    if (!needsNormalization && hasTrailingSpace) {
      return source.substring(start, endPos - 1);
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
    
    // Join result and trim trailing spaces
    let finalResult = result.join('');
    return finalResult.replace(/\s+$/, '');
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

  function emitStringLiteralToken(start: number, endPos: number, flags: TokenFlags = TokenFlags.None): void {
    token = SyntaxKind.StringLiteral;
    
    // Single-pass string processing - eliminates double scanning
    tokenText = processStringToken(start, endPos);
    
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
    updatePosition(runEnd);
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
    updatePosition(runEnd);
  }
  
  function scanBacktick(start: number): void {
    let runEnd = start;
    
    // Count consecutive backticks
    while (runEnd < end && source.charCodeAt(runEnd) === CharacterCodes.backtick) {
      runEnd++;
    }
    
    // For backticks, we always emit BacktickToken regardless of run length
    // The run length will be encoded in flags for parser use
    const runLength = runEnd - start;
    let flags = TokenFlags.None;
    
    // TODO: Add run length encoding to flags when needed for parser
    
    emitToken(SyntaxKind.BacktickToken, start, runEnd, flags);
    updatePosition(runEnd);
  }
  
  function scanTilde(start: number): void {
    // This should only be called for double tildes now, since emitTextRun handles single tildes
    // Double check that we have at least 2 tildes
    if (start + 1 < end && source.charCodeAt(start + 1) === CharacterCodes.tilde) {
      // This is a double tilde - emit TildeTilde token
      emitToken(SyntaxKind.TildeTilde, start, start + 2, TokenFlags.None);
      updatePosition(start + 2);
    } else {
      // This shouldn't happen now, but fallback to text
      emitTextRun(start);
    }
  }
  
  function emitTextRun(start: number): void {
    let textEnd = start;
    
    // Scan until we hit a special character or line break
    while (textEnd < end) {
      const ch = source.charCodeAt(textEnd);
      
      if (isLineBreak(ch)) {
        break;
      }
      
      // Check for special characters, but handle intraword underscores specially
      if (ch === CharacterCodes.asterisk ||
          ch === CharacterCodes.backtick) {
        break;
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
      
      textEnd++;
    }
    
    // Safety check: ensure we make at least some progress
    if (textEnd <= start && start < end) {
      // Force advance by one character to prevent infinite loop
      textEnd = start + 1;
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
      
      // Always use normalized text for StringLiteral tokens regardless of position
      // String manipulation only happens at token emission time
      emitStringLiteralToken(start, textEnd, flags);
      
      // Reset line start flag after emitting text
      contextFlags &= ~ContextFlags.AtLineStart;
    }
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
  
  
  function emitWhitespace(start: number): void {
    let wsEnd = start;
    while (wsEnd < end && isWhiteSpaceSingleLine(source.charCodeAt(wsEnd))) {
      wsEnd++;
    }
    
    if (wsEnd > start) {
      emitToken(SyntaxKind.WhitespaceTrivia, start, wsEnd);
    }
  }
  
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
    if (isBlankLine()) {
      flags |= TokenFlags.IsBlankLine;
      lastBlankLinePos = start;
      contextFlags &= ~ContextFlags.InParagraph; // Reset paragraph context
    }
    
    emitToken(SyntaxKind.NewLineTrivia, start, nlEnd, flags);
    contextFlags |= ContextFlags.AtLineStart | ContextFlags.PrecedingLineBreak;
  }
  
  /**
   * Main scanning function - Stage 3 implementation with inline formatting
   */
  function scanImpl(): void {
    if (pos >= end) {
      emitToken(SyntaxKind.EndOfFileToken, pos, pos);
      return;
    }
    
    const start = pos;
    const ch = source.charCodeAt(pos);
    
    // Update indent level at line start
    if (contextFlags & ContextFlags.AtLineStart) {
      currentIndentLevel = getCurrentIndentLevel();
    }
    
    // Handle newlines
    if (isLineBreak(ch)) {
      emitNewline(start);
      return;
    }
    
    // Handle leading whitespace at line start
    if (isWhiteSpaceSingleLine(ch) && (contextFlags & ContextFlags.AtLineStart)) {
      emitWhitespace(start);
      return;
    }
    
    // Direct character-based scanning - no line look-ahead needed
    if (ch === CharacterCodes.asterisk) {
      scanAsterisk(start);
    } else if (ch === CharacterCodes.underscore && canUnderscoreBeDelimiter(pos)) {
      scanUnderscore(start);
    } else if (ch === CharacterCodes.backtick) {
      scanBacktick(start);
    } else if (ch === CharacterCodes.tilde && isDoubleTilde(start)) {
      scanTilde(start);
    } else {
      // Regular text content - scan until next special character
      emitTextRun(start);
    }
    
    // Infinite loop protection: ensure position always advances
    if (pos <= start) {
      handleInfiniteLoopDetection(start);
    }
  }
  
  function isDoubleTilde(pos: number): boolean {
    return pos + 1 < end && source.charCodeAt(pos + 1) === CharacterCodes.tilde;
  }
  
  /**
   * Handles infinite loop detection and recovery.
   * Called when scanner position fails to advance, indicating a potential infinite loop.
   * This function ensures the scanner can continue by:
   * 1. Emitting an error token at the problematic character
   * 2. Forcing position advancement to break the loop
   * 
   * This is a generalized utility that can be used throughout the scanner
   * whenever position advancement stalls.
   */
  function handleInfiniteLoopDetection(stuckPosition: number): void {
    // Emit an error token at the character that caused the infinite loop
    const problemChar = stuckPosition < end ? source.charCodeAt(stuckPosition) : 0;
    const errorText = stuckPosition < end ? String.fromCharCode(problemChar) : '';
    
    // Set token fields directly to emit error token
    token = SyntaxKind.Unknown; // Using Unknown as error token type
    tokenText = errorText;
    tokenFlags = TokenFlags.HasScanError; // Mark as error
    
    // Force advance position by 1 to break the infinite loop
    const targetPos = Math.min(stuckPosition + 1, end);
    updatePosition(targetPos);
    offsetNext = pos;
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