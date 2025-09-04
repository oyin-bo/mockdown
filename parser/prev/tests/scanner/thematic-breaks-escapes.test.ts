// @ts-check
/**
 * Tests for thematic breaks and escapes
 */

import { beforeEach, describe, expect, test } from 'vitest';

import { createScanner } from '../../scanner.js';
import { SyntaxKind, TokenFlags } from '../../token-types.js';
import { scanTokensStrings } from '../utils.test.js';

describe('Thematic Breaks and Escapes', () => {
  let scanner: ReturnType<typeof createScanner>;

  beforeEach(() => {
    scanner = createScanner();
  });

  // use shared token-string helper where possible

  describe('Thematic break strictness', () => {
    test('*** at line start followed by EOL is thematic-break-like', () => {
  const tokens = scanTokensStrings('***\n');
  expect(tokens[0]).toBe('*** AsteriskToken');
  expect(tokens[1]).toContain('NewLineTrivia');
    });

    test('*** followed by non-space is NOT thematic break', () => {
  const tokens = scanTokensStrings('***a');
  // Only the first asterisk token run is specialized; expect a single '*' token string
  expect(tokens[0]).toBe('* AsteriskToken');
    });

    test('--- and ___ allow trailing spaces or tabs before EOL', () => {
  const t1 = scanTokensStrings('--- \t\n'.replace('\\t','\t').replace('\\n','\n'));
  expect(t1[0]).toContain('DashToken');
  expect(t1[1]).toContain('NewLineTrivia');
  const t2 = scanTokensStrings('___\t\n'.replace('\\t','\t').replace('\\n','\n'));
  expect(t2[0]).toContain('UnderscoreToken');
  expect(t2[1]).toContain('NewLineTrivia');
    });
  });

  describe('Thematic Breaks', () => {
    test('scans asterisk thematic break', () => {
    const tokens = scanTokensStrings('***');
    expect(tokens[0]).toBe('*** AsteriskToken');
    });

    test('scans dash thematic break', () => {
    const tokens = scanTokensStrings('---');
    expect(tokens[0]).toBe('--- DashToken');
    });

    test('scans underscore thematic break', () => {
      // Note: This would require paragraph context tracking
    const tokens = scanTokensStrings('___');
    expect(tokens[0]).toBe('___ UnderscoreToken');
    });
  });

  describe('Escapes and punctuation audit', () => {
    test('escapable punctuation becomes literal HtmlText with IsEscaped', () => {
  const s = createScanner();
  s.setText('\\*');
  const k = s.scan();
  expect(k).toBe(SyntaxKind.HtmlText);
  expect(s.getTokenValue()).toBe('*');
  expect(s.getTokenFlags() & TokenFlags.IsEscaped).toBeTruthy();
    });

    test('non-escapable character after backslash leaves backslash token', () => {
  const s2 = createScanner();
  s2.setText('\\a');
  const k2 = s2.scan();
  expect(k2).toBe(SyntaxKind.BackslashToken);
  // next should be identifier 'a'
  expect(s2.scan()).toBe(SyntaxKind.Identifier);
    });
  });

  describe('Character Escapes', () => {
    test('scans escaped characters', () => {
  const tokens = scanTokensStrings('\\*not emphasis\\*');
  expect(tokens[0]).toBe('"\\\\*" HtmlText');
    });

    test('scans hard line break', () => {
  const tokens = scanTokensStrings('line 1\\\nline 2');
  expect(tokens.some(t => t.includes('BackslashToken'))).toBeTruthy();
    });
  });
});
