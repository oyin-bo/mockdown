# Scanner Follow-up: Markdown Inside HTML (Policy Shift)

## Decision

- We parse Markdown inline syntax inside all HTML elements (e.g., `div`, `p`, `section`, `b`, `span`).
- Exceptions: RAWTEXT (`<script>`, `<style>`) and RCDATA (`<title>`, `<textarea>`) retain their HTML content models:
  - RAWTEXT: no Markdown, entities inactive.
  - RCDATA: no Markdown, entities active.

## Rationale

- HTML is a first-class citizen; we don’t defer to an external HTML parser.
- Better authoring experience: emphasis, code, links, etc., can appear naturally inside HTML containers.
- Predictable: Embedded HTML does not suspend Markdown by default (unlike CM’s HTML block semantics).

## What Changes vs CommonMark

- CM “HTML blocks” usually suspend Markdown until a blank line or matching condition. We do not suspend Markdown inside HTML containers except the RAWTEXT/RCDATA elements above.
- We still recognize and build HTML nodes; we just keep tokenizing for Markdown inside them.

## Scanner Impact (src/scanner.ts)

- RAWTEXT/RCDATA mode switching remains as-is via `scanHtmlTag()`, `scanRawTextContent()`, `scanRcdataContent()`.
- No additional “suspend Markdown” mode was added; normal Markdown scanning continues inside non-RAWTEXT/RCDATA HTML.
- `TokenFlags.ContainsHtmlBlock` remains a structural hint (HTML began at line start), not a suppression signal.

## New/Updated Token Flags (src/token-types.ts)

- Added packed run-length support for code markers:
  - `TokenFlagRunLengthShift` and `TokenFlagRunLengthMask` encode backtick/tilde run lengths in `tokenFlags`.
  - Emitted by `scanBacktick()` and `scanTilde()` to precisely match fences/inline code.
- Added `TokenFlags.MaybeDefinition`:
  - Set at line start when the outline matches `[label]:` (parser validates fully).

## Thematic Break Strictness

- Spaced markers are supported at the parser level; the scanner does not merge spaced markers into a single token.
  - Parser should recognize `* * *`, `- - -`, `_ _ _` (≥3 markers, only spaces/tabs otherwise, then EOL) from separate tokens.
- Scanner keeps contiguous-run handling for `***`, `---`, `___` as before.

## Autolinks (Pending Expansion)

- Current: angle-bracket autolinks with basic scheme/email signals and flags.
- Planned: expand to `www.` and broader schemes while keeping `TokenFlags.IsAutolinkEmail` / `TokenFlags.IsAutolinkUrl`.

## Escapes/Punctuation Audit (Pending)

- Verify `isMarkdownPunctuation()` in `src/character-codes.ts` against the CommonMark escapable set; adjust if needed.

## Parser Policy (for Parser Module)

- Inline Markdown is active inside all HTML elements except RAWTEXT/RCDATA.
- Parser should not suppress inline parsing due to HTML container context (use scanner modes/flags only for RAWTEXT/RCDATA, and `ContainsHtmlBlock` as a structural hint).

## Acceptance and Tests

- Add tests covering:
  - Markdown inline inside `<div>`, `<span>`, etc.
  - RAWTEXT/RCDATA no-Markdown behavior and entity handling in RCDATA.
  - Backtick/tilde run-length correctness for fences and inline code.
  - Thematic breaks with spaced markers for `*`, `-`, `_`.
  - `[label]:` detection surfaced via `MaybeDefinition`.

## References

- Code touchpoints: `src/scanner.ts`, `src/token-types.ts`, `src/character-codes.ts`.
  - Existing hints: `ContainsHtmlBlock`, `IsInRawText`, `IsInRcdata`, `CanOpen`, `CanClose`, `HardBreakHint`, `IsAutolinkEmail`, `IsAutolinkUrl`.