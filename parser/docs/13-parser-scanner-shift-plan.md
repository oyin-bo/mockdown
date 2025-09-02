# Parser-Scanner Responsibility Shift: Typed Ambiguity Resolution

## Implementation Staging Plan

### Stage 1: Text Lines + Whitespace/Newlines
Everything comes as text tokens (1 per line with normalized text content), plus whitespace and newline tokens as per CommonMark spec. Establishes the 4-field interface and basic line-by-line scanning.

### Stage 2: Testing Infrastructure
Build annotated Markdown testing system for comprehensive validation. All subsequent stages will use this testing approach.

Testing will be based on annotated text format where Markdown and test expectations are interleaved.

ˋˋˋ
const tokenTest = ˋ
# Heading1
1 2
@1 HeadingMarker ...optionally attributes to expect...
@2 Text
* List1
1 2
@1 ListMarker ...optionally attributes to expect...
ˋ;

expect(verifyTokens(tokenTest)).toBe(tokenTest);
ˋˋˋ

Here you can see any Markdown line optionally followed with
a list of digits 1 to 9, then letters A to Z marking positions in text.
These positions on the next lines can be referred to with @1, @2, etc.
Any line with incremental digits, then letters is considered
position-reference line.
Lines immediately following position-reference lines and starting
with @ then digit or letter are for asserting tokens at corresponding position.
The first word after that @1, @2 is token kind.
After that separated with a space can optionally go attribute assertions.
We should support syntax like propertyName: <JSON-serialized value>.

As of the Stage 1 we may only support only 2 token types,
so the testing infrastructure will not be that useful yet.

Functionally this is exposed with verifyTokens that takes in
the annotated format, and if its expectations match, returns
the same original string.
If any of the expectations don't match, it injects an error message
as an extra line below the expectation in the original string.

### Stage 3: Inline Formatting (Bold, Italic, Code)
- Bold (`**text**`, `__text__`)
- Italic (`*text*`, `_text_`)
- Code spans (`` `code` ``, ``` ``code`` ```)
- Strikethrough (`~~text~~`)
- Emphasis delimiter recognition and matching

### Stage 4: Entities and HTML
- Character entities (`&amp;`, `&lt;`, `&#123;`)
- HTML tags (inline and block-level)
- HTML attributes parsing
- Raw HTML content handling

### Stage 5: Thematic Breaks
- Horizontal rules (`---`, `***`, `___`)
- Variant detection (3+ characters, whitespace handling)
- Differentiation from setext headings

### Stage 6: Lists
- Ordered list markers (`1.`, `2.`, etc.)
- Unordered list markers (`-`, `*`, `+`)
- List indentation and nesting
- Tight vs loose list detection
- Task list markers (`- [ ]`, `- [x]`)

### Stage 7: Tables
- Table detection (`| header |`)
- Alignment row parsing (`|---|:--:|--:|`)
- Multi-line table speculation
- Column alignment handling

### Stage 8: Extensions Group A (Code & Math)
- Fenced code blocks (``` and ~~~ with info strings)
- Math blocks (`$$...$$`)
- Math inline (`$...$`)
- Language-specific highlighting hints

### Stage 9: Extensions Group B (Headings & Structure)
- ATX headings (`# Header`)
- Setext headings (text + underline)
- Frontmatter (YAML `---`, TOML `+++`)
- Document structure tokens

### Stage 10: Extensions Group C (Links & Advanced)
- Link parsing (`[text](url)`, `[text][ref]`)
- Image parsing (`![alt](url)`)
- Reference definitions (`[ref]: url`)
- Autolinks and URL detection

### Stage 11: Remaining Syntax
- Any other Markdown syntax not covered above
- Custom extensions and edge cases
- Performance optimizations

### Stage 12: Rollback System
- TokenFlags with rollback information
- Ultra-safe rollback point detection
- AST-derived rollback integration
- Incremental parsing support

Each stage builds incrementally with comprehensive testing before advancing.

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
// New approach - simplified scanner interface
interface Scanner {
  // Core methods - only 3 methods total
  scan(): void;                                    // Advances to next token, updates all fields
  rollback(pos: number, type: RollbackType): void; // Structured rollback
  fillDebugState(state: ScannerDebugState): void;  // Zero-allocation diagnostics
  
  // Token fields - updated by scan() and rollback()
  token: SyntaxKind;           // Current token type
  tokenText: string;           // Current token text (always materialized)
  tokenFlags: TokenFlags;      // Token flags including rollback safety
  offsetNext: number;          // Where the next token will start
}

// Parser becomes even simpler - direct field access
function parseBlock(): BlockNode {
  const tokenStart = pos;              // Parser tracks current position
  scanner.scan();                      // Updates all scanner fields
  const tokenLength = scanner.offsetNext - tokenStart; // Derived length
  
  switch (scanner.token) {             // Direct field access, no method call
    case SyntaxKind.TableHeaderStart:
      return parseTable();             // Scanner resolved table vs paragraph
    case SyntaxKind.SetextHeadingStart:  
      return parseSetextHeading();     // Scanner resolved setext vs paragraph
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

### Separated Scanner State: Content Mode + Speculation Flags

**Problem**: Speculations can overlap! `1. List | OK` can trigger both list AND table speculation simultaneously.

**Solution**: Separate content processing from speculation tracking:

```typescript
// Content processing mode - only one active at a time
const enum ContentMode {
  Normal = 0,                    // Regular Markdown tokenization
  RawText = 1,                   // Literal text until end tag (script, style)
  RCData = 2,                    // Text with entities until end tag (textarea, title)
  CodeBlock = 3,                 // Literal text until matching fence
  MathInline = 4,                // Math content until closing $
  MathBlock = 5,                 // Math content until closing $$
  HtmlComment = 6,               // Inside <!-- --> comment
  FrontmatterYaml = 7,           // Inside YAML frontmatter
  FrontmatterToml = 8,           // Inside TOML frontmatter
}

// Speculation flags - multiple can be active simultaneously
const enum SpeculationFlags {
  None = 0,
  Table = 1 << 0,                // 0x01 - Collecting table evidence
  SetextHeading = 1 << 1,        // 0x02 - Checking for setext underline
  List = 1 << 2,                 // 0x04 - Validating list marker
  CodeFence = 1 << 3,            // 0x08 - Validating code fence
  HtmlBlock = 1 << 4,            // 0x10 - Determining HTML block
}

// Context flags - affect token emission
const enum ContextFlags {
  None = 0,
  HtmlBlockActive = 1 << 0,      // 0x01 - Apply HTML block token flags
  AtLineStart = 1 << 1,          // 0x02 - Currently at line start
  InParagraph = 1 << 2,          // 0x04 - Inside paragraph content
  PrecedingLineBreak = 1 << 3,   // 0x08 - Line break before current position
}

// Persistent scanner state - only what survives between scan() calls  
interface ScannerState {
  // Position tracking
  pos: number;
  line: number;
  column: number;
  
  // Content processing mode - affects how characters are interpreted
  contentMode: ContentMode;
  endPattern: string | undefined;  // What ends the current content mode
  
  // Context flags - affect token emission
  atLineStart: boolean;
  inParagraph: boolean;
  htmlBlockHintActive: boolean;
  precedingLineBreak: boolean;
  
  // Negative speculation cache - avoid redundant speculation attempts
  doubtAvoidanceFlags: number;         // Bit flags: which speculations we've ruled out
  
  // Cross-line state continuity
  currentIndentLevel: number;          // Indentation level for list context tracking
  lastBlankLinePos: number;            // Position of last blank line (resets block-level state)
}

// Persistent: ~35 bytes
```

**Example: Overlapping Speculation**:
```typescript
// Input: "1. List | OK"
//        ^
// Scanner encounters '1.'
speculationFlags |= SpeculationFlags.List;
speculationStartPos = pos;
speculationData1 = 1; // list number

// Continue scanning: "1. List | OK"  
//                             ^
// Scanner encounters '|'
speculationFlags |= SpeculationFlags.Table; // Now both active!
// Table data goes in speculationData2/3, list data stays in speculationData1

// Resolution: Check what patterns are valid
if (hasValidListPattern() && hasValidTablePattern()) {
  // Both valid - table wins (or use precedence rules)
  speculationFlags = SpeculationFlags.None;
  return emitTableStart();
} else if (hasValidListPattern()) {
  speculationFlags &= ~SpeculationFlags.Table; // Clear table, keep list
  return emitListMarker();
} else {
  speculationFlags = SpeculationFlags.None; // Clear all
  return emitTextContent();
}
```

**Negative Speculation Optimization**:
```typescript
// Doubt avoidance flags - single variable with bit flags
const enum DoubtAvoidanceFlags {
  None = 0,
  NoSetextThisLine = 1 << 0,      // 0x01 - No setext possible this line
  NoTableThisBlock = 1 << 1,      // 0x02 - No table possible this block
  NoListHere = 1 << 2,            // 0x04 - No list possible at current indent
  NoCodeFenceThisLine = 1 << 3,   // 0x08 - No code fence possible this line
}

function scan(): void {           // Returns nothing - updates scanner fields directly
  const ch = source.charCodeAt(pos);
  
  // Natural doubt flag resets at appropriate boundaries
  if (atLineStart) {
    // Line-scoped flags reset automatically each line
    doubtAvoidanceFlags &= ~(DoubtAvoidanceFlags.NoSetextThisLine | DoubtAvoidanceFlags.NoCodeFenceThisLine);
    
    // Update indent level for list context tracking
    currentIndentLevel = getCurrentIndentLevel();
    
    // Block-scoped flags reset only after blank lines
    if (isBlankLine()) {
      doubtAvoidanceFlags &= ~DoubtAvoidanceFlags.NoTableThisBlock;
      lastBlankLinePos = pos;
    }
  }
  
  // Skip expensive speculation if we've already ruled it out
  if (ch === CharacterCodes.equals || ch === CharacterCodes.minus) {
    if (!(doubtAvoidanceFlags & DoubtAvoidanceFlags.NoSetextThisLine) && inParagraph && atLineStart) {
      // Local speculation variables (no object allocation)
      let setext_startPos = pos;
      let setext_contentEndPos = -1;
      let setext_underlineChar = ch;
      
      // Attempt setext speculation
      const setextResult = speculateSetext(setext_startPos, setext_underlineChar);
      if (setextResult.isValid) {
        emitSetextHeading(setextResult);  // Updates scanner fields
        return;
      } else {
        // Cache negative result - no more setext checks this line
        doubtAvoidanceFlags |= DoubtAvoidanceFlags.NoSetextThisLine;
      }
    }
    // Skip setext speculation if NoSetextThisLine flag is set
  }
  
  if (ch === CharacterCodes.bar) {
    if (!(doubtAvoidanceFlags & DoubtAvoidanceFlags.NoTableThisBlock) && couldBeTableContext()) {
      // Local speculation variables (no object allocation)
      let table_startPos = pos;
      let table_columnCount = 1;
      let table_headerEndPos = -1;
      
      // Attempt table speculation
      const tableResult = speculateTable(table_startPos, table_columnCount);
      if (tableResult.isValid) {
        emitTableStart(tableResult);      // Updates scanner fields
        return;
      } else {
        // Cache negative result - no more table checks this block
        doubtAvoidanceFlags |= DoubtAvoidanceFlags.NoTableThisBlock;
      }
    }
    // Skip table speculation if NoTableThisBlock flag is set
  }
  
  // Similar pattern for other speculations...
  // Always update scanner fields before returning
  updateScannerFields();
}
}

// Performance example: Long line without setext
function processLongLine(): void {
  setText("This is a very long line with many tokens but no setext underline below\nJust regular content");
  
  // First token "This" - attempts setext speculation, fails, sets NoSetextThisLine
  scanner.scan(); // Updates scanner.token, scanner.tokenText, etc.
  
  // Subsequent tokens skip setext speculation entirely
  scanner.scan(); // "is" - no setext check (cached avoidance)
  scanner.scan(); // "a" - no setext check (cached avoidance)  
  scanner.scan(); // "very" - no setext check (cached avoidance)
  // ... much faster processing for rest of line
  
  scanner.scan(); // NewLine - naturally resets NoSetextThisLine for next line
  scanner.scan(); // "Just" - setext speculation re-enabled for new line
}
```

**Natural Reset Rules**:
```typescript
// Natural doubt flag resets at appropriate boundaries
function scan(): void {          // Returns nothing - updates scanner fields
  if (atLineStart) {
    // Line-scoped flags reset automatically each line
    doubtAvoidanceFlags &= ~(DoubtAvoidanceFlags.NoSetextThisLine | DoubtAvoidanceFlags.NoCodeFenceThisLine);
    
    // Update cross-line state continuity
    currentIndentLevel = getCurrentIndentLevel();
    
    // Block-scoped flags reset only after blank lines (not every line!)
    if (isBlankLine()) {
      doubtAvoidanceFlags &= ~DoubtAvoidanceFlags.NoTableThisBlock;
      lastBlankLinePos = pos;
    }
  }
  
  // Update scanner fields including rollback safety
  updateScannerFields();         // Sets token, tokenText, tokenLength, tokenStart, offsetNext, rollbackSafe
}
```

**Performance Benefits**:
- **Long lines**: Setext speculation only attempted once per line (natural reset)
- **Large blocks**: Table speculation only attempted once per block (persists across lines)
- **List context**: Indent level tracked across lines for proper list nesting
- **Minimal overhead**: Just boolean flag checks vs expensive lookahead
```

### Scan Mode Behaviors: State Continuity Only

**Key Principle**: Modes determine **how content is processed during scanning**, not parsing strategies or speculation.

#### **Content Processing Modes**

**Normal Mode** (`ScanMode.Normal`):
```typescript
// Standard Markdown content scanning
// - All punctuation is significant for inline markup  
// - Block constructs detected at line start
// - Regular token emission with full Markdown processing
// Next scan(): Process characters as Markdown syntax
```

**RawText Mode** (`ScanMode.RawText`):
```typescript
// Inside <script>, <style>, etc.
// - NO Markdown processing whatsoever  
// - Only scan for specific end tag pattern
// - Emit raw text tokens until end pattern found
// Next scan(): Look for endPattern, treat everything else as literal text

// Example:
<script>
const text = "# Not a heading, *not emphasis*";
</script>  // ← Only this ends RawText mode
```

**RCData Mode** (`ScanMode.RCData`):
```typescript
// Inside <textarea>, <title>, etc.
// - Entities are active (&amp; → &) but NO Markdown
// - Scan for specific end tag pattern
// Next scan(): Process entities but no other Markdown syntax

// Example:
<textarea>
&amp; is decoded to &
But *this* is not emphasis
</textarea>  // ← Only this ends RCData mode
```

**CodeBlock Mode** (`ScanMode.CodeBlock`):
```typescript
// Inside fenced code blocks
// - NO Markdown processing within content
// - Scan for matching closing fence
// Next scan(): Look for fence pattern, treat content as literal

// Example:
```javascript
function test() {
  return "just code"; // # Not a heading
}
```  // ← Must match opening fence to close
```

**MathInline Mode** (`ScanMode.MathInline`):
```typescript
// Inside $math$ expressions  
// - NO Markdown processing
// - Scan for closing $ delimiter
// Next scan(): Look for closing $, handle escaped \$

// Example: $E = mc^2$ where *nothing* is Markdown
```

**MathBlock Mode** (`ScanMode.MathBlock`):
```typescript
// Inside $$math$$ blocks
// - NO Markdown processing  
// - Scan for closing $$ delimiter
// Next scan(): Look for closing $$, emit math content

// Example:
$$
E = mc^2  // # Not a heading
$$
```

**HtmlComment Mode** (`ScanMode.HtmlComment`):
```typescript
// Inside <!-- --> comments
// - NO Markdown processing
// - Scan for --> closing sequence
// Next scan(): Look for -->, treat content as literal
```

#### **Context Modes**

**FrontmatterYaml Mode** (`ScanMode.FrontmatterYaml`):
```typescript
// Inside --- YAML frontmatter
// - NO Markdown processing
// - Scan for closing --- sequence at line start
// Next scan(): Look for closing fence, emit YAML content
```

**FrontmatterToml Mode** (`ScanMode.FrontmatterToml`):
```typescript
// Inside +++ TOML frontmatter  
// - NO Markdown processing
// - Scan for closing +++ sequence at line start
// Next scan(): Look for closing fence, emit TOML content
```

**HtmlBlockActive Mode** (`ScanMode.HtmlBlockActive`):
```typescript
// HTML block hint is active
// - Regular Markdown processing  
// - All tokens get ContainsHtmlBlock flag
// Next scan(): Apply HTML block flags to emitted tokens
```

### Mode Transition Rules: Simple State Changes

```typescript
// Mode transitions - no speculation, just content processing state
const TRANSITIONS: Record<ScanMode, ScanMode[]> = {
  [ScanMode.Normal]: [
    ScanMode.RawText,           // <script>, <style> tags
    ScanMode.RCData,            // <textarea>, <title> tags  
    ScanMode.CodeBlock,         // ``` or ~~~ fences
    ScanMode.MathInline,        // $ character
    ScanMode.MathBlock,         // $$ sequence
    ScanMode.HtmlComment,       // <!-- sequence
    ScanMode.FrontmatterYaml,   // --- at document start
    ScanMode.FrontmatterToml,   // +++ at document start
    ScanMode.HtmlBlockActive,   // HTML block elements
  ],
  
  [ScanMode.RawText]: [
    ScanMode.Normal,            // Closing tag found
  ],
  
  [ScanMode.RCData]: [
    ScanMode.Normal,            // Closing tag found
  ],
  
  [ScanMode.CodeBlock]: [
    ScanMode.Normal,            // Matching closing fence
  ],
  
  [ScanMode.MathInline]: [
    ScanMode.Normal,            // Closing $ found
  ],
  
  [ScanMode.MathBlock]: [
    ScanMode.Normal,            // Closing $$ found  
  ],
  
  [ScanMode.HtmlComment]: [
    ScanMode.Normal,            // --> found
  ],
  
  [ScanMode.FrontmatterYaml]: [
    ScanMode.Normal,            // Closing --- found
  ],
  
  [ScanMode.FrontmatterToml]: [
    ScanMode.Normal,            // Closing +++ found
  ],
  
  [ScanMode.HtmlBlockActive]: [
    ScanMode.Normal,            // Blank line or end condition
  ],
};

// Mode characteristics - what each mode means for scanning
interface ModeCharacteristics {
  processesMarkdown: boolean;         // Should Markdown syntax be processed?
  hasEndPattern: boolean;             // Does mode have specific end condition?
  allowsLineBreaks: boolean;          // Are line breaks significant?
  applySpecialFlags: boolean;         // Should special token flags be applied?
}

const MODE_CHARACTERISTICS: Record<ScanMode, ModeCharacteristics> = {
  [ScanMode.Normal]: { 
    processesMarkdown: true, 
    hasEndPattern: false, 
    allowsLineBreaks: true, 
    applySpecialFlags: false 
  },
  [ScanMode.RawText]: { 
    processesMarkdown: false, 
    hasEndPattern: true, 
    allowsLineBreaks: false, 
    applySpecialFlags: false 
  },
  [ScanMode.RCData]: { 
    processesMarkdown: false, 
    hasEndPattern: true, 
    allowsLineBreaks: false, 
    applySpecialFlags: false 
  },
  [ScanMode.CodeBlock]: { 
    processesMarkdown: false, 
    hasEndPattern: true, 
    allowsLineBreaks: false, 
    applySpecialFlags: false 
  },
  [ScanMode.MathInline]: { 
    processesMarkdown: false, 
    hasEndPattern: true, 
    allowsLineBreaks: false, 
    applySpecialFlags: true // Math flags
  },
  [ScanMode.MathBlock]: { 
    processesMarkdown: false, 
    hasEndPattern: true, 
    allowsLineBreaks: false, 
    applySpecialFlags: true // Math flags
  },
  [ScanMode.HtmlComment]: { 
    processesMarkdown: false, 
    hasEndPattern: true, 
    allowsLineBreaks: false, 
    applySpecialFlags: false 
  },
  [ScanMode.FrontmatterYaml]: { 
    processesMarkdown: false, 
    hasEndPattern: true, 
    allowsLineBreaks: false, 
    applySpecialFlags: false 
  },
  [ScanMode.FrontmatterToml]: { 
    processesMarkdown: false, 
    hasEndPattern: true, 
    allowsLineBreaks: false, 
    applySpecialFlags: false 
  },
  [ScanMode.HtmlBlockActive]: { 
    processesMarkdown: true, 
    hasEndPattern: true, 
    allowsLineBreaks: true, 
    applySpecialFlags: true // HTML block flags
  },
};
```

### Scanner Speculation Strategy: Smart Scanner Resolves Ambiguity

**Key Insight**: If the scanner emits definitive tokens (no ambiguity), then the scanner MUST handle speculation internally. The scan modes carry the speculation state between scan() calls.

**Scanner Ambiguity Resolution Process**:
```typescript
// Scanner maintains speculation state across scan() calls
scan(): SyntaxKind {
  const ch = source.charCodeAt(pos);
  
  switch (mode) {
    case ScanMode.Normal:
      if (ch === CharacterCodes.bar && atLineStart) {
        // Start table speculation
        mode = ScanMode.TableSpeculating;
        speculationStartPos = pos;
        return SyntaxKind.PipeToken; // Emit provisional token
      }
      break;
      
    case ScanMode.TableSpeculating:
      // Continue collecting table evidence
      if (isNewLine(ch)) {
        // Check if next line has alignment pattern
        if (hasTableAlignmentPattern()) {
          mode = ScanMode.TableConfirmed;
          // Rewind and emit definitive table tokens
          return rewindAndEmitTableStart();
        } else {
          mode = ScanMode.Normal;
          // Not a table - emit as paragraph content
          return SyntaxKind.TextContent;
        }
      }
      break;
      
    case ScanMode.TableConfirmed:
      // Emit definitive table structure tokens
      return emitTableTokens();
  }
}
```

**State Continuity Between scan() Calls**:
The scanner needs to remember:
- Where speculation started (for potential rewind)
- What evidence has been collected so far
- Which speculation mode is active
- Any mode-specific data (column count, fence length, etc.)

### Typed Rollback System

Instead of arbitrary position rollback, use typed rollback states:

```typescript
const enum RollbackType {
  DocumentStart = 0,    // Clean slate, no state
  BlockStart = 1,       // Start of block construct
  LineStart = 2,        // Beginning of line
  HtmlElementStart = 3, // Inside HTML element
  ListItemStart = 4,    // Inside list item
  CodeBlockStart = 5,   // Inside code block
}

// Scanner API - simplified to just 3 methods
interface Scanner {
  // Core methods
  scan(): void;                                    // Updates all scanner fields
  rollback(position: number, type: RollbackType): void;
  fillDebugState(state: ScannerDebugState): void;
  
  // Token fields - updated by scan() and rollback()
  token: SyntaxKind;           // Current token type
  tokenText: string;           // Current token text (always materialized)
  tokenLength: number;         // Length of current token
  tokenFlags: TokenFlags;      // Token flags including rollback safety
  tokenStart: number;          // Start position of current token
  offsetNext: number;          // Where the next token will start
  rollbackSafe: boolean;       // Whether rollback is safe at current position
}

// Example usage
scanner.rollback(nodePosition, RollbackType.BlockStart);
```

### Rollback Flags in Tokens

Scanner emits rollback capability as token flags:

```typescript
const enum TokenFlags {
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

// Extract rollback type from token flags
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
    
    scanner.scan();                      // Updates all scanner fields
    scanner.fillDebugState(debugState);  // No allocation!
    
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
const enum RollbackType {
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
const enum TokenFlags {
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

// Extract rollback info from scanner fields
function canRollbackBefore(): boolean {
  return !!(scanner.tokenFlags & TokenFlags.CanRollbackHere);
}

function getRollbackType(): RollbackType {
  return (scanner.tokenFlags & TokenFlags.RollbackTypeMask) >> 25;
}
```

### Scanner Token Interface

```typescript
// Simplified scanner interface - only fields, no getter methods
interface Scanner {
  // Core methods
  scan(): void;                        // Updates all scanner fields
  rollback(pos: number, type: RollbackType): void;
  fillDebugState(state: ScannerDebugState): void;
  
  // Token fields - direct access, updated by scan()
  token: SyntaxKind;           // Current token type
  tokenText: string;           // Always materialized text
  tokenFlags: TokenFlags;      // Includes rollback flags
  offsetNext: number;          // Where the next token will start
}

// Example token field updates during scan()
function updateScannerFields(kind: SyntaxKind, start: number, end: number): void {
  scanner.token = kind;
  scanner.offsetNext = end;
  scanner.tokenText = extractTokenText(kind, start, end);
  scanner.tokenFlags = computeTokenFlags(kind, start);
}
```

### Line-Based Text Tokenization for Editor Integration

**Strategy**: Break text into line-based tokens rather than paragraph-wide tokens to support fine-grained editor operations:

```typescript
// Editor-friendly approach: Line-based text tokens
function scanTextContent(): void {       // Returns nothing - updates scanner fields
  const lineStart = pos;
  
  // Scan to end of line or significant punctuation
  while (pos < end && !isLineBreak(source.charCodeAt(pos)) && 
         !isSignificantPunctuation(source.charCodeAt(pos))) {
    pos++;
  }
  
  // Update scanner fields
  scanner.token = SyntaxKind.TextContent;
  scanner.offsetNext = pos;
  scanner.tokenText = normalizeLineWhitespace(source.substring(lineStart, pos));
}

// Example tokenization of multi-line paragraph:
const input = `This is a long paragraph
that spans multiple lines  
and should be editable
line by line in editors.`;

// Produces token stream:
[
  { kind: SyntaxKind.TextContent, text: "This is a long paragraph", offsetNext: 25 },
  { kind: SyntaxKind.NewLineTrivia, text: "\n", offsetNext: 26 },
  { kind: SyntaxKind.TextContent, text: "that spans multiple lines", offsetNext: 51 },
  { kind: SyntaxKind.WhitespaceTrivia, text: "  ", offsetNext: 53 }, // Trailing spaces
  { kind: SyntaxKind.NewLineTrivia, text: "\n", offsetNext: 54 },
  { kind: SyntaxKind.TextContent, text: "and should be editable", offsetNext: 76 },
  { kind: SyntaxKind.NewLineTrivia, text: "\n", offsetNext: 77 },
  { kind: SyntaxKind.TextContent, text: "line by line in editors.", offsetNext: 101 }
]
```

### Parser Text Reconstruction

Parser combines line-based text tokens into paragraph content:

```typescript
function parseParagraphContent(): TextNode[] {
  const textRuns: TextNode[] = [];
  
  while (scanner.token === SyntaxKind.TextContent || 
         scanner.token === SyntaxKind.NewLineTrivia) {
    
    if (scanner.token === SyntaxKind.TextContent) {
      const tokenStart = pos;  // Parser tracks current position
      scanner.scan();
      const tokenEnd = scanner.offsetNext;
      
      textRuns.push(createTextNode(tokenStart, tokenEnd, scanner.tokenText));
      
      // Insert soft break for line boundaries
      if (scanner.token === SyntaxKind.NewLineTrivia) {
        textRuns.push(createSoftBreakNode());
        const lineBreakStart = pos;
        scanner.scan();
      }
    }
  }
  
  return textRuns;
}

// Alternative: Concatenate with spaces for simple text content
function getParagraphText(): string {
  const parts: string[] = [];
  
  while (scanner.token === SyntaxKind.TextContent || 
         scanner.token === SyntaxKind.NewLineTrivia) {
    
    if (scanner.token === SyntaxKind.TextContent) {
      parts.push(scanner.tokenText);
    } else if (scanner.token === SyntaxKind.NewLineTrivia) {
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
// Parser can derive token boundaries from position tracking
function parseToken(): void {
  const tokenStart = pos;              // Parser tracks current position
  scanner.scan();                      // Updates scanner fields
  const tokenLength = scanner.offsetNext - tokenStart; // Derived length
  
  // Create token with derived boundaries
  const token = {
    kind: scanner.token,
    text: scanner.tokenText,
    start: tokenStart,
    length: tokenLength
  };
}

// Editor can apply changes back to original document using offsets
function applyEdit(edit: TextEdit, tokenStartPos: number, token: Scanner): void {
  const tokenLength = token.offsetNext - tokenStartPos;
  const originalRange = { 
    start: tokenStartPos, 
    end: tokenStartPos + tokenLength 
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
function scan(): void {                  // Returns nothing - updates scanner fields
  const startPos = pos;
  scanTokenInternally();                 // Internal token scanning logic
  
  // Update scanner fields including rollback safety via token flags
  if (startPos === 0) {
    // Document start - always safe
    scanner.tokenFlags |= TokenFlags.CanRollbackHere | TokenFlags.RollbackDocumentStart;
  } else if (precedingBlankLine) {
    // After blank line - block context reset
    scanner.tokenFlags |= TokenFlags.CanRollbackHere | TokenFlags.RollbackBlankLine;
  } else if (mode === ScanMode.RawText) {
    // Within <script>/<style> - any position safe
    scanner.tokenFlags |= TokenFlags.CanRollbackHere | TokenFlags.RollbackRawText;
  } else if (mode === ScanMode.CodeBlockContent && atLineStart) {
    // Within fenced code at line start - safe
    scanner.tokenFlags |= TokenFlags.CanRollbackHere | TokenFlags.RollbackCodeBlock;
  } else if (mode === ScanMode.Normal && withinHtmlElement && !withinRawText) {
    // Within HTML element content (non-raw) - potentially safe
    scanner.tokenFlags |= TokenFlags.CanRollbackHere | TokenFlags.RollbackHtmlInner;
  }
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