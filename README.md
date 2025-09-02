# MixPad

**MixPad** is a name for a blazingly fast, editor-grade Markdown parser that treats HTML as a first-class citizen, and supports all major extensions out of the box: tables, front matter, maths and more. Built with no-allocation single-scanner architecture, it delivers incremental parsing and precise source positioning perfect for live editing and large documents alike.

## Testing Philosophy: Annotated Verification

Our testing infrastructure uses an innovative **annotated markdown format** that serves triple duty as documentation, verification, and implementation guide. Tests use position markers to specify exact token expectations:

```typescript
expect(verifyTokens(`
**bold text**
1 2        3
@1 AsteriskAsterisk flags: 514
@2 StringLiteral text: "bold text"  
@3 AsteriskAsterisk flags: 1024`)).toBe(/* same input */);
```

Position markers (`1 2 3`) map to token assertions (`@1 @2 @3`) with expected token types and attributes. This creates tests that are simultaneously human-readable specifications, robust verification suites, and clear implementation roadmaps. When tests fail, errors are injected directly into the annotated format, making debugging immediate and contextual.

Mixpad relies on tests as a cornerstone of its breakneck progress. We move ***fast*** because we stay on the ground. Every update and addition is verified with an aggressive test coverage of every little quirk.

## Architecture: Smart Scanner, Simple Parser

Mixpad is full of innovations, like a **responsibility shift** moving complexity INTO the scanner through structured ambiguity resolution, making the parser elegantly simple. Unlike traditional approaches that create GC pressure with speculative token streams and rollbacks, our scanner resolves Markdown's structural ambiguities internally using typed state flags, emitting only definitive tokens.

Fast editing requires constant re-parsing of modified documents. Markdown is one of the top-quality parsers supporting fast re-parsing of incremental changes.

**Editing**: Most existing parsers descend from Markdown>HTML processors, struggling with precise positions and incremental updates that you need to edit Markdown as easily as any other language. Mixpad targets that goal with intentionality.

**Performance**: Mixpad unlike other parsers is fundamentally designed for efficiency. By investing in zero-allocation scanner, we can parse basically with the speed of memory read. That allows us to deal with Markdown's inherent ambiguities by rollback and re-scan, all with linear time and not incurring any allocations.

## Laser focus: Performance Excellence

🚀 **Industry-Leading Speed**: Match or exceed the performance of lower-level language parsers while maintaining JavaScript's flexibility and TypeScript's type safety.

⚡ **Zero-Allocation Operation**: Eliminate GC pressure through primitive-only state management and lazy text materialization, crucial for real-time editor performance.

🎯 **Incremental Parsing Mastery**: Enable sub-millisecond updates to massive documents through intelligent rollback boundaries and minimal re-parsing.

📐 **Editor-Grade Precision**: Deliver exact source positions, comprehensive error recovery, and seamless HTML/Markdown unification for the next generation of editing tools.

## Contributing

We welcome suggestions, bug reports, and architectural discussions. This parser represents a fundamental rethinking of Markdown parsing—your insights help push the boundaries of what's possible in text processing performance.