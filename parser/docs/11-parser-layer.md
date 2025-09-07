# Parser Layer

The scanner work being well on the way, we need to start working on the parser layer sitting above the scanner.

The planning stage should put forward a proposal for the following:

* High-level API for the parser from the consumer side
* Rough shape of AST node base (common shape) and the ways it can extend for specific nodes
* List of nodes, with main data carried by them
* Facilities to walk AST tree
* Facilities to apply textual diff to an underlying Markdown document and receive a reparsed AST tree
* Other features that can be used for editors and other relevant apps
* Specific integrations with ProseMirror -- one of the flagship use cases
* Ability to generate HTML
* A testing harness similar to verifyTokens implemented for the scanner, ideally similar
* Extending the benchmark harness to cover the parser layer

These requirements are the most important plan to work out, and put more flesh to the skeleton.

---

The next step in the planning will involve a breakdown of the work into tasks.

Ideally the bulk of the work can be done in parallel with the completion of the scanner. As much as possible it's best to have parser work also proceeding concurrently within the parser layer too.

## Feature Set

### 1. High-Level Parser API

**Design Philosophy**: Following MixPad's "smart scanner, simple parser" principle, the parser API should be minimal and direct, consuming scanner tokens efficiently while providing editor-grade capabilities.

**Core API Surface**:
```typescript
// Primary parsing interface
interface Parser {
  parseDocument(text: string, options?: ParseOptions): ParseResult;
  parseIncremental(
    document: DocumentNode, 
    changes: TextChange[], 
    options?: ParseOptions
  ): ParseResult;
}

// Factory and configuration
function createParser(options?: ParserOptions): Parser;

interface ParseOptions {
  enableParentLinking?: boolean;    // Performance vs convenience trade-off
  enablePositionMapping?: boolean;  // For editor use cases
  enableErrorRecovery?: boolean;    // Graceful degradation
  htmlMode?: 'native' | 'passthrough'; // HTML parsing strategy
}

interface ParseResult {
  document: DocumentNode;
  diagnostics: Diagnostic[];
  parseTime: number;              // Performance monitoring
  reuseStats?: ReuseStatistics;   // Incremental parsing metrics
}
```

**Justification**: This API design balances simplicity with power. The dual parsing modes (full vs incremental) enable both batch processing and live editing scenarios. Optional features can be disabled for performance in non-editor contexts.

### 2. AST Node Architecture

**Base Node Design**: Building on the proven foundation from `parser/prev/ast-types.ts`, with enhancements for editor scenarios:

```typescript
// Unified base with packed kind+flags for memory efficiency
interface Node {
  kindFlags: number;      // Lower 8 bits: NodeKind, upper 24 bits: NodeFlags
  pos: number;           // Absolute byte offset start (like TypeScript)
  end: number;           // Absolute byte offset end
  parent?: Node;         // Optional parent linking (gated by option)
}

// Node categories for type safety and traversal
type BlockNode = 
  | DocumentNode | ParagraphNode | HeadingNode | BlockquoteNode
  | ListNode | ListItemNode | CodeBlockNode | ThematicBreakNode
  | HtmlElementNode | TableNode | MathBlockNode;

type InlineNode = 
  | TextNode | EmphasisNode | StrongNode | InlineCodeNode 
  | StrikethroughNode | LinkNode | ImageNode | MathInlineNode
  | BreakNode | HtmlElementNode;

// Container nodes carry children with guaranteed parent consistency
interface ContainerNode extends Node {
  children: Node[];
}
```

**Key Enhancements**:
- **Consistent positioning**: All nodes use absolute byte offsets for precise editor integration
- **Optional parent linking**: Can be disabled for memory efficiency in non-editor scenarios  
- **Packed kind+flags**: Reduces memory footprint (4 bytes vs 8 bytes for separate fields)
- **Native HTML integration**: HTML elements can appear at any level, not just as blocks

### 3. Comprehensive Node Catalog

**Block-Level Nodes**:
- `DocumentNode`: Root container with `children: BlockNode[]`, `lineStarts: number[]`
- `ParagraphNode`: Inline content container with lazy break resolution
- `HeadingNode`: Level 1-6 with ATX/Setext distinction and inline children
- `BlockquoteNode`: Nested block content with lazy continuation support
- `ListNode`: Ordered/unordered with tight/loose semantics and start numbers
- `ListItemNode`: Block content container with task list extensions
- `CodeBlockNode`: Fenced/indented with info string and raw content preservation
- `ThematicBreakNode`: Marker type and run length for reconstruction
- `TableNode`: GFM tables with alignment metadata and cell structure
- `MathBlockNode`: TeX content with delimiter preservation for round-trip accuracy
- `HtmlElementNode`: Native HTML with attributes, self-closing detection

**Inline-Level Nodes**:
- `TextNode`: Raw text content with efficient slice representation
- `EmphasisNode`/`StrongNode`: Delimiter metadata for reconstruction
- `InlineCodeNode`: Backtick count and span content
- `StrikethroughNode`: GFM deletion syntax
- `LinkNode`/`ImageNode`: URL, title, and reference-style linking
- `MathInlineNode`: Inline TeX with balance validation
- `BreakNode`: Soft/hard break distinction critical for editor behavior

### 4. AST Traversal and Manipulation

**Walking Infrastructure**:
```typescript
// High-performance visitor pattern with early termination
interface Visitor {
  visitNode?(node: Node, parent?: Node): VisitResult;
  visitDocument?(node: DocumentNode): VisitResult;
  visitParagraph?(node: ParagraphNode): VisitResult;
  // ... specialized visitors for each node type
}

enum VisitResult {
  Continue,           // Process children normally
  Skip,              // Skip children but continue traversal
  Stop               // Terminate traversal entirely
}

function walkAST(root: Node, visitor: Visitor): void;
function walkASTBottomUp(root: Node, visitor: Visitor): void;

// Efficient queries for editor scenarios
function findNodeAt(root: Node, offset: number): Node | undefined;
function findNodesInRange(root: Node, start: number, end: number): Node[];
function getNodePath(node: Node): Node[]; // Path from root to node
```

**Transformation Utilities**:
```typescript
// Immutable updates for undo/redo scenarios
function replaceNode(root: Node, target: Node, replacement: Node): Node;
function insertNode(root: Node, parent: Node, index: number, node: Node): Node;
function removeNode(root: Node, target: Node): Node;

// Efficient range operations for editor commands
function replaceRange(root: Node, start: number, end: number, nodes: Node[]): Node;
```

### 5. Incremental Parsing and Diff Application

**Smart Reuse Strategy**: Leveraging MixPad's zero-allocation scanner architecture for minimal re-parsing:

```typescript
interface TextChange {
  start: number;        // Absolute byte offset
  deleteLength: number; // Bytes to delete
  insertText: string;   // Text to insert
}

interface ReuseStatistics {
  nodesReused: number;
  nodesReparsed: number;
  bytesReused: number;
  totalBytes: number;
}

// Rollback boundary detection using node flags
enum NodeFlags {
  CanRollback = 1 << 0,    // Node can serve as reparse boundary
  IsIncremental = 1 << 1,  // Node created via incremental parsing
  HasSyntaxError = 1 << 2, // Error recovery occurred
  // ... other flags
}
```

**Reuse Algorithm**:
1. **Boundary Detection**: Identify rollback points using `CanRollback` flag and structural heuristics
2. **Damage Assessment**: Determine minimum subtree requiring re-parsing
3. **Incremental Rescan**: Use scanner's position restoration for efficient token generation  
4. **Tree Grafting**: Merge new subtree with reused nodes, updating positions

**Justification**: This approach minimizes allocations while maintaining correctness. The `CanRollback` flag system allows parser-level control over granularity vs performance trade-offs.

### 6. Editor Integration Features

**Position Mapping**: Critical for LSP and editor scenarios:
```typescript
interface PositionMapper {
  offsetToPosition(offset: number): { line: number; column: number };
  positionToOffset(line: number, column: number): number;
  getLineStarts(): number[];
}

// Built into DocumentNode for efficiency
interface DocumentNode extends Node {
  lineStarts: number[];           // Precomputed for O(log n) lookups
  positionMapper?: PositionMapper; // Lazy initialization
}
```

**Error Recovery**: Graceful degradation for malformed input:
```typescript
interface Diagnostic {
  severity: 'error' | 'warning' | 'info';
  start: number;
  end: number;
  message: string;
  code: string;        // Machine-readable error code
  relatedNodes?: Node[]; // Context for complex errors
}

// Recovery strategies embedded in parser
enum RecoveryStrategy {
  ConvertToText,      // Degrade construct to plain text
  CreateMissing,      // Synthesize missing elements
  SkipToNext,        // Advance to next safe boundary
}
```

### 7. ProseMirror Integration Specifics

**Schema Mapping**: Direct translation between MixPad AST and ProseMirror document structure:
```typescript
interface PMIntegration {
  // Convert MixPad AST to ProseMirror document
  astToPMDoc(document: DocumentNode, schema: Schema): PMDocument;
  
  // Convert ProseMirror document to MixPad AST
  pmDocToAST(pmDoc: PMDocument): DocumentNode;
  
  // Incremental updates for collaborative editing
  applyPMTransaction(
    document: DocumentNode, 
    transaction: Transaction
  ): { document: DocumentNode; changes: TextChange[] };
}

// ProseMirror-optimized node attributes
interface PMCompatibleNode extends Node {
  pmAttrs?: Record<string, any>;  // ProseMirror attributes cache
  pmMarks?: Mark[];              // Inline mark cache
}
```

**Collaborative Editing Support**:
- **Operational Transform**: Convert MixPad changes to ProseMirror steps
- **Position Tracking**: Maintain cursor positions across incremental updates
- **Conflict Resolution**: Merge concurrent edits using AST structure awareness

### 8. HTML Generation Pipeline

**Multi-Target Rendering**: Support various HTML output scenarios:
```typescript
interface HTMLRenderer {
  renderDocument(document: DocumentNode, options?: RenderOptions): string;
  renderNode(node: Node, options?: RenderOptions): string;
  
  // Streaming for large documents
  renderDocumentStream(
    document: DocumentNode, 
    output: WritableStream,
    options?: RenderOptions
  ): Promise<void>;
}

interface RenderOptions {
  target: 'html5' | 'xhtml' | 'fragment';
  sanitize?: boolean;           // XSS protection
  includeSourceMaps?: boolean;  // Debugging information
  classPrefix?: string;         // CSS class prefixing
  mathRenderer?: 'katex' | 'mathjax' | 'raw';
  highlighter?: SyntaxHighlighter;
}
```

**Native HTML Passthrough**: Since MixPad parses HTML natively, rendering can preserve original HTML exactly:
```typescript
interface HtmlElementNode extends Node {
  tagName: string;
  attributes: AttributeSlice[];  // Raw attribute preservation
  selfClosing: boolean;
  rawHTML?: string;             // Original HTML for exact reconstruction
}
```

### 9. Parser Testing Harness (verifyAST)

**Annotated AST Testing**: Extending MixPad's successful annotated markdown approach to AST verification:

```typescript
// Example annotated AST test
const astTest = `
# Heading 1
Some **bold** text

1    2  3    4   5
@1 Document
  @2 Heading level=1
    @3 Text "Heading 1"
  @4 Paragraph  
    @5 Text "Some "
    @6 Strong
      @7 Text "bold"
    @8 Text " text"
`;

expect(verifyAST(astTest)).toBe(astTest);
```

**Testing Infrastructure**:
```typescript
function verifyAST(input: string): string;

interface ASTAssertion {
  marker: string;           // Position marker (1-9, A-Z)
  nodeKind: NodeKind;      // Expected node type
  attributes?: Record<string, any>; // Node-specific attributes
  text?: string;           // Text content for text nodes
  children?: number;       // Expected child count
}
```

**Error Injection**: When tests fail, errors are injected directly into the annotated format showing expected vs actual AST structure, maintaining MixPad's excellent debugging experience.

### 10. Benchmark Infrastructure Extension

**Performance Monitoring**: Extending existing benchmark infrastructure to cover parser performance:

```typescript
interface ParserBenchmark {
  name: string;
  input: string;           // Test document
  iterations: number;      // Benchmark iterations
  
  // Metrics collection
  measureParsing(): BenchmarkResult;
  measureIncremental(): BenchmarkResult;
  measureMemoryUsage(): MemoryProfile;
}

interface BenchmarkResult {
  parseTime: number;       // Total parsing time (ms)
  throughput: number;      // MB/s processing rate
  allocations: number;     // Memory allocations
  reuseRate?: number;      // Incremental reuse percentage
}
```

**Regression Testing**: Continuous performance monitoring with thresholds:
- Parse time regression alerts (>10% slowdown)
- Memory usage tracking (allocation count, peak usage)
- Incremental parsing efficiency metrics

## Task Breakdown and Implementation Strategy

### Phase 1: Core Infrastructure (Weeks 1-2)
**Independently Verifiable Tasks**:

1. **AST Type Definitions** (2 days)
   - Define complete node hierarchy in `ast-types.ts`
   - Implement packed kind+flags system
   - Add comprehensive type exports
   - **Verification**: TypeScript compilation + type tests

2. **Node Factory System** (2 days)  
   - Implement `ast-factory.ts` with all creation functions
   - Add parent linking utilities (optional)
   - Include position validation helpers
   - **Verification**: Unit tests for each factory function

3. **Parser Interface Design** (1 day)
   - Define `Parser`, `ParseOptions`, `ParseResult` interfaces
   - Implement factory function signatures
   - Add diagnostic system types
   - **Verification**: Interface compilation + API documentation

4. **Basic Traversal Infrastructure** (3 days)
   - Implement visitor pattern for AST walking
   - Add position-based node queries
   - Include path calculation utilities
   - **Verification**: Traversal unit tests with known trees

**Concurrent Opportunities**: Tasks 1-2 can run simultaneously, Task 3 can overlap with Task 1, Task 4 depends on Task 1 completion.

### Phase 2: Core Parsing Engine (Weeks 3-4)
**Independently Verifiable Tasks**:

5. **Document Parser** (3 days)
   - Implement top-level document parsing
   - Add block-level construct orchestration
   - Include line start calculation
   - **Verification**: Parse simple documents, verify structure

6. **Block Parsing** (4 days)
   - Implement paragraph, heading, blockquote parsing
   - Add list detection and parsing logic
   - Include code block handling
   - **Verification**: Individual block type tests

7. **Inline Parsing Engine** (3 days)
   - Implement emphasis/strong delimiter algorithm
   - Add link/image parsing with reference resolution
   - Include inline code span handling
   - **Verification**: Complex inline formatting tests

**Concurrent Opportunities**: Task 6 can be split into sub-tasks (paragraphs, headings, lists) that run in parallel. Task 7 can start once Task 5 provides the inline parsing entry point.

### Phase 3: Advanced Features (Weeks 5-6)
**Independently Verifiable Tasks**:

8. **Native HTML Integration** (4 days)
   - Implement HTML element parsing at all levels
   - Add attribute parsing with entity handling
   - Include self-closing tag detection
   - **Verification**: HTML+Markdown mixed content tests

9. **Extended Syntax** (3 days)
   - Add GFM table parsing with alignment detection
   - Implement math block/inline parsing
   - Include strikethrough and task lists
   - **Verification**: GFM compliance test suite

10. **Error Recovery System** (2 days)
    - Implement bounded error recovery strategies
    - Add diagnostic generation infrastructure
    - Include malformed input graceful degradation
    - **Verification**: Error case test suite

**Concurrent Opportunities**: Tasks 8-9 can run in parallel as they target different language features. Task 10 integrates across both.

### Phase 4: Incremental Parsing (Week 7)
**Independently Verifiable Tasks**:

11. **Reuse Boundary Detection** (2 days)
    - Implement rollback point identification
    - Add damage assessment algorithms
    - Include reuse statistics collection
    - **Verification**: Boundary detection unit tests

12. **Incremental Update Engine** (3 days)
    - Implement tree grafting for reused nodes
    - Add position updating for affected ranges
    - Include change application pipeline
    - **Verification**: Incremental parsing test suite

**Sequential Dependency**: Task 12 requires Task 11 completion for boundary detection.

### Phase 5: Testing and Integration (Week 8)
**Independently Verifiable Tasks**:

13. **AST Testing Harness (verifyAST)** (3 days)
    - Extend annotated markdown infrastructure for AST
    - Implement error injection for failed assertions
    - Add comprehensive assertion types
    - **Verification**: Test the testing infrastructure itself

14. **HTML Renderer** (2 days)
    - Implement HTML generation with multiple targets
    - Add sanitization and security features
    - Include source map generation
    - **Verification**: Round-trip accuracy tests

15. **ProseMirror Integration** (2 days)
    - Implement schema mapping utilities
    - Add transaction conversion helpers
    - Include collaborative editing support
    - **Verification**: ProseMirror integration tests

**Concurrent Opportunities**: Tasks 13-15 can all run in parallel as they target different integration scenarios.

### Phase 6: Performance and Polish (Week 9)
**Independently Verifiable Tasks**:

16. **Benchmark Infrastructure** (2 days)
    - Extend existing benchmarks for parser layer
    - Add memory profiling capabilities
    - Include performance regression detection
    - **Verification**: Benchmark suite execution

17. **Documentation and Examples** (2 days)
    - Complete API documentation with examples
    - Add integration guides for common scenarios
    - Include performance tuning recommendations
    - **Verification**: Documentation review and example execution

18. **Final Integration Testing** (1 day)
    - Run comprehensive test suite across all features
    - Validate performance characteristics
    - Ensure API consistency and completeness
    - **Verification**: Full test suite passing + benchmark results

**Sequential Approach**: These tasks build on all previous work and should be executed in order.

## Architectural Justifications

### Memory Efficiency Design Choices

**Packed Kind+Flags**: The decision to pack node kind and flags into a single 32-bit integer reduces memory footprint by 4 bytes per node. With potentially millions of nodes in large documents, this represents significant memory savings (40MB reduction in a 10M node document).

**Optional Parent Linking**: Parent pointers enable convenient tree traversal but double memory usage for references. Making this optional allows performance-critical scenarios to opt out while editor scenarios can opt in.

**Lazy Text Materialization**: Following the scanner's approach, text content is represented as byte ranges rather than materialized strings, avoiding allocations until actually needed.

### Incremental Parsing Strategy

**Rollback Boundaries**: Rather than trying to identify every possible reuse point, the system uses conservative boundaries that guarantee correctness. This trades some reuse opportunities for implementation simplicity and bug prevention.

**Position-Based Damage Assessment**: Using absolute byte positions for damage calculation avoids complex coordinate transformations and ensures consistent behavior across different change types.

### Testing Philosophy Consistency

**Annotated AST Format**: Extending the successful annotated markdown approach to AST testing maintains conceptual consistency while providing the same excellent debugging experience that makes the scanner tests so effective.

**Error Injection for Debugging**: When AST tests fail, injecting the actual structure directly into the test format provides immediate visual feedback on what went wrong, maintaining MixPad's principle of making debugging contextual and immediate.

This comprehensive feature set provides the foundation for a high-performance, editor-grade Markdown parser that maintains MixPad's principles of performance excellence while delivering the functionality needed for modern editing applications.