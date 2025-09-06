## Speculative line classifiers

Purpose: a compact, zero-allocation, per-line classifier mask that enables bounded speculative parsing. Each row defines a bit, its trigger, precedence, and how it disambiguates relative to peers. The last column explains the ambiguity and how this bit should be prioritized.

Legend
- Precedence Tier: lower numbers are resolved earlier within their context.
- Lookahead Needed: only next line or local context unless specified otherwise.
- “Derived” means not stored as a bit; computed on demand.

| Bit Name | Category | Purpose / When Set | Trigger Pattern (sketch) | Lookahead Needed | Mutually Exclusive With | Precedence Tier | Parser Follow-up | Rollback Safety | Ambiguity / Positioning |
|---|---|---|---|---|---|---:|---|---|---|
| BLANK_LINE | Core | Blank/separator | `^[ \t]*$` | No | — | 0 | End or split paragraphs/blocks | Safe | Neutral delimiter that breaks ties: it resets many contexts and prevents misclassifying underline/table lines when separated by blanks. Prefer handling before most other line-driven promotions. |
| ATX_HEADING | Core | Start ATX heading | `^(#{1,6})([ \t]+`\| `$)` | No | — | 2 | Emit heading; inline scan to EOL | Safe | Disambiguates with paragraph by syntactic leader at line start; higher than paragraph but below hard block delimiters (fences/frontmatter/HTML). Not in conflict with thematic break. |
| SETEXT_UNDERLINE_CANDIDATE | Ambiguous | Possible underline for previous paragraph | `^[ \t]*(=+`\|`-+)[ \t]*$` | Needs previous line | THEMATIC_BREAK (when no paragraph precedes) | 3 | Promote previous paragraph to Setext heading | Needs previous state | Ambiguous with THEMATIC_BREAK when using `-`. The presence of a preceding non-blank paragraph line gives this priority; otherwise it’s a rule. |
| THEMATIC_BREAK | Core | Horizontal rule | `^[ \t]{0,3}((\* *\* *\*+)`\|`(\- *\- *\-+)`\|`(\_ *\_ *\_+))[ \t]*$` | No | SETEXT_UNDERLINE_CANDIDATE (dash-only case) | 1 | Emit hr block | Safe | Competes with list-bullets and setext dashes; three-or-more rule and absence of preceding paragraph give it precedence. Process before list and setext to avoid misfires. |
| INDENTED_CODE_START | Core | Start 4-space/tabs code | `^(?: {4,}|\t)` | No | LIST_* (if marker consumes indent) | 5 | Enter indented code or continue | Safe | Ambiguous with list continuation/paragraph indentation; wins when indentation is at least 4 and not absorbed by a list marker baseline. |
| INDENTED_CODE_CONT | Continuation | Continue indented code | Same as above while code open | No | — | 6 | Append line | Safe | Only relevant while code block is active; prevents other block recognizers from firing mid-code. |
| FENCED_CODE_OPEN | Core | Start fenced code block | `^[ \t]{0,3}(```+`\|`~~~+)` | No | FENCED_CODE_CLOSE (same line) | 2 | Open fence; capture info | Safe | High-precedence hard delimiter; neutralizes paragraph/list ambiguities and suppresses inline parsing until closed. |
| FENCED_CODE_CLOSE | Core | Close fenced code | `^[ \t]{0,3}(```+`\|`~~~+)` length ≥ open | No | — | 1 (in fence) | Close block | Safe | Only meaningful inside a matching fence context; out of context it’s treated as text. Takes precedence over everything while in fence mode. |
| BLOCKQUOTE_MARKER | Core | Start/continue blockquote | `^[ \t]{0,3}> ?` | No | — | 4 | Strip marker; nest | Safe | Outranks paragraph but sits below hard delimiters; can combine with list markers inside the quote after stripping. |
| LIST_UNORDERED_MARKER | Core | Bulleted list item | `^[ \t]{0,3}[*+-][ \t]+` | No | THEMATIC_BREAK (for `***`, `---`, `___`) | 3 | Start/cont list; compute tightness later | Safe | Ambiguous with thematic break; three-or-more rule with spaces decides; process thematic break first to avoid false list starts. |
| LIST_ORDERED_MARKER | Core | Ordered list item | `^[ \t]{0,3}\d{1,9}[.)][ \t]+` | No | — | 3 | Start/continue ordered list | Safe | Can resemble enumerations in text; indentation and spacing disambiguate; same tier as unordered list. |
| LIST_ITEM_CONTINUATION | Continuation | Lazy/indented continuation | Indent ≥ item baseline; or lazy line in list | Needs list context | — | 6 | Attach to current list item | Context | Resolves ambiguity between new blocks vs continuation content inside a list by respecting the item’s baseline and lazy rules. |
| LIST_DEDENT_POSSIBLE | Ambiguous | Potential list termination | Dedent below current item baseline | Needs stack | — | 7 | Possibly close list(s) | Context | Signals exiting list scope; competes with starting new peer blocks; resolved by current stack and following content. |
| HTML_BLOCK_START | Core | Start HTML block (CM types 1–7) | `<!--` `<![CDATA[` `<!DOCTYPE` `<?` `<[A-Za-z]` `</[A-Za-z]` (with type rules) | Sometimes | — | 2 | Enter HTML block mode | Safe | High-precedence structural entry; suppresses Markdown parsing rules per subtype until terminated; chosen over paragraph/list when signature matches. |
| HTML_BLOCK_CONT | Continuation | Continue HTML block | Until subtype termination or blank | Yes | — | 6 | Append verbatim | Safe | Keeps HTML context dominant; prevents spurious Markdown re-entry within the HTML block until its end condition. |
| LINK_REFERENCE_DEF | Core | Link reference definition | `^[ \t]{0,3}\[[^\]]+\]:` dest… | Optional (title lines) | — | 2 | Register label/dest/title | Safe | Ambiguous with paragraph starts; exact prefix grammar at column ≤3 disambiguates; processed before paragraph to avoid capturing as text. |
| FOOTNOTE_DEF | Extension | Footnote definition | `^[ \t]{0,3}\\^[^\]]+\]:` | Optional | — | 2 | Register footnote entry | Safe | Similar to link refs but with `^`; same precedence to preempt paragraphs; continuation lines follow indentation. |
| FRONTMATTER_YAML_OPEN | Extension | YAML front matter start | `^---[ \t]*$` at doc start | Needs closing `---` | FRONTMATTER_TOML_OPEN/JSON_OPEN | 1 | Capture YAML meta block | Safe | Only valid at document start (or configurable); wins above all to avoid misreading thematic breaks as front matter in initial lines. |
| FRONTMATTER_YAML_CLOSE | Extension | YAML front matter end | `^---[ \t]*$` in YAML mode | No | — | 1 | Close meta block | Safe | Only active during YAML mode; not considered otherwise. |
| FRONTMATTER_TOML_OPEN | Extension | TOML front matter start | `^\+\+\+[ \t]*$` at doc start | Needs closing `+++` | FRONTMATTER_YAML_OPEN/JSON_OPEN | 1 | Capture TOML meta | Safe | Same semantics as YAML variant with different fence; exclusive among front matter kinds. |
| FRONTMATTER_TOML_CLOSE | Extension | TOML front matter end | `^\+\+\+[ \t]*$` in TOML mode | No | — | 1 | Close meta block | Safe | Only in TOML mode. |
| FRONTMATTER_JSON_OPEN | Extension | JSON front matter start | `^{` as first significant line | Needs matching `}` across lines | FRONTMATTER_YAML_OPEN/TOML_OPEN | 1 | Capture JSON meta | Needs balance | JSON-style meta at start; ambiguous with code/paragraph; precedence at doc start avoids misclassification; requires bracket balancing. |
| MATH_BLOCK_DOLLAR_OPEN | Extension | Math block start (`$$`) | `^[ \t]{0,3}\$\$[ \t]*$` | Needs close | MATH_BLOCK_DOLLAR_CLOSE | 2 | Enter math mode | Safe | High-precedence container similar to code fences; disables Markdown inline rules until closed. |
| MATH_BLOCK_DOLLAR_CLOSE | Extension | Math block end (`$$`) | `^[ \t]{0,3}\$\$[ \t]*$` in math mode | No | — | 1 | Close math block | Safe | Only in math mode; resolves immediately. |
| MATH_BLOCK_FENCE_OPEN | Extension | Alt math fence (e.g., `:::math`) | `^[ \t]{0,3}:::+math\b` | Needs closing `:::` | MATH_BLOCK_DOLLAR_OPEN | 2 | Open math container | Safe | Containerized variant; takes precedence as an explicit directive; mutually exclusive with dollar form when both could match policy. |
| TABLE_PIPE_HEADER_CANDIDATE | Ambiguous | Potential GFM table header row | Contains `\|` separators; text in ≥2 cells | Needs next line for align row | — | 5 | Defer decision; record span | Needs retention | Ambiguous with paragraph lines that contain pipes; confirmed only if the next line is a valid alignment row. Kept lower precedence than core starters. |
| TABLE_ALIGNMENT_ROW | Core | Alignment delimiter row | `^[ \t]*\|? *:?-+:? *(\| *:?-+:? *)+\|? *$` | No | — | 4 | Confirm table; retro-promote header | Safe | Validates the header candidate; when present immediately after, table takes precedence over paragraph interpretation for the previous line. |
| TABLE_ROW | Core | Table body row | In confirmed table and has separators | No | — | 6 | Emit table row cells | Safe | Only after table confirmation; prevents reversion to paragraph until table ends. |
| PARAGRAPH_PLAIN | Core | Default text line | Non-blank and no earlier match | Contextual (for setext/table) | — | 7 | Start/continue paragraph | Safe | Lowest structural precedence; many peers preempt it. Can be retroactively upgraded (setext) or relinquished (table). |
| PARAGRAPH_LAZY_CONT | Continuation | Lazy continuation line | Non-blank; inside list/quote; satisfies lazy rule | Needs context | — | 6 | Attach to previous para | Context | Disambiguates between starting a new block vs continuing content in enclosing blocks; depends on container state. |
| ATTRIBUTE_BLOCK_LINE | Extension | Attribute set for previous block | `^[ \t]*\{[#.a-zA-Z][^}]*\}[ \t]*$` | Needs previous block | — | 8 | Attach attributes to prior block | Safe | Postfix metadata tied to the immediately preceding block; never stands alone; low precedence and applied after block closure checks. |
| DEFINITION_LIST_TERM | Extension | Definition list term (if enabled) | Non-blank not starting with colon; next line starts `: ` | Needs lookahead | — | 4 | Begin term; await definition | Speculative | Ambiguous with paragraphs; only promoted when the following line is a valid definition marker, otherwise remains paragraph. |
| DEFINITION_LIST_COLON_LINE | Extension | Definition list definition | `^[ \t]{0,3}:[ \t]+` after a term | No | — | 5 | Start definition block | Safe | Unambiguous colon-led definition line that pairs with a prior term; processed with moderate precedence. |
| ESCAPE_HARD_BREAK_CANDIDATE | Derived | Possible hard line break | Trailing ` {2,}$` before newline | No | — | — | Mark inline hard break | N/A | Not a line classifier bit; informs inline phase. Competes with trimming/normalization, not block boundaries. |
| TRAILING_WHITESPACE_RUN | Derived | Normalize trailing whitespace | Same as above or tabs near EOL | No | — | — | Hint for normalization | N/A | Optimization hint; invisible to block parsing; should not alter classification. |
| POTENTIAL_REFERENCE_TITLE_CONT | Ambiguous | Continuation of link ref title | Indented/quoted line after LINK_REFERENCE_DEF | Needs prior def | LINK_REFERENCE_DEF | 5 | Append to definition title | Needs capture | Distinguishes multi-line reference titles from paragraphs; only valid immediately after a definition opener. |
| HTML_BLOCK_POSSIBLE_TERMINATOR | Continuation | Candidate end for HTML block | Blank line or subtype-specific closing | Depends on subtype | — | 6 | End HTML block | Safe | Ends dominance of HTML context; priority within the HTML mode regardless of other Markdown patterns. |
| CODE_FENCE_INFO_FOLLOWS | Derived | Info string present | Non-space tail after fence opener | No | — | — | Store language/meta | N/A | Inline hint only; doesn’t affect block choice. Useful for language/attrs capture without allocations. |
| TIGHT_LIST_BLANK_SEEN | Derived | List tightness indicator | Blank line inside list item | Needs list context | — | — | Mark list loose later | N/A | Derived from BLANK_LINE within list scope; affects rendering (tight/loose) not block structure. |
| FOOTNOTE_BACKREF_LINE | Derived | Footnote backlink marker | Implementation-specific (`[^return]`) | No | — | — | Optional backlink handling | N/A | Non-standard; kept derived to avoid entangling with core parsing. |
| INLINE_HTML_SINGLE_LINE | Optimization | One-line HTML open+close | `<tag...>.*</tag>` (no line breaks) | No | — | 5 | Optionally treat as atomic | Safe | Performance hint: can be consumed as a single block line; not a different grammar. Avoids engaging table/list ambiguity on the same line. |
| RAW_BLOCK_CANDIDATE | Extension | Raw container open | `^[ \t]{0,3}:::+raw\b` | Needs closing `:::` | Other container opens | 2 | Enter raw literal mode | Safe | Like code fences but named; preempts Markdown rules until closed; mutually exclusive with other directive containers. |
| CONTAINER_DIRECTIVE_OPEN | Extension | Generic directive open (`:::`) | `^[ \t]{0,3}:::+[A-Za-z][\w-]*` | Needs closing `:::` | RAW_BLOCK_CANDIDATE | 2 | Open directive container | Safe | High-precedence named containers; prevent table/list/paragraph from claiming directive lines. |
| CONTAINER_DIRECTIVE_CLOSE | Extension | Close directive | `^[ \t]{0,3}:::+[ \t]*$` in directive | No | — | 1 | Close directive | Safe | Only applies when a matching directive is active; closes regardless of inner content ambiguities. |
| EXPLICIT_LINE_BREAK_ONLY | Core Minor | Line that is just `\` | `^[ \t]*\\[ \t]*$` | No | — | 7 | Paragraph with hard break | Safe | Low-precedence content line; doesn’t compete with block starters; affects only inline rendering at the paragraph boundary. |
| AUTOLINK_HTML_CANDIDATE | Derived | `<scheme:...>` inline autolink | `<[A-Za-z][A-Za-z0-9+.-]*:[^>]+>` | No | — | — | Inline handling | N/A | Derived inline-only; present to short-circuit expensive HTML block checks when clearly inline autolink shape. |
| EMAIL_AUTOLINK_CANDIDATE | Derived | `<user@host>` inline | `<[^ >@]+@[^ >@]+>` | No | — | — | Inline handling | N/A | Similar to autolink URL; helps avoid escalating to HTML block when angle-bracketed email appears on a line. |

Notes
- These bits fit in a 32-bit mask if derived are computed on demand; otherwise use a second mask or 64-bit integer.
- Precedence is a guidance order; actual parser logic also considers active modes (fence, HTML subtype, directive, math) and container stacks (list/blockquote).
- Lookahead is intentionally shallow (previous/next line) to keep speculation bounded.

# Examples of ambiguous scenarios

The examples below show minimal inputs that trigger the common ambiguities discussed earlier. Each example contains the raw lines and a short "Expected" note describing how the prescan + parser should classify or transform the lines.

### Paragraph promoted to Setext (equals)
```md
Hello World
===========
```
Expected: `SETEXT_UNDERLINE_CANDIDATE` on line 2 → promote line 1 to Setext H1; consume line 2 (not a paragraph line).

### Paragraph promoted to Setext (hyphens)
```md
Hello World
-----------
```
Expected: line 2 has both `SETEXT_UNDERLINE_CANDIDATE` and `THEMATIC_BREAK` bits for hyphen runs; because a non-blank paragraph precedes, prefer Setext promotion (H2) and consume line 2.

### Hyphen run as Thematic Break when no paragraph precedes
```md
---
```
Expected: `THEMATIC_BREAK` → emit horizontal rule (HR). No paragraph to promote.

### Hyphen run after paragraph followed by blank line — do not treat as HR, still setext
```md
Hello World
---

```
Rare heuristic, not planned in Mixpad: If the underline-like line is followed immediately by a blank line, parse as `THEMATIC_BREAK` (HR) and leave the preceding line as a paragraph; parser uses next-line context to decide.

### Table header confirmed by alignment row (GFM)
```md
Name | Age
-----|----
Alice | 30
```
Expected: First line marked `TABLE_PIPE_HEADER_CANDIDATE`; next line matches `TABLE_ALIGNMENT_ROW` → retro-promote header and emit table rows.

### Pipe-containing lines but no alignment row → paragraphs
```md
Name | Age
This is not an align row
```
Expected: No `TABLE_ALIGNMENT_ROW` detected on line 2 → treat both lines as paragraph content (no table promotion).

### Fenced code opener inside a buffered paragraph
```md
Some intro text
```
code block line
```
```
Expected: `FENCED_CODE_OPEN` on the fence line preempts treating it as paragraph content; parser flushes the tentative paragraph, then opens fenced code mode and consumes until `FENCED_CODE_CLOSE`.

### YAML frontmatter at document start vs thematic break
```md
---
title: Example
---
```
Expected: At document start, `FRONTMATTER_YAML_OPEN` is recognized; parser enters frontmatter mode and does not treat the first `---` as `THEMATIC_BREAK`.

### HTML block start vs inline/autolink
```md
<div class="note">
Some text
</div>
```
Expected: `HTML_BLOCK_START` (depending on subtype) → captured as HTML tag (with attributes).

### Indented code vs list continuation
```md
- item
		code indented by 4 spaces
```
Expected: Parser considers list baseline; if the post-marker content indent reaches 4 spaces relative to the content baseline, treat the indented line as `INDENTED_CODE_START` inside the list item (an indented code block); otherwise it may be `LIST_ITEM_CONTINUATION`.

### Lazy list continuation (non-indented continuation)
```md
- item one
	continued line without marker
```
Expected: Within a list item, a non-blank line that does not start a new marker but satisfies lazy continuation rules is `PARAGRAPH_LAZY_CONT` and attaches to the current list item's paragraph.

### Attribute block attaches to previous block
```md
A paragraph with attributes
{#my-id .class}
```
Expected: Line 2 matches `ATTRIBUTE_BLOCK_LINE` → attach attributes to the immediately preceding block rather than creating a standalone block.

### Math block (`$$`) container
```md
Some text
$$
E = mc^2
$$
```
Expected: `MATH_BLOCK_DOLLAR_OPEN` on the `$$` line → enter math block mode; previous paragraph is finalized; close on matching `$$`.

### Summary note
- Use a sliding-window prescan (lookahead = 1) to set candidates that depend on the next line (table alignment, setext candidates). The block parser then uses those finalized flags plus container stack state to deterministically apply promotions (paragraph→setext, header→table promotion, HR emission, etc.) without global rollback.


