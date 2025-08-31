import { describe, expect, test } from 'vitest';

import { createScanner } from '../../scanner.js';
import { scanTokensStrings, syntaxKind } from '../utils.test.js';

describe('Basic Punctuation', () => {
  test('scans hash token', () => {
    expect(scanTokensStrings('#')).toEqual(['# HashToken', 'EndOfFileToken']);
  });

  test('scans asterisk token', () => {
    expect(scanTokensStrings('*')).toEqual(['* AsteriskToken', 'EndOfFileToken']);
  });

  test('scans underscore token', () => {
    expect(scanTokensStrings('_')).toEqual(['_ UnderscoreToken', 'EndOfFileToken']);
  });

  test('scans dash token', () => {
    expect(scanTokensStrings('-')).toEqual(['- DashToken', 'EndOfFileToken']);
  });

  test('scans plus token', () => {
    expect(scanTokensStrings('+')).toEqual(['+ PlusToken', 'EndOfFileToken']);
  });

  test('scans equals token', () => {
    expect(scanTokensStrings('=')).toEqual(['= EqualsToken', 'EndOfFileToken']);
  });

  test('scans backtick token', () => {
    expect(scanTokensStrings('`')).toEqual(['` BacktickToken', 'EndOfFileToken']);
  });

  test('scans tilde token', () => {
    expect(scanTokensStrings('~')).toEqual(['~ TildeToken', 'EndOfFileToken']);
  });

  test('scans pipe token', () => {
    expect(scanTokensStrings('|')).toEqual(['| PipeToken', 'EndOfFileToken']);
  });

  test('scans less than token', () => {
    expect(scanTokensStrings('<')).toEqual(['< LessThanToken', 'EndOfFileToken']);
  });

  test('scans greater than token', () => {
    expect(scanTokensStrings('>')).toEqual(['> GreaterThanToken', 'EndOfFileToken']);
  });

  test('scans closing tag token', () => {
    expect(scanTokensStrings('</div>')).toEqual([
      '</ LessThanSlashToken',
      'div Identifier',
      '> GreaterThanToken',
      'EndOfFileToken']);
  });

  test('scans self-closing tag slash', () => {
    expect(scanTokensStrings('/>')).toEqual(['/> SlashGreaterThanToken', 'EndOfFileToken']);
  });

  test('rescans backtick to specialized backtick scanner', () => {
    const scanner = createScanner();
    scanner.setText('``code');
    scanner.scan(); // initial
    const kind = scanner.reScanBacktickToken();
    expect(syntaxKind(kind)).toBe('BacktickToken');
    const flags = scanner.getTokenFlags();
    // run-length should be 2
    const run = (flags >> 16) & 0x3F;
    expect(run).toBe(2);
  });

  test('rescans pipe as pipe token', () => {
    const scanner = createScanner();
    scanner.setText('| a | b');
    scanner.scan();
    const kind = scanner.reScanPipeToken();
    expect(syntaxKind(kind)).toBe('PipeToken');
  });

  test('rescans hash token consistently', () => {
    const scanner = createScanner();
    scanner.setText('# heading');
    expect(syntaxKind(scanner.scan())).toBe('HashToken');
    expect(syntaxKind(scanner.reScanHashToken())).toBe('HashToken');
  });

  test('rescans slash when self-closing pattern present', () => {
    const scanner = createScanner();
    scanner.setText('/>');
    // initial scan sees '/>' fully
    expect(syntaxKind(scanner.scan())).toBe('SlashGreaterThanToken');
    // rescan from the same token start yields same
    const kind = scanner.reScanSlashToken();
    expect(syntaxKind(kind)).toBe('SlashGreaterThanToken');
  });
});
