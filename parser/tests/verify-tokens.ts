import { createScanner } from '../index';
import { SyntaxKind, TokenFlags } from '../scanner/token-types';

export function verifyTokens(input: string): string {
  let markdownOnly = '';
  const assertionList = [];
  for (const { assertions, chunk } of findAssertions(input)) {
    markdownOnly += chunk;
    if (assertions.length > 0) {
      const assertLineEnd = markdownOnly.length - 1;
      const assertLineStart = markdownOnly.lastIndexOf('\n', assertLineEnd - 1) + 1;
      assertionList.push({
        assertions,
        chunk,
        lineStart: assertLineStart,
        lineEnd: assertLineEnd
      });
    } else {
      assertionList.push({
        assertions,
        chunk,
        lineStart: -1,
        lineEnd: -1
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
  for (const { assertions, chunk, lineStart, lineEnd } of assertionList) {

    output += chunk;
    const lineTokens = tokens.filter(tk => tk.start >= lineStart && tk.end <= lineEnd);

    // Map assertions to token starts; deduplicate multiple assertions that map to
    // the same token start by keeping the first. This also lets us produce a
    // canonical ordering of markers based on token start order.
    const tokenStartToAssertionIndex = new Map<number, number>();
    for (let i = 0; i < assertions.length; i++) {
      const assertion = assertions[i];
      const token = lineTokens.find(tk =>
        tk.start <= lineStart + assertion.lineOffset &&
        tk.end >= lineStart + assertion.lineOffset + 1
      );
      if (!token) continue;
      if (!tokenStartToAssertionIndex.has(token.start))
        tokenStartToAssertionIndex.set(token.start, i);
    }

    const orderedTokenStarts = Array.from(tokenStartToAssertionIndex.keys()).sort((a, b) => a - b);

    let positionLine = '';
    const assertionLines: string[] = [];
    for (let emitted = 0; emitted < orderedTokenStarts.length; emitted++) {
      const tokenStart = orderedTokenStarts[emitted];
      const assertionIndex = tokenStartToAssertionIndex.get(tokenStart)!;
      const assertion = assertions[assertionIndex];
      const token = lineTokens.find(tk => tk.start === tokenStart)!;

      const positionMarker = (emitted + 1) < 10 ? String(emitted + 1) :
        String.fromCharCode('A'.charCodeAt(0) + emitted - 9);

      const positionMarkerOffset = token.start - lineStart;
      while (positionLine.length < positionMarkerOffset)
        positionLine += ' ';
      positionLine += positionMarker;

      const tokenMatch = assertion.token < 0 || assertion.token === token.token;
      const textMatch = assertion.text == null || assertion.text === token.text;
      const flagsMatch = assertion.flags < 0 || (assertion.flags & token.flags) === assertion.flags;

      const hasConstraint = assertion.token >= 0 || assertion.text != null || assertion.flags >= 0;

      // Helper to rewrite original assertion text to use canonical label
      const rewriteAssertionLabel = (orig: string) => orig.replace(/^@[A-Za-z0-9]+/, '@' + positionMarker);

      if (!hasConstraint) {
        assertionLines.push('@' + positionMarker + ' ' + syntaxKindToString(token.token));
      } else if (tokenMatch && textMatch && flagsMatch && assertion.assertionText) {
        assertionLines.push(rewriteAssertionLabel(assertion.assertionText));
      } else {
        assertionLines.push(
          '@' + positionMarker +
          (
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

  if (input.trimEnd() === output.trimEnd())
    return input;

  return output;
}

function* findAssertions(input: string) {
  let lastPos = 0;
  let pos = 0;
  while (pos < input.length) {
    const newLine1Regex = /(^|\n)\s*1/g;
    newLine1Regex.lastIndex = pos;
    let positionLineStart = newLine1Regex.exec(input)?.index;
    if (typeof positionLineStart !== 'number' || positionLineStart < 0) {
      break;
    }
    positionLineStart++;

    const positionLineEnd = input.indexOf('\n', positionLineStart + 1);
    if (positionLineEnd < 0) {
      pos = input.length;
    }

    const positionLine = input.substring(positionLineStart, positionLineEnd);

    // Treat each non-space character in the position line as a separate marker and
    // record its column offset within the line.
    const positionMarkerChars: string[] = [];
    const positionMarkerLineOffsets: number[] = [];
    for (let i = 0; i < positionLine.length; i++) {
      const ch = positionLine[i];
      if (/\s/.test(ch)) continue;
      positionMarkerChars.push(ch);
      positionMarkerLineOffsets.push(i);
    }

    // Validate canonical ordering: must start with '1', be strictly increasing in the
    // canonical ordinal (1..9 then A..Z), and be unique.
    const toOrdinal = (ch: string) => {
      if (/^[1-9]$/.test(ch)) return ch.charCodeAt(0) - '0'.charCodeAt(0);
      const up = ch.toUpperCase();
      if (/^[A-Z]$/.test(up)) return up.charCodeAt(0) - 'A'.charCodeAt(0) + 10;
      return -1;
    };
    const ords = positionMarkerChars.map(toOrdinal);
    let positionMarkersCorrect = true;
    if (positionMarkerChars.length === 0) positionMarkersCorrect = false;
    if (positionMarkersCorrect) {
      if (ords[0] !== 1) positionMarkersCorrect = false;
    }
    if (positionMarkersCorrect) {
      for (let i = 1; i < ords.length; i++) {
        if (ords[i] <= ords[i - 1]) { positionMarkersCorrect = false; break; }
      }
    }
    if (positionMarkersCorrect) {
      const seen = new Set<number>();
      for (const v of ords) {
        if (v < 1) { positionMarkersCorrect = false; break; }
        if (seen.has(v)) { positionMarkersCorrect = false; break; }
        seen.add(v);
      }
    }

    if (!positionMarkersCorrect) {
      pos = positionLineEnd;
      continue;
    }

    // Check if next line starts with '@' (stricter requirement): require '@' at column 0
    if (positionLineEnd < input.length) {
      const nextLineStart = positionLineEnd + 1;
      const nextLineMatch = input.substring(nextLineStart).match(/^@/);
      if (!nextLineMatch) {
        // No immediate '@' at start-of-line, treat as ordinary markdown
        pos = positionLineEnd + 1;
        continue;
      }
    }

    const positionMarkerAsserts = positionMarkerLineOffsets.map(lineOffset => ({
      lineOffset,
      token: -1,
      text: null as null | string,
      flags: -1,
      assertionText: null as null | string
    }));

    let nextAssertLineStart = positionLineEnd + 1;
    // Consume any following lines that begin with '@<label>' at column 0
    while (nextAssertLineStart < input.length) {
      const rest = input.slice(nextAssertLineStart);
      const m = rest.match(/^@([A-Za-z0-9]+)/);
      if (!m) break;

      const label = m[1];

      let nextAssertLineEnd = input.indexOf('\n', nextAssertLineStart);
      if (nextAssertLineEnd < 0) nextAssertLineEnd = input.length;

      // Attempt to parse the assertion after the label. If parsing fails, consume the line
      // but do not attach any parsed assertion (this will cause a synthesized token-only
      // assertion later if the slot remains empty).
      const afterLabelStart = nextAssertLineStart + 1 + label.length; // '@' + label
      const assertSlice = input.slice(afterLabelStart, nextAssertLineEnd).trim();
      const assertLineParsed = parseAssertLine(assertSlice);

      // Map label (case-insensitive) to positionMarker slot, if present.
      const targetIdx = positionMarkerChars.findIndex(mrk => mrk.toUpperCase() === label.toUpperCase());
      if (targetIdx >= 0 && assertLineParsed) {
        const { assertToken, assertText, assertFlags } = assertLineParsed;
        const assertionText = input.slice(nextAssertLineStart, nextAssertLineEnd);
        positionMarkerAsserts[targetIdx].token = assertToken;
        positionMarkerAsserts[targetIdx].text = assertText;
        positionMarkerAsserts[targetIdx].flags = assertFlags;
        positionMarkerAsserts[targetIdx].assertionText = assertionText;
      }

      // Always consume the @-line whether it mapped or not, to avoid leaving it
      // as a later chunk in the output.
      nextAssertLineStart = nextAssertLineEnd + 1;
    }

    const chunk = input.slice(lastPos, positionLineStart);
    pos = lastPos = nextAssertLineStart;

    yield { assertions: positionMarkerAsserts, chunk };
  }

  if (pos <= input.length) {
    yield {
      assertions: [],
      chunk: input.slice(lastPos)
    };
  }
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
  HardLineBreak = SyntaxKind.HardLineBreak,
  NewLineTrivia = SyntaxKind.NewLineTrivia,

  // Block-level tokens from line classification
  HashToken = SyntaxKind.HashToken,
  CodeFence = SyntaxKind.CodeFence,
  ThematicBreak = SyntaxKind.ThematicBreak,
  IndentedCodeBlock = SyntaxKind.IndentedCodeBlock,
  ListMarkerUnordered = SyntaxKind.ListMarkerUnordered,
  ListMarkerOrdered = SyntaxKind.ListMarkerOrdered,
  PipeToken = SyntaxKind.PipeToken,
  ColonToken = SyntaxKind.ColonToken,
  MinusToken = SyntaxKind.MinusToken,
  CodeBlockFenced = SyntaxKind.CodeBlockFenced,
  MathInlineDelimiter = SyntaxKind.MathInlineDelimiter,
  MathBlockDelimiter = SyntaxKind.MathBlockDelimiter,

  AsteriskToken = SyntaxKind.AsteriskToken,
  AsteriskAsterisk = SyntaxKind.AsteriskAsterisk,
  UnderscoreToken = SyntaxKind.UnderscoreToken,
  UnderscoreUnderscore = SyntaxKind.UnderscoreUnderscore,
  BacktickToken = SyntaxKind.BacktickToken,
  InlineCodeDelimiter = SyntaxKind.InlineCodeDelimiter,
  TildeTilde = SyntaxKind.TildeTilde,

  // Stage 4: HTML tokens
  GreaterThanToken = SyntaxKind.GreaterThanToken,
  SlashGreaterThanToken = SyntaxKind.SlashGreaterThanToken,
  EqualsToken = SyntaxKind.EqualsToken,
  AmpersandToken = SyntaxKind.AmpersandToken,
  HtmlTagOpenName = SyntaxKind.HtmlTagOpenName,
  HtmlTagCloseName = SyntaxKind.HtmlTagCloseName,
  HtmlAttributeName = SyntaxKind.HtmlAttributeName,
  HtmlAttributeValue = SyntaxKind.HtmlAttributeValue,
  HtmlTagWhitespace = SyntaxKind.HtmlTagWhitespace,
  HtmlEntity = SyntaxKind.HtmlEntity,
  HtmlComment = SyntaxKind.HtmlComment,
  HtmlCdata = SyntaxKind.HtmlCdata,
  HtmlProcessingInstruction = SyntaxKind.HtmlProcessingInstruction,
  HtmlDoctype = SyntaxKind.HtmlDoctype,
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
  ,
  // Stage 4 HTML construct flags
  Unterminated = TokenFlags.Unterminated
}