/**
 * Scanner2 Testing Harness - Stage 2 Testing Infrastructure
 * 
 * This module provides comprehensive testing infrastructure for Scanner2 and future
 * parser stages. It includes annotated test formats, test runners, and utilities
 * for declarative testing of markdown parsing.
 * 
 * @example Basic Usage:
 * ```typescript
 * import { testAnnotated } from './testing-harness';
 * 
 * testAnnotated(`
 *   <!-- TEST: Simple text line -->
 *   Hello world
 *   <!-- EXPECT: StringLiteral "Hello world" flags=IsAtLineStart -->
 *   <!-- EXPECT: EndOfFileToken "" -->
 *   <!-- /TEST -->
 * `);
 * ```
 * 
 * @example Advanced Usage:
 * ```typescript
 * import { createTestScanner, token } from './testing-harness';
 * 
 * const scanner = createTestScanner();
 * scanner.setText('  Hello\\n\\nWorld  ');
 * scanner.expectTokens(
 *   token.whitespace('  '),
 *   token.string('Hello'),
 *   token.newline('\\n'),
 *   token.newline('\\n', TokenFlags2.IsBlankLine),
 *   token.string('World'),
 *   token.eof()
 * );
 * ```
 */

// Core annotated testing functionality
export {
  parseAnnotatedTest,
  type AnnotatedTest,
  type TokenExpectation,
  describeExpectation
} from './annotated-test-format.js';

// Test execution and validation
export {
  runAnnotatedTest,
  runAnnotatedTests,
  formatTestResults,
  assertTestResults,
  type TestResult,
  type ActualToken,
  type PerformanceMetrics
} from './test-runner.js';

// Testing utilities and helpers
export {
  testAnnotated,
  createTestScanner,
  TestScannerHelper,
  token,
  PerformanceTester,
  testUtils,
  type PerformanceResult,
  type PerformanceComparison
} from './test-utils.js';

/**
 * Quick start example for new users
 */
export const examples = {
  /**
   * Basic annotated test example
   */
  basic: `
<!-- TEST: Basic text tokenization -->
Hello world
<!-- EXPECT: StringLiteral "Hello world" flags=IsAtLineStart -->
<!-- EXPECT: EndOfFileToken "" -->
<!-- /TEST -->
`,

  /**
   * Multi-line text with whitespace
   */
  multiline: `
<!-- TEST: Multi-line with whitespace -->
  First line
    Second line
<!-- EXPECT: WhitespaceTrivia "  " flags=IsAtLineStart -->
<!-- EXPECT: StringLiteral "First line" -->
<!-- EXPECT: NewLineTrivia "\\n" -->
<!-- EXPECT: WhitespaceTrivia "    " flags=IsAtLineStart|PrecedingLineBreak -->
<!-- EXPECT: StringLiteral "Second line" -->
<!-- EXPECT: EndOfFileToken "" -->
<!-- /TEST -->
`,

  /**
   * Blank line detection
   */
  blankLines: `
<!-- TEST: Blank line detection -->
Text

More text
<!-- EXPECT: StringLiteral "Text" flags=IsAtLineStart -->
<!-- EXPECT: NewLineTrivia "\\n" -->
<!-- EXPECT: NewLineTrivia "\\n" flags=IsBlankLine|PrecedingLineBreak -->
<!-- EXPECT: StringLiteral "More text" flags=IsAtLineStart|PrecedingLineBreak -->
<!-- EXPECT: EndOfFileToken "" -->
<!-- /TEST -->
`,

  /**
   * Performance testing example
   */
  performance: `
<!-- TEST: Performance measurement -->
<!-- CONFIG: performance=true -->
This is a longer text that we want to measure scanning performance for
<!-- EXPECT: StringLiteral "This is a longer text that we want to measure scanning performance for" flags=IsAtLineStart -->
<!-- EXPECT: EndOfFileToken "" -->
<!-- /TEST -->
`,

  /**
   * Debug state testing example
   */
  debug: `
<!-- TEST: Debug state capture -->
<!-- CONFIG: debug=true -->
Simple text
<!-- EXPECT: StringLiteral "Simple text" flags=IsAtLineStart -->
<!-- EXPECT: EndOfFileToken "" -->
<!-- /TEST -->
`
};

/**
 * Recommended patterns for different testing scenarios
 */
export const patterns = {
  /**
   * Pattern for testing Stage 3 inline formatting (when implemented)
   */
  inlineFormatting: `
// Future Stage 3 example:
<!-- TEST: Bold text -->
**bold text**
<!-- EXPECT: BoldStart "**" -->
<!-- EXPECT: StringLiteral "bold text" -->
<!-- EXPECT: BoldEnd "**" -->
<!-- EXPECT: EndOfFileToken "" -->
<!-- /TEST -->
`,

  /**
   * Pattern for testing Stage 4 HTML/entities (when implemented)
   */
  htmlEntities: `
// Future Stage 4 example:
<!-- TEST: HTML entities -->
&lt;tag&gt;
<!-- EXPECT: EntityRef "&lt;" -->
<!-- EXPECT: StringLiteral "tag" -->
<!-- EXPECT: EntityRef "&gt;" -->
<!-- EXPECT: EndOfFileToken "" -->
<!-- /TEST -->
`,

  /**
   * Pattern for testing rollback functionality
   */
  rollbackTesting: `
<!-- TEST: Rollback functionality -->
<!-- CONFIG: rollback=true -->
Text content
<!-- EXPECT: StringLiteral "Text content" flags=IsAtLineStart|CanRollbackHere -->
<!-- EXPECT: EndOfFileToken "" -->
<!-- /TEST -->
`
};