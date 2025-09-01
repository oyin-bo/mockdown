# Parser-Scanner Responsibility Shift: Typed Ambiguity Resolution

## Architecture Overview

### Current Problem: Complex Incremental Parsing with Stateful Scanner

The existing architecture struggles with incremental parsing because:

1. **Scanner maintains complex internal state** (~20 closure variables) that's hard to rollback
2. **lookAhead()/tryScan() creates GC pressure** through string allocation during speculation
3. **Parser drives speculation** but lacks visibility into scanner's ambiguity resolution
4. **Safe boundary detection is ad-hoc** with separate boundary mapping systems

```typescript
// Current approach - complex stateful scanner
function createScanner() {
  let pos = 0, line = 0, column = 0, scanMode = Normal;
  let rawTextEndTag: string | undefined; // GC pressure
  let htmlBlockHintActive = false;
  // ... ~16 more state variables
  
  function lookAhead<T>(callback: () => T): T {
    // Save state (5 variables), run callback, restore state
    // Creates temporary strings during speculation
  }
}
```

### New Architecture: Smart Scanner, Dumb Parser

**Core Philosophy**: Move complexity INTO the scanner with structured ambiguity resolution, making the parser simpler and incremental parsing efficient.

```typescript
// New approach - typed ambiguity scanner  
interface Scanner {
  scan(): SyntaxKind;              // Always returns definitive tokens
  rollback(pos: number, type: RollbackType): void; // Structured rollback
  fillDebugState(state: ScannerDebugState): void;   // Zero-allocation diagnostics
}

// Parser becomes simpler - no speculation needed
function parseBlock(): BlockNode {
  const token = scanner.scan();    // Definitive token, no ambiguity
  switch (token) {
    case SyntaxKind.TableHeaderStart:
      return parseTable();         // Scanner resolved table vs paragraph
    case SyntaxKind.SetextHeadingStart:  
      return parseSetextHeading(); // Scanner resolved setext vs paragraph
  }
}
```

### Key Architectural Shifts

| Aspect | Current (Stateful Scanner) | New (Smart Scanner) |
|--------|---------------------------|---------------------|
| **Ambiguity Resolution** | Parser calls `lookAhead()` | Scanner resolves internally with typed states |
| **Token Emission** | Speculative tokens, rollback needed | Definitive tokens only |
| **Incremental Parsing** | Complex boundary detection | Simple AST-derived rollback points |
| **Memory Usage** | ~240 bytes + GC pressure | ~120 bytes, zero allocations |
| **State Management** | 20+ untyped variables | Flat primitives + typed possibilities |
| **Debugging** | Limited visibility | Rich diagnostic interface |

### Benefits of the New Design

#### 1. **Simplified Incremental Parsing**
```typescript
// Old: Complex boundary detection with maps
safeBoundaries: Map<number, SafeBoundary>;

// New: AST nodes carry rollback capability  
interface BaseNode {
  canRollback: boolean;           // Just 1 bit per node
  // rollbackType derived from NodeKind - no storage needed
}
```

#### 2. **Zero-Allocation Operation**
```typescript
// Old: Object allocation during speculation
tableState: TablePossibility | null;  // Creates objects

// New: Flat primitive variables
table_active: boolean;                 // Zero allocations
table_startPos: number;
table_columnCount: number;
```

#### 3. **Predictable Performance**
- **Bounded state**: ~120 bytes maximum scanner state
- **No GC pressure**: All primitive variables, no object creation
- **Linear complexity**: O(1) state updates per character

## Core Insight: Structured Speculative State

Unlike a flat array of "pending constructs", Markdown ambiguities have **structural exclusivity** - you cannot have nested ambiguities of the same type. This allows for a much more efficient **typed state model**.

## Optimized Architecture: Zero-Allocation Scanner Design

### Unified Scan Mode Architecture

**Key Insight**: Most Markdown ambiguities are **line interpretation problems**. Instead of separate possibility objects, encode ambiguity directly in the scan mode.

```typescript
enum ScanMode {
  // === CONTENT MODES ===
  // Base content scanning modes
  Normal = 0,                    // Regular Markdown content scanning
  RawText = 1,                   // <script>, <style> - NO Markdown processing
  RCData = 2,                    // <textarea>, <title> - entities active, no Markdown
  
  // Structured content modes  
  CodeBlockContent = 3,          // Inside fenced code blocks (``` or ~~~)
  HtmlElementContent = 4,        // Inside HTML element content (non-raw)
  MathInline = 5,                // Inside $math$ expressions
  MathBlock = 6,                 // Inside $$math$$ blocks
  AttributeBlock = 7,            // Inside {.class #id} attribute blocks
  FrontmatterYaml = 8,           // Inside --- YAML frontmatter
  FrontmatterToml = 9,           // Inside +++ TOML frontmatter
  
  // === SPECULATION MODES ===
  // Temporary ambiguous states during pattern detection
  TableSpeculation = 10,         // Seeing |, might be table vs paragraph
  SetextSpeculation = 11,        // Saw text line, checking for underline
  ListSpeculation = 12,          // Saw marker, validating list vs paragraph
  CodeFenceSpeculation = 13,     // Saw ```, determining fence vs paragraph
  HtmlBlockSpeculation = 14,     // Saw HTML tag, block vs inline context
  
  // === CONFIRMED MODES ===
  // Resolved ambiguous states - emit definitive tokens
  TableConfirmed = 15,           // Table pattern validated - emit table tokens
  SetextConfirmed = 16,          // Setext underline validated - emit heading tokens
  ListConfirmed = 17,            // List structure validated - emit list tokens
  CodeFenceConfirmed = 18,       // Code fence validated - emit code block tokens
  HtmlBlockConfirmed = 19,       // HTML block confirmed - emit block tokens
}

// Ultra-minimal state - just primitives, no boolean flags needed
interface ScannerState {
  // Core position tracking
  pos: number;
  line: number; 
  column: number;
  mode: ScanMode;           // Encodes both content type AND ambiguity state
  
  // Speculation tracking (mode-specific interpretation)
  speculationStartPos: number;    // -1 = no speculation, >=0 = rewind point
  speculationData1: number;       // Mode-specific: columnCount, underlineChar, etc.
  speculationData2: number;       // Mode-specific: headerEnd, underlineLength, etc.  
  speculationData3: number;       // Mode-specific: alignmentStart, markerValue, etc.
  
  // Content mode end markers
  rawTextEndTag: string | undefined;      // For RawText mode
  rcdataEndTag: string | undefined;       // For RCData mode
  mathDelimiter: string | undefined;      // For Math modes ("$" or "$$")
  codeBlockMarker: string | undefined;    // For CodeBlockContent ("```" or "~~~")
  attributeBlockDepth: number;            // For AttributeBlock nesting
}

// Total: ~50 bytes, complete zero allocations, mode unifies everything
```

### Detailed Scan Mode Behaviors

#### **Content Modes** (Stable Scanning States)

**Normal Mode** (`ScanMode.Normal`):
```typescript
// Standard Markdown content scanning
// - All punctuation is significant for inline markup
// - Block constructs detected at line start
// - Triggers speculation modes when ambiguity detected
```

**RawText Mode** (`ScanMode.RawText`):
```typescript
// Inside <script>, <style>, etc.
// - NO Markdown processing whatsoever  
// - Only scan for matching end tag
// - Every position is ultra-safe rollback point
// - End condition: case-insensitive </tagname>

// Example:
<script>
const text = "# Not a heading, *not emphasis*";
console.log("[not a link](example.com)");
</script>  // ← Only this ends RawText mode
```

**RCData Mode** (`ScanMode.RCData`):
```typescript
// Inside <textarea>, <title>, etc.
// - Entities are active (&amp; → &)
// - NO Markdown processing
// - End condition: case-insensitive </tagname>

// Example:
<textarea>
&amp; is decoded to &
But *this* is not emphasis
</textarea>  // ← Only this ends RCData mode
```

**CodeBlockContent Mode** (`ScanMode.CodeBlockContent`):
```typescript
// Inside fenced code blocks
// - NO Markdown processing within content
// - Line boundaries are safe rollback points
// - End condition: matching fence with same/longer length
// speculationData1: fence length (3, 4, 5, etc.)
// codeBlockMarker: fence type ("```" or "~~~")

// Example:
```javascript
function test() {
  // # Not a heading
  // *not emphasis*
  return "just code";
}
```  // ← Must be ``` with length >= 3 to close
```

**MathInline Mode** (`ScanMode.MathInline`):
```typescript
// Inside $math$ expressions
// - NO Markdown processing
// - Scan for closing $ delimiter
// - Handle escaped \$ characters
// mathDelimiter: "$"

// Example: $E = mc^2$ where *nothing* is Markdown
```

**MathBlock Mode** (`ScanMode.MathBlock`):
```typescript
// Inside $$math$$ blocks
// - NO Markdown processing
// - Scan for closing $$ delimiter
// - Line boundaries might be safe rollback points
// mathDelimiter: "$$"

// Example:
$$
E = mc^2
F = ma  // # Not a heading
$$
```

#### **Speculation Modes** (Temporary Ambiguous States)

**TableSpeculation Mode** (`ScanMode.TableSpeculation`):
```typescript
// Triggered by: | character at line start or in paragraph
// Collecting: pipe positions, checking for alignment row
// speculationData1: columnCount (number of | characters seen)
// speculationData2: headerEndPos (end of first row)
// speculationData3: alignmentStartPos (start of second row)
// Resolution: Valid alignment row → TableConfirmed, else → Normal

// Example ambiguous sequence:
| Maybe table |
|-------------|  // ← This line confirms table
```

**SetextSpeculation Mode** (`ScanMode.SetextSpeculation`):
```typescript
// Triggered by: newline after text content
// Collecting: checking next line for === or --- underline
// speculationData1: underlineChar (61 for =, 45 for -)
// speculationData2: underlineLength (length of underline sequence)
// speculationData3: contentEndPos (end of heading text)
// Resolution: Valid underline → SetextConfirmed, else → Normal

// Example ambiguous sequence:
Heading text
============  // ← This line confirms setext heading
```

**ListSpeculation Mode** (`ScanMode.ListSpeculation`):
```typescript
// Triggered by: -, +, *, or 1. at line start with proper indentation
// Collecting: marker type, number, indentation, space validation
// speculationData1: markerType (0=unordered, 1=ordered)
// speculationData2: markerValue (number for ordered lists, 0 for unordered)
// speculationData3: indentLevel (0-3 spaces before marker)
// Resolution: Valid spacing → ListConfirmed, else → Normal

// Example ambiguous sequences:
- Valid list item
1. Another valid item
   - Nested item
```

**CodeFenceSpeculation Mode** (`ScanMode.CodeFenceSpeculation`):
```typescript
// Triggered by: ``` or ~~~ at line start
// Collecting: fence length, language info
// speculationData1: fenceLength (3, 4, 5, etc.)
// speculationData2: hasLanguageInfo (0 or 1)
// speculationData3: languageEndPos (end of language string)
// Resolution: Valid fence pattern → CodeFenceConfirmed, else → Normal

// Example:
```javascript
// ← Speculation starts here, confirms with language
```

**HtmlBlockSpeculation Mode** (`ScanMode.HtmlBlockSpeculation`):
```typescript
// Triggered by: < at line start matching HTML block patterns
// Collecting: HTML block type (1-7), tag validation
// speculationData1: blockType (1-7 for different HTML block types)
// speculationData2: tagNameLength
// speculationData3: isClosingTag (0 or 1)
// Resolution: Valid HTML block start → HtmlBlockConfirmed, else → Normal

// Examples:
<div>        // ← Block type 6 (other tags)
<!--         // ← Block type 2 (comments)
<![CDATA[    // ← Block type 5 (CDATA)
```

#### **Confirmed Modes** (Definitive Token Emission)

**TableConfirmed Mode** (`ScanMode.TableConfirmed`):
```typescript
// Table pattern validated - emit structured table tokens
// Rewind to speculation start and emit:
// - TableHeaderStart, TableCell tokens for header row
// - TableDelimiterRow for alignment row
// - Transition to Normal mode after table complete
```

**SetextConfirmed Mode** (`ScanMode.SetextConfirmed`):
```typescript
// Setext heading validated - emit heading tokens
// Rewind to speculation start and emit:
// - SetextHeadingStart with level (1 for =, 2 for -)
// - Heading content tokens
// - SetextUnderline token
// - Transition to Normal mode
```

**ListConfirmed Mode** (`ScanMode.ListConfirmed`):
```typescript
// List structure validated - emit list tokens
// Emit from current position:
// - ListMarker token with type and value
// - ListItemContent tokens
// - Transition to Normal mode for content
```

#### **Mode Transition Matrix**

```typescript
// Mode transition rules
const TRANSITIONS: Record<ScanMode, ScanMode[]> = {
  [ScanMode.Normal]: [
    ScanMode.RawText,           // <script>, <style>
    ScanMode.RCData,            // <textarea>, <title>
    ScanMode.TableSpeculation,  // | character
    ScanMode.SetextSpeculation, // newline after text
    ScanMode.ListSpeculation,   // -, +, *, 1.
    ScanMode.CodeFenceSpeculation, // ```, ~~~
    ScanMode.HtmlBlockSpeculation, // < at line start
    ScanMode.MathInline,        // $ character
    ScanMode.MathBlock,         // $$ sequence
    ScanMode.AttributeBlock,    // { character
    ScanMode.FrontmatterYaml,   // --- at document start
    ScanMode.FrontmatterToml,   // +++ at document start
  ],
  
  [ScanMode.TableSpeculation]: [
    ScanMode.TableConfirmed,    // Valid alignment row found
    ScanMode.Normal,            // Invalid table pattern
  ],
  
  [ScanMode.SetextSpeculation]: [
    ScanMode.SetextConfirmed,   // Valid underline found
    ScanMode.Normal,            // No valid underline
  ],
  
  // ... etc for all modes
};

// Mode characteristics
interface ModeCharacteristics {
  allowsMarkdown: boolean;        // Can Markdown be processed?
  allowsLineBreaks: boolean;      // Are line breaks significant?
  hasEndCondition: boolean;       // Does mode have specific end pattern?
  safeRollbackLevel: number;      // 0=any position, 1=line boundaries, 2=block boundaries
}

const MODE_CHARACTERISTICS: Record<ScanMode, ModeCharacteristics> = {
  [ScanMode.Normal]: { 
    allowsMarkdown: true, 
    allowsLineBreaks: true, 
    hasEndCondition: false, 
    safeRollbackLevel: 1 
  },
  [ScanMode.RawText]: { 
    allowsMarkdown: false, 
    allowsLineBreaks: false, 
    hasEndCondition: true, 
    safeRollbackLevel: 0 
  },
  [ScanMode.CodeBlockContent]: { 
    allowsMarkdown: false, 
    allowsLineBreaks: false, 
    hasEndCondition: true, 
    safeRollbackLevel: 1 
  },
  // ... etc
};
```

### Typed Rollback System

Instead of arbitrary position rollback, use typed rollback states:

```typescript
enum RollbackType {
  DocumentStart = 0,    // Clean slate, no state
  BlockStart = 1,       // Start of block construct
  LineStart = 2,        // Beginning of line
  HtmlElementStart = 3, // Inside HTML element
  ListItemStart = 4,    // Inside list item
  CodeBlockStart = 5,   // Inside code block
}

// Scanner API
interface Scanner {
  rollback(position: number, type: RollbackType): void;
  
  // Diagnostic hook for testing
  getDebugState(): ScannerDebugState;
}

// Example usage
scanner.rollback(nodePosition, RollbackType.BlockStart);
```

### Rollback Flags in Tokens

Scanner emits rollback capability as token flags:

```typescript
enum TokenFlags {
  // ... existing flags ...
  
  // Rollback capability flags (3 bits = 8 rollback types)
  CanRollbackMask = 0x7 << 24,           // 3-bit mask
  CanRollbackDocumentStart = 0 << 24,    // Can restart from document start
  CanRollbackBlockStart = 1 << 24,       // Can restart from block start
  CanRollbackLineStart = 2 << 24,        // Can restart from line start
  CanRollbackHtmlElement = 3 << 24,      // Can restart from HTML element
  CanRollbackListItem = 4 << 24,         // Can restart from list item
  CanRollbackCodeBlock = 5 << 24,        // Can restart from code block
}

// Extract rollback type from token
function getRollbackType(flags: TokenFlags): RollbackType {
  return (flags & TokenFlags.CanRollbackMask) >> 24;
}
```

### AST-Derived Rollback Points

Parser stores rollback capability directly in AST nodes, with rollback type derived from node kind:

```typescript
interface BaseNode {
  kind: NodeKind;
  start: number;
  end: number;
  
  // Single bit per node - can we rollback to this position?
  canRollback: boolean;          // Just 1 bit overhead per node!
  // rollbackType derived from NodeKind - no storage needed!
}

// Derive rollback type from node kind
function getRollbackType(nodeKind: NodeKind): RollbackType {
  switch (nodeKind) {
    case NodeKind.Document:
      return RollbackType.DocumentStart;
    case NodeKind.Heading:
    case NodeKind.Paragraph:
    case NodeKind.ThematicBreak:
      return RollbackType.BlockStart;
    case NodeKind.ListItem:
      return RollbackType.ListItemStart;
    case NodeKind.HtmlElement:
      return RollbackType.HtmlElementStart;
    case NodeKind.CodeBlock:
      return RollbackType.CodeBlockStart;
    default:
      return RollbackType.LineStart;
  }
}

// Incremental parsing rollback
function findRollbackPoint(edit: TextEdit, ast: Node): RollbackPoint | null {
  // Walk AST backwards from edit position
  let current = findNodeAt(ast, edit.start);
  
  while (current) {
    if (current.canRollback) {
      return {
        position: current.start,
        type: getRollbackType(current.kind) // Derived, not stored!
      };
    }
    current = current.parent;
  }
  
  return { position: 0, type: RollbackType.DocumentStart }; // Fallback
}
```

### Mode Transition Logic (Zero Allocations)

```typescript
// Enter speculation when ambiguity detected
private enterTableSpeculation(): void {
  if (mode !== ScanMode.TableSpeculation) {
    mode = ScanMode.TableSpeculation;
    speculationStartPos = pos;
    speculationData1 = 1;        // columnCount = 1 (initial |)
    speculationData2 = -1;       // headerEndPos = not set
    speculationData3 = -1;       // alignmentStartPos = not set
  }
}

// Update speculation state (no allocations)
private updateTableSpeculation(ch: number): void {
  if (ch === CharacterCodes.bar) {
    speculationData1++;           // Increment columnCount
  } else if (ch === CharacterCodes.newline) {
    speculationData2 = pos;       // Mark headerEndPos
    // Check next line for alignment pattern
  }
}

// Resolve ambiguity by transitioning mode
private resolveSpeculation(): SyntaxKind {
  switch (mode) {
    case ScanMode.TableSpeculation:
      if (hasValidTableAlignment()) {
        mode = ScanMode.TableConfirmed;
        return rewindAndEmitTable();
      }
      break;
      
    case ScanMode.SetextSpeculation:
      if (speculationData2 >= 1) { // underlineLength >= 1
        mode = ScanMode.SetextConfirmed;
        return rewindAndEmitSetext();
      }
      break;
  }
  
  // Speculation failed - return to normal
  mode = ScanMode.Normal;
  return SyntaxKind.TextContent;
}

private rewindAndEmitTable(): SyntaxKind {
  pos = speculationStartPos;
  // Re-scan with table knowledge, emit TableHeaderStart
  return SyntaxKind.TableHeaderStart;
}
```

### Mode-Unified Diagnostic Hook

Pass in mutable object to avoid allocations during debugging:

```typescript
interface ScannerDebugState {
  // Position state
  pos: number;
  line: number;
  column: number;
  mode: string;                    // Human-readable mode name
  
  // Speculation state (unified)
  isSpeculating: boolean;          // True if in speculation mode
  speculationStartPos: number;     // Where speculation began (-1 if none)
  speculationData1: number;        // Mode-specific data
  speculationData2: number;        // Mode-specific data  
  speculationData3: number;        // Mode-specific data
  
  // Mode-specific interpretation (filled based on current mode)
  modeSpecificData: any;           // Object populated based on mode, no allocation
}

// Scanner API - fills existing object, no allocations
interface Scanner {
  fillDebugState(state: ScannerDebugState): void;
}

// Implementation - zero allocations
function fillDebugState(state: ScannerDebugState): void {
  // Fill position state
  state.pos = pos;
  state.line = line;
  state.column = column;
  
  // Fill mode state
  state.mode = getModeString(mode);
  state.isSpeculating = speculationStartPos !== -1;
  state.speculationStartPos = speculationStartPos;
  state.speculationData1 = speculationData1;
  state.speculationData2 = speculationData2;
  state.speculationData3 = speculationData3;
  
  // Interpret mode-specific data (reuse existing object)
  fillModeSpecificData(state.modeSpecificData, mode);
}

function fillModeSpecificData(data: any, mode: ScanMode): void {
  // Clear existing properties without allocating new object
  for (const key in data) delete data[key];
  
  switch (mode) {
    case ScanMode.TableSpeculation:
    case ScanMode.TableConfirmed:
      data.columnCount = speculationData1;
      data.headerEndPos = speculationData2;
      data.alignmentStartPos = speculationData3;
      break;
      
    case ScanMode.SetextSpeculation:
    case ScanMode.SetextConfirmed:
      data.underlineChar = speculationData1 === 61 ? '=' : '-';
      data.underlineLength = speculationData2;
      data.contentEndPos = speculationData3;
      break;
      
    case ScanMode.ListSpeculation:
    case ScanMode.ListConfirmed:
      data.markerType = speculationData1 === 0 ? 'unordered' : 'ordered';
      data.markerValue = speculationData2;
      data.indentLevel = speculationData3;
      break;
  }
}

// Usage in tests - reuse same state object
describe('Mode-Unified Scanner State', () => {
  const debugState: ScannerDebugState = {
    pos: 0, line: 0, column: 0, mode: '',
    isSpeculating: false, speculationStartPos: -1,
    speculationData1: 0, speculationData2: 0, speculationData3: 0,
    modeSpecificData: {} // Pre-allocated object, just gets cleared/refilled
  };

  test('table speculation mode tracking', () => {
    const scanner = createScanner();
    scanner.setText('| header |');
    
    scanner.scan();
    scanner.fillDebugState(debugState); // No allocation!
    
    expect(debugState.mode).toBe('TableSpeculation');
    expect(debugState.isSpeculating).toBe(true);
    expect(debugState.modeSpecificData.columnCount).toBe(1);
  });
  
  test('setext speculation to confirmation', () => {
    const scanner = createScanner();
    scanner.setText('Heading\n======');
    
    scanner.scan(); // Triggers SetextSpeculation
    scanner.scan(); // Resolves to SetextConfirmed
    scanner.fillDebugState(debugState); // Reuse same object!
    
    expect(debugState.mode).toBe('SetextConfirmed');
    expect(debugState.modeSpecificData.underlineChar).toBe('=');
    expect(debugState.modeSpecificData.underlineLength).toBeGreaterThan(0);
  });
});
```

## Performance Benefits Summary

### Memory Efficiency
```typescript
// Old approach with separate possibility objects:
tableState: TablePossibility | null;       // 16+ bytes object when active
setextState: SetextPossibility | null;     // 12+ bytes object when active  
listState: ListPossibility | null;         // 15+ bytes object when active

// New unified approach with mode + data fields:
mode: ScanMode;                             // 4 bytes enum
speculationStartPos: number;                // 4 bytes position
speculationData1: number;                   // 4 bytes mode-specific
speculationData2: number;                   // 4 bytes mode-specific
speculationData3: number;                   // 4 bytes mode-specific
// Total speculation state: 20 bytes, no allocation overhead
```

### Scan Mode Benefits
```typescript
// Old approach: Multiple boolean flags + separate objects
table_active: boolean;                      // 1 byte
setext_active: boolean;                     // 1 byte
list_active: boolean;                       // 1 byte
// + 3 separate possibility objects: ~40+ bytes

// New approach: Single mode field encodes everything
mode: ScanMode;                             // 4 bytes total
// Speculation state: 3 generic data fields + start position
```

### Zero Allocation Guarantee
- ✅ **All scanner state**: Primitive variables only (mode + 4 numbers + strings)
- ✅ **Ambiguity tracking**: Mode enum + primitive data fields  
- ✅ **State transitions**: Mode changes, no object creation/destruction
- ✅ **Testing interface**: Single diagnostic method with object reuse

**Total scanner state**: ~40 bytes for speculation, completely allocation-free during operation.

## Simplified Safe Rollback Points (Ultra-Safe Only)

### Scanner-Parser Responsibility Division

**Scanner Responsibilities**:
- Emit flat token stream (no nesting)
- Provide token text (always materialized, not lazy)
- Expose token length (start position implicit from scan() call site)
- Flag ultra-safe rollback points via token flags
- Give structural hints via flags (not build structure)

**Parser Responsibilities**:
- Build nested AST from flat token stream
- Track actual vs logical text positions (tab expansion, etc.)
- Map safe rollback points to AST node boundaries
- Handle incremental parsing rollback decisions

### Ultra-Safe Rollback Points Only

Since rescanning is cheap, stick to absolutely safe points only:

```typescript
enum RollbackType {
  DocumentStart = 0,        // Position 0 - always safe
  BlankLineBoundary = 1,    // After blank line - resets block context
  RawTextContent = 2,       // Within <script>/<style> - any position safe
  CodeBlockContent = 3,     // Within fenced code - line boundaries safe
  HtmlElementInner = 4,     // Within HTML element content (non-raw)
}
```

### Safe Point Positioning: BEFORE Token

Mark positions WHERE scanning can safely restart (before token):

```typescript
// Token flag indicates: "Scanning can safely restart at this position"
enum TokenFlags {
  // ... existing flags ...
  
  // Rollback safety flags (position BEFORE this token is safe)
  CanRollbackHere = 1 << 24,           // Generic "safe to restart here"
  RollbackTypeMask = 0x7 << 25,        // 3 bits for rollback type
  RollbackDocumentStart = 0 << 25,     // Position 0
  RollbackBlankLine = 1 << 25,         // After blank line
  RollbackRawText = 2 << 25,           // Within raw text
  RollbackCodeBlock = 3 << 25,         // Within code block
  RollbackHtmlInner = 4 << 25,         // Within HTML content
}

// Extract rollback info
function canRollbackBefore(flags: TokenFlags): boolean {
  return !!(flags & TokenFlags.CanRollbackHere);
}

function getRollbackType(flags: TokenFlags): RollbackType {
  return (flags & TokenFlags.RollbackTypeMask) >> 25;
}
```

### Scanner Token Interface

```typescript
interface Scanner {
  scan(): SyntaxKind;
  getToken(): SyntaxKind;
  getTokenText(): string;        // Always materialized
  getTokenLength(): number;      // Length of current token
  getTokenFlags(): TokenFlags;   // Includes rollback flags
  getTokenStart(): number;       // Current position (for parser offset tracking)
}

// Example token materialization
function getTokenText(): string {
  switch (token) {
    case SyntaxKind.HtmlOpeningElement:
      return extractTagName();              // "div", "span", etc.
    case SyntaxKind.HtmlAttributeName:
      return extractAttributeName();        // "class", "id", etc.
    case SyntaxKind.TextContent:
      return normalizeLineWhitespace();     // Line-based normalization
    case SyntaxKind.Identifier:
      return source.substring(start, pos); // Raw identifier
    default:
      return source.substring(start, pos);
  }
}
```

### Line-Based Text Tokenization for Editor Integration

**Strategy**: Break text into line-based tokens rather than paragraph-wide tokens to support fine-grained editor operations:

```typescript
// Editor-friendly approach: Line-based text tokens
function scanTextContent(): SyntaxKind {
  const lineStart = pos;
  
  // Scan to end of line or significant punctuation
  while (pos < end && !isLineBreak(source.charCodeAt(pos)) && 
         !isSignificantPunctuation(source.charCodeAt(pos))) {
    pos++;
  }
  
  // Normalize whitespace within this line only
  const rawText = source.substring(lineStart, pos);
  const normalizedText = collapseInlineWhitespace(rawText);
  
  return SyntaxKind.TextContent;
}

// Example tokenization of multi-line paragraph:
const input = `This is a long paragraph
that spans multiple lines  
and should be editable
line by line in editors.`;

// Produces token stream:
[
  { kind: SyntaxKind.TextContent, text: "This is a long paragraph", length: 25 },
  { kind: SyntaxKind.NewLineTrivia, text: "\n", length: 1 },
  { kind: SyntaxKind.TextContent, text: "that spans multiple lines", length: 25 },
  { kind: SyntaxKind.WhitespaceTrivia, text: "  ", length: 2 }, // Trailing spaces
  { kind: SyntaxKind.NewLineTrivia, text: "\n", length: 1 },
  { kind: SyntaxKind.TextContent, text: "and should be editable", length: 22 },
  { kind: SyntaxKind.NewLineTrivia, text: "\n", length: 1 },
  { kind: SyntaxKind.TextContent, text: "line by line in editors.", length: 24 }
]
```

### Parser Text Reconstruction

Parser combines line-based text tokens into paragraph content:

```typescript
function parseParagraphContent(): TextNode[] {
  const textRuns: TextNode[] = [];
  
  while (scanner.getToken() === SyntaxKind.TextContent || 
         scanner.getToken() === SyntaxKind.NewLineTrivia) {
    
    if (scanner.getToken() === SyntaxKind.TextContent) {
      textRuns.push(createTextNode(
        scanner.getTokenStart(),
        scanner.getTokenStart() + scanner.getTokenLength(),
        scanner.getTokenText()
      ));
      scanner.scan();
      
      // Insert soft break for line boundaries
      if (scanner.getToken() === SyntaxKind.NewLineTrivia) {
        textRuns.push(createSoftBreakNode());
        scanner.scan();
      }
    }
  }
  
  return textRuns;
}

// Alternative: Concatenate with spaces for simple text content
function getParagraphText(): string {
  const parts: string[] = [];
  
  while (scanner.getToken() === SyntaxKind.TextContent || 
         scanner.getToken() === SyntaxKind.NewLineTrivia) {
    
    if (scanner.getToken() === SyntaxKind.TextContent) {
      parts.push(scanner.getTokenText());
    } else if (scanner.getToken() === SyntaxKind.NewLineTrivia) {
      parts.push(' '); // Convert line breaks to spaces
    }
    scanner.scan();
  }
  
  return parts.join('');
}
```

### Editor Integration Benefits

#### 1. **Fine-Grained Change Detection**
```typescript
// Edit within one line doesn't invalidate other lines
const paragraph = `Line one of text
Line two of text
Line three of text`;

// User edits "Line two" → only affects middle text token
// Line one and line three tokens remain valid for incremental parsing
```

#### 2. **Preserved Document Structure**
```typescript
// Original offsets maintained for ProseMirror/editor integration
interface TextToken {
  kind: SyntaxKind.TextContent;
  text: string;           // Normalized content
  originalStart: number;  // Position in original document
  originalLength: number; // Length in original document
}

// Editor can apply changes back to original document using offsets
function applyEdit(edit: TextEdit, token: TextToken): void {
  const originalRange = { 
    start: token.originalStart, 
    end: token.originalStart + token.originalLength 
  };
  document.replaceRange(originalRange, edit.newText);
}
```

#### 3. **Granular Rollback Points**
```typescript
// Line boundaries within paragraphs can be rollback points
enum RollbackType {
  // ... existing ultra-safe types ...
  LineWithinParagraph = 5,  // Safe within paragraph line boundaries
}

// Mark line-start positions as potential rollback points
function scan(): SyntaxKind {
  // ... existing logic ...
  
  if (atLineStart && withinParagraph) {
    tokenFlags |= TokenFlags.CanRollbackHere | TokenFlags.RollbackLineWithinParagraph;
  }
  
  return token;
}
```

This approach provides the **best of both worlds**:
- **Parsing efficiency**: Normalized text within lines, easy concatenation
- **Editor integration**: Fine-grained tokens preserve original structure
- **Incremental parsing**: Line-level granularity for change detection
- **Performance**: Minimal token overhead while maximizing reusability
```

### Ultra-Safe Point Detection

```typescript
function scan(): SyntaxKind {
  const startPos = pos;
  const token = scanToken();
  
  // Mark ultra-safe rollback points
  let rollbackFlags = TokenFlags.None;
  
  if (startPos === 0) {
    // Document start - always safe
    rollbackFlags = TokenFlags.CanRollbackHere | TokenFlags.RollbackDocumentStart;
  } else if (precedingBlankLine) {
    // After blank line - block context reset
    rollbackFlags = TokenFlags.CanRollbackHere | TokenFlags.RollbackBlankLine;
  } else if (mode === ScanMode.RawText) {
    // Within <script>/<style> - any position safe
    rollbackFlags = TokenFlags.CanRollbackHere | TokenFlags.RollbackRawText;
  } else if (mode === ScanMode.CodeBlockContent && atLineStart) {
    // Within fenced code at line start - safe
    rollbackFlags = TokenFlags.CanRollbackHere | TokenFlags.RollbackCodeBlock;
  } else if (mode === ScanMode.Normal && withinHtmlElement && !withinRawText) {
    // Within HTML element content (non-raw) - potentially safe
    rollbackFlags = TokenFlags.CanRollbackHere | TokenFlags.RollbackHtmlInner;
  }
  
  tokenFlags |= rollbackFlags;
  return token;
}
```

### Parser Rollback Integration

```typescript
interface RollbackPoint {
  position: number;           // Text position to restart from
  type: RollbackType;         // Type of safe boundary
  scannerMode: ScanMode;      // Scanner mode to restore
}

// Parser finds rollback points during AST construction
function findRollbackPoint(edit: TextEdit, ast: Node): RollbackPoint | null {
  let current = findNodeContaining(ast, edit.start);
  
  // Walk up AST looking for nodes with safe rollback points
  while (current) {
    if (current.flags & NodeFlags.CanRollback) {
      const rollbackType = getRollbackTypeFromNode(current);
      
      // Only use ultra-safe points
      if (isUltraSafe(rollbackType)) {
        return {
          position: current.start,
          type: rollbackType,
          scannerMode: getScannerModeForRollback(current, rollbackType)
        };
      }
    }
    current = current.parent;
  }
  
  // Fallback to document start (always ultra-safe)
  return {
    position: 0,
    type: RollbackType.DocumentStart,
    scannerMode: ScanMode.Normal
  };
}

function isUltraSafe(type: RollbackType): boolean {
  switch (type) {
    case RollbackType.DocumentStart:
    case RollbackType.BlankLineBoundary:
    case RollbackType.RawTextContent:
    case RollbackType.CodeBlockContent:
      return true;
    case RollbackType.HtmlElementInner:
      return true; // Consider ultra-safe if within non-raw HTML
    default:
      return false;
  }
}
```

### Benefits of Ultra-Safe Only Approach

#### 1. **Simplicity**
- Only 4-5 rollback types vs 10+
- Clear safety guarantees
- No complex context validation needed

#### 2. **Reliability**  
- Zero false positives (unsafe points marked as safe)
- Conservative but correct
- Cheap rescanning makes aggressive rollback acceptable

#### 3. **Clear Responsibilities**
- Scanner: Flat tokens + ultra-safe flags
- Parser: AST construction + rollback decisions
- No overlap or confusion

#### 4. **Performance**
```typescript
// Simple rollback type check
function isUltraSafe(type: RollbackType): boolean {
  return type <= RollbackType.HtmlElementInner; // Just numeric comparison
}

// No complex validation logic needed
// No context-dependent safety analysis
// Just check type and proceed
```

This approach prioritizes **correctness and simplicity** over optimal rollback granularity, which is perfect given that rescanning is fast and cheap.

### 1. **Mode Unification Eliminates Boolean Flags**
Instead of separate `table_active`, `setext_active`, `list_active` booleans, use single `mode: ScanMode` that encodes both content type AND ambiguity state.

### 2. **Generic Data Fields Replace Specific Objects**
Three `speculationData` fields can represent any ambiguity type through mode-specific interpretation. No object allocation needed.

### 3. **AST-Derived Rollback Points**
Just 1 bit per AST node (`canRollback: boolean`) replaces complex boundary maps. Derive rollback positions and types directly from AST structure.

### 4. **Zero-Allocation Diagnostic Hook**
Pass mutable object to `fillDebugState()` that interprets data fields based on current mode. Reuse same debug state object across all test calls.

This design achieves **zero-allocation scanning** with **maximum simplicity** and **excellent testability**.

### Complete Ambiguity Catalog

**Analysis**: All major Markdown ambiguities are line-interpretation problems:

| Ambiguity | Trigger | Resolution | Mode |
|-----------|---------|------------|------|
| **Table vs Paragraph** | Line starts with `\|` | Next line has alignment pattern `\|---\|` | `TableSpeculation` |
| **Setext vs Paragraph** | Text line + newline | Next line is `===` or `---` sequence | `SetextSpeculation` |
| **List vs Paragraph** | Line starts with `- ` or `1. ` | Valid marker + proper spacing | `ListSpeculation` |
| **ATX Heading vs Paragraph** | Line starts with `#` | Valid `# ` + space pattern | Immediate resolution |
| **Thematic Break vs Paragraph** | Line has `---` or `***` | 3+ chars, only spaces/tabs | Immediate resolution |
| **Code Fence vs Paragraph** | Line starts with \`\`\` or ~~~ | Valid fence pattern | `CodeFenceSpeculation` |
| **HTML Block vs Inline** | `<div>` at line start | Block-level HTML tag | `HtmlBlockSpeculation` |

**Key Insight**: Only 4 ambiguities need multi-line speculation (table, setext, code fence, HTML block). Others resolve immediately.

### Immediate vs Speculative Resolution

```typescript
private checkTriggers(ch: number): void {
  switch (ch) {
    case CharacterCodes.bar: // '|'
      if (isAtLineStart()) {
        mode = ScanMode.TableSpeculation;
        speculationStartPos = pos;
        speculationData1 = 1; // columnCount
      }
      break;
      
    case CharacterCodes.hash: // '#'
      if (isAtLineStart()) {
        return resolveATXHeading(); // Immediate resolution
      }
      break;
      
    case CharacterCodes.newline:
      if (hasLineContent()) {
        mode = ScanMode.SetextSpeculation;
        speculationStartPos = lastLineStart;
        // Next line might be underline
      }
      break;
      
    case CharacterCodes.backtick: // '`'
      if (isAtLineStart() && isCodeFenceStart()) {
        mode = ScanMode.CodeFenceSpeculation;
        speculationStartPos = pos;
      }
      break;
  }
}

private resolveATXHeading(): SyntaxKind {
  // Count # characters, check for space
  const level = countHashRun();
  if (level >= 1 && level <= 6 && nextCharIsSpace()) {
    return SyntaxKind.ATXHeadingStart;
  }
  return SyntaxKind.TextContent;
}
```

### Mode-Unified Ambiguity Lifecycle

```typescript
// Scanner state: just mode + 3 data fields + position tracking
class Scanner {
  private pos = 0;
  private line = 0;
  private column = 0;
  private mode = ScanMode.Normal;
  private speculationStartPos = -1;
  private speculationData1 = 0;
  private speculationData2 = 0;
  private speculationData3 = 0;
  
  scan(): SyntaxKind {
    const ch = source.charCodeAt(pos);
    
    // Mode-driven scanning
    switch (mode) {
      case ScanMode.Normal:
        return scanNormal(ch);
        
      case ScanMode.TableSpeculation:
        return scanTableSpeculation(ch);
        
      case ScanMode.SetextSpeculation:
        return scanSetextSpeculation(ch);
        
      case ScanMode.TableConfirmed:
        return emitTableTokens();
        
      case ScanMode.SetextConfirmed:
        return emitSetextTokens();
    }
  }
  
  private scanTableSpeculation(ch: number): SyntaxKind {
    if (ch === CharacterCodes.bar) {
      speculationData1++; // columnCount++
    } else if (ch === CharacterCodes.newline) {
      speculationData2 = pos; // headerEndPos
      // Check next line for alignment
      if (hasValidAlignment()) {
        mode = ScanMode.TableConfirmed;
        return rewindAndEmitTable();
      } else {
        mode = ScanMode.Normal;
        return SyntaxKind.TextContent;
      }
    }
    
    pos++;
    return scan(); // Continue scanning
  }
}
```

## Mutual Exclusivity Rules

```typescript
private materializeConstruct(type: ConstructType): void {
  switch (type) {
    case ConstructType.Table:
      // Table materializes - clear all other possibilities
      this.state.listState = null;
      this.state.setextState = null;
      this.state.codeFenceState = null;
      break;
      
    case ConstructType.SetextHeading:
      // Setext materializes - clear all other possibilities
      this.state.tableState = null;
      this.state.listState = null;
      this.state.codeFenceState = null;
      break;
  }
}
```

## Granularity Decision: Significant vs Simple Forks

### Significant Forks (Get Possibility State)
- **Tables**: Multi-line pattern, complex alignment rules
- **Setext Headings**: Two-line pattern, requires lookahead
- **Code Fences**: Multi-line with matching closing fence
- **Lists**: Complex indentation and marker rules

### Simple Forks (Immediate Resolution)
```typescript
private resolveSimpleDelimiter(ch: number): SyntaxKind {
  if (ch === CharacterCodes.asterisk) {
    // Simple lookahead for emphasis vs list vs thematic break
    const next = this.peekChar(1);
    const atLineStart = this.isAtLineStart();
    
    if (atLineStart && this.isThematicBreakPattern()) {
      return SyntaxKind.ThematicBreak;
    }
    
    if (atLineStart && isWhitespace(next)) {
      return SyntaxKind.ListMarkerUnordered;
    }
    
    return SyntaxKind.EmphasisDelimiter; // Default to emphasis
  }
}
```

## Memory Efficiency Benefits

### Zero Allocation During Speculation
```typescript
// All state is primitives and enums - no string allocation
interface TablePossibility {
  startPos: number;        // 4 bytes
  headerEndPos: number;    // 4 bytes  
  alignmentStartPos: number; // 4 bytes
  columnCount: number;     // 4 bytes
  hasValidAlignment: boolean; // 1 byte
}
// Total: ~17 bytes per table possibility, zero GC pressure
```

### Bounded State Space
```typescript
// Maximum scanner state size is predictable
const MAX_SCANNER_STATE_SIZE = 
  4 * 4 +           // position tracking (16 bytes)
  17 +              // TablePossibility (17 bytes)
  13 +              // SetextPossibility (~13 bytes)
  15 +              // ListPossibility (~15 bytes)
  12;               // CodeFencePossibility (~12 bytes)
// Total: ~77 bytes maximum state, all stack-allocated
```

## Testing Strategy

### Unit Test Individual Possibilities
```typescript
describe('TablePossibility', () => {
  test('arises on pipe character', () => {
    const scanner = createScanner();
    scanner.setText('| header |');
    
    scanner.scanChar(); // Should arise table possibility
    expect(scanner.getSpeculativeState().tableState).toBeDefined();
    expect(scanner.getSpeculativeState().tableState.columnCount).toBe(1);
  });
  
  test('materializes on valid alignment row', () => {
    const scanner = createScanner();
    scanner.setText('| A | B |\n|---|---|');
    
    const token = scanner.scan();
    expect(token).toBe(SyntaxKind.TableHeaderStart);
    // Table materialized, other possibilities cleared
    expect(scanner.getSpeculativeState().setextState).toBeNull();
  });
});
```

### Integration Test Ambiguity Resolution
```typescript
describe('Ambiguity Resolution', () => {
  test('table beats setext when both are possible', () => {
    const scanner = createScanner();
    scanner.setText('| Heading |\n|---------|');
    
    const token = scanner.scan();
    expect(token).toBe(SyntaxKind.TableHeaderStart); // Table wins
  });
  
  test('setext fallback when table fails', () => {
    const scanner = createScanner();
    scanner.setText('Heading\n=======');
    
    const token = scanner.scan();
    expect(token).toBe(SyntaxKind.SetextHeadingStart); // Setext wins
  });
});
```

## Performance Characteristics

- **Memory**: Bounded ~77 bytes maximum state
- **CPU**: O(1) possibility state updates per character
- **GC**: Zero allocation during speculation
- **Backtrack**: Simple state reset, no complex restoration

## Implementation Phases

### Phase 1: Core Infrastructure
- Implement typed possibility interfaces
- Build arise/capture/resolve lifecycle
- Add simple delimiter immediate resolution

### Phase 2: Major Constructs  
- Implement TablePossibility
- Implement SetextPossibility
- Add mutual exclusivity rules

### Phase 3: Complete Coverage
- Add ListPossibility, CodeFencePossibility
- Implement all trigger detection
- Add comprehensive test coverage

## Critical Challenge: Token Emission Timing

### The Overshoot Problem

A major complexity emerges: **we can only emit tokens when all ambiguities resolve**, but by then we may have scanned past the winning token's boundaries.

```markdown
| Maybe table |
===============
```

**Scanning Timeline**:
1. `|` → arise `tableState`
2. Scan `Maybe table |` → still ambiguous  
3. `\n` + `=` → arise `setextState`
4. Scan `===============` → setextState wins (valid pattern)
5. **Problem**: Scanner at position after underline, but `SetextHeadingStart` token should begin at "Maybe"

### Simple Rewind-and-Rescan Solution

**Key Insight**: Scanning is incredibly fast (pure character code arithmetic), so we can afford to re-scan the same region multiple times rather than buffering tokens.

```typescript
interface ScannerState {
  // ... existing typed possibility states ...
  
  // Simple rewind tracking - no token buffering needed
  ambiguityStartPos: number;        // Where to rewind when ambiguity resolves
  winnerType: PossibilityType | null; // Which possibility won (for rescan mode)
}
```

```typescript
private resolveAmbiguities(): SyntaxKind {
  const winner = this.determineWinner();
  
  if (winner) {
    // Simple rewind-and-rescan approach
    this.winnerType = winner;
    this.pos = this.ambiguityStartPos;
    this.clearLosingPossibilities(winner);
    
    // Re-scan with winner knowledge - no buffering needed
    return this.scanWithWinner();
  }
  
  return SyntaxKind.TextContent;
}

private scanWithWinner(): SyntaxKind {
  // Re-scan the region knowing which construct won
  switch (this.winnerType) {
    case PossibilityType.SetextHeading:
      return this.scanSetextHeading();
      
    case PossibilityType.Table:
      return this.scanTableHeader();
      
    default:
      return SyntaxKind.TextContent;
  }
}

private scanSetextHeading(): SyntaxKind {
  // Scan heading content until newline
  while (this.pos < this.end && this.source.charCodeAt(this.pos) !== CharacterCodes.newline) {
    this.pos++;
  }
  
  return SyntaxKind.SetextHeadingStart;
  // Next scan() call will emit SetextUnderline token
}
```

### Simplified State Management

```typescript
private ariseTablePossibility(): TablePossibility {
  if (this.ambiguityStartPos === -1) {
    this.ambiguityStartPos = this.pos; // Mark rewind point
  }
  
  return {
    startPos: this.pos,
    headerEndPos: -1,
    alignmentStartPos: -1, 
    columnCount: 1,
    hasValidAlignment: false
  };
}

private clearAmbiguityState(): void {
  this.tableState = null;
  this.listState = null;
  this.setextState = null;
  this.codeFenceState = null;
  this.ambiguityStartPos = -1;
  this.winnerType = null;
}
```

### Performance Reality Check ⚡

**Re-scanning Cost Analysis**:
```typescript
// Typical ambiguous region: 50-100 characters
// Re-scanning operations per character:
//   - charCodeAt(): ~1 CPU cycle
//   - Position increment: ~1 CPU cycle  
//   - Condition check: ~1 CPU cycle
// Total: ~3 CPU cycles per character
// 100 characters × 3 cycles = 300 cycles ≈ 0.1 microseconds
```

**Memory Impact**:
```typescript
// Simplified state (no token buffering):
ambiguityStartPos: number;           // 4 bytes
winnerType: PossibilityType | null;  // 4 bytes  
// + original typed possibilities: ~77 bytes
// Total: ~85 bytes (vs 200-300 with buffering)
```

**Benefits**:
- ✅ **Minimal memory overhead** (~85 bytes total)
- ✅ **Zero GC pressure** (all primitives)
- ✅ **Simple implementation** (no token buffering complexity)
- ✅ **Pay-as-you-go** (only re-scan when ambiguities exist)
- ✅ **Clean external API** (parser sees only definitive tokens)

This approach provides **maximum efficiency** with **reasonable complexity** by embracing re-scanning as a cheap operation and eliminating token buffering overhead.

## Architecture Comparison: Closure vs Class-Based Scanner

### Current Implementation: Function Closure Approach

```typescript
export function createScanner(): Scanner {
  // ~20 state variables captured in closure
  let source = '';
  let pos = 0;
  let end = 0;
  let startPos = 0;
  let token = SyntaxKind.Unknown;
  let tokenValue: string | undefined = undefined;
  let tokenFlags = TokenFlags.None;
  let errorCode = ScannerErrorCode.None;
  let errorMessage = '';
  let onError: ErrorCallback | undefined = undefined;
  let errorQueue: QueuedError[] = [];
  let suppressErrorDepth = 0;
  let emittedErrorKeys: Set<string> = new Set();
  let valueStart = -1;
  let valueEnd = -1;
  let atLineStart = true;
  let inParagraph = false;
  let precedingLineBreak = false;
  let scanMode: InternalScanMode = InternalScanMode.Normal;
  let rawTextEndTag: string | undefined = undefined;
  let rcdataEndTag: string | undefined = undefined;
  let lastLineStart = 0;
  let htmlBlockHintActive = false;
  let orderedListStartValue = -1;
  
  function scan(): SyntaxKind {
    // Direct variable access
    if (pos >= end) return token = SyntaxKind.EndOfFileToken;
    const ch = source.charCodeAt(pos);
    // ...
  }
  
  return { scan, getToken, getTokenText, /* ... */ };
}
```

### Alternative: Class-Based Approach

```typescript
export class Scanner {
  private source = '';
  private pos = 0;
  private end = 0;
  private startPos = 0;
  private token = SyntaxKind.Unknown;
  private tokenValue: string | undefined = undefined;
  private tokenFlags = TokenFlags.None;
  private errorCode = ScannerErrorCode.None;
  private errorMessage = '';
  private onError: ErrorCallback | undefined = undefined;
  private errorQueue: QueuedError[] = [];
  private suppressErrorDepth = 0;
  private emittedErrorKeys: Set<string> = new Set();
  private valueStart = -1;
  private valueEnd = -1;
  private atLineStart = true;
  private inParagraph = false;
  private precedingLineBreak = false;
  private scanMode: InternalScanMode = InternalScanMode.Normal;
  private rawTextEndTag: string | undefined = undefined;
  private rcdataEndTag: string | undefined = undefined;
  private lastLineStart = 0;
  private htmlBlockHintActive = false;
  private orderedListStartValue = -1;
  
  scan(): SyntaxKind {
    // Field access with `this.` indirection
    if (this.pos >= this.end) return this.token = SyntaxKind.EndOfFileToken;
    const ch = this.source.charCodeAt(this.pos);
    // ...
  }
}
```

## Performance Analysis

### Memory Layout

**Closure Approach**:
```
[Function Object] → [Closure Environment]
                     ├─ source: string
                     ├─ pos: number  
                     ├─ end: number
                     ├─ startPos: number
                     └─ ... (16 more variables)

Memory: Function object (~40 bytes) + Closure environment (~200 bytes) = ~240 bytes
```

**Class Approach**:
```
[Scanner Instance]
├─ source: string
├─ pos: number
├─ end: number  
├─ startPos: number
└─ ... (16 more fields)

Memory: Object instance (~240 bytes)
```

### Variable/Field Access Performance

**Closure (Current)**:
```typescript
// Direct variable access - fastest possible
if (pos >= end) return token = SyntaxKind.EndOfFileToken;
const ch = source.charCodeAt(pos);
pos++;

// Compiled to approximately:
// if (pos_var >= end_var) return token_var = 1;
// const ch = source_var.charCodeAt(pos_var);
// pos_var++;
```

**Class Alternative**:
```typescript
// Field access requires `this` dereference
if (this.pos >= this.end) return this.token = SyntaxKind.EndOfFileToken;
const ch = this.source.charCodeAt(this.pos);
this.pos++;

// Compiled to approximately:
// if (this_ref.pos >= this_ref.end) return this_ref.token = 1;
// const ch = this_ref.source.charCodeAt(this_ref.pos);
// this_ref.pos++;
```

### Performance Measurements

**Theoretical Analysis**:
```
Closure variable access: 1 CPU cycle (direct memory access)
Class field access: 2-3 CPU cycles (pointer dereference + offset)

For scanning 1000 characters with ~3000 variable accesses:
- Closure: ~3000 cycles
- Class: ~6000-9000 cycles
- Difference: ~3000-6000 cycles ≈ 1-2 microseconds
```

**Real-world Impact**: In hot scanning loops (called millions of times), the cumulative difference could be measurable (~1-5% performance difference).

## Other Considerations

### Developer Experience

**Closure Advantages**:
- ✅ Variables look "local" and clean
- ✅ No `this.` noise in scanning logic
- ✅ Functional programming style
- ✅ Impossible to accidentally expose private state

**Class Advantages**:
- ✅ More familiar OOP pattern
- ✅ Better IDE support (autocomplete, refactoring)
- ✅ Easier to add inheritance/composition later
- ✅ Standard TypeScript class patterns

### Memory Management

**Closure Behavior**:
```typescript
const scanner1 = createScanner();
const scanner2 = createScanner();
// Two separate closure environments, no shared state
// Each closure keeps ALL captured variables alive
```

**Class Behavior**:
```typescript
const scanner1 = new Scanner();
const scanner2 = new Scanner();
// Two separate object instances
// Standard object lifecycle management
```

### Garbage Collection

**Closure GC**:
- Entire closure environment kept alive until scanner reference dies
- All captured variables (even unused ones) kept in memory
- May have slightly different GC pressure patterns

**Class GC**:
- Standard object GC behavior
- Individual fields can potentially be optimized by JS engines
- More predictable memory lifecycle

## Recommendation: Stick with Closure

**Verdict**: The current closure-based approach is **slightly better** for a hot-path scanner:

### Performance Benefits
- ✅ **1-5% faster** variable access in scanning loops
- ✅ **Zero `this.` indirection overhead**
- ✅ **Compiler optimization friendly** (variables look local)

### Design Benefits  
- ✅ **Impossible to expose private state** accidentally
- ✅ **Clean, noise-free scanning code**
- ✅ **Functional style** matches TypeScript compiler patterns

### Minimal Downsides
- ❌ Slightly less familiar to OOP developers
- ❌ Harder to extend with inheritance (not needed for scanner)

**Bottom Line**: For a performance-critical component like a scanner where variable access happens millions of times, the closure approach provides measurable benefits with no significant downsides.