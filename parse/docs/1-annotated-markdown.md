# Annotated Markdown

The syntax of annotated Markdown is a core building block of the parser. It is used purely in tests, but the way it's defined serves both as documentation and verification.

The descriptivess and specificity of the format is also crucial to debugging, because it pinpoints specific use cases and helps diagnosing them precisely.

## The syntax

The annotations are embedded in the body of Markdown text, and appear as a single line for positional markers (single-digits, letters) followed by a set of assertion lines one per positional marker, prefixed with `@`.

```markdown

Some text &amp;
1         2
@1 "Some text"
@2 "&"

```

The assertions will differ depends on the functional block being tested.

For `scan0` the output is purely positional + flags so the only expected assertions are flags (position is already accounted for).

For semantic scanner the output can include text, so that is captured as JSON-stringified text (in quotes, with escapes as needed).

For AST parser the output is even more complex, so many more aspects can be captured in assertions. We will clarify that when we start working on it.


## The implementation and success/failure

### Annotated Markdown files

Unlike the earlier work in MixPad, the annotated Markdown is now saved in `.md` files, and special test runner is used to parse and run them as part of test runs.

The test runner is relying on built-in Node.js test runner, no external frameworks.

## Success/failure modes

The test infrastructure will generate 1 or more tests per annotated Markdown file, one test per annotated block.

The test will take its name from the corresponding line the positional markers appear on, plus the marker line itself.

If the test uses weird syntax for the assertions that is unparseable, that will produce a failure. If the test uses valid syntax but the actual output does not match the assertions, that will also produce a failure.

A failure will include exact position in the annotated Markdown file with file path.

A failure will also use text assertion similarly to how verifyTokens works. It will generate an assertion block that is specifying a correct state for the aspects being asserted, and assert it as equal to the assertion inside the annotated Markdown file. That way the assertion will fail, and the test runner will do the highlighting of the different parts of the assertions.

All assertions per test will be asserted as one complete string with Markdown line above, the positional markers, then the @-assertions. So if multiple assertions fail, we see all of them in one go.