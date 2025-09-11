# SpanBuffer: extraction plan

This document defines a safe, high-performance, grow-only span buffer module that can be extracted from the scanner and imported back with zero or negligible runtime overhead for the scanner's hot path.

Goals
- Provide a minimal, predictable API used by the scanner to accumulate [start,length] spans for string normalization and cross-line joining.
- Guarantee amortized O(1) append cost and avoid per-token allocation of temporary arrays (reuse a single buffer instance).
 - Offer a single well-tested materialization strategy: simple reusable string parts (no typed-array or platform-specific paths).
- Be testable in isolation and benchable against the existing in-scanner normalizer.

Design constraints and contract
- Grow-only: the internal buffer only grows; it is never shrunk by normal operations. Clearing a span set resets only the effective count, not the backing array length.
- Safety cap: module enforces a configurable maximum span count (to avoid pathological OOM). Exceeding the cap triggers a controlled fallback or error.
- Hot-path minimalism: methods that run in the scanner hot path must be small and not allocate objects except when necessarily growing the backing buffer or producing the final string.
- Final string allocation is unavoidable in JS; the module minimizes extra temporaries.

API surface (minimal)

The module exposes a closure-based factory `createSpanBuffer(delimiter?)` that returns a small object with the hot-path methods used by the scanner.

TypeScript-like signature (for clarity):

```typescript
function createSpanBuffer(source: string, delimiter?: string): {
	// Append a new span. Very hot path: must be inlined and allocation-free normally.
	addSpan(start: number, length: number): void;

	// Clears pending spans (fast: resets count, doesn't modify backing array)
	clear(): void;

	// Materialize pending spans into a JS string. May allocate the final string and small temporaries.
	materialize(): string;

	// Fill a debug state object for testing/inspection (no allocations of backing buffers).
	// Use this to inspect internal counters such as spanCount and reservedSlots in tests.
	fillDebugState(state: { spanCount: number; reservedSlots: number; pendingStart: number }): void;
};
```

Usage contract
- Hot-path uses only: `addSpan()` and `clear()` (for starting/aborting accumulation). Do NOT access internal counters directly from production code—use `fillDebugState` in tests instead.
- `materialize()` is called only when emission is required (special char, non-continuing line, EOF). It's allowed to be a little heavier.

Backed storage and growth policy
- Backing storage: a plain `number[]` will be used for maximum compatibility and SMI benefits.
- Encoding: adjacent slots: index 0=start0, index1=len0, index2=start1, index3=len1, ...
- Growth rule: on demand doubling. Algorithm:
	- neededSlots = (spanCount + 1) * 2
	- if (backing.length < neededSlots) backing.length = Math.max(neededSlots, backing.length * 2 || 8)
- Max spans: configurable `maxSpans` (default e.g. 1<<16 spans) — implementers may choose a different default based on memory profile.
- Clear: set `spanCount = 0` and (optionally) `pendingStart = -1`; do NOT change backing.length.


Materialization strategy algorithm:
- If spanCount === 0 return ''
- If spanCount === 1 return source.substr(start0, len0)
- Use a single module-global reusable `stringParts: string[]` array (allocated once by the module). On each call set `stringParts.length = 0`.
- For each span i: stringParts.push(source.substr(start_i, len_i));
- Return stringParts.join(delimiter)

Allocations:
- No per-call allocation for the `stringParts` array object.
- Substring calls allocate small strings (unavoidable when extracting substrings from `source`).
- Final `join` allocates the final string.

Pros:
- Simple, safe across engines, minimal code and maintenance burden.

Testing plan
- Unit tests (fast):
	- single-span returns exact substring
	- multi-span returns spans joined with single spaces
	- leading/trailing whitespace preserved per scanner expectations (spans themselves are meaningful content)
	- combination of tabs and spaces scanned into spans result in expected joins
	- large token growth: ensure backing array grows and subsequent clears reuse it (inspect `reservedSlots` and the backing array identity in tests)
	- cap behavior: cause cap exceed and assert fallback/exception behavior

- Integration tests:
	- A smoke test that exercises scanner + SpanBuffer using a short example with cross-line joining and with rollbacks

Integration notes for the scanner
// Keep `addSpan()` and `clear()` inlined in the hot loop; avoid wrapper allocation. Example usage inside scanner:

```typescript
	// scanner closure has: const sb = createSpanBuffer(source, ' '); // source captured up-front
	// when scanning
	sb.addSpan(segmentStart, segmentLen);
	// on line break: decide to continue or emit
	if (!shouldContinue) {
		const text = sb.materialize(); // clears the buffer
		// Emit the concatenated text;
		emitStringLiteral(text);
	}
```

SpanBuffer is purely a text-accumulation facility. It does not track, combine, or expose token metadata. `materialize()` simply returns the joined text.

- Avoid creating per-call option objects — call the `materialize()` in the common path. If tunables are required, store them on the SpanBuffer instance.

Development & rollout plan
1. Implement `createSpanBuffer` in `parser/src/spanBuffer.ts` using the above API and the `parts` materializer. The factory takes the `source` string and an optional `delimiter` string (default ' ') and exposes the small hot-path object. Do NOT expose initialSlots/maxSpans in the public API; keep any sizing caps internal to the implementation. Tests should use `fillDebugState` to inspect internal counters and buffer reuse.
2. Add unit tests in `parser/tests/spanBuffer.test.ts` and run them.
3. Replace scanner-internal span logic with imports from `SpanBuffer` behind a runtime configuration toggle (e.g., `spanBufferEnabled`) to allow staged rollout.
4. Run the full test-suite and benchmarks and iterate.

Notes and rationale
- This extraction keeps the scanner hot-path extremely small: `addSpan` and `clear` are tiny and allocation-free in the common case. Materialization cost is still required but isolated and testable.
 - Reuse of a small `stringParts` array inside the module captures the main allocation wins in one place and avoids accidental per-token allocations scattered through the scanner.

Appendix: developer checklist when implementing
- Implement low-level `addSpan` with growth-by-doubling and a `MAX_SPANS` check.
- Implement the `parts` materializer using a module-level `stringParts: string[]` reused across calls.
- Provide instrumentation hooks (tests) to assert that the backing arrays are reused between calls.
- Ensure `clear()` leaves backing arrays intact.

# Latter adjustments

* Avoid manual growth doubling, rely on JS engine optimised push behaviour.