import { createScanner } from '../index';
import { SyntaxKind, TokenFlags } from '../scanner/token-types';

export function verifyTokens(input: string): string {
  let markdownOnly = '';
  const assertionList = [];
  for (const { assertions, chunk, originalMarkers, canonicalMarkers, isStrict } of findAssertions(input)) {
    markdownOnly += chunk;
    if (assertions.length > 0) {
      const assertLineEnd = markdownOnly.length - 1;
      const assertLineStart = markdownOnly.lastIndexOf('\n', assertLineEnd - 1) + 1;
      assertionList.push({
        assertions,
        chunk,
        lineStart: assertLineStart,
        lineEnd: assertLineEnd,
        originalMarkers,
        canonicalMarkers,
        isStrict
      });
    } else {
      assertionList.push({
        assertions,
        chunk,
        lineStart: -1,
        lineEnd: -1,
        originalMarkers: undefined,
        canonicalMarkers: undefined,
        isStrict: false
      });
    }
  }

  const scanner = createScanner();
  scanner.initText(markdownOnly);
  const tokens: {
    token: SyntaxKind,
    text: string,
    start: number,
    end: number,
    flags: TokenFlags
  }[] = [];
  while (scanner.offsetNext < markdownOnly.length) {
    const start = scanner.offsetNext;
    scanner.scan();
    tokens.push({
      token: scanner.token,
      text: scanner.tokenText,
      start,
      end: scanner.offsetNext,
      flags: scanner.tokenFlags
    });
  }

  let output = '';
  for (const { assertions, chunk, lineStart, lineEnd, originalMarkers, canonicalMarkers, isStrict } of assertionList) {

    output += chunk;
    
    // Skip if no assertions
    if (assertions.length === 0) {
      continue;
    }
    
    const lineTokens = tokens.filter(tk => tk.start >= lineStart && tk.end <= lineEnd);

    if (isStrict && canonicalMarkers) {
      // Use strict mode with normalization
      let positionLine = '';
      let assertionLines = [];
      
      // Track which markers have successful assertions
      const hasValidAssertion = new Array(assertions.length).fill(false);
      
      for (let i = 0; i < assertions.length; i++) {
        const assertion = assertions[i];

        const token = lineTokens.find(tk =>
          tk.start <= lineStart + assertion.lineOffset &&
          tk.end >= lineStart + assertion.lineOffset + 1
        );
        if (!token) continue;

        const positionMarker = canonicalMarkers[i];

        const positionMarkerOffset = token.start - lineStart;
        // Extend position line to include this marker
        while (positionLine.length < positionMarkerOffset)
          positionLine += ' ';
        if (positionLine.length === positionMarkerOffset) {
          positionLine += positionMarker;
        }

        const tokenMatch = assertion.token < 0 || assertion.token === token.token;
        const textMatch = assertion.text == null || assertion.text === token.text;
        const flagsMatch = assertion.flags < 0 || (assertion.flags & token.flags) === assertion.flags;

        if (tokenMatch && textMatch && flagsMatch && assertion.assertionText) {
          // Convert original assertion to use canonical markers
          const canonicalAssertion = assertion.assertionText.replace(
            /^(\s*)@([1-9A-Za-z])/,
            (match, whitespace, originalMarker) => `@${positionMarker}`
          );
          assertionLines.push(canonicalAssertion);
          hasValidAssertion[i] = true;
        } else {
          // Generate corrected assertion
          assertionLines.push(
            '@' + positionMarker +
            (
              assertion.token < 0 ? '' :
                ' ' + syntaxKindToString(token.token)
            ) +
            (
              assertion.text == null ? '' :
                ' ' + JSON.stringify(token.text)
            ) +
            (
              assertion.flags < 0 ? '' :
                ' ' + tokenFlagsToString(token.flags)
            )
          );
          hasValidAssertion[i] = true;
        }
      }
      
      // Generate synthetic token-only assertions for markers with no parsed assertions
      for (let i = 0; i < assertions.length; i++) {
        if (!hasValidAssertion[i]) {
          const assertion = assertions[i];
          // Find token at this position
          const token = lineTokens.find(tk =>
            tk.start <= lineStart + assertion.lineOffset &&
            tk.end >= lineStart + assertion.lineOffset + 1
          );
          
          if (token) {
            const positionMarker = canonicalMarkers[i];
            const positionMarkerOffset = token.start - lineStart;
            
            // Extend position line if needed
            while (positionLine.length < positionMarkerOffset)
              positionLine += ' ';
            if (positionLine.length === positionMarkerOffset) {
              positionLine += positionMarker;
            }
            
            // Add synthetic token-only assertion
            assertionLines.push('@' + positionMarker + ' ' + syntaxKindToString(token.token));
          }
        }
      }

      output +=
        positionLine + '\n' +
        assertionLines.map(ln => ln + '\n').join('');
    } else {
      // Use old mode (preserve existing behavior)
      let positionLine = '';
      let assertionLines = [];
      for (let i = 0; i < assertions.length; i++) {
        const assertion = assertions[i];

        const token = lineTokens.find(tk =>
          tk.start <= lineStart + assertion.lineOffset &&
          tk.end >= lineStart + assertion.lineOffset + 1
        );
        if (!token) continue;

        const positionMarker = originalMarkers ? originalMarkers[i] :
          (i + 1) < 10 ? String(i + 1) :
            String.fromCharCode('A'.charCodeAt(0) + i - 9);

        const positionMarkerOffset = token.start - lineStart;
        if (positionLine.length > positionMarkerOffset) continue;
        while (positionLine.length < positionMarkerOffset)
          positionLine += ' ';
        positionLine += positionMarker;

        const tokenMatch = assertion.token < 0 || assertion.token === token.token;
        const textMatch = assertion.text == null || assertion.text === token.text;
        const flagsMatch = assertion.flags < 0 || (assertion.flags & token.flags) === assertion.flags;

        if (tokenMatch && textMatch && flagsMatch && assertion.assertionText) {
          assertionLines.push(assertion.assertionText);
        } else {
          assertionLines.push(
            '@' + positionMarker +
            (
              assertion.token < 0 ? '' :
                ' ' + syntaxKindToString(token.token)
            ) +
            (
              assertion.text == null ? '' :
                ' ' + JSON.stringify(token.text)
            ) +
            (
              assertion.flags < 0 ? '' :
                ' ' + tokenFlagsToString(token.flags)
            )
          );
        }
      }

      output +=
        positionLine + '\n' +
        assertionLines.map(ln => ln + '\n').join('');
    }
  }

  if (input.trimEnd() === output.trimEnd())
    return input;

  return output;
}

function* findAssertions(input: string) {
  let lastPos = 0;
  let pos = 0;
  while (pos < input.length) {
    // Find potential marker line starting with whitespace + '1'
    const newLine1Regex = /(^|\n)(\s*)1/g;
    newLine1Regex.lastIndex = pos;
    const match = newLine1Regex.exec(input);
    if (!match) {
      break;
    }
    
    let positionLineStart = match.index + (match[1] === '\n' ? 1 : 0);
    let positionLineEnd = input.indexOf('\n', positionLineStart);
    if (positionLineEnd < 0) {
      positionLineEnd = input.length;
    }

    const positionLine = input.substring(positionLineStart, positionLineEnd);
    
    // Try strict marker detection first
    const strictDetection = detectStrictMarkers(positionLine);
    
    if (strictDetection.valid) {
      // Check if next line starts with '@' (immediate assertion requirement for strict mode)
      if (positionLineEnd < input.length) {
        const nextLineStart = positionLineEnd + 1;
        const nextLineMatch = input.substring(nextLineStart).match(/^(\s*)@/);
        if (nextLineMatch) {
          // Use strict mode
          const { markers, offsets } = strictDetection;
          const assertions = collectAssertions(input, nextLineStart, markers, offsets);
          
          const chunk = input.slice(lastPos, positionLineStart);
          pos = lastPos = assertions.nextPosition;

          // Only normalize if the original format is different from canonical
          const canonicalMarkers = generateCanonicalMarkers(markers.length);
          const needsNormalization = needsNormalizationCheck(markers, canonicalMarkers, positionLine);

          yield { 
            assertions: assertions.markerAssertions,
            chunk,
            originalMarkers: markers,
            canonicalMarkers: needsNormalization ? canonicalMarkers : undefined,
            isStrict: true
          };
          continue;
        }
      }
    }
    
    // Fall back to old permissive detection
    const oldDetection = detectOldMarkers(positionLine);
    if (oldDetection.valid) {
      // Check for assertions in old format
      if (positionLineEnd < input.length) {
        const nextLineStart = positionLineEnd + 1;
        const assertions = collectOldAssertions(input, nextLineStart, oldDetection.markers, oldDetection.offsets);
        
        if (assertions.markerAssertions.some(a => a.assertionText !== null)) {
          const chunk = input.slice(lastPos, positionLineStart);
          pos = lastPos = assertions.nextPosition;

          yield { 
            assertions: assertions.markerAssertions,
            chunk,
            originalMarkers: oldDetection.markers,
            canonicalMarkers: undefined,
            isStrict: false
          };
          continue;
        }
      }
    }
    
    // No valid annotation detected, continue searching
    pos = positionLineEnd + 1;
  }

  if (pos <= input.length) {
    yield {
      assertions: [],
      chunk: input.slice(lastPos)
    };
  }
}

// Check if normalization is needed (format is non-canonical)
function needsNormalizationCheck(originalMarkers: string[], canonicalMarkers: string[], positionLine: string): boolean {
  // Need normalization if:
  // 1. Contains lowercase letters
  // 2. Is in compact format (no spaces)
  // 3. Markers don't match canonical sequence
  
  const hasLowercase = originalMarkers.some(m => m !== m.toUpperCase());
  if (hasLowercase) return true;
  
  // Check if compact format (markers are adjacent)
  const trimmed = positionLine.trim();
  const isCompact = trimmed.length === originalMarkers.length;
  if (isCompact) return true;
  
  // Check if marker sequence doesn't match canonical
  for (let i = 0; i < originalMarkers.length; i++) {
    if (originalMarkers[i] !== canonicalMarkers[i]) return true;
  }
  
  return false;
}

// Old permissive marker detection for backwards compatibility
function detectOldMarkers(positionLine: string): { 
  valid: boolean, 
  markers?: string[], 
  offsets?: number[] 
} {
  const positionMarkerChars = positionLine.trim().split(/\s+/g);
  const positionMarkersCorrect = positionMarkerChars.every((mrk, i) =>
    i < 9 ? mrk === String(i + 1) :
      mrk.toUpperCase() === String.fromCharCode('A'.charCodeAt(0) + i - 9));

  if (!positionMarkersCorrect) {
    return { valid: false };
  }

  const positionMarkerLineOffsets = positionMarkerChars.map(mrk => positionLine.indexOf(mrk));
  
  return { 
    valid: true, 
    markers: positionMarkerChars,
    offsets: positionMarkerLineOffsets
  };
}

// Old assertion collection for backwards compatibility
function collectOldAssertions(
  input: string, 
  startPos: number, 
  markers: string[], 
  offsets: number[]
): {
  markerAssertions: Array<{
    lineOffset: number,
    token: number,
    text: string | null,
    flags: number,
    assertionText: string | null
  }>,
  nextPosition: number
} {
  const markerAssertions = offsets.map(lineOffset => ({
    lineOffset,
    token: -1,
    text: null as null | string,
    flags: -1,
    assertionText: null as null | string
  }));

  let nextAssertLineStart = startPos;
  for (let i = 0; i < markers.length; i++) {
    if (input.slice(nextAssertLineStart, nextAssertLineStart + 2) !== '@' + markers[i]) break;
    let nextAssertLineEnd = input.indexOf('\n', nextAssertLineStart);
    if (nextAssertLineEnd < 0) nextAssertLineEnd = input.length;

    const assertLineParsed = parseAssertLine(
      input.slice(nextAssertLineStart + 2, nextAssertLineEnd).trim()
    );

    if (!assertLineParsed) break;
    const { assertToken, assertText, assertFlags } = assertLineParsed;
    let assertionText = input.slice(nextAssertLineStart, nextAssertLineEnd);

    markerAssertions[i].token = assertToken;
    markerAssertions[i].text = assertText;
    markerAssertions[i].flags = assertFlags;
    markerAssertions[i].assertionText = assertionText;

    nextAssertLineStart = nextAssertLineEnd + 1;
  }

  return {
    markerAssertions,
    nextPosition: nextAssertLineStart
  };
}

// Detect strict marker patterns according to requirements
function detectStrictMarkers(positionLine: string): { 
  valid: boolean, 
  markers?: string[], 
  offsets?: number[] 
} {
  // Scan through the line character by character
  const markers: string[] = [];
  const offsets: number[] = [];
  
  let i = 0;
  // Skip leading whitespace
  while (i < positionLine.length && (positionLine[i] === ' ' || positionLine[i] === '\t')) {
    i++;
  }
  
  // Must start with '1'
  if (i >= positionLine.length || positionLine[i] !== '1') {
    return { valid: false };
  }
  
  // Collect markers
  while (i < positionLine.length) {
    const ch = positionLine[i];
    
    if (ch >= '1' && ch <= '9') {
      markers.push(ch);
      offsets.push(i);
      i++;
    } else if ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z')) {
      markers.push(ch.toUpperCase());
      offsets.push(i);
      i++;
    } else if (ch === ' ' || ch === '\t') {
      // Skip whitespace
      i++;
    } else {
      // Invalid character found
      return { valid: false };
    }
  }
  
  // Check for strictly increasing sequence
  if (!isStrictlyIncreasing(markers)) {
    return { valid: false };
  }
  
  // Check for unique characters (no duplicates)
  const charCounts = new Map<string, number>();
  for (const marker of markers) {
    charCounts.set(marker, (charCounts.get(marker) || 0) + 1);
  }
  
  for (const count of charCounts.values()) {
    if (count > 1) {
      return { valid: false };
    }
  }
  
  return { valid: true, markers, offsets };
}

// Check if marker sequence is strictly increasing (1 < 2 < ... < 9 < A < B < ... < Z)
function isStrictlyIncreasing(markers: string[]): boolean {
  for (let i = 1; i < markers.length; i++) {
    const prev = getMarkerOrder(markers[i - 1]);
    const curr = getMarkerOrder(markers[i]);
    if (curr <= prev) {
      return false;
    }
  }
  return true;
}

// Get numeric order for marker character (1=1, 2=2, ..., 9=9, A=10, B=11, ..., Z=35)
function getMarkerOrder(marker: string): number {
  if (marker >= '1' && marker <= '9') {
    return marker.charCodeAt(0) - '0'.charCodeAt(0);
  }
  if (marker >= 'A' && marker <= 'Z') {
    return 10 + (marker.charCodeAt(0) - 'A'.charCodeAt(0));
  }
  return -1;
}

// Generate canonical marker sequence (1, 2, 3, ..., 9, A, B, C, ...)
function generateCanonicalMarkers(count: number): string[] {
  const canonical: string[] = [];
  for (let i = 0; i < count; i++) {
    if (i < 9) {
      canonical.push(String(i + 1));
    } else {
      canonical.push(String.fromCharCode('A'.charCodeAt(0) + i - 9));
    }
  }
  return canonical;
}

// Collect assertion lines starting from nextLineStart
function collectAssertions(
  input: string, 
  startPos: number, 
  markers: string[], 
  offsets: number[]
): {
  markerAssertions: Array<{
    lineOffset: number,
    token: number,
    text: string | null,
    flags: number,
    assertionText: string | null
  }>,
  nextPosition: number
} {
  const markerAssertions = offsets.map(lineOffset => ({
    lineOffset,
    token: -1,
    text: null as null | string,
    flags: -1,
    assertionText: null as null | string
  }));
  
  const markerMap = new Map<string, number>();
  markers.forEach((marker, index) => {
    markerMap.set(marker.toUpperCase(), index);
    // Also map lowercase to the same index
    markerMap.set(marker.toLowerCase(), index);
  });
  
  let pos = startPos;
  
  // Collect assertion lines that follow immediately after the marker line
  while (pos < input.length) {
    // Find the end of the current line
    let lineEnd = input.indexOf('\n', pos);
    if (lineEnd === -1) lineEnd = input.length;
    
    const line = input.substring(pos, lineEnd);
    
    // Check if this line is an assertion line: optional whitespace + @ + marker char
    const assertionMatch = line.match(/^(\s*)@([1-9A-Za-z])(.*?)$/);
    if (!assertionMatch) {
      // Not an assertion line, stop collecting
      break;
    }
    
    const markerChar = assertionMatch[2];
    const assertionContent = assertionMatch[3].trim();
    
    // Map to detected marker (case-insensitive)
    const markerIndex = markerMap.get(markerChar);
    if (markerIndex !== undefined) {
      // Try to parse the assertion
      const parsed = parseAssertLine(assertionContent);
      if (parsed) {
        const { assertToken, assertText, assertFlags } = parsed;
        markerAssertions[markerIndex].token = assertToken;
        markerAssertions[markerIndex].text = assertText;
        markerAssertions[markerIndex].flags = assertFlags;
        markerAssertions[markerIndex].assertionText = line;
      }
      // Skip unparseable assertions but continue processing
    }
    
    // Move to next line
    pos = lineEnd + 1;
  }
  
  return {
    markerAssertions,
    nextPosition: pos
  };
}

function parseAssertLine(assertLine: string) {
  let pos = 0;
  let assertToken: SyntaxKind = -1 as number;
  let assertText: string | null = null;
  let assertFlags: TokenFlags = -1 as number;

  while (pos < assertLine.length) {
    // Skip known prefixes for older syntax
    if (assertLine.slice(pos).startsWith('text:')) {
      pos += 'text:'.length;
      if (assertLine[pos] === ' ') pos++;
    }
    else if (assertLine.slice(pos).startsWith('flags:')) {
      pos += 'flags:'.length;
      if (assertLine[pos] === ' ') pos++;
    }

    if (assertLine[pos] === '"') {
      let endQuote = pos + 1;
      while (true) {
        endQuote = assertLine.indexOf('"', endQuote);
        if (endQuote < 0) {
          endQuote = -1;
          break;
        }

        // Determine if the found quote is escaped by counting preceding backslashes.
        // In JSON strings a quote is escaped iff it's preceded by an odd number of backslashes.
        let backslashCount = 0;
        let k = endQuote - 1;
        while (k >= 0 && assertLine[k] === '\\') {
          backslashCount++;
          k--;
        }
        // If even number of backslashes, the quote is not escaped and marks the end.
        if ((backslashCount % 2) === 0) break;
        // Otherwise the quote is escaped (odd backslashes), continue searching after it.
        endQuote++;
      }

      if (endQuote < 0)
        return;

      try {
        assertText = JSON.parse(assertLine.slice(pos, endQuote + 1));
        pos = endQuote + 1;
        continue;
      } catch {
        return;
      }
    }

    let nextSpace = assertLine.indexOf(' ', pos);
    if (nextSpace < 0) nextSpace = assertLine.length;

    const p = assertLine.slice(pos, nextSpace);
    if (assertToken < 0) {
      const token = convertSyntaxKind(p);
      if (token < 0) return;
      assertToken = token;
      pos = nextSpace + 1;
    } else {
      const flags = convertTokenFlags(p);
      if (flags < 0) return;
      assertFlags = flags;
      pos = nextSpace + 1;
    }
  }

  return {
    assertToken,
    assertText,
    assertFlags
  };
}

function syntaxKindToString(kind: SyntaxKind): string {
  return SyntaxKindShadow[kind] || '0x' + kind.toFixed(16).toUpperCase();
}

function convertSyntaxKind(encoded: string): SyntaxKind {
  const asNumber = Number(encoded);
  if (Number.isFinite(asNumber)) return asNumber;
  const fromString = SyntaxKindShadow[encoded as keyof typeof SyntaxKindShadow];
  if (Number.isFinite(fromString)) return fromString as number;
  return -1 as number;
}

enum SyntaxKindShadow {
  Unknown = SyntaxKind.Unknown,
  EndOfFileToken = SyntaxKind.EndOfFileToken,

  StringLiteral = SyntaxKind.StringLiteral,
  WhitespaceTrivia = SyntaxKind.WhitespaceTrivia,
  NewLineTrivia = SyntaxKind.NewLineTrivia,

  AsteriskToken = SyntaxKind.AsteriskToken,
  AsteriskAsterisk = SyntaxKind.AsteriskAsterisk,
  UnderscoreToken = SyntaxKind.UnderscoreToken,
  UnderscoreUnderscore = SyntaxKind.UnderscoreUnderscore,
  BacktickToken = SyntaxKind.BacktickToken,
  TildeTilde = SyntaxKind.TildeTilde,

  // Stage 4: HTML tokens
  LessThanToken = SyntaxKind.LessThanToken,
  LessThanSlashToken = SyntaxKind.LessThanSlashToken,
  GreaterThanToken = SyntaxKind.GreaterThanToken,
  SlashGreaterThanToken = SyntaxKind.SlashGreaterThanToken,
  EqualsToken = SyntaxKind.EqualsToken,
  AmpersandToken = SyntaxKind.AmpersandToken,
  HtmlTagName = SyntaxKind.HtmlTagName,
  HtmlAttributeName = SyntaxKind.HtmlAttributeName,
  HtmlAttributeValue = SyntaxKind.HtmlAttributeValue,
  HtmlEntity = SyntaxKind.HtmlEntity,
  HtmlComment = SyntaxKind.HtmlComment,
  HtmlCdata = SyntaxKind.HtmlCdata,
  HtmlProcessingInstruction = SyntaxKind.HtmlProcessingInstruction,
  HtmlRawText = SyntaxKind.HtmlRawText,
  HtmlRCDataText = SyntaxKind.HtmlRCDataText
}

function tokenFlagsToString(kind: TokenFlags): string {
  if (!kind) return TokenFlagsShadow[0];
  const stringFlags = Object.keys(TokenFlagsShadow).filter(k => {
    const val = TokenFlagsShadow[k as any] as any;
    if (!Number.isFinite(val) || val === 0) return false;
    return (kind & val) === val;
  });
  let combinedFlags = 0;
  for (const k of stringFlags) {
    combinedFlags |= TokenFlagsShadow[k as any] as any;
  }
  if (combinedFlags !== kind)
    stringFlags.push('0x' + (kind & ~combinedFlags).toFixed(16).toUpperCase());
  return stringFlags.join('|');
}

function convertTokenFlags(encoded: string): TokenFlags {
  const asNumber = Number(encoded);
  if (Number.isFinite(asNumber)) return asNumber;
  const fromString = TokenFlagsShadow[encoded as keyof typeof TokenFlagsShadow];
  if (Number.isFinite(fromString)) return fromString as number;
  const pipeds = encoded.split('|').map(s => s.trim());

  if (pipeds.length > 1) {
    let combined = 0;
    for (const p of pipeds) {
      const flag = convertTokenFlags(p);
      if (flag < 0) return -1 as number;
      combined |= flag;
    }
    return combined;
  }

  return -1 as number;
}

enum TokenFlagsShadow {
  None = TokenFlags.None,
  PrecedingLineBreak = TokenFlags.PrecedingLineBreak,
  IsAtLineStart = TokenFlags.IsAtLineStart,
  IsBlankLine = TokenFlags.IsBlankLine,

  CanRollbackHere = TokenFlags.CanRollbackHere,
  RollbackTypeMask = TokenFlags.RollbackTypeMask,

  RollbackDocumentStart = TokenFlags.RollbackDocumentStart,
  RollbackBlankLine = TokenFlags.RollbackBlankLine,
  RollbackRawText = TokenFlags.RollbackRawText,
  RollbackCodeBlock = TokenFlags.RollbackCodeBlock,
  RollbackHtmlInner = TokenFlags.RollbackHtmlInner,

  CanOpen = TokenFlags.CanOpen,
  CanClose = TokenFlags.CanClose
}