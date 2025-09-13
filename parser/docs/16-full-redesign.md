## Simple scanner inside complex scanner — high-level overview

This note evaluates the proposal to embed a tiny, zero-allocation "simple scanner" that scans ahead a single line (or other short window) and emits a compact, provisional stream of spans (length + flags) which the main scanner later finalizes into semantic tokens. The provisional stream is intentionally cheap to produce and cheap to inspect; only at line-finalization time (or other well-defined stop points) do we perform the more expensive pairing/semantic resolution steps.

At a glance this approach aims to: simplify the main scanner's logic, reduce character-level re-scanning by lifting most work to a coarser span-level pass, keep the hot path allocation-free, and minimize temporary string creation. The idea reuses the design patterns in `SpanBuffer` (compact pairs in numeric arrays, merging where possible) and the `LineClassification` facility (single-line, zero-alloc analysis) and composes them into a two-phase per-line pipeline:

- Phase 1: Provisional scan (very hot, zero-alloc). Walk the input line once. Emit small numeric records into a compact backing buffer: span-length (or start+length), plus lightweight flags describing the surface shape of the span (plain text, potential emphasis opener, emphasis closer, backtick-run, punctuation, link-bracket, image-marker, escape, etc.). Do not attempt heavy pairing decisions during this scan.

- Phase 2: Finalize at stop points (cheaper than character re-scan). When the scan reaches a decision point (line end, fence close, block boundary, or other deterministic stop), run a span-level resolution pass over the provisional records. Pair up matching markers, resolve fence lengths, merge adjacent plain spans, produce final semantic tokens with positions and minimal string materialization.

This reorganizes the scanner into a streaming, single-pass-at-character-cost workflow whose rework is mostly limited to compact span records rather than full string rescans and substring allocations.

## Where this idea sits relative to prior art

- Two-phase lexing / speculative lexing: Many compilers and language toolchains implement a cheap first pass that recognizes coarse tokens and a second pass that resolves context-dependent tokens. This design is the same idea applied to the domain of markup parsing where many tokens are ambiguous until the line/block context is known.

- Incremental editors / change-aware parsers: Editors like Roslyn or tree-sitter use incremental parse trees and token buffering to avoid re-tokenizing whole documents. The provisional-span idea is aligned with incremental thinking: keep small, replay-safe records and re-resolve only the minimal region when context changes.

- Scannerless or scanner-fusion approaches: Some grammars avoid a separate scanner entirely. This proposal preserves a scanner but delegates ambiguous character-level work to a local, provisional buffer — a hybrid approach that gains scannerless-like flexibility while preserving scanning performance.

- CommonMark and other Markdown implementations: Many implementations already do ad-hoc lookahead and character rescans for emphasis pairing and fence detection. The provisional-span approach formalises and optimizes that work by recording surface events once and operating on them later.

Novelty: the combination of (a) zero-allocation provisional records in a SpanBuffer-like numeric layout, (b) deferring pairing until line/block finalization, and (c) performing pairing/merging operations over compact indices (not substrings) is an uncommon but natural fit for high-performance text processing and has clear engineering upside in this project.

## Detailed design

### Data model — ProvisionalSpan (compact)

We prefer a numeric-packed layout similar to `SpanBuffer` for minimal overhead. Two viable encodings:

1. Absolute pairs: [start, length, flags]
	 - Pros: simple to materialize substrings without accumulating lengths
	 - Cons: small extra integer per span

2. Accumulative pairs: [length, flags] only, where the start is computed by summing prior lengths or by also keeping a single `lineStart` base (the latter avoids per-span start storage but requires an O(n) summation pass or maintaining running offsets during scan).

Recommendation: use three-number tuples [start, length, flags] for clarity and low-cost random access during finalize. Implementation note: store as contiguous numbers in the backing array as: start0, len0, flags0, start1, len1, flags1, ... — this mirrors `SpanBuffer`'s compact layout and remains JIT-friendly.

Flag space: use a small bitset (32-bit number) where bits encode surface properties, for example:

- PLAIN (no special meaning)
- WHITESPACE
- POT_EMPH_OPENER (candidate opening emphasis marker like '*' or '_')
- POT_EMPH_CLOSER
- STRONG_POT (double-asterisk candidate)
- BACKTICK_RUN_N (we can encode run-length buckets or store run-length in length field semantics)
- LINK_OPEN_BRACKET
- LINK_CLOSE_BRACKET
- EXCLAMATION_MARK (image candidate)
- DIGIT (for ordered-list checks)
- PUNCT (punctuation that matters for Markdown rules)
- POSSIBLE_FENCE
- POSSIBLE_TB (thematic break marker)

The exact palette will be driven by the constructs the scanner must handle. Keep the set minimal to keep bit ops cheap.

### API sketch

TypeScript-like factory and minimal runtime surface:

```ts
function createProvisionalScanner(source: string, lineStart: number, docEnd: number) {
	// internal backing: number[] spans; per-span: start, len, flags
	return {
		scanLine(): void; // consume characters from lineStart to first linebreak (zero-alloc, pushes numeric triples)
		addSpan(start:number,len:number,flags:number): void; // hot-path helper (inlined)
		finalizeLine(classifierFlags:number): Token[]; // resolve pairings, merge, emit final tokens
		fillDebugState(state: { spanCount:number, reservedSlots:number }): void;
	};
}
```

Usage contract with `LineClassifier`:

- Call `classifyLine()` (the classifier described elsewhere) first to learn whether the line is a fence, ATX candidate, indented code, blank, etc. That information can short-circuit expensive finalize logic (for example, plain paragraph lines may bypass some pairing if we know inline parsing is not expected).
- Create a provisional scanner at the line start; call `scanLine()` to populate the numeric spans; then at the end, call `finalizeLine()` to convert the provisional stream into final tokens.

### Finalization strategy

Finalization runs a compact, span-level state machine to pair and resolve ambiguous constructs. Key ideas:

- Use index-based stacks: when encountering POT_EMPH_OPENER spans push their indices; POT_EMPH_CLOSER pops and if pairing rules succeed, mark both spans with paired flags and create a final EMPH token referencing the start/end span indices.

- Emphasis rules use only local span-level arithmetic: whether a run is left-flanking or right-flanking depends on the surrounding span flags (WHITESPACE, PUNCT, DIGIT, PLAIN). Because the scan recorded punctuation/whitespace granularly, the pairer can evaluate pairing rules without rescanning characters.

- Backtick runs: the provisional scan records the run length in a dedicated flag or encodes it via a BACKTICK_RUN span where length==runLength; finalizer can match open and close runs by comparing lengths.

- Fence detection: if the `LineClassifier` indicated POSSIBLE_FENCE, the provisional scan still records fence runs and their lengths; finalize decides whether this line is a fence open/close and emits FENCED_CODE_OPEN / FENCED_CODE_CLOSE tokens accordingly.

- Link/image brackets and references: provisional spans record brackets and text spans; finalize can find matching '[' and ']' by indices and then decide (based on following spans/line context) whether it becomes an inline link/image or a literal bracket pair.

- Merge plain spans: adjacent PLAIN spans (or PLAIN + WHITESPACE) can be coalesced into a single final text token. That reduces memory and speeds materialization.

### Memory and performance characteristics

- Hot-path behaviour (scanLine + addSpan): pure numeric pushes and local integer work. Like `SpanBuffer`, the hot path is allocation-free except for rare backing array growth.
- Finalize pass: runs over N provisional spans rather than M characters. Typical N is << M because spans are coarse (words, runs of punctuation, bracket tokens). Even worst-case pathological inputs (alternating punctuation and letters) keep spanning cheap compared to rescanning characters for every pairing.
- Materialization (creating strings): minimized by merging plain spans before calling substring operations and using a single reusable `stringParts` array as in `SpanBuffer`.

## Edge cases and pitfalls

- Cross-line constructs: bold/italic that span lines are not solvable solely inside a single-line provisional scan. The scanner must either force early finalization only at block boundaries or hold provisional spans across lines in a controlled way. The `LineClassification` facility already documents that multi-line constructs are resolved by rescanning the classifier on the next line; adopt the same pattern here — only finalize when a block boundary is reached or when multi-line continuation is certain.

- Ambiguity-rich lines: a line like "*** --- *" can be both a thematic break and inline emphasis. The classifier must conservatively mark the line as requiring full-line inspection; the provisional scan must record both potential interpretations; finalizer resolves using deterministic precedence rules (mirror CommonMark where appropriate).

- Performance cliffs on pathological inputs: extremely token-dense inputs (alternating single characters that each become a span) increase N; ensure the implementation can handle this by testing and by having a fast path that falls back to character-based finalizer when needed.

- Error reporting and offsets: because spans use numeric starts/lengths, mapping final tokens back to absolute document positions is trivial and zero-copy; ensure the chosen encoding supports large files (use Number, but be mindful of JS numeric limitations — indexes are safe up to 2^53, which is fine for document offsets).

## Tests and verification

Unit tests (minimal set):

- Provisional scan correctness: for representative lines assert the numeric spans and flags recorded (exercise punctuation, backtick runs, bracket tokens, digits, whitespace runs).
- Finalization correctness: pair emphasis markers in a variety of scenarios (simple pairs, nested, unmatched, left/right flanking rules). Compare final emitted tokens and ranges against the existing scanner behaviour (golden tests).
- Fence and block tests: verify fences open/close, indented code precedence, ATX headings remain stable.
- Performance microbench: compare scanning+finalize time vs current scanner for large documents and for worst-case token-dense lines.
- Memory reuse tests: assert that backing numeric arrays and `stringParts` are reused (via `fillDebugState`) between lines and that no per-line allocation happens in the hot path.

Integration tests:

- Replace a small subset of scanner flows with the provisional scanner (e.g., inline emphasis only) behind a runtime flag and run the full test suite. Collect token diffs and performance deltas.

Quality gates:

- Add fast unit tests first to lock down semantics. Then add regression tests for any token differences found when running the full test-suite with the feature flag.

## Incremental rollout strategy

1. Prototype: implement `createProvisionalScanner` as a distinct module in `parser/src/` and unit-test in `parser/tests/` (do not change scanner paths yet). Keep the prototype feature-flagless to iterate quickly locally.

2. Integration behind flag: wire the provisional scanner into the main scanner behind a `provisionalScannerEnabled` runtime flag. Initially scope it to only inline emphasis pairing and merging plain spans.

3. Validate: run the full test-suite of `parser/tests`. Add a dedicated benchmark harness (reuse `parser/benchmark` conventions) to compare the prototype with the current scanner on realistic corpora.

4. Expand: if stable and faster, progressively move block-level constructs (fences, lists, tables) into the provisional pipeline, validating correctness at each step.

5. Remove toggle: once parity and benefits are proven, flip to default and remove the old path in a controlled refactor.

## Practical implementation notes (mapping to docs already in repo)

- `parser/docs/14-span-buffer.md`: reuse the same backing-array design, `materialize()` strategy and `stringParts` reuse; implement the provisional scanner's backing array as numeric triples instead of pairs.
- `parser/docs/15-line-classification-facility.md`: call `classifyLine()` before or during `scanLine()` to short-circuit fence/ATX/indented-code cases and to know when finalization can be simplified.

## Small, concrete API proposal

file: `parser/src/provisionalScanner.ts`

export function createProvisionalScanner(source: string, baseOffset: number, docEnd: number, opts?: { delimiter?: string }) {
	// returns object with: scanLine(), finalizeLine(classifierFlags), fillDebugState()
}

ProvisionalSpan encoding in backing array: for span i, store numbers at index `3*i + 0..2` as `[start, len, flags]`.

Hot-path helpers must be tiny and allocation-free:

- addSpan(start,len,flags) -> push three numbers
- maybeMergeWithPrevious() -> run a couple of integer checks and mutate previous len if appropriate

Finalizer returns a minimal Token[] where Token uses the same on-disk shape as scanner tokens (type, start, length, maybe extra small integer flags). Materialization of string content is deferred until a token emission point and uses `stringParts`.

## Risks and mitigations

- Risk: subtle divergence from existing, well-tested scanner behaviour. Mitigation: heavy unit/regression testing and incremental rollout with a runtime flag.
- Risk: increased implementation complexity around pairing rules. Mitigation: keep pairing logic small, well-documented, and re-use CommonMark semantics where possible. Edge-case tests are critical.
- Risk: pathological inputs produce many tiny spans. Mitigation: detection of pathological density and fallback to a character-based finalizer for that line.

## Conclusion and recommendation

The "simple scanner inside complex scanner" is a high-value structural refactor for this project. It maps well to the repository's existing `SpanBuffer` and `LineClassification` plans and offers a promising way to reduce rescans, eliminate allocations on the common path, and simplify final token emission. I recommend a small prototype (module + unit tests) that initially handles inline emphasis and backticks, then expand to other constructs. If measurements show consistent improvement and parity with the canonical test-suite, proceed to broader integration.

---

Notes: this document intentionally keeps the design conservative: the provisional pipeline is a performance optimization and should preserve existing CommonMark-like semantics as a top priority. The implementation approach above favors clarity and robust tests over clever but fragile micro-optimisations.
