# Scanner Follow‑up: Strictness and Breadth

This document captures the concrete gaps to close to achieve industry‑grade breadth and strictness comparable to micromark while preserving our scanner’s performance profile.

## Summary

- We already support a wide set of Markdown and HTML tokens with native HTML scanning in `src/scanner.ts`.
- To fully match spec rigor and breadth, we should add: RCDATA mode, CommonMark HTML block detection hints, delimiter run flanking flags, better ordered list markers/indent info, stricter thematic breaks and autolinks, column tracking (tabs), hard line break hints, and a few escape/punctuation audits.

## Breadth (Feature Coverage)

- __RCDATA vs RAWTEXT__
  - Gap: `textarea`/`title` are RCDATA (entities active) while `script`/`style` are RAWTEXT.
  - Action: Add `InternalScanMode.Rcdata` and treat `&...;` as active inside RCDATA while still stopping only at matching end tag.
  - Touchpoints: `scanHtmlTag()`, `scan()` raw‑text branch, `scanAmpersand()`.

- __CommonMark HTML blocks (types 1–7)__
  - Gap: We don’t signal CM HTML blocks that span lines and often terminate on blank lines.
  - Action: Recognize block starts at line start and set a hint flag (e.g., `TokenFlags.ContainsHtmlBlock`) lasting until blank line; parser finalizes behavior.
  - Touchpoints: `scanLessThan()`, line‑start handling in `scanLineBreak()`; docs `docs/2-scanner.md`.

- __Delimiter run intelligence (emphasis/strong)__
  - Gap: We don’t precompute left/right‑flanking and intraword for `*` and `_`.
  - Action: Compute and attach flags `CanOpen`/`CanClose` on delimiter tokens so parser avoids neighborhood rescans.
  - Touchpoints: `scanAsterisk()`, `scanUnderscore()`.

- __Lists: ordered markers and indentation constraints__
  - Gap: `1.` / `1)` recognition at line start and indentation (1–3 spaces) are not surfaced.
  - Action: Detect ordered list markers with delimiter kind and starting value; expose current column/indent.
  - Touchpoints: `scanNumber()`, line‑start context; add `getColumn()`.

- __Autolinks (CM/GFM)__
  - Gap: Heuristic autolinks; CM/GFM have strict forms (scheme/email/WWW).
  - Action: Align `scanAutolink()` with spec; surface `TokenFlags.IsEmail`/`IsUrl`.

- __Backticks/tildes (inline code) run length__
  - Gap: Parser needs fence run length to match closing.
  - Action: Emit run length in flags for backticks and tildes.

- __Reference definitions and labels__
  - Gap: Easy hint that a line begins a definition.
  - Action: At line start, set `TokenFlags.MaybeDefinition` when pattern matches `[label]:` outline (parser validates fully).

## Strictness (Spec Accuracy)

- __RCDATA entity handling__
  - Ensure `&...;` remains active only in RCDATA (not RAWTEXT). Mode‑sensitive `scanAmpersand()`.

- __HTML tag/attribute edge cases__
  - Harden attribute name/value transitions and malformed resets; extend tests for booleans/unquoted/edge quotes.

- __Thematic breaks__
  - Enforce “only spaces otherwise” and consistent markers (≥3). Tighten `scanAsterisk()`/`scanMinus()`/`scanUnderscore()`.

- __Hard line breaks (two spaces)__
  - At EOL, if ≥2 trailing spaces, set `TokenFlags.HardBreakHint`.

- __Tab expansion and column tracking__
  - Track `column` with tabs=4 expansion; expose `getColumn()` to support list/code indentation logic.

- __Escapes and punctuation set audit__
  - Align `isMarkdownPunctuation` with CM’s escapable set; extend tests.

- __Link destination/title nuances__
  - Provide small hints (e.g., balanced paren lookahead) without allocations; parser remains authoritative.

## Prioritized Plan

1) RCDATA mode and ampersands
- Add `InternalScanMode.Rcdata`; wire `textarea`/`title` as RCDATA; `script`/`style` remain RAWTEXT.
- Update `scanAmpersand()` to operate in RCDATA.
- Tests: RCDATA with `&amp;` decoding via utilities, unterminated end tag behavior, mixed content.

2) Delimiter run flags (emphasis/strong)
- Compute `CanOpen`/`CanClose` and intraword per CM rules for `*` and `_`.
- Tests: classic tricky emphasis cases.

3) Thematic breaks tightening
- Enforce “only spaces” and ≥3 markers; add tests for near‑miss lines.

4) Column tracking and hard‑break hints
- Track `column` with tabs=4; expose `getColumn()`.
- Set `HardBreakHint` for two‑space EOL; tests for interaction with inline whitespace.

5) HTML blocks (types 1–7) hinting
- Recognize at line start, set `ContainsHtmlBlock` until blank line; parser validates.
- Tests: starts/terminations per CM examples.

6) Autolinks and ordered list markers
- Align autolinks (scheme/email/WWW) and surface flags.
- Detect ordered list markers with delimiter and numeric start value; tests for indentation.

## Acceptance Criteria

- New modes/flags do not regress performance measurably on `bench/scan-large-doc.js` (±5%).
- Tests cover added behaviors (RCDATA, delimiter runs, thematic breaks, HTML blocks, hard breaks, autolinks, lists).
- No allocations on hot paths; all hints exposed via flags/indices; `getTokenValue()` remains lazy.