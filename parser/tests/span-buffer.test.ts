import { describe, it, expect } from 'vitest';
import { createSpanBuffer } from '../scanner/span-buffer';

describe('SpanBuffer', () => {
  it('materialize returns empty string when no spans were added', () => {
    const sb = createSpanBuffer({ source: 'hello world' });
    expect(sb.materialize()).toBe('');
  });

  it('single span returns exact substring and exact debug state', () => {
    const src = 'hello world';
    const sb = createSpanBuffer({ source: src });
    sb.addSpan(0, 5); // 'hello'
    const dbg = {} as any;
    sb.fillDebugState(dbg);
    expect(dbg).toEqual({ spanCount: 1, spanCapacity: 1 });
    expect(sb.materialize()).toBe('hello');
  });

  it('multiple spans join and report exact reservedSlots', () => {
    const src = 'foo bar baz';
    const sb = createSpanBuffer({ source: src });
    const dbg = {} as any;

    sb.addSpan(0, 3); // 'foo'
    sb.fillDebugState(dbg);
    expect(dbg).toEqual({ spanCount: 1, spanCapacity: 1 });

    sb.addSpan(4, 3); // 'bar'
    sb.fillDebugState(dbg);
    expect(dbg).toEqual({ spanCount: 2, spanCapacity: 2 });

    sb.addSpan(8, 3); // 'baz'
    sb.fillDebugState(dbg);
    expect(dbg).toEqual({ spanCount: 3, spanCapacity: 3 });

    expect(sb.materialize()).toBe('foo bar baz');
  });

  it('materialize uses custom delimiter and reports exact reservedSlots', () => {
    const src = 'a|b|c';
    const sb = createSpanBuffer({ source: src, delimiter: '|' });
    const dbg = {} as any;

    sb.addSpan(0, 1);
    sb.fillDebugState(dbg);
    expect(dbg).toEqual({ spanCount: 1, spanCapacity: 1 });

    sb.addSpan(2, 1);
    sb.fillDebugState(dbg);
    expect(dbg).toEqual({ spanCount: 2, spanCapacity: 2 });

    sb.addSpan(4, 1);
    sb.fillDebugState(dbg);
    expect(dbg).toEqual({ spanCount: 3, spanCapacity: 3 });

    expect(sb.materialize()).toBe('a|b|c');
  });

  it('clear resets spanCount but keeps spanCapacity exact', () => {
    const src = 'repeat this sentence many times to grow backing';
    const sb = createSpanBuffer({ source: src });
    const dbg = {} as any;

    for (let i = 0; i < 16; i++) {
      sb.addSpan(i, 1);
      sb.fillDebugState(dbg);
      expect(dbg).toEqual({ spanCount: i + 1, spanCapacity: i + 1 });
    }

    const dbgBefore = {} as any;
    sb.fillDebugState(dbgBefore);
    expect(dbgBefore).toEqual({ spanCount: 16, spanCapacity: 16 });

    // Clear and ensure spanCount is reset but reservedSlots unchanged
    sb.clear();
    const dbgAfter = {} as any;
    sb.fillDebugState(dbgAfter);
    expect(dbgAfter).toEqual({ spanCount: 0, spanCapacity: 16 });
  });
});
