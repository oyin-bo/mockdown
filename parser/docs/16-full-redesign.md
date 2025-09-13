## Simple scanner inside complex scanner — high-level overview

This note evaluates the proposal to embed a tiny, zero-allocation "simple scanner" that scans ahead a single line (or other short window) and emits a compact, provisional stream of spans (length + flags) which the main scanner later finalizes into semantic tokens. The provisional stream is intentionally cheap to produce and cheap to inspect; only at line-finalization time (or other well-defined stop points) do we perform the more expensive pairing/semantic resolution steps.

At a glance this approach aims to: simplify the main scanner's logic, reduce character-level re-scanning by lifting most work to a coarser span-level pass, keep the hot path allocation-free, and minimize temporary string creation. The idea reuses the design patterns in `SpanBuffer` (compact pairs in numeric arrays, merging where possible) and the `LineClassification` facility (single-line, zero-alloc analysis) and composes them into a two-phase per-line pipeline:

- Phase 1: Provisional scan (very hot, zero-alloc). Walk the input line once. Emit small numeric records into a compact backing buffer: span-length (or start+length), plus lightweight flags describing the surface shape of the span (plain text, potential emphasis opener, emphasis closer, backtick-run, punctuation, link-bracket, image-marker, escape, etc.). Do not attempt heavy pairing decisions during this scan.

- Phase 2: Finalize at stop points (cheaper than character re-scan). When the scan reaches a decision point (line end, fence close, block boundary, or other deterministic stop), run a span-level resolution pass over the provisional records. Pair up matching markers, resolve fence lengths, merge adjacent plain spans, produce final semantic tokens with positions and minimal string materialization.

This reorganizes the scanner into a streaming, single-pass-at-character-cost workflow whose rework is mostly limited to compact span records rather than full string rescans and substring allocations.

## Where this idea sits relative to prior art

- Two-phase lexing / speculative lexing: Many compilers (for example, traditional C/Java compilers) use a cheap first pass to produce coarse tokens and a secondary pass to resolve context-sensitive tokens. The core similarity is that an initial, fast scan produces data small enough to be cheaply re-analyzed with richer context.

- Incremental editors / change-aware parsers: Microsoft Roslyn (C#/.NET) provides an incremental parse model where edits are localized and token trees are partially reused; tree-sitter (widely used for editor integrations) builds incremental parse trees from small, well-defined token streams. Both projects demonstrate the value of keeping compact, replayable tokens for fast re-analysis and editor responsiveness.

- Scannerless / scanner-fusion approaches: Some parser frameworks (for example certain PEG-based or scannerless GLR implementations) remove a separate lexical phase and operate directly on character streams. The proposed design is a hybrid that keeps an intentionally tiny, cheap scanning layer but defers disambiguation until more context is available.

- Existing Markdown/CommonMark engines: Implementations such as cmark (the reference C implementation), markdown-it (JS), and others often perform ad-hoc local rescans for emphasis and fence detection; they are practical references for correct semantics and corner cases. The provisional-span approach aims to formalise and optimise that ad-hoc work while maintaining compatible semantics.

Novelty: combining zero-allocation provisional records, deferred pairing at a higher-level handoff, and operating over compact numeric indices (not substrings) is not commonly packaged this way in markup processors and looks particularly well-suited for a performance-focused redesign.

## Detailed design

### Data model — ProvisionalSpan

Keep the provisional record layout intentionally minimal and sequential: each provisional record is encoded as two numbers stored contiguously in the backing array: [length, flags]. Offsets are redundant, because the consumer processes the provisional stream sequentially, reducing the need of duplicate bookkeeping.

Encoding: store records as length0, flags0, length1, flags1, ... in a plain `number[]` backing store (or a typed array if required later). `length` encodes the length of the span in characters; `flags` is a compact bitset describing surface properties needed for higher-level resolution.

Flag categories (high-level, not exhaustive):

- **Structural markers:** things that suggest block-level significance (runs that look like fences or thematic-break candidates, leading digit runs for ordered lists, blockquote markers, etc.).
- **Inline punctuation/formatting** candidates: runs or single-char tokens that may participate in inline semantics (emphasis markers, backtick runs, brackets, exclamation/image indicators, etc.).
- **Whitespace and separation:** whitespace runs, indentation info (note: indentation may be tracked separately by the caller/classifier), and similar separators.
- **Textual runs:** ordinary text sequences which are likely to be coalesced into final text tokens.
- **Diagnostic or escapes, entities:** explicit escapes or sequences that alter interpretation (such as backslash escapes in Markdown).

### API expectations

We expect the provisional scanner module to present a tiny, zero-allocation hot-path API with these high-level qualities:

- **Append-only, sequential writes:** the hot path must only append numeric records (length+flags) to a backing buffer with no per-record allocations.
- **No random-access requirements:** the consumer processes records sequentially and may request a handoff/replay over a small span window; the backing store should support fast sequential iteration and a cheap reset/rewind.
- **Clear handoff contract:** the provisional scanner must be able to provide the consumer (next-level scanner) with a stable sequential view of the records (either by exposing the backing array + count or by a minimal iterator/callback mechanism) without allocating during the hot path.

### Handoff to the higher-level scanner

When the provisional scanner reaches a **resolution point** the next-level scanner consumes the compact record stream and performs span-level resolution.

Key consumer-side ideas (kept implementation-agnostic):

- **Stack-based pairing** at the record level: the consumer can pair opener/closer candidates by using index-based stacks over the record stream. Because records are sequential and compact, these operations are cheap and allocation-free.
- **Local, record-level predicates:** flanking rules and run-length matching (for backticks) can be evaluated using neighbouring record flags and lengths without character rescans.
- **Merging and coalescing:** the consumer coalesces adjacent textual records before string materialization to minimize substring operations.

### Memory and performance characteristics

- **Hot-path** behaviour (scanLine + addSpan): pure numeric pushes and local integer work. Like `SpanBuffer`, the hot path is allocation-free except for rare backing array growth.
- **Consumer pass:** runs over N provisional spans rather than M characters. Typical N is << M because spans are coarse (words, runs of punctuation, bracket tokens). Even worst-case pathological inputs (alternating punctuation and letters) keep spanning cheap compared to rescanning characters for every pairing.
- **String materialization:** minimized by merging plain spans before calling substring operations and using a single reusable `stringParts` array as in `SpanBuffer`.

## Edge considerations

Scanning is generally not constrained to a single line. The provisional scanner's window extends until a decisive resolution point determined by context-aware Markdown rules (block boundaries, fences, or other syntax-defined stops). Much confusion about scanning flows from prematurely assuming a line-based stop; instead, the provisional scanner operates sequentially until the syntactic resolution stop resolves all ambiguities and allows a handoff for all the provisional spans to the next-level consumer.

Practical implications:

- **Multi-line constructs:** if the consumer needs cross-boundary context, the provisional stream should provide a **whole context** view across the boundary.
- **Pathological density:** if the provisional stream becomes extremely dense the provisional scanner effectively falls back to character-level spans with a little bit inefficient storage (two numbers instead of a single char). That increase is linear and can be **sustained for the whole document** if necessary.
- **Offsets:** because per-span starts are omitted, any coalescing (such as merging single-spaces into surrounding plain text tokens) is very cheap and can be easily done while scanning, significantly **reducing overhead** both in memory and processing.

## Tests and verification: annotated Markdown

Testing will follow the project's annotated Markdown `verifyTokens` approach rather than conventional unit tests. At each stage we author small, human-readable annotated examples that serve as specification, test, and documentation:

- **Provisional-level tests:** annotated inputs that assert the sequence of provisional records with assertions over **positions and flags.**
- **Semantic-level tests:** annotated inputs that assert the tokens emitted by the consumer-level scanner after handoff, on **positions, flags, text.**
- **AST-level tests:** annotated inputs that assert the final AST shapes or token streams produced by the parser, asserting **positions, and structural properties.**

Annotated Markdown shall be extended for all three levels to also **assert on debug flags,** and there shall be a small subset of tests for each level that asserts those in addition to the syntactic properties. These are important for **deep testing,** but will be brittle and fast-changing as optimisations rolled out changing the internal state without changing the output.

Every test is written in the verifyTokens format makes failures immediately actionable and the tests remain readable documentation for further work.

## Full redesign phases

This is a full redesign; the correct plan is not an incremental swap but a staged build-and-verify workflow across well-defined levels:

1. Build a **provisional scanner** implementation (zero-allocation hot path, length+flags records). Test it with `verifyTokens` annotated examples that assert provisional records.
2. Build the **semantic-level scanner** that consumes provisional records and emits higher-level tokens fully free of ambiguity and fully paired for delimiters. Test with `verifyTokens` examples that assert token emission and range mapping.
3. Build the **AST-level parser** that consumes token stream and emits the final syntax tree. Test with `verifyTokens` examples that assert AST shapes.

At each stage the **tests are descriptive and instructional.** The implementation may borrow algorithms and ideas from existing code, but it must be developed independently and supported by annotated tests.

## Practical implementation notes (how this will borrow from existing docs)

- Use the `SpanBuffer` design notes and code as a reference for backing-array growth, `stringParts` reuse, and materialization strategies — but do not depend on or call into the existing `SpanBuffer` implementation. Treat those as algorithmic references only.

Important: none of the existing production scanner code will be imported or called directly by the new implementation. We will borrow algorithms and ideas where useful but implement the provisional scanner and its consumer as independent, test-driven modules.

Provisional record encoding: store records as length,flags pairs in a contiguous numeric backing store (length0,flags0,length1,flags1...). The consumer maintains a running absolute offset while iterating.

