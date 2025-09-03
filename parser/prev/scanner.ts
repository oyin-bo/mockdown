/**
 * Markdown Scanner with native HTML support
 * Following TypeScript's explicit scanner architecture with micromark-inspired logical conditions
 */

import { SyntaxKind, TokenFlags, ScannerErrorCode, TokenFlagRunLengthMask, TokenFlagRunLengthShift } from './token-types.js';
import {
  CharacterCodes,
  isLineBreak,
  isWhiteSpaceSingleLine,
  isWhiteSpace,
  isLetter,
  isDigit,
  isHexDigit,
  isAlphaNumeric,
  isIdentifierStart,
  isIdentifierPart,
  isMarkdownPunctuation,
  isTagNameCharacter,
  isAttributeNameCharacter
} from './character-codes.js';

// CommonMark HTML block tags (lowercased)
const CM_BLOCK_TAGS = new Set([
  'address','article','aside','base','basefont','blockquote','body','caption','center','col','colgroup','dd','details','dialog','dir','div','dl','dt','fieldset','figcaption','figure','footer','form','frame','frameset','h1','h2','h3','h4','h5','h6','head','header','hr','html','iframe','legend','li','link','main','menu','menuitem','meta','nav','noframes','ol','optgroup','option','p','param','section','source','summary','table','tbody','td','tfoot','th','thead','title','tr','track','ul','pre','script','style'
]);

function isCMBlockTagName(name: string): boolean {
  return CM_BLOCK_TAGS.has(name);
}

/**
 * Scanner interface matching TypeScript's scanner pattern
 */
export interface Scanner {
  getToken(): SyntaxKind;
  getTokenStart(): number;
  getTokenEnd(): number;
  getTokenText(): string;
  getTokenValue(): string;
  getTokenFlags(): TokenFlags;
  getColumn(): number;
  /** If the current token is an ordered list marker, returns its numeric start value; otherwise -1 */
  getOrderedListStart(): number;
  isUnterminated(): boolean;
  hasPrecedingLineBreak(): boolean;

  // Rescanning methods for context-sensitive tokens
  reScanLessThanToken(): SyntaxKind;
  reScanGreaterThanToken(): SyntaxKind;
  reScanSlashToken(): SyntaxKind;
  reScanBacktickToken(): SyntaxKind;
  reScanDollarToken(): SyntaxKind;
  reScanPipeToken(): SyntaxKind;
  reScanHashToken(): SyntaxKind;

  // Lookahead and trial scanning
  lookAhead<T>(callback: () => T): T;
  tryScan<T>(callback: () => T): T;

  // Core scanning
  scan(): SyntaxKind;
  setText(text: string, start?: number, length?: number): void;
  resetTokenState(pos: number): void;
  setOnError(onError: ((start: number, end: number, code: ScannerErrorCode, message: string) => void) | undefined): void;

  // Error handling
  getErrorCode(): ScannerErrorCode;
  getErrorMessage(): string;
}

/**
 * Scanner implementation with explicit TypeScript-style control flow
 */
export function createScanner(): Scanner {
  // Scanner state - encapsulated within closure, no global state
  let source = '';
  let pos = 0;
  let end = 0;
  let startPos = 0;
  let token = SyntaxKind.Unknown;
  let tokenValue: string | undefined = undefined;
  let tokenFlags = TokenFlags.None;
  let errorCode = ScannerErrorCode.None;
  let errorMessage = '';
  type ErrorCallback = (start: number, end: number, code: ScannerErrorCode, message: string) => void;
  let onError: ErrorCallback | undefined = undefined;
  // Error emission hardening: suppression/queueing during speculation and de-duplication
  type QueuedError = { start: number; end: number; code: ScannerErrorCode; message: string };
  let errorQueue: QueuedError[] = [];
  let suppressErrorDepth = 0; // >0 => suppress emissions; queue instead
  let emittedErrorKeys: Set<string> = new Set(); // de-duplicate committed emissions
  // Lazy value materialization range
  let valueStart = -1;
  let valueEnd = -1;

  // Context tracking for parsing decisions
  let atLineStart = true;
  let inParagraph = false;
  let precedingLineBreak = false;
  // removed unused containerStack for hygiene

  // Minimal internal mode and raw-text handling
  const enum InternalScanMode { Normal, RawText, Rcdata }
  let scanMode: InternalScanMode = InternalScanMode.Normal;
  let rawTextEndTag: string | undefined = undefined; // constant string like '</script>'
  // Track RCDATA end tag separately for clarity
  let rcdataEndTag: string | undefined = undefined;

  // Track current line start for column computations
  let lastLineStart = 0;
  // Track HTML block hint lifecycle (CommonMark types 1–7). When active, OR ContainsHtmlBlock into tokens
  let htmlBlockHintActive = false;
  // Ordered list start value surfaced for the last scanned numeric token if marked as list marker
  let orderedListStartValue = -1;

  // Helpers: ASCII matching without allocation
  function matchesAscii(at: number, text: string): boolean {
    const len = text.length;
    if (at + len > end) return false;
    for (let i = 0; i < len; i++) {
      if (source.charCodeAt(at + i) !== text.charCodeAt(i)) return false;
    }
    return true;
  }

  function setOnError(cb: ErrorCallback | undefined): void {
    onError = cb;
  }

  function emitError(code: ScannerErrorCode, message: string): void {
    const e: QueuedError = { start: startPos, end: pos, code, message };
    if (suppressErrorDepth > 0) {
      // During speculation: queue; do not record as emitted yet
      errorQueue.push(e);
      return;
    }
    // Immediate commit path with de-duplication
    const key = `${e.start}|${e.end}|${e.code}`;
    if (!emittedErrorKeys.has(key)) {
      // Update last error state on commit
      errorCode = e.code;
      errorMessage = e.message;
      if (onError) {
        try { onError(e.start, e.end, e.code, e.message); } catch { /* ignore user errors */ }
      }
      emittedErrorKeys.add(key);
    }
  }

  function matchesAsciiCI(at: number, text: string): boolean {
    const len = text.length;
    if (at + len > end) return false;
    for (let i = 0; i < len; i++) {
      const a = source.charCodeAt(at + i);
      const b = text.charCodeAt(i);
      if (a === b) continue;
      // Uppercase to lowercase fold for ASCII letters
      const al = (a >= 65 && a <= 90) ? a + 32 : a;
      const bl = (b >= 65 && b <= 90) ? b + 32 : b;
      if (al !== bl) return false;
    }
    return true;
  }

  function setValueRange(start: number, endPos: number): void {
    valueStart = start;
    valueEnd = endPos;
  }

  function clearValueRange(): void {
    valueStart = -1;
    valueEnd = -1;
  }

  return {
    getToken: () => token,
    getTokenStart: () => startPos,
    getTokenEnd: () => pos,
    getTokenText: () => source.substring(startPos, pos),
    getTokenValue: () => {
      if (tokenValue !== undefined) return tokenValue;
      if (valueStart >= 0) return source.substring(valueStart, valueEnd);
      return source.substring(startPos, pos);
    },
    getTokenFlags: () => tokenFlags,
    getColumn: () => {
      // Compute column from lastLineStart to current startPos
      let col = 0;
      for (let i = lastLineStart; i < startPos; i++) {
        const c = source.charCodeAt(i);
        if (c === CharacterCodes.tab) {
          const offset = col % 4;
          col += (offset === 0 ? 4 : 4 - offset);
        } else {
          col++;
        }
      }
      return col;
    },
    getOrderedListStart: () => orderedListStartValue,
    isUnterminated: () => !!(tokenFlags & TokenFlags.Unterminated),
    hasPrecedingLineBreak: () => !!(tokenFlags & TokenFlags.PrecedingLineBreak),
    getErrorCode: () => errorCode,
    getErrorMessage: () => errorMessage,

    setText,
    resetTokenState,
    setOnError,
    scan,
    lookAhead,
    tryScan,
    reScanLessThanToken,
    reScanGreaterThanToken,
    reScanSlashToken,
    reScanBacktickToken,
    reScanDollarToken,
    reScanPipeToken,
    reScanHashToken,
  };

  function setText(text: string, start?: number, length?: number): void {
    source = text;
    pos = start || 0;
    end = length !== undefined ? pos + length : source.length;
    startPos = pos;
    token = SyntaxKind.Unknown;
    tokenValue = undefined;
    tokenFlags = TokenFlags.None;
    errorCode = ScannerErrorCode.None;
    errorMessage = '';
    // Reset error emission machinery for new text
    errorQueue = [];
    suppressErrorDepth = 0;
    emittedErrorKeys.clear();
    clearValueRange();

    // Reset context
    atLineStart = pos === 0 || (pos > 0 && isLineBreak(source.charCodeAt(pos - 1)));
    inParagraph = false;
    precedingLineBreak = false;
    // containerStack removed
    scanMode = InternalScanMode.Normal;
    rawTextEndTag = undefined;
    rcdataEndTag = undefined;
    lastLineStart = pos;
    htmlBlockHintActive = false;
    orderedListStartValue = -1;
  }

  function resetTokenState(position: number): void {
    pos = position;
    startPos = position;
    token = SyntaxKind.Unknown;
    tokenValue = undefined;
    tokenFlags = TokenFlags.None;
    errorCode = ScannerErrorCode.None;
    errorMessage = '';

    // Update flags based on position context
    if (pos === 0 || (pos > 0 && isLineBreak(source.charCodeAt(pos - 1)))) {
      atLineStart = true;
      tokenFlags |= TokenFlags.IsAtLineStart;
      tokenFlags |= TokenFlags.PrecedingLineBreak;
    } else {
      atLineStart = false;
    }

    precedingLineBreak = false;
    orderedListStartValue = -1;
  }

  function lookAhead<T>(callback: () => T): T {
    const savedPos = pos;
    const savedStartPos = startPos;
    const savedToken = token;
    const savedTokenValue = tokenValue;
    const savedTokenFlags = tokenFlags;
    // Suppress and discard any errors during pure lookahead
    suppressErrorDepth++;
    const boundary = errorQueue.length;
    const result = callback();
    // Discard any queued speculative errors and exit suppression
    errorQueue.length = boundary;
    suppressErrorDepth--;
    // Restore state
    pos = savedPos;
    startPos = savedStartPos;
    token = savedToken;
    tokenValue = savedTokenValue;
    tokenFlags = savedTokenFlags;
    return result;
  }

  function tryScan<T>(callback: () => T): T {
    const savedPos = pos;
    // Buffer errors during trial; flush only on success
    suppressErrorDepth++;
    const boundary = errorQueue.length;
    const result = callback();
    suppressErrorDepth--;
    if (!result) {
      // Roll back position and forget any queued errors
      pos = savedPos;
      errorQueue.length = boundary;
      return result;
    }
    // Commit: flush queued errors from this boundary with de-duplication
    for (let i = boundary; i < errorQueue.length; i++) {
      const e = errorQueue[i];
      const key = `${e.start}|${e.end}|${e.code}`;
      if (!emittedErrorKeys.has(key)) {
        // Update last error state for committed speculative errors
        errorCode = e.code;
        errorMessage = e.message;
        if (onError) {
          try { onError(e.start, e.end, e.code, e.message); } catch { /* ignore user errors */ }
        }
        emittedErrorKeys.add(key);
      }
    }
    // Truncate queue to boundary now that errors are flushed
    errorQueue.length = boundary;
    return result;
  }

  function scan(): SyntaxKind {
    startPos = pos;
    tokenFlags = TokenFlags.None;
    tokenValue = undefined;
    clearValueRange();
    errorCode = ScannerErrorCode.None;
    errorMessage = '';
    orderedListStartValue = -1;

    if (precedingLineBreak) {
      tokenFlags |= TokenFlags.PrecedingLineBreak;
      precedingLineBreak = false;
    }

    if (atLineStart) {
      tokenFlags |= TokenFlags.IsAtLineStart;
    }

    // Mark tokens scanned in raw-text with flag
    if (scanMode === InternalScanMode.RawText) {
      tokenFlags |= TokenFlags.IsInRawText;
    } else if (scanMode === InternalScanMode.Rcdata) {
      tokenFlags |= TokenFlags.IsInRcdata;
    }

    while (pos < end) {
      const ch = source.charCodeAt(pos);

      // Raw-text content scanning: consume until the exact closing tag sequence
      if (scanMode === InternalScanMode.RawText) {
        // If we're at a potential end tag, allow normal scanning to proceed
        if (rawTextEndTag && ch === CharacterCodes.lessThan) {
          if (matchesAsciiCI(pos, rawTextEndTag)) {
            // Exit raw-text mode before scanning the closing tag
            scanMode = InternalScanMode.Normal;
            rawTextEndTag = undefined;
            // Fall through to normal scanning (will return LessThanToken/closing handling)
          } else {
            // Not the end tag; treat '<' as literal text inside raw text
            return scanRawTextContent();
          }
        } else {
          return scanRawTextContent();
        }
      } else if (scanMode === InternalScanMode.Rcdata) {
        // RCDATA: entities remain active; stop on end tag, but allow & to be scanned
        if (rcdataEndTag && ch === CharacterCodes.lessThan && matchesAsciiCI(pos, rcdataEndTag)) {
          // Exit before scanning end tag
          scanMode = InternalScanMode.Normal;
          rcdataEndTag = undefined;
          // fall through
        } else if (ch === CharacterCodes.ampersand) {
          return scanAmpersand();
        } else {
          return scanRcdataContent();
        }
      }

      // Skip whitespace trivia
      if (isWhiteSpaceSingleLine(ch)) {
        return scanWhitespace();
      }

      // Handle line breaks
      if (isLineBreak(ch)) {
        return scanLineBreak();
      }

      // Store line start context for scan functions
      const wasAtLineStart = atLineStart;

      // Explicit character-based scanning with micromark-inspired conditions
      let result: SyntaxKind;
      switch (ch) {
        case CharacterCodes.lessThan:
          result = scanLessThan();
          break;
        case CharacterCodes.greaterThan:
          result = scanGreaterThan();
          break;
        case CharacterCodes.hash:
          result = scanHash();
          break;
        case CharacterCodes.asterisk:
          result = scanAsterisk();
          break;
        case CharacterCodes.underscore:
          result = scanUnderscore();
          break;
        case CharacterCodes.minus:
          result = scanMinus();
          break;
        case CharacterCodes.backtick:
          result = scanBacktick();
          break;
        case CharacterCodes.tilde:
          result = scanTilde();
          break;
        case CharacterCodes.plus:
          result = scanPlus();
          break;
        case CharacterCodes.equals:
          result = scanEquals();
          break;
        case CharacterCodes.dollar:
          result = scanDollar();
          break;
        case CharacterCodes.openBracket:
          result = scanOpenBracket();
          break;
        case CharacterCodes.closeBracket:
          result = scanCloseBracket();
          break;
        case CharacterCodes.openParen:
          result = scanOpenParen();
          break;
        case CharacterCodes.closeParen:
          result = scanCloseParen();
          break;
        case CharacterCodes.exclamation:
          result = scanExclamation();
          break;
        case CharacterCodes.colon:
          result = scanColon();
          break;
        case CharacterCodes.bar:
          result = scanPipe();
          break;
        case CharacterCodes.backslash:
          result = scanBackslash();
          break;
        case CharacterCodes.ampersand:
          result = scanAmpersand();
          break;
        case CharacterCodes.openBrace:
          result = scanOpenBrace();
          break;
        case CharacterCodes.closeBrace:
          result = scanCloseBrace();
          break;
        case CharacterCodes.slash:
          result = scanSlash();
          break;
        default:
          if (isIdentifierStart(ch)) {
            result = scanIdentifier();
          } else if (isDigit(ch)) {
            result = scanNumber();
          } else {
            result = scanUnknown();
          }
          break;
      }

      // Update line start context after scanning - this allows scan functions
      // to use the original context for decisions but updates it for subsequent tokens
      if (wasAtLineStart && !isWhiteSpaceSingleLine(ch) && !isLineBreak(ch)) {
        atLineStart = false;
      }

      // While HTML block hint is active, mark tokens accordingly
      if (htmlBlockHintActive) tokenFlags |= TokenFlags.ContainsHtmlBlock;

      return result;
    }

    return token = SyntaxKind.EndOfFileToken;
  }

  // Character-specific scanning methods with explicit logic

  function scanLessThan(): SyntaxKind {
    const nextChar = source.charCodeAt(pos + 1);

    // HTML comment: <!--
    if (nextChar === CharacterCodes.exclamation && pos + 4 <= end &&
      source.charCodeAt(pos + 2) === CharacterCodes.minus &&
      source.charCodeAt(pos + 3) === CharacterCodes.minus) {
      return scanHtmlComment();
    }

    // HTML CDATA: <![CDATA[
    if (nextChar === CharacterCodes.exclamation && matchesAscii(pos, '<![CDATA[')) {
      return scanHtmlCDATA();
    }

    // HTML DOCTYPE: <!DOCTYPE (case insensitive)
    if (nextChar === CharacterCodes.exclamation && matchesAsciiCI(pos, '<!DOCTYPE')) {
      return scanHtmlDoctype();
    }

    // Processing instruction: <?...
    if (nextChar === CharacterCodes.question) {
      return scanProcessingInstruction();
    }

    // Closing tag: </
    if (nextChar === CharacterCodes.slash) {
      pos += 2; // consume '</'
      return token = SyntaxKind.LessThanSlashToken;
    }

    // Check for possible autolinks (URLs and emails)
    if (isLetter(nextChar) || isDigit(nextChar)) {
      let tempPos = pos + 1;
      let foundColon = false;
      let foundAt = false;
      let hasSpaces = false;

      // Scan ahead to see what we have
      while (tempPos < end && source.charCodeAt(tempPos) !== CharacterCodes.greaterThan) {
        const char = source.charCodeAt(tempPos);
        if (isWhiteSpace(char)) {
          hasSpaces = true;
          break;
        }
        if (char === CharacterCodes.colon) foundColon = true;
        if (char === CharacterCodes.at) foundAt = true;
        tempPos++;
      }

      // Only try autolink if we found > without spaces and have @ or :
      if (!hasSpaces && tempPos < end && source.charCodeAt(tempPos) === CharacterCodes.greaterThan &&
        (foundColon || foundAt)) {
        return scanAutolink();
      }
    }

    // HTML tag: <div>, <span class="foo">, etc.
    if (isTagNameCharacter(nextChar)) {
      const tagResult = scanHtmlTag();
      // If scanHtmlTag failed to find a valid tag, it returns LessThanToken
      return tagResult;
    }

    // Default: consume '<' and return LessThanToken
    pos++;
    return token = SyntaxKind.LessThanToken;
  }

  function scanGreaterThan(): SyntaxKind {
    // Blockquote at line start: > 
    if (atLineStart) {
      pos++; // consume '>'
      if (pos < end && isWhiteSpaceSingleLine(source.charCodeAt(pos))) {
        return token = SyntaxKind.BlockquoteToken;
      }
      return token = SyntaxKind.GreaterThanToken;
    }

    pos++; // consume '>'
    return token = SyntaxKind.GreaterThanToken;
  }

  function scanHash(): SyntaxKind {
    let hashCount = 0;
    let tempPos = pos;

    // Count consecutive hashes
    while (tempPos < end && source.charCodeAt(tempPos) === CharacterCodes.hash) {
      hashCount++;
      tempPos++;
    }

    // ATX heading at line start: # ## ### (including more than 6)
    if (atLineStart && hashCount >= 1) {
      // Must be followed by space or end of line
      if (tempPos >= end || isWhiteSpace(source.charCodeAt(tempPos))) {
        pos = tempPos;
        return token = SyntaxKind.HashToken;
      }
    }

    // Default: single hash
    pos++;
    return token = SyntaxKind.HashToken;
  }

  function scanAsterisk(): SyntaxKind {
    let asteriskCount = 0;
    let tempPos = pos;

    // Count consecutive asterisks
    while (tempPos < end && source.charCodeAt(tempPos) === CharacterCodes.asterisk) {
      asteriskCount++;
      tempPos++;
    }

    // List marker at line start: * item
    if (atLineStart && asteriskCount === 1) {
      if (tempPos < end && isWhiteSpaceSingleLine(source.charCodeAt(tempPos))) {
        pos = tempPos;
        return token = SyntaxKind.AsteriskToken;
      }
    }

    // Thematic break at line start: *** (3+ contiguous asterisks)
    if (atLineStart && asteriskCount >= 3) {
      // Skip trailing spaces/tabs
      while (tempPos < end) {
        const c = source.charCodeAt(tempPos);
        if (c !== CharacterCodes.space && c !== CharacterCodes.tab) break;
        tempPos++;
      }
      if (tempPos >= end || isLineBreak(source.charCodeAt(tempPos))) {
        pos = tempPos;
        return token = SyntaxKind.AsteriskToken;
      }
    }

    // Emphasis/strong flanking flags
    const prev = startPos > 0 ? source.charCodeAt(startPos - 1) : CharacterCodes.space;
    const next = tempPos < end ? source.charCodeAt(tempPos) : CharacterCodes.space;
    const prevWs = isWhiteSpace(prev);
    const nextWs = isWhiteSpace(next);
    const prevP = isMarkdownPunctuation(prev);
    const nextP = isMarkdownPunctuation(next);
    const leftFlanking = !nextWs && !(nextP && !prevWs && !prevP);
    const rightFlanking = !prevWs && !(prevP && !nextWs && !nextP);
    const canOpen = leftFlanking;
    const canClose = rightFlanking;

    if (asteriskCount === 2) {
      pos += 2;
      if (canOpen) tokenFlags |= TokenFlags.CanOpen;
      if (canClose) tokenFlags |= TokenFlags.CanClose;
      return token = SyntaxKind.AsteriskAsterisk;
    }

    pos++;
    if (canOpen) tokenFlags |= TokenFlags.CanOpen;
    if (canClose) tokenFlags |= TokenFlags.CanClose;
    return token = SyntaxKind.AsteriskToken;
  }

  function scanUnderscore(): SyntaxKind {
    let underscoreCount = 0;
    let tempPos = pos;

    // Count consecutive underscores
    while (tempPos < end && source.charCodeAt(tempPos) === CharacterCodes.underscore) {
      underscoreCount++;
      tempPos++;
    }

    // Thematic break at line start: ___ (3+ contiguous underscores)
    if (atLineStart && underscoreCount >= 3) {
      // Skip trailing spaces/tabs
      while (tempPos < end) {
        const c = source.charCodeAt(tempPos);
        if (c !== CharacterCodes.space && c !== CharacterCodes.tab) break;
        tempPos++;
      }
      if (tempPos >= end || isLineBreak(source.charCodeAt(tempPos))) {
        pos = tempPos;
        return token = SyntaxKind.UnderscoreToken;
      }
    }

    // Emphasis/strong flanking flags (underscore constraints)
    const prev = startPos > 0 ? source.charCodeAt(startPos - 1) : CharacterCodes.space;
    const next = tempPos < end ? source.charCodeAt(tempPos) : CharacterCodes.space;
    const prevWs = isWhiteSpace(prev);
    const nextWs = isWhiteSpace(next);
    const prevP = isMarkdownPunctuation(prev);
    const nextP = isMarkdownPunctuation(next);
    const prevAlnum = isAlphaNumeric(prev);
    const nextAlnum = isAlphaNumeric(next);
    const leftFlanking = !nextWs && !(nextP && !prevWs && !prevP);
    const rightFlanking = !prevWs && !(prevP && !nextWs && !nextP);
    const intraword = prevAlnum && nextAlnum;
    const canOpen = !intraword && leftFlanking;
    const canClose = !intraword && rightFlanking;

    if (underscoreCount === 2) {
      pos += 2;
      if (canOpen) tokenFlags |= TokenFlags.CanOpen;
      if (canClose) tokenFlags |= TokenFlags.CanClose;
      return token = SyntaxKind.UnderscoreUnderscore;
    }

    pos++;
    if (canOpen) tokenFlags |= TokenFlags.CanOpen;
    if (canClose) tokenFlags |= TokenFlags.CanClose;
    return token = SyntaxKind.UnderscoreToken;
  }

  function scanMinus(): SyntaxKind {
    pos++; // consume first '-'

    // Check for frontmatter fence at document start: ---
    if (pos === 1) { // we're at document start
      if (pos + 1 < end && source.charCodeAt(pos) === CharacterCodes.minus &&
        pos + 2 < end && source.charCodeAt(pos + 1) === CharacterCodes.minus) {
        // Check if this is a frontmatter fence (--- followed by newline)
        let tempPos = pos + 2;
        while (tempPos < end && source.charCodeAt(tempPos) === CharacterCodes.minus) {
          tempPos++;
        }
        // Skip trailing spaces
        while (tempPos < end && source.charCodeAt(tempPos) === CharacterCodes.space) {
          tempPos++;
        }
        if (tempPos >= end || isLineBreak(source.charCodeAt(tempPos))) {
          pos = tempPos;
          return token = SyntaxKind.DashDashDash;
        }
      }
    }

    // Check for list marker at line start: - item
    if (atLineStart && pos < end &&
      isWhiteSpaceSingleLine(source.charCodeAt(pos))) {
      return token = SyntaxKind.DashToken;
    }

    // Check for setext underline: --- (at line start, after paragraph)
    if (atLineStart && inParagraph) {
      let tempPos = pos;
      let dashCount = 1;
      while (tempPos < end && source.charCodeAt(tempPos) === CharacterCodes.minus) {
        dashCount++;
        tempPos++;
      }
      // Skip spaces
      while (tempPos < end && source.charCodeAt(tempPos) === CharacterCodes.space) {
        tempPos++;
      }
      // Must end with newline or EOF
      if (tempPos >= end || isLineBreak(source.charCodeAt(tempPos))) {
        pos = tempPos;
        return token = SyntaxKind.DashToken;
      }
    }

    // Check for thematic break: --- (3+ contiguous dashes)
    if (atLineStart) {
      let tempPos = pos;
      let dashCount = 1;
      while (tempPos < end && source.charCodeAt(tempPos) === CharacterCodes.minus) {
        dashCount++;
        tempPos++;
      }
      if (dashCount >= 3) {
        // Skip spaces/tabs
        while (tempPos < end) {
          const c = source.charCodeAt(tempPos);
          if (c !== CharacterCodes.space && c !== CharacterCodes.tab) break;
          tempPos++;
        }
        if (tempPos >= end || isLineBreak(source.charCodeAt(tempPos))) {
          pos = tempPos;
          return token = SyntaxKind.DashToken;
        }
      }
    }

    return token = SyntaxKind.DashToken;
  }

  function scanBacktick(): SyntaxKind {
    let backtickCount = 0;
    let tempPos = pos;

    // Count consecutive backticks
    while (tempPos < end && source.charCodeAt(tempPos) === CharacterCodes.backtick) {
      backtickCount++;
      tempPos++;
    }

    pos = tempPos;

    // Code fences at line start: ```
    if ((tokenFlags & TokenFlags.IsAtLineStart) && backtickCount >= 3) {
      // Compute info string range without allocation
      const infoStart = pos;
      while (pos < end && !isLineBreak(source.charCodeAt(pos))) {
        pos++;
      }
      // Trim spaces/tabs
      let s = infoStart;
      while (s < pos && (source.charCodeAt(s) === CharacterCodes.space || source.charCodeAt(s) === CharacterCodes.tab)) s++;
      let e = pos;
      while (e > s && (source.charCodeAt(e - 1) === CharacterCodes.space || source.charCodeAt(e - 1) === CharacterCodes.tab)) e--;
      if (e > s) {
        setValueRange(s, e);
      } else {
        // Explicitly set empty value so getTokenValue() doesn't fall back to token text
        tokenValue = '';
        clearValueRange();
      }
      // store run length
      tokenFlags = (tokenFlags & ~TokenFlagRunLengthMask) | ((backtickCount << TokenFlagRunLengthShift) & TokenFlagRunLengthMask);
      return token = SyntaxKind.BacktickToken;
    }

    // Inline code: `code` or ``code with ` backtick``
    tokenFlags = (tokenFlags & ~TokenFlagRunLengthMask) | ((backtickCount << TokenFlagRunLengthShift) & TokenFlagRunLengthMask);
    return token = SyntaxKind.BacktickToken;
  }

  function scanTilde(): SyntaxKind {
    let tildeCount = 0;
    let tempPos = pos;

    // Count consecutive tildes
    while (tempPos < end && source.charCodeAt(tempPos) === CharacterCodes.tilde) {
      tildeCount++;
      tempPos++;
    }

    // Code fences at line start: ~~~
    if (atLineStart && tildeCount >= 3) {
      pos = tempPos;
      // Compute info string range without allocation
      const infoStart = pos;
      while (pos < end && !isLineBreak(source.charCodeAt(pos))) {
        pos++;
      }
      // Trim spaces/tabs
      let s = infoStart;
      while (s < pos && (source.charCodeAt(s) === CharacterCodes.space || source.charCodeAt(s) === CharacterCodes.tab)) s++;
      let e = pos;
      while (e > s && (source.charCodeAt(e - 1) === CharacterCodes.space || source.charCodeAt(e - 1) === CharacterCodes.tab)) e--;
      if (e > s) setValueRange(s, e); else clearValueRange();
      tokenFlags = (tokenFlags & ~TokenFlagRunLengthMask) | ((tildeCount << TokenFlagRunLengthShift) & TokenFlagRunLengthMask);
      return token = SyntaxKind.TildeToken;
    }

    // Strikethrough: ~~ 
    if (tildeCount === 2) {
      pos += 2;
      return token = SyntaxKind.TildeTilde;
    }

    pos++;
    tokenFlags = (tokenFlags & ~TokenFlagRunLengthMask) | ((1 << TokenFlagRunLengthShift) & TokenFlagRunLengthMask);
    return token = SyntaxKind.TildeToken;
  }

  function scanPlus(): SyntaxKind {
    pos++; // consume '+'

    // Check for frontmatter fence at document start: +++
    if (pos === 1) { // we're at document start
      if (pos + 1 < end && source.charCodeAt(pos) === CharacterCodes.plus &&
        pos + 2 < end && source.charCodeAt(pos + 1) === CharacterCodes.plus) {
        // Check if this is a TOML frontmatter fence (+++ followed by newline)
        let tempPos = pos + 2;
        while (tempPos < end && source.charCodeAt(tempPos) === CharacterCodes.plus) {
          tempPos++;
        }
        // Skip trailing spaces
        while (tempPos < end && source.charCodeAt(tempPos) === CharacterCodes.space) {
          tempPos++;
        }
        if (tempPos >= end || isLineBreak(source.charCodeAt(tempPos))) {
          pos = tempPos;
          return token = SyntaxKind.PlusToken; // Use generic token, could add specific TOML fence token
        }
      }
    }

    // List marker at line start: + item
    if (atLineStart && pos < end &&
      isWhiteSpaceSingleLine(source.charCodeAt(pos))) {
      return token = SyntaxKind.PlusToken;
    }

    return token = SyntaxKind.PlusToken;
  }

  function scanEquals(): SyntaxKind {
    pos++; // consume first '='

    // Setext underline: === (at line start, after paragraph)
    if (atLineStart && inParagraph) {
      let tempPos = pos;
      let equalsCount = 1;
      while (tempPos < end && source.charCodeAt(tempPos) === CharacterCodes.equals) {
        equalsCount++;
        tempPos++;
      }
      // Skip spaces
      while (tempPos < end && source.charCodeAt(tempPos) === CharacterCodes.space) {
        tempPos++;
      }
      // Must end with newline or EOF
      if (tempPos >= end || isLineBreak(source.charCodeAt(tempPos))) {
        pos = tempPos;
        return token = SyntaxKind.EqualsToken;
      }
    }

    return token = SyntaxKind.EqualsToken;
  }

  function scanDollar(): SyntaxKind {
    pos++; // consume first $

    // Check if next char is also $ (for potential $$)
    if (pos < end && source.charCodeAt(pos) === CharacterCodes.dollar) {
      // This is $$, but only return DollarDollar if at line start
      if (tokenFlags & TokenFlags.IsAtLineStart) {
        pos++; // consume second $
        tokenFlags |= TokenFlags.ContainsMath;
        return token = SyntaxKind.DollarDollar;
      }
      // Not at line start, return single $ token (don't consume second $)
    }

    // For single $ tokens, check if it's valid math (has closing $)
    let searchPos = pos;
    let foundClosing = false;
    while (searchPos < end) {
      if (source.charCodeAt(searchPos) === CharacterCodes.dollar) {
        foundClosing = true;
        break;
      }
      searchPos++;
    }

    if (foundClosing && pos < end && !isWhiteSpaceSingleLine(source.charCodeAt(pos))) {
      tokenFlags |= TokenFlags.ContainsMath;
    }

    return token = SyntaxKind.DollarToken;
  }

  function scanOpenBracket(): SyntaxKind {
    // Reference definition hint: [label]: at line start
    if (tokenFlags & TokenFlags.IsAtLineStart) {
      let i = pos + 1; // after '['
      let sawClose = false;
      while (i < end) {
        const c = source.charCodeAt(i);
        if (c === CharacterCodes.closeBracket) { sawClose = true; break; }
        if (isLineBreak(c)) break;
        i++;
      }
      if (sawClose) {
        let j = i + 1;
        // optional spaces/tabs
        while (j < end && (source.charCodeAt(j) === CharacterCodes.space || source.charCodeAt(j) === CharacterCodes.tab)) j++;
        if (j < end && source.charCodeAt(j) === CharacterCodes.colon) {
          tokenFlags |= TokenFlags.MaybeDefinition;
        }
      }
    }
    pos++;
    return token = SyntaxKind.OpenBracketToken;
  }

  function scanCloseBracket(): SyntaxKind {
    pos++;
    return token = SyntaxKind.CloseBracketToken;
  }

  function scanOpenParen(): SyntaxKind {
    pos++;
    return token = SyntaxKind.OpenParenToken;
  }

  function scanCloseParen(): SyntaxKind {
    pos++;
    return token = SyntaxKind.CloseParenToken;
  }

  function scanExclamation(): SyntaxKind {
    pos++;
    return token = SyntaxKind.ExclamationToken;
  }

  function scanColon(): SyntaxKind {
    pos++;
    return token = SyntaxKind.ColonToken;
  }

  function scanPipe(): SyntaxKind {
    pos++; // consume '|'

    // Table pipe disambiguation:
    // - At line start or after whitespace: likely table row
    // - Following alphanumeric content: likely table cell separator
    // For now, always return pipe token - parser will handle table context
    return token = SyntaxKind.PipeToken;
  }

  function scanBackslash(): SyntaxKind {
    pos++; // consume '\\'

    if (pos >= end) {
      return token = SyntaxKind.BackslashToken;
    }

    const nextChar = source.charCodeAt(pos);

    // Hard line break: \\ at end of line
    if (isLineBreak(nextChar)) {
      return token = SyntaxKind.BackslashToken;
    }

    // Character escape: \\* \\_ \\# etc.
    if (isMarkdownPunctuation(nextChar)) {
      pos++; // consume escaped character
      tokenValue = String.fromCharCode(nextChar);
      tokenFlags |= TokenFlags.IsEscaped;
      return token = SyntaxKind.HtmlText; // escaped chars become literal text
    }

    return token = SyntaxKind.BackslashToken;
  }

  function scanAmpersand(): SyntaxKind {
    // HTML entity: &amp; &#123; &#x1F;
    const start = startPos;
    pos++; // consume '&'

    if (pos >= end) {
      return token = SyntaxKind.AmpersandToken;
    }

    // We'll scan ahead using a temporary position and only commit on success
    let tempPos = pos;

    // Named entity: &name;
    if (isLetter(source.charCodeAt(tempPos))) {
      while (tempPos < end && (isLetter(source.charCodeAt(tempPos)) || isDigit(source.charCodeAt(tempPos)))) {
        tempPos++;
      }
      if (tempPos < end && source.charCodeAt(tempPos) === CharacterCodes.semicolon) {
        tempPos++; // include ';'
        setValueRange(start, tempPos);
        pos = tempPos;
        return token = SyntaxKind.HtmlText;
      }
      // Invalid named entity (no ';') -> fall back to '&'
      pos = start + 1;
      return token = SyntaxKind.AmpersandToken;
    }

    // Numeric entity: &#123; or &#x1F;
    if (source.charCodeAt(tempPos) === CharacterCodes.hash) {
      tempPos++; // consume '#'

      let isHex = false;
      if (tempPos < end && (source.charCodeAt(tempPos) === CharacterCodes.x || source.charCodeAt(tempPos) === CharacterCodes.X)) {
        isHex = true;
        tempPos++;
      }

      const digitsStart = tempPos;
      if (isHex) {
        while (tempPos < end && isHexDigit(source.charCodeAt(tempPos))) tempPos++;
      } else {
        while (tempPos < end && isDigit(source.charCodeAt(tempPos))) tempPos++;
      }

      // Require at least one digit and a terminating semicolon
      if (tempPos > digitsStart && tempPos < end && source.charCodeAt(tempPos) === CharacterCodes.semicolon) {
        tempPos++; // include ';'
        setValueRange(start, tempPos);
        pos = tempPos;
        return token = SyntaxKind.HtmlText;
      }

      // Invalid numeric entity -> fall back to '&'
      pos = start + 1;
      return token = SyntaxKind.AmpersandToken;
    }

    // Not an entity -> just '&'
    return token = SyntaxKind.AmpersandToken;
  }

  function scanWhitespace(): SyntaxKind {
    while (pos < end && isWhiteSpaceSingleLine(source.charCodeAt(pos))) {
      pos++;
    }
    return token = SyntaxKind.WhitespaceTrivia;
  }

  function scanLineBreak(): SyntaxKind {
    const ch = source.charCodeAt(pos);
    // Capture where the line break starts to examine the preceding line content
    const lineBreakStart = pos;
    pos++;

    // Handle CRLF
    if (ch === CharacterCodes.carriageReturn && pos < end &&
      source.charCodeAt(pos) === CharacterCodes.lineFeed) {
      pos++;
    }

    // Update context flags
    atLineStart = true;
    precedingLineBreak = true;
    tokenFlags |= TokenFlags.PrecedingLineBreak;
    // Blank line flag: if the segment from lastLineStart to the start of the
    // line break contains only spaces/tabs (or is empty), mark as blank line.
    let isBlank = true;
    for (let i = lastLineStart; i < lineBreakStart; i++) {
      const c = source.charCodeAt(i);
      if (c !== CharacterCodes.space && c !== CharacterCodes.tab) { isBlank = false; break; }
    }
    if (isBlank) tokenFlags |= TokenFlags.IsBlankLine;
    // Hard line break hint: if at least two spaces before newline
    let s = pos - 2; // pos is after consuming LF or CRLF
    let spaceCount = 0;
    while (s >= 0 && source.charCodeAt(s) === CharacterCodes.space) { spaceCount++; s--; }
    if (spaceCount >= 2) tokenFlags |= TokenFlags.HardBreakHint;
    lastLineStart = pos;

    // If an HTML block is active, propagate hint to this newline token as well
    if (htmlBlockHintActive) tokenFlags |= TokenFlags.ContainsHtmlBlock;

    // Determine if next line is blank (only spaces/tabs until next line break or EOF)
    let i = pos;
    while (i < end && (source.charCodeAt(i) === CharacterCodes.space || source.charCodeAt(i) === CharacterCodes.tab)) i++;
    if (i >= end || isLineBreak(source.charCodeAt(i))) {
      htmlBlockHintActive = false;
    }

    return token = SyntaxKind.NewLineTrivia;
  }

  function scanIdentifier(): SyntaxKind {
    // In Markdown context, identifiers can include underscores, but we must
    // avoid consuming a double-underscore run here because that sequence is
    // handled by `scanUnderscore()` (for strong emphasis tokens). This keeps
    // intraword single underscores (like `a_b_`) as part of the Identifier
    // while leaving `__` available as a separate token.
    while (pos < end) {
      const ch = source.charCodeAt(pos);
      if (!isAlphaNumeric(ch) && ch !== CharacterCodes.underscore) {
        break;
      }
      // If we see an underscore and the next character is also an
      // underscore, stop here so the double-underscore can be tokenized by
      // scanUnderscore(). Otherwise consume the underscore as part of the
      // identifier (preserving intraword behavior).
      if (ch === CharacterCodes.underscore && pos + 1 < end && source.charCodeAt(pos + 1) === CharacterCodes.underscore) {
        break;
      }
      pos++;
    }
    return token = SyntaxKind.Identifier;
  }

  function scanNumber(): SyntaxKind {
    const numStart = pos;
    while (pos < end && isDigit(source.charCodeAt(pos))) {
      pos++;
    }
    // Ordered list marker detection at line start (indent 0–3): digits+ ('.' or ')') followed by space
    if (tokenFlags & TokenFlags.IsAtLineStart) {
      // compute visual column from lastLineStart to numStart
      let col = 0;
      for (let i = lastLineStart; i < numStart; i++) {
        const c = source.charCodeAt(i);
        if (c === CharacterCodes.tab) {
          const offset = col % 4; col += (offset === 0 ? 4 : 4 - offset);
        } else {
          col++;
        }
      }
      if (pos < end && (source.charCodeAt(pos) === CharacterCodes.dot || source.charCodeAt(pos) === CharacterCodes.closeParen)) {
        const delim = source.charCodeAt(pos);
        const after = pos + 1;
        if (col <= 3 && after < end && isWhiteSpaceSingleLine(source.charCodeAt(after))) {
          tokenFlags |= TokenFlags.IsOrderedListMarker;
          if (delim === CharacterCodes.closeParen) tokenFlags |= TokenFlags.OrderedListDelimiterParen;
          // compute numeric value without allocation
          let v = 0;
          for (let i = numStart; i < pos; i++) {
            v = v * 10 + (source.charCodeAt(i) - CharacterCodes._0);
            // Clamp to safe integer range (not strictly necessary here)
            if (v > 2147483647) { v = 2147483647; break; }
          }
          orderedListStartValue = v;
        }
      }
    }
    return token = SyntaxKind.NumericLiteral;
  }

  function scanUnknown(): SyntaxKind {
    pos++;
    return token = SyntaxKind.Unknown;
  }

  function scanHtmlComment(): SyntaxKind {
    // Skip '<!--'
    pos += 4; // consume '<!--'

    const contentStart = pos;

    // Scan until -->
    while (pos + 2 < end) {
      if (source.charCodeAt(pos) === CharacterCodes.minus &&
        source.charCodeAt(pos + 1) === CharacterCodes.minus &&
        source.charCodeAt(pos + 2) === CharacterCodes.greaterThan) {
        setValueRange(contentStart, pos);
        pos += 3; // consume '-->'  
        tokenFlags |= TokenFlags.ContainsHtml;
        if (tokenFlags & TokenFlags.IsAtLineStart) { tokenFlags |= TokenFlags.ContainsHtmlBlock; htmlBlockHintActive = true; }
        return token = SyntaxKind.HtmlComment;
      }
      pos++;
    }

    // Unterminated comment
    tokenFlags |= TokenFlags.Unterminated;
    tokenFlags |= TokenFlags.ContainsHtml;
    if (tokenFlags & TokenFlags.IsAtLineStart) { tokenFlags |= TokenFlags.ContainsHtmlBlock; htmlBlockHintActive = true; }
    setValueRange(contentStart, end);
    pos = end;
    emitError(ScannerErrorCode.UnterminatedComment, 'Unterminated HTML comment');
    return token = SyntaxKind.HtmlComment;
  }

  function scanHtmlCDATA(): SyntaxKind {
    // Skip '<![CDATA['
    pos += 9; // consume '<![CDATA['

    const contentStart = pos;

    // Scan until ]]>
    while (pos + 2 < end) {
      if (source.charCodeAt(pos) === CharacterCodes.closeBracket &&
        source.charCodeAt(pos + 1) === CharacterCodes.closeBracket &&
        source.charCodeAt(pos + 2) === CharacterCodes.greaterThan) {
        setValueRange(contentStart, pos);
        pos += 3; // consume ']]>'
        tokenFlags |= TokenFlags.ContainsHtml;
        if (tokenFlags & TokenFlags.IsAtLineStart) { tokenFlags |= TokenFlags.ContainsHtmlBlock; htmlBlockHintActive = true; }
        return token = SyntaxKind.HtmlCDATA;
      }
      pos++;
    }

    // Unterminated CDATA
    tokenFlags |= TokenFlags.Unterminated;
    tokenFlags |= TokenFlags.ContainsHtml;
    if (tokenFlags & TokenFlags.IsAtLineStart) { tokenFlags |= TokenFlags.ContainsHtmlBlock; htmlBlockHintActive = true; }
    setValueRange(contentStart, end);
    pos = end;
    emitError(ScannerErrorCode.UnterminatedCDATA, 'Unterminated CDATA section');
    return token = SyntaxKind.HtmlCDATA;
  }

  function scanHtmlDoctype(): SyntaxKind {
    // Skip '<!DOCTYPE' or '<!doctype'
    pos += 9; // consume '<!DOCTYPE' or '<!doctype'

    const contentStart = pos;

    // Scan until >
    while (pos < end && source.charCodeAt(pos) !== CharacterCodes.greaterThan) {
      pos++;
    }

    if (pos < end && source.charCodeAt(pos) === CharacterCodes.greaterThan) {
      // Exclude closing '>' and trim without allocation
      const rawEnd = pos; // points to '>'
      pos++; // consume '>'
      let s = contentStart;
      while (s < rawEnd && isWhiteSpace(source.charCodeAt(s))) s++;
      let e = rawEnd - 1;
      while (e >= s && isWhiteSpace(source.charCodeAt(e))) e--;
      setValueRange(s, e + 1);
      tokenFlags |= TokenFlags.ContainsHtml;
      if (tokenFlags & TokenFlags.IsAtLineStart) { tokenFlags |= TokenFlags.ContainsHtmlBlock; htmlBlockHintActive = true; }
      return token = SyntaxKind.HtmlDoctype;
    }

    // Unterminated DOCTYPE
    tokenFlags |= TokenFlags.Unterminated;
    tokenFlags |= TokenFlags.ContainsHtml;
    if (tokenFlags & TokenFlags.IsAtLineStart) { tokenFlags |= TokenFlags.ContainsHtmlBlock; htmlBlockHintActive = true; }
    setValueRange(contentStart, end);
    pos = end;
    return token = SyntaxKind.HtmlDoctype;
  }

  function scanProcessingInstruction(): SyntaxKind {
    // Skip '<?'
    pos += 2;

    const contentStart = pos;

    // Scan until ?>
    while (pos + 1 < end) {
      if (source.charCodeAt(pos) === CharacterCodes.question &&
        source.charCodeAt(pos + 1) === CharacterCodes.greaterThan) {
        setValueRange(contentStart, pos);
        pos += 2; // consume '?>'
        tokenFlags |= TokenFlags.ContainsHtml;
        if (tokenFlags & TokenFlags.IsAtLineStart) { tokenFlags |= TokenFlags.ContainsHtmlBlock; htmlBlockHintActive = true; }
        return token = SyntaxKind.HtmlProcessingInstruction;
      }
      pos++;
    }

    // Unterminated processing instruction
    tokenFlags |= TokenFlags.Unterminated;
    tokenFlags |= TokenFlags.ContainsHtml;
    if (tokenFlags & TokenFlags.IsAtLineStart) { tokenFlags |= TokenFlags.ContainsHtmlBlock; htmlBlockHintActive = true; }
    setValueRange(contentStart, end);
    pos = end;
    return token = SyntaxKind.HtmlProcessingInstruction;
  }

  function scanAutolink(): SyntaxKind {
    const start = pos; // remember start position
    pos++; // consume '<'

    const contentStart = pos;

    // Scan until >
    while (pos < end && source.charCodeAt(pos) !== CharacterCodes.greaterThan &&
      !isWhiteSpace(source.charCodeAt(pos))) {
      pos++;
    }

    if (pos < end && source.charCodeAt(pos) === CharacterCodes.greaterThan) {
      // Validate email or URL in-place without allocation
      let i = contentStart;
      let hasAt = false;
      let atPos = -1;
      let hasDotAfterAt = false;
      while (i < pos) {
        const c = source.charCodeAt(i);
        if (c === CharacterCodes.at) {
          hasAt = true;
          atPos = i;
        } else if (c === CharacterCodes.dot) {
          if (hasAt && i > atPos + 1) hasDotAfterAt = true;
        }
        i++;
      }
      const emailValid = hasAt && hasDotAfterAt && atPos > contentStart && atPos < pos - 1;

      // URL: (http|https|ftp):// and at least one '.' after scheme
      let urlValid = false;
      let p = contentStart;
      // match 'http' or 'https' or 'ftp'
      if (matchesAscii(p, 'http')) {
        p += 4;
        if (p < pos && source.charCodeAt(p) === CharacterCodes.s) p++;
      } else if (matchesAscii(p, 'ftp')) {
        p += 3;
      }
      if (p > contentStart) {
        if (p + 2 < pos && source.charCodeAt(p) === CharacterCodes.colon &&
          source.charCodeAt(p + 1) === CharacterCodes.slash &&
          source.charCodeAt(p + 2) === CharacterCodes.slash) {
          let q = p + 3;
          let hasDot = false;
          while (q < pos) {
            if (source.charCodeAt(q) === CharacterCodes.dot) { hasDot = true; break; }
            q++;
          }
          urlValid = hasDot;
        }
      }

      if (emailValid || urlValid) {
        // Set value range to enclosed content
        setValueRange(contentStart, pos);
        pos++; // consume '>'
        if (emailValid) tokenFlags |= TokenFlags.IsAutolinkEmail; else tokenFlags |= TokenFlags.IsAutolinkUrl;
        return token = SyntaxKind.HtmlText;
      }
    }

    // Not a valid autolink, reset and return LessThanToken
    pos = start + 1;
    return token = SyntaxKind.LessThanToken;
  }

  function scanHtmlTag(): SyntaxKind {
    const start = startPos; // include '<'
    pos++; // consume '<'

    // Scan tag name - must be at least one character and valid
    const tagNameStart = pos;
    while (pos < end && isTagNameCharacter(source.charCodeAt(pos))) {
      pos++;
    }

    // Must have a valid tag name (at least one character)
    if (pos === tagNameStart) {
      pos = start + 1;
      return token = SyntaxKind.LessThanToken;
    }

    // Detect raw-text and RCDATA elements by tag name without allocation
    const tagLen = pos - tagNameStart;
    let rawTextCandidate: string | undefined = undefined;
    let rcdataCandidate: string | undefined = undefined;
    // Compare case-insensitively by length + ascii match
    if (tagLen === 6 && matchesAsciiCI(tagNameStart, 'script')) rawTextCandidate = '</script>';
    else if (tagLen === 5 && matchesAsciiCI(tagNameStart, 'style')) rawTextCandidate = '</style>';
    else if (tagLen === 8 && matchesAsciiCI(tagNameStart, 'textarea')) rcdataCandidate = '</textarea>';
    else if (tagLen === 5 && matchesAsciiCI(tagNameStart, 'title')) rcdataCandidate = '</title>';

    // If next character is whitespace, check if it's followed by valid attributes or >
    if (pos < end && isWhiteSpace(source.charCodeAt(pos))) {
      const afterTagName = pos;
      // Skip whitespace
      while (pos < end && isWhiteSpace(source.charCodeAt(pos))) {
        pos++;
      }
      // If we don't find valid attributes or closing >, this isn't a valid tag
      if (pos >= end ||
        (!isAttributeNameCharacter(source.charCodeAt(pos)) &&
          source.charCodeAt(pos) !== CharacterCodes.greaterThan &&
          source.charCodeAt(pos) !== CharacterCodes.slash)) {
        pos = start + 1;
        return token = SyntaxKind.LessThanToken;
      }
      pos = afterTagName; // reset for attribute scanning
    }

    // Skip attributes
    while (pos < end && source.charCodeAt(pos) !== CharacterCodes.greaterThan &&
      source.charCodeAt(pos) !== CharacterCodes.slash) {
      if (isWhiteSpace(source.charCodeAt(pos))) {
        // Skip whitespace
        while (pos < end && isWhiteSpace(source.charCodeAt(pos))) {
          pos++;
        }
      } else if (isAttributeNameCharacter(source.charCodeAt(pos))) {
        // Skip attribute name
        while (pos < end && isAttributeNameCharacter(source.charCodeAt(pos))) {
          pos++;
        }
        // Skip = and value
        if (pos < end && source.charCodeAt(pos) === CharacterCodes.equals) {
          pos++; // consume '='
          // Skip attribute value (quoted or unquoted)
          if (pos < end && (source.charCodeAt(pos) === CharacterCodes.doubleQuote ||
            source.charCodeAt(pos) === CharacterCodes.singleQuote)) {
            const quote = source.charCodeAt(pos);
            pos++; // consume opening quote
            while (pos < end && source.charCodeAt(pos) !== quote) {
              pos++;
            }
            if (pos < end) pos++; // consume closing quote
          } else {
            // Unquoted attribute value
            while (pos < end && !isWhiteSpace(source.charCodeAt(pos)) &&
              source.charCodeAt(pos) !== CharacterCodes.greaterThan &&
              source.charCodeAt(pos) !== CharacterCodes.slash) {
              pos++;
            }
          }
        }
      } else {
        pos++; // skip unknown character
      }
    }

    // Handle tag ending
    if (pos < end && source.charCodeAt(pos) === CharacterCodes.slash) {
      pos++; // consume '/'
      if (pos < end && source.charCodeAt(pos) === CharacterCodes.greaterThan) {
        pos++; // consume '>'
        tokenFlags |= TokenFlags.ContainsHtml;
        return token = SyntaxKind.HtmlText;
      }
    } else if (pos < end && source.charCodeAt(pos) === CharacterCodes.greaterThan) {
      pos++; // consume '>'
      tokenFlags |= TokenFlags.ContainsHtml;
      if (tokenFlags & TokenFlags.IsAtLineStart) {
        // Only set HTML block hint for CommonMark block tags
        const tagName = source.substring(tagNameStart, tagNameStart + tagLen).toLowerCase();
        if (isCMBlockTagName(tagName)) { tokenFlags |= TokenFlags.ContainsHtmlBlock; htmlBlockHintActive = true; }
      }
      // Enter raw-text mode for specific elements (only for opening tags)
      if (rawTextCandidate) {
        rawTextEndTag = rawTextCandidate; // constant string e.g. '</script>'
        scanMode = InternalScanMode.RawText;
      } else if (rcdataCandidate) {
        rcdataEndTag = rcdataCandidate;
        scanMode = InternalScanMode.Rcdata;
      }
      return token = SyntaxKind.HtmlText;
    }

    // Not a complete tag, reset
    pos = startPos + 1;
    return token = SyntaxKind.LessThanToken;
  }

  function reScanLessThanToken(): SyntaxKind {
    pos = startPos;
    // Decide based on the actual character at start
    if (source.charCodeAt(pos) === CharacterCodes.lessThan) return scanLessThan();
    return scan();
  }

  function reScanGreaterThanToken(): SyntaxKind {
    pos = startPos;
    if (source.charCodeAt(pos) === CharacterCodes.greaterThan) return scanGreaterThan();
    return scan();
  }

  function reScanSlashToken(): SyntaxKind {
    pos = startPos;
    if (source.charCodeAt(pos) === CharacterCodes.slash) return scanSlash();
    return scan();
  }

  function reScanBacktickToken(): SyntaxKind {
    pos = startPos;
    if (source.charCodeAt(pos) === CharacterCodes.backtick) return scanBacktick();
    return scan();
  }

  function reScanDollarToken(): SyntaxKind {
    pos = startPos;
    if (source.charCodeAt(pos) === CharacterCodes.dollar) return scanDollar();
    return scan();
  }

  function reScanPipeToken(): SyntaxKind {
    pos = startPos;
    if (source.charCodeAt(pos) === CharacterCodes.bar) return scanPipe();
    return scan();
  }

  function reScanHashToken(): SyntaxKind {
    pos = startPos;
    if (source.charCodeAt(pos) === CharacterCodes.hash) return scanHash();
    return scan();
  }

  function scanRawTextContent(): SyntaxKind {
    const start = pos;
    while (pos < end) {
      const ch = source.charCodeAt(pos);
      if (ch === CharacterCodes.lessThan) {
        if (rawTextEndTag && matchesAsciiCI(pos, rawTextEndTag)) {
          break; // do not consume the closing tag start
        }
      }
      pos++;
    }
    if (pos > start) {
      setValueRange(start, pos);
      tokenFlags |= TokenFlags.ContainsHtml;
      tokenFlags |= TokenFlags.IsInRawText;
      // If we reached EOF without finding a closing tag, flag unterminated
      if (pos >= end && rawTextEndTag) {
        tokenFlags |= TokenFlags.Unterminated;
        emitError(ScannerErrorCode.UnexpectedEndOfFile, 'Unterminated RAWTEXT element content');
      }
      return token = SyntaxKind.HtmlText;
    }
    // Fallback if nothing consumed
    return scan();
  }

  function scanRcdataContent(): SyntaxKind {
    const start = pos;
    while (pos < end) {
      const ch = source.charCodeAt(pos);
      if (ch === CharacterCodes.ampersand) break;
      if (rcdataEndTag && ch === CharacterCodes.lessThan && matchesAsciiCI(pos, rcdataEndTag)) break;
      pos++;
    }
    if (pos > start) {
      setValueRange(start, pos);
      tokenFlags |= TokenFlags.ContainsHtml;
      tokenFlags |= TokenFlags.IsInRcdata;
      if (pos >= end && rcdataEndTag) {
        tokenFlags |= TokenFlags.Unterminated;
        emitError(ScannerErrorCode.UnexpectedEndOfFile, 'Unterminated RCDATA element content');
      }
      return token = SyntaxKind.HtmlText;
    }
    return scan();
  }

  function scanOpenBrace(): SyntaxKind {
    pos++; // consume '{'

    // Attribute block: {#id .class key=value}
    // This is used in extended Markdown for attaching attributes to elements
    const start = pos;
    let braceDepth = 1;

    while (pos < end && braceDepth > 0) {
      const ch = source.charCodeAt(pos);
      if (ch === CharacterCodes.openBrace) {
        braceDepth++;
      } else if (ch === CharacterCodes.closeBrace) {
        braceDepth--;
      } else if (isLineBreak(ch)) {
        // Attribute blocks don't span lines
        break;
      }
      pos++;
    }

    if (braceDepth === 0 && pos > start + 1) {
      setValueRange(start, pos - 1); // exclude closing brace
      return token = SyntaxKind.OpenBraceToken;
    }

    // Not a valid attribute block or malformed, always return empty value
    pos = startPos + 1;
    tokenValue = '';
    clearValueRange();
    return token = SyntaxKind.OpenBraceToken;
  }

  function scanCloseBrace(): SyntaxKind {
    pos++; // consume '}'
    tokenValue = ''; // Empty value for simple tokens
    return token = SyntaxKind.CloseBraceToken;
  }

  function scanSlash(): SyntaxKind {
    pos++; // consume '/'

    // Check for self-closing tag: />
    if (pos < end && source.charCodeAt(pos) === CharacterCodes.greaterThan) {
      pos++; // consume '>'
      return token = SyntaxKind.SlashGreaterThanToken;
    }

    return token = SyntaxKind.Unknown; // slash by itself is not a valid Markdown token
  }
}
