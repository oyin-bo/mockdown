# Mixpad: Markdown Parser Library

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

Mixpad is a TypeScript-based "Mockdown document parser and management" library that implements an editor-grade Markdown parser with native HTML support, built using TypeScript-style single scanner architecture for minimal memory usage and precise source mapping.

## Working Effectively

### Bootstrap, Build, and Test
- Install dependencies: `npm install` -- completes in ~4 seconds
- Build the parser: `npm run build` or `npm run build:parser` -- completes in ~8ms (essentially instant)
- Run tests: `npm run test` -- runs 371 tests in ~3 seconds, all should pass
- Build output: Creates `mparser.js` (~57KB) and `mparser.js.map` in project root

### Development Workflow
- Run TypeScript files directly: `node --loader ./ts-loader.js [file.ts]`
- Test parser functionality: Create parser with `createParser()`, then call `parseDocument(markdown)` 
- All source code is in TypeScript, no JavaScript compilation step needed for development
- Built bundle is ES module format compatible

## Validation

### Always Test Parser Functionality After Changes
Create a test file to validate parser works correctly:

**Option 1: Test file in project directory (recommended)**:
```javascript
import { createParser } from './parser/index.ts';

const parser = createParser();
const result = parser.parseDocument('# Test\n\nHello **world**!');
console.log('Success:', result.ast.children?.length > 0);
```

**Option 2: Test file outside project directory**:
```javascript
import { createParser } from '/home/runner/work/mixpad/mixpad/parser/index.ts';

const parser = createParser();
const result = parser.parseDocument('# Test\n\nHello **world**!');
console.log('Success:', result.ast.children?.length > 0);
```

Run with: `node --loader ./ts-loader.js test-file.js`

### Required Validation Steps
- ALWAYS run `npm run build` to ensure clean build
- ALWAYS run `npm run test` to ensure all 371 tests pass
- ALWAYS test actual parser functionality with sample Markdown input
- Test with complex Markdown including headings, lists, code blocks, tables

### Manual Testing Scenarios
Test these Markdown constructs to ensure parser works correctly:
- Headings: `# H1`, `## H2`, etc.
- Emphasis: `**bold**`, `*italic*`
- Lists: `- item`, `1. numbered`
- Code: `` `inline` ``, ``` fenced blocks ```
- Tables: `| col1 | col2 |`
- HTML elements: `<div>content</div>`

## Repository Structure

### Key Files and Locations
```
/                           # Project root
├── package.json           # npm configuration and scripts  
├── tsconfig.json          # TypeScript configuration
├── ts-loader.js           # Custom TypeScript ESM loader for development
├── mparser.js             # Built parser bundle (generated)
└── parser/                # Main source directory
    ├── index.ts           # Main entry point - exports createParser
    ├── scanner.ts         # Core lexical analyzer (~1200 lines)
    ├── parser.ts          # Core parser implementation
    ├── ast-types.ts       # AST node type definitions
    ├── ast-factory.ts     # Node creation utilities
    ├── token-types.ts     # Token definitions
    ├── character-codes.ts # Character classification helpers
    ├── entities.ts        # HTML entity handling
    ├── parser-utils.ts    # Parsing helper functions
    ├── docs/              # Extensive implementation documentation
    └── tests/             # Comprehensive test suite (371 tests)
```

### Important Documentation
- `parser/docs/1-plan.md` - Overall implementation plan and architecture
- `parser/docs/2-scanner.md` - Scanner module implementation details  
- `parser/docs/8-parser-1-core.md` - Core parser implementation log
- `parser/docs/3-scanner-followup.md` - Scanner enhancement roadmap

## Common Tasks

### Parser Usage Pattern
```typescript
import { createParser } from './parser/index.ts';

// Create parser instance
const parser = createParser();

// Parse markdown document
const result = parser.parseDocument(markdownText);

// Access parsed AST
console.log('AST:', result.ast);
console.log('Diagnostics:', result.diagnostics);
```

### Running Tests for Specific Components
- All tests: `npm run test`
- Specific test file: `npx vitest run [file]` (e.g., `npx vitest run parser/tests/entities.test.ts`)
- Scanner tests (all): Tests in `parser/tests/scanner/` directory will run as part of full test suite
- Parser tests: `npx vitest run parser/tests/parser.test.ts`
- Entity tests: `npx vitest run parser/tests/entities.test.ts`

### Key TypeScript Modules
- **Scanner** (`scanner.ts`): Lexical analysis with mode switching
- **Parser** (`parser.ts`): Recursive descent parser consuming scanner directly
- **AST Types** (`ast-types.ts`): Node kind enums and type definitions
- **AST Factory** (`ast-factory.ts`): Node creation and manipulation utilities

### Architecture Notes
- Uses TypeScript-style single scanner architecture (no token arrays)
- Direct AST construction without intermediate token streams
- Memory-efficient with on-demand token materialization
- Supports HTML inside Markdown with proper context switching
- Comprehensive error recovery and diagnostics

## Troubleshooting

### Module Resolution Issues
- Use absolute paths when importing: `/home/runner/work/mixpad/mixpad/parser/index.ts`
- Always use the ts-loader for TypeScript files: `node --loader ./ts-loader.js`
- Parser exports: `{ createParser }` function only

### Build Issues  
- Clean build: `rm -f mparser.js mparser.js.map && npm run build`
- Check TypeScript config: `tsconfig.json` is configured for ES2022/NodeNext
- All builds should complete in milliseconds, not minutes

### Test Issues
- Full test suite should always pass 371/371 tests
- Test runner: vitest with custom TypeScript integration
- Tests are organized by functionality in `parser/tests/` subdirectories

## Performance Expectations
- Build time: ~8ms (essentially instant)
- Test suite: ~3 seconds total
- Parser initialization: Instant 
- Parsing performance: Optimized for memory efficiency with char-code decisions