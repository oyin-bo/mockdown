# Scanner Infinite Loop Protection

## Overview

This document describes the infinite loop protection mechanism implemented in the Scanner2 to prevent infinite loops while maintaining performance and proper error handling.

## Problem Statement

Scanner implementations can potentially enter infinite loops in several scenarios:
1. **Position stall**: When the scanner fails to advance the position (`pos`) during a scan operation
2. **Malformed input**: When encountering unexpected characters or edge cases
3. **Logic bugs**: When scanner logic fails to handle certain character sequences properly

## Solution Design

### Key Constraints Met

1. **No silent bailout**: The scanner never silently stops on hints like excessive time or iterations
2. **No crashes**: The scanner gracefully handles infinite loop conditions
3. **Error token emission**: When an infinite loop is detected, an error token is emitted at the problematic character
4. **Content preservation**: Earlier valid content is captured in proper tokens (e.g., StringLiteral)
5. **Generalized approach**: The solution provides reusable utilities for future scanner work
6. **Zero performance degradation**: No dynamic memory allocations or expensive tracking for normal operation

### Implementation Details

#### Core Protection Mechanism

The main protection is implemented in `scanImpl()`:

```typescript
function scanImpl(): void {
  // ... existing scanning logic ...
  
  // Infinite loop protection: ensure position always advances
  if (pos <= start) {
    handleInfiniteLoopDetection(start);
  }
}
```

This check ensures that every call to `scanImpl()` advances the scanner position. If position doesn't advance, the infinite loop handler is triggered.

#### Error Recovery Function

```typescript
function handleInfiniteLoopDetection(stuckPosition: number): void {
  // 1. Emit error token at problematic character
  token = SyntaxKind.Unknown;
  tokenText = stuckPosition < end ? String.fromCharCode(source.charCodeAt(stuckPosition)) : '';
  tokenFlags = TokenFlags.HasScanError;
  
  // 2. Force position advancement to break the loop
  pos = Math.min(stuckPosition + 1, end);
  offsetNext = pos;
  
  // 3. Update position tracking (line/column)
  // ... proper line/column tracking for the skipped character ...
}
```

This function:
- Creates an error token containing the problematic character
- Forces the scanner to advance by exactly one character
- Maintains proper line/column tracking
- Allows scanning to continue from the next character

#### Generalized Utility

An additional utility function is provided for future use:

```typescript
function ensureProgress(scanFunction: () => void, expectedMinAdvance: number = 1): void {
  const startPos = pos;
  scanFunction();
  
  if (pos < startPos + expectedMinAdvance) {
    handleInfiniteLoopDetection(startPos);
  }
}
```

This utility can wrap any scanning operation to ensure it makes progress.

#### Additional Safety Measures

The `emitTextRun()` function includes additional safety:

```typescript
// Safety check: ensure we make at least some progress
if (textEnd <= start && start < end) {
  // Force advance by one character to prevent infinite loop
  textEnd = start + 1;
}
```

This prevents the text scanning loop from stalling.

### Token Flag Addition

A new token flag was added to mark error tokens:

```typescript
export const enum TokenFlags {
  // ... existing flags ...
  
  // Error handling flags
  HasScanError = 1 << 11,        // Token represents a scanning error
}
```

## Testing

Comprehensive tests were added in `4-infinite-loop-protection.test.ts`:

1. **Progress verification**: Ensures position always advances
2. **Malformed input handling**: Tests with control characters, null bytes, etc.
3. **Error token emission**: Verifies problematic characters are captured
4. **Position consistency**: Ensures position tracking remains accurate
5. **Edge case handling**: Tests empty input, whitespace-only input, etc.

## Performance Impact

- **Zero allocation**: No dynamic memory allocation during normal operation
- **Single comparison**: Only one integer comparison per scan operation
- **No timing tracking**: No expensive time-based measurements
- **Minimal overhead**: Protection only activates on actual infinite loop conditions

## Usage Patterns

### For Normal Scanning
The protection is completely transparent - existing scanner code requires no changes.

### For Future Scanner Development
The `ensureProgress()` utility can be used to protect any new scanning operations:

```typescript
// Wrap potentially problematic scanning operations
ensureProgress(() => {
  scanComplexMarkdownConstruct();
});
```

### For Parser Integration
Error tokens can be detected via the `HasScanError` flag:

```typescript
if (scanner.tokenFlags & TokenFlags.HasScanError) {
  // Handle scanning error appropriately
  reportDiagnostic("Invalid character in input", scanner.offsetNext - 1);
}
```

## Conclusion

This implementation provides robust infinite loop protection that:
- Prevents crashes and infinite loops
- Preserves valid content
- Provides clear error reporting
- Maintains high performance
- Offers reusable utilities for future development

The solution successfully meets all specified constraints while providing a foundation for reliable Markdown scanning.
