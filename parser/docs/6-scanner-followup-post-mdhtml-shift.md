# Scanner Follow‑up: Post Markdown‑in‑HTML Policy Shift

This document consolidates all remaining scanner work after the decision to keep Markdown inline syntax active inside all HTML elements except RAWTEXT/RCDATA. It captures gaps, micromark‑driven parity notes, and concrete implementation steps with tests and acceptance criteria.

See also: `docs/2-scanner.md`, `docs/3-scanner-followup.md`, `docs/4-scanner-followup-strictness-and-breadth.md`, `docs/5-scanner-followup-markdown-in-html.md`.

## Scope & Policy Recap

- Markdown remains active inside HTML containers by default.
- RAWTEXT: `<script>`, `<style>` — no Markdown, entities inactive.
- RCDATA: `<title>`, `<textarea>` — no Markdown, entities active.
- We parse HTML natively in the scanner; no external HTML/Markdown parsers.

## Status Snapshot (What’s left)

- Raw‑text + RCDATA content scanning and closing‑tag boundary detection.
- Full set of rescanning helpers (backtick, dollar, pipe, hash, slash).
- Delimiter run flanking (`*`, `_`) flags (`CanOpen`/`CanClose`, intraword).
- RCDATA entity activity semantics (tokenization + flags).
- CommonMark HTML block hinting (types 1–7) without suspending Markdown.
- Ordered list markers and indentation/column surfacing.
- Autolinks strictness (angle) and flags; optional GFM breadth (www.).
- Hard line break hint (two trailing spaces) and tab‑aware column tracking.
- Thematic break strictness and spacing audits.
- Entities decoding utilities (outside scanner) and tests.
- API polish: `setOnError()` callback with `ScannerErrorCode`.
- Docs/token taxonomy alignment; hygiene and performance guards.

---

## Detailed Gaps and Implementation Notes

### 1) Raw‑Text and RCDATA Content Handling ✔️

• What: Inside `<script>`/`<style>` (RAWTEXT) scan as literal `HtmlText` until matching `</tag>`; inside `<title>`/`<textarea>` (RCDATA) do the same but treat entities as active tokens. Case‑insensitive closing tags.

• Why (micromark): Mirrors HTML content models; micromark treats raw‑text/token boundaries precisely.

• Implementation (files): `src/scanner.ts`
  - Add private state: `rawTextEndTag?: string`, and minimal internal `ScanMode` = `Normal | RawText | Rcdata`.
  - In tag open scanning (e.g., `scanLessThan()` → `scanHtmlTag()`): when encountering `<script|style>` set mode `RawText`; for `<title|textarea>` set `Rcdata`. Set `rawTextEndTag = '</tagname>'` (lowercased for compare).
  - Add `scanRawTextContent()`:
    - From `pos`, scan forward to the first `<` that begins `rawTextEndTag` (case‑insensitive).
    - Return `SyntaxKind.HtmlText` spanning up to (not including) the `<`; set `TokenFlags.IsInRawText`.
    - If EOF before end tag, set `TokenFlags.Unterminated` and `ScannerErrorCode.UnexpectedEndOfFile`.
  - Add `scanRcdataContent()`:
    - Like raw‑text, but in addition: when seeing `&`, produce an `HtmlText` token for the entity lexeme (do not decode in scanner). Carry `TokenFlags.IsInRcdata` for all tokens in this mode.
  - In main `scan()` loop: if mode is `RawText`/`Rcdata` and next chars don’t start the closing tag, delegate to the respective content scanner; if next chars match closing tag start, scan the tag (`LessThanSlashToken` etc.), then restore mode to `Normal`.

• Tests to satisfy: `src/html-parsing.test.ts` raw‑text/RCDATA cases (flags `IsInRawText`/`IsInRcdata`, correct boundary at `</tag>`; unterminated sets `Unterminated`).

• Acceptance:
  - Single `HtmlText` chunks between open/close; entities are separate chunks only in RCDATA.
  - Case‑insensitive closers recognized; unterminated sets error callback and flag.

• Addressed:
  - Unterminated RAWTEXT/RCDATA now flagged: reaching EOF before a matching `</tag>` sets `TokenFlags.Unterminated` and `ScannerErrorCode.UnexpectedEndOfFile`. Tests added in `src/html-parsing.test.ts`.

### 2) Rescanning Helpers ✔️

• What: Implement `reScanBacktickToken()`, `reScanDollarToken()`, `reScanPipeToken()`, `reScanHashToken()`, `reScanSlashToken()` to mirror TypeScript’s rescanning pattern; we already have `reScanLessThanToken()`.

• Implementation: `src/scanner.ts`
  - Each helper rewinds to `tokenStart`, then calls the specialized scanning routine (`scanBacktick()`, `scanDollar()`, `scanPipe()`, `scanHash()`, `scanSlash()`), returning the new `SyntaxKind`.
  - `scanSlash()` should recognize `/>` → `SlashGreaterThanToken` where appropriate; otherwise a plain `/` (or `Unknown`) if malformed.

• Tests: Add cases in `src/scanner.test.ts` to ensure rescans change interpretation (e.g., table vs text for `|`, fence vs inline for backticks, `//` edge cases for slash where applicable).

• Acceptance: All new `reScan*` exist; leave state consistent with a fresh `scan()`; tests green.

• Addressed:
  - Helpers now invoke specialized routines (`scanBacktick()`, `scanDollar()`, `scanPipe()`, `scanHash()`, `scanSlash()`).
  - Dedicated rescanning tests added in `src/scanner.test.ts`.

### 3) Delimiter Run Flanking for Emphasis/Strong ✔️

• What: For `*` and `_`, compute left/right‑flanking and intraword according to CommonMark rules; set `TokenFlags.CanOpen`/`CanClose` on delimiter tokens.

• Why: Parser avoids expensive neighborhood rescans; matches micromark behavior.

• Implementation: `scanAsterisk()`, `scanUnderscore()`
  - Inspect previous and next non‑space characters (avoid allocations; peek source with indices).
  - Compute left‑flanking/right‑flanking, and intraword (alnum on both sides for `_`).
  - Set flags accordingly; also pack delimiter run length if useful alongside `TokenFlagRunLengthMask`.

• Tests: Added in `src/scanner.test.ts` (e.g., `a*bc*`, `a**b**`, intraword `_` stays identifier). Flags align with CM left/right flanking; `_` blocks intraword.

• Acceptance: Flags match CM rules; parser can rely on them without backtracking.

### 4) RCDATA Entity Activity ✔️

• What: Only in RCDATA should `&...;` be “active” (produced as separate `HtmlText` entity lexemes) while RAWTEXT treats everything as literal.

• Implementation: `scanRcdataContent()` branches to `scanAmpersand()` for entity lexemes; set `IsInRcdata` for all RCDATA tokens. Keep returning raw entity text; decoding is external.

• Tests: `src/html-parsing.test.ts` “textarea/title with `&amp;`” cases already assert this behavior.

• Acceptance: Entities split only in RCDATA; RAWTEXT content is a single literal span.

### 5) CommonMark HTML Block Hinting (Types 1–7) ✔️

• What: At line start, detect CM HTML block starts and set `TokenFlags.ContainsHtmlBlock` until a blank line. We do not suspend Markdown; this is a structural hint.

• Implementation: `scanLessThan()` when `atLineStart === true`
  - Pattern‑match the known starts (CM types 1–7) case‑insensitively.
  - Set an internal “html block hint active” boolean that causes `ContainsHtmlBlock` to be ORed into subsequent relevant tokens until a blank line (detected in newline scanning) clears it.

• Tests: Lines starting with `<!--`, `<![CDATA[`, `<!DOCTYPE`, `<script>`, `<style>`, or block tags per CM examples; hint cleared on blank line.

• Acceptance: Hint flag lifecycle matches CM block boundaries; no Markdown suspension.

• Addressed:
  - Implemented block tag allowlist per CM for enabling `ContainsHtmlBlock` at line start. Inline tags (e.g., `span`) do not enable the hint.
  - Hint also enabled for `<!-- ... -->`, `<![CDATA[`, `<!DOCTYPE ...>`, and `<?...?>` at line start.
  - Tests added in `src/html-parsing.test.ts` for block vs inline tags and CDATA/DOCTYPE/PI; lifecycle clears on blank line.

### 6) Ordered List Markers and Column/Indent Surfacing ✔️

• What: Recognize ordered list markers at line start: `^[0-9]{1,9}([.)])` with indent 0–3 spaces, and expose:
  - starting value (e.g., `1`),
  - delimiter kind (`.` vs `)` → `TokenFlags.OrderedListDelimiterParen`),
  - `TokenFlags.IsOrderedListMarker`, and
  - current column with tabs expanded to 4.

• Implementation:
  - Track current column in the scanner: update on each trivia/newline; tab expands to next multiple of 4.
  - In numeric scanning at line start, peek delimiter and following space; if matches constraints, set flags and stash the numeric value (either as `NumericLiteral`’s value or via an internal field exposed to the parser accessor).
  - Add `getColumn()` to scanner interface.

• Tests: Indent 0–3 pass; ≥4 fail; `1.` vs `1)` differentiate via flag; nested lists with tabs respected.

• Acceptance: Flags and column values surface sufficient info for the parser; tests cover edge cases.

### 7) Autolinks (Angle) Strictness and Flags ✔️

• What: Align to CM autolink tokenizer (schemes: `http`, `https`, `ftp`, `mailto`; email local/host rules; no spaces; balanced `<>`). Optionally extend to GFM `www.` heuristics. Set `TokenFlags.IsAutolinkUrl` / `IsAutolinkEmail`.

• Implementation: In `<...>` branch of `scanLessThan()`:
  - Lookahead to confirm strict autolink forms; if valid, return a single token carrying the inner value via `getTokenValue()` with URL/email and flags.
  - Otherwise fall back to normal `<` handling.

• Tests: Positive/negative cases mirroring `src/html-parsing.test.ts` plus stricter negatives (spaces, invalid domains, missing `>`), `mailto:` acceptance, optional `www.`.

• Acceptance: Strict forms pass; invalids degrade to non‑autolink tokens.

### 8) Hard Line Break Hint and Column Tracking ✔️

• What: Set `TokenFlags.HardBreakHint` when two or more spaces precede a newline. Maintain accurate column counts with tabs=4.

• Implementation:
  - In newline scanning, inspect preceding run of spaces in the same line slice; if ≥2, flag the appropriate token (newline or preceding whitespace token; choose one consistently and document).
  - Column: maintain `column` on all scans; expose `getColumn()` as above.

• Tests: Lines with 0/1/2/3 trailing spaces before `\n`; mixed tabs/spaces; multiple lines.

• Acceptance: Hint set only for ≥2 spaces; column math verified around tabs.

### 9) Thematic Break Strictness and Spacing ✔️

• What: Enforce CM constraints: ≥3 identical markers, only spaces/tabs otherwise, EOL after markers. Do not collapse spaced tokens in the scanner; parser assembles spaced variants.

• Implementation: Tightened checks in `scanAsterisk()`/`scanMinus()`/`scanUnderscore()` at line start: require ≥3 contiguous markers and only spaces/tabs until EOL.

• Tests: Added in `src/scanner.test.ts`: contiguous runs accepted with trailing spaces/tabs; near‑miss (`***a`) rejected.

• Acceptance: Matches CM; existing tests for contiguous runs pass; new spaced variants covered at parser level.

### 10) Backtick/Tilde Run‑Length in Flags ✔️

• What: Pack run length for backticks/ tildes in `tokenFlags` (`TokenFlagRunLengthShift/Mask`).

• Implementation: `scanBacktick()`, `scanTilde()` should count runs and write the length into the bitfield. Preserve `IsAtLineStart` for fences.

• Tests: Inline code vs fences with varying lengths; ensure run length accessible to parser; mixed delimiter case handling remains parser’s job.

• Acceptance: Parser can pair open/close by comparing run lengths without rescans.

### 11) Reference Definition Hint ✔️

• What: At line start, when the outline matches `[label]:` (loosely), set `TokenFlags.MaybeDefinition` on the opening bracket or first token of the line. Parser validates fully.

• Implementation: Lightweight outline check in the scan path that sees `[` at line start.

• Tests: Positive `[label]: url` lines; negatives (missing `]:`, not at line start) do not set the flag.

• Acceptance: Useful hint with minimal false positives.

### 12) Escapes/Punctuation Audit ✔️

• What: Align `isMarkdownPunctuation()` in `src/character-codes.ts` with CM’s escapable set (micromark is the benchmark).

• Implementation: `isMarkdownPunctuation()` already matches CM escapable ASCII punctuation set.

• Tests: Added in `src/scanner.test.ts`: `\\*` becomes literal `*` with `IsEscaped`; `\\a` leaves backslash token; next token is identifier.

• Acceptance: Exact parity with CM set.

### 13) Entities Utilities (Outside Scanner) ✔️

• What: Provide `src/entities.ts` with decoding helpers; scanner continues returning raw entity text.

• Implementation: `decodeEntity(text)`, `decodeNumericEntity(text)`:
  - Numeric: parse `&#...;` / `&#x...;`, clamp to Unicode range, return string or replacement `\uFFFD` on invalid.
  - Named: minimal builtin map (`amp`, `lt`, `gt`, `quot`, `apos`, `nbsp`) with extension hooks.

• Tests: New `src/entities.test.ts` for valid/invalid inputs.

• Acceptance: Utilities work; scanner untouched.

• Addressed:
  - Added `src/entities.test.ts` with coverage for valid/invalid numeric and named entities.

### 14) Docs/Token Taxonomy Alignment ✔️

• What: Ensure docs match `src/token-types.ts` exactly.

• Implementation:
  - Normalize naming (`HtmlCDATA` vs `HtmlCData`).
  - Clarify frontmatter: tests use `PlusToken` with `text === '+++'` (no `PlusPlusPlus` enum); either add that token or update docs to reflect current approach.
  - Reflect single‑file scanner (`src/scanner.ts`) reality; remove references to `scanner-impl.ts` split unless we introduce it.

• Acceptance: Docs match `src/token-types.ts` naming used by tests in this repo.

### 15) Hygiene & Performance Guards ✔️

• What: Keep hot paths allocation‑light; enforce via lint; provide a bench harness.

• Implementation:
  - Remove dead variables (e.g., `inRawTextElement`) and stray literals in `src/scanner.ts`.
  - Scripts: `npm run bench:scan` (ensure `bench/scan-large-doc.js` exists; if using TS, add a `ts-node` path or precompile).
  
• Acceptance: Bench scripts present: `npm run bench:scan`, `npm run bench:compare`.

• Addressed:
  - Removed unused `containerStack` in `src/scanner.ts`.

---

## Micromark Parity Map (References in workspace)

- `micromark/micromark/packages/micromark-core-commonmark/dev/index.js` — entry that wires CM constructs; see html‑flow/text behavior.
- HTML flow blocks (types 1–7): consult micromark’s html‑flow implementation and examples in CM spec.
- Emphasis flanking: micromark’s emphasis tokenizer for left/right/intraword logic.
- Autolinks (angle): micromark autolink tokenizer rules (scheme, email, angle constraints).
- Lists and indentation: micromark list tokenizer for indent 0–3 and ordered delimiter validation.
- Tabs→columns: micromark space/tab handling to mirror columns.

We adapt logic to our single‑scanner architecture (no events) and expose hints via flags rather than emitting micromark tokens.

## Prioritized Plan & Sequencing

1) Raw‑text/RCDATA (modes + content scanners) — 0.5–1 day
2) Rescanning helpers — 0.5 day
3) Delimiter run flags — 0.5 day
4) Column tracking + hard‑break hints — 0.25–0.5 day
5) HTML block hinting — 0.25 day
6) Autolinks strictness — 0.25–0.5 day
7) Ordered list markers — 0.25 day
8) API polish (`setOnError`) — 0.25 day
9) Entities utilities + tests — 0.25 day
10) Docs alignment + hygiene + CI/lint/bench — 0.5 day

Dependencies: implement raw‑text/RCDATA before their tests; rescanning before rescanning tests; docs after functionality lands.

## Exit Criteria (Gate to Parser Stage)

- Functional: All above behaviors implemented; flags available; no regressions; new tests green.
- Spec parity: Verified against micromark for html‑flow hinting, autolinks, delimiter runs, ordered lists, hard breaks, tabs.
- Performance: Bench within ±5% of baseline.
- Docs: Updated `docs/1-plan.md` and `docs/2-scanner.md` to reality.

## Notes

- HTML is parsed natively in the scanner. Do not defer to external parsers for core Markdown/HTML.
- Keep hot paths allocation‑frugal: prefer char‑code checks, indices, and lazy materialization via `getTokenText()`/`getTokenValue()`.