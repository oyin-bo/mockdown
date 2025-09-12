# Line Classification Facility: extraction plan

This document defines a high-performance, zero-allocation line classification module that can be extracted from the scanner and imported back with no runtime allocations anywhere in the classification logic. Unlike SpanBuffer (which must manage capacity and materialization), line classification is purely analytic and there is no legitimate reason for it to allocate memory.

## Goals
- Provide a minimal, predictable API that classifies a single line's structural potential.
- Guarantee zero allocations for all classification logic (no arrays, no Maps, no temporary strings).
- Keep the API tiny and purely functional so the scanner retains control over lookahead and multi-line decisions.
- Be testable in isolation and trivially benchable against the in-scanner classifier.

## Design constraints and contract (important clarifications)
- Zero-allocation everywhere: classification must not allocate objects or strings. Use only local numeric variables and direct reads of the `source` string.
- No caps or artificial limits: lines can be arbitrarily long. The classifier should be robust and perform incremental, single-pass scanning without imposing size caps.
- Stateless, single-line: the classifier analyzes the line starting at the given offset and returns a compact bitset. It does not mutate external state or hold buffers between calls.
- One-line responsibility: the classifier examines the single line passed to it. Any multi-line constructs that require two-line reasoning (for example Setext underline resolution) are handled by the scanner by calling the classifier on the following line as a second step.

## API surface (minimal)

Expose a tiny factory `createLineClassifier()` returning a closure with two methods:

TypeScript-like signature:

```typescript
function createLineClassifier(): {
  // Pure, zero-allocation classification of the line beginning at `lineStart`.
  // - `source` is the full document string (classifier does not copy substrings).
  // - `lineStart` points at the first character of the line (may be within file bounds).
  // - `docEnd` is the exclusive end index of the document buffer.
  classifyLine(source: string, lineStart: number, docEnd: number): LineClassification;

  // Optional: fill a provided debug object (no allocation) for test introspection.
  fillDebugState(state: { lastIndent?: number; lastFirstChar?: number; lastClassification?: LineClassification }): void;
};
```

Usage contract:
- The scanner calls `classifyLine()` only when it is at a line start. The classifier must not advance scanner positions or emit tokens.
- `classifyLine()` returns a bitset of `LineClassification` flags that indicate the structural possibilities for *the line being classified* (see semantics below).
- The classifier will never allocate; `fillDebugState()` writes into an object provided by the caller for test inspection only.

## Flag semantics — possibility vs. definite

The returned `LineClassification` bitset communicates *possibilities* about the line being classified, not final parser decisions. Each flag should be interpreted as "this line could be of this form" or "this line contains markers that are typical of this construct" rather than an absolute guarantee. This is consistent with the scanner/lexer role: it informs the parser about structural potential while leaving final disambiguation to later stages when necessary.

Conventions:
- Flags describe the *line being classified* (not the next line). When the scanner needs to know about the next line, it calls `classifyLine()` on that next line explicitly.
- A returned flag means: "the line satisfies the surface conditions for this construct without additional parser/context checks". For example `LIST_UNORDERED_MARKER` indicates the line begins with a bullet marker followed by required spacing, not that the parser must treat it as a list item (parser context may reject it).

## When the classifier may early-exit vs. full-line scan

The classifier is permitted to early-exit as soon as the returned flags are already definitive for downstream decision-making. Practical rules:

- Highest-priority cases (fast-return): blank line, indented code (indent ≥ 4), ATX heading candidate, blockquote marker. For these, once the local test succeeds (which does not require scanning the rest of the line), return immediately.
- For constructs that require whole-line inspection (thematic break, table alignment row, pipe-table candidate) the classifier must scan the remainder of the line to confirm the pattern and then return.
- For list vs thematic-break disambiguation: partial checks (first char + following space) allow deciding unordered list marker in most cases; but when the same character could be a thematic break (e.g., '---' or '***'), the classifier must scan the rest of the line to detect the count/pattern and then decide.

In short: the classifier should scan as little as necessary, but will scan the whole line when the construct's recognition requires it.

## Lookahead responsibilities (setext and multi-line constructs)

The classifier itself never performs multi-line lookahead. When the scanner needs two-line reasoning (for example: determine whether a preceding paragraph line followed by `===` or `---` is a Setext underline), the scanner will:

1. Call `classifyLine()` on the candidate header line to mark it as `PARAGRAPH_PLAIN` (or other flags).
2. Call `classifyLine()` on the next line to see if it returns `SETEXT_UNDERLINE_CANDIDATE`.

This separation keeps the classifier simple, allocation-free, and single-responsibility. The scanner orchestrates multi-line flows.

## Classification phases (implementation sketch)

Given `source`, `lineStart`, `docEnd`:

1. Compute `i = lineStart`, `indent = 0` by consuming leading spaces and tabs (tabs expand to 4 spaces in the indent calculation). Use local ints only.
2. Let `firstChar = i < docEnd ? source.charCodeAt(i) : -1`.
3. If `firstChar === -1 || isLineBreak(firstChar)`: return `BLANK_LINE`.
4. If `indent >= 4`: return `INDENTED_CODE`.
5. Inspect `firstChar` for high-precedence single-character markers (hash, greater-than, plus/minus/asterisk, backtick/tilde) with small local scans where needed (e.g., count fence length, count hashes for ATX).
6. For digits, probe the following characters to decide `LIST_ORDERED_MARKER` (digits + '.' or ')' + following whitespace).
7. If no marker decisive yet, scan the rest of the line (single pass loop) to detect pipe/table patterns or themed row content; return the corresponding flag if matched.
8. Check for Setext-like underline by skipping leading whitespace and testing for run of '=' or '-' followed only by optional trailing whitespace — if matched return `SETEXT_UNDERLINE_CANDIDATE`.
9. Default: return `PARAGRAPH_PLAIN`.

All numerics, counters and local booleans are stack-allocated locals. No arrays or strings are created.

## LineClassification enum (same meanings as in the scanner, clarified)

```typescript
const enum LineClassification {
  None = 0,
  BLANK_LINE = 1 << 0,                    // this line is blank (no visible content)
  ATX_HEADING = 1 << 1,                   // line begins with '#' heading candidate
  SETEXT_UNDERLINE_CANDIDATE = 1 << 2,    // line is '===' or '---' style underline candidate
  THEMATIC_BREAK = 1 << 3,                // line matches thematic break pattern
  FENCED_CODE_OPEN = 1 << 4,              // line contains fence start (```, ~~~) length >= 3
  FENCED_CODE_CLOSE = 1 << 5,             // same as open (parser decides open vs close)
  BLOCKQUOTE_MARKER = 1 << 6,             // line starts with '>'
  LIST_UNORDERED_MARKER = 1 << 7,         // bullet marker followed by required spacing
  LIST_ORDERED_MARKER = 1 << 8,           // ordered list marker (digits + '.' or ')' and space)
  TABLE_ALIGNMENT_ROW = 1 << 9,           // table alignment row (---: | :--- etc.)
  TABLE_PIPE_HEADER_CANDIDATE = 1 << 10,  // line contains '|' and is a plausible table header
  PARAGRAPH_PLAIN = 1 << 11,              // line looks like normal paragraph text
  HTML_BLOCK_START = 1 << 12,             // line starts HTML block (e.g., '<script>')
  INDENTED_CODE = 1 << 13,                // indent >= 4
}
```

Notes:
- Flags are not mutually exclusive in all cases; combinations can appear (e.g., a line with a pipe can also be `PARAGRAPH_PLAIN` unless it fully matches a table pattern).

## Integration example

In the scanner, at line start:

```typescript
const flags = lineClassifier.classifyLine(source, pos, end);
// scanner uses `flags` to choose its `scanCurrentLine()` subroutine
```

For two-line checks (Setext): the scanner will call `classifyLine()` on the following line and make the final decision.

## Rationale and trade-offs

- Keeping the classifier single-responsibility (single-line, zero-allocation) minimizes surface area for bugs and ensures fastest possible performance.
- Delegating multi-line reasoning to the scanner keeps the classifier simple and avoids hidden lookahead behavior.
- Returning "possibility" flags rather than definitive decisions is correct for a lexer-like role: it informs downstream parsing without overcommitting.

## Minimal tests to validate correctness (conceptual, not a plan)
- Single-line cases: blank, indent ≥ 4, ATX, unordered list, ordered list, thematic break, fenced code, blockquote
- Table candidate vs alignment row
- Setext candidate detection (requires two calls in test harness)

This specification intentionally keeps the API tiny and deterministic so the implementation can be copy-pasteable into the scanner closure or extracted to a separate module with identical semantics.