# Scanner-Parser Responsibility Shift: Moving Intelligence into the Scanner

## Executive Summary

This document explores strategies for shifting more parsing intelligence into the scanner, reducing the parser's need for rescanning, lookahead, and context-dependent token reinterpretation. The goal is to emit a cleaner, more decisive token stream where token meaning is already resolved.

## Current State Analysis

### Current Pain Points in Scanner-Parser Interface

**Rescanning Proliferation**: The scanner currently provides 7 rescanning methods (`reScanLessThanToken`, `reScanBacktickToken`, `reScanDollarToken`, `reScanPipeToken`, `reScanHashToken`, `reScanSlashToken`, `reScanGreaterThanToken`) because initial tokenization is conservative and context-unaware.

**Multi-line Coordination Complexity**: Constructs like Setext headings, tables, and code fences require the parser to coordinate across multiple lines, leading to complex state management and lookahead patterns.

**Ambiguous Token Semantics**: The same character sequences produce different tokens depending on context that the scanner doesn't have when initially scanning:
- `#` → ATX heading vs literal text vs URL fragment
- `|` → table delimiter vs literal pipe vs command separator in code
- `*` → emphasis delimiter vs list marker vs thematic break

**Flag Dependency**: The parser heavily relies on token flags (`IsAtLineStart`, `CanOpen`, `CanClose`, run-length encoding) to make decisions that could potentially be made earlier.

### Current Scanner Strengths to Build Upon

**Rich Metadata System**: The TokenFlags system already encodes sophisticated positional and semantic information.

**Lookahead Infrastructure**: `lookAhead()` and `tryScan()` provide the foundation for more aggressive scanning decisions.

**Character Classification**: Robust Unicode-aware character classification for emphasis boundaries, whitespace, etc.

**HTML Integration**: Native HTML parsing as first-class constructs, not afterthoughts.

## Shift Strategies: From Conservative to Aggressive

### Strategy 1: Eager Context Resolution (Practical)

**Concept**: Instead of emitting ambiguous tokens and rescanning, use lookahead aggressively to resolve context during initial scan.

**Implementation**:
```typescript
// Current: Conservative scan + rescan
scanHash(): SyntaxKind {
  pos++;
  return SyntaxKind.HashToken; // Parser rescans based on context
}

// Proposed: Eager resolution
scanHash(): SyntaxKind {
  if (isAtLineStart) {
    return this.scanPossibleATXHeading(); // Look ahead for space + content
  }
  if (this.isInURLContext()) {
    return this.scanURLFragment();
  }
  return this.scanLiteralHash();
}
```

**Pros**:
- Eliminates most rescanning needs
- Cleaner parser logic
- Better token semantic clarity
- Reduces parser-scanner round trips

**Cons**:
- Scanner becomes more complex and stateful
- Potential performance hit from aggressive lookahead
- Risk of over-fitting to current Markdown spec
- Harder to debug when tokenization goes wrong

**Mitigation Strategies**:
- Careful performance benchmarking
- Configurable scanning modes (conservative vs aggressive)
- Extensive test coverage for edge cases
- Clear documentation of scanning decisions

**Practical Considerations**:
- Start with high-confidence cases (ATX headings at line start)
- Gradually expand to more complex constructs
- Maintain fallback to conservative scanning for edge cases

### Strategy 2: Multi-line Construct Awareness (Moderately Outlandish)

**Concept**: Scanner maintains limited parsing state to handle constructs that span multiple lines (Setext headings, tables, code fences).

**Implementation**:
```typescript
interface ScannerState {
  potentialSetextParagraph?: {
    startPos: number;
    endPos: number;
    textContent: string;
  };
  openCodeFences: Array<{
    marker: '`' | '~';
    count: number;
    infoString: string;
    startPos: number;
  }>;
  tableContext?: {
    headerRow: boolean;
    alignmentRow: boolean;
    columnCount: number;
  };
}

scanLine(): SyntaxKind[] {
  // Look ahead to next line to resolve Setext headings
  if (this.state.potentialSetextParagraph && this.isSetextUnderline()) {
    return this.emitSetextHeadingTokens();
  }
  
  // Check if we're in a table context
  if (this.state.tableContext && this.isTableRow()) {
    return this.emitTableRowTokens();
  }
  
  return this.scanNormalLine();
}
```

**Pros**:
- Eliminates complex multi-line coordination in parser
- Scanner emits semantically correct tokens from the start
- Cleaner separation of concerns (scanner handles syntax, parser handles structure)
- Better incremental parsing support

**Cons**:
- Scanner becomes significantly more complex
- Blurs the line between scanning and parsing
- State management complexity in scanner
- Potential memory overhead for tracking constructs

**Mitigation Strategies**:
- Limit state to essential multi-line constructs only
- Use lightweight state structures
- Clear state boundaries and cleanup logic
- Extensive testing of state transitions

**Practical Considerations**:
- Implement incrementally, starting with Setext headings
- Consider hybrid approach where scanner provides "hints" rather than definitive decisions
- Maintain backward compatibility during transition

### Strategy 3: Unified Text Token Revolution (Incorporating #10 Side Quest)

**Concept**: Combine the identifier token retirement with aggressive context resolution to emit primarily structural tokens and unified Text tokens.

**Implementation**:
```typescript
// Current: Many granular tokens
scan(): SyntaxKind {
  // Emits: Identifier, WhitespaceTrivia, HashToken, StringLiteral, etc.
}

// Proposed: Semantic structural tokens + unified text
scan(): SyntaxKind {
  if (this.isStructuralConstruct()) {
    return this.scanStructuralConstruct(); // ATX_HEADING, TABLE_CELL, etc.
  }
  return this.scanTextRun(); // Large spans of Text tokens
}

enum StructuralTokens {
  ATX_HEADING_1, ATX_HEADING_2, ATX_HEADING_3, // etc.
  LIST_ITEM_UNORDERED,
  LIST_ITEM_ORDERED,
  TABLE_CELL,
  TABLE_HEADER_CELL,
  CODE_FENCE_START,
  CODE_FENCE_END,
  SETEXT_HEADING_1,
  SETEXT_HEADING_2,
  THEMATIC_BREAK,
  // ... plus HTML structural tokens
}
```

**Pros**:
- Massive reduction in token count for large documents
- Clear semantic meaning in token stream
- Better performance for large paragraphs
- Simpler parser logic focused on structure rather than syntax
- Natural integration with #10 side quest goals

**Cons**:
- Major breaking change to existing parser
- Risk of losing fine-grained control
- Complex migration path
- Potential over-commitment to current Markdown spec

**Mitigation Strategies**:
- Phased migration with compatibility layers
- Extensive benchmarking and testing
- Configurable token granularity
- Clear fallback mechanisms

**Practical Considerations**:
- Start with Text token unification as planned in #10
- Gradually introduce structural tokens
- Maintain source position information for debugging
- Consider impact on incremental parsing

### Strategy 4: Context-Aware Scanning Modes (Outlandish)

**Concept**: Scanner operates in different modes based on document context, with mode transitions driven by structural recognition.

**Implementation**:
```typescript
enum ScanMode {
  DOCUMENT_START,    // Frontmatter, initial content
  PARAGRAPH,         // Plain text with inline constructs
  LIST_CONTEXT,      // Inside lists, different item parsing rules
  TABLE_CONTEXT,     // Table-specific delimiter interpretation
  CODE_FENCE,        // Code content with specific fence matching
  HTML_BLOCK,        // HTML parsing mode
  MATH_BLOCK,        // Math content with $ delimiters
}

class ModalScanner {
  private mode: ScanMode = ScanMode.DOCUMENT_START;
  private modeStack: ScanMode[] = [];

  scan(): SyntaxKind {
    switch (this.mode) {
      case ScanMode.PARAGRAPH:
        return this.scanParagraphMode();
      case ScanMode.TABLE_CONTEXT:
        return this.scanTableMode();
      // etc.
    }
  }

  pushMode(mode: ScanMode): void {
    this.modeStack.push(this.mode);
    this.mode = mode;
  }

  popMode(): void {
    this.mode = this.modeStack.pop() || ScanMode.DOCUMENT_START;
  }
}
```

**Pros**:
- Very precise context-aware scanning
- Natural handling of nested constructs
- Clear state boundaries
- Excellent support for complex edge cases

**Cons**:
- Extremely complex scanner implementation
- Mode transition logic could be error-prone
- Debugging becomes much harder
- Significant deviation from traditional scanning patterns

**Mitigation Strategies**:
- Extensive logging and debugging infrastructure
- Careful mode transition testing
- Gradual implementation with fallbacks
- Clear documentation of mode semantics

**Practical Considerations**:
- Probably too complex for initial implementation
- Consider as long-term evolution
- Would require significant parser rewrite
- Mode persistence for incremental parsing

### Strategy 5: Streaming Semantic Analysis (Very Outlandish)

**Concept**: Scanner becomes a semantic analyzer that emits high-level document events rather than low-level tokens.

**Implementation**:
```typescript
enum DocumentEvent {
  HEADING_START,
  HEADING_END,
  PARAGRAPH_START,
  PARAGRAPH_END,
  LIST_START,
  LIST_ITEM_START,
  LIST_ITEM_END,
  LIST_END,
  TABLE_START,
  TABLE_ROW_START,
  TABLE_CELL_START,
  // etc.
}

interface SemanticEvent {
  type: DocumentEvent;
  level?: number;        // For headings, list nesting
  attributes?: object;   // For complex constructs
  textContent?: string;  // Raw text spans
  sourceRange: Range;
}

class SemanticScanner {
  *scanDocument(): Generator<SemanticEvent> {
    // Emit high-level document structure events
    yield { type: DocumentEvent.HEADING_START, level: 1, sourceRange: ... };
    yield { type: DocumentEvent.TEXT_CONTENT, textContent: "Heading Text", sourceRange: ... };
    yield { type: DocumentEvent.HEADING_END, sourceRange: ... };
    // etc.
  }
}
```

**Pros**:
- Very clean parser interface
- Natural document model alignment
- Excellent for streaming processing
- Clear semantic boundaries

**Cons**:
- Complete departure from token-based parsing
- Loss of fine-grained control
- Complex error recovery
- Massive implementation effort

**Mitigation Strategies**:
- Implement as alternative interface alongside token-based
- Extensive prototype validation
- Clear mapping back to source positions
- Robust error handling

**Practical Considerations**:
- Research project rather than immediate implementation
- Consider for future major version
- Would enable very different parser architectures
- Interesting for streaming applications

## Integration with Side Quest #10: Identifier Token Retirement

The scanner-parser shift naturally incorporates and extends the goals of #10:

### Unified Text Token Strategy
- Move beyond retiring identifier tokens to reducing *all* unnecessary token granularity
- Scanner aggressively accumulates text spans between structural constructs
- Structural constructs get dedicated, semantically meaningful tokens

### Enhanced Line Processing
- Scanner handles line-boundary logic internally rather than exposing raw newline tokens
- Line-start context resolution happens during scanning
- Blank line significance determined and encoded in structural tokens

### Simplified Emphasis Processing
- Scanner resolves emphasis delimiter capabilities during initial scan
- Parser receives pre-analyzed delimiter runs rather than individual punctuation tokens
- Unicode flanking rules applied during scanning phase

## Recommended Implementation Path

### Phase 1: Conservative Eager Resolution (3-4 weeks)
1. Implement eager ATX heading detection at line start
2. Add URL context tracking for hash fragment detection
3. Enhance code fence detection with definitive open/close matching
4. Maintain rescanning as fallback for edge cases

### Phase 2: Multi-line Construct Hints (2-3 weeks)
1. Add Setext heading lookahead during paragraph scanning
2. Implement table context detection across header/alignment rows
3. Enhanced list marker resolution with context awareness

### Phase 3: Text Token Unification (4-5 weeks)
1. Implement unified Text token as planned in #10
2. Aggressive text span accumulation between constructs
3. Retire granular content tokens (Identifier, StringLiteral, etc.)
4. Enhanced structural token vocabulary

### Phase 4: Advanced Context Resolution (6-8 weeks)
1. Modal scanning for specific contexts (optional)
2. Advanced HTML block detection
3. Math delimiter context resolution
4. Performance optimization and benchmarking

## Risk Assessment and Mitigation

### Primary Risks

**Performance Regression**: Aggressive lookahead could slow scanning
- *Mitigation*: Careful benchmarking, adaptive lookahead depth, performance budgets

**Increased Complexity**: Scanner becomes harder to understand and debug
- *Mitigation*: Excellent test coverage, clear documentation, debugging tools

**Specification Coupling**: Over-fitting to current CommonMark spec
- *Mitigation*: Configurable scanning modes, extension points for future specs

**Compatibility Breaking**: Major changes to token stream format
- *Mitigation*: Phased migration, compatibility layers, extensive testing

### Secondary Risks

**Memory Usage**: State tracking for multi-line constructs
- *Mitigation*: Lightweight state structures, aggressive cleanup, memory profiling

**Error Recovery**: Complex scanning logic makes error handling harder
- *Mitigation*: Robust error boundaries, fallback scanning modes

**Incremental Parsing**: State dependencies complicate incremental updates
- *Mitigation*: Clear state boundaries, invalidation strategies, incremental testing

## Success Metrics

### Performance Metrics
- Token count reduction: Target 50-70% fewer tokens for typical documents
- Scanning speed: Maintain or improve current performance
- Memory usage: Reduce allocation count through text span consolidation
- Parser complexity: Reduce parser line count by 20-30%

### Quality Metrics
- Test coverage: Maintain 100% test coverage
- Edge case handling: No regressions in complex Markdown constructs
- Roundtrip fidelity: Perfect source reconstruction
- Error quality: Improved error messages through better context

### Developer Experience Metrics
- Debugging clarity: Easier to understand token streams
- API simplicity: Fewer methods needed for common parser tasks
- Documentation quality: Clear mental model for scanner-parser interaction

## Conclusion

The shift toward scanner intelligence represents a natural evolution of the current architecture. By moving context resolution, multi-line coordination, and text span consolidation into the scanner, we can achieve:

1. **Cleaner Parser Logic**: Focus on document structure rather than syntax details
2. **Better Performance**: Fewer tokens, less rescanning, consolidated text spans
3. **Improved Developer Experience**: More semantic token streams, clearer separation of concerns
4. **Future-Proof Architecture**: Foundation for advanced features like incremental parsing

The recommended phased approach allows for gradual migration while maintaining stability and providing early feedback on the most promising strategies.