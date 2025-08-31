## Side Quest: Retiring "identifier" tokens & introducing a unified Text token

### 0. Executive Summary
We will refactor the scanner+parser to:
1. Introduce a single `Text` token (opaque raw span of ordinary Markdown text).
2. Remove miscellaneous pseudo‑lexical content tokens (`Identifier`, `StringLiteral`, `NumericLiteral`, `HtmlText`, generic whitespace trivia except newline) which currently fragment paragraphs.
3. Keep only one "identifier-like" token category: **HTML tag name related tokens** (the structural tokens already modelling `<`, `</`, `>`, `/>`, plus comment / doctype / etc). Tag *names* stay ASCII‑validated inside those tokens; no generic identifier token remains.
4. Treat *all* non-construct characters between structural events as a single `Text` token per contiguous run (bounded by newline tokens and structural tokens we intentionally emit).
5. Preserve **newline tokens** (`NewLineTrivia`) explicitly for line-start logic, blank line detection, hard vs soft break analysis, and round‑trip fidelity (CRLF vs LF).
6. Simplify parser: derive paragraph / inline nodes by iterating over a sparse event stream instead of a dense token list.

### 1. Goals
- Reduce token count (performance + memory) for large paragraphs.
- Decouple emphasis / delimiter logic from artificial identifier tokenization.
- Enforce ASCII restriction for HTML tag names distinctly from Unicode word classification used for emphasis boundaries.
- Improve round‑trip preservation: raw text segments remain untouched; formatting (spacing, entity usage, escapes) stored verbatim.
- Provide cleaner surface for higher phases (AST construction, ProseMirror projection, logical text normalization layer).

### 2. Current Situation (Problems)
- Scanner emits many granular tokens: `Identifier`, `NumericLiteral`, `StringLiteral`, `WhitespaceTrivia`, `TabTrivia`, `HtmlText`, punctuation tokens etc.
- Plain text is fragmented which complicates: (a) reconstructing raw slices; (b) computing emphasis boundaries; (c) projecting logical paragraph text.
- `HtmlText` duplicates concept of plain text but only inside HTML contexts.
- Emphasis / list detection sometimes relies on token *types* instead of direct source inspection → over-complex.

### 3. Target Token Taxonomy (after refactor)

Essential structural / syntactic tokens we KEEP (names indicative – final enum to match code style):
- `Text` (new) — raw markdown text span (no newlines inside; ends before each newline token). Contains everything not recognized as another token.
- `NewLineTrivia` — each physical line ending (LF or CRLF). Carries flags: `IsBlankLine`, `HardBreakHint`, trailing space count, line indentation width.
- Emphasis / delimiter family: single run tokens for sequences of `*`, `_`, `~`, `^` (still deciding which markers are enabled) with run-length encoded in flags.
- Backtick run token for inline code span open/close candidates.
- Escape token (backslash + escapable char) OR (option: keep escapes inside Text and mark via mapping; initial step keep token for simplicity—can revisit later).
- Entity token (`&...;`).
- Link/image structural tokens: `[`, `]`, `!` (possibly keep as single-char tokens) OR convert to dedicated delimiter run style tokens. (Decision: keep — minimal complexity.)
- Parenthesis tokens `(` `)` used for destinations & grouping.
- HTML structural tokens: `<`, `</`, `>`, `/>`, comments, doctype, processing instruction, CDATA, plus maybe a unified `HtmlTag` token encapsulating name + attributes (future). For now we retain existing set except we eliminate `HtmlText` in favour of `Text`.
- List / heading / thematic break markers may already be represented via the existing punctuation tokens plus flags; we will *enhance* line-start recognition by assigning specific flags (`IsOrderedListMarker`, `OrderedListDelimiterParen`, etc.) to a *single* composite token spanning the marker (digits + delimiter) where appropriate.

Tokens to **REMOVE**:
- `Identifier`
- `StringLiteral`
- `NumericLiteral`
- `HtmlText`
- `WhitespaceTrivia` (merged into `Text` or newline metadata)
- `TabTrivia` (tabs inside text become part of `Text`; line-leading tabs handled by newline metadata; internal tabs preserved raw)

Tokens to **REEVALUATE** (phase 2, not immediate):
- Separate punctuation tokens (`ColonToken`, `CommaToken`, etc.) could instead remain literal characters inside `Text` unless they begin a construct. Retaining them initially eases minimal change.

### 4. Flags & Metadata Adjustments
- Keep existing flag bitfield (run length, CanOpen/CanClose, IsOrderedListMarker, etc.).
- `Text` tokens carry: startOffset, endOffset (exclusive), no extra flags; blank lines signalled by the *newline* preceding the next line start, not by a dedicated empty Text token.
- Newline token enrichments:
	- `indentColumns` (0–3 relevant for block constructs; store raw char span for fidelity)
	- `trailingSpaces` (count) enabling hard-break detection + exact reproduction
	- `hadBackslashBefore` boolean for hard break by backslash
	- `isBlankLine`

### 5. Scanner Refactor Plan
Step-by-step incremental commits (each with tests):
1. Introduce `Text` enum member (no removals yet). Add helper to flush accumulated raw text into a `Text` token.
2. Accumulate characters that are not construct starters into a buffer. Emit buffer as `Text` token when encountering: a construct starter, newline, or EOF.
3. Ensure newline handling: on newline emit pending `Text`, then emit `NewLineTrivia` with metadata.
4. Restrict HTML tag name recognition to ASCII; if `<` sequence fails tag/autolink/comment/etc recognition, treat `<` as ordinary char appended to current buffer, *not* as standalone token.
5. Emphasis delimiter scanning uses direct neighbor *code point* classification (Unicode word vs punctuation/whitespace) on the raw source — independent of Text token boundaries.
6. Ordered list markers: at line start attempt recognition; if success, flush pending `Text`, emit composite token with flags; else treat digits as text.
7. Thematic break detection performed before unordered list marker classification; if recognized, emit dedicated token (reuse existing tokens + maybe a flag) after flushing preceding text.
8. Remove emission of `Identifier`, `StringLiteral`, `NumericLiteral`, `HtmlText`, `WhitespaceTrivia`, `TabTrivia` from scanner; leave enum entries temporarily to avoid breakage but mark deprecated in comments.
9. Adjust parser to treat `Text` tokens + gapless newlines as paragraph content. Parser no longer needs to merge runs of adjacent literal-like tokens.
10. After parser green, physically delete deprecated enum members + related dead code. Update tests accordingly.

### 6. Parser Changes
- Paragraph assembly: collect consecutive `Text` + inline construct tokens (delimiters, entities, escapes, links) delimited by blank line or block boundary. No need to coalesce multiple `Identifier` etc.
- Emphasis resolution: operate over a list of delimiter run tokens referencing source offsets; `Text` tokens are opaque; you only peek at source around run positions.
- Lists: rely on ordered/unordered marker tokens + newline metadata (blank line, indentation) instead of reconstructing from digit/marker punctuation tokens.
- Setext headings: newline metadata + following line pattern scanning; since text content is inside `Text` tokens you examine raw source slices for underline detection.
- Code spans: backtick run tokens hold length; content between matching runs determined by offsets; interior may be a single `Text` token or raw slice — parser uses offsets not token concatenation.

### 7. Roundtrip & Logical Text Layer Integration
- `Text` tokens store *only raw slices*; they are not normalized.
- Logical projection (collapse soft breaks, decode entities, remove escapes) operates over union of `Text`, Entity tokens, Escape tokens, Newline tokens.
- Map logical offsets back to raw via piece table referencing token boundaries.

### 8. Test Strategy Adjustments
Existing tests expecting sequences of `Identifier` / `WhitespaceTrivia` must be rewritten to assert on fewer, broader tokens:
- Assert full ordered token kind list for representative inputs (paragraphs, emphasis, HTML, lists, thematic breaks, code spans, entities).
- Add regression tests guaranteeing that a long paragraph (thousands of characters without constructs) produces exactly 1 `Text` token (+ newline tokens if present) rather than O(n) tokens.
- Tests for fallback scenarios: `<dív>` stays inside a `Text` token rather than partial HTML tokens.
- List detection boundary tests: `1.item` remains `Text`; `1. item` becomes marker + `Text`.

### 9. Deprecation & Removal Plan (Granular)
Phase A: Introduce `Text`, keep legacy tokens enumerated but unreachable; mark with `/** @deprecated */`.
Phase B: Remove code paths referencing deprecated tokens; update parser types.
Phase C: Delete enum members; rename `HtmlText` references in code & tests to `Text` semantics (where needed).
Phase D: Cleanup docs & developer notes.

### 10. Risks & Mitigations
Risk: Hidden parser reliance on fine-grained whitespace tokens.
Mitigation: Before removal, add an integration test corpus diffing reconstructed raw markdown from tokens vs original; ensure identical output for unchanged source.

Risk: Emphasis logic accidentally reading `Text` token boundaries instead of raw source.
Mitigation: Centralize emphasis classification in helper taking raw string + index; remove any token-type checks.

Risk: Off-by-one offsets after consolidating tokens.
Mitigation: Add assertion pass over token stream verifying monotonic, non-overlapping coverage of source (except gaps intentionally not tokenized — which should now be none between structural tokens and text tokens).

### 11. Instrumentation / Debugging Aids
- Temporary debug printer: dumps token stream with raw slice preview. Used to validate token reduction.
- Optional `SCANNER_DEBUG=1` environment flag to log transitions when flushing `Text` tokens (removed after stabilization).

### 12. Future Extensions (not in this refactor)
- Collapse standalone punctuation tokens into `Text` unless they begin constructs (further reducing count).
- Represent escape & entity transformations purely in mapping layer (eliminating their explicit tokens) while preserving original raw forms.
- Unified HTML tag token storing name + attribute segments + offsets for more advanced roundtrip editing inside tags.

### 13. Acceptance Criteria
- For a sample large paragraph with no constructs: token count reduced to (#lines + 1) vs previous O(n).
- All existing parser tests pass after updates; no regression in emphasis/list/HTML detection; new tests added per above.
- Roundtrip serialization of unedited AST yields byte‑identical markdown.
- Performance benchmark shows reduced allocation count / faster scan for large text (qualitative win acceptable initially; numeric improvement expected).

### 14. Implementation Order Recap (Commit Outline)
1. Add `Text` token + scanner accumulation (feature flag optional).
2. Update tests to accept new token when flag enabled.
3. Enable by default; leave legacy token types dormant.
4. Remove legacy emissions; adjust parser.
5. Delete deprecated enum members; final test sweep.
6. Document final state here & in main parser README.

---
This plan establishes a leaner, event-focused lexical layer supporting accurate Unicode-aware inline logic and lossless roundtrip while simplifying downstream parsing.