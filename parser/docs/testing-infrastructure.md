# Stage 2: Testing Infrastructure Documentation

This document describes the comprehensive testing infrastructure implemented for Scanner2 and future parser stages. The testing harness provides annotated test formats, rich debugging capabilities, and performance measurement tools.

## Overview

The Stage 2 testing infrastructure introduces a declarative approach to testing markdown parsing, replacing verbose imperative test code with annotated markdown text that embeds expectations directly in the test content.

### Key Features

- **Annotated Test Format**: Embed test expectations directly in markdown using HTML comments
- **Declarative Testing**: Reduce boilerplate compared to imperative test style
- **Scanner2 Integration**: Full support for new token types and rollback features
- **Visual Output**: Clear formatting to see tokenization results
- **Performance Testing**: Built-in performance measurement and comparison tools
- **Debug State Capture**: Detailed scanner state tracking for debugging
- **Extensible**: Foundation for stages 3-12 testing needs

## Annotated Test Format

### Basic Syntax

```markdown
<!-- TEST: Test case name -->
Your markdown content here
<!-- EXPECT: TokenKind "token text" flags=Flag1|Flag2 pos=123 length=456 -->
<!-- EXPECT: EndOfFileToken "" -->
<!-- /TEST -->
```

### Token Kinds

Available token kinds for Scanner2:
- `StringLiteral` or `String` or `Text`: Text content tokens
- `WhitespaceTrivia` or `Whitespace`: Whitespace at line start
- `NewLineTrivia` or `NewLine`: Line break tokens
- `EndOfFileToken` or `EOF`: End of file marker
- `Unknown`: Unknown/error tokens

### Token Flags

Available flags for Scanner2:
- `PrecedingLineBreak`: Token follows a line break
- `IsAtLineStart`: Token appears at start of line
- `IsBlankLine`: Newline token ends a whitespace-only line
- `CanRollbackHere`: Scanning can safely restart at this position
- `None`: No flags

Combine multiple flags with `|`: `flags=IsAtLineStart|PrecedingLineBreak`

### Configuration Options

```markdown
<!-- CONFIG: rollback=true debug=true performance=true -->
```

- `rollback=true`: Test rollback functionality
- `debug=true`: Capture debug state snapshots
- `performance=true`: Measure scanning performance

## Examples

### Simple Text Line

```markdown
<!-- TEST: Basic text tokenization -->
Hello world
<!-- EXPECT: StringLiteral "Hello world" flags=IsAtLineStart -->
<!-- EXPECT: EndOfFileToken "" -->
<!-- /TEST -->
```

### Multi-line with Whitespace

```markdown
<!-- TEST: Multi-line with whitespace -->
  First line
    Second line
<!-- EXPECT: WhitespaceTrivia "  " flags=IsAtLineStart -->
<!-- EXPECT: StringLiteral "First line" -->
<!-- EXPECT: NewLineTrivia "\n" -->
<!-- EXPECT: WhitespaceTrivia "    " flags=IsAtLineStart|PrecedingLineBreak -->
<!-- EXPECT: StringLiteral "Second line" -->
<!-- EXPECT: EndOfFileToken "" -->
<!-- /TEST -->
```

### Blank Line Detection

```markdown
<!-- TEST: Blank line detection -->
Text

More text
<!-- EXPECT: StringLiteral "Text" flags=IsAtLineStart -->
<!-- EXPECT: NewLineTrivia "\n" -->
<!-- EXPECT: NewLineTrivia "\n" flags=IsBlankLine|PrecedingLineBreak -->
<!-- EXPECT: StringLiteral "More text" flags=IsAtLineStart|PrecedingLineBreak -->
<!-- EXPECT: EndOfFileToken "" -->
<!-- /TEST -->
```

## API Reference

### Main Testing Functions

```typescript
import { testAnnotated, createTestScanner, token } from './testing-harness';

// Run annotated tests
testAnnotated(annotatedMarkdown: string, options?: { verbose?: boolean }): void

// Create enhanced scanner for imperative testing
createTestScanner(): TestScannerHelper

// Quick token factories
token.string(text: string, flags?: TokenFlags2): TokenExpectation
token.whitespace(text: string, flags?: TokenFlags2): TokenExpectation
token.newline(text?: string, flags?: TokenFlags2): TokenExpectation
token.eof(): TokenExpectation
```

### TestScannerHelper Methods

```typescript
const scanner = createTestScanner();

// Basic scanning
scanner.setText(text: string): void
scanner.scan(): void
scanner.scanAll(): ActualToken[]

// Properties
scanner.token: SyntaxKind2
scanner.tokenText: string
scanner.tokenFlags: TokenFlags2
scanner.offsetNext: number

// Testing utilities
scanner.expectTokens(...expectations: TokenExpectation[]): void
scanner.expectCurrentToken(expectation: TokenExpectation): void
scanner.getTokenHistory(): ActualToken[]
scanner.getDebugHistory(): ScannerDebugState[]

// Debugging
scanner.debugPrint(): void
scanner.debugPrintHistory(): void
```

### Performance Testing

```typescript
import { PerformanceTester } from './testing-harness';

const tester = new PerformanceTester();

// Measure single input
const result = tester.measureScanTime(input: string, iterations?: number): PerformanceResult

// Compare multiple inputs
const comparison = tester.compare(inputs: string[], iterations?: number): PerformanceComparison
```

### Utility Functions

```typescript
import { testUtils } from './testing-harness';

// Test deterministic behavior
testUtils.testDeterministic(input: string, runs?: number): void

// Test line ending consistency
testUtils.testLineEndingConsistency(input: string): void
```

## Integration with Vitest

The testing infrastructure integrates seamlessly with the existing Vitest setup:

```typescript
import { describe, test } from 'vitest';
import { testAnnotated } from './testing-harness';

describe('My tests', () => {
  test('should handle basic text', () => {
    testAnnotated(`
      <!-- TEST: Basic text -->
      Hello world
      <!-- EXPECT: StringLiteral "Hello world" flags=IsAtLineStart -->
      <!-- EXPECT: EndOfFileToken "" -->
      <!-- /TEST -->
    `);
  });
});
```

## Best Practices

### Writing Effective Annotated Tests

1. **Use descriptive test names**: `<!-- TEST: Complex whitespace with tabs -->`
2. **Test one concept per test case**: Keep tests focused and specific
3. **Include edge cases**: Empty strings, only whitespace, mixed line endings
4. **Use meaningful flag assertions**: Test flags that are relevant to the scenario
5. **Group related tests**: Use describe blocks to organize similar test cases

### Performance Testing Guidelines

1. **Measure realistic inputs**: Use representative markdown content
2. **Run sufficient iterations**: Use at least 100 iterations for stable results
3. **Compare similar complexities**: Don't compare trivial vs complex inputs
4. **Document performance requirements**: Set baseline expectations

### Debugging Tests

1. **Use verbose output**: `testAnnotated(text, { verbose: true })`
2. **Check token history**: `scanner.debugPrintHistory()`
3. **Inspect debug states**: `scanner.getDebugHistory()`
4. **Test incrementally**: Add expectations one by one

## Future Extensions

The testing infrastructure is designed to support future parser stages:

### Stage 3: Inline Formatting
```markdown
<!-- TEST: Bold text (future) -->
**bold text**
<!-- EXPECT: BoldStart "**" -->
<!-- EXPECT: StringLiteral "bold text" -->
<!-- EXPECT: BoldEnd "**" -->
<!-- EXPECT: EndOfFileToken "" -->
<!-- /TEST -->
```

### Stage 4: HTML/Entities
```markdown
<!-- TEST: HTML entities (future) -->
&lt;tag&gt;
<!-- EXPECT: EntityRef "&lt;" -->
<!-- EXPECT: StringLiteral "tag" -->
<!-- EXPECT: EntityRef "&gt;" -->
<!-- EXPECT: EndOfFileToken "" -->
<!-- /TEST -->
```

### Rollback Testing
```markdown
<!-- TEST: Rollback capability (future) -->
<!-- CONFIG: rollback=true -->
Text content
<!-- EXPECT: StringLiteral "Text content" flags=CanRollbackHere -->
<!-- EXPECT: EndOfFileToken "" -->
<!-- /TEST -->
```

## Error Handling

The testing infrastructure provides clear error messages:

- **Parsing errors**: Invalid annotated test syntax
- **Token mismatches**: Expected vs actual token differences
- **Flag mismatches**: Missing or incorrect token flags
- **Position errors**: Incorrect token positions or lengths

Example error output:
```
Token 1: Kind mismatch
Expected: StringLiteral
Actual: WhitespaceTrivia

Token 2: Text mismatch
Expected: "Hello world"
Actual: "Hello"
```

## Performance Characteristics

The testing infrastructure itself is designed for efficiency:

- **Zero allocation**: Test execution doesn't allocate objects unnecessarily
- **Fast parsing**: Annotated test parsing is optimized for speed
- **Minimal overhead**: Testing utilities add minimal performance impact
- **Scalable**: Can handle thousands of test cases efficiently

## Migration from Imperative Tests

Existing imperative tests can be gradually migrated to annotated format:

### Before (Imperative)
```typescript
test('should tokenize text', () => {
  const scanner = createScanner2();
  scanner.setText('Hello world');
  scanner.scan();
  expect(scanner.token).toBe(SyntaxKind2.StringLiteral);
  expect(scanner.tokenText).toBe('Hello world');
  expect(scanner.tokenFlags & TokenFlags2.IsAtLineStart).toBeTruthy();
});
```

### After (Annotated)
```typescript
test('should tokenize text', () => {
  testAnnotated(`
    <!-- TEST: Basic text tokenization -->
    Hello world
    <!-- EXPECT: StringLiteral "Hello world" flags=IsAtLineStart -->
    <!-- EXPECT: EndOfFileToken "" -->
    <!-- /TEST -->
  `);
});
```

The annotated version is more readable, less error-prone, and easier to maintain.