# Scanner2 Testing Infrastructure Demo

This demonstrates the new testing infrastructure for Scanner2 as specified in Stage 2 of the parser-scanner shift plan.

## Basic Usage

```javascript
import { verifyTokens } from './scanner2.js';

const tokenTest = `Hello World
1     2
@1 StringLiteral text: "Hello World"
@2 StringLiteral text: "Hello World"`;

expect(verifyTokens(tokenTest)).toBe(tokenTest);
```

## Features

### Position Markers
- Use digits 1-9 and letters A-Z to mark positions in text
- Position markers refer to the last markdown line before them
- Markers can point to any character position in the line

### Token Expectations  
- `@1 TokenKind` - Assert token kind at position 1
- `@1 TokenKind text: "expected text"` - Assert token text
- `@1 TokenKind flags: 2` - Assert token flags

### Error Injection
If expectations don't match, error messages are injected:
```
Hello World
1
@1 WhitespaceTrivia
ERROR: Expected 'WhitespaceTrivia' but got 'StringLiteral'
```

## Example Tests

See `parser/tests/scanner2-examples.test.ts` for comprehensive examples.

## Supported Token Types (Stage 1)

- `StringLiteral` - Text content (normalized, one per line)
- `WhitespaceTrivia` - Leading whitespace at line start  
- `NewLineTrivia` - Line breaks (LF, CRLF, CR)

More token types will be added in future stages.