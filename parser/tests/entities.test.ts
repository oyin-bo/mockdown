import { describe, expect, test } from 'vitest';
import { decodeEntity, decodeNumericEntity } from '../entities.js';

describe('Entities utilities', () => {
  test('decodes named entities', () => {
    expect(decodeEntity('&amp;')).toBe('&');
    expect(decodeEntity('&lt;')).toBe('<');
    expect(decodeEntity('&gt;')).toBe('>');
    expect(decodeEntity('&quot;')).toBe('"');
    expect(decodeEntity('&apos;')).toBe("'");
    expect(decodeEntity('&nbsp;')).toBe('\u00A0');
  });

  test('unknown named entities return input by default', () => {
    expect(decodeEntity('&unknown;')).toBe('&unknown;');
  });

  test('unknown named entities can be forced to replacement', () => {
    expect(decodeEntity('&unknown;', false)).toBe('\uFFFD');
  });

  test('decodes decimal numeric entities', () => {
    expect(decodeNumericEntity('&#65;')).toBe('A');
    expect(decodeEntity('&#66;')).toBe('B');
  });

  test('decodes hex numeric entities', () => {
    expect(decodeNumericEntity('&#x41;')).toBe('A');
    expect(decodeEntity('&#x42;')).toBe('B');
  });

  test('invalid numeric entities yield replacement', () => {
    expect(decodeNumericEntity('&#;')).toBe('\uFFFD');
    expect(decodeNumericEntity('&#x;')).toBe('\uFFFD');
    expect(decodeNumericEntity('&#xZZ;')).toBe('\uFFFD');
    expect(decodeNumericEntity('&#99999999;')).toBe('\uFFFD');
  });
});
