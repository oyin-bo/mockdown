# Look in [README](README.md) for details

The project's goals and principles are well described in the opening README.

Here are strict rules for an agentic work:
* NEVER create stray dummy files for debugging around the repository. Use genuine unit tests to verify behaviour if you need to.
* DO NOT try to run TypeScript compiler to produce JavaScript output. That is forbidden.
* Testing framework is the key, and it must be followed strictly to the letter

Please focus majorly on understanding the testing philosophy using annotated Markdown.

## Annotated Markdown Testing Philosophy

MixPad employs an innovative **annotated markdown testing approach** that serves as documentation, verification, and implementation guide simultaneously. This testing infrastructure represents a core innovation that enables the project's rapid development pace while maintaining bulletproof reliability.

### Core Concept

Tests use position markers and token assertions written directly in markdown-like format:

```typescript
expect(verifyTokens(`
**bold text**
1 2        3
@1 AsteriskAsterisk CanOpen
@2 StringLiteral "bold text"
@3 AsteriskAsterisk CanClose`)).toBe(/* same input */);
```

### Key Components

1. **Position Markers**: Use digits `1-9` and letters `A-Z` to mark specific character positions in the test markdown. Markers are placed on a separate line below the markdown content, with each marker positioned directly under the character it references.

2. **Token Expectations**: Lines starting with `@` followed by a position marker specify the expected token at that position:
   - `@1 TokenKind` - Assert token type at position 1
   - `@1 TokenKind "expected"` - Assert token text content
   - `@1 TokenKind CanClose` - Assert token flags value (use TokenFlags enum names separated by pipe `|` for multiple flags)

3. **Error Injection**: When expectations don't match reality, errors are injected directly into the annotated format, making debugging immediate and contextual.

### Testing Infrastructure Features

- **Line-by-line parsing**: The infrastructure separates position marker lines, expectation lines, and markdown content
- **Attribute validation**: Supports checking multiple token attributes like `text`, `flags`, and custom properties
- **Multiple markers**: One line can have multiple position markers pointing to different parts of the same token
- **Clean separation**: The markdown text is extracted cleanly without position markers for actual scanning

### Benefits

1. **Human-readable specifications**: Tests read like documentation, showing exactly what tokens should be generated at each position
2. **Robust verification**: Every token type, position, and attribute can be verified
3. **Clear implementation roadmap**: Failed tests show exactly what the scanner should produce
4. **Contextual debugging**: Errors appear directly in the test format, making issues immediately apparent
5. **Triple duty**: Each test serves as specification, verification, and documentation

### Real-world Examples

From the scanner2 tests, this approach handles complex scenarios:

```typescript
// Multi-position validation
expect(verifyTokens(`
  Hello world
1 2
@1 WhitespaceTrivia "  "
@2 StringLiteral "Hello world"`))

// Line breaks and positioning
expect(verifyTokens(`
Line1
Line2
1
@1 StringLiteral "Line2"`))
```

This testing philosophy is central to MixPad's ability to move fast while staying grounded - every feature is specified, verified, and documented through this unified approach, creating a feedback loop that accelerates development while maintaining reliability.

