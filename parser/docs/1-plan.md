# Markdown Parser Implementation Plan

An editor-grade Markdown parser with native HTML support, built using TypeScript-style single scanner architecture for minimal memory usage and precise source mapping.

## Policy: Markdown Inside HTML

- Inline Markdown remains active inside all HTML elements by default.
- Exceptions: RAWTEXT elements (`<script>`, `<style>`) and RCDATA elements (`<title>`, `<textarea>`) retain their HTML content models (no Markdown; entities only active in RCDATA).
- The scanner exposes structural hints (e.g., `ContainsHtmlBlock` when an HTML element begins at line start) but does not suspend Markdown tokenization for non-RAWTEXT/RCDATA elements.

## Scanner Module

**Files**: `scanner.ts`, `scanner-modes.ts`, `token-types.ts`

The core lexical analyzer using a single mutable scanner with mode switching, modeled after TypeScript's `scanner.ts`. No token arrays or event streams.

**Scanner State**:
- Single source buffer with current position index
- Active parsing mode enum (MarkdownBlock, MarkdownInline, HtmlTag, HtmlAttr, HtmlText, HtmlComment, HtmlDoctype, HtmlCdata, FrontmatterYaml, FrontmatterToml, MathInline, MathBlock, AttributeBlock)
- Token materialization on-demand via `getTokenText()`, `getTokenValue()`
- Extended construct detection: frontmatter fences, math delimiters, table pipes, attribute braces

**Mode Switching Logic**:
- `reScanLessThan()` for `<` disambiguation (tag vs text) following TypeScript's `reScanLessThanToken()`
- `lookAhead()` and `tryScan()` for rollback-capable parsing decisions
- Raw-text element handling (script/style/textarea/title) switches to HtmlText mode until matching close tag; Markdown is otherwise active inside HTML.

**Error Handling and Diagnostics**:

- Scanner surfaces errors in two ways:
  - Pull: `getErrorCode()`/`getErrorMessage()` and `TokenFlags.Unterminated` on relevant tokens.
  - Push: optional `setOnError((start, end, code, message) => void)` callback.
- Speculation semantics (for parser integration):
  - `lookAhead(cb)`: suppress and discard errors inside `cb` (no callback, no last-error updates).
  - `tryScan(cb)`: buffer errors inside `cb`; flush once in order if `cb` succeeds (truthy); discard if it fails (rollback).
  - Rescans de-duplicate by `(start,end,code)` to avoid duplicate emissions.
  - `setText(...)` resets suppression state and emission history.

**Complex Implementation**: Angle-bracket disambiguation requires sophisticated lookahead. Reference TypeScript's JSX scanning in `scanner.ts` lines 91-92 (`reScanJsxToken`, `reScanLessThanToken`) for the rollback pattern - this provides efficient backtracking without allocations by saving/restoring scanner position. Micromark's construct resolution in `create-tokenizer.js` shows character-code-to-construct mapping (lines 32-45 in `constructs.js`) - excellent for O(1) dispatch but we'll adapt to mode-aware dispatch. TypeScript's token-to-string mapping (`textToToken` Map, lines 224-287 in `scanner.ts`) demonstrates efficient punctuation recognition without string allocations.

**Extended Syntax Scanning**: Frontmatter detection follows `micromark-extension-frontmatter/dev/lib/syntax.js` fence pattern - document start detection with `---`/`+++` sequences. Math delimiter scanning mirrors `micromark-extension-math/dev/lib/math-flow.js` and `math-text.js` for `$$`/`$` balancing. Table pipe scanning needs `|` disambiguation (table vs other uses). Attribute block scanning `{...}` after constructs requires context-aware lookahead.

## Parser Module

**Files**: `parser.ts`, `parser-utils.ts`, `parse-context.ts`

Direct AST construction without intermediate token streams, following TypeScript's `parser.ts` approach of consuming scanner methods directly.

**Parser Architecture**:
- Recursive descent parser with mode-aware construct dispatching
- `parseDocument()` → `parseBlockConstruct()` → `parseInlineConstruct()` pipeline
- HTML parsing integrated at all levels, not relegated to "HTML block" construct
- Permissive error recovery: degrade malformed constructs to text nodes

**State Management**:
- Parse context tracks current container stack, reference definitions, loose/tight list modes
- No global state - all context passed through parse methods
- Optional parent linking configurable for memory vs ergonomics trade-off

**Complex Implementation**: Block-inline interleaving requires careful context switching. Study micromark's `parse.js` construct orchestration (lines 32-41) where document/flow/string/text parsers compose cleanly - we'll mirror this with mode-specific parsing methods. Micromark's character code dispatch in `constructs.js` (lines 60-92) shows efficient construct selection - adapt for our scanner modes. HTML attribute parsing needs unquoted value handling without allocations - TypeScript's `getTokenText()` pattern (scanner interface) provides lazy materialization. For permissive recovery, study TypeScript's error recovery in `parser.ts` where malformed constructs degrade gracefully rather than failing.

**Extended Parsing Integration**: Table parsing requires row/cell structure detection and alignment tracking - reference GFM table implementation patterns. Math content parsing needs delimiter balance checking. Frontmatter parsing delegates to YAML/TOML/JSON parsers while maintaining position tracking. Callout parsing (admonition-style `!!!` or alert-style `> [!NOTE]`) handles nested Markdown content within directive boundaries. Attribute parsing handles key-value pairs with proper escaping, supporting both `{.class #id key=value}` and `{: .class}` syntaxes.

## AST Node Definitions

**Files**: `ast-types.ts`, `ast-factory.ts`

Unified node hierarchy supporting both Markdown and HTML constructs with consistent `pos/end` positioning.

**Node Structure**:
- Base `Node` interface with `type: string`, `pos: number`, `end: number`
- Optional `parent?: Node` field (configurable)
- Markdown nodes: Document, Heading, Paragraph, List, ListItem, Blockquote, Code, Break, Emphasis, Strong, Link, Image, InlineCode, Text
- HTML nodes: Element, Comment, Text, Doctype, CData with attributes as structured data
- Extended nodes: Table, TableRow, TableCell (with alignment), Math (inline/block), Frontmatter (YAML/TOML/JSON), Callout, WhitespaceSeparation
- All nodes optionally support `attributes?: Map<string, string>` and `language?: string` fields for adorning

**Position Handling**:
- All nodes carry absolute byte offsets (pos/end) following TypeScript's `ReadonlyTextRange`
- Lazy line/column computation via cached line-starts array
- Source text slicing on-demand for node values

**Complex Implementation**: Unified position system across Markdown/HTML requires consistent offset tracking during mode switches. Reference TypeScript's `types.ts` TextRange interface (lines 28-36) for the `pos/end` pattern - this enables precise source mapping without line/column overhead.

Blank line policy and `WhitespaceSeparation`:

- Consecutive blank lines are not collapsed. Each blank (whitespace-only) line between blocks is represented explicitly in the AST as a `WhitespaceSeparation` node.
- Example:
  - `abcd\n\nefgh` -> Paragraph("abcd"), WhitespaceSeparation(1), Paragraph("efgh").
  - `abcd\n\n\nefgh` -> Paragraph("abcd"), WhitespaceSeparation(2), Paragraph("efgh").
- The scanner exposes this via `TokenFlags.IsBlankLine` on `NewLineTrivia` tokens that terminate whitespace-only lines; the parser should emit one `WhitespaceSeparation` node per contiguous run (count equals the number of consecutive `IsBlankLine`-marked newlines).

HTML attribute representation needs efficient key-value storage without string allocations until accessed - follow TypeScript's property access pattern where names/values are computed on-demand via source slicing. Study micromark's position propagation in token events for maintaining accuracy across construct boundaries.

**Extended Node Positioning**: Table cell boundaries require precise column offset tracking. Math content preserves source ranges for LaTeX error reporting. Frontmatter maintains both metadata boundaries and content spans. Attribute adorning tracks both the adorned construct and attribute block spans separately. Callout nodes track directive markers, titles, and nested content boundaries independently.

## Incremental Parsing Engine

**Files**: `incremental.ts`, `syntax-cursor.ts`, `reuse-detector.ts`

Span-based AST reuse for minimal re-parsing on edits, inspired by TypeScript's incremental parser architecture.

**Reuse Strategy**:
- Syntax cursor tracks reusable subtree spans
- Edit detection compares new vs old source at character level
- Node identity preservation where spans are unchanged
- Error contamination tracking to avoid reusing malformed regions

**Change Detection**:
- Text change ranges trigger selective invalidation
- Block-level changes affect block boundaries; inline changes stay local
- HTML tag changes may affect raw-text element boundaries requiring wider invalidation

**Complex Implementation**: Determining reuse boundaries requires understanding construct interdependencies. TypeScript's `parser.ts` `updateSourceFile()` (around line 8000+) provides incremental reuse via `IncrementalParser` - study how syntax cursors track reusable nodes and invalidation propagates. TypeScript's change detection compares old/new text ranges to minimize reparsing. For nested HTML/Markdown scenarios, track parsing mode boundaries as invalidation points - changes inside `<div>` with Markdown content must invalidate the entire container if tag structure changes. Reference micromark's resolver system to understand how constructs can affect each other across spans - attention spans, link references, and HTML raw-text boundaries create complex dependencies.

## Entity and Normalization Utilities  

**Files**: `entities.ts`, `normalize.ts`, `text-utils.ts`

Character reference decoding and text normalization without eager processing.

**Entity Handling**:
- Lazy decoding: track entity spans, decode only when text value accessed
- Both numeric (`&#123;`) and named (`&amp;`) entity support
- Context-aware decoding based on HTML vs Markdown rules

**Text Processing**:
- Whitespace normalization for different contexts (attributes, text content)
- Unicode handling for proper string slicing with surrogate pairs
- Line ending normalization (CRLF → LF) with position adjustment

**Complex Implementation**: Context-sensitive entity decoding requires tracking where entities are valid. Study mdast-util-from-markdown's entity handling with `decodeString()` and `decodeNumericCharacterReference()` - these show HTML vs attribute context differences. TypeScript's Unicode handling in `scanner.ts` (unicodeES5IdentifierStart/Part arrays, lines 331-344) demonstrates efficient character classification. For performance, maintain entity span ranges and decode lazily - only when text content is accessed. Named entities (`&amp;`) need trie-based lookup; numeric entities (`&#123;`) need boundary validation without full string scanning.

## Integration and Public API

**Files**: `index.ts`, `parse-options.ts`, `diagnostics.ts`

Clean external interface with configurable parsing behavior and comprehensive error reporting.

**API Surface**:
- `parseMarkdown(source: string, options?: ParseOptions): ParseResult`
- `parseIncremental(source: string, changes: TextChange[], previous: ParseResult): ParseResult`
- Configurable parent linking, position computation, HTML strictness levels

**Diagnostics**:
- Structured error reporting with precise source locations
- Warning system for questionable but recoverable constructs
- Optional strict mode for enhanced error detection

**Error Recovery**:
- Malformed HTML degrades to text content
- Unclosed constructs auto-close at logical boundaries
- Invalid characters preserved in text nodes with diagnostic annotations

**Complex Implementation**: Incremental API needs careful change range computation and invalidation logic. Reference TypeScript's incremental parsing entry points and diagnostic attachment - study how `updateSourceFile()` propagates changes and preserves AST identity where possible. For structured error reporting, define programmatic error codes:

**Error Code System (unified)**:
- `ParseDiagnostic` with fields: `code: string`, `category: 'syntax' | 'structure' | 'nesting' | 'attribute' | 'reference' | 'whitespace' | 'encoding'`, `subject: string` (e.g., `element`, `emphasis`, `link`, `list`, `code-fence`), `pos: number`, `end: number`, `severity: 'error' | 'warning'`, `message?: string`, `related?: Array<{pos: number, end: number, note: string}>`.
- Neutral codes (no HTML/MD prefixes) to reflect HTML as first-class:
  - `UNCLOSED_TAG`, `MISMATCHED_CLOSE`, `INVALID_NESTING`, `RAW_TEXT_MISSING_CLOSE`
  - `INVALID_ATTRIBUTE`, `ATTRIBUTE_MISSING_VALUE`, `INVALID_ENTITY`
  - `INVALID_LIST_INDENT`, `UNCLOSED_EMPHASIS`, `MALFORMED_LINK`, `UNTERMINATED_CODE_FENCE`
  - `INVALID_REFERENCE`, `DUPLICATE_DEFINITION`, `UNRESOLVED_REFERENCE`
  - `WHITESPACE_SEPARATION_CONFLICT` (e.g., ambiguous multi-newline handling against surrounding constructs)
  - `MALFORMED_TABLE`, `TABLE_ALIGNMENT_MISMATCH`, `UNBALANCED_MATH_DELIMITER`
  - `INVALID_FRONTMATTER`, `FRONTMATTER_PARSE_ERROR`, `UNKNOWN_CALLOUT_TYPE`
  - `DUPLICATE_ATTRIBUTE`, `INVALID_ATTRIBUTE_SYNTAX`, `ATTRIBUTE_POSITION_ERROR`
- Example shaping:
  - A mismatched `</div>` inside emphasis becomes `{ code: 'MISMATCHED_CLOSE', category: 'nesting', subject: 'element', ... }`.
  - An unterminated ````` block: `{ code: 'UNTERMINATED_CODE_FENCE', category: 'syntax', subject: 'code-fence', ... }`.
- Consumers should branch on `code`/`category`/`subject` instead of parsing text. This keeps diagnostics orthogonal to content type while remaining specific.

**Nested Content Strategy**:
- Parse HTML elements; content is Markdown-active for all elements except RAWTEXT/RCDATA (no whitelist needed).
- Use scanner flags/mode to detect RAWTEXT/RCDATA and to surface `ContainsHtmlBlock` as a structural hint only; do not suspend inline parsing in other HTML containers.
- For nested parsing: create child parser with restricted mode where needed, track nesting level, handle misaligned closing tags by auto-closing to valid boundaries.
- Multi-level onion nesting: maintain parsing mode stack, each layer knows its termination conditions.
- Error recovery: malformed nesting degrades to text content, continues parsing outer layer.

## Implementation Priorities

1. **Scanner + basic Markdown parsing** - Foundation for all other work
2. **HTML integration** - The core differentiator requiring native parsing
3. **Position system** - Essential for editor integration  
4. **Error recovery** - Critical for practical editing scenarios
5. **Incremental engine** - Performance optimization for large documents
6. **Entity handling** - Correctness requirement, optimize later
7. **Extended syntax** - Tables, math, frontmatter, callouts, attributes

Total estimated scope: ~4000-5000 lines focused TypeScript (increased from extended syntax support), compared to micromark's ~15000+ lines across packages. Aggressive scope reduction through unified architecture and eliminating token/event intermediates.

## Documentation Alignment (Current Implementation)

- **Scanner organization**: Implemented as a single file `src/scanner.ts` (no separate `scanner-impl.ts`), following a TypeScript-style scanner with explicit control flow and lazy materialization.
- **Token taxonomy**: The actual `SyntaxKind` set is defined in `src/token-types.ts` and differs from illustrative examples in this doc. It includes Markdown and HTML tokens used by tests (e.g., `HtmlComment`, `HtmlCDATA`, `HtmlDoctype`, `HtmlProcessingInstruction`, `DashDashDash`, `DollarDollar`, `AsteriskAsterisk`, `UnderscoreUnderscore`, `TildeTilde`). Tokens unrelated to Markdown/HTML (e.g., `NoSubstitutionTemplateLiteral`) are not part of this project.
- **HTML handling**: HTML is parsed natively in the scanner (no external parsers), consistent with project constraints.
Refer to `src/token-types.ts` as the source of truth for the token set.
## Semi-Standard and Extended Syntax

### Tables
**GFM Pipe Tables**: `| col1 | col2 |` with alignment `:---:`, `---:`, `---`  
*Reference*: GFM table parsing in `mdast-utils/mdast-util-gfm/lib/index.js` line 19 (`gfmTableFromMarkdown`)

**Grid Tables**: ASCII-art style with `+---+---+` borders  
*Reference*: No current implementation in workspace - external: pandoc grid table parser

**Simple Tables**: Space-separated columns with header underlines  
*Reference*: No current implementation in workspace - external: pandoc simple table parser

**HTML Tables**: Native `<table>` elements with Markdown content in cells  
*Reference*: HTML parsing patterns in `micromark/micromark/packages/micromark-core-commonmark/dev/lib/html-flow.js`

### Frontmatter
**YAML Frontmatter**: `---\nkey: value\n---`  
*Reference*: `micromark/micromark-extension-frontmatter/dev/lib/syntax.js` fence detection pattern

**TOML Frontmatter**: `+++\nkey = "value"\n+++`  
*Reference*: Same fence pattern as YAML in `micromark-extension-frontmatter`

**JSON Frontmatter**: `{\n"key": "value"\n}`  
*Reference*: Frontmatter matter types in `micromark-extension-frontmatter/dev/lib/to-matters.js`

### Mathematics
**Inline Math**: `$E = mc^2$` or `\(E = mc^2\)`  
*Reference*: `micromark/micromark-extension-math/dev/lib/math-text.js` inline delimiter handling

**Block Math**: `$$\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}$$` or `\[...\]`  
*Reference*: `micromark/micromark-extension-math/dev/lib/math-flow.js` block delimiter and content parsing

### Extended Inline Constructs
**Inline Code with Language**: `` `js:console.log()` `` or `` `{js}console.log()` ``  
*Reference*: No current implementation - new syntax to implement

**Strikethrough**: `~~deleted text~~`  
*Reference*: GFM strikethrough in `mdast-utils/mdast-util-gfm/lib/index.js` line 17 (`gfmStrikethroughFromMarkdown`)

**Task List Items**: `- [x] completed` / `- [ ] pending`  
*Reference*: GFM task lists in `mdast-utils/mdast-util-gfm/lib/index.js` line 22 (`gfmTaskListItemFromMarkdown`)

### Callouts and Directives
**Admonition Style**: `!!! note "Title"\n    Content`  
*Reference*: No current implementation in workspace - external: Python-Markdown admonition extension

**Alert Style**: `> [!NOTE]\n> Content`  
*Reference*: No current implementation in workspace - external: GitHub-style alerts

**Directive Style**: `:::{callout-note}\nContent\n:::`  
*Reference*: Directive attribute handling patterns in `lint-awesome/remark-lint/packages/remark-lint-directive-*` packages

### Attribute Adorning
**Pandoc Style**: `# Heading {#id .class key=value}`  
*Reference*: Attribute syntax patterns in `lint-awesome/remark-lint/packages/remark-lint-directive-attribute-sort/index.js`

**Kramdown Style**: `{: .class #id}`  
*Reference*: No current implementation in workspace - external: kramdown attribute lists

**Inline Attributes**: `*emphasis*{.highlight}`  
*Reference*: Attribute position handling in `lint-awesome/remark-lint/packages/remark-lint-directive-shortcut-attribute/`

### External Repository References

For constructs not currently implemented in the workspace, key external repositories to reference:

- **Pandoc**: `https://github.com/jgm/pandoc` - Grid tables, simple tables, attribute lists
- **Python-Markdown**: `https://github.com/Python-Markdown/markdown` - Admonition extension
- **Kramdown**: `https://github.com/gettalong/kramdown` - Attribute list syntax
- **GitHub Linguist**: `https://github.com/github/linguist` - Language detection patterns for inline code
- **KaTeX**: `https://github.com/KaTeX/KaTeX` - Math rendering (for validation)
- **Remark Directive**: `https://github.com/remarkjs/remark-directive` - Generic directive syntax
- **MDX**: `https://github.com/mdx-js/mdx` - JSX attribute patterns (already in workspace under `mdx/`)