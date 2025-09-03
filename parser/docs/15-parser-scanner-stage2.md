# Scanner2 Testing Infrastructure Demo

This demonstrates the key testing infrastructure for Scanner2 as specified in Stage 2 of the parser-scanner shift plan.

The main driver is verifyTokens function that accepts annotated Markdown.

Annotated here means that lines can be annotated with special marks, in which case those marks will be verified against scanner output.

When annotations match the token stream coming off the scanner, the output string is preserved as is with all the same markers, and thus tests pass.

For annotations that fail to match, the testing framework replaces the mismatched values with actual values in exact same positions.

## Core Usage

Always use the same variable to pass to expect and toBe. Do not pass two string literals separately.

```javascript
import { verifyTokens } from './scanner2-testing-infrastructure';

const tokenTest = `
Hello * World
1     2
@1 StringLiteral text: "Hello "
@2 Asterisk
`;

expect(verifyTokens(tokenTest)).toBe(tokenTest);
```

Note the 1 and 2 are positioned exactly below the corresponding token starts.

The descriptions/expectations for each marker are expected on the follow-up lines.

## Features

### Lead/Trail Newline

Because annotations are optional, the format is naturally permissive to the leading or trailing newlines.

It helps putting annotating markers alongside the Markdown and see the positions visually.

### Position Markers

- Incremental digits 1-9 and letters A-Z are required to mark positions in text
- Position markers refer to the last markdown line before them
- Markers must point to a start of a token

### Token Expectations 
- `@1 TokenKind` - Assert token kind at position 1
- `@1 TokenKind text: "expected text"` - Assert token text
- `@1 TokenKind flags: 2` - Assert token flags; flags can be either numerical, or a pipe-separated list of flag enum string literals (unquoted)

### Error Injection
If expectations don't match, those that are mismatched are injected instead.

If no token starts at a given marker position, one of two outcomes arise, depending on the markers existing for the beginning of the token the marker falls within.

Every position inside a line falls within exactly one token. That means if a marker is not at the start of a token, it is within a token that starts earlier.

Now if there is no annotation marker for the position where that token starts, the marker in the verifyTokens output moves to the start of the token. All the annotations on the corresponding @-line match as usual.

If there already is a marker for the position where the incorrectly positioned marker's token starts, the erroneous marker is removed from the output, and its corresponding @-line match is removed too. The following markers are not re-numbered though.

## Example Tests

See `parser/tests/scanner2-examples.test.ts` for comprehensive examples.

## Supported Token Types (Stage 1)

- `StringLiteral` - Text content (normalized, one per line)
- `WhitespaceTrivia` - Leading whitespace at line start  
- `NewLineTrivia` - Line breaks (LF, CRLF, CR)

More token types will be added in future stages.