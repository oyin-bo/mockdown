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

---

## Critical Analysis and Evaluation

After reviewing the current implementation and understanding the existing scanner-parser architecture, I can provide a thorough critique of the proposed scanner-parser responsibility shift.

### Assessment Summary

**Overall Verdict**: The plan is **theoretically sound but practically risky** in its more ambitious phases. **Phase 1 and 2 are reasonable**, but **Phases 3-5 range from impractical to dangerous**. The core issue is that the plan underestimates the complexity of Markdown's context dependencies and the performance implications of aggressive lookahead.

### Strategy-by-Strategy Analysis

#### Strategy 1: Eager Context Resolution (✅ **PRACTICAL**)

**Assessment**: This is the **most viable approach** and aligns well with the current architecture.

**What works well**:
- The current scanner already does some eager resolution (ATX headings, list markers, thematic breaks)
- The proposed ATX heading detection (`isAtLineStart + lookahead for space`) is already partially implemented
- Conservative fallback mechanisms already exist
- Incremental adoption is feasible

**Critical issues to address**:
- **Performance concern**: The plan underestimates the cost of aggressive lookahead. Current implementation shows careful character-by-character decisions - wholesale lookahead could degrade performance significantly
- **Context contamination**: The scanner would need to track more state, violating the current clean separation
- **Error recovery complexity**: Context-aware scanning makes error boundaries much harder to define

**Recommended modifications**:
1. Limit eager resolution to high-confidence, low-cost cases only
2. Implement strict performance budgets for lookahead operations
3. Maintain current conservative scanning as the default, with eager resolution as opt-in enhancement
4. Add comprehensive benchmarking before expanding scope

#### Strategy 2: Multi-line Construct Awareness (⚠️ **RISKY**)

**Assessment**: This crosses a **fundamental architectural boundary** and is more dangerous than valuable.

**Major problems**:
- **State management explosion**: The scanner would need to track paragraph state, code fence state, table context, list nesting - this violates the scanner's current stateless-per-token design
- **Error propagation**: Multi-line state makes error recovery exponentially more complex
- **Incremental parsing breakage**: The current design supports incremental updates well; multi-line state would break this
- **Memory overhead**: The proposed `ScannerState` interface would require significant memory per scanner instance

**Specific implementation issues**:
- The example `potentialSetextParagraph` state would need to track potentially unbounded content
- Table context tracking conflicts with the current line-by-line scanning model
- Code fence state management duplicates parser responsibilities

**Verdict**: **Do not implement**. The complexity-to-benefit ratio is too high, and it introduces fundamental architectural risks.

#### Strategy 3: Unified Text Token Revolution (🔄 **MIXED - Depends on Side Quest #10**)

**Assessment**: This **depends entirely** on the success of Side Quest #10 (identifier token retirement). Without that foundation, this strategy is premature.

**Synergy analysis**:
- The Text token unification from #10 is a prerequisite, not a parallel effort
- The structural token vocabulary expansion could work, but needs careful design
- The "massive reduction in token count" claim needs verification through benchmarking

**Implementation concerns**:
- **Breaking change magnitude**: This represents the largest breaking change in the plan
- **Parser rewrite required**: The current parser expects granular tokens; structural tokens would require complete rewrite
- **Source position fidelity**: Large Text spans could make precise error reporting harder

**Recommended approach**:
1. **Complete Side Quest #10 first** and measure its impact
2. **Prototype structural tokens** in a branch to validate the concept
3. **Benchmark token count reduction** with real-world documents
4. Only proceed if benefits are demonstrated, not assumed

#### Strategy 4: Context-Aware Scanning Modes (❌ **IMPRACTICAL**)

**Assessment**: This is **architecturally unsound** and conflicts with fundamental scanner design principles.

**Fatal flaws**:
- **Complexity explosion**: The modal scanner would be impossible to debug and maintain
- **Performance degradation**: Mode switching overhead would likely eliminate any performance gains
- **State synchronization**: Keeping mode stacks consistent with parser state would be error-prone
- **Testing nightmare**: The combinatorial explosion of mode transitions would make comprehensive testing infeasible

**Fundamental conflicts**:
- Current scanner is designed for local, character-level decisions
- Modal scanning requires global context that belongs in the parser
- The example mode transitions show how complex this would become

**Verdict**: **Completely impractical**. This would result in a system that is slower, buggier, and harder to maintain than the current approach.

#### Strategy 5: Streaming Semantic Analysis (❌ **OUTLANDISH AND WRONG**)

**Assessment**: This **abandons tokenization entirely** and represents a different parsing paradigm, not an evolution of the current system.

**Why this doesn't work**:
- **Not a scanner anymore**: This is actually a high-level parser, not a scanner
- **Loss of fine-grained control**: Many parsing decisions require token-level precision
- **Error recovery elimination**: Semantic events provide no mechanism for error recovery
- **Source mapping complexity**: Mapping semantic events back to source positions would be extremely complex

**Verdict**: **Reject entirely**. This is not a scanner enhancement but a completely different architecture.

### Integration Analysis with Side Quest #10

The plan's integration with Side Quest #10 reveals **critical dependencies** that aren't properly acknowledged:

**Sequential dependency**: Strategy 3 cannot proceed without completing #10 first. The plan treats them as parallel efforts, which is incorrect.

**Risk amplification**: If #10 introduces performance regressions, Strategy 3 would compound them.

**Testing coordination**: The massive test updates required for both efforts could mask issues if done simultaneously.

### Performance and Memory Concerns

The plan makes **optimistic assumptions** about performance that aren't supported by evidence:

**Lookahead costs**: Aggressive lookahead typically degrades performance, especially for large documents. The plan assumes the opposite without benchmarking.

**Memory allocation**: Multi-line state tracking would increase memory usage, contrary to the stated memory improvement goals.

**Token processing**: While fewer tokens sounds good, the complexity of processing each token could increase dramatically.

### Recommended Implementation Strategy

Based on this analysis, I recommend a **heavily modified approach**:

#### Phase 1: Conservative Eager Resolution (4-6 weeks)
- Implement **only** high-confidence, low-cost eager resolution
- Focus on ATX headings, ordered lists, and thematic breaks
- Maintain aggressive performance monitoring
- **Success criteria**: No performance regression, 10-15% reduction in rescanning

#### Phase 2: Text Token Integration (6-8 weeks) 
- **Complete Side Quest #10 first**
- Measure actual performance impact
- Only proceed with structural tokens if #10 shows clear benefits
- **Success criteria**: Token count reduction demonstrated, no parsing regressions

#### Phase 3: Limited Context Enhancement (Optional, 4-6 weeks)
- **Only if** Phases 1-2 show significant benefits
- Limited to line-local context awareness
- No multi-line state tracking
- **Success criteria**: Measurable performance improvement over Phase 2

**Phases 4-5**: **Do not implement**. The risks outweigh any potential benefits.

### Conclusion on the Plan

The scanner-parser shift plan represents **ambitious thinking** but suffers from **overreach in its later phases**. The early phases (1-2) are **reasonable and potentially beneficial**, while the later phases (3-5) range from **risky to dangerous**.

The plan would benefit from:
1. **More conservative scope**
2. **Better performance analysis**
3. **Recognition of architectural constraints**
4. **Proper sequencing with Side Quest #10**

**Final recommendation**: Implement **Phase 1 only**, measure results carefully, and only proceed with Phase 2 if Phase 1 demonstrates clear benefits without introducing regressions.

---

## Restorative Analysis: Salvaging the Scanner-Parser Shift

After the critical analysis revealed significant challenges with the original plan, this section explores creative solutions and architectural innovations that could make the scanner-parser responsibility shift viable while addressing the fundamental concerns raised.

### Core Problem Decomposition

The critical analysis identified several fundamental issues that need resolution:

1. **Performance degradation** from aggressive lookahead
2. **State management complexity** in multi-line constructs
3. **Architectural boundary violations** between scanner and parser
4. **Error recovery complications** in context-aware scanning
5. **Incremental parsing conflicts** with stateful scanning

Rather than abandoning the shift entirely, we can address each of these systematically with innovative architectural patterns.

### Innovation 1: Lazy Evaluation Scanner Architecture

**Problem**: Aggressive lookahead creates performance penalties.

**Solution**: Implement a **lazy evaluation system** where the scanner performs minimal initial work and defers expensive operations until the parser requests specific semantic information.

```typescript
interface LazyToken {
  kind: SyntaxKind;
  pos: number;
  end: number;
  flags: TokenFlags;
  
  // Lazy evaluation functions
  resolveContext?: () => SyntaxKind;    // Expensive context resolution
  resolveContent?: () => string;       // Content extraction only when needed
  resolveBoundaries?: () => TokenBoundaryInfo; // Complex boundary analysis
}

class LazyEvaluationScanner {
  scan(): LazyToken {
    // Fast initial scan - just character classification
    const char = this.getCurrentChar();
    
    switch (char) {
      case CharacterCodes.hash:
        return this.createLazyHashToken(); // Defer ATX heading resolution
      case CharacterCodes.pipe:
        return this.createLazyPipeToken(); // Defer table context resolution
      case CharacterCodes.backtick:
        return this.createLazyBacktickToken(); // Defer code fence resolution
    }
  }

  private createLazyHashToken(): LazyToken {
    return {
      kind: SyntaxKind.HashToken,
      pos: this.pos,
      end: this.pos + 1,
      flags: this.getBasicFlags(),
      resolveContext: () => this.resolveHashContext()
    };
  }

  private resolveHashContext(): SyntaxKind {
    // Only called when parser needs definitive token type
    if (this.isAtLineStart && this.hasHeadingPattern()) {
      return SyntaxKind.ATXHeadingToken;
    }
    if (this.isInURLContext()) {
      return SyntaxKind.URLFragmentToken;
    }
    return SyntaxKind.HashToken;
  }
}
```

**Benefits**:
- **Performance preservation**: Expensive operations only run when needed
- **Backwards compatibility**: Lazy tokens can behave like regular tokens
- **Gradual adoption**: Can be implemented token-by-token
- **Memory efficiency**: Context resolution happens on-demand

**Implementation strategy**:
1. Start with high-impact, expensive operations (ATX headings, table detection)
2. Measure performance impact of lazy vs eager evaluation
3. Expand based on actual performance data
4. Maintain fast path for tokens that don't need context resolution

### Innovation 2: Hierarchical State Management with Snapshots

**Problem**: Multi-line state management violates scanner statelessness and complicates incremental parsing.

**Solution**: Implement **hierarchical state snapshots** that preserve scanner statelessness while enabling limited multi-line awareness.

```typescript
interface ScannerSnapshot {
  readonly position: number;
  readonly lineNumber: number;
  readonly lineStart: number;
  readonly context: ScannerContext;
  readonly pendingConstructs: ReadonlyArray<PendingConstruct>;
}

interface PendingConstruct {
  readonly type: 'setext-candidate' | 'table-header' | 'code-fence-open';
  readonly startPos: number;
  readonly data: unknown;
  readonly validUntil: number; // Position limit for this construct
}

class SnapshotScanner {
  private snapshots = new Map<number, ScannerSnapshot>();
  
  scanWithSnapshot(pos: number): { tokens: Token[], nextSnapshot: ScannerSnapshot } {
    const previousSnapshot = this.findNearestSnapshot(pos);
    this.restoreFromSnapshot(previousSnapshot);
    
    const tokens = this.scanLine();
    const pendingConstructs = this.updatePendingConstructs(tokens);
    
    const nextSnapshot: ScannerSnapshot = {
      position: this.pos,
      lineNumber: this.lineNumber,
      lineStart: this.lineStart,
      context: this.currentContext,
      pendingConstructs: this.cleanupExpiredConstructs(pendingConstructs)
    };
    
    return { tokens, nextSnapshot };
  }

  private updatePendingConstructs(tokens: Token[]): PendingConstruct[] {
    const constructs = [...this.currentSnapshot.pendingConstructs];
    
    // Check for Setext heading completion
    if (this.isSetextUnderline(tokens)) {
      const candidate = constructs.find(c => c.type === 'setext-candidate');
      if (candidate) {
        // Emit Setext heading tokens, remove candidate
        this.emitSetextHeading(candidate);
        constructs.splice(constructs.indexOf(candidate), 1);
      }
    }
    
    // Add new candidates
    if (this.isPotentialSetextParagraph(tokens)) {
      constructs.push({
        type: 'setext-candidate',
        startPos: this.lineStart,
        data: { content: this.getLineContent() },
        validUntil: this.pos + 1000 // Reasonable line limit
      });
    }
    
    return constructs;
  }
}
```

**Benefits**:
- **Incremental parsing compatible**: Snapshots enable efficient incremental updates
- **Bounded complexity**: Pending constructs have validity limits
- **State isolation**: Each snapshot is immutable and independent
- **Error recovery**: Failed constructs automatically expire

**Implementation strategy**:
1. Start with Setext headings as proof of concept
2. Add table header detection with two-line lookahead
3. Implement snapshot garbage collection for long documents
4. Optimize snapshot storage for memory efficiency

### Innovation 3: Cooperative Context Resolution Protocol

**Problem**: Scanner-parser boundary violations and unclear responsibility separation.

**Solution**: Implement a **cooperative protocol** where scanner and parser collaborate on context resolution without violating architectural boundaries.

```typescript
interface ContextHint {
  readonly confidence: 'high' | 'medium' | 'low';
  readonly suggestion: SyntaxKind;
  readonly evidence: string[];
  readonly fallback: SyntaxKind;
}

interface CooperativeToken extends Token {
  hint?: ContextHint;
  requestContext?(parser: Parser): SyntaxKind;
}

class CooperativeScanner {
  scan(): CooperativeToken {
    const char = this.getCurrentChar();
    
    if (char === CharacterCodes.hash) {
      const basicToken = this.scanBasicHash();
      
      // Provide context hint without making definitive decision
      if (this.isAtLineStart) {
        basicToken.hint = {
          confidence: 'high',
          suggestion: SyntaxKind.ATXHeadingToken,
          evidence: ['at-line-start', 'followed-by-space'],
          fallback: SyntaxKind.HashToken
        };
        
        // Provide callback for definitive resolution
        basicToken.requestContext = (parser) => {
          return parser.needsATXHeading() 
            ? SyntaxKind.ATXHeadingToken 
            : SyntaxKind.HashToken;
        };
      }
      
      return basicToken;
    }
  }
}

class CooperativeParser {
  parseToken(token: CooperativeToken): Node {
    if (token.hint && token.hint.confidence === 'high') {
      // Trust high-confidence hints
      return this.parseWithHint(token, token.hint.suggestion);
    }
    
    if (token.requestContext) {
      // Request definitive context when needed
      const definitiveKind = token.requestContext(this);
      return this.parseWithKind(token, definitiveKind);
    }
    
    // Fall back to traditional parsing
    return this.parseTraditional(token);
  }

  needsATXHeading(): boolean {
    // Parser provides context about what it expects
    return this.currentContext === ParseContext.BlockStart &&
           !this.isInCodeBlock() &&
           !this.isInHTMLBlock();
  }
}
```

**Benefits**:
- **Clear responsibility separation**: Scanner suggests, parser decides
- **Performance optimization**: High-confidence hints avoid expensive parser logic
- **Architectural preservation**: No boundary violations
- **Flexibility**: Degraded gracefully when cooperation fails

**Implementation strategy**:
1. Implement for high-frequency disambiguation cases (hash, pipe, backtick)
2. Start with simple binary hints (heading vs literal)
3. Expand to multi-option hints for complex cases
4. Add metrics to track hint accuracy and usage

### Innovation 4: Recoverable Error Boundaries with Circuit Breakers

**Problem**: Context-aware scanning complicates error recovery.

**Solution**: Implement **circuit breaker patterns** that automatically fall back to conservative scanning when errors are detected.

```typescript
interface ErrorBoundary {
  readonly maxFailures: number;
  readonly resetTimeMs: number;
  failures: number;
  lastFailure: number;
  isOpen(): boolean;
}

class RecoverableScanner {
  private errorBoundaries = new Map<string, ErrorBoundary>();
  
  scanWithRecovery(): Token {
    const operation = this.determineOperation();
    const boundary = this.getErrorBoundary(operation);
    
    if (boundary.isOpen()) {
      // Circuit breaker is open - use conservative fallback
      return this.scanConservative();
    }
    
    try {
      return this.scanAggressive(operation);
    } catch (error) {
      this.recordFailure(boundary, error);
      
      // Immediate fallback to conservative scanning
      return this.scanConservative();
    }
  }
  
  private scanAggressive(operation: string): Token {
    switch (operation) {
      case 'atx-heading':
        return this.scanATXHeadingAggressive();
      case 'table-detection':
        return this.scanTableContextAggressive();
      default:
        return this.scanConservative();
    }
  }
  
  private recordFailure(boundary: ErrorBoundary, error: Error): void {
    boundary.failures++;
    boundary.lastFailure = Date.now();
    
    // Log detailed error information for debugging
    this.logger.warn(`Scanner operation failed: ${error.message}`, {
      operation: boundary,
      position: this.pos,
      context: this.getDebugContext()
    });
  }
  
  private getErrorBoundary(operation: string): ErrorBoundary {
    if (!this.errorBoundaries.has(operation)) {
      this.errorBoundaries.set(operation, {
        maxFailures: 3,
        resetTimeMs: 60000, // 1 minute
        failures: 0,
        lastFailure: 0,
        isOpen: function() {
          if (Date.now() - this.lastFailure > this.resetTimeMs) {
            this.failures = 0; // Reset circuit breaker
          }
          return this.failures >= this.maxFailures;
        }
      });
    }
    return this.errorBoundaries.get(operation)!;
  }
}
```

**Benefits**:
- **Automatic degradation**: System becomes more conservative when encountering problems
- **Self-healing**: Circuit breakers reset after time delays
- **Debugging support**: Detailed error information preserved
- **Performance protection**: Prevents repeated expensive failures

**Implementation strategy**:
1. Identify high-risk scanning operations
2. Implement circuit breakers for each operation type
3. Tune failure thresholds based on real-world usage
4. Add monitoring and alerting for circuit breaker activations

### Innovation 5: Incremental Context Caching

**Problem**: Incremental parsing conflicts with stateful scanning.

**Solution**: Implement **context caching** that preserves incremental parsing benefits while enabling sophisticated context awareness.

```typescript
interface ContextCache {
  readonly documentVersion: number;
  readonly entries: Map<number, ContextEntry>;
  readonly invalidRanges: Range[];
}

interface ContextEntry {
  readonly position: number;
  readonly context: ScannerContext;
  readonly dependencies: number[]; // Positions this context depends on
  readonly validUntil: number;
}

class IncrementalContextScanner {
  private contextCache: ContextCache;
  
  scanIncremental(changes: TextChange[]): { tokens: Token[], newCache: ContextCache } {
    // Invalidate cache entries affected by changes
    const invalidRanges = this.calculateInvalidRanges(changes);
    const newCache = this.invalidateCache(invalidRanges);
    
    // Scan only invalidated regions
    const tokens: Token[] = [];
    for (const range of invalidRanges) {
      const rangeTokens = this.scanRange(range, newCache);
      tokens.push(...rangeTokens);
      
      // Update cache with new context information
      this.updateCacheForRange(range, rangeTokens, newCache);
    }
    
    return { tokens, newCache };
  }
  
  private scanRange(range: Range, cache: ContextCache): Token[] {
    this.setPosition(range.start);
    const tokens: Token[] = [];
    
    while (this.pos < range.end) {
      // Check cache for valid context
      const cachedContext = this.getCachedContext(this.pos, cache);
      
      if (cachedContext && this.isContextValid(cachedContext)) {
        // Use cached context for enhanced scanning
        const token = this.scanWithContext(cachedContext.context);
        tokens.push(token);
      } else {
        // Scan conservatively and build new context
        const token = this.scanConservative();
        tokens.push(token);
        
        // Analyze context for future caching
        const newContext = this.analyzeContext(token);
        if (newContext) {
          this.cacheContext(this.pos, newContext, cache);
        }
      }
    }
    
    return tokens;
  }
  
  private isContextValid(entry: ContextEntry): boolean {
    // Check if dependencies are still valid
    for (const depPos of entry.dependencies) {
      if (this.isPositionInvalidated(depPos)) {
        return false;
      }
    }
    
    return this.pos <= entry.validUntil;
  }
}
```

**Benefits**:
- **Incremental parsing preserved**: Only invalidated regions need rescanning
- **Context reuse**: Valid context information is preserved across edits
- **Dependency tracking**: Fine-grained invalidation based on actual dependencies
- **Performance scaling**: Large documents benefit from extensive caching

**Implementation strategy**:
1. Start with simple context caching (line start, code block state)
2. Add dependency tracking for multi-line constructs
3. Implement cache compression for large documents
4. Add cache persistence for cross-session benefits

### Innovation 6: Token Stream Transformation Pipeline

**Problem**: Major breaking changes required for structural tokens.

**Solution**: Implement a **transformation pipeline** that can convert between different token representations without breaking existing code.

```typescript
interface TokenTransformer {
  transform(tokens: Token[]): Token[];
  canTransform(from: TokenFormat, to: TokenFormat): boolean;
}

enum TokenFormat {
  LEGACY,           // Current granular tokens
  UNIFIED_TEXT,     // Side Quest #10 format
  STRUCTURAL,       // Proposed structural tokens
  SEMANTIC_EVENTS   // Strategy 5 format
}

class TokenPipeline {
  private transformers = new Map<string, TokenTransformer>();
  
  transform(tokens: Token[], fromFormat: TokenFormat, toFormat: TokenFormat): Token[] {
    const transformerKey = `${fromFormat}->${toFormat}`;
    const transformer = this.transformers.get(transformerKey);
    
    if (transformer) {
      return transformer.transform(tokens);
    }
    
    // Multi-step transformation
    const path = this.findTransformationPath(fromFormat, toFormat);
    let currentTokens = tokens;
    
    for (let i = 0; i < path.length - 1; i++) {
      const stepKey = `${path[i]}->${path[i + 1]}`;
      const stepTransformer = this.transformers.get(stepKey);
      if (stepTransformer) {
        currentTokens = stepTransformer.transform(currentTokens);
      }
    }
    
    return currentTokens;
  }
}

class LegacyToStructuralTransformer implements TokenTransformer {
  transform(tokens: Token[]): Token[] {
    const result: Token[] = [];
    let i = 0;
    
    while (i < tokens.length) {
      // Pattern matching for structural constructs
      const headingMatch = this.matchATXHeading(tokens, i);
      if (headingMatch) {
        result.push(this.createStructuralHeading(headingMatch));
        i = headingMatch.endIndex;
        continue;
      }
      
      const listMatch = this.matchListItem(tokens, i);
      if (listMatch) {
        result.push(this.createStructuralListItem(listMatch));
        i = listMatch.endIndex;
        continue;
      }
      
      // Default: pass through unchanged
      result.push(tokens[i]);
      i++;
    }
    
    return result;
  }
  
  canTransform(from: TokenFormat, to: TokenFormat): boolean {
    return from === TokenFormat.LEGACY && to === TokenFormat.STRUCTURAL;
  }
}
```

**Benefits**:
- **Gradual migration**: Different parts of the system can use different token formats
- **Backwards compatibility**: Existing code continues to work
- **Experimentation**: New token formats can be tested without commitment
- **Flexibility**: Custom transformations for specific use cases

**Implementation strategy**:
1. Implement legacy-to-unified-text transformer first
2. Add structural token transformers incrementally
3. Create bidirectional transformers where possible
4. Add performance optimization for common transformation paths

### Revised Implementation Roadmap

Based on these innovations, here's a revised implementation strategy that addresses the critical concerns:

#### Phase 1: Foundation Infrastructure (4-6 weeks)
1. **Lazy Evaluation Scanner**: Implement basic lazy token system
2. **Cooperative Protocol**: Add context hints for high-frequency cases
3. **Error Boundaries**: Implement circuit breakers for risky operations
4. **Performance Baseline**: Establish comprehensive benchmarking

**Success Criteria**:
- No performance regression on existing functionality
- Successful lazy evaluation for 3 high-impact token types
- Circuit breaker system functional and tested
- Comprehensive performance metrics in place

#### Phase 2: Context Intelligence (6-8 weeks)
1. **Snapshot System**: Implement hierarchical state management
2. **Incremental Caching**: Add basic context caching
3. **Advanced Cooperation**: Expand context hints to cover edge cases
4. **Multi-line Constructs**: Add Setext heading detection via snapshots

**Success Criteria**:
- Setext heading detection working without parser changes
- Incremental parsing performance maintained
- Context cache hit rates above 70% for typical editing patterns
- Memory usage increase less than 20%

#### Phase 3: Token Evolution (8-10 weeks)
1. **Transformation Pipeline**: Implement token format transformers
2. **Unified Text Integration**: Complete Side Quest #10 integration
3. **Structural Token Prototype**: Implement basic structural tokens
4. **Migration Tools**: Create tools for gradual parser migration

**Success Criteria**:
- Seamless transformation between token formats
- Side Quest #10 integration without breaking changes
- Structural tokens validated on representative documents
- Migration path proven with subset of parser functionality

#### Phase 4: Advanced Features (Optional, 6-8 weeks)
1. **Advanced Caching**: Implement dependency tracking and persistence
2. **Modal Scanning**: Limited context-aware modes for specific constructs
3. **Semantic Events**: Prototype streaming semantic analysis
4. **Performance Optimization**: Advanced optimization based on real-world usage

**Success Criteria**:
- Advanced features demonstrate clear benefit over Phase 3
- No regression in stability or maintainability
- Performance improvements measurable in real-world scenarios
- Documentation and tooling support advanced features

### Risk Mitigation Strategies Revisited

The innovations above address the key risks identified in the critical analysis:

**Performance Risk**: Lazy evaluation and circuit breakers prevent expensive operations from degrading performance.

**Complexity Risk**: Hierarchical state management and cooperative protocols maintain clear architectural boundaries.

**Compatibility Risk**: Transformation pipelines enable gradual migration without breaking changes.

**Error Recovery Risk**: Circuit breakers and error boundaries provide automatic fallback mechanisms.

**Incremental Parsing Risk**: Context caching and snapshot systems preserve incremental parsing benefits.

### Conclusion: A Viable Path Forward

These innovations transform the scanner-parser shift from a risky architectural overhaul into a series of incremental improvements that preserve the benefits of the current system while adding sophisticated context awareness.

The key insight is that **cooperation is better than responsibility transfer**. Rather than moving parser responsibilities into the scanner, we create systems where scanner and parser collaborate more effectively while maintaining their distinct roles.

This approach:
- **Preserves architectural integrity** through clear boundaries and protocols
- **Enables incremental adoption** through transformation pipelines and lazy evaluation
- **Provides safety nets** through circuit breakers and error boundaries
- **Supports experimentation** through snapshot systems and context caching
- **Maintains performance** through careful optimization and monitoring

The result is a more intelligent scanner-parser system that achieves the original goals of reduced rescanning, cleaner token streams, and better performance, while avoiding the architectural risks that made the original plan impractical.