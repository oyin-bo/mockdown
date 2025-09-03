# Prior Art and Design Direction

## Introduction
We are building an editor-grade Markdown parser that treats HTML as a first-class syntax, not a foreign embedding. The design prioritizes low memory, precise absolute offsets, and incremental updates suitable for live editing and large documents. Existing pipelines (micromark → mdast → rehype) are powerful but allocate token/event streams and often treat HTML as literals or route to external parsers, adding latency and memory. Our approach uses a single mutable scanner (TypeScript-style), direct AST construction with numeric `pos/end`, and native HTML parsing to deliver correctness with minimal allocations.

## Scope
### In Scope
- Core Markdown block/inline constructs with exact offsets.
- Native HTML parsing: elements, attributes (quoted/unquoted), comments, doctype, CDATA, raw-text elements (script/style/textarea/title).
- Entities: decoding where HTML requires, while preserving original spans.
- Single-pass scanner with mode switching (Markdown ↔ HTML), no token arrays.
- Direct AST build with `pos/end`; optional parent links; lazy line/column via line-starts cache.
- Incremental parsing: minimal reparses around edits; subtree reuse; diagnostics.
- Library delivery: TypeScript types, Node/browser compatibility.

### Out of Scope (initial)
- Using any external parsers for HTML or core Markdown elements.
- Rendering/formatting, DOM/layout, CSS/JS execution.
- Full templating/MDX/Liquid, macro systems, or plugin API beyond minimal hooks.
- Network/streaming I/O; encoding transcoding beyond UTF-8/UTF-16 handling.

## Goals (Editor-Optimized)
- **Speed**: low-latency parse, incremental-friendly.
- **Precision**: absolute offsets for all nodes; exact source mapping.
- **Memory**: no token arrays; compact AST; lazy computations.
- **Permissive**: robust error recovery; continue on malformed input.
- **HTML first-class**: parse HTML natively (no external parser) as structural nodes.

## Survey of Existing Approaches
- **Micromark** (`micromark/micromark/packages/micromark/dev/lib/…`)
  - State-machine tokenizer over chunked input; emits token events; precise offsets; excellent correctness and extensibility.
  - Memory impact from token/event stream and downstream compilation.
- **mdast-util-from-markdown** (`mdast-core/mdast-util-from-markdown/dev/lib/index.js`)
  - Compiles micromark events to MDAST; positions preserved; HTML represented as literal strings (not parsed structure).
- **Rehype-parse** (`rehype-hast/rehype/packages/rehype-parse/lib/index.js`)
  - HTML → HAST via `hast-util-from-html`/parse5; good errors; separate flow; adds parser boundary and potential copies.
- **Markdown-it** (`specs-comparison/markdown-it/README.md`)
  - Rule-based block/inline passes; regex and custom rules; less precise offsets; simpler error handling.
- **Commonmark.js** (`specs-comparison/commonmark.js/…`)
  - Linked-node AST, line/column positions; simpler memory model; no absolute offsets by default.
- **TypeScript compiler** (`typescript/src/compiler/…`)
  - Single mutable scanner; tokens as enums + indices; AST nodes use numeric `pos/end`; lazy line-map; incremental reuse; JSX handled via scanner modes.

## Key Takeaways
- **TS-style scanner**: one source buffer + indices; derive token text on demand (`typescript/src/compiler/scanner.ts` `createScanner()`, `getTokenText()`); `tryScan`/`lookAhead` for recovery without allocations (`scanner.ts`).
- **AST with `pos/end` only**: absolute offsets, lazy line/column via cached line starts.
- **No token arrays**: parser consumes scanner directly and builds nodes.
- **Optional parent links**: configurable to reduce memory.
- **Incremental**: stable spans enable subtree reuse; track error-adjacent nodes.
- **HTML should be native**: treat tags/attrs/text/comments/doctype as structured nodes, not literals.

## Preferred Future Approach (HTML as First-Class, No External Parser)
- **Unified scanner with modes**: MarkdownFlow, MarkdownInline, HtmlTag, HtmlAttr, HtmlText, HtmlComment, HtmlDoctype, HtmlCdata (mode switching patterned after JSX scanning in `typescript/src/compiler/scanner.ts` `scanJsxToken()` / `reScanLessThanToken()`).
- **Angle-bracket disambiguation** (JSX-inspired): `lookAhead` + `reScan*` to decide tag vs text; rollback on failure (see `scanner.ts` `lookAhead()`, `tryScan()`, `reScanLessThanToken`).
- **HTML attributes**: scan quoted/unquoted without allocations; materialize values only on access.
- **Raw-text elements**: `script/style/textarea/title` handled by HtmlText mode until matching close tag.
- **Direct AST build**: element/comment/text/doctype nodes with `pos/end`; Markdown and HTML interleave naturally.
- **Permissive recovery**: degrade malformed constructs to text when parses fail; keep parsing.
- **Incremental updates**: reuse unaffected subtrees; reparse minimal spans around edits.

## Valuable Code References (What & Why)
- `micromark/micromark/packages/micromark/dev/lib/parse.js` — Construct orchestration; extension hooks and content types.
- `mdast-core/mdast-util-from-markdown/dev/lib/index.js` — Event→AST patterns; how positions propagate; current HTML-as-literal behavior.
- `rehype-hast/rehype/packages/rehype-parse/lib/index.js` — Error surfacing pattern for HTML parsing (we’ll emulate diagnostics, not the parser).
- `typescript/src/compiler/scanner.ts` — Single mutable scanner; token text on demand; JSX scan modes (`scanJsxToken`, `reScanLessThanToken`); `tryScan`/`lookAhead`; line-map cache (`computeLineStarts`, `getLineStarts`).
- `typescript/src/compiler/parser.ts` — Direct AST construction; `createSourceFile`/`updateSourceFile`; incremental hooks; state init/cleanup.
- `typescript/src/compiler/types.ts` — `ReadonlyTextRange { pos,end }`; compact node layout; flags used for incremental/error context.
- `ast-specs/unist/readme.md` — Unist conventions; informs interoperability and node shapes.
- `ast-specs/mdast/readme.md` — MDAST inventory; highlights limits of `html` literal nodes.
- `ast-specs/hast/readme.md` — HAST node model to mirror for element/comment/text with offsets.

## High-Level Draft Architecture

### Functional Modules
- **Scanner**: single mutable scanner with modes; yields current token kind/flags + indices; no token objects.
- **Parser**: direct AST builder; interleaves Markdown and HTML parsing; maintains `pos/end`; optional parent links; emits diagnostics.
- **Incremental Engine**: span-based reuse (syntax cursor), minimal reparses; flags for error-adjacent nodes.
- **AST Utilities**: slicing text on demand, entity decode helpers, attribute/value normalization.

### Scanner and Parser I/O (TS-style)
- **Scanner input**: raw source string and current mode (Markdown/HTML variants). No preprocessor; we operate on the original text (TS: `createScanner(languageVersion, skipTrivia, languageVariant, text)` in `scanner.ts`).
- **Scanner output**: pull-based APIs (methods) exposing current token kind (`getToken()`), `tokenStart`/`getTokenPos()`, end (`getTextPos()`), `tokenFlags` (`getTokenFlags()`), optional value (`getTokenValue()`); `lookAhead()`/`tryScan()` for rollback. No arrays, no callbacks, no retained token stream.
- **Parser input**: the live scanner (parser calls `scan()` as needed), parse options, and optional incremental cursor (TS: `parseSourceFile(..., syntaxCursor)` in `parser.ts`).
- **Parser output**: AST root with nodes carrying numeric `pos/end` (`types.ts` `ReadonlyTextRange`), plus diagnostics. No token arrays produced.

### Data Flow
`Source text` → Scanner (modes switch Markdown↔HTML) → Parser builds AST nodes directly → Incremental Engine caches/reuses spans.

### Interesting Aspects
- **Mode switching (JSX-inspired)**: `reScanLessThan`-like lookahead for `<` to disambiguate tags from text.
- **Raw-text fast path**: single-pass consumption until close tag; no per-char nodes.
- **Lazy materialization**: attribute/text values sliced only on demand; line/column computed from cached line starts.
- **Configurable parents**: toggle parent pointers for memory vs ergonomics.
- **Editor-grade incrementality**: small edits trigger local reparses; AST identities preserved elsewhere.

### Incremental Engine in TypeScript (for reference)
- Exists: `typescript/src/compiler/parser.ts` exposes `updateSourceFile(...)` which delegates to `IncrementalParser.updateSourceFile(...)` to reuse subtrees; the parser threads a `syntaxCursor` to enable reuse. We follow a similar span-based reuse strategy.
- **Lazy materialization**: attribute/text values sliced only on demand; line/column computed from cached line starts.
- **Configurable parents**: toggle parent pointers for memory vs ergonomics.
- **Editor-grade incrementality**: small edits trigger local reparses; AST identities preserved elsewhere.