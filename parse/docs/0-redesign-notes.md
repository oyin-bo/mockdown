## Scanner Redesign: scan0 + Semantic Scanner Architecture

This document defines the foundational design for MixPad's scanner redesign. The architecture embeds a tiny, zero-allocation "scan0" scanner that produces a compact stream of provisional tokens, which the semantic scanner then finalizes into semantic tokens. The provisional stream is designed to be cheap to produce and cheap to inspect; expensive pairing and semantic resolution steps are deferred to well-defined resolution points.

This approach delivers: simplified main scanner logic, elimination of character-level re-scanning through coarser span-level processing, allocation-free hot path, and minimal temporary string creation. The design builds on proven patterns from `SpanBuffer` (compact numeric arrays, merging) and `LineClassification` (single-line, zero-alloc analysis) to create a two-phase pipeline:

- Phase 1: scan0 (very hot, zero-alloc). Walk the input span once. Emit packed 31-bit integer tokens into a JavaScript array: length (lower 24 bits) + flags (upper 7 bits) describing the surface shape of the span (plain text, potential emphasis opener, emphasis closer, backtick-run, punctuation, link-bracket, image-marker, escape, etc.). No heavy pairing decisions during this scan.

- Phase 2: Semantic scanner (cheaper than character re-scan). When scan0 reaches a resolution point (determined by inherent ambiguity resolution), the semantic scanner runs a span-level resolution pass over the provisional records. Pair up matching markers, resolve fence lengths, merge adjacent plain spans, produce final semantic tokens with positions and minimal string materialization.

This creates a streaming, single-pass-at-character-cost workflow where rework operates on compact numeric records rather than full string rescans and substring allocations.

## Where this idea sits relative to prior art

- Two-phase lexing / speculative lexing: Many compilers (for example, traditional C/Java compilers) use a cheap first pass to produce coarse tokens and a secondary pass to resolve context-sensitive tokens. The core similarity is that an initial, fast scan produces data small enough to be cheaply re-analyzed with richer context.


- Incremental editors / change-aware parsers: projects that emphasize incremental updates are useful references:

	- Microsoft Roslyn — the .NET compiler platform (C# and VB) exposes fine-grained incremental parsing APIs so editors can reuse parse trees and only re-parse the minimal changed region. See the repo and docs: https://github.com/dotnet/roslyn

	- tree-sitter — a modern incremental parser generator used by many editors (Atom, Neovim plugins, etc.). It builds compact parse trees and supports very fast incremental re-parsing on edits. See the project and docs: https://tree-sitter.github.io/tree-sitter/

- Scannerless / scanner-fusion approaches: parser families that avoid a distinct lexer and operate directly on character streams or use tightly integrated scanning include:

	- PEG (Parsing Expression Grammars) — a recognition-based formalism where grammars are written as parsing expressions with ordered choice. PEG parsers (see PEG.js https://pegjs.org/ or the Wikipedia overview https://en.wikipedia.org/wiki/Parsing_expression_grammar) commonly embed lexical rules in the grammar instead of using a separate tokenizer.

	- GLR (Generalized LR) — a bottom-up parsing algorithm capable of handling ambiguous grammars by producing parse forests; scannerless GLR systems may defer tokenization decisions and accept multiple token interpretations until the grammar disambiguates them. See the Wikipedia overview for GLR: https://en.wikipedia.org/wiki/Generalized_LR_parser

- CommonMark and other Markdown engines: practical, real-world implementations are valuable references for exact semantics and corner-cases:

	- cmark — the reference C implementation of CommonMark, useful for understanding the spec and for test-case cross-checking: https://github.com/commonmark/cmark

	- markdown-it — a widely-used JavaScript CommonMark-compatible parser with many plugins and practical heuristics; useful for real-world behaviour comparisons: https://github.com/markdown-it/markdown-it

The scan0 approach formalizes and optimizes the ad-hoc rescans these projects perform while maintaining compatibility with their semantics where required.

The design combines zero-allocation provisional records, deferred pairing at higher-level handoff, and operation over compact numeric indices (not substrings) in a way specifically optimized for performance-focused markup processing.

## Detailed design

### scan0 API

The scan0 function provides the core provisional scanning functionality:

```javascript
/**
 * Bitwise OR: length: lower 24 bits, flags: upper 7 bits.
 * @typedef {number} ProvisionalToken
 */

/**
 * Scan ahead producing provisional tokens, until a decisive resolution point reached.
 * The last token may carry flags reporting what kind of resolution was reached.
 * @param {{
 *  input: string,
 *  startOffset: number,
 *  endOffset: number,
 *  output: ProvisionalToken[]
 * }} _
 * @return {number} The count of tokens pushed into output.
 */
function scan0({ input, startOffset, endOffset, output })
```

### Data model — ProvisionalToken

Each provisional token is encoded as a single 31-bit integer using bitwise OR: length (lower 24 bits) + flags (upper 7 bits). This encoding eliminates the need for separate offset tracking since the consumer processes tokens sequentially.

The token stream uses a plain JavaScript `number[]` backing store. Length encodes the span length in characters; flags is a compact bitset describing surface properties needed for higher-level resolution.

Flag categories (high-level, not exhaustive):

- **Structural markers:** things that suggest block-level significance (runs that look like fences or thematic-break candidates, leading digit runs for ordered lists, blockquote markers, etc.).
- **Inline punctuation/formatting** candidates: runs or single-char tokens that may participate in inline semantics (emphasis markers, backtick runs, brackets, exclamation/image indicators, etc.).
- **Whitespace and separation:** whitespace runs, indentation info (note: indentation may be tracked separately by the caller/classifier), and similar separators.
- **Textual runs:** ordinary text sequences which are likely to be coalesced into final text tokens.
- **Diagnostic or escapes, entities:** explicit escapes or sequences that alter interpretation (such as backslash escapes in Markdown).

### scan0 Characteristics

scan0 provides a zero-allocation hot-path API with these properties:

- **Bounded input processing:** scan0 processes input from `startOffset` to `endOffset`, treating `endOffset` as EOF moment for resolution decisions.
- **Append-only, sequential writes:** the hot path appends packed integer tokens to the provided output array with no per-record allocations.
- **Resolution point detection:** scan0 determines when inherent ambiguities in the current input are sufficiently resolved to enable semantic processing, scanning exactly as far as needed.
- **Clear handoff contract:** scan0 returns the count of tokens pushed, providing the consumer with precise boundaries for processing the token stream.

### Handoff to the semantic scanner

When scan0 reaches a **resolution point** the semantic scanner consumes the compact token stream and performs span-level resolution.

Key semantic scanner operations:

- **Stack-based pairing** at the token level: the semantic scanner pairs opener/closer candidates using index-based stacks over the token stream. Because tokens are sequential and compact, these operations are cheap and allocation-free.
- **Local, token-level predicates:** flanking rules and run-length matching (for backticks) are evaluated using neighboring token flags and lengths without character rescans.
- **Merging and coalescing:** the semantic scanner coalesces adjacent textual tokens before string materialization to minimize substring operations.

### Memory and performance characteristics

- **Hot-path behavior:** scan0 performs pure integer pushes and local bitwise operations. The hot path is allocation-free except for JavaScript array growth when the output array needs expansion.
- **Semantic pass:** operates over N provisional tokens rather than M characters. Typical N << M because tokens represent coarse units (words, punctuation runs, bracket tokens). Even pathological inputs (alternating punctuation and letters) maintain efficient token-level processing compared to character-level rescanning.
- **String materialization:** minimized by merging plain tokens before substring operations, following `SpanBuffer` patterns with reusable string assembly.

## Resolution point determination

scan0 is not constrained to single-line processing. The scanning window extends until a decisive resolution point determined by context-aware Markdown rules (block boundaries, fences, or other syntax-defined stops). scan0 makes its own determination of when the current inherent ambiguity of the input is sufficiently resolved to enable semantic processing.

Key principles:

- **Multi-span constructs:** scan0 provides complete context across boundaries when the semantic scanner requires cross-boundary resolution.
- **Pathological density:** when token density approaches character-level granularity, scan0 maintains linear performance. The packed integer encoding remains efficient even for character-level tokens.
- **Sequential processing:** because token start positions are computed sequentially, coalescing operations (such as merging adjacent plain text tokens) are performed efficiently during scanning, reducing both memory and processing overhead.

## Tests and verification: annotated Markdown

Testing follows the project's annotated Markdown `verifyTokens` approach. At each stage we create human-readable annotated examples that serve as specification, test, and documentation:

- **scan0-level tests:** annotated inputs that assert the sequence of provisional tokens with assertions over **positions and flags.**
- **Semantic-level tests:** annotated inputs that assert the tokens emitted by the semantic scanner after handoff, on **positions, flags, text.**
- **AST-level tests:** annotated inputs that assert the final AST shapes or token streams produced by the parser, asserting **positions, and structural properties.**

Annotated Markdown tests will be extended for all three levels to also **assert on debug flags.** A subset of tests for each level will assert internal state in addition to syntactic properties. These tests provide **deep verification** but will be updated as optimizations change internal state without affecting output.

All tests use the verifyTokens format to make failures immediately actionable and maintain readable documentation for ongoing work.

## Implementation phases

The redesign follows a staged build-and-verify workflow across well-defined levels:

1. **scan0 implementation** (zero-allocation hot path, packed integer tokens). Test with `verifyTokens` annotated examples that assert provisional token sequences.
2. **Semantic scanner implementation** that consumes provisional tokens and emits higher-level tokens fully resolved for ambiguity and delimiter pairing. Test with `verifyTokens` examples that assert token emission and range mapping.
3. **AST parser implementation** that consumes token stream and emits the final syntax tree. Test with `verifyTokens` examples that assert AST shapes.

At each stage **tests serve as specifications and instructions.** Implementation may reference algorithms and ideas from existing code, but must be developed independently and supported by annotated tests.

## Implementation guidelines

Reference existing design patterns while building independent implementations:

- Use `SpanBuffer` design notes and code as reference for array growth, `stringParts` reuse, and materialization strategies. Do not depend on or call existing `SpanBuffer` implementation.
- Reference existing scanner algorithms and ideas where applicable, but implement scan0 and the semantic scanner as independent, test-driven modules.

**Critical constraint:** No existing production scanner code will be imported or called directly by the new implementation.

**Token encoding:** Store tokens as packed 31-bit integers (length in lower 24 bits, flags in upper 7 bits) in JavaScript arrays. The semantic scanner maintains running absolute offset while iterating sequentially through the token stream.

