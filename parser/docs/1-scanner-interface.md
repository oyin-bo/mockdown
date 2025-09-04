## Parser ⇄ Scanner interface (complete summary)

This document captures the scanner → parser "language" discovered in the repository: the full set of tokens, flags, helper methods, modes and semantics that the scanner currently exposes to the parser (and therefore to the rest of the system). It is a direct, implementation-focused reference intended to guide the strategic change of responsibilities between scanner and parser.

## Checklist (what you asked for)
- [x] Collect and synthesise the scanner's public API and semantics from the codebase
- [x] Enumerate token kinds the scanner emits and what they mean
- [x] Enumerate token flags and packed metadata the scanner exposes
- [x] Describe rescanning / lookahead / speculation primitives and their semantics
- [x] Describe specialized helper methods (`getColumn`, ordered-list metadata, value accessors)
- [x] Explain internal modes (raw text / Rcdata) and HTML handling policy
- [x] Summarize performance / memory design choices relevant to shifting responsibility
- [x] Provide high-level assessment and targeted recommendations

## High-level summary

The scanner implements a TypeScript-style single mutable scanner (see `parser/scanner.ts`) and exposes a token-at-a-time interface to the parser. It focuses on fast, char-code-driven decisions and lazy materialization. The scanner provides a rich, declarative "language" to the parser in three ways:

- A broad token taxonomy (SyntaxKind) covering HTML and Markdown constructs.
- A packed metadata integer (TokenFlags) that encodes positional, structural and semantic hints (including a 6-bit run-length field).
- A set of helper methods (rescan helpers, column/indent helpers, speculative scanning, error callback hooks) that let the parser perform complex decisions cheaply.

The net effect: the parser receives tokens augmented with precise, low-cost signals that let it implement structural logic (nesting, setext detection, tables, list nesting, reference resolution) while keeping the scanner fast and allocation-light.

## Core scanner API (how parser talks to scanner)

Typical usage pattern:

```text
scanner.setText(source)
while (scanner.scan() !== SyntaxKind.EndOfFileToken) {
	kind = scanner.getToken()
	start = scanner.getTokenStart(); end = scanner.getTokenEnd()
	flags = scanner.getTokenFlags()
	text = scanner.getTokenText()        // lazy
	value = scanner.getTokenValue()      // lazy; may be special for fences/autolinks
	// parser uses flags + token kind to decide what to do
}
```

Key exported methods (see `parser/scanner.ts`):

- getToken(), getTokenStart(), getTokenEnd()
- getTokenText(), getTokenValue()
- getTokenFlags()
- scan(), setText(text, start?, length?)
- lookAhead(cb) — speculative scan with suppressed errors
- tryScan(cb) — trial scan with rollback and buffered errors
- reScanLessThanToken(), reScanBacktickToken(), reScanDollarToken(), reScanPipeToken(), reScanHashToken(), reScanSlashToken(), reScanGreaterThanToken()
- getColumn() — column with tab expansion (tabs = 4)
- getOrderedListStart() — numeric start for ordered list markers
- setOnError(cb) — optional error callback
- getErrorCode(), getErrorMessage(), isUnterminated(), hasPrecedingLineBreak()

These form the scanner-parsing contract. The parser relies on these primitives rather than on a heavyweight token/event stream.

## Token taxonomy (what tokens mean for complex Markdown structure)

The scanner's "vocabulary" of 58 distinct `SyntaxKind` tokens forms a sophisticated language for expressing Markdown's structural ambiguities and multi-line dependencies. This vocabulary enables the parser to distinguish between visually similar but semantically different constructs without expensive backtracking.

### Core principle: Disambiguation through context signals

Markdown's complexity comes from punctuation characters having multiple meanings depending on position and context. The scanner's vocabulary addresses this by encoding **positional awareness** and **structural hints** directly into tokens:

**Example: The `#` character disambiguation**
- `HashToken` at line start with `IsAtLineStart` flag → ATX heading candidate
- `HashToken` in middle of line → literal text or URL fragment
- `HashToken` followed by space at line start → confirmed ATX heading marker
- `HashToken` with 7+ consecutive hashes → literal text (ATX only supports 1-6 levels)

**Example: The `-` character's four meanings**
- `DashToken` at line start + space → unordered list marker
- `DashToken` at line start + 2+ more dashes → thematic break candidate  
- `DashDashDash` at document start → YAML frontmatter fence
- `DashToken` on line after paragraph text → Setext H2 underline candidate

### HTML and Markdown token parity

The vocabulary treats HTML as first-class, not as a special case:

**HTML structural tokens:**
- `LessThanToken`, `LessThanSlashToken`, `GreaterThanToken`, `SlashGreaterThanToken` - Tag delimiters
- `HtmlComment`, `HtmlCDATA`, `HtmlDoctype`, `HtmlProcessingInstruction` - Complete constructs
- `HtmlText` - Content inside elements (where Markdown remains active)

**Markdown structural tokens:**
- `HashToken`, `AsteriskToken`, `UnderscoreToken` - Multi-purpose punctuation
- `BacktickToken`, `TildeToken` - Code/fence delimiters with run-length metadata
- `DashToken`, `DashDashDash` - Lists, breaks, frontmatter
- `DollarToken`, `DollarDollar` - Math delimiters

**Link/reference tokens:**
- `OpenBracketToken`, `CloseBracketToken` - Link text and reference labels
- `OpenParenToken`, `CloseParenToken` - Link destinations and titles
- `ExclamationToken` - Image prefix distinguisher

### Multi-line construct vocabulary

Several tokens specifically handle constructs where one line influences the next:

**Setext headings** (paragraph text followed by underline):
```
Heading Text
============   ← EqualsToken sequence on next line
```
The scanner provides `EqualsToken`/`DashToken` with position info, but the parser must detect the multi-line pattern by looking back at the previous paragraph.

**Table structures** (header row + alignment row):
```
| Header 1 | Header 2 |   ← PipeToken sequence
|----------|----------|   ← DashToken + PipeToken alignment row
```
The scanner emits `PipeToken` for separators and `DashToken` for alignment, but table detection requires the parser to recognize the two-line pattern.

**Code fence info strings** (fence line + content + closing):
```javascript
code content here
```
The scanner stores the run-length in flags and tracks the info string ("javascript") in `getTokenValue()`, enabling the parser to match opening/closing fence lengths.

Files to reference: `parser/token-types.ts` (complete token enum) and `parser/scanner.ts` (disambiguation logic).

## Token flags and packed metadata (line-by-line dependency signals)

The `TokenFlags` bitfield provides compact, high-value signals that enable the parser to handle Markdown's complex line-to-line dependencies efficiently. These 24 flags encode not just token properties, but **structural relationships** between lines and **multi-line construct hints**.

### Positional flags for multi-line constructs

**Line-start detection (`IsAtLineStart`)**:
Critical for distinguishing block-level vs inline uses of the same punctuation:
- `#heading` at line start → ATX heading
- `text#hashtag` inline → literal text
- `> quote` at line start → blockquote marker
- `text > comparison` inline → literal operator

**Blank line tracking (`IsBlankLine`)**:
Essential for block separation and list tightness:
- Single blank line between paragraphs → `WhitespaceSeparationNode(count: 1)`
- Multiple blank lines → `WhitespaceSeparationNode(count: N)`
- Blank lines in lists → determine tight vs loose list rendering
- Blank lines before/after code blocks → affect parsing context

**Line-break context (`PrecedingLineBreak`)**:
Used for constructs that depend on line boundaries:
- Hard line breaks (two spaces + newline)
- Paragraph continuation vs new block detection
- List item lazy continuation rules

### Content mode flags for complex parsing

**Raw text suspension (`IsInRawText`, `IsInRcdata`)**:
Handle HTML elements that change Markdown parsing rules:

```html
<script>
// This content has IsInRawText flag
// No Markdown processing: *not italic*, [not a link]
</script>

<textarea>
<!-- IsInRcdata: entities active, Markdown suspended -->
&amp; is decoded, but *emphasis* is literal
</textarea>
```

**HTML block hints (`ContainsHtmlBlock`)**:
Signal CommonMark HTML block types without full parsing:
- `<div>` at line start → structural HTML block hint
- `<span>` inline → no block hint, Markdown stays active
- `<!-- comment -->` at line start → HTML block type 2

### Delimiter semantic flags for inline parsing

**Emphasis delimiter capabilities (`CanOpen`, `CanClose`)**:
Implement micromark's left/right flanking rules without rescanning:

```markdown
word*emphasis*word    → * has CanOpen=true, CanClose=true
*start of line        → * has CanOpen=true, CanClose=false  
end of line*          → * has CanOpen=false, CanClose=true
word * word           → * has CanOpen=false, CanClose=false (not flanking)
```

**Intraword underscore blocking**:
`_` delimiters get `CanOpen=false` when surrounded by alphanumeric characters:
```markdown
snake_case_variable   → underscores can't open/close (not emphasized)
_word_                → underscores can open/close (emphasized)
```

### Run-length encoding for fence matching

**6-bit run-length field (bits 16-21)**:
Packed into flags to avoid allocation while enabling precise fence matching:

```markdown
```javascript       ← BacktickToken with run-length=3 in flags
code here
````                ← BacktickToken with run-length=4 (doesn't match, literal)
```                 ← BacktickToken with run-length=3 (matches, closes fence)
```

**Tilde fence handling**:
```markdown
~~~python           ← TildeToken with run-length=3
code content
~~~~                ← run-length=4 (doesn't close)
~~~                 ← run-length=3 (closes)
```

### List and reference metadata flags

**Ordered list metadata (`IsOrderedListMarker`, `OrderedListDelimiterParen`)**:
Packed list information to avoid reparsing:
```markdown
1. First item       → flags encode start=1, delimiter='.'
99) Another item    → flags encode start=99, delimiter=')'
```

**Reference definition hints (`MaybeDefinition`)**:
Quick detection of potential reference patterns:
```markdown
[label]: url        ← OpenBracketToken at line start gets MaybeDefinition flag
[not]: a reference  ← inside paragraph, no flag
```

### Autolink classification flags

**Link type detection (`IsAutolinkEmail`, `IsAutolinkUrl`)**:
Enable parser to handle different autolink punctuation rules:
```markdown
<https://example.com>    → IsAutolinkUrl=true (strip trailing punctuation)
<user@example.com>       → IsAutolinkEmail=true (different validation rules)
<not-a-link>             → neither flag (literal text)
```

The parser relies heavily on these flags to implement complex Markdown rules efficiently without expensive lookahead or backtracking.

## Rescanning, lookahead and speculation semantics (complex disambiguation patterns)

The rescanning and lookahead primitives are designed to handle Markdown's most complex disambiguation challenges—cases where the same punctuation mark can have radically different meanings depending on context that may span multiple lines or require deep lookahead.

### Rescanning helpers: Context-dependent reinterpretation

Rescanning exists because many Markdown punctuation characters are fundamentally ambiguous during initial tokenization. The scanner makes conservative initial choices, then provides rescanning methods that let the parser reinterpret tokens based on structural context.

**`reScanLessThanToken()` - HTML vs autolink vs comparison**:
The `<` character has three distinct interpretations:
```markdown
<div>content</div>       ← HTML tag start (parser sees element structure)
<https://example.com>    ← Autolink (parser sees URL pattern after <)
x < 5 and y > 3         ← Literal comparison (parser sees no valid HTML/URL pattern)
```
Usage pattern: Parser initially sees `LessThanToken`, then rescans based on what follows to determine the correct interpretation.

**`reScanBacktickToken()` - Inline code vs code fence disambiguation**:
Critical for distinguishing single backticks from fence starts:
```markdown
`inline code`           ← BacktickToken with run-length=1 (inline)
```javascript          ← BacktickToken with run-length=3 at line start (fence)
some text ` backtick    ← BacktickToken with run-length=1 (inline)
```
Usage: Parser checks `IsAtLineStart` flag and run-length to decide fence vs inline, then rescans to get appropriate token type.

**`reScanDollarToken()` - Math delimiter vs currency**:
Math delimiters require careful context checking to avoid false positives:
```markdown
$5.00 price            ← Dollar followed by digit (literal currency)
$E = mc^2$             ← Dollar with math content (inline math)
$$                     ← Double dollar at line start (block math)
\int_0^1 x^2 dx
$$
```
Usage: Parser uses lookahead to detect math content patterns before rescanning dollar tokens as math delimiters.

**`reScanPipeToken()` - Table delimiter vs literal pipe**:
Pipes are only table separators in specific multi-line contexts:
```markdown
| Header 1 | Header 2 |   ← PipeToken in table header row
|----------|----------|   ← PipeToken in alignment row (confirms table)
| Cell 1   | Cell 2   |   ← PipeToken in data row

command | grep pattern    ← PipeToken in code (literal pipe)
```
Usage: Parser must scan ahead to next line to find alignment row before rescanning pipes as table separators.

**`reScanHashToken()` - ATX heading vs fragment vs literal**:
Hash symbols have multiple meanings based on position and context:
```markdown
# Heading               ← HashToken at line start with space (ATX heading)
## Subheading          ← Multiple HashToken at line start (level 2 ATX)
text#hashtag           ← HashToken inline (literal text)
<a href="#fragment">   ← HashToken in URL (fragment identifier)
```
Usage: Parser checks `IsAtLineStart` flag and following whitespace before rescanning as heading marker.

### Lookahead primitives: Multi-line pattern detection

**`lookAhead(cb)` - Safe speculation without side effects**:
Used for complex multi-line pattern detection where the parser needs to "peek ahead" without committing to a parse decision or generating error diagnostics.

**Setext heading detection example**:
```markdown
Heading Text
============              ← Must lookahead to detect this pattern
Next paragraph
```
Usage pattern:
```typescript
// Parser sees paragraph content, then encounters newline
const isSetextHeading = scanner.lookAhead(() => {
  scanner.scan(); // skip newline
  const token = scanner.getToken();
  return (token === SyntaxKind.EqualsToken || token === SyntaxKind.DashToken) &&
         scanner.getTokenFlags() & TokenFlags.IsAtLineStart &&
         isUnderlineSequence();
});
```

**Table structure detection**:
```markdown
| Header 1 | Header 2 |
|----------|----------|    ← Lookahead needed to confirm table
| Cell 1   | Cell 2   |
```
Usage: Parser uses `lookAhead()` after seeing pipe-separated header row to check if next line contains alignment row.

**`tryScan(cb)` - Trial parsing with rollback**:
Used when the parser needs to attempt a complex parse that might fail, with the ability to backtrack cleanly.

**Link reference resolution**:
```markdown
[link text][ref]         ← Try parsing as reference link
[ref]: url "title"       ← Reference definition elsewhere
```
Usage: Parser uses `tryScan()` to attempt parsing reference link syntax, rolling back to parse as literal text if the reference doesn't exist.

**Frontmatter detection**:
```markdown
---
title: Document
---                      ← tryScan to distinguish from thematic break
```
Usage: At document start, parser uses `tryScan()` to check if `---` sequence is followed by valid YAML content and closing fence.

### Error handling during speculation

**Error suppression in `lookAhead()`**:
- All scanner errors during the callback are suppressed and discarded
- Scanner state is fully restored after callback completion
- No error callbacks are invoked
- Used when speculation must not produce diagnostics

**Error buffering in `tryScan()`**:
- Scanner errors during callback are buffered but not immediately emitted
- If callback returns truthy: buffered errors are committed and emitted in order
- If callback returns falsy: buffered errors are discarded and scanner rolls back
- Enables "optimistic parsing" with clean error recovery

These primitives are essential for implementing Markdown's complex disambiguation rules efficiently, allowing the parser to handle ambiguous syntax without expensive backtracking or duplicate tokenization.

## Specialized helpers the parser depends on (complex syntax support)

These helper methods provide precise, low-cost information for handling Markdown's most complex syntactic patterns—particularly those involving indentation, multi-line structures, and content that requires special processing.

### `getColumn()` - Indentation and alignment precision

**Purpose**: Compute tab-expanded column position for constructs that depend on precise indentation.

**Tab expansion semantics**: Tabs expand to next 4-column boundary (CommonMark standard).

**Critical usage patterns**:

**List nesting and continuation**:
```markdown
1. First item
   - Nested item (3 spaces = column 4)
     More text   (5 spaces = column 6)
	- Tab item    (tab expands to column 4)
```
Parser usage: `scanner.getColumn()` determines list nesting level and lazy continuation boundaries.

**Blockquote nesting**:
```markdown
> Level 1
> > Level 2 (column 3 after > >)
>   Lazy continuation (3 spaces after >)
```
Parser checks column position after `>` markers to determine nesting depth.

**Code block indentation**:
```markdown
Normal paragraph
    Indented code (4+ spaces = code block)
        More indented (8 spaces, still code)
```
Parser uses `getColumn()` to distinguish indented code blocks from normal paragraphs with leading spaces.

### `getOrderedListStart()` - List metadata extraction

**Purpose**: Extract numeric start value and delimiter type from ordered list markers without reparsing.

**Packed metadata**: When `IsOrderedListMarker` flag is set, this method returns the parsed numeric value; otherwise returns -1.

**Usage patterns**:

**Standard ordered lists**:
```markdown
1. First item           → getOrderedListStart() returns 1
2. Second item          → returns 2
```

**Non-standard start values**:
```markdown
99. High number         → returns 99
0. Zero start           → returns 0 (valid in CommonMark)
```

**Delimiter type detection**:
The `OrderedListDelimiterParen` flag indicates whether the delimiter is `)` (true) or `.` (false):
```markdown
1) Parenthesis style    → flag = true
1. Period style         → flag = false
```

**Parser usage**: Combines with `getColumn()` to handle complex list nesting:
```typescript
if (flags & TokenFlags.IsOrderedListMarker) {
  const start = scanner.getOrderedListStart();
  const column = scanner.getColumn();
  const usesParen = flags & TokenFlags.OrderedListDelimiterParen;
  // Create ordered list with proper start value and nesting
}
```

### `getTokenValue()` / `getTokenText()` - Lazy content extraction

**Purpose**: Provide stable, allocation-light access to token content with special processing for certain constructs.

**Key difference**: 
- `getTokenText()` returns raw source slice
- `getTokenValue()` returns processed content (may differ for fences, autolinks, entities)

**Code fence info strings**:
```markdown
```javascript hello world
code content
```
```
- `getTokenText()` returns `"```javascript hello world"`
- `getTokenValue()` returns `"javascript hello world"` (trimmed info string)

**Autolink processing**:
```markdown
<https://example.com/path>
```
- `getTokenText()` returns `"<https://example.com/path>"`
- `getTokenValue()` returns `"https://example.com/path"` (without angle brackets)

**Entity handling**:
```markdown
&amp; &lt; &#65;
```
Current implementation: both methods return the raw entity text. Future enhancement could decode entities in `getTokenValue()`.

### Error inspection helpers

**`setOnError(cb)` - Real-time diagnostic collection**:
**Purpose**: Enable parser to collect scanner diagnostics as they occur, rather than polling afterward.

**Usage pattern for error recovery**:
```typescript
const errors: ScannerError[] = [];
scanner.setOnError((start, end, code, message) => {
  errors.push({ start, end, code, message });
});

// Parse complex construct
const result = parseComplexConstruct();
if (errors.length > 0) {
  // Handle scanner-level errors during parsing
}
```

**`isUnterminated()` and error state methods**:
**Purpose**: Detect incomplete constructs that require parser-level recovery.

**HTML comment example**:
```markdown
<!-- Unterminated comment...
End of file reached
```
Scanner sets `Unterminated` flag and error state; parser can recover by treating as literal text.

**Code fence example**:
```markdown
```javascript
code content without closing fence
```
Scanner detects unterminated fence; parser can auto-close at document end.

### Integration with complex multi-line constructs

**Table parsing integration**:
```typescript
// Parser uses multiple helpers together for table detection
const column = scanner.getColumn();  // Check alignment
const flags = scanner.getTokenFlags();
if (token === SyntaxKind.PipeToken && (flags & TokenFlags.IsAtLineStart)) {
  // Use lookAhead to check for alignment row
  const isTable = scanner.lookAhead(() => {
    // Scan to next line, check for |-----|-----|
    return detectTableAlignmentRow();
  });
}
```

**Reference definition collection**:
```typescript
// Combine multiple helpers for reference processing
if ((flags & TokenFlags.MaybeDefinition) && 
    (flags & TokenFlags.IsAtLineStart)) {
  const labelText = scanner.getTokenValue();  // Processed label
  // Use tryScan to parse full definition
  const definition = scanner.tryScan(() => {
    return parseReferencDefinitionSyntax();
  });
}
```

These helpers work together to provide the parser with precise, efficient access to the complex contextual information needed for accurate Markdown parsing without expensive rescanning or backtracking.

## HTML policy and internal modes

The scanner enforces an explicit policy that matches the project plan:

- Markdown stays active inside HTML elements by default.
- RAWTEXT elements (`<script>`, `<style>`, plus similar) switch the scanner to a `RawText` mode in which the content is emitted as `HtmlText` and Markdown tokenization is suspended until the matching close tag is found.
- RCDATA elements (`<textarea>`, `<title>`) switch to `Rcdata` mode where entities are active but Markdown is not.
- The scanner exposes `ContainsHtmlBlock` as a *hint*, not a hard switch; parser still decides block-level consequences.

Mode transitions are signalled via flags (`IsInRawText`, `IsInRcdata`) and via internal `rawTextEndTag` / `rcdataEndTag` state. Closing tags are matched case-insensitively.

Edge-case responsibilities:

- The scanner handles raw-text termination and sets `TokenFlags.Unterminated` + emits errors (via `setOnError`) for unterminated constructs.
- The parser still handles structural recovery for mismatched HTML nesting and higher-level autoclosing rules.

## Extended constructs the scanner already surfaces (multi-line syntax coordination)

The scanner detects and annotates several extended constructs that require complex multi-line coordination, providing the parser with pre-processed structural information to avoid expensive pattern matching and backtracking.

### Code fences: Run-length matching and info string processing

**Multi-line fence matching**:
Code fences require precise opening/closing coordination across potentially many lines:

```markdown
```javascript console.log("hello")
function example() {
  console.log("This is inside the fence");
  // ``` this would NOT close the fence (insufficient backticks)
  // ````` this would NOT close the fence (too many backticks)  
}
```                    ← Only exactly 3 backticks close this fence
```

**Scanner responsibilities**:
- **Run-length encoding**: Packs fence length (3, 4, 5+ backticks) into the 6-bit run-length field in `TokenFlags`
- **Info string extraction**: `getTokenValue()` returns trimmed info string ("javascript console.log") for syntax highlighting
- **Closing fence validation**: Only fences with matching or greater run-length can close

**Parser usage pattern**:
```typescript
if (token === SyntaxKind.BacktickToken && (flags & TokenFlags.IsAtLineStart)) {
  const openRunLength = (flags & TokenFlagRunLengthMask) >> TokenFlagRunLengthShift;
  if (openRunLength >= 3) {
    const infoString = scanner.getTokenValue(); // "javascript console.log"
    // Parse fence content until matching close
    const closeRunLength = findClosingFence(openRunLength);
  }
}
```

### Math delimiters: Context-sensitive detection

**Inline vs block math disambiguation**:
Math delimiters require sophisticated heuristics to avoid false positives:

```markdown
$5.00 and $10.99        ← Dollar signs as currency (literal)
The price is $5         ← Trailing dollar (literal)
$E = mc^2$ in physics   ← Inline math (flanked by non-whitespace)
$$                      ← Block math (double dollar at line start)
\int_0^1 x^2 dx
$$
```

**Scanner heuristics implemented**:
- **Currency detection**: Dollar followed by digit → literal currency
- **Inline math**: Single `$` with non-whitespace on both sides → potential math delimiter
- **Block math**: `$$` at line start → block math delimiter
- **Context flags**: `ContainsMath` flag set when math delimiters are detected

**Parser benefits**: No need to re-implement complex math delimiter heuristics; scanner pre-classifies ambiguous dollar signs.

### Frontmatter fences: Document-start coordination

**Multi-line frontmatter blocks**:
Frontmatter requires document-start detection and balanced fence matching:

```markdown
---                     ← Must be at absolute document start
title: "My Document"
author: "John Doe"  
tags: [markdown, parser]
---                     ← Closing fence with same character sequence
# Actual document content starts here
```

**TOML frontmatter variant**:
```markdown
+++                     ← Alternative frontmatter delimiter
title = "TOML Example"
date = 2024-01-01
+++
```

**Scanner coordination**:
- **Document-start detection**: Only `---`/`+++` at absolute position 0 triggers frontmatter mode
- **Balanced fence tracking**: Scanner tracks opening sequence and requires exact match for closing
- **Content preservation**: Frontmatter content preserved as opaque slice for external YAML/TOML parsers

### Table structures: Two-line gating pattern

**Header + alignment row coordination**:
Tables require a specific two-line pattern that the scanner helps coordinate:

```markdown
| Header 1  | Header 2  | Header 3  |    ← Line 1: Header row
|-----------|:---------:|----------:|    ← Line 2: Alignment row (required!)
| Cell 1    | Cell 2    | Cell 3    |    ← Line 3+: Data rows
```

**Critical parsing challenge**: A single pipe-separated line is NOT a table - only the header+alignment pattern creates a table.

**Scanner support**:
- **Pipe tokenization**: All `|` characters tokenized as `PipeToken` regardless of context
- **Position tracking**: `IsAtLineStart` flags enable detection of table-like lines
- **No false table detection**: Scanner does NOT pre-classify tables (parser responsibility)

**Parser coordination pattern**:
```typescript
// Parser sees pipe-separated line
if (isPipeSeparatedLine()) {
  // Use lookAhead to check next line for alignment pattern
  const isTable = scanner.lookAhead(() => {
    skipToNextLine();
    return isTableAlignmentRow(); // |----|:---:|----:|
  });
  
  if (isTable) {
    parseTableStructure();
  } else {
    parseParagraphWithPipes(); // Not a table, just text with pipes
  }
}
```

### Attribute blocks: Brace nesting and positioning

**Complex attribute syntax**:
Attribute blocks can appear after various constructs with nested brace content:

```markdown
# Heading {#custom-id .class1 .class2}
*emphasis*{.highlight style="color: red"}
![image](url){width=500 height=300}
```

**Nested brace handling**:
```markdown
{.class key="value with {nested} braces"}
{style="background: url('data:image/svg+xml;{base64data}')"}
```

**Scanner responsibilities**:
- **Brace nesting**: Track balanced `{` and `}` including nested braces in quoted values
- **Single-line constraint**: Reject multi-line attribute blocks (return empty value)
- **Position validation**: Ensure attributes immediately follow constructs (no intervening whitespace)

**Parser integration**: Scanner provides clean `{...}` tokens with nested content preserved in `getTokenValue()`, enabling parser to focus on attribute parsing logic rather than brace balancing.

### Reference definition hints: Line-start pattern detection

**Reference definition syntax**:
```markdown
[label]: destination "optional title"
[complex label]: <destination> 'title with "quotes"'
[multi-word]: destination
    "title on next line"
```

**Scanner hinting with `MaybeDefinition`**:
- **Quick pattern detection**: `[` at line start followed by `]:` pattern gets `MaybeDefinition` flag
- **False positive tolerance**: Scanner errs on the side of flagging potential definitions
- **Parser validation**: Parser performs full syntax validation and reference collection

**Parser usage**:
```typescript
if ((flags & TokenFlags.MaybeDefinition) && (flags & TokenFlags.IsAtLineStart)) {
  const definition = scanner.tryScan(() => {
    // Full reference definition parsing with title handling
    return parseCompleteReferenceDefinition();
  });
  
  if (definition) {
    collectReferenceDefinition(definition);
  } else {
    // Not actually a definition, parse as normal paragraph
    parseRegularParagraph();
  }
}
```

### Integration pattern: Scanner signals + parser coordination

The common pattern across all extended constructs:

1. **Scanner provides structural hints** via flags and run-length encoding
2. **Parser performs multi-line coordination** using lookahead/tryScan
3. **Complex validation remains in parser** while scanner handles tokenization
4. **Performance optimization** through lazy value extraction and flag-based pre-filtering

This division keeps the scanner fast and allocation-light while enabling the parser to handle Markdown's complex multi-line dependencies efficiently.

## Error diagnosis and emission model

The scanner supports both pull-based and push-based error reporting:

- Pull: `getErrorCode()` / `getErrorMessage()` and `TokenFlags.Unterminated` on tokens.
- Push: optional `setOnError((start,end,code,message)=>void)` callback for immediate diagnostics.

Speculation semantics:

- `lookAhead`: suppress and discard speculative errors.
- `tryScan`: buffer errors during trial, commit them only if the trial succeeds.

Emitted errors are de-duplicated by `(start,end,code)` and `setText()` resets emission history.

## Performance and memory discipline

Design principles implemented in the scanner:

- Character-code driven decisions: no substring allocations in hot scan paths.
- Lazy materialization: `getTokenText()` / `getTokenValue()` slice only on demand; the scanner stores `valueStart/valueEnd` offsets instead of eager strings.
- Flag packing: many boolean/small integer fields are OR'ed into `TokenFlags` (including a 6-bit run-length field) to avoid per-token objects.
- Lookahead and rescans implemented by saving/restoring indices rather than copying state objects.

These practices keep scanning O(n) with minimal allocations and predictable GC behavior — important if you move more responsibilities into the scanner, because each responsibility addition must preserve this discipline.

## Strategic assessment & recommendations (complexity-aware responsibility shifts)

The scanner already exposes a sophisticated "language" optimized for Markdown's complex multi-line dependencies and disambiguation challenges. Before shifting structural responsibilities from parser to scanner, consider how this would affect the handling of Markdown's most complex syntactic patterns.

### Current architecture strengths for complex syntax

**Multi-line construct handling**:
The current scanner-parser split handles Markdown's line-to-line dependencies efficiently:

1. **Scanner provides positional signals** (`IsAtLineStart`, `IsBlankLine`, run-lengths) without maintaining multi-line state
2. **Parser coordinates multi-line patterns** (Setext headings, tables, code fences) using lookahead primitives
3. **Incremental parsing benefits** from stateless scanner that can restart at any line boundary

**Example: Setext heading complexity**:
```markdown
This looks like a heading
=========================    ← Only this line determines if above is heading
But this breaks it
=========================    ← Now neither line is a heading (paragraph + rule)
```
Moving this logic to scanner would require maintaining paragraph context and complicating incremental reparsing.

### Specific complex constructs and responsibility considerations

**Table detection complexity**:
```markdown
| Not a table |           ← Single line with pipes (paragraph)
| Header | Col |           ← Looks like table...
| But no alignment row     ← ...but isn't (paragraph + paragraph)

| Real | Table |           ← Table start
|------|-------|           ← Alignment row confirms table
| Data | Cell  |           ← Now previous lines become table
```

**Current approach**: Scanner emits `PipeToken`, parser uses `lookAhead()` for two-line detection
**If moved to scanner**: Would require lookahead state and complicate scanner significantly
**Recommendation**: Keep in parser - the lookahead primitive already makes this efficient

**Emphasis delimiter complexity**:
```markdown
*asterisk* and _underscore_     ← Standard emphasis
word*no*spaces vs word *yes* spaces ← Flanking rules
snake_case_variables ← Intraword underscores blocked
__**nested emphasis**__ ← Multiple delimiter types
```

**Current approach**: Scanner provides `CanOpen/CanClose` flags, parser manages delimiter stack
**Strength**: Flags already encode micromark flanking rules precisely
**Recommendation**: Current approach is optimal - scanner signals are comprehensive

**Reference link complexity**:
```markdown
[link text][ref]                ← Reference form
[link text](direct-url)         ← Direct form  
[link text]                     ← Implicit reference (label as ref)
[]: url                         ← Empty label definition
[partial]: url
  "title on next line"          ← Multi-line title

[link to #section](#section)    ← Internal reference
[link to external][external]    ← May resolve later in document
```

**Current approach**: Scanner flags `MaybeDefinition`, parser handles full syntax and resolution
**If moved to scanner**: Would require multi-line parsing and reference table management
**Recommendation**: Keep in parser - reference resolution requires document-wide context

### Targeted enhancements vs major shifts

**Small wins with focused helpers**:

1. **Add `isSetextUnderlineAhead()` helper**:
```typescript
// Scanner addition - pure lookahead function
isSetextUnderlineAhead(): boolean {
  return this.lookAhead(() => {
    this.scan(); // skip newline
    const token = this.getToken();
    return (token === SyntaxKind.EqualsToken || token === SyntaxKind.DashToken) &&
           (this.getTokenFlags() & TokenFlags.IsAtLineStart) &&
           this.isUnderlineSequence();
  });
}
```
**Benefit**: Simplifies parser Setext detection without complicating scanner state

2. **Add `isTableAlignmentRowAhead()` helper**:
```typescript
isTableAlignmentRowAhead(): boolean {
  return this.lookAhead(() => {
    this.skipToNextLine();
    return this.detectTableAlignmentPattern(); // |----|:---:|----:|
  });
}
```
**Benefit**: Encapsulates table detection logic without moving table parsing to scanner

3. **Enhance `getTokenValue()` documentation**:
Clarify exactly what gets returned for fences, autolinks, entities to reduce parser guesswork

**Avoid these major shifts**:

1. **Don't move delimiter stack to scanner**: The current flag-based approach is more efficient and incremental-friendly than maintaining emphasis state in scanner

2. **Don't move multi-line constructs to scanner**: Setext headings, tables, reference definitions require document context better handled by parser

3. **Don't move nesting logic to scanner**: List nesting, HTML element autoclosing, blockquote levels require structural context

### Performance-preserving guidelines for any changes

**If adding scanner responsibilities**:

1. **Maintain character-code discipline**: All new scanner logic must use `charCodeAt()` decisions, no string operations in hot paths

2. **Preserve lazy materialization**: New features should use offset ranges and slice only when accessed via `getTokenValue()`

3. **Keep flag-packing efficient**: New metadata should pack into existing `TokenFlags` or use minimal additional fields

4. **Avoid state accumulation**: New scanner features should be stateless or use minimal, easily-resettable state

**Incremental parsing compatibility**:
- Scanner changes must not require maintaining context across distant line boundaries  
- Any new scanner state must be easily invalidated and reconstructed for incremental reparsing
- Complex multi-line patterns should remain parser responsibility to preserve incremental reuse

### Recommended evolution path

**Phase 1**: Add focused lookahead helpers (`isSetextUnderlineAhead`, `isTableAlignmentRowAhead`) without changing core scanner architecture

**Phase 2**: Enhance existing flag utilization in parser - ensure all 24 flags are being used to their full potential

**Phase 3**: Consider small value-processing enhancements (entity decoding utility, enhanced `getTokenValue()` semantics) without moving structural logic

**Phase 4**: Evaluate results and measure performance gains before considering larger architectural changes

The current scanner-parser interface is already well-optimized for Markdown's complexity. Focused enhancements will provide better returns than major responsibility shifts that could compromise the architecture's performance and maintainability strengths.

## Where to read the implementation
- Primary scanner implementation: `parser/scanner.ts`
- Token and flag definitions: `parser/token-types.ts`
- Parser consumption examples: `parser/parser.ts` and `parser/parser-utils.ts`
- Tests that illustrate scanner-parsing interactions: `parser/tests/*` (many scanner tests reference the exact flags/values the parser expects)

## Requirements coverage

- All items in the user's request have been implemented in this file: summary of the scanner "language", tokens, flags, rescans, helper methods, modes, diagnostics, performance patterns, and recommendations. (Done)

---

This document is intentionally implementation-focused so it can be used as a direct reference for changing where responsibilities live. If you want, I can:

- Add a short matrix showing which parser behaviors would require additional scanner signals to move (e.g., Setext detection, table gating), or
- Implement a small, well-scoped lookahead helper on `scanner.ts` and corresponding tests to demonstrate safe responsibility shifts.

