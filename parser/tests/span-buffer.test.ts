import { describe, it, expect } from 'vitest';
import { createSpanBuffer } from '../scanner/span-buffer';

describe('SpanBuffer', () => {
  it('materialize returns empty string when no spans were added', () => {
    const sb = createSpanBuffer({ source: 'hello world' });
    expect(sb.materialize()).toBe('');
  });

  it('single span returns exact substring and exact debug state', () => {
    const sb = createSpanBuffer({ source: 'hello world' });
    sb.addSpan(0, 5); // 'hello'
    const dbg = {};
    sb.fillDebugState(dbg);
    expect(dbg).toEqual({ spanCount: 1, spanCapacity: 1, extraordinaryCount: 0, extraordinaryCapacity: 0 });
    expect(sb.materialize()).toBe('hello');
  });

  it('multiple spans join and report exact reservedSlots', () => {
    const sb = createSpanBuffer({ source: 'foo bar baz' });
    const dbg = {};

    sb.addSpan(0, 3); // 'foo'
    sb.fillDebugState(dbg);
    expect(dbg).toEqual({ spanCount: 1, spanCapacity: 1, extraordinaryCount: 0, extraordinaryCapacity: 0 });

    sb.addSpan(4, 7); // 'bar'
    sb.fillDebugState(dbg);
    // merged with previous because the intervening source equals delimiter
    expect(dbg).toEqual({ spanCount: 1, spanCapacity: 1, extraordinaryCount: 0, extraordinaryCapacity: 0 });

    sb.addSpan(8, 11); // 'baz'
    sb.fillDebugState(dbg);
    // merged again into single large span
    expect(dbg).toEqual({ spanCount: 1, spanCapacity: 1, extraordinaryCount: 0, extraordinaryCapacity: 0 });

    expect(sb.materialize()).toBe('foo bar baz');
  });

  it('materialize uses custom delimiter and reports exact reservedSlots', () => {
    const sb = createSpanBuffer({ source: 'a|b|c', delimiter: '|' });
    const dbg = {};

    sb.addSpan(0, 1);
    sb.fillDebugState(dbg);
    expect(dbg).toEqual({ spanCount: 1, spanCapacity: 1, extraordinaryCount: 0, extraordinaryCapacity: 0 });

    sb.addSpan(2, 3);
    sb.fillDebugState(dbg);
    // merged with previous because intervening substring equals the delimiter
    expect(dbg).toEqual({ spanCount: 1, spanCapacity: 1, extraordinaryCount: 0, extraordinaryCapacity: 0 });

    sb.addSpan(4, 5);
    sb.fillDebugState(dbg);
    // merged again into a single large span
    expect(dbg).toEqual({ spanCount: 1, spanCapacity: 1, extraordinaryCount: 0, extraordinaryCapacity: 0 });

    expect(sb.materialize()).toBe('a|b|c');
  });

  it('clear resets spanCount but keeps spanCapacity exact', () => {
    const sb = createSpanBuffer({ source: 'repeat this sentence many times to grow backing' });
    const dbg = {};

    let prevCapacity = 0;
    for (let i = 0; i < 16; i++) {
      sb.addSpan(i, i + 1);
      sb.fillDebugState(dbg);
      // Because of span merging the exact spanCount may be <= i+1. We assert
      // basic invariants: capacity is non-decreasing and >= spanCount, and no
      // extraordinary chars were added.
      // Assert the whole debug object at once. Some fields (spanCapacity,
      // spanCount, extraordinaryCapacity) are implementation-dependent and
      // may change as the buffer grows; include them directly from the
      // current dbg to keep the assertion single-shot while still asserting
      // that extraordinaryCount is zero.
      expect(dbg).toEqual({
        spanCount: i + 1,
        spanCapacity: i + 1,
        extraordinaryCount: 0,
        extraordinaryCapacity: 0,
      });
      prevCapacity = dbg.spanCapacity;
    }

    const dbgBefore = {};
    sb.fillDebugState(dbgBefore);
    expect(dbgBefore).toEqual({
      spanCount: 16,
      spanCapacity: 16,
      extraordinaryCount: 0,
      extraordinaryCapacity: 0,
    });

    // Clear and ensure spanCount is reset but reservedSlots unchanged
    sb.clear();
    const dbgAfter = {};
    sb.fillDebugState(dbgAfter);
    // capacity should be unchanged from the last observed capacity
    expect(dbgAfter).toEqual({
      spanCount: 0,
      spanCapacity: prevCapacity,
      extraordinaryCount: 0,
      extraordinaryCapacity: 0,
    });
  });

  it('addChar injects extraordinary single characters and materializes them', () => {
    const sb = createSpanBuffer({ source: 'ignored source because chars are extraordinary' });

    sb.addChar(true, '\u2603', true); // snowman, default: delimiters on both sides
    expect(sb.materialize()).toBe('\u2603');
  });

  it('mixed normal and extraordinary spans materialize in order', () => {
    const sb = createSpanBuffer({ source: 'helloWORLD', delimiter: ' ' });

    sb.addSpan(0, 5); // 'hello'
    sb.addChar(true, '-', true);
    sb.addSpan(5, 10); // 'WORLD'

    expect(sb.materialize()).toBe('hello - WORLD');
  });

  it('addChar deduplicates characters in the registry', () => {
    const sb = createSpanBuffer({ source: '' });
    const dbg = {};

    sb.addChar(true, 'x', true);
    sb.addChar(true, 'y', true);
    sb.addChar(true, 'x', true); // duplicate

    sb.fillDebugState(dbg);
    // two unique extraordinary characters only - assert whole debug object
    expect(dbg).toEqual({
      spanCount: 3,
      spanCapacity: 3,
      extraordinaryCount: 2,
      extraordinaryCapacity: 2,
    });
    expect(sb.materialize()).toBe('x y x');
  });

  it('extraordinary chars can stick to previous or next spans', () => {
    const sb = createSpanBuffer({ source: 'Abcdef123', delimiter: ' ' });

    // Want: ['Abc', '&', 'def', '123'] but '&' should stick to both sides -> no delimiter around it
    sb.addSpan(0, 3); // 'Abc'
    sb.addChar(false, '&', false); // no delimiters on either side => sticks to neighbors
    sb.addSpan(3, 6); // 'def'
    sb.addSpan(6, 9); // '123'

    // materialize should concatenate Abc&def 123 (because & joins Abc and def)
    expect(sb.materialize()).toBe('Abc&def 123');
  });

  it('left-only extraordinary char attaches to previous span', () => {
    const sb = createSpanBuffer({ source: 'one two', delimiter: ' ' });
    sb.addSpan(0, 3); // 'one'
    sb.addChar(false, '*', true); // left-only -> attaches to 'one'
    sb.addSpan(4, 7); // 'two'
    expect(sb.materialize()).toBe('one* two');
  });

  it('right-only extraordinary char attaches to next span', () => {
    const sb = createSpanBuffer({ source: 'foo bar', delimiter: ' ' });
    sb.addSpan(0, 3); // 'foo'
    sb.addChar(true, '~', false); // right-only -> attaches to 'bar'
    sb.addSpan(4, 7);
    expect(sb.materialize()).toBe('foo ~bar');
  });

  it('consecutive extraordinary chars with mixed flags produce expected output', () => {
    const sb = createSpanBuffer({ source: 'a b c', delimiter: ' ' });
    sb.addSpan(0, 1); // 'a'
    sb.addChar(false, '&', false); // sticks both sides
    sb.addChar(true, '#', true); // surrounded by delimiters
    sb.addSpan(2, 3); // 'b'
    sb.addSpan(4, 5); // 'c'
    expect(sb.materialize()).toBe('a&# b c');
  });

  it('empty delimiter causes adjacent spans to merge', () => {
    const sb = createSpanBuffer({ source: 'abcd', delimiter: '' });
    sb.addSpan(0, 2); // 'ab'
    sb.addSpan(2, 4); // 'cd' -> merged into 'abcd'
    expect(sb.materialize()).toBe('abcd');
  });

  it('merging does not occur across extraordinary entries', () => {
    const sb = createSpanBuffer({ source: 'x y z', delimiter: ' ' });
    sb.addSpan(0, 1); // 'x'
    sb.addChar(true, '-', true);
    sb.addSpan(2, 3); // 'y' - addSpan should NOT merge with previous 'x' because of extraordinary char
    sb.addSpan(4, 5); // 'z' - may merge with 'y'
    const dbg = {};
    sb.fillDebugState(dbg);
    // Assert whole debug state: expect three entries (x, extraordinary '-', and merged 'y z')
    expect(dbg).toEqual({
      spanCount: 3,
      spanCapacity: 3,
      extraordinaryCount: 1,
      extraordinaryCapacity: 1,
    });
    expect(sb.materialize()).toBe('x - y z');
  });
});
