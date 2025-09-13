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

A failure will include exact position in the annotated Markdown file with repository-relative path to the test .md file, and the line number in the markdown, as a third comment parameter to strictEqual.

# Implementation notes

## Test Harness Architecture

The annotated Markdown test harness will be implemented as a Node.js built-in test runner that dynamically registers test callbacks from `.md` files containing annotated markdown blocks. The architecture follows these key principles:

### 1. File Discovery and Processing

**Suggested Target Structure (not prescriptive):**
```
parse/
  annotated-tests/
    scan0/
      basic-tokenization.md
      edge-cases.md
      html-entities.md
    semantic/
      emphasis-pairing.md
      code-blocks.md
      lists-tables.md
    parser/
      ast-generation.md
      cross-references.md
```

**Discovery Process:**
- Recursively scan for `.md` files in the test directory structure
- Each subdirectory represents a test suite category (scan0, semantic, parser)
- File names become part of test suite descriptors
- Each annotated block within a file becomes an individual test callback

### 2. Test Generation Pipeline

**Phase 1: Markdown File Parsing**
- Read each `.md` file and extract annotated blocks using detection rules defined in this document
- Parse position marker lines (must start with `1` possibly with leading space, followed by one or more lines starting with `@`)
- Validate immediate `@` assertion lines requirement
- Extract assertion syntax per marker position

**Phase 2: Test Callback Registration**
- Dynamically register one test callback per annotated block using Node.js built-in `test()` function
- Test name format: `{line-text-content} {positional-marker-line}` as specified in this document
- Each test callback includes:
  - Source markdown content (cleaned of annotations)
  - Expected token assertions at each marked position
  - File path and line number for error reporting

**Phase 3: Dynamic Test Execution**
This is automatically happening as part of the Node.js test runner
- Execute test callbacks inline during test run
- Each callback succeeds or fails immediately
- Group tests by directory/file hierarchy using node.js built-in tester conventions

### 3. Test script

```json
{
  "scripts": {
    "test": "node --test parse/tests/**/*.js"
  }
}
```
