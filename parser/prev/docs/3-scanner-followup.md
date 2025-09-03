# Scanner Follow‑Up Plan: Actions and Implementation Steps

This plan operationalizes the gaps and next steps identified in the post‑mortem. Each item includes concrete steps, file/function touchpoints, acceptance criteria, and sequencing. Constraint: HTML must be parsed natively with no external parsers, and scanning must remain allocation‑frugal (char‑code decisions, lazy materialization).

## 1) Raw‑Text Element Handling (script/style/textarea/title)

- **Goal**: Treat contents of raw‑text elements as literal text until the matching end tag, without interpreting entities or tags inside the content.
- **Files/Functions**: `src/scanner.ts` (`scanHtmlTag()`, `scanLessThan()`, add `scanRawTextContent()`), `src/token-types.ts` (`TokenFlags.IsInRawText`).
- **Steps**:
  1. Add a small state to scanner: `rawTextEndTag: string | undefined` and a boolean flag that maps to `TokenFlags.IsInRawText` for tokens scanned while inside raw text.
  2. In `scanHtmlTag()`: when an opening tag name matches one of `script|style|textarea|title` (case‑insensitive) and the tag is closed with `>` or `/>`, set `rawTextEndTag = '</tagname>'` (lowercased) and mark that subsequent scanning should switch to raw‑text scanning.
  3. Implement `scanRawTextContent()` that:
     - Scans forward from `pos` until it finds a `<` that begins the exact case‑insensitive sequence `rawTextEndTag`.
     - Returns `SyntaxKind.HtmlText` covering everything up to (but not including) the `<` of the end tag; set `TokenFlags.IsInRawText` for this token.
     - If EOF is reached without finding the end tag, set `TokenFlags.Unterminated`, set an error (`ScannerErrorCode.UnexpectedEndOfFile`), and return the remaining content as `HtmlText`.
  4. In `scanLessThan()`: when `rawTextEndTag` is set, check if the upcoming substring matches the end tag (case‑insensitive). If yes, scan and return `<` and `LessThanSlashToken`/`HtmlText`/`GreaterThanToken` appropriately via `scanHtmlTag()` and then clear `rawTextEndTag`.
  5. Ensure normal scanning is bypassed by invoking `scanRawTextContent()` when `rawTextEndTag` is active and the next char is not `<` starting the closing tag.
- **Acceptance Criteria**:
  - `<script>1 < 2 && foo()</script>` produces a single `HtmlText` token for `1 < 2 && foo()` with `TokenFlags.IsInRawText`, then recognizes `</script>` normally.
  - Case‑insensitive closers (`</ScRiPt>`) are recognized.
  - Unterminated raw‑text sections set `Unterminated` and an error message.
  - Entities like `&amp;` are not specially handled inside raw text (remain literal in `HtmlText`).

## 2) Rescanning Helpers (Backtick, Dollar, Pipe, Hash, Slash)

- **Goal**: Provide parser‑friendly rescans for context‑sensitive constructs, mirroring the planned API.
- **Files/Functions**: `src/scanner.ts` add: `reScanBacktickToken()`, `reScanDollarToken()`, `reScanPipeToken()`, `reScanHashToken()`, `reScanSlashToken()`.
- **Steps**:
  1. Implement each as a thin wrapper: reset `pos = startPos` and call the existing specialized scanner logic (`scanBacktick()`, `scanDollar()`, etc.).
  2. For `reScanSlashToken()`, ensure `scanSlash()` already recognizes `/>`. If not in the correct context, it should return `Unknown` (as currently) and allow parser to treat it accordingly.
  3. Add unit tests to `src/scanner.test.ts` verifying each rescanner modifies interpretation in the expected contexts (e.g., table vs text for `|`, code fence vs inline backticks).
- **Acceptance Criteria**:
  - Each new `reScan*` function exists, is covered by tests, and leaves scanner state consistent with a fresh scan.

## 3) Mode Abstraction (Optional, Minimal)

- **Goal**: Introduce a tiny, optional mode enum to help the parser if needed, without refactoring the scanning core.
- **Files/Functions**: `src/scanner.ts` (internal enum), `docs/1-plan.md` update.
- **Steps**:
  1. Define an internal enum `ScanMode { Normal, RawText }` (and potentially `HtmlTag` if needed later). Default to `Normal`.
  2. Switch to `RawText` when `rawTextEndTag` is set; revert to `Normal` when cleared.
  3. Do not expose mode publicly yet; keep the existing API surface stable. Document the design in docs.
- **Acceptance Criteria**:
  - No behavior change for existing tests. Additional raw‑text tests pass.
  - Docs describe the minimal internal mode and when it flips.

## 4) Entity Decoding Semantics (Utility Layer)

- **Goal**: Keep scanner returning the original entity text in `getTokenValue()` but provide decoding utilities for consumers that want decoded content.
- **Files/Functions**: Add `src/entities.ts` with `decodeEntity(text: string): string` and `decodeNumericEntity(text: string): string`.
- **Steps**:
  1. Implement numeric/hex decoding: parse between `&#` and `;` (base 10 or 16), clamp to valid Unicode range, return decoded string.
  2. Implement a minimal named entity map for common entities (`amp`, `lt`, `gt`, `quot`, `apos`, `nbsp`) and leave extension hooks for a larger map later. No external data sources.
  3. Add tests in a new `src/entities.test.ts` for both valid and invalid inputs. Do not change scanner behavior.
- **Acceptance Criteria**:
  - Utilities decode `&amp;`, `&#65;`, `&#x41;` correctly and reject malformed inputs gracefully (return original or replacement `\uFFFD`).
  - Scanner continues to treat entities per current tests.

## 5) API Polish: `setOnError()` Callback

- **Goal**: Allow optional error callbacks consistent with the planned interface.
- **Files/Functions**: `src/scanner.ts` add `setOnError(onError?: (code: ScannerErrorCode, message: string, start: number, end: number) => void)`, store closure.
- **Steps**:
  1. Add a private `onError?: ErrorCallback` field.
  2. When setting `errorCode`/`errorMessage` and `TokenFlags.Unterminated`, invoke `onError` with range `[startPos, pos]`.
  3. Update exported `createScanner()` type definition accordingly in the interface (if exported from `src/scanner.ts`).
  4. Add tests to verify the callback is invoked for unterminated comment/CDATA/PI.
- **Acceptance Criteria**:
  - Callback is optional and never throws internally; all existing tests unaffected.

## 6) Token Taxonomy and Docs Alignment

- **Goal**: Align documentation with implemented `SyntaxKind` values and remove references to non‑existent tokens for this project.
- **Files**: `docs/1-plan.md`, `docs/2-scanner.md`.
- **Steps**:
  1. Update token lists in docs to match `src/token-types.ts` (e.g., `DashDashDash`, `DollarDollar`, `HtmlProcessingInstruction`, etc.).
  2. Where the plan listed tokens not present (e.g., `NoSubstitutionTemplateLiteral`), either remove or add a note explaining why they are out of scope.
  3. Clarify that we treat HTML natively in the scanner and do not create a separate `scanner-impl.ts` file.
- **Acceptance Criteria**:
  - Docs accurately describe the current API and tokens; no stale token names remain.

## 7) Hygiene and Memory Discipline Guards

- **Goal**: Remove nits and enforce standards that prevent future regressions.
- **Files**: `src/scanner.ts`, ESLint config, husky or simple npm script hooks.
- **Steps**:
  1. Remove the stray literal `1` and the unused `inRawTextElement` variable from `src/scanner.ts`.
  2. Add an ESLint rule override to flag `substring`/`substr`/`slice`/`toLowerCase` usages in `src/scanner.ts` except in accessors. Example: custom rule via `no-restricted-syntax` with file override.
  3. Add an npm script `npm run lint:scanner` and wire it in CI.
- **Acceptance Criteria**:
  - Lint passes; scanner contains no forbidden calls in hot paths.

## 8) Benchmarks and CI Guards

- **Goal**: Track performance and enforce memory discipline at PR time.
- **Files**: `package.json` scripts, `bench/` folder with simple Node benchmarks.
- **Steps**:
  1. Create `bench/scan-large-doc.ts` generating a large Markdown doc and measuring scan time with `performance.now()`.
  2. Add an npm script `npm run bench:scan` and document a target threshold (best‑effort; not a hard CI gate initially).
  3. Add CI job to run ESLint rule from step 7.2 so forbidden string ops fail the build.
- **Acceptance Criteria**:
  - Bench script runs locally; CI includes lint gate for scanner.

## 9) Tests Expansion for New Features

- **Goal**: Add targeted tests for raw‑text, rescanning helpers, and error callback.
- **Files**: `src/html-parsing.test.ts`, `src/scanner.test.ts`, new `src/entities.test.ts`.
- **Steps**:
  1. Add raw‑text tests: script/style/textarea/title with nested `<` content, case‑insensitive closing, unterminated behavior.
  2. Add rescanning tests for `reScanBacktickToken`, `reScanDollarToken`, `reScanPipeToken`, `reScanHashToken`, `reScanSlashToken`.
  3. Add error callback tests using unterminated comment/CDATA/PI fixtures.
- **Acceptance Criteria**:
  - All new tests pass alongside existing 150/150 tests.

## 10) Documentation Updates

- **Goal**: Keep design docs synchronized with implementation and decisions.
- **Files**: `docs/1-plan.md`, `docs/2-scanner.md`.
- **Steps**:
  1. Add a short “Decisions” section: flag‑based context with minimal internal mode; raw‑text handling implemented; entities returned raw; decoding via utilities.
  2. Replace size estimates and file split with actual reality (single `src/scanner.ts`, ~1200 lines), and explain why.
  3. Cross‑link to this follow‑up plan for traceability.
- **Acceptance Criteria**:
  - Docs reflect reality and reference the exact functions/files.

## Sequencing and Timeline (estimate)

1. Hygiene + Docs alignment (items 6, 7, 10) — 0.5–1 day
2. Raw‑text handling (item 1) — 0.5–1 day
3. Rescanning helpers (item 2) — 0.5 day
4. API polish `setOnError` (item 5) — 0.25 day
5. Entity utilities (item 4) — 0.25 day
6. Benchmarks + CI guards (item 8) — 0.25 day
7. Tests expansion (item 9) — 0.25–0.5 day

Dependencies: implement raw‑text before adding its tests; add rescanning before rescanning tests; update docs after functionality lands.

## Acceptance Gate for the Follow‑Up

- All acceptance criteria per item satisfied.
- Existing test suite remains 100% green; new tests added are green.
- Docs updated to reflect implementation; lint and CI guards in place.