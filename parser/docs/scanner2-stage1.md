# Scanner2 Stage 1: Text Lines + Whitespace/Newlines

This document describes the Stage 1 implementation of the new Scanner2 architecture based on the parser-scanner responsibility shift plan.

## Overview

Scanner2 Stage 1 implements the foundational architecture for the new scanner with the following focus:

- **Text tokens**: One per line with normalized text content
- **Whitespace and newline tokens**: Following CommonMark specification
- **4-field interface**: Direct field access for performance
- **Line-by-line tokenization**: Editor-friendly token boundaries

## Architecture

### New Interface Design

```typescript
interface Scanner2 {
  // Core methods - only 3 methods total
  scan(): void;                                    // Advances to next token, updates all fields
  rollback(pos: number, type: RollbackType): void; // Structured rollback
  fillDebugState(state: ScannerDebugState): void;  // Zero-allocation diagnostics
  
  // Token fields - direct access, updated by scan()
  token: SyntaxKind;           // Current token type
  tokenText: string;           // Current token text (always materialized)
  tokenFlags: TokenFlags;      // Token flags including rollback safety
  offsetNext: number;          // Where the next token will start
  
  // Initialization
  setText(text: string, start?: number, length?: number): void;
}
```

### Key Differences from Original Scanner

| Aspect | Original Scanner | Scanner2 Stage 1 |
|--------|------------------|-------------------|
| **Interface** | 20+ methods | 3 methods + 4 fields |
| **Token Access** | `getToken()`, `getTokenText()` | Direct field access |
| **Text Normalization** | Lazy materialization | Always materialized |
| **Rollback** | Complex state restoration | Structured rollback types |
| **Line Handling** | Paragraph-based tokens | Line-based tokens |

## Token Types (Stage 1)

- **StringLiteral**: Text content (normalized, one per line)
- **WhitespaceTrivia**: Leading whitespace at line start
- **NewLineTrivia**: Line breaks (LF, CRLF, CR)
- **EndOfFileToken**: End of input

## Features Implemented

### Line-by-Line Tokenization

```typescript
// Input: "Line 1\nLine 2"
// Tokens:
[
  { kind: SyntaxKind.StringLiteral, text: "Line 1", offsetNext: 6 },
  { kind: SyntaxKind.NewLineTrivia, text: "\n", offsetNext: 7 },
  { kind: SyntaxKind.StringLiteral, text: "Line 2", offsetNext: 13 }
]
```

### Whitespace Normalization

- **Tabs to spaces**: `\t` → `    ` (4 spaces)
- **Multiple spaces**: `   ` → ` ` (collapsed to single)
- **Trim**: Leading and trailing whitespace removed from text tokens
- **Preserve exact**: Whitespace tokens preserve exact content

### Rollback System

```typescript
const enum RollbackType {
  DocumentStart = 0,        // Position 0 - always safe
  BlankLineBoundary = 1,    // After blank line - resets block context
  RawTextContent = 2,       // Within <script>/<style> - any position safe
  CodeBlockContent = 3,     // Within fenced code - line boundaries safe
  HtmlElementInner = 4,     // Within HTML element content (non-raw)
}
```

### Token Flags

New rollback-related flags added:

```typescript
CanRollbackHere = 1 << 24,     // Scanning can safely restart at this position
RollbackTypeMask = 0x7 << 25,  // 3 bits for rollback type
```

## Usage Examples

### Basic Scanning

```typescript
import { createScanner2 } from './scanner2.js';

const scanner = createScanner2();
scanner.setText('Hello world\nSecond line');

while (scanner.token !== SyntaxKind.EndOfFileToken) {
  scanner.scan();
  console.log(`${scanner.token}: "${scanner.tokenText}"`);
}
```

### Rollback Example

```typescript
scanner.setText('Line 1\nLine 2\nLine 3');

scanner.scan(); // Line 1
scanner.scan(); // \n
const checkpoint = scanner.offsetNext;

scanner.scan(); // Line 2
scanner.rollback(checkpoint, RollbackType.BlankLineBoundary);

scanner.scan(); // Line 2 again
```

### Debug State

```typescript
const debugState = {
  pos: 0, line: 0, column: 0, mode: '',
  atLineStart: false, inParagraph: false, precedingLineBreak: false,
  currentToken: SyntaxKind.Unknown, currentTokenText: '',
  currentTokenFlags: TokenFlags.None, nextOffset: 0
};

scanner.fillDebugState(debugState);
console.log(`Position: ${debugState.pos}, Line: ${debugState.line}`);
```

## Testing

The implementation includes comprehensive tests:

- **scanner2-stage1.test.ts**: Core functionality (12 tests)
- **scanner2-stage1-edge-cases.test.ts**: Edge cases and robustness (15 tests)

All 27 tests pass, covering:
- Basic text and whitespace tokenization
- Line break handling (LF, CRLF, CR)
- Whitespace normalization
- Position tracking
- Rollback functionality
- Unicode characters
- Edge cases (empty input, long lines, etc.)

## Performance Characteristics

- **Zero allocations**: All state variables are primitives
- **Linear complexity**: O(1) state updates per character
- **Bounded state**: ~120 bytes maximum scanner state
- **Direct field access**: No method call overhead for token access

## Stage 1 Limitations

This implementation focuses only on the foundational text tokenization:

- **No Markdown syntax**: Bold, italic, links, etc. (coming in later stages)
- **No HTML parsing**: HTML tags treated as text content
- **No block structures**: Headings, lists, tables (coming in later stages)
- **No entities**: Character entities not decoded

## Next Steps

- **Stage 2**: Testing infrastructure with annotated Markdown system
- **Stage 3**: Inline formatting (bold, italic, code spans)
- **Stage 4**: HTML and entity support
- **Later stages**: Progressive addition of Markdown constructs

The Stage 1 implementation provides the foundation for all subsequent stages while maintaining the performance and simplicity goals of the new architecture.