import {
  SyntaxKind2,
  TokenFlags2,
  RollbackType,
  ScannerErrorCode2
} from './scanner2-token-types.js';
import {
  CharacterCodes,
  isLineBreak,
  isWhiteSpaceSingleLine,
  isWhiteSpace
} from './character-codes.js';

export interface Scanner2 {
  /** Initialize scanner text and optional start/length. */
  initText(text: string, start?: number, length?: number): void;

  /** Advances to the next token and updates all public token fields. */
  scan(): void;

  /** Structured rollback to a previous position. */
  rollback(pos: number, type: RollbackType): void;

  /** Fill a zero-allocation diagnostics state object. */
  fillDebugState(state: ScannerDebugState): void;

  /** Current token type. Updated by scan() and rollback(). */
  token: SyntaxKind2;

  /** Current token text (always materialized). */
  tokenText: string;

  /** Token flags including rollback safety and contextual flags. */
  tokenFlags: TokenFlags2;

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
  currentToken: SyntaxKind2;

  /** The current token's text. */
  currentTokenText: string;

  /** Flags associated with the current token. */
  currentTokenFlags: TokenFlags2;

  /** The offset where the next token will start. */
  nextOffset: number;
}


/**
 * Scanner2 implementation with closure-based architecture
 * Stage 1: Basic text lines + whitespace/newlines only
 */
export function createScanner2(): Scanner2 {
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
  let token: SyntaxKind2 = SyntaxKind2.Unknown;
  let tokenText: string = '';
  let tokenFlags: TokenFlags2 = TokenFlags2.None;
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
  
  function normalizeLineWhitespace(text: string): string {
    // Normalize whitespace within a line according to CommonMark:
    // - Convert tabs to spaces (4-space tabs)
    // - Collapse multiple consecutive spaces to single space
    // - Trim leading and trailing whitespace
    return text.replace(/\t/g, '    ').replace(/ +/g, ' ').trim();
  }
  
  /**
   * Token emission functions
   */
  
  function emitToken(kind: SyntaxKind2, start: number, endPos: number, flags: TokenFlags2 = TokenFlags2.None): void {
    token = kind;
    tokenText = source.substring(start, endPos);
    tokenFlags = flags;
    offsetNext = endPos;
    
    // Add context-based flags
    if (contextFlags & ContextFlags.PrecedingLineBreak) {
      tokenFlags |= TokenFlags2.PrecedingLineBreak;
    }
    if (contextFlags & ContextFlags.AtLineStart) {
      tokenFlags |= TokenFlags2.IsAtLineStart;
    }
    
    // Update position tracking
    updatePosition(endPos);
    
    // Reset preceding line break flag after first token
    contextFlags &= ~ContextFlags.PrecedingLineBreak;
  }
  
  function emitTextContent(start: number): void {
    const lineStart = start;
    let lineEnd = start;
    
    // Scan to end of line, but not including the line break
    while (lineEnd < end && !isLineBreak(source.charCodeAt(lineEnd))) {
      lineEnd++;
    }
    
    if (lineEnd > lineStart) {
      const rawText = source.substring(lineStart, lineEnd);
      const normalizedText = normalizeLineWhitespace(rawText);
      
      let flags = TokenFlags2.None;
      
      // Add rollback flags for safe restart points
      if (contextFlags & ContextFlags.AtLineStart) {
        flags |= TokenFlags2.CanRollbackHere;
      }
      
      // Add context flags
      if (contextFlags & ContextFlags.PrecedingLineBreak) {
        flags |= TokenFlags2.PrecedingLineBreak;
      }
      if (contextFlags & ContextFlags.AtLineStart) {
        flags |= TokenFlags2.IsAtLineStart;
      }
      
      // Manually set token fields instead of using emitToken to use normalized text
      token = SyntaxKind2.StringLiteral;
      tokenText = normalizedText;
      tokenFlags = flags;
      offsetNext = lineEnd;
      
      // Update position tracking
      updatePosition(lineEnd);
      
      // Reset preceding line break flag after first token
      contextFlags &= ~ContextFlags.PrecedingLineBreak;
      
      // Update paragraph state
      if (normalizedText.length > 0) {
        contextFlags |= ContextFlags.InParagraph;
      }
    } else {
      // Empty line content - this shouldn't happen in normal flow
      emitToken(SyntaxKind2.StringLiteral, start, start, TokenFlags2.IsBlankLine);
    }
  }
  
  function emitWhitespace(start: number): void {
    let wsEnd = start;
    while (wsEnd < end && isWhiteSpaceSingleLine(source.charCodeAt(wsEnd))) {
      wsEnd++;
    }
    
    if (wsEnd > start) {
      emitToken(SyntaxKind2.WhitespaceTrivia, start, wsEnd);
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
    
    let flags = TokenFlags2.None;
    
    // Check if this newline ends a blank line
    if (isBlankLine()) {
      flags |= TokenFlags2.IsBlankLine;
      lastBlankLinePos = start;
      contextFlags &= ~ContextFlags.InParagraph; // Reset paragraph context
    }
    
    emitToken(SyntaxKind2.NewLineTrivia, start, nlEnd, flags);
    contextFlags |= ContextFlags.AtLineStart | ContextFlags.PrecedingLineBreak;
  }
  
  /**
   * Main scanning function - Stage 1 implementation
   */
  function scanImpl(): void {
    if (pos >= end) {
      emitToken(SyntaxKind2.EndOfFileToken, pos, pos);
      return;
    }
    
    const start = pos;
    const ch = source.charCodeAt(pos);
    
    // Update indent level at line start
    if (contextFlags & ContextFlags.AtLineStart) {
      currentIndentLevel = getCurrentIndentLevel();
    }
    
    // Stage 1: Handle only text, whitespace, and newlines
    if (isLineBreak(ch)) {
      emitNewline(start);
    } else if (isWhiteSpaceSingleLine(ch) && (contextFlags & ContextFlags.AtLineStart)) {
      // Leading whitespace at line start
      emitWhitespace(start);
    } else {
      // Everything else is text content for Stage 1
      // This includes whitespace within text
      emitTextContent(start);
    }
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
    token = SyntaxKind2.Unknown;
    tokenText = '';
    tokenFlags = TokenFlags2.None;
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
    token = SyntaxKind2.Unknown;
    tokenText = '';
    tokenFlags = TokenFlags2.None;
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
  const scanner: Scanner2 = {
    // Methods
    scan,
    rollback,
    fillDebugState,
    initText: setText,
    
    // Direct field access - these are the 4 public fields
    get token() { return token; },
    set token(value: SyntaxKind2) { token = value; },
    
    get tokenText() { return tokenText; },
    set tokenText(value: string) { tokenText = value; },
    
    get tokenFlags() { return tokenFlags; },
    set tokenFlags(value: TokenFlags2) { tokenFlags = value; },
    
    get offsetNext() { return offsetNext; },
    set offsetNext(value: number) { offsetNext = value; }
  };
  
  return scanner;
}