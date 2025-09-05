## Summary

This document defines a strict, unambiguous set of requirements for the annotated Markdown testing format used by `verify-tokens.ts`.

The goal: make annotation detection stricter and more predictable so legitimately intended tests are recognized, nearly-correct test annotations are normalized and reported as failures, and accidental text that looks similar is left alone as normal Markdown.

## Concrete requirements

1) Position marker line detection (entry condition)

	- The candidate position-marker line must be a single line that begins with optional whitespace followed immediately by the character "1" (the digit 1). Nothing may appear before the leading whitespace.
	- After the initial "1", the rest of the line must contain only marker characters and whitespace. Marker characters are defined as the digits "1".."9" and the uppercase letters "A".."Z" (lowercase letters are allowed in input but normalized to uppercase for detection). Example valid marker sequences: `1 2 3 4 5 6 7 8 9 A B C` or `12AB`.
	- Any other characters (letters/words, punctuation, emoji, etc.) appearing on the marker line invalidate detection. For example `1 Yes please` should NOT be treated as a position-marker line.
	- The sequence of marker characters (ignoring whitespace) must be strictly increasing in the allowed ordering where digits come before letters: 1 < 2 < ... < 9 < A < B < ... < Z. Strictly increasing means each subsequent marker has a greater order value than the previous one; gaps are permitted (e.g., `1 3 7 B` is allowed). The first marker must be `1`.
	- Markers may be adjacent or separated by spaces. There is no requirement that markers are separated by spaces. The implementation must map each marker occurrence to its character offset in the position-marker line (the first occurrence of that marker char after the previous marker's offset). Duplicate/ambiguous occurrences that prevent a unique increasing mapping should make detection fail.

2) Assertion lines requirement (minimum-asserts rule)

	- The immediate following line (the next line after the position-marker line) must start a block of one or more assertion lines. If the next line after the marker line does not start with optional whitespace followed by the `@` character, the entire candidate block must be treated as ordinary Markdown (no annotation parsing) and left unchanged by `verify-tokens`.
	- An assertion line is any contiguous line that starts with optional whitespace followed by `@` and then one of the marker characters (the same character set described above). Assertion lines are collected until a non-assertion line or EOF is reached. Blank lines or other markdown in between break the assertion block.

3) Per-assertion parsing and fallback behavior

	- Each assertion line corresponds to one of the position markers by matching the marker character that immediately follows the `@`. The association uses the marker's character, not a numeric column index, and must map to one of the markers found on the marker line. If an assertion line references a marker that does not exist in the marker-line's detected set, that assertion-line is considered unparseable and skipped (but other assertions remain processed).
	- Parsing of the remainder of an assertion line (token id, quoted text, flags, older prefixes like `text:`/`flags:`) follows the current tolerant parsing rules. If the assertion line cannot be parsed into token/flags/text, it is skipped silently for that marker (it should not abort the whole block).
	- If a marker has zero successfully parsed assertion lines associated with it, `verify-tokens` must still emit a normalized assertion entry for that marker in its output, consisting of a single assertion that requires the token kind observed at that position (i.e., a token-only assertion). This makes missing/empty assertions visible as failures rather than silently passing.

4) Normalization & reporting

	- When `verify-tokens` recognizes a valid annotation block it must normalize the output marker line to the canonical marker sequence: digits `1`..`9` followed by uppercase letters `A`..`Z` (as many markers as were detected). The normalized markers are used when producing the output so test failures are easy to read and compare.
	- Assertion lines in the output should be preserved only for those that could be parsed. Unparseable `@` lines are omitted from the parsed assertions list but must not cause the block to be ignored.

5) Robustness and error modes

	- The detection must be conservative: if any step of the marker-line detection cannot unambiguously map increasing marker characters to unique offsets on the line, treat the candidate block as ordinary Markdown (do not try to parse assertions).
	- The detection is tolerant about minor formatting differences: spaces between markers are optional and lowercase letters are accepted and normalized to uppercase.
	- The implementation must not mutate source Markdown when it fails to detect a valid annotation block; it should return the original chunk unchanged. Only successfully-detected annotation blocks may produce altered/normalized output.

## Implementation notes (how-to)

- Scan the candidate marker line, record all characters that are digits 1-9 or letters A-Z (case-insensitive) along with their indexes (first occurrence after previous marker). If the first such character is not `1`, fail detection.
- Verify the recorded sequence is strictly increasing in the defined ordering (digits then letters). Allow gaps. If verification fails, abort detection and treat as normal Markdown.
- Look at the immediate next line; it must start with optional whitespace then `@`. If not, abort detection.
- Read successive lines starting with optional whitespace then `@`. For each, extract the marker character immediately following `@` and try to map it to the position markers. If mapping or parsing fails for that assertion line, skip it but continue.
- After collecting assertions for the block, ensure every detected marker has at least one parsed assertion; if not, add a synthetic token-only assertion for that marker in the verify-tokens output (this ensures missing assertions are visible as failures).

## Justification

Why stricter detection?

- Current permissive detection occasionally misidentifies sequences of digits/letters in text as test annotations, then silently skips malformed blocks; this preserves the original annotation text and can be misinterpreted as a passing test.
- Requiring the next line to start with `@` prevents accidental marker-like lines from being treated as tests.
- Accepting markers with or without spaces but requiring strict increasing order makes the detection flexible for real tests while catching common mistakes (wrong ordering, missing `1`, repeated marker characters).
- Emitting a synthetic token-only assertion when a marker has no parsed assertions prevents silent successes and makes test output fail loud and clear, which aids test hygiene.

## Edge cases and examples

- `1 2 3` followed by `@1 ...` and `@2 ...` — valid.
- `12AB` (no spaces) followed by `@1 ...`/`@2 ...` — valid if the detected sequence is strictly increasing and `@` lines exist; markers normalize to `1234`.
- `  1  foobar` (no `@` next line) — treated as ordinary markdown.
- Marker line contains repeated `1` characters that cannot be unambiguously mapped — treated as ordinary markdown.

## Suggested unit tests

Add the following focused unit tests (place implementations in `parser/tests/2-testing-infrastructure.test.ts` and reference them from this doc):

- Valid simple annotation: marker line `1` with a single `@1` assertion that matches the token.
- Multiple adjacent markers: marker line `12AB` (no spaces) with `@1/@2/@A/@B` assertions; verify normalization to `1234`.
- Lowercase markers: `1 a b` normalizes to `1AB` and parses matching `@` assertions.
- Missing `@` next line: a marker line followed by a non-`@` line must be treated as ordinary markdown (no parsing).
- Missing initial `1`: marker line starting with `2` should be ignored as ordinary markdown.
- Non-increasing markers: a line like `1 B A` must be rejected as ordinary markdown.
- Ambiguous duplicate characters: lines with repeated marker chars that cannot be mapped (e.g., `1 2 1 3`) must be rejected.
- Assertion references nonexistent marker: `1 2` with an `@3` line — `@3` is skipped; other markers remain and missing assertions synthesize token-only assertions.
- Unparseable assertion lines: `@1 ???` should be skipped; if a marker ends up with zero parsed assertions a synthesized token-only assertion must be emitted.
- Multiple assertions per marker: allow and preserve several parsed assertions for the same marker.
- Whitespace/tab handling: marker lines and `@` lines with leading spaces or tabs should be accepted; other Unicode whitespace should be rejected.
- Marker line with trailing invalid text: `1 foobar` (text after the marker characters) must be treated as ordinary markdown.
- Position-mapping edge: repeated candidate marker characters where the left-to-right first-match rule would fail; ensure detection fails conservatively and leaves source unchanged.
- Newlines and surrounding whitespace preservation: verify that successful verification returns the original input including leading/trailing newlines.

These tests should be implemented alongside existing `verify-tokens` infrastructure tests in `parser/tests/2-testing-infrastructure.test.ts` and referenced here so reviewers can see the behavior coverage.

## Next steps

- Update `verify-tokens.ts` detection logic to implement the steps above (scan marker chars + indexes, enforce strictly increasing ordering, require immediate `@` line, collect @ lines, skip unparseable assertions, synthesize token-only assertions for missing markers).  
- Add unit tests that exercise these edge cases so future changes do not regress detection behavior.
