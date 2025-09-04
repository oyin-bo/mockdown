import { assert } from 'vitest';
import { createScanner } from '../index';
import { SyntaxKind, TokenFlags } from '../scanner/token-types';

export function verifyTokens(input: string): string {
  const scanner = createScanner();
  scanner.initText(input);
  const tokens: {
    token: SyntaxKind,
    text: string,
    start: number,
    end: number,
    flags: TokenFlags
  }[] = [];
  while (scanner.offsetNext < input.length) {
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

  let output = input;
  for (const { assertions, chunk } of findAssertions(input)) {
    output += chunk;

    const assertLineEnd = output.length;
    const assertLineStart = output.lastIndexOf('\n', assertLineEnd - 1) + 1;
    const lineTokens = tokens.filter(tk => tk.start >= assertLineStart && tk.end <= assertLineEnd);

    let positionLine = '';
    let assertionLines = [];
    for (let i = 0; i < assertions.length; i++) {
      const assertion = assertions[i];

      const token = lineTokens.find(tk =>
        tk.start <= assertion.lineOffset &&
        tk.end >= assertion.lineOffset
      );
      if (!token) continue;

      const positionMarker = (i + 1) < 10 ? String(i + 1) :
        String.fromCharCode('A'.charCodeAt(0) + i - 10);

      const positionMarkerOffset = token.start - assertLineStart;
      if (positionLine.length >= positionMarkerOffset) continue;
      while (positionLine.length < positionMarkerOffset - 1)
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
              syntaxKindToString(assertion.token)
          ) +
          (
            assertion.text == null ? '' :
              ' text:' + JSON.stringify(assertion.text)
          ) +
          (
            assertion.flags < 0 ? '' :
              ' flags:' + tokenFlagsToString(assertion.flags)
          )
        );
      }
    }

    output +=
      positionLine + '\n' +
      assertionLines.map(ln => ln + '\n').join('');
  }

  return output;
}

function* findAssertions(input: string) {
  let lastPos = 0;
  let pos = 0;
  while (pos < input.length) {
    const positionLineStart = input.indexOf('\n1', pos);
    if (positionLineStart < 0) break;

    const positionLineEnd = input.indexOf('\n', positionLineStart + 2);
    if (positionLineEnd < 0) {
      pos = positionLineEnd;
      continue;
    }

    const positionLine = input.substring(positionLineStart + 1, positionLineEnd);

    let positionMarkerChars = positionLine.split(/\s+/g);
    const positionMarkersCorrect = positionMarkerChars.every((mrk, i) =>
      i < 10 ? mrk === String(i + 1) :
        mrk.toUpperCase() === String.fromCharCode('A'.charCodeAt(0) + i - 10));

    if (!positionMarkersCorrect) {
      pos = positionLineEnd;
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

    let nextAssertLineStart = positionLineEnd + 1;
    for (let i = 0; i < positionMarkerChars.length; i++) {
      if (input.slice(nextAssertLineStart, nextAssertLineStart + 2) !== '@' + positionMarkerChars[i]) break;
      let nextAssertLineEnd = input.indexOf('\n', nextAssertLineStart);
      if (nextAssertLineEnd < 0) nextAssertLineEnd = input.length;

      const assertLineParts: string[] = splitAssertLineParts(input.slice(nextAssertLineStart + 2, nextAssertLineEnd));

      let assertLineInvalid = false;
      let assertToken = -1;
      let assertText = null as null | string;
      let assertFlags = -1;
      let assertionText = input.slice(nextAssertLineStart, nextAssertLineEnd);
      for (const kv of assertLineParts) {
        const posColon = kv.indexOf(':'); 
        if (posColon < 0) {
          const token = convertSyntaxKind(assertLineParts[0]);
          if (token < 0) {
            assertLineInvalid = true;
            break;
          }
          assertToken = token;
          continue;
        }
        const [key, value] = kv;
        if (key === 'text') {
          try {
            assertText = JSON.parse(value);
          } catch {
            assertLineInvalid = true;
            break;
          }
        } else if (key === 'flags') {
          const flags = convertTokenFlags(value);
          if (flags < 0) {
            assertLineInvalid = true;
            break;
          }
          assertFlags = flags;
        }
      }

      if (assertLineInvalid) break;

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

  if (pos < input.length) {
    yield {
      assertions: [],
      chunk: input.slice(pos)
    };
  }
}

// TODO: actually we only allow text in quote and flags, so no need for text: or flags: prefixes
function splitAssertLineParts(assertLine: string) {
  let pos = 0;
  const parts: string[] = [];
  while (pos < assertLine.length) {
    const nextSpace = assertLine.indexOf(' ', pos);
    if (nextSpace < 0) {
      parts.push(assertLine.slice(pos));
      break;
    }
    const posColon = assertLine.indexOf(':', pos);
    if (posColon < 0 || posColon > nextSpace) {
      parts.push(assertLine.slice(pos, nextSpace));
      pos = nextSpace + 1;
      while (pos < assertLine.length && assertLine[pos] === ' ') pos++;
      continue;
    }

    if ()

    pos = nextSpace + 1;
  }
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
  TildeTilde = SyntaxKind.TildeTilde
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