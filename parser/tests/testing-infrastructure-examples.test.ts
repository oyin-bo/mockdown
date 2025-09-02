/**
 * Example Usage of Stage 2 Testing Infrastructure
 * 
 * This file demonstrates the new annotated testing system with practical examples
 * that showcase the declarative testing approach for Scanner2.
 */

import { describe, test } from 'vitest';
import { testAnnotated } from './testing-harness/index.js';

describe('Stage 2: Testing Infrastructure Examples', () => {
  
  test('demonstrates basic annotated test usage', () => {
    testAnnotated(`
<!-- TEST: Simple text with line break -->
Hello world
Second line
<!-- EXPECT: StringLiteral "Hello world" flags=IsAtLineStart -->
<!-- EXPECT: NewLineTrivia "\\n" -->
<!-- EXPECT: StringLiteral "Second line" flags=IsAtLineStart|PrecedingLineBreak -->
<!-- EXPECT: EndOfFileToken "" -->
<!-- /TEST -->
    `);
  });
  
  test('demonstrates whitespace handling', () => {
    testAnnotated(`
<!-- TEST: Leading whitespace preservation -->
    Indented text
<!-- EXPECT: WhitespaceTrivia "    " flags=IsAtLineStart -->
<!-- EXPECT: StringLiteral "Indented text" -->
<!-- EXPECT: EndOfFileToken "" -->
<!-- /TEST -->
    `);
  });
  
  test('demonstrates blank line detection', () => {
    testAnnotated(`
<!-- TEST: Blank line flags -->
Text

More text
<!-- EXPECT: StringLiteral "Text" flags=IsAtLineStart -->
<!-- EXPECT: NewLineTrivia "\\n" -->
<!-- EXPECT: NewLineTrivia "\\n" flags=IsBlankLine|PrecedingLineBreak -->
<!-- EXPECT: StringLiteral "More text" flags=IsAtLineStart|PrecedingLineBreak -->
<!-- EXPECT: EndOfFileToken "" -->
<!-- /TEST -->
    `);
  });
  
  test('demonstrates multiple test cases in one annotation', () => {
    testAnnotated(`
<!-- TEST: First test case -->
Simple
<!-- EXPECT: StringLiteral "Simple" flags=IsAtLineStart -->
<!-- EXPECT: EndOfFileToken "" -->
<!-- /TEST -->

<!-- TEST: Second test case -->
Another test
<!-- EXPECT: StringLiteral "Another test" flags=IsAtLineStart -->
<!-- EXPECT: EndOfFileToken "" -->
<!-- /TEST -->
    `);
  });
  
  test('demonstrates performance testing configuration', () => {
    testAnnotated(`
<!-- TEST: Performance measurement example -->
<!-- CONFIG: performance=true -->
This is a test line for performance measurement
<!-- EXPECT: StringLiteral "This is a test line for performance measurement" flags=IsAtLineStart -->
<!-- EXPECT: EndOfFileToken "" -->
<!-- /TEST -->
    `);
  });
  
  test('demonstrates edge case testing', () => {
    testAnnotated(`
<!-- TEST: Empty input handling -->
<!-- EXPECT: EndOfFileToken "" -->
<!-- /TEST -->

<!-- TEST: Unicode content -->
Hello 🌍 World
<!-- EXPECT: StringLiteral "Hello 🌍 World" flags=IsAtLineStart -->
<!-- EXPECT: EndOfFileToken "" -->
<!-- /TEST -->
    `);
  });
});

// This example shows how the testing infrastructure will extend for future stages
describe('Future Stage Patterns (Examples)', () => {
  
  test('shows pattern for Stage 3: inline formatting (future)', () => {
    // When Stage 3 is implemented, tests could look like:
    /*
    testAnnotated(`
      <!-- TEST: Bold text formatting -->
      **bold text**
      <!-- EXPECT: BoldStart "**" -->
      <!-- EXPECT: StringLiteral "bold text" -->
      <!-- EXPECT: BoldEnd "**" -->
      <!-- EXPECT: EndOfFileToken "" -->
      <!-- /TEST -->
    `);
    */
    
    // For now, just demonstrate the current capability
    testAnnotated(`
<!-- TEST: Future bold pattern (Stage 1 behavior) -->
**bold text**
<!-- EXPECT: StringLiteral "**bold text**" flags=IsAtLineStart -->
<!-- EXPECT: EndOfFileToken "" -->
<!-- /TEST -->
    `);
  });
  
  test('shows pattern for Stage 4: HTML entities (future)', () => {
    // When Stage 4 is implemented, tests could look like:
    /*
    testAnnotated(`
      <!-- TEST: HTML entity parsing -->
      &lt;tag&gt;
      <!-- EXPECT: EntityRef "&lt;" -->
      <!-- EXPECT: StringLiteral "tag" -->
      <!-- EXPECT: EntityRef "&gt;" -->
      <!-- EXPECT: EndOfFileToken "" -->
      <!-- /TEST -->
    `);
    */
    
    // For now, just demonstrate the current capability
    testAnnotated(`
<!-- TEST: Future entity pattern (Stage 1 behavior) -->
&lt;tag&gt;
<!-- EXPECT: StringLiteral "&lt;tag&gt;" flags=IsAtLineStart -->
<!-- EXPECT: EndOfFileToken "" -->
<!-- /TEST -->
    `);
  });
});

/*
 * Key Benefits Demonstrated:
 * 
 * 1. **Readable**: Tests are written in natural markdown with inline expectations
 * 2. **Maintainable**: Easy to update expectations when behavior changes
 * 3. **Comprehensive**: Can test tokens, flags, positions, and configurations
 * 4. **Extensible**: Ready for future stages with minimal changes
 * 5. **Integrated**: Works seamlessly with existing Vitest infrastructure
 * 6. **Debugging**: Rich error messages show exactly what differed
 * 7. **Performance**: Built-in performance measurement capabilities
 * 
 * This testing infrastructure provides the foundation for testing all subsequent
 * parser-scanner stages while maintaining the high quality and comprehensive
 * coverage that the project requires.
 */