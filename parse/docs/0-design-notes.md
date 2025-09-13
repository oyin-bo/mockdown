## MixPad Scanner Architecture: scan0 + Semantic Processing

This document defines the foundational design for MixPad's scanner architecture. The design features a tiny, zero-allocation "scan0" scanner that produces a compact stream of provisional tokens, which the semantic scanner then processes into final semantic tokens. The provisional stream is engineered to be cheap to produce and cheap to inspect; expensive pairing and semantic resolution operations are strategically deferred to well-defined resolution points.

This architecture delivers: elegant scanner logic separation, elimination of character-level re-scanning through intelligent span-level processing, allocation-free hot path performance, and minimal temporary string creation. The design creates a clean two-phase pipeline:

- Phase 1: scan0 (very hot, zero-alloc). Walk the input span once. Emit packed 31-bit integer tokens into a JavaScript array: length (lower 24 bits) + flags (upper 7 bits) describing the surface shape of the span (plain text, potential emphasis opener, emphasis closer, backtick-run, punctuation, link-bracket, image-marker, escape, etc.). No heavy pairing decisions during this scan.

- Phase 2: Semantic scanner (cheaper than character re-scan). When scan0 reaches a resolution point (determined by inherent ambiguity resolution), the semantic scanner runs a span-level resolution pass over the provisional records. Pair up matching markers, resolve fence lengths, merge adjacent plain spans, produce final semantic tokens with positions and minimal string materialization.

This creates a streaming, single-pass-at-character-cost workflow where rework operates on compact numeric records rather than full string rescans and substring allocations.

## Design context and inspiration

- **Two-phase lexing / speculative lexing:** Modern compiler architectures (such as C/Java compilers) demonstrate the power of cheap first-pass coarse tokenization followed by context-sensitive resolution. The principle of producing compact intermediate data for efficient reanalysis forms a foundation for this design.


- **Incremental parsing architectures:** Advanced systems demonstrate sophisticated approaches to efficient parsing:

	- **Microsoft Roslyn** — the .NET compiler platform showcases fine-grained incremental parsing with reusable parse trees and minimal reparsing on changes.

	- **tree-sitter** — modern incremental parser generator used by many editors, featuring compact parse trees and very fast incremental re-parsing.

- **Advanced parsing paradigms:** Alternative approaches inform design decisions:

	- **PEG (Parsing Expression Grammars)** — recognition-based formalism with embedded lexical rules, demonstrating integrated scanning approaches.

	- **GLR (Generalized LR)** — bottom-up parsing with deferred tokenization decisions, showing how ambiguity resolution can be strategically delayed.

- **Markdown processing references:** Real-world implementations provide semantic grounding:

	- **cmark** — the reference C implementation of CommonMark, valuable for specification compliance and test case validation.

	- **markdown-it** — widely-used JavaScript CommonMark-compatible parser with practical optimizations and plugin architecture.

The scan0 architecture represents a clean formalization of efficient scanning principles, delivering superior performance while maintaining semantic compatibility where needed.

The design elegantly combines zero-allocation provisional records, strategic deferred pairing, and operation over compact numeric indices (eliminating substring dependencies) to achieve optimal performance for markup processing.

## Architecture specification

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

### Performance characteristics

- **Hot-path elegance:** scan0 performs pure integer pushes and local bitwise operations. The hot path achieves zero-allocation performance except for natural JavaScript array growth when output expansion is required.
- **Semantic efficiency:** operates over N provisional tokens rather than M characters. Typical N << M because tokens represent coarse semantic units (words, punctuation runs, bracket tokens). Even pathological inputs (alternating punctuation and letters) maintain superior token-level processing efficiency.
- **String materialization optimization:** minimized through intelligent merging of plain tokens before substring operations, using proven reusable string assembly patterns.

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

## Implementation strategy

The architecture follows a clean staged build-and-verify workflow across well-defined levels:

1. **scan0 implementation** (zero-allocation hot path, packed integer tokens). Verified with `verifyTokens` annotated examples that assert provisional token sequences.
2. **Semantic scanner implementation** that consumes provisional tokens and emits higher-level tokens fully resolved for ambiguity and delimiter pairing. Verified with `verifyTokens` examples that assert token emission and range mapping.
3. **AST parser implementation** that consumes token stream and emits the final syntax tree. Verified with `verifyTokens` examples that assert AST shapes.

At each stage **tests serve as living specifications.** Implementation draws from proven algorithmic patterns while maintaining architectural independence and comprehensive test coverage.

## Implementation principles

The architecture maintains clean separation and independence:

- Draw inspiration from proven patterns (such as efficient array growth and string materialization strategies) while implementing fresh, purpose-built modules.
- Implement scan0 and the semantic scanner as independent, test-driven components with clear architectural boundaries.

**Architectural purity:** The implementation stands as an independent, beautiful design. Prior code serves only as algorithmic reference, not as a dependency.

**Token encoding specification:** Tokens are stored as packed 31-bit integers (length in lower 24 bits, flags in upper 7 bits) in JavaScript arrays. The semantic scanner maintains running absolute offset through sequential iteration of the token stream.

## Repository references

The repository already contains several reference implementations and test harnesses that are useful when implementing this architecture. These are provided as references only — they inform algorithms and testing patterns but are not mandatory dependencies.

- `scanner/span-buffer.ts` — a compact numeric buffer with growth, merging, and string materialization strategies. Use this file as a practical reference for efficient backing-array growth and `stringParts` reuse.
- `tests/verify-tokens.ts` — the project's annotated Markdown verifier harness used across tests. This file demonstrates how to author `verifyTokens` tests that act as specification, test, and documentation for token streams.
- `tests/span-buffer.test.ts` — unit tests that exercise buffer behaviour and materialization; useful for examples of the project's testing style and expectations.

Referencing these files will accelerate implementation and ensure tests follow established project conventions.

## TypeScript retirement

This work on MixPad will be implemented in JavaScript. TypeScript was used in the previous implementations, but now we want to make the processes leaner and reduce dependencies.

The code will be written in modern JavaScript (ES2020+), leveraging JSDoc for type annotations to about the same extent as in TypeScript.

The key consideration and point of friction is enums for flags and token types. The solution this project will employ is to define those enums as plain objects, but not import/use the values from enums and instead use the numeric values directly. Each such use will be followed by a comment indicating the symbolic name of the value used.

This avoids the runtime cost of enum objects while keeping the code readable.

A separate script will be provided to verify the consistency of enum definitions and usages in JS codebase.