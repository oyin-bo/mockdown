/**
 * SpanBuffer - grow-only span accumulator for scanner cross-line joining
 * Located next to scanner.ts and intentionally self-contained (no imports).
 * Implementation follows docs/14-span-buffer.md requirements.
 */

export interface SpanBuffer {
  addSpan(start: number, length: number): void;
  addChar(ch: string): void;
  clear(): void;
  materialize(): string;
  fillDebugState(state: Partial<SpanBufferDebugState>): void;
}

const MAX_SPANS = 1 << 24; // safety cap (very large, 24 bit number)

// Reusable parts array for materialization to avoid allocating a new array
const stringParts: string[] = [];

export function createSpanBuffer({ source, delimiter }:
  { source: string, delimiter?: string }): SpanBuffer {
  // Backing storage: pairs of [start, length]
  const delimiterChar = delimiter ?? ' ';

  let spans: number[] = [];
  let spanCount = 0;
  // Registry for extraordinary single-character injections. Per-instance and
  // deduplicated using indexOf/findIndex to avoid extra Map allocations on the
  // hot path.
  const extraordinaryChars: string[] = [];

  function addSpan(start: number, length: number): void {
    // Hot path: push two slots for the span. JS engines grow arrays efficiently
    // so manual doubling/resizing isn't necessary here. Keep a strict cap.
    if (spanCount >= MAX_SPANS)
      throw new Error('SpanBuffer: exceeded maximum allowed spans');

    spans.push(start, length);
    spanCount++;
  }

  function addChar(ch: string): void {
    if (spanCount >= MAX_SPANS)
      throw new Error('SpanBuffer: exceeded maximum allowed spans');

    let idx = extraordinaryChars.indexOf(ch);
    if (idx < 0) {
      idx = extraordinaryChars.length;
      extraordinaryChars.push(ch);
    }

    // Encode extraordinary span: store negative start to mark extraordinary
    // and keep the registry index in the second slot.
    const encStart = -(idx + 1);
    spans.push(encStart, idx);
    spanCount++;
  }

  function clear(): void {
    spanCount = 0;
    // Do not shrink backing - grow-only
  }

  function materialize(): string {
    if (spanCount === 0) return '';

    // Fast path for single-span materialization (handle extraordinary too)
    if (spanCount === 1) {
      const start = spans[0];
      const len = spans[1];
      if (start >= 0) return source.substring(start, start + len);
      return extraordinaryChars[len];
    }

    // Fast path for two normal spans only (most common case)
    if (spanCount === 2 && spans[0] >= 0 && spans[2] >= 0) {
      const start1 = spans[0];
      const len1 = spans[1];
      const start2 = spans[2];
      const len2 = spans[3];
      return source.substring(start1, start1 + len1) + delimiterChar +
        source.substring(start2, start2 + len2);
    }

    // Reuse parts array
    stringParts.length = 0;
    for (let i = 0; i < spanCount; i++) {
      const start = spans[i * 2];
      const len = spans[i * 2 + 1];
      if (start >= 0) {
        stringParts.push(source.substring(start, start + len));
      } else {
        stringParts.push(extraordinaryChars[len] ?? '');
      }
    }
    // Join with delimiter
    return stringParts.join(delimiterChar);
  }

  function fillDebugState(state: SpanBufferDebugState): void {
    state.spanCount = spanCount;
    state.spanCapacity = spans.length / 2;
    state.extraordinaryCount = extraordinaryChars.length;
    state.extraordinaryCapacity = extraordinaryChars.length;
  }

  return {
    addSpan,
    addChar,
    clear,
    materialize,
    fillDebugState,
  };
}

export interface SpanBufferDebugState {
  spanCount: number;
  spanCapacity: number;
  extraordinaryCount: number;
  extraordinaryCapacity: number;
}

