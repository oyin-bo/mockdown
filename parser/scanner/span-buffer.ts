/**
 * SpanBuffer - grow-only span accumulator for scanner cross-line joining
 * Located next to scanner.ts and intentionally self-contained (no imports).
 * Implementation follows docs/14-span-buffer.md requirements.
 */

export interface SpanBuffer {
  addSpan(start: number, length: number): void;
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

  function addSpan(start: number, length: number): void {
    // Hot path: push two slots for the span. JS engines grow arrays efficiently
    // so manual doubling/resizing isn't necessary here. Keep a strict cap.
    if (spanCount >= MAX_SPANS)
      throw new Error('SpanBuffer: exceeded maximum allowed spans');

    spans.push(start, length);
    spanCount++;
  }

  function clear(): void {
    spanCount = 0;
    // Do not shrink backing - grow-only
  }

  function materialize(): string {
    if (spanCount === 0) return '';
    if (spanCount === 1) {
      const s = spans[0];
      const l = spans[1];
      return source.substring(s, s + l);
    }

    // Reuse parts array
    stringParts.length = 0;
    for (let i = 0; i < spanCount; i++) {
      const s = spans[i * 2];
      const l = spans[i * 2 + 1];
      stringParts.push(source.substring(s, s + l));
    }
    // Join with delimiter
    const joined = stringParts.join(delimiterChar);
    return joined;
  }

  function fillDebugState(state: SpanBufferDebugState): void {
    state.spanCount = spanCount;
    state.spanCapacity = spans.length / 2;
  }

  return {
    addSpan,
    clear,
    materialize,
    fillDebugState,
  };
}

export interface SpanBufferDebugState {
  spanCount: number;
  spanCapacity: number;
}

