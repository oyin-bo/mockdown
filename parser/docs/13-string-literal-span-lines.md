# String Literal Span Lines: Implementation Plan

## Assessment of Current Scanner Architecture

### Current Flow Analysis

**Line-by-Line Processing Model:**
1. **Pre-scan Phase**: `classifyLine()` analyzes each line at line start to determine structural type (ATX heading, code fence, paragraph, etc.)
2. **Dispatch Phase**: `scanCurrentLine()` delegates to specialized scanners based on classification
3. **Token Emission**: Specialized scanners like `scanParagraphContent()` → `emitTextRun()` → `emitStringLiteralToken()` produce tokens
4. **Position Management**: Scanner tracks `pos`, `line`, `column`, `lastLineStart` and updates via `updatePosition()`
5. **Context Flags**: `ContextFlags.AtLineStart`, `ContextFlags.PrecedingLineBreak` control behavior

**Key Constraint: StringLiteral tokens currently stop at line boundaries**
- `emitTextRun()` scans until it hits `isLineBreak(ch)` and stops
- `emitNewline()` handles line break tokens separately
- Each line gets its own classification and processing cycle

### Current StringLiteral Generation Points

**Primary text scanning locations:**
1. `emitTextRun()` - main paragraph text scanning (stops at line breaks)
2. `emitStringLiteralToken()` - the actual token emission function
3. Various specialized contexts (heading content, whitespace normalization, etc.)

**Text processing characteristics:**
- `processStringToken()` handles normalization (whitespace collapsing, tab conversion)
- StringLiteral tokens have consistent `TokenFlags` (PrecedingLineBreak, IsAtLineStart)
- Text spans are tracked with absolute positions (`start`, `endPos`)

## Goal of Phase 0 Work

**Primary Objective**: Enable StringLiteral tokens to span multiple lines with space joining, following Markdown spec requirements for paragraph continuation.

**Markdown Spec Context**: Adjacent text lines in a paragraph should be joined with a single space (line break becomes space unless it's a hard break).

**Technical Requirements:**
1. Detect when a StringLiteral at end of line should continue on next line
2. Carry forward the token start position across line boundaries  
3. Accumulate text with space joining between lines
4. Maintain proper position tracking and context flags
5. Preserve existing pre-scan functionality for structural detection
6. Handle termination conditions correctly (blank lines, block elements)

## Implementation Strategy

### New Scanner State Requirements (Unified Span Buffer Approach)

**Core Insight**: Unify normalization and cross-line handling using a single span buffer system where both irregular whitespace and newlines are treated as span separators.

**Unified Cross-Line and Normalization State:**
```typescript
// Scanner state additions - replaces both normalization arrays AND cross-line accumulation
let spanBuffer: number[] = [];           // Reusable array: [start1, len1, start2, len2, ...]
let spanCount: number = 0;               // Number of text spans in buffer
let pendingStringStart: number = -1;     // Start position of spanning token (-1 = none)
let pendingStringFlags: TokenFlags = TokenFlags.None; // Original token context flags
```

**Unified State Semantics:**
- `spanBuffer` holds meaningful text segments (non-whitespace, non-newline content)
- Spaces between spans are **implied** (single space per Markdown spec)
- Newlines between spans are **implied** (become single space in cross-line tokens)
- `pendingStringStart >= 0` indicates active accumulation (single-line normalization OR cross-line spanning)
- `spanCount` tracks number of text segments currently accumulated

**Span Encoding Philosophy:**
- Each meaningful text segment = 2 integers: `[start_pos, length]`
- Irregular whitespace (tabs, multiple spaces) creates span boundaries
- Line breaks create span boundaries for cross-line accumulation
- **Result**: Both normalization and line-spanning use identical span-joining logic

**Memory Characteristics:**
- Single reusable buffer for both use cases (unified allocation strategy)
- Buffer grows to accommodate largest complex token, then stabilizes
- SMI-optimized integers in all JS engines
- **Zero recurring allocation** after initial buffer growth

### Modified Processing Flow

**Line Classification Decision Point:**
- After `classifyLine()`, check if we have `pendingStringStart >= 0`
- If yes, apply **continuation decision logic** before delegating to line scanner
- If continuation terminates, emit the accumulated StringLiteral first

**Continuation Decision Logic:**
```typescript
function shouldContinueStringLiteral(lineFlags: LineClassification): boolean {
  // Terminate on blank lines
  if (lineFlags & LineClassification.BLANK_LINE) return false;
  
  // Terminate on structural block elements
  if (lineFlags & (
    LineClassification.ATX_HEADING |
    LineClassification.THEMATIC_BREAK |
    LineClassification.FENCED_CODE_OPEN |
    LineClassification.BLOCKQUOTE_MARKER |
    LineClassification.LIST_UNORDERED_MARKER |
    LineClassification.LIST_ORDERED_MARKER |
    LineClassification.INDENTED_CODE
  )) return false;
  
  // Continue on paragraph-like content
  if (lineFlags & LineClassification.PARAGRAPH_PLAIN) return true;
  
  // Default: terminate (conservative)
  return false;
}
```

### Unified Text Processing Logic

**Revolutionary Change**: Replace both `processStringToken()` normalization AND cross-line accumulation with unified span buffer approach.

**New emitTextRun() Flow:**
1. Scan text until special character OR line break
2. For each "meaningful text segment" (non-whitespace content): add to span buffer
3. Whitespace and newlines become **implied separators** between spans
4. Emit when termination condition met (special char, non-continuing line, EOF)

**Text Scanning with Span Accumulation:**
```typescript
function scanTextSegmentsIntoSpans(start: number): number {
  let pos = start;
  
  while (pos < end) {
    const ch = source.charCodeAt(pos);
    
    // Stop on special characters (existing logic)
    if (isSpecialChar(ch)) break;
    
    // Stop on line breaks (decision point for cross-line continuation)
    if (isLineBreak(ch)) break;
    
    // Skip whitespace, find next meaningful text segment
    if (isWhiteSpaceSingleLine(ch)) {
      pos = skipWhitespace(pos);
      continue;
    }
    
    // Scan meaningful text segment
    const segmentStart = pos;
    while (pos < end && !isWhiteSpaceSingleLine(source.charCodeAt(pos)) && 
           !isLineBreak(source.charCodeAt(pos)) && !isSpecialChar(source.charCodeAt(pos))) {
      pos++;
    }
    
    // Add segment to span buffer
    if (pos > segmentStart) {
      addSpanToPending(segmentStart, pos - segmentStart);
    }
  }
  
  return pos; // Return position where scanning stopped
}
```

### Unified Span Buffer Operations

**Core Operations for Both Normalization and Cross-Line Accumulation:**

```typescript
function addSpanToPending(start: number, length: number): void {
  // Ensure buffer capacity (grow but never shrink)
  const neededSlots = (spanCount + 1) * 2;
  if (spanBuffer.length < neededSlots) {
    // Grow by doubling (amortized allocation)
    spanBuffer.length = Math.max(neededSlots, spanBuffer.length * 2);
  }
  
  spanBuffer[spanCount * 2] = start;
  spanBuffer[spanCount * 2 + 1] = length;
  spanCount++;
}

function materializePendingString(): string {
  if (spanCount === 0) return '';
  if (spanCount === 1) {
    // Single span - direct substring (common case, same as current fast path)
    const start = spanBuffer[0];
    const length = spanBuffer[1];
    return source.substr(start, length);
  }
  
  // Multiple spans - join with spaces (handles both normalization AND line joining)
  const parts: string[] = [];
  for (let i = 0; i < spanCount; i++) {
    const start = spanBuffer[i * 2];
    const length = spanBuffer[i * 2 + 1];
    if (i > 0) parts.push(' '); // Implied space between ALL spans
    parts.push(source.substr(start, length));
  }
  return parts.join('');
}

function clearPendingString(): void {
  spanCount = 0; // Don't shrink array - reuse it
  pendingStringStart = -1;
  pendingStringFlags = TokenFlags.None;
}

function startPendingString(start: number, flags: TokenFlags): void {
  pendingStringStart = start;
  pendingStringFlags = flags;
  spanCount = 0; // Reset span count for new token
}
```

**Unified Logic Benefits:**
- Same code path handles whitespace normalization and cross-line spanning
- Newlines become just another type of "span separator" like irregular whitespace
- **Zero code duplication** between normalization and line-spanning logic
- **Consistent space-joining behavior** regardless of separator type (whitespace or newline)

### Modified emitTextRun() Logic

**Unified Approach**: Single code path handles both normalization and cross-line accumulation using span buffer.

**New Flow:**
```typescript
function emitTextRun(start: number): void {
  // Scan text segments into span buffer
  const scanEnd = scanTextSegmentsIntoSpans(start);
  
  // Determine what stopped the scan
  const hitLineBreak = (scanEnd < end && isLineBreak(source.charCodeAt(scanEnd)));
  const hitSpecialChar = (scanEnd < end && isSpecialChar(source.charCodeAt(scanEnd)));
  const hitEOF = (scanEnd >= end);
  
  if (spanCount > 0) {
    if (hitLineBreak) {
      // Decision point for cross-line continuation
      if (pendingStringStart < 0) {
        // Start new spanning token
        startPendingString(start, computeCurrentTokenFlags());
      }
      // Continue accumulation - spans already added to buffer
      pos = scanEnd; // Position at line break
      return; // Don't emit yet - wait for continuation decision
    } else {
      // Emit immediately (special char, EOF, or forced termination)
      if (pendingStringStart < 0) {
        // Start and immediately emit (single-line token with possible normalization)
        startPendingString(start, computeCurrentTokenFlags());
      }
      
      emitAccumulatedStringLiteral();
      pos = scanEnd;
    }
  } else {
    // No meaningful text found - handle edge case
    pos = scanEnd;
  }
}

function emitAccumulatedStringLiteral(): void {
  if (pendingStringStart < 0 || spanCount === 0) return;
  
  token = SyntaxKind.StringLiteral;
  tokenText = materializePendingString(); // Unified materialization for both cases
  tokenFlags = pendingStringFlags;
  offsetNext = pos; // Current position is end of span
  
  clearPendingString();
}
```

**Critical Insight**: This approach **eliminates the distinction** between normalization and cross-line accumulation. Both become "span buffer materialization with implied space separators."

### Termination and Emission Logic

**When to Emit Accumulated StringLiteral:**
1. **Special character encountered**: emit before processing special token
2. **Next line doesn't continue**: call `emitAccumulatedStringLiteral()` before processing new line
3. **End of document**: emit pending before EOF
4. **Scanner rollback**: handle pending state in rollback logic

**Integration with Existing Scanner Flow:**
```typescript
function scanImpl(): void {
  if (pos >= end) {
    // Emit any pending StringLiteral before EOF
    if (pendingStringStart >= 0) {
      emitAccumulatedStringLiteral();
      return;
    }
    // ... existing EOF logic
  }

  // Line classification
  if (contextFlags & ContextFlags.AtLineStart) {
    currentLineFlags = classifyLine(pos);
    
    // Check continuation decision
    if (pendingStringStart >= 0) {
      if (!shouldContinueStringLiteral(currentLineFlags)) {
        emitAccumulatedStringLiteral();
        return; // Let next scan() call process the new line normally
      }
      // Continue accumulation - proceed to scanCurrentLine()
    }
  }
  
  scanCurrentLine();
}
```

**Backwards Compatibility Guarantees:**
- Single-line, non-normalizing tokens: **identical behavior** (span buffer has 1 span, direct substring)
- Single-line, normalizing tokens: **identical result** (span buffer joins with spaces, same as current `result.join('')`)
- Cross-line tokens: **new behavior** (span buffer joins with spaces across lines)

## Implementation Tasks Breakdown


### Phase 0.1: Unified Span Buffer Infrastructure
1. **Add span buffer state variables** to scanner closure
2. **Implement core span operations**: `addSpanToPending()`, `materializePendingString()`, `clearPendingString()`
3. **Replace processStringToken() normalization** with span buffer approach
4. **Test span buffer with existing single-line normalization cases**

### Phase 0.2: Cross-Line Integration
1. **Modify scanImpl()** to handle continuation decision point
2. **Modify emitTextRun()** to use unified span-based text scanning
3. **Implement scanTextSegmentsIntoSpans()** with whitespace and line break handling
4. **Test basic cross-line accumulation scenarios**

### Phase 0.3: Position and Context Consistency  
1. **Ensure position tracking** works correctly across line spans
2. **Verify TokenFlags** are preserved from original line context
3. **Test rollback behavior** with pending span buffer state
4. **Validate backwards compatibility** with existing single-line tokens

### Phase 0.4: Integration Testing and Performance
1. **Verify all existing tests pass** with unified span buffer approach
2. **Add specific tests** for cross-line StringLiteral scenarios
3. **Performance validation** - measure span buffer vs. current normalization
4. **Memory profiling** - verify amortized zero allocation behavior

## Allocation Analysis: Current Scanner Behavior

### Current Normalization in processStringToken()

**Allocation Patterns Identified:**
1. **Fast path (90%+ of cases)**: `source.substring(start, endPos)` - **single allocation per token**
2. **Normalization path**: `let result: string[] = []` - **creates temporary array + multiple string allocations**

**When normalization occurs:**
- Multiple consecutive spaces (collapsed to single space)
- Tab characters (converted to spaces)
- Leading/trailing whitespace preservation logic

**Current allocation cost per normalized token:**
- 1x `string[]` array allocation
- Multiple `source.substring()` calls pushed to array
- 1x `result.join('')` allocation for final string
- **Total: ~3-8 allocations per normalized token**

### Critical Discovery: Scanner Already Violates Zero-Allocation

**The normalization path already creates temporary arrays!** This means:
1. Our zero-allocation mandate is already compromised for complex tokens
2. The scanner accepts temporary allocations when normalization is required
3. We can follow the same pattern for cross-line accumulation

## Optimized Solutions for Cross-Line StringLiteral

### Option 1: Reusable Span Array (Recommended)

**Core Concept**: Maintain a single reusable `number[]` array in scanner state, storing start/length pairs.

```typescript
// Scanner state additions
let spanBuffer: number[] = [];           // Reusable array: [start1, len1, start2, len2, ...]
let spanCount: number = 0;               // Number of spans (pairs) in buffer
let pendingStringStart: number = -1;     // Start of first span
let pendingStringFlags: TokenFlags = TokenFlags.None;
```

**Span Encoding**: Each text segment uses 2 consecutive slots:
- `spanBuffer[i*2]` = start position in source
- `spanBuffer[i*2+1]` = length of segment

**Accumulation Logic**:
```typescript
function addSpanToPending(start: number, length: number): void {
  // Ensure buffer capacity (grow but never shrink)
  const neededSlots = (spanCount + 1) * 2;
  if (spanBuffer.length < neededSlots) {
    // Grow by doubling (amortized allocation)
    spanBuffer.length = Math.max(neededSlots, spanBuffer.length * 2);
  }
  
  spanBuffer[spanCount * 2] = start;
  spanBuffer[spanCount * 2 + 1] = length;
  spanCount++;
}

function materializePendingString(): string {
  if (spanCount === 0) return '';
  if (spanCount === 1) {
    // Single span - direct substring (common case)
    const start = spanBuffer[0];
    const length = spanBuffer[1];
    return source.substr(start, length);
  }
  
  // Multiple spans - join with spaces (Markdown line joining)
  const parts: string[] = [];
  for (let i = 0; i < spanCount; i++) {
    const start = spanBuffer[i * 2];
    const length = spanBuffer[i * 2 + 1];
    if (i > 0) parts.push(' '); // Space between lines
    parts.push(source.substr(start, length));
  }
  return parts.join('');
}

function clearPendingString(): void {
  spanCount = 0; // Don't shrink array - reuse it
  pendingStringStart = -1;
  pendingStringFlags = TokenFlags.None;
}
```

**Memory Characteristics**:
- `spanBuffer` grows to accommodate largest multi-line token encountered
- Array never shrinks - amortized zero allocation after initial growth
- Small integers (start/length) are SMI-optimized in all JS engines
- Single array allocation per scanner instance lifetime

### Option 2: Single Accumulation Buffer

**Alternative**: Maintain a reusable character buffer for direct text accumulation.

```typescript
// Scanner state
let textBuffer: number[] = [];  // Character codes buffer
let textBufferLen: number = 0;  // Active length
let pendingStringStart: number = -1;
```

**Pros**: Direct character accumulation, single final `String.fromCharCode()` call
**Cons**: Requires character-by-character copying, more complex normalization

### Option 3: Lazy Materialization

**Alternative**: Store just position ranges, materialize only on token emission.

```typescript
let pendingRanges: number[] = []; // [start1, end1, start2, end2, ...]
let pendingRangeCount: number = 0;
```

**Pros**: Minimal memory usage until materialization
**Cons**: Same allocation pattern as Option 1, slightly more bookkeeping

## Recommendation: Option 1 (Reusable Span Array)

**Why Option 1 is optimal:**
1. **Follows existing scanner patterns** - similar to current normalization approach
2. **SMI optimization** - small integers are efficiently stored in all JS engines  
3. **Amortized zero allocation** - buffer grows once, reused forever
4. **Simple integration** - easy to drop into existing scanner flow
5. **Direct span references** - no character copying overhead

**Implementation Integration:**

```typescript
// Modified emitTextRun() for cross-line accumulation
function emitTextRun(start: number): void {
  let textEnd = scanTextUntilSpecial(start); // Extract existing scan logic
  
  if (textEnd > start) {
    const hitLineBreak = (textEnd < end && isLineBreak(source.charCodeAt(textEnd)));
    
    if (hitLineBreak && shouldStartOrContinueSpanning()) {
      // Add current segment to pending accumulation
      if (pendingStringStart < 0) {
        // Start new spanning token
        pendingStringStart = start;
        pendingStringFlags = computeCurrentTokenFlags();
      }
      
      addSpanToPending(start, textEnd - start);
      pos = textEnd; // Position at line break
      return; // Don't emit yet
    } else {
      // Emit immediately (normal case or termination)
      if (pendingStringStart >= 0) {
        // Emit accumulated token first
        emitAccumulatedStringLiteral();
      }
      
      emitStringLiteralToken(start, textEnd, computeCurrentTokenFlags());
    }
  }
}

function emitAccumulatedStringLiteral(): void {
  if (pendingStringStart < 0) return;
  
  token = SyntaxKind.StringLiteral;
  tokenText = materializePendingString(); // Join spans with spaces
  tokenFlags = pendingStringFlags;
  offsetNext = pos; // Current position is end of span
  
  clearPendingString();
}
```

## Allocation Impact Analysis

**Revolutionary Improvement**: The unified span buffer approach **improves upon current scanner allocation patterns** while enabling cross-line functionality.

**Before (current scanner):**
- Fast path: 1 allocation per token (`source.substring()`)
- Normalization: 3-8 allocations per token (temporary `string[]` array + multiple substring pushes + `join()`)
- **Problem**: Each normalized token creates temporary arrays

**After (unified span buffer):**
- Single-line, non-normalizing: **identical behavior** (1 span → direct substring)
- Single-line, normalizing: **improved** (spans → single join, no temporary arrays)
- Multi-line tokens: spans → single join with space separators
- Amortized: **effectively zero allocation** after span buffer stabilizes

**Memory footprint comparison:**
- Current normalization: `string[]` array per normalized token (garbage collected)
- Span buffer: persistent `number[]` buffer (~16-64 bytes typical)
- **Result**: Significant reduction in allocation pressure for normalized tokens

**SMI Optimization Benefits:**
- Small integers (start/length positions) stored as immediate values in V8/JSC/SpiderMonkey
- No object header overhead for span data
- Contiguous memory layout improves cache locality

This approach **eliminates temporary allocations** for both normalization AND cross-line accumulation, representing a net improvement over current scanner behavior.

## Risk Mitigation

**Preserve existing behavior:**
- Single-line, non-normalizing StringLiterals: **identical code path** (1 span → direct substring)
- Single-line, normalizing StringLiterals: **identical result** (span buffer joins with spaces, same as current logic)
- All existing token types and flags preserved
- **Zero behavioral regression** for existing functionality

**Memory safety:**
- Span buffer growth bounded by document structure (longest complex token)
- Buffer never shrinks - **no allocation churn**
- Clear buffer state on parse completion or error
- **Improved allocation profile** compared to current normalization

**Performance validation:**
- Span buffer approach **eliminates temporary arrays** used in current normalization
- SMI optimization for integer arrays provides better memory efficiency
- Single materialization call replaces multiple string operations
- **Expected performance improvement** for normalized tokens

**Integration safety:**
- Unified approach reduces code complexity (single path for normalization + cross-line)
- Span buffer logic is self-contained and easy to test
- Conservative continuation rules prevent over-aggressive line spanning
- **Reduced maintenance burden** through code unification

The unified span buffer approach provides **both** cross-line functionality AND improved allocation efficiency for existing normalization, making it a win-win architectural change.


## Further Implementation Log — Plan C (Big‑Bang Rollout)

This section prescribes the Plan C big‑bang rollout: implement the unified span‑buffer flow across the scanner and switch the scanner to the unified behavior repository‑wide in a single coordinated change. The list below merges outstanding items and expands them into an ordered, executable Plan C sequence. Follow the steps exactly and run the tests/benchmarks at the indicated points.

- Status summary
  - Span buffer primitives and basic ops already present: `spanBuffer`, `addSpanToPending()`, `materializePendingString()`, `clearPendingString()`.
  - Continuation decision hooks exist: `shouldContinueStringLiteral()` and integration points in `scanImpl()` and `emitTextRun()`.
  - `emitAccumulatedStringLiteral()` is implemented and can be used as the final emission point for accumulated spans.
  - A legacy normalizer implementation (`processStringTokenLegacy()`) exists in the codebase; currently `processStringTokenWithSpans()` forwards to it — Plan C will replace that forwarding.

- Plan C: Big‑Bang rollout (ordered tasks)

  0) Immediate safety fix (apply now)
     - Edit `rollback(position: number, type: RollbackType)` to call `clearPendingString()` at the start. This prevents stale pending span state after parser rollbacks and is required before any larger change.
     - File/Function: `parser/scanner/scanner.ts` -> `rollback`

  1) Implement robust in-line segmentation into spans
     - Replace the stub `scanTextSegmentsIntoSpansForCrossLine(start,endPos)` with a full segmentation implementation that:
       - walks the scanned fragment, identifies meaningful text segments (non-whitespace runs),
       - collapses single‑line whitespace into span separators,
       - stops segments on the same special characters `emitTextRun()` treats as break points,
       - calls `addSpanToPending(segmentStart, length)` for each segment.
     - File/Function: `parser/scanner/scanner.ts` -> `scanTextSegmentsIntoSpansForCrossLine`

  2) Implement the unified single-line + cross-line normalization path
     - Fully implement `processStringTokenWithSpans(start,endPos)` to use the span buffer path for single-line tokens (not just cross-line):
       - when a token has only one span, materialize it directly (fast path),
       - when multiple spans exist, join them with single spaces per span separator and return the normalized string,
       - preserve and apply `pendingStringFlags` (e.g. `PrecedingLineBreak`, `IsAtLineStart`, `Unterminated`).
     - Replace any call-sites that previously called the legacy normalizer path (where intended) so the unified path is exercised in all scanning contexts.
     - File/Function: `parser/scanner/scanner.ts` -> `processStringTokenWithSpans`

  3) Integrate the unified scanning flow into `emitTextRun()` and scan loop
     - Ensure `emitTextRun()` uses `scanTextSegmentsIntoSpansForCrossLine()` to accumulate spans for the current fragment and sets `pos` correctly on line breaks, special chars and EOF.
     - Ensure `scanImpl()` and the line classification continuation hook emit `emitAccumulatedStringLiteral()` at boundary conditions (non‑continuing line, special char, EOF) so tokens are materialized at the correct times.
     - File/Functions: `parser/scanner/scanner.ts` -> `emitTextRun`, `scanImpl`, `emitAccumulatedStringLiteral`

  4) Remove forwarding to legacy normalizer (final replacement)
     - Once `processStringTokenWithSpans()` correctly produces identical results for all single-line cases and the cross-line behavior is validated by tests, remove the unconditional delegation to `processStringTokenLegacy()` so the span path is the canonical normalization path.
     - File/Functions: `parser/scanner/scanner.ts` -> `processStringTokenWithSpans`, `processStringTokenLegacy` (eventual removal/cleanup)

  5) Add exhaustive tests that validate big‑bang behavior
     - Expand / add tests under `parser/tests/` (suggested file `parser/tests/5-crossline.test.ts`) covering:
       - Join across lines: "hello world\nthis is" → single `StringLiteral` with text "hello world this is".
       - Hard break preservation: "hello  \nworld" → `StringLiteral`, `HardLineBreak`, `StringLiteral` sequence.
       - Termination by block constructs: e.g. "a\n# heading" → do not join 'a' with heading.
       - Leading/trailing whitespace semantics across joins and normalization parity with prior behavior.
       - Rollback scenario: emit pending accumulation, call `rollback()`, ensure no pending state remains and scanner can re-scan correctly.
       - Exhaustively run the entire `parser/tests` suite to capture regressions introduced by the global change.

  6) Full integration test and benchmark pass
     - Run the full test suite and benchmark suite. Fix all regressions. The big‑bang must land with all parser tests passing and no unacceptable benchmark regressions.
     - Commands: see Quick commands below.

  7) Post‑merge cleanup and validation
     - Remove or prune `processStringTokenLegacy()` if it is no longer referenced.
     - Add microbench harnesses to measure allocation profile and verify amortized zero‑allocation behaviour of the span buffer.
     - Audit large file / pathological inputs for performance and memory.

- Files and functions (exact pointers for edits)
  - `parser/scanner/scanner.ts`
    - `rollback(position: number, type: RollbackType)` — call `clearPendingString()` immediately
    - `scanTextSegmentsIntoSpansForCrossLine(start: number, endPos: number)` — implement segmentation
    - `processStringTokenWithSpans(start: number, endPos: number)` — implement unified normalization path
    - `emitTextRun(start: number)` — wire segmentation & accumulation
    - `emitAccumulatedStringLiteral()` — verify offset and flags preservation

- Tests to add / extend
  - `parser/tests/5-crossline.test.ts` (or extend existing file)
    - Join across lines
    - Hard break preservation
    - Termination by ATX and other block elements
    - Leading/trailing whitespace and normalization parity
    - Rollback behavior test
  - After adding these focused tests, run the entire `parser/tests` suite and fix any regressions discovered.

- Quick test / run commands
  - Run all parser tests:
    ```
    npm test
    ```

  - Run a single test file while developing:
    ```
    npx vitest run parser/tests/5-crossline.test.ts
    ```

- Notes and strict constraints for Plan C
  - This is a repository‑wide behavioral change. Before landing the big‑bang, every test in `parser/tests` must pass and benchmarks must be acceptable.
  - Preserve `TokenFlags.PrecedingLineBreak` and `TokenFlags.IsAtLineStart` semantics when materializing accumulated tokens.
  - Materialization must produce results equivalent to the prior normalizer for single-line cases; differences are only acceptable for cross-line joins intentionally introduced by Plan C.
  - Do not merge the big‑bang until regression fixes are complete and benchmarks are validated.

- Merge / PR checklist (what to include in the PR)
  - Small preparatory PR that only applies the rollback safety fix and a smoke test demonstrating no pending leaks.
  - Big‑bang implementation PR that includes:
    - `scanTextSegmentsIntoSpansForCrossLine` implementation
    - `processStringTokenWithSpans` full implementation and call-site replacements
    - `emitTextRun` and `scanImpl` wiring
    - New/updated tests under `parser/tests` (focused and full-suite green)
    - Benchmark results and a short performance note in the PR description.

End of implementation log.

