// @ts-check
/**
 * Tests for tables, frontmatter, and attribute blocks
 */

import { beforeEach, describe, expect, test } from 'vitest';

import { createScanner } from '../../scanner.js';
import { SyntaxKind, TokenFlags } from '../../../token-types.js';
import { scanTokensStrings } from '../utils.test.js';

describe('Tables, Frontmatter, and Attributes', () => {
  let scanner: ReturnType<typeof createScanner>;

  beforeEach(() => {
    scanner = createScanner();
  });

  // use shared helper for token-string assertions

  describe('Tables', () => {
    test('scans table pipe', () => {
  const tokens = scanTokensStrings('| Col 1 | Col 2 |');
  expect(tokens[0]).toBe('| PipeToken');
    });

    test('scans table row with multiple pipes', () => {
  const tokens = scanTokensStrings('| A | B | C |');
  const pipes = tokens.filter(t => t.includes('PipeToken'));
  expect(pipes).toHaveLength(4);
    });
  });

  describe('Frontmatter', () => {
    test('scans YAML frontmatter fence', () => {
  const tokens = scanTokensStrings('---\ntitle: Test\n---');
  expect(tokens[0]).toBe('--- DashDashDash');
    });

    test('scans TOML frontmatter fence', () => {
  const tokens = scanTokensStrings('+++\ntitle = "Test"\n+++');
  expect(tokens[0]).toBe('+++ PlusToken');
    });

    test('only recognizes frontmatter at document start', () => {
  const tokens = scanTokensStrings('Some text\n---\nNot frontmatter');
  // The --- should be treated as a regular dash sequence, not frontmatter
  const dashTokens = tokens.filter(t => t.includes('DashToken'));
  expect(dashTokens.length).toBeGreaterThan(0);
  // Should not be DashDashDash token
  expect(tokens.find(t => t.includes('DashDashDash'))).toBeUndefined();
    });
  });

  describe('Attribute Blocks', () => {
    test('scans attribute block', () => {
  const tokens = scanTokensStrings('{#id .class key=value}');
  expect(tokens[0]).toContain('OpenBraceToken');
  // value is part of scanner token value; validate via scanner instance
  const s = createScanner();
  s.setText('{#id .class key=value}');
  expect(s.scan()).toBe(SyntaxKind.OpenBraceToken);
  expect(s.getTokenValue()).toBe('#id .class key=value');
    });

    test('scans nested braces in attribute block', () => {
  const tokens = scanTokensStrings('{style="color: {red}"}');
  expect(tokens[0]).toContain('OpenBraceToken');
  const s2 = createScanner();
  s2.setText('{style="color: {red}"}');
  expect(s2.scan()).toBe(SyntaxKind.OpenBraceToken);
  expect(s2.getTokenValue()).toBe('style="color: {red}"');
    });

    test('does not scan multiline attribute block', () => {
  const tokens = scanTokensStrings('{\nid="test"\n}');
  expect(tokens[0]).toBe('{ OpenBraceToken');
    });
  });
});
