# Parser Module Implementation Plan

A comprehensive implementation plan for the recursive descent parser component of the Markdown parser, designed for native HTML parsing following TypeScript's parser architecture with micromark's construct resolution logic.

## Executive Summary

The parser builds ASTs directly from scanner tokens using TypeScript's recursive descent pattern. HTML and Markdown are treated as first-class citizens with unified positioning. The architecture prioritizes editor-grade performance through incremental parsing and permissive error recovery.

**Key Design Principles:**
- Direct AST construction without intermediate token streams
- Native HTML parsing integrated at all levels
- Unified node hierarchy with consistent `pos/end` positioning
- Permissive error recovery degrading malformed constructs to text
- Mode-aware construct dispatching following micromark patterns
- Incremental reuse for editor performance

## Architecture Overview

### Core Philosophy

**TypeScript-Style Direct Consumption**: Parser consumes scanner methods directly (`getToken()`, `scan()`, `lookAhead()`) without token arrays or event streams, following TypeScript's `parser.ts` pattern.

**Unified HTML/Markdown Parsing**: HTML elements parsed natively alongside Markdown constructs. No "HTML block" special case - HTML is a first-class parsing mode with Markdown remaining active inside (except RAWTEXT/RCDATA elements).

**Construct Orchestration**: Mode-aware dispatching inspired by micromark's construct resolution, but producing AST nodes directly instead of token events.

#### Micromark semantics: adopted vs not adopted

- Adopted semantics (no event model):
  - Emphasis/strong delimiter algorithm: left/right flanking, intraword `_` blocking, pairing using scanner `CanOpen/CanClose` and run lengths.
  - Code spans: equal backtick run lengths; content may contain shorter backticks.
  - Thematic breaks: ≥3 markers with only spaces/tabs otherwise, at line start.
  - Lists: indent 0–3 before markers, ordered marker variants (`.`/`)`), lazy continuation.
  - Angle autolinks: strict URL/email forms; punctuation trimming on link text.
  - GFM tables: header + alignment row on line 2; escaped pipes; inline Markdown in cells.
  - Math: `$` inline and `$$` block; balanced delimiters; content opaque to the parser.

- Not adopted (by design):
  - micromark’s event/token stream and multi-branch/backtracking tokenizer architecture.
  - Global HTML flow suspension (types 1–7); we only suspend Markdown in RAWTEXT/RCDATA.
  - Any external HTML parser; we build a minimal native HTML tree builder.
  - Structural gating in the scanner for setext/tables; these remain parser-only decisions.

#### Scanner vs Parser responsibility split

- Scanner guarantees:
  - Token kinds/positions with raw slices; rescanning helpers.
  - Flags: `IsAtLineStart`, `IsBlankLine`, `ContainsHtmlBlock`, RAWTEXT/RCDATA, autolink strictness/kind.
  - Delimiter metadata: `CanOpen/CanClose` and run lengths for `*`, `_`, backticks/tilde.
  - Layout: `getColumn()` (tabs→columns) for list/blockquote logic.

- Parser responsibilities:
  - Setext heading detection (paragraph + next-line underline), table gating via alignment row, and autolink punctuation trimming.
  - Optional-end HTML autoclose and mismatch diagnostics; native HTML tree building.
  - Reference definition collection and post-pass resolution.
  - Emitting `WhitespaceSeparationNode` only between blocks.
  - Incremental reuse policy via syntax cursor and node invariants.

### Parser State Management

```typescript
interface ParseContext {
  scanner: Scanner;
  containerStack: ContainerBlock[];
  referenceDefinitions: Map<string, ReferenceDefinition>;
  parseMode: ParseMode;
  errorRecovery: boolean;
  parentLinking: boolean; // configurable for memory vs ergonomics
}

enum ParseMode {
  Document,     // Top-level document parsing
  Block,        // Block-level constructs
  Inline,       // Inline constructs within blocks
  HtmlContent,  // Inside HTML elements (Markdown active)
  RawText,      // Inside <script>/<style> (no Markdown)
  RcData        // Inside <textarea>/<title> (entities only)
}
```

## File Structure and Exports

### `parser.ts` (Primary Interface)
**Size Estimate**: ~800-1000 lines

**Core Exports**:
```typescript
export interface Parser {
  parseDocument(source: string, options?: ParseOptions): ParseResult;
  parseIncremental(source: string, changes: TextChange[], previous: ParseResult): ParseResult;
}

export interface ParseOptions {
  parentLinking?: boolean;          // Include parent pointers in nodes
  errorRecovery?: boolean;          // Enable permissive error recovery
  extensions?: ParseExtension[];    // Extended syntax support
}

export interface ParseResult {
  ast: DocumentNode;
  diagnostics: ParseDiagnostic[];
  sourceMap: SourceMap;
  sections: SectionIndex; // canonical outline and lookup built from headings
}

export function createParser(): Parser;
```

### `ast-types.ts` (Node Definitions)
**Unified Node Hierarchy (updated for compactness)**:
```typescript
// Node kinds and flags are co-located in a single packed field for compactness.
// The exact bit layout is an implementation detail; conceptually:
// - Lower bits: NodeKind (enum)
// - Upper bits: NodeFlag bits (e.g., ContainsError, Synthetic, Missing)
// Accessors/helpers expose kind/flags ergonomically while keeping storage packed.
enum NodeKind {
  Document,
  Paragraph,
  Heading,
  Blockquote,
  List,
  CodeBlock,
  ThematicBreak,
  HtmlElement,
  HtmlComment,
  Table,
  MathBlock,
  Callout,
  Text,
  Emphasis,
  Strong,
  InlineCode,
  Link,
  Image,
  MathInline,
  Break,
  WhitespaceSeparation
}

// Base node interface with consistent positioning and minimal footprint
interface Node {
  kindFlags: number; // packed: kind + flags (bit-packed). See NodeKind and NodeFlagBits.
  pos: number;       // Absolute byte offset start
  end: number;       // Absolute byte offset end
  parent?: Node;     // Optional parent linking (gated by ParseOptions.parentLinking)
}

// Attribute representation: compact slices with lazy decoding (no Map allocations)
enum QuoteKind { None, Single, Double }
interface AttributeSlice {
  nameStart: number;
  nameEnd: number;
  valueStart?: number;
  valueEnd?: number;
  quoted?: QuoteKind; // None for unquoted
}

// Document structure
interface DocumentNode extends Node {
  children: BlockNode[];
  frontmatter?: FrontmatterNode;
  lineStarts: number[]; // for source mapping convenience
}

// Block-level nodes
type BlockNode = 
  | ParagraphNode | HeadingNode | BlockquoteNode | ListNode
  | CodeBlockNode | ThematicBreakNode | HtmlElementNode
  | TableNode | MathBlockNode | CalloutNode | WhitespaceSeparationNode;

// Inline nodes
type InlineNode =
  | TextNode | EmphasisNode | StrongNode | InlineCodeNode
  | LinkNode | ImageNode | HtmlElementNode | MathInlineNode | BreakNode;

// Headings with section linkage
interface HeadingNode extends Node {
  level: 1 | 2 | 3 | 4 | 5 | 6; // ATX or Setext (H1/H2)
  children: InlineNode[];        // inline content of the heading line
  slug?: string;                 // stable id for fragments (lazy-computed; see slug rules)
  explicitId?: { start: number; end: number }; // slice of explicit id source if present (e.g., inline HTML id)
  section?: SectionNode;         // back-reference to the section this heading opens
}

// HTML nodes (first-class citizens)
interface HtmlElementNode extends Node {
  tagName: string;
  attributes: AttributeSlice[]; // lazy string materialization
  children: (BlockNode | InlineNode)[]; // Markdown active inside except RAWTEXT/RCDATA
  selfClosing: boolean; // includes void elements without explicit '/>'
  rawContent?: { start: number; end: number }; // only for RAWTEXT/RCDATA
}

interface HtmlCommentNode extends Node {
  contentStart: number; // slice offsets instead of pre-decoded strings
  contentEnd: number;
}

// Whitespace separation (blank lines preserved between blocks only)
interface WhitespaceSeparationNode extends Node {
  count: number;  // Number of consecutive blank lines
}

// Canonical sections built from headings
interface SectionNode extends Node {
  heading: HeadingNode;          // owning heading
  level: 1 | 2 | 3 | 4 | 5 | 6;  // same as heading.level
  slug: string;                  // final, de-duplicated slug used for fragments
  parent?: SectionNode;
  children: SectionNode[];
  // Content range: excludes the heading line and leading/trailing blank lines
  contentStart: number;
  contentEnd: number;
  // Blocks contained in the section (for convenience; mirrors document order)
  blocks: BlockNode[];
  // Outline numbering path (1-based per level), e.g., [2, 1, 3] => 2.1.3
  number?: number[];
}

interface SectionRef {
  pos: number;                    // start of the fragment reference (e.g., LinkNode destination slice)
  end: number;                    // end of the fragment reference
  fragment: string;               // raw fragment without leading '#'
  target?: SectionNode;           // resolved target if known
  resolution: 'resolved' | 'unresolved' | 'ambiguous';
}

interface SectionIndex {
  outline: SectionNode[];         // top-level sections (forest)
  bySlug: Map<string, SectionNode>; // final slug -> section
  // Optional: references discovered across the document (including inside headings)
  refs: SectionRef[];
}
```

## Parsing Strategy

### Document-Level Parsing

Entry point `parseDocument()` builds the tree in a single pass and defers only reference resolution to a post-pass:

```typescript
function parseDocument(): DocumentNode {
  const filePos = scanner.getTokenStart();
  const frontmatter = tryParseFrontmatter(); // opaque slice, validated for balanced fences

  const children: BlockNode[] = [];
  while (scanner.getToken() !== SyntaxKind.EndOfFileToken) {
    const b = parseBlockConstruct();
    if (b) children.push(b);
  }

  const doc = finishNode(createNode(NodeKind.Document, filePos, scanner.getTokenEnd(), { children, frontmatter }));
  // Post-pass: resolve reference links/images against collected definitions
  resolveReferences(doc, parseContext.referenceDefinitions);
  return doc;
}
```

### Block-Level Dispatch

Mode-aware dispatching based on token and line-start flags. Setext detection lives in the parser (do not rely on scanner `inParagraph`).

```typescript
function parseBlockConstruct(): BlockNode | null {
  const t = scanner.getToken();
  const f = scanner.getTokenFlags();

  if (t === SyntaxKind.LessThanToken || t === SyntaxKind.LessThanSlashToken) return parseHtmlElement();
  if ((f & TokenFlags.IsAtLineStart) && t === SyntaxKind.HashToken) return parseAtxHeading();
  if ((f & TokenFlags.IsAtLineStart) && (t === SyntaxKind.BacktickToken || t === SyntaxKind.TildeToken)) {
    const run = (f & TokenFlagRunLengthMask) >> TokenFlagRunLengthShift;
    if (run >= 3) return parseCodeFence();
  }
  if ((f & TokenFlags.IsAtLineStart) && isListMarkerAhead()) return parseList();
  if (isThematicBreakAhead()) return parseThematicBreak();
  if (isSetextUnderlineAhead()) return parseSetextHeading(); // parser-owned detection

  return parseParagraph();
}
```

### Inline Engine (Delimiter Stack)

- Use scanner-provided delimiter flags for `*` and `_` (`CanOpen`, `CanClose`, run-length) to avoid rescans.
- Backtick spans pair by equal run-length; content may include fewer backticks.
- Links/images: parse resource forms immediately; reference forms recorded as unresolved, then resolved in a post-pass.
- Autolinks (angle): trust scanner strict detection; apply micromark punctuation trimming on the constructed URL.

### Whitespace and Breaks

- `WhitespaceSeparationNode(count)` is emitted only between block nodes (top-level or inside block containers). Never emitted inside inline content.
- Hard line breaks: two trailing spaces before newline yield `BreakNode(hard: true)`; other paragraph newlines are soft breaks.

### Links, Images, and Reference Resolution

- During block parsing, collect `[label]: destination "title"` lines hinted by `TokenFlags.MaybeDefinition` into `referenceDefinitions` with normalized labels (trim, collapse internal whitespace, case-fold).
- After building the AST, run `resolveReferences(DocumentNode, defs)` to bind reference links/images; emit `UNRESOLVED_REFERENCE` diagnostics when missing.

### Scanner Contracts Consumed (from `src/scanner.ts`)

- Delimiter flags and run lengths for emphasis/strong and code spans.
- `TokenFlags.IsAtLineStart`, `ContainsHtmlBlock`, raw-text/RCDATA flags.
- `getColumn()` for list/blockquote indent and lazy continuation (tabs=4).
- Autolink strictness and kind (URL/email) via flags/value.
- `TokenFlags.IsBlankLine` on `NewLineTrivia` to coalesce into `WhitespaceSeparationNode`.

## HTML Integration Strategy (Native)

### Tree Builder Rules

- HTML is parsed natively, first-class alongside Markdown. No external parser.
- Maintain a stack of open elements. For each start tag:
  - Create `HtmlElementNode` with attribute slices (`AttributeSlice[]`).
  - If the tag is a void element (`area, base, br, col, embed, hr, img, input, link, meta, param, source, track, wbr`), mark `selfClosing: true` even without `/>`.
  - Optional-end autoclose:
    - `p` autocloses on encountering any block-level start or `</p>`.
    - `li` closes on next `li` or end of list.
    - `dt` closes on next `dt`/`dd`; `dd` closes on next `dt`/`dd`.
  - On a mismatched close tag, bubble up and autoclose intervening nodes as needed; emit `MISMATCHED_CLOSE` if the name does not match the nearest candidate.

### Attributes

- Parse names and values into `AttributeSlice` entries; values are not decoded eagerly.
- Quote detection tracked via `QuoteKind`; boolean attributes have `valueStart/valueEnd` omitted.
- Diagnostics: `DUPLICATE_ATTRIBUTE`, `INVALID_ATTRIBUTE_SYNTAX`, `INVALID_BOOLEAN_ATTRIBUTE_VALUE` with source slices.

### Content Models

- RAWTEXT/RCDATA are signaled by the scanner; when inside these, do not parse Markdown.
- Otherwise, Markdown remains fully active inside element content. Child parsing respects the current parser mode:
  - In Block mode, element children may be block or inline nodes.
  - In Inline mode, restrict to inline children.

### Other HTML Nodes

- Emit dedicated nodes for `HtmlComment`, `HtmlDoctype`, and `HtmlCdata` with exact source slices and scanner unterminated flags propagated.

## Error Recovery and Diagnostics

### Structured Diagnostics

- Define enums in `diagnostics.ts`:
  - `enum DiagnosticCategory { Syntax, Structure, Nesting, Attribute, Reference, Whitespace, Encoding }`
  - `enum ParseErrorCode { UNCLOSED_TAG, MISMATCHED_CLOSE, INVALID_NESTING, RAW_TEXT_MISSING_CLOSE, INVALID_ATTRIBUTE, ATTRIBUTE_MISSING_VALUE, INVALID_ENTITY, INVALID_LIST_INDENT, UNCLOSED_EMPHASIS, MALFORMED_LINK, UNTERMINATED_CODE_FENCE, INVALID_REFERENCE, DUPLICATE_DEFINITION, UNRESOLVED_REFERENCE, MALFORMED_TABLE, TABLE_ALIGNMENT_MISMATCH, UNBALANCED_MATH_DELIMITER }`
- `ParseDiagnostic` carries `code`, `category`, `subject`, `pos`, `end`, `message?`, and `related` ranges for linking openers/closers.

### Permissive Recovery with Bounded Consumption

```typescript
function parseWithRecovery<T extends Node>(
  parseFunc: () => T | null,
  code: ParseErrorCode,
  subject: string
): T | TextNode {
  const start = scanner.getTokenStart();
  try {
    const out = parseFunc();
    if (out) return out;
  } catch (e) {
    addDiagnostic(code, DiagnosticCategory.Syntax, subject, start, scanner.getTokenEnd(), String((e as Error).message));
  }
  const { text, end } = recoverToSafeBoundary();
  return createTextNode(start, end, text);
}

function recoverToSafeBoundary(): { text: string; end: number } {
  // Boundaries per mode
  // Block: line start construct tokens (#, >, list markers, fences, setext lines, valid HTML starts), blank line, EOF.
  // Inline: newline, block cutover, matching closing HTML tag, EOF.
  // Also impose a hard cap (e.g., 1024 chars) to avoid pathological scans.
}
```

Prefer `createMissingNode(kind)` to preserve structure; degrade to text only after small bounded scans.

### Source Map

- `ParseResult.sourceMap` includes `lineStarts: number[]` and helpers for lazy line/column lookup (TypeScript pattern).

## Incremental Parsing Engine

- `syntax-cursor.ts`: `moveTo(pos)`, `current()`, `tryReuse(kind, pos, end, sentinels)`.
- Reuse invariants per subtree kind:
  - HTML elements: same `pos/end`, same case-folded start/end tag names; safe if attribute spans unchanged.
  - Fenced code: same fence run length and opener/closer kinds; body may change without affecting neighbors.
  - Lists: marker/indent and container boundaries unchanged.
- `incremental.ts`: `computeChangeRange(oldText, newText, edits)` and snap to nearest block/HTML boundaries to avoid micro-fragmentation.
- Preserve node identities to maximize reuse; drop diagnostics only inside changed spans; mark fragile regions with `NodeFlags.ContainsError` to avoid reuse.

## Implementation Phases (timeline-free, deliverable-driven)

### Phase 1: Core Parser Infrastructure
- Parser interface and factory (`createParser()`), `ParseOptions`, `ParseResult`.
- AST node definitions with finalized attribute model and `NodeFlags`.
- Node factory (`ast-factory.ts`): `startNode(kind)`, `finishNode(node)`, `createMissingNode(kind)`, `setParent()` gated by option.
- Parser utilities (`parser-utils.ts`): `skipTrivia()`, `parseExpected(kind)`, `parseOptional(kind)`, `tryParse<T>()` thin wrappers over `scanner.tryScan()`.
- Document-level orchestration and basic blocks: paragraphs, ATX headings, HTML elements (start/comment/doctype/CDATA).
- Error recovery framework with bounded `recoverToSafeBoundary()`.

### Phase 2: Inline Parsing Engine
- Delimiter stack for `*`/`_` using scanner flags (`CanOpen/CanClose`, intraword `_`).
- Inline code spans via backtick run-length pairing.
- Links/images: resource forms; angle autolinks with punctuation trimming.
- Break handling: hard vs soft; keep trivia out of inline AST except explicit breaks.

### Phase 3: HTML Element Parsing (Native Tree Builder)
- Start/close tags, attribute slices with `QuoteKind`, void elements, optional-end autoclose rules.
- Content models: RAWTEXT/RCDATA (no Markdown) vs normal (Markdown active by mode).
- `HtmlCommentNode`, `HtmlDoctypeNode`, `HtmlCdataNode` emission with unterminated diagnostics.

### Phase 4: Advanced Block Constructs
- Lists: unordered/ordered with indent 0–3; ordered list metadata (start, delimiter). Use `getColumn()`; implement lazy continuation; compute `tight` via blank-line runs.
- Blockquotes with lazy continuation and nested lists interaction.
- Fenced and indented code blocks (use run-length flags; info string slices via `getTokenValue()`).
- Thematic breaks and Setext headings (parser-owned underline detection next line after paragraph).

### Phase 5: Extended Syntax
- Tables (GFM pipe): row 2 alignment gate; escaped pipes and code spans inside cells; alignment on cells/columns. Scanner does not gate tables; detection is parser-only via the alignment row on line 2.
- Math: `$` / `$$` nodes as opaque spans; store raw slices; no decoding.
- Frontmatter: YAML/TOML/JSON as opaque content slices; balanced fences only at document start.
- Strikethrough (`~~`) and task list items parsing hooks.

### Phase 6: Diagnostics and Reference Resolution
- Complete diagnostic enums and messages; link opener/closer via `related` ranges.
- Reference definitions collection and post-pass resolver; emit `DUPLICATE_DEFINITION` and `UNRESOLVED_REFERENCE`.
- Whitespace policy: emit `WhitespaceSeparationNode` only between blocks.

### Phase 7: Incremental Parsing and Performance
- Syntax cursor + reuse invariants; change-range snapping; node identity preservation.
- Bench harness integration; performance audits; minimal allocations (lazy decoding, numeric slices).
- Source map finalization with `lineStarts`.

## Test & Parity Map

Alignment targets taken from packages in this workspace (no external parsers), with concrete acceptance criteria:

- micromark emphasis/strong: delimiter stack parity; tests for `a*bc*`, `a**b**`, intraword `_` blocked.
- micromark HTML flow hinting: `ContainsHtmlBlock` used as structural hint only; comments/doctype/CDATA nodes with exact spans.
- Lists/indentation: indent 0–3, ordered list `start` and delimiter, lazy continuation, tabs→columns via `getColumn()`.
- Autolinks (angle): strict detection; punctuation trimming identical to micromark.
- Tables (GFM): alignment row on line 2; escaped pipes; inline Markdown in cells; alignment metadata.
- Math: `$`/`$$` balanced; raw slices preserved; no decoding.
- MDX/JSX coexistence: if enabled later, attribute adorners require whitespace before `{` to avoid collision.

## Summary

This plan specifies a single-pass, editor‑grade Markdown parser with native HTML:

- **Unified HTML/Markdown parsing** with a minimal native HTML tree‑builder.
- **Direct AST construction** (TypeScript‑style) with lazy slicing and minimal allocations.
- **Clear whitespace and break policy** and parser‑owned Setext detection.
- **Structured diagnostics** with bounded recovery preserving structure when possible.
- **Incremental parsing** via syntax cursor and reuse invariants.

All former “further updates” are now integrated into the body above. No outstanding gaps remain in the plan.

## Future Optimization: HTML tag name interning

- Intern frequent HTML tag names into a compact enum (e.g., uint8/uint16) to avoid per-node string allocation.
- Keep a slice-based fallback for uncommon or custom tag names to maintain correctness without bloating the enum.
- Store the interned `tagId` on `HtmlElementNode` (or in the arena) with a bit indicating whether a slice fallback is used.
- This is a non-functional optimization and can be introduced later without impacting the parser architecture.

## Scanner Hygiene Checklist (with rationale)

General rationale: keep the scanner context-free, allocation-light, and fast; keep structure, pairing, and recovery in the parser. This separation:
- Improves incremental parsing (scanner can restart anywhere; parser controls reuse).
- Prevents hidden state coupling (e.g., paragraph/setext), reducing inconsistent tokens.
- Preserves TS-like linear performance and low allocations.

- __Setext heading coupling__
  - Action: remove/ignore any `inParagraph` or setext-specific coupling in the scanner; parser owns setext detection (paragraph followed by underline on next non-blank line).
  - Why: requires paragraph context the scanner shouldn’t hold; avoids inconsistent tokenization; improves incremental stability.
  - Verification: unit tests where paragraphs followed by `===`/`---` produce setext headings; lists/blockquote interactions handled by parser.

- __Table gating in scanner__
  - Action: do not detect tables in the scanner; emit plain `|`, `:` and text only.
  - Why: table recognition needs multi-line state (alignment row on line 2); parser is the right layer.
  - Verification: header row + alignment row forms a table; header-only is a paragraph; escaped pipes honored.

- __Blank line signaling__
  - Action: ensure `TokenFlags.IsBlankLine` is set on `NewLineTrivia` sequences; no separate blank-line tokens.
  - Why: parser coalesces into `WhitespaceSeparationNode(count)` only between blocks; keeps inline clean.
  - Verification: consecutive blank lines at block level yield a single separation node with correct `count`.

- __getColumn() semantics__
  - Action: guarantee tabs=4 conversion and stable column counts regardless of rescans.
  - Why: list/blockquote indent and lazy continuation correctness depend on accurate columns.
  - Verification: tests with tabs before markers; nested lists and blockquotes compute expected nesting.

- __Autolinks: strict detection only__
  - Action: scanner recognizes strict angle autolinks (URL/email) but performs no punctuation trimming.
  - Why: trimming is a parser presentation concern; scanner should not alter content semantics.
  - Verification: `<https://a.b>.` tokenizes link content without trailing dot; parser trims in node construction.

- __Delimiter flags and run lengths__
  - Action: ensure `CanOpen/CanClose` and run-length packing for `*`, `_`, and backticks/tilde; block intraword `_`.
  - Why: parser pairs delimiters in O(n) without rescans; matches micromark semantics.
  - Verification: emphasis/strong test matrix (`a*bc*`, `a**b**`, `_intraword_`) passes using flags only.

- __Ordered list metadata__
  - Action: expose `getOrderedListStart()` and delimiter kind (`.` or `)`); mark only when indent 0–3 at line start.
  - Why: avoids reparsing numbers; aligns with micromark; keeps parser simple and fast.
  - Verification: `123.` and `1)` produce correct starts; over-indented markers not recognized.

- __RAWTEXT/RCDATA mode flags__
  - Action: signal entry/exit for `<script>/<style>` (RAWTEXT) and `<title>/<textarea>` (RCDATA); case-insensitive end tags.
  - Why: parser must suspend Markdown only in these content models.
  - Verification: Markdown inside `<div>` active; inside `<script>` inert until matching `</script>` regardless of case.

- __HTML block hint__
  - Action: keep `ContainsHtmlBlock` as a hint only; never globally suspend Markdown based on it.
  - Why: we parse HTML natively with Markdown active; the hint helps container decisions but must not change inline rules.
  - Verification: lines flagged as HTML block still allow inline Markdown outside RAWTEXT/RCDATA.

- __Rescanning helpers remain policy-free__
  - Action: keep `reScan*` helpers (backtick/tilde/pipe/hash/slash/dollar) pure; do not encode parser policies.
  - Why: enables cheap parser speculation without duplicating scanner logic.
  - Verification: speculative parses can roll back with consistent token views.

- __Stable value slices__
  - Action: `getTokenValue()` returns stable slices for fences (info string) and autolinks.
  - Why: parser lazily interprets values without allocations; required for incremental correctness.
  - Verification: rescans do not mutate prior value slices; info strings preserved verbatim.

- __Scanner diagnostics scope__
  - Action: limit to scanning errors (unterminated comment/doctype/CDATA, malformed entity/autolink); leave structure errors to parser.
  - Why: clear separation of concerns; parser can recover with context.
  - Verification: diagnostics categories align (`Syntax` vs `Structure/Nesting`); no duplicate messages.
