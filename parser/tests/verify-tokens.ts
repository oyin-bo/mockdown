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

    let positionLine = '';
    let assertionLines = [];
    for (let i = 0; i < assertions.length; i++) {
      const assertion = assertions[i];

      const token = lineTokens.find(tk =>
        tk.start <= lineStart + assertion.lineOffset &&
        tk.end >= lineStart + assertion.lineOffset + 1
      );
      if (!token) continue;

      const positionMarker = (i + 1) < 10 ? String(i + 1) :
        String.fromCharCode('A'.charCodeAt(0) + i - 10);

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

  if (input.trimEnd() === output.trimEnd())
    return input;

  return output;
}

function* findAssertions(input: string) {
  let lastPos = 0;
  let pos = 0;
  let safetyCounter = 0;
  
  while (pos < input.length && safetyCounter < 1000) {
    safetyCounter++;
    
    const newLine1Regex = /(^|\n)\s*1/g;
    newLine1Regex.lastIndex = pos;
    let positionLineStart = newLine1Regex.exec(input)?.index;
    if (typeof positionLineStart !== 'number' || positionLineStart < 0) {
      break;
    }
    positionLineStart++;

    const positionLineEnd = input.indexOf('\n', positionLineStart + 1);
    const actualLineEnd = positionLineEnd < 0 ? input.length : positionLineEnd;

    const positionLine = input.substring(positionLineStart, actualLineEnd);

    let positionMarkerChars = positionLine.trim().split(/\s+/g);
    const positionMarkersCorrect = positionMarkerChars.every((mrk, i) =>
      i < 10 ? mrk === String(i + 1) :
        mrk.toUpperCase() === String.fromCharCode('A'.charCodeAt(0) + i - 10));

    if (!positionMarkersCorrect) {
      pos = actualLineEnd + (positionLineEnd < 0 ? 0 : 1); // Move past this line
      continue;
    }

    const positionMarkerLineOffsets = positionMarkerChars.map(mrk => positionLine.indexOf(mrk));

    const positionMarkerAsserts = positionMarkerLineOffsets.map(lineOffset => ({
      lineOffset,
      token: -1,
      text: null as null | string,
      flags: -1,
      assertionText: null as null | string
    }));

    let nextAssertLineStart = actualLineEnd + (positionLineEnd < 0 ? 0 : 1);
    for (let i = 0; i < positionMarkerChars.length; i++) {
      if (nextAssertLineStart >= input.length) break; // No more content
      if (input.slice(nextAssertLineStart, nextAssertLineStart + 2) !== '@' + positionMarkerChars[i]) break;
      let nextAssertLineEnd = input.indexOf('\n', nextAssertLineStart);
      if (nextAssertLineEnd < 0) nextAssertLineEnd = input.length;

      const assertLineParsed = parseAssertLine(
        input.slice(nextAssertLineStart + 2, nextAssertLineEnd).trim()
      );

      if (!assertLineParsed) break;
      const { assertToken, assertText, assertFlags } = assertLineParsed;
      let assertionText = input.slice(nextAssertLineStart, nextAssertLineEnd);

      positionMarkerAsserts[i].token = assertToken;
      positionMarkerAsserts[i].text = assertText;
      positionMarkerAsserts[i].flags = assertFlags;
      positionMarkerAsserts[i].assertionText = assertionText;

      nextAssertLineStart = nextAssertLineEnd + 1;
    }

    const chunk = input.slice(lastPos, positionLineStart);
    pos = lastPos = nextAssertLineStart;

    yield { assertions: positionMarkerAsserts, chunk };
  }

  if (safetyCounter >= 1000) {
    console.error('INFINITE LOOP DETECTED in findAssertions! Breaking...');
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

        if (assertLine[endQuote] === '"' && assertLine[endQuote - 1] !== '\\') break;
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