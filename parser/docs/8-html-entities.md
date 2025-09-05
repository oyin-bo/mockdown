# Stage 4: Entities and HTML Implementation Plan

## Architecture Overview

### Scope and Boundaries

**In Scope for Stage 4:**
- HTML character entities: named (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;`) and numeric (`&#65;`, `&#x41;`)
- HTML tag parsing: opening tags (`<div>`), closing tags (`</div>`), self-closing (`<br/>`)
- HTML attribute parsing: names (including namespaced `prefix:name`), values (quoted/unquoted), boolean attributes
- Content mode transitions: RawText (`<script>`, `<style>`) and RCData (`<textarea>`, `<title>`)
- HTML block detection and contextual flags
- XML-like constructs: CDATA sections (`<![CDATA[...]]>`) and Processing Instructions (`<?...?>`)

**Out of Scope:**
- DOCTYPE declarations (Stage 11)
- Complex HTML validation (malformed tags are lexical tokens, not errors)
- Full HTML entity table (beyond the curated Stage 4 set) — but NOTE: the curated set *is* decoded inline for performance.
- Link/image parsing (Stage 10)
- Advanced HTML features (custom elements, etc.)

**Strict Boundaries:**
- Scanner ONLY tokenizes - does NOT validate HTML semantics
- No string concatenation during scanning (zero-allocation principle)
- Entity recognition but NOT entity decoding in scanner
- HTML tag recognition but NOT DOM structure validation

## New Token Types (Definitive List for Stage 4)

Stage 4 introduces a focused, minimal, but sufficient set of HTML / entity token kinds for the new scanner architecture. This list replaces earlier drafts that mentioned "11" tokens (the real, required set here is 15). Only these are introduced in Stage 4 (later stages may extend it; DOCTYPE and broader punctuation re-introductions are deferred).

```typescript
// HTML Structural Delimiters
LessThanToken,              // <
LessThanSlashToken,         // </
GreaterThanToken,           // >
SlashGreaterThanToken,      // /> (recognized as a single token after a tag/attribute sequence)
EqualsToken,                // = (only meaningful inside tag attribute context)
AmpersandToken,             // & (when not forming a valid entity)

// HTML Name / Value Tokens
HtmlTagName,                // Tag name (case-preserving slice). Examples: div, script, textarea
HtmlAttributeName,          // Attribute name (data-id, aria-label, xml:lang, etc.)
HtmlAttributeValue,         // Quoted or unquoted attribute value (raw slice, quotes included for quoted)
HtmlEntity,                 // Complete named or numeric entity WITH terminating ';'

// HTML Aggregate / Content Tokens
HtmlComment,                // <!-- ... --> (full span)
HtmlCdata,                  // <![CDATA[ ... ]]> (full span)
HtmlProcessingInstruction,  // <? ... ?> (full span)
HtmlRawText,                // Content inside <script>/<style> (no entity scanning)
HtmlRCDataText,             // Content inside <textarea>/<title> (entity scanning active)
```

Excluded in Stage 4 (explicit): ExclamationToken, QuestionToken, Doctype-related tokens, generic Identifier. Constructs needing those are either represented as aggregate tokens (e.g. `HtmlComment`) or deferred.

### End-Tag Matching Performance Strategy (Chosen)
We adopt a zero-allocation, direct comparison strategy for closing tag detection in RawText/RCData:
- Store lowercased opening tag name length and source slice start.
- When encountering `<` inside a special content mode, attempt: `<` + `/` + case-insensitive match of stored name + `>`.
- No concatenated closing pattern string allocated. This minimizes GC churn under many small script/style blocks and aids incremental rescans (only primitives stored).
- Fast path ASCII fold: `code | 0x20` used for A–Z normalization; abort on first mismatch.
- Only on success does the scanner exit mode; otherwise treat `<` as part of raw content (RawText) or begin normal tag scanning (RCData) per HTML rules.

Rationale: High locality, eliminates per-block pattern allocations, predictable worst-case O(n) scan with minimal branching.

## Performance Optimizations

### Zero-Allocation Patterns

1. **Pre-computed HTML tag sets**: Use `Set<string>` for block tags, RawText tags, RCData tags
2. **Character-based entity scanning**: Fast-path for `&` character without string creation
3. **Cached token text**: Common HTML tokens (`<`, `>`, `</`, `/>`) in TokenTextCache
4. **Single-pass tag scanning**: Determine tag type while scanning name characters
5. **Bit-flag content modes**: Avoid string mode comparisons, use numeric flags

### Scanner State Optimization

```typescript
// Extend ContentMode enum (already exists)
const enum ContentMode {
  Normal = 0,                    // Regular Markdown tokenization
  RawText = 1,                   // Literal text until end tag (<script>, <style>)
  RCData = 2,                    // Text with entities until end tag (<textarea>, <title>)
  HtmlComment = 3,               // Inside <!-- --> comment
}

// Add HTML-specific context flags
const enum HtmlContextFlags {
  InOpenTag = 1 << 0,            // 0x01 - Inside <tag attributes>
  InCloseTag = 1 << 1,           // 0x02 - Inside </tag>
  ExpectingAttribute = 1 << 2,   // 0x04 - After tag name, expecting attributes
  InAttributeValue = 1 << 3,     // 0x08 - Inside quoted attribute value
}
```

### Fast-Path Entity Recognition (Strict Semicolon Requirement)

```typescript
// Pre-computed entity validation (no allocation during scanning)
const NAMED_ENTITIES = new Set(['amp', 'lt', 'gt', 'quot', 'apos', 'nbsp']);

function isValidEntityName(name: string): boolean {
  return NAMED_ENTITIES.has(name); // O(1) lookup
}
```

## Implementation Tasks

### Task 1: Token Type Foundation
**Objective**: Add Stage 4 token kinds and update testing infrastructure.

**Concrete Steps**:
1. Add the 15 token kinds listed above to the canonical `SyntaxKind` for Scanner2.
2. Update any shadow / reflection enum used by verification utilities (e.g. `SyntaxKindShadow` in `verify-tokens.ts`).
3. Add `TokenTextCache` (or equivalent) entries for: `<`, `</`, `>`, `/>`, `=`, `&` (singletons reused by reference, no re-allocation).
4. Introduce no new TokenFlags unless strictly necessary. Re‑use existing rollback mask layout; add new rollback *types* (not new flag bits) for HTML boundaries (see Rollback section).

**Success Criteria**:
- All new tokens compile and are recognized by testing infrastructure
- TokenTextCache properly handles single-character HTML tokens
- verify-tokens can parse and validate new token types

**Avoid**: Re-introducing broader punctuation tokens at this stage
**Special Attention**: Ensure TokenTextCache uses canonical string references (pointer equality) and never concatenates new strings for structural tokens.

**Completion Checklist**:
- [ ] 15 new SyntaxKind entries added in correct order.
- [ ] Tests referencing only these HTML tokens pass enum lookup.
- [ ] TokenTextCache returns identical references for `<`, `</`, `>`, `/>`, `=`, `&` across emissions.
- [ ] No new TokenFlags bits introduced (only rollback type values extended).
- [ ] verify-tokens utility updated without missing mappings.

### Task 2: Basic HTML Tag Scanning
**Objective**: Implement `<tag>` and `</tag>` recognition with separate tag name tokens

**Concrete Steps**:
1. Add `scanLessThan()` function with tag detection logic
2. Implement `scanHtmlTagName()` with character-based validation
3. Add `scanGreaterThan()` with context-aware token emission
4. Handle self-closing tags (`/>`) as single token

**Implementation Guidelines (Updated)**:
```typescript
function scanLessThan(start: number): void {
  // Minimal lookahead via direct charCode reads (no substring allocation)
  const c1 = pos + 1 < end ? source.charCodeAt(pos + 1) : -1;
  if (c1 === CharacterCodes.slash) {
    emitToken(SyntaxKind.LessThanSlashToken, start, start + 2);
    pos += 2; // position now at first tag name char (or end)
    return;
  }

  // Detect comment start <!--
  if (c1 === CharacterCodes.exclamation && matchSequence(pos, '<!--')) {
    scanHtmlComment(start); // Emits HtmlComment token directly
    return;
  }
  // Detect CDATA <![CDATA[
  if (c1 === CharacterCodes.exclamation && matchSequence(pos, '<![CDATA[')) {
    scanHtmlCdata(start); // Emits HtmlCdata token
    return;
  }
  // Detect processing instruction <? ... ?>
  if (c1 === CharacterCodes.question) {
    scanHtmlProcessingInstruction(start); // Emits HtmlProcessingInstruction
    return;
  }

  emitToken(SyntaxKind.LessThanToken, start, start + 1);
  pos += 1;
}
```

**Success Criteria**:
- Tags like `<div>`, `</div>`, `<br/>` are tokenized correctly
- Tag names are separate tokens: `<` `div` `>`
- Self-closing tags emit `SlashGreaterThanToken`

**Avoid**: 
- Complex lookahead - use character-based scanning only
- String creation during tag name validation
- Trying to validate HTML semantics

**Special Attention (Updated)**:
- Tag name recognition (Stage 4) accepts: `[A-Za-z][A-Za-z0-9-]*` (custom element dashed forms allowed but no validation enforced). A colon (`:`) is NOT accepted in tag names at this stage (namespaced tags deferred) but is allowed later within attribute names.
- Case-insensitive comparisons for mode / block classification; original casing preserved in token slice.
- Malformed starts (e.g. `<1abc`, `<>`) emit `<` as `LessThanToken` then fallback to regular text (no `HtmlTagName`).

**Completion Checklist**:
- [ ] `scanLessThan` emits correct delimiter tokens without substring allocations.
- [ ] Tag names sliced once; no interim string building.
- [ ] Self-closing sequences produce `SlashGreaterThanToken` only after confirming preceding tag context.
- [ ] Malformed `<1abc>` produces `LessThanToken` + subsequent text tokens (no crash).
- [ ] Rollback type `HtmlTagBoundary` (5) set after each completed open or self-closing tag.

### Task 3: HTML Attribute Parsing
**Objective**: Parse HTML attributes with separate tokens for names, values, and equals

**Concrete Steps**:
1. Extend tag scanning to handle attribute context
2. Implement `scanHtmlAttributeName()` with character validation
3. Add `scanHtmlAttributeValue()` for quoted and unquoted values
4. Handle boolean attributes (attributes without values)

**Implementation Guidelines**:
```typescript
function scanHtmlAttributes(): void {
  // After tag name, scan for attributes until >
  while (pos < end && source.charCodeAt(pos) !== CharacterCodes.greaterThan) {
    scanWhitespace(); // Skip whitespace
    
    if (isAttributeNameStart(source.charCodeAt(pos))) {
      scanHtmlAttributeName();
      scanWhitespace();
      
      if (pos < end && source.charCodeAt(pos) === CharacterCodes.equals) {
        emitToken(SyntaxKind.EqualsToken, pos, pos + 1);
        pos++;
        scanWhitespace();
        scanHtmlAttributeValue();
      }
      // Else: boolean attribute (no value)
    }
  }
}
```

**Success Criteria**:
- Attributes parsed as separate tokens: `class` `=` `"value"`
- Boolean attributes handled: `disabled` (no equals or value)
- Quoted and unquoted attribute values supported
- Malformed attributes don't crash scanner

**Avoid**:
- Validating attribute value content (URLs, etc.)
- Complex attribute value parsing (leave that to parser)
- Allocating strings for attribute validation

**Attribute Lexical Rules (Definitive)**:
- Attribute name start: any ASCII letter `[A-Za-z]`, colon `:`, underscore `_`, `@`, or `data-` / `aria-` pattern first letter (no special-case logic needed—general rule covers). (We accept broader start set mirroring de‑facto HTML usage.)
- Name continue characters: ASCII letters, digits, hyphen `-`, underscore `_`, period `.`, colon `:`, plus any additional characters up to but not including the forbidden set.
- Forbidden characters in names (terminate name): whitespace, `"`, `'`, `>`, `/`, `=`, `` ` ``.
- A boolean attribute is recognized when a valid name is followed immediately by a delimiter (whitespace, `/>`, or `>`). No value token is emitted.
- After a name, if `=` appears, whitespace around `=` is allowed (scanner should emit a distinct `EqualsToken` covering just the `=`). Then an attribute value MUST follow (quoted or unquoted) unless malformed.
- Quoted value: begins with `"` or `'`, ends at the matching quote. Newlines inside are allowed; if EOF or `>` encountered before closing quote, emit `HtmlAttributeValue` with Unterminated flag (no re-scanning). Backslashes are literal (HTML does not define backslash escapes — do NOT unescape).
- Unquoted value: read a run of characters until one of: whitespace, `>`, `/>` boundary (when next char is `/` and following `>`), or one of the disallowed characters `"'<=` `` ` ``. The `<` character inside an unquoted value terminates the value (HTML forbids `<` there). If the run length is zero (e.g. `<div a=>`), no value token is emitted (malformed attribute) and scanning resumes; optionally record an error.
- Attribute value token text includes surrounding quotes only for quoted values.

**Malformed Handling Examples** (all non-fatal):
- `<div a=>`   → name(a), EqualsToken, (missing value) recover before `>`
- `<div a="unterminated>` → value token with Unterminated flag up to `>`
- `<div a=">">` → first value ends at second `"`, next `>` closes tag; inner `>` not special inside quotes.

**Completion Checklist**:
- [ ] Attribute name scanner enforces start/continue sets; terminates on forbidden chars.
- [ ] Boolean attributes produce only `HtmlAttributeName` (no phantom value token).
- [ ] Quoted values retain quotes in token text; Unterminated flagged if missing closing quote at `>` or EOF.
- [ ] Unquoted values terminate correctly on whitespace, `>`, `/`, `<`, `=`, quotes, or backtick.
- [ ] Malformed `a=` without value does not emit `HtmlAttributeValue` and records diagnostic.
- [ ] No extra allocations beyond slicing source.

### Task 4: HTML Entity Recognition (Strict)
**Objective**: Implement entity scanning for named and numeric entities

**Concrete Steps**:
1. Add `scanAmpersand()` function with entity validation
2. Implement named entity recognition (`&amp;`, `&lt;`, etc.)
3. Add numeric entity recognition (`&#65;`, `&#x41;`)
4. Handle invalid entities (fallback to `&` + text)

**Implementation Guidelines (Updated)**:
```typescript
function scanAmpersand(start: number): void {
  // Named or numeric entities MUST terminate with ';' to be recognized.
  // Strategy: probe character-by-character without substring allocation.
  const after = start + 1;
  if (after < end && source.charCodeAt(after) === CharacterCodes.hash) {
    if (scanNumericEntity(start)) return; // Emits HtmlEntity or falls through
  } else if (scanNamedEntity(start)) {
    return; // Emits HtmlEntity
  }
  emitToken(SyntaxKind.AmpersandToken, start, start + 1); // Bare '&'
}
```

**Success Criteria**:
- Named entities: `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;`, `&nbsp;`
- Numeric entities: `&#65;`, `&#x41;` (decimal and hex)
- Invalid entities fall back to separate tokens: `&` `invalid`
- Entity scanning stops at `;` or invalid characters

**Avoid**:
- Entity decoding in scanner (emit raw entity text)
- Supporting non-standard entities
- Complex entity validation beyond basic syntax

**Special Attention (Updated)**:
- Semicolon required (`&amp;` OK, `&amp` NOT recognized → `AmpersandToken` + following text as ordinary content).
- Named entity validation limited to curated set in Stage 4: `amp, lt, gt, quot, apos, nbsp` (extensible later). Name length cap: 32. Names longer than cap or containing invalid chars abort recognition.
- Numeric entity forms: `&#DDDD;` (decimal, at least one digit) and `&#xHHHH;` / `&#XHHHH;` (hex, at least one hex digit). Digit length soft cap: 8 (beyond that treat as invalid to avoid pathological scanning).
- Failure to find terminating `;` before encountering whitespace, `<`, `>`, `&`, or EOF aborts recognition.
- No decoding performed; raw slice is stored.

**Completion Checklist**:
- [ ] Bare `&` yields `AmpersandToken`.
- [ ] `&amp;` etc. yield `HtmlEntity`; `&amp` yields `AmpersandToken` followed by normal text.
- [ ] Invalid numeric (`&#;`, `&#x;`, `&#x1G;`) revert to `AmpersandToken`.
- [ ] Max length rules enforced for named (32) and numeric digits (8) without allocation spikes.
- [ ] Rollback type `HtmlEntityComplete` (6) set after valid entity.
- [ ] No partial entity token ever emitted (all-or-nothing behavior).

Entity extension & always-inline (commit-time) decoding strategy (future stages):

- Stage 4 curated set (`amp, lt, gt, quot, apos, nbsp`) is *recognized* during speculative scanning without allocating a decoded string; the actual decoded Unicode string is materialized only when the token is **committed** (yield boundary) to the consumer.
- Token invariant at commit: for `HtmlEntity` tokens, `tokenText` is the decoded, consumer-ready Unicode (not the source lexeme). During speculative phase a provisional record holds: kind, start, end, classification (named / numeric), and either (a) a small integer codepoint or (b) a short array (max length 2 for surrogate pair, future multi-codepoint path allowed) — no string yet.
- Original source span is always recoverable (start/end). If tooling needs the raw lexeme (`&name;`), it can lazily substring at that later point; this is uncommon in performance-critical paths.
- Future full entity table: all recognized entities (including multi-codepoint expansions) still decode at commit-time. A pre-built immutable table (perfect hash or minimal trie -> index) plus a parallel array of interned decoded strings guarantees O(1) pointer assignment on commit.
- Table design: (1) Perfect-hash/minimal trie for name -> small index; (2) array of canonical decoded strings; (3) fast negative path: abort on invalid char, length cap, or missing semicolon before any allocation.
- Numeric entities: decimal / hex parsed into integer codepoint during speculative recognition (no string). Validation (range, surrogate) runs before commit; invalid → fallback emit `AmpersandToken` + downstream text path. Valid → single codepoint cached string chosen at commit.
- Diagnostics: recorded immediately (speculative) with code + span, independent of whether token later rolls back.
- Regression tests must assert: (a) no string allocations occur for entities that are rescanned/rolled back; (b) boundary positions unchanged with or without rollback; (c) pointer stability for common entity decoded strings across multiple emissions.

## Speculative Scanning & Commit-Time Materialization

Some constructs (e.g. lines that might later be reinterpreted as Setext headings or blocks that influence paragraph boundaries) require **speculative scanning** before structural confirmation. To preserve peak performance and avoid wasted allocations:

1. Provisional Phase:
  - Scanner identifies potential tokens (including entities) and records lightweight metadata (start, end, classification, numeric codepoint(s)).
  - No `tokenText` strings for entities (or other transform-bearing tokens) are created yet.
  - Structural delimiter tokens that are guaranteed (e.g. raw `<`, line breaks) may still use cached constant strings.
2. Commit Boundary:
  - Occurs when the higher-level driver (or the scanner itself under simple mode) confirms that preceding tokens cannot be invalidated by upcoming context (e.g., end of line when the next line does not form a Setext underline, closing of a raw text mode, safe rollback point recorded).
  - At this moment, each provisional entity is materialized: lookup (or direct map) converts stored codepoint(s) into interned string(s), assigned to `tokenText`.
3. Rollback Handling:
  - If a rollback occurs before commit, provisional entity metadata is discarded with zero string churn.
  - Rollback-safe markers (`HtmlTagBoundary`, `HtmlEntityComplete` provisional form, `ContentModeBoundary`) encode where recomputation can safely fast-path.
4. Lazy On-Demand (Optional Extension):
  - If future profiling shows commit-time decoding still yields avoidable work, an additional layer can lazily materialize only on first access to `tokenText`. (Stage 4 mandates commit-time decoding; lazy mode is an opt-in optimization path.)

Implementation Notes:
- Maintain a small ring buffer / array for provisional tokens for the current line or block region.
- Provide a `commitProvisionalTokens()` function invoked at line-finalization or mode switches.
- Ensure numeric parsing writes a sentinel (e.g., `codepoint = -1`) for invalid numeric entities so the commit step can cheaply decide fallback without reparsing.
- Use a pre-cached map for single-codepoint entities (`&amp;` -> '&') to assign references without constructing new strings.

Testing Additions:
- Add a stress test where lines with entities are alternately reclassified as Setext headings to confirm entity string allocations count matches number of final committed entities only.
- Track allocation counts (if instrumentation available) or surrogate counters to assert zero provisional string creations.

### Task 5: Content Mode Transitions
**Objective**: Implement RawText and RCData content modes for specific HTML tags

**Concrete Steps**:
1. Define HTML tag categorization (block, RawText, RCData)
2. Implement content mode transitions on tag recognition
3. Add mode-specific scanning functions
4. Handle content mode termination on closing tags

**Implementation Guidelines (Updated)**:
```typescript
const RAW_TEXT_TAGS = new Set(['script', 'style']);
const RCDATA_TAGS = new Set(['textarea', 'title']);
const BLOCK_TAGS = new Set(['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', /* ... */]);

function handleTagModeTransition(tagName: string): void {
  const lowerTagName = tagName.toLowerCase();
  // Transition is applied ONLY *after* emitting the matching 'GreaterThanToken'
  // for the opening tag to keep structural tokens consistent.
  if (RAW_TEXT_TAGS.has(lowerTagName)) {
    enterRawTextMode(lowerTagName); // store lowerTagName for closing match (no string concat)
  } else if (RCDATA_TAGS.has(lowerTagName)) {
    enterRCDataMode(lowerTagName);
  }

  if (BLOCK_TAGS.has(lowerTagName)) {
    // Set HTML block flag for all subsequent tokens
    contextFlags |= ContextFlags.HtmlBlockActive;
  }
}
```

**Success Criteria**:
- `<script>` content scanned as RawText until `</script>`
- `<textarea>` content scanned as RCData until `</textarea>`
- Block-level tags set appropriate context flags
- Content mode resets properly on closing tag

**Avoid**:
- Case-sensitive tag comparisons
- Complex tag nesting validation
- Memory allocation for end pattern storage

**Special Attention (Updated)**:
- Mode start: after emitting the `GreaterThanToken` of the opening tag.
- Mode end: recognized when scanning a `<` that begins a case-insensitive closing tag sequence matching the stored opening tag name (no pre-built end string; compare char-by-char).
- RawText mode suppresses entity scanning entirely; RCData mode permits entity scanning inside content tokens.
- If closing tag not found before EOF, remaining content is one `HtmlRawText` or `HtmlRCDataText` token (with optional Unterminated flag noted for diagnostics) and scanning resumes in Normal mode at EOF.

Content-mode edge-case examples and guidance:

- Nested-like sequences: `<script>var x = "<script>";</script>` — treat the inner `<script>` as literal text; only a case-insensitive `</script>` matching the stored opening name terminates RawText.
- Partial-close/no-match: In RawText, when scanning a `<` followed by `/` and then a name that does not match the stored tag, the entire sequence should be treated as RawText (no mode exit) and scanning continues without allocations or backtracking.
- EOF during mode: If EOF occurs before the matching closing tag, emit a single `HtmlRawText`/`HtmlRCDataText` token with an Unterminated diagnostic; do not attempt partial rescans that re-enter normal scanning mid-token.

**Completion Checklist**:
- [ ] Enter RawText/RCData only after final `>` of opening tag.
- [ ] Entity scanning disabled in RawText, enabled in RCData (verified by `<script>&amp;</script>` test).
- [ ] Closing tag detection uses char-by-char match (case-insensitive) without pattern allocation.
- [ ] Unterminated raw content sets diagnostic + single content token.
- [ ] Rollback type `ContentModeBoundary` (7) emitted both on entry and successful exit.

### Task 6: HTML Comments
**Objective**: Implement HTML comment scanning (`<!-- -->`)

**Concrete Steps**:
1. Add comment detection in `scanLessThan()`
2. Implement `scanHtmlComment()` function
3. Handle comment end detection (`-->`)
4. Add proper error handling for unterminated comments

**Success Criteria**:
- Comments like `<!-- text -->` emit single HtmlComment token
- Nested `<!--` inside comments handled correctly
- Unterminated comments set appropriate flags
- Comments can span multiple lines

**Avoid**: Parsing comment content structure
**Special Attention**: Comments can contain `<` and `>` characters

**Completion Checklist**:
- [ ] `<!--a-->` emits one `HtmlComment` token.
- [ ] `<!-- a <!-- b -->` treated as single token until first terminating `-->`.
- [ ] Unterminated comment at EOF sets Unterminated flag and diagnostic.
- [ ] No entity scanning or tag scanning inside comment.
- [ ] No substring allocations beyond final slice.

### Task 7: XML-like Construct Scanning
**Objective**: Implement scanning for CDATA sections and Processing Instructions

**Concrete Steps**:
1. Add `HtmlCdata` and `HtmlProcessingInstruction` to `SyntaxKind`
2. Extend `scanLessThan()` to detect `<![CDATA[` and `<?`
3. Implement `scanHtmlCdata()` to scan until `]]>`
4. Implement `scanProcessingInstruction()` to scan until `?>`
5. Add tests for both constructs

**Success Criteria**:
- `<![CDATA[...]]>` emits a single `HtmlCdata` token (no nested parsing).
- `<?...?>` emits a single `HtmlProcessingInstruction` token.
- Content inside these constructs is treated as raw text (entities NOT interpreted).
- Unterminated constructs (missing `]]>` or `?>`) produce a single token with Unterminated flag.

**Completion Checklist**:
- [ ] Proper detection of `<![CDATA[` only when full prefix matches.
- [ ] `<![CDATA[` without closing `]]>` → Unterminated flagged.
- [ ] `<?xml?>` produces single `HtmlProcessingInstruction`.
- [ ] No entity recognition inside these tokens.
- [ ] Diagnostics recorded without intermediate string allocations.

**Avoid**: Parsing the content of PIs or CDATA sections
**Special Attention**: These constructs are less common in standard Markdown but crucial for embedded XML/SVG. Their presence should not disrupt standard HTML/Markdown parsing.

## Testing Strategy

### Fine-grained Unit Tests

Create separate test files for each component with verify-tokens:

#### Test File 1: `test-html-tags.ts`
```typescript
const tagTests = `
<div>
1 2 3
@1 LessThanToken
@2 HtmlTagName "div"  
@3 GreaterThanToken

</span>
1  2   3
@1 LessThanSlashToken
@2 HtmlTagName "span"
@3 GreaterThanToken

<br/>
1 2 3
@1 LessThanToken
@2 HtmlTagName "br"
@3 SlashGreaterThanToken

<x-custom-el>
1 2 3
@1 LessThanToken
@2 HtmlTagName "x-custom-el"
@3 GreaterThanToken

<1bad>
1 2
@1 LessThanToken
@2 StringLiteral "1bad>"  // falls back to text (invalid tag start)
`;
```

#### Test File 2: `test-html-attributes.ts`
```typescript
const attrTests = `
<div class="value">
1   2    3 4     5
@1 LessThanToken
@2 HtmlTagName "div"
@3 HtmlAttributeName "class"
@4 EqualsToken
@5 HtmlAttributeValue "\"value\""

<input disabled checked>
1     2       3      4
@1 LessThanToken
@2 HtmlTagName "input"
@3 HtmlAttributeName "disabled"
@4 HtmlAttributeName "checked"

<div data-user_id=abc-123 aria-label='Main &amp; Secondary'>
1   2            3 4     5        6          7
@1 LessThanToken
@2 HtmlTagName "div"
@3 HtmlAttributeName "data-user_id"
@4 EqualsToken
@5 HtmlAttributeValue "abc-123"
@6 HtmlAttributeName "aria-label"
@7 HtmlAttributeValue "'Main &amp; Secondary'"

<div a=>
1 2 3
@1 LessThanToken
@2 HtmlTagName "div"
@3 HtmlAttributeName "a"  // malformed missing value after '='

<div a="unterminated>
1 2 3 4
@1 LessThanToken
@2 HtmlTagName "div"
@3 HtmlAttributeName "a"
@4 HtmlAttributeValue "\"unterminated>" // Unterminated flag expected
`;
```

#### Test File 3: `test-html-entities.ts`
```typescript
const entityTests = `
&amp; &lt; &#65; &#x41;
1    2    3     4
@1 HtmlEntity "&amp;"
@2 HtmlEntity "&lt;"
@3 HtmlEntity "&#65;"
@4 HtmlEntity "&#x41;"

&invalid &amp &#; &#x; &#x1G;
1        2   3  4   5
@1 AmpersandToken "&" // '&invalid' not recognized
@2 AmpersandToken "&" // '&amp' missing semicolon
@3 AmpersandToken "&" // '&#;' invalid numeric
@4 AmpersandToken "&" // '&#x;' invalid hex numeric
@5 AmpersandToken "&" // '&#x1G;' invalid hex digit G
`;
```

#### Test File 4: `test-content-modes.ts`
```typescript
const contentModeTests = `
<script>var x = "<test>";</script>
1      2                 3
@1 LessThanToken
@2 HtmlTagName "script"
@3 HtmlRawText "var x = \"<test>\";"

<textarea>&amp; text</textarea>
1        2          3
@1 LessThanToken
@2 HtmlTagName "textarea"
@3 HtmlRCDataText "&amp; text"

<style>body { color: red; }</style>
1     2                         3
@1 LessThanToken
@2 HtmlTagName "style"
@3 HtmlRawText "body { color: red; }"
`;
```

#### Test File 5: `test-xml-constructs.ts`
```typescript
const xmlTests = `
<![CDATA[ var x = "<test>"; ]]>
1
@1 HtmlCdata "<![CDATA[ var x = \"<test>\"; ]]>"

<?xml version="1.0"?>
1
@1 HtmlProcessingInstruction "<?xml version=\"1.0\"?>"

<![CDATA[ unterminated...
1
@1 HtmlCdata "<![CDATA[ unterminated..." // Unterminated flag expected
`;
```

### Integration Tests

#### Complex HTML Structure Test (Adjusted: DOCTYPE Out of Scope)
```typescript
const complexHtmlTest = `
<html>
<head>
  <title>Test &amp; Examples</title>
  <style>
    body { margin: 0; }
  </style>
</head>
<body class="main" data-test='value'>
  <h1>Heading with *emphasis*</h1>
  <p>Paragraph with <strong>bold</strong> text.</p>
  <script>
    console.log("Hello <world>");
  </script>
  <!-- This is a comment -->
  <div id="test">
    <input type="text" value="default" disabled/>
  </div>
</body>
</html>

// (Token expectation abbreviated — focus on mode transitions, entities, attributes, boolean attrs, self-closing input)
`;
```

### Combination & Edge Case Testing

Test combinations that could be problematic:

1. **HTML + Markdown**: `<em>*italic*</em>` - ensure both are tokenized
2. **Entities in attributes**: `<div title="Tom &amp; Jerry">` 
3. **Malformed HTML**: `<div class=unclosed>`, `<>`, `</>`, `<div a="unterminated>`
4. **Nested quotes**: `<div data-test='{"key": "value"}'>` 
5. **Script with HTML**: `<script>document.write("<div>");</script>`

### Performance & Stress Validation

Create benchmarks to ensure Stage 4 doesn't regress performance:

```typescript
// Deterministic (repeatable) benchmark inputs (no per-run randomness)
const htmlContent = ('<div class="test" data-x=abc>' + 'text</div>\n').repeat(800);
const entityContent = ('&amp; &lt; &gt; &#65; &#x41; ').repeat(1200);
const mixedStress = ('<script>let x="&amp;";</script>\n').repeat(400) +
  ('<p title="A &quot;quoted&quot; value">T &amp; V</p>\n').repeat(400);

// Measurements: tokens/second, steady-state per-iteration allocations, rollback safety points density.
```

## Rollback Safety Considerations

### Safe Restart Points
- After complete HTML tags: `<div>` 
- After complete entities: `&amp;`
- At content mode boundaries: after `<script>` open tag
- After HTML comments: `<!--comment-->`

### Rollback Types (Extending Existing Mask)
Existing rollback type usage reserves 3 bits. Values 0–4 are already in use (DocumentStart, BlankLine, RawTextContent, CodeBlockContent, HtmlElementInner). Stage 4 adds three more (filling the 0–7 space without new bits):

```typescript
// Additional rollback *type values* (no new flag bits required):
// 5: HtmlTagBoundary      – Immediately after completing '>' or '/>' of a tag
// 6: HtmlEntityComplete   – Immediately after emitting a HtmlEntity token
// 7: ContentModeBoundary  – Right after switching into or out of RawText / RCData
```

Tokens at these points set `CanRollbackHere` plus appropriate encoded type value. No extra TokenFlags constants are required—only the numeric type assignment within existing mask logic.

## Error Handling Strategy

### Non-fatal Lexical Issues
- Malformed tags → emit as separate tokens (`<`, `invalid`, `>`)
- Invalid entities → emit as separate tokens (`&`, `invalid`)
- Unclosed tags → set Unterminated flag, continue scanning
- Mismatched quotes → treat as text content

### Scanner Error Reporting
Errors are *non-fatal* and produced alongside normal tokens. Each error:
- Is recorded in an out-of-band diagnostics array (holding code + start + length) with *no* new string construction (codes are enum values; substrings are referenced by index/length only).
- May set a generic `Unterminated` or context flag on the affected token rather than emitting special error tokens.

New error categories (names only; numeric codes assigned at implementation time):
- InvalidHtmlEntity (missing semicolon, invalid chars, length cap exceeded)
- UnterminatedHtmlComment (missing `-->`)
- UnterminatedHtmlCdata (missing `]]>`)
- UnterminatedProcessingInstruction (missing `?>`)
- InvalidHtmlAttribute (missing value after '=', illegal char in name)
- MalformedTagStart (e.g. `<1abc`)
- UnterminatedRawText (EOF before closing script/style)
- UnterminatedRCData (EOF before closing textarea/title)

### Fallback Behavior
On any malformed construct, the scanner *always* advances at least one character and emits the broadest valid token it can, ensuring linear progress and preserving incremental parsing guarantees.

## Implementation Order & Dependencies

1. **Task 1** → **Task 2**: Foundation before basic HTML
2. **Task 2** → **Task 3**: Basic tags before attributes  
3. **Task 2** → **Task 4**: Basic structure before entities
4. **Task 3** → **Task 5**: Attributes before content modes
5. **Task 2** → **Task 6**: Basic structure before comments
6. **Task 2** → **Task 7**: Basic structure before XML-like constructs

Each task should be fully tested with verify-tokens before proceeding to the next task. This ensures incremental progress with comprehensive validation at each step.

### Post-implementation: DOCTYPE support

When you add DOCTYPE scanning, follow these concise, actionable steps and tests to keep the Stage-4 scanner principles (zero-allocation, single-pass scanning, conservative token set).

Token surface changes
- Add a new `SyntaxKind` entry: `HtmlDoctype` (full span token for `<!DOCTYPE ...>`).

Scanner changes (clarified)
- Add a case-insensitive match helper (e.g. `matchSequenceCaseInsensitive(pos, '<!DOCTYPE')`) or perform ASCII-folded compares when probing the `<` sequence. Use ASCII fold ((ch | 0x20) == expected) to avoid allocations.
- In `scanLessThan(start)` detect `<!DOCTYPE` (case-insensitive) and call `scanHtmlDoctype(start)`. Ensure detection order is correct so `<!--` and `<![CDATA[` are tested first. Recommended order in `scanLessThan()`:
  1. `<!--` (HtmlComment)
  2. `<![CDATA[` (HtmlCdata)
  3. `<!DOCTYPE` (HtmlDoctype)
  4. other `<!...` constructs (defer or treat as text)

- Implement `scanHtmlDoctype(start)` with the following deterministic contract:
  - Confirm the `<!DOCTYPE` prefix case-insensitively; if it doesn't match, return control to the caller so other `<!` forms can be handled.
  - Advance the scanner index to the first character after the matched prefix.
  - Loop until EOF:
    - If current char is `"` or `'`, set quoteChar and skip forward until the matching quoteChar or EOF (do not treat backslash as escape).
    - Else if current char is `>` and not inside a quoted run: emit `HtmlDoctype` token covering `[start..pos+1)` and return.
    - Otherwise advance one char.
  - If EOF is reached before a terminating `>` is found: emit `HtmlDoctype` covering `[start..EOF)` and set the scanner's Unterminated diagnostic flag (recommend diagnostic name `UnterminatedHtmlDoctype`).
  - Do NOT attempt to parse or validate PUBLIC/SYSTEM identifiers — this is a lexical token only.

Edge cases and rules (explicit)
- DOCTYPE matching must be case-insensitive (`<!doctype html>` valid). Require the exact prefix `<!DOCTYPE` CI; accept any following character (including whitespace or `>`).
- Quoted strings inside DOCTYPE may contain `>`; `>` inside matching single or double quotes must be ignored when deciding termination.
- Unterminated DOCTYPE (EOF without `>`) must safely emit `HtmlDoctype` up to EOF and set the `UnterminatedHtmlDoctype` diagnostic flag on the token (and record a diagnostic entry).
- Very long DOCTYPE declarations are allowed; scanning is O(n) and must not allocate intermediate substrings.

Tests to add (explicit)
 Simple HTML5 DOCTYPE: Verify that the declaration <!DOCTYPE html> is tokenized as a single HtmlDoctype token covering the entire declaration.
 Case-insensitive DOCTYPE: Verify that a lowercase declaration (for example, <!doctype html>) is accepted and emitted as HtmlDoctype (matching should be case-insensitive).
 HTML4 DOCTYPE with PUBLIC and SYSTEM identifiers: Verify that a full HTML4 DOCTYPE containing PUBLIC and SYSTEM parts with quoted URIs is emitted as a single HtmlDoctype token and that the quoted URIs remain inside the token span.
 Quoted greater-than handling: Verify that a DOCTYPE containing a '>' character inside single or double quotes does not terminate the declaration early and that the scanner continues until the closing '>' outside quotes before emitting HtmlDoctype.
 Unterminated DOCTYPE at EOF: Verify that when a DOCTYPE reaches end-of-file without a closing '>', the scanner emits an HtmlDoctype token spanning to EOF and records an UnterminatedHtmlDoctype diagnostic flag for that token.
 No-space-after-prefix edge case: Verify that inputs where the prefix characters match the DOCTYPE prefix but are not followed by whitespace (for example, <!DOCtype>) are accepted as a valid DOCTYPE prefix match and result in an HtmlDoctype token covering the span; include a test that asserts the exact desired behavior for this edge case in the harness.

Parser and tooling impact
- The scanner-only change is isolated; the parser must be updated only if you want dedicated Doctype AST nodes. If so, map `HtmlDoctype` tokens to `HtmlDoctypeNode` in the parser and propagate unterminated diagnostics.

Implementation contract (minimal pseudocode)

```ts
function scanHtmlDoctype(start: number): void {
  // `pos` is current scanner index, `end` is source length
  if (!matchSequenceCaseInsensitive(pos, '<!DOCTYPE')) return; // caller handles other <! forms
  pos += '<!DOCTYPE'.length; // advance past prefix
  let inQuote: string | null = null;
  while (pos < end) {
    const ch = source.charAt(pos);
    if (inQuote) {
      if (ch === inQuote) { inQuote = null; }
      pos++;
      continue;
    }
    if (ch === '"' || ch === "'") { inQuote = ch; pos++; continue; }
    if (ch === '>') { emitToken(SyntaxKind.HtmlDoctype, start, pos + 1); return; }
    pos++;
  }
  // EOF reached without closing '>'
  emitTokenWithUnterminated(SyntaxKind.HtmlDoctype, start, pos, 'UnterminatedHtmlDoctype');
}
```

Estimated effort
- Token + scanner changes + tests: small (30–90 minutes) for someone familiar with the scanner and test harness.

Minimal acceptance checklist
- [ ] `HtmlDoctype` added to `SyntaxKind` and recognized by `verify-tokens` utilities.
- [ ] `scanLessThan()` detects `<!DOCTYPE` case-insensitively (after comment/CDATA checks) and delegates to `scanHtmlDoctype`.
- [ ] `scanHtmlDoctype` correctly skips `>` inside single/double quotes and emits `HtmlDoctype` to the closing `>` or EOF.
- [ ] Tests for HTML5, HTML4 (PUBLIC/SYSTEM), case-insensitivity, quoted `>` inside DOCTYPE, unterminated DOCTYPE, and the `<!DOCtype>` edge case pass.
- [ ] `UnterminatedHtmlDoctype` diagnostic is recorded on unterminated tokens.
- [ ] No unnecessary string allocations are introduced during DOCTYPE scanning (scanner slices only once for `tokenText`).

Implementing DOCTYPE this way preserves the Stage-4 scanner goals while providing the token-level support needed for downstream parsing or editor tooling.