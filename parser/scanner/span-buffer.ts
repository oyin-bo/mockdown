/**
 * SpanBuffer - grow-only span accumulator for scanner cross-line joining
 * Located next to scanner.ts and intentionally self-contained (no imports).
 * Implementation follows docs/14-span-buffer.md requirements.
 */

export interface SpanBuffer {
  // second parameter is end index (exclusive)
  addSpan(start: number, end: number): void;
  addChar(delimiterStart: boolean, ch: string, delimiterEnd: boolean): void;
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
  // Backing storage: pairs of [start, end) - end is exclusive
  const delimiterChar = delimiter ?? ' ';
  if (delimiterChar.length > 1)
    throw new Error('SpanBuffer: delimiter must be a single character or empty string');

  let spans: number[] = [];
  let spanCount = 0;
  // Registry for extraordinary single-character injections. Per-instance and
  // deduplicated using indexOf/findIndex to avoid extra Map allocations on the
  // hot path.
  const extraordinaryChars: string[] = [];

  function addSpan(start: number, end: number): void {
    // Hot path: push two slots for the span. JS engines grow arrays efficiently
    // so manual doubling/resizing isn't necessary here. Keep a strict cap.
    if (spanCount >= MAX_SPANS)
      throw new Error('SpanBuffer: exceeded maximum allowed spans');

    // Attempt merge with previous span when both are normal spans and the
    // substring between them equals the configured delimiter. This avoids
    // producing many small spans for typical word-by-word emission.
    if (spanCount > 0) {
      const prevStart = spans[(spanCount - 1) * 2];
      const prevEnd = spans[(spanCount - 1) * 2 + 1];
      if (prevStart >= 0 && start === prevEnd + delimiterChar.length) {
        if (!delimiterChar.length || delimiterChar.charCodeAt(0) === source.charCodeAt(prevEnd)) {
          spans[(spanCount - 1) * 2 + 1] = end;
          return;
        }
      }
    }

    spans.push(start, end);
    spanCount++;
  }

  // addChar captures whether delimiters should appear on the left (delimiterStart)
  // and right (delimiterEnd) of the extraordinary character. Both are booleans.
  // We encode the two booleans into a small bitmask stored in the first slot as
  // a negative value (-(flags + 1)). The second slot remains the registry index.
  function addChar(delimiterStart: boolean, ch: string, delimiterEnd: boolean): void {
    if (spanCount >= MAX_SPANS)
      throw new Error('SpanBuffer: exceeded maximum allowed spans');

    let idx = extraordinaryChars.indexOf(ch);
    if (idx < 0) {
      idx = extraordinaryChars.length;
      extraordinaryChars.push(ch);
    }

    const flags = (delimiterStart ? 1 : 0) | (delimiterEnd ? 2 : 0);
    const encStart = -(flags + 1);
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
      const second = spans[1];
      if (start >= 0) return source.substring(start, second);
      return extraordinaryChars[second];
    }

    // Fast path for two normal spans only (most common case)
    if (spanCount === 2 && spans[0] >= 0 && spans[2] >= 0) {
      const start1 = spans[0];
      const end1 = spans[1];
      const start2 = spans[2];
      const end2 = spans[3];
      return source.substring(start1, end1) + delimiterChar +
        source.substring(start2, end2);
    }

    // General path: build parts but honour extraordinary char flags that may
    // request no delimiter to the left (bit 1) or right (bit 2). We encode
    // flags as stored in the negative first slot: flags = -1 - storedValue.
    stringParts.length = 0;
    for (let i = 0; i < spanCount; i++) {
      const first = spans[i * 2];
      const second = spans[i * 2 + 1];

      let part: string;
      // For normal spans the default is to have delimiters on both sides.
      let leftSticky = true;
      let rightSticky = true;

      if (first >= 0) {
        const end = second;
        part = source.substring(first, end);
      } else {
        const flags = -1 - first;
        leftSticky = (flags & 1) === 0 ? false : true;
        rightSticky = (flags & 2) === 0 ? false : true;
        part = extraordinaryChars[second] ?? '';
      }

      // If this part should not have a delimiter on the left, and there is a
      // previous part, merge it into the previous part.
      if (!leftSticky && stringParts.length > 0) {
        const prev = stringParts.pop()!;
        stringParts.push(prev + part);
      } else {
        stringParts.push(part);
      }

      // If this part indicates it should stick to the next part (no delimiter
      // on the right), and there is a next span, then merge it now with the
      // next span. We implement this by peeking ahead one span and merging
      // their textual value immediately, and advancing the index.
        if (!rightSticky && i + 1 < spanCount) {
        // build next part text
        const nextFirst = spans[(i + 1) * 2];
        const nextSecond = spans[(i + 1) * 2 + 1];
        let nextPart: string;
        if (nextFirst >= 0) {
          nextPart = source.substring(nextFirst, nextSecond);
        } else {
          const nextFlags = -1 - nextFirst;
          // next leftSticky is determined by its flags; but since current
          // requested to stick to the next, we must concatenate regardless of
          // next's leftSticky.
          nextPart = extraordinaryChars[nextSecond] ?? '';
        }

        // pop current and push merged
        const cur = stringParts.pop()!;
        stringParts.push(cur + nextPart);

        // skip the next span since we've consumed it
        i += 1;
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

