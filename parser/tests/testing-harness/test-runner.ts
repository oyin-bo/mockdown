/**
 * Test Runner for Annotated Scanner2 Tests
 * 
 * Executes annotated test cases against Scanner2 and provides detailed validation
 * with rich error reporting and debugging support.
 */

import { createScanner2, type Scanner2, type ScannerDebugState } from '../../scanner2.js';
import { SyntaxKind2, TokenFlags2 } from '../../scanner2-token-types.js';
import { type AnnotatedTest, type TokenExpectation, describeExpectation } from './annotated-test-format.js';

/**
 * Results from running a single annotated test
 */
export interface TestResult {
  /** Whether the test passed */
  passed: boolean;
  /** Test case name */
  name: string;
  /** Input text that was tested */
  input: string;
  /** Expected tokens */
  expected: TokenExpectation[];
  /** Actual tokens that were scanned */
  actual: ActualToken[];
  /** Error message if test failed */
  error?: string;
  /** Performance metrics if requested */
  performance?: PerformanceMetrics;
  /** Debug state snapshots if requested */
  debugStates?: ScannerDebugState[];
}

/**
 * Represents an actual token that was scanned
 */
export interface ActualToken {
  kind: SyntaxKind2;
  text: string;
  flags: TokenFlags2;
  pos: number;
  length: number;
}

/**
 * Performance metrics for a test run
 */
export interface PerformanceMetrics {
  /** Total time to scan all tokens (microseconds) */
  scanTimeUs: number;
  /** Number of tokens scanned */
  tokenCount: number;
  /** Average time per token (microseconds) */
  avgTimePerTokenUs: number;
}

/**
 * Run a single annotated test case
 */
export function runAnnotatedTest(test: AnnotatedTest): TestResult {
  const scanner = createScanner2();
  const actual: ActualToken[] = [];
  const debugStates: ScannerDebugState[] = [];
  
  let performance: PerformanceMetrics | undefined;
  
  try {
    // Set up scanner
    scanner.setText(test.input);
    
    // Performance measurement if requested
    const startTime = test.config?.testPerformance ? Date.now() : 0;
    
    // Scan all tokens
    let pos = 0;
    while (true) {
      // Capture debug state if requested
      if (test.config?.testDebugState) {
        const debugState: ScannerDebugState = {
          pos: 0, line: 0, column: 0, mode: '',
          atLineStart: false, inParagraph: false, precedingLineBreak: false,
          currentToken: SyntaxKind2.Unknown, currentTokenText: '', 
          currentTokenFlags: TokenFlags2.None, nextOffset: 0
        };
        scanner.fillDebugState(debugState);
        debugStates.push(debugState);
      }
      
      scanner.scan();
      
      const token: ActualToken = {
        kind: scanner.token,
        text: scanner.tokenText,
        flags: scanner.tokenFlags,
        pos: pos,
        length: scanner.offsetNext - pos
      };
      actual.push(token);
      
      pos = scanner.offsetNext;
      
      if (scanner.token === SyntaxKind2.EndOfFileToken) {
        break;
      }
    }
    
    // Calculate performance metrics
    if (test.config?.testPerformance) {
      const endTime = Date.now();
      const totalTimeUs = (endTime - startTime) * 1000; // Convert ms to microseconds
      performance = {
        scanTimeUs: totalTimeUs,
        tokenCount: actual.length,
        avgTimePerTokenUs: totalTimeUs / actual.length
      };
    }
    
    // Test rollback functionality if requested
    if (test.config?.testRollback) {
      testRollbackFunctionality(scanner, test.input);
    }
    
    // Validate results
    const validationError = validateTokens(test.expected, actual);
    
    return {
      passed: !validationError,
      name: test.name,
      input: test.input,
      expected: test.expected,
      actual,
      error: validationError,
      performance,
      debugStates: test.config?.testDebugState ? debugStates : undefined
    };
    
  } catch (error) {
    return {
      passed: false,
      name: test.name,
      input: test.input,
      expected: test.expected,
      actual,
      error: `Exception during test execution: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Run multiple annotated test cases
 */
export function runAnnotatedTests(tests: AnnotatedTest[]): TestResult[] {
  return tests.map(test => runAnnotatedTest(test));
}

/**
 * Validate that actual tokens match expected tokens
 */
function validateTokens(expected: TokenExpectation[], actual: ActualToken[]): string | undefined {
  if (expected.length !== actual.length) {
    return `Token count mismatch: expected ${expected.length} tokens, got ${actual.length} tokens\n` +
           `Expected: ${expected.map(describeExpectation).join(', ')}\n` +
           `Actual: ${actual.map(describeActualToken).join(', ')}`;
  }
  
  for (let i = 0; i < expected.length; i++) {
    const exp = expected[i];
    const act = actual[i];
    
    // Validate token kind
    if (exp.kind !== act.kind) {
      return `Token ${i}: Kind mismatch\n` +
             `Expected: ${SyntaxKind2[exp.kind]}\n` +
             `Actual: ${SyntaxKind2[act.kind]}`;
    }
    
    // Validate token text
    if (exp.text !== act.text) {
      return `Token ${i}: Text mismatch\n` +
             `Expected: "${exp.text}"\n` +
             `Actual: "${act.text}"`;
    }
    
    // Validate token flags (if specified)
    if (exp.flags !== undefined && (exp.flags & act.flags) !== exp.flags) {
      return `Token ${i}: Flags mismatch\n` +
             `Expected flags: ${describeFlagsConcise(exp.flags)}\n` +
             `Actual flags: ${describeFlagsConcise(act.flags)}\n` +
             `Missing flags: ${describeFlagsConcise(exp.flags & ~act.flags)}`;
    }
    
    // Validate position (if specified)
    if (exp.pos !== undefined && exp.pos !== act.pos) {
      return `Token ${i}: Position mismatch\n` +
             `Expected: ${exp.pos}\n` +
             `Actual: ${act.pos}`;
    }
    
    // Validate length (if specified)
    if (exp.length !== undefined && exp.length !== act.length) {
      return `Token ${i}: Length mismatch\n` +
             `Expected: ${exp.length}\n` +
             `Actual: ${act.length}`;
    }
  }
  
  return undefined; // No validation errors
}

/**
 * Test rollback functionality
 */
function testRollbackFunctionality(scanner: Scanner2, input: string): void {
  // Test that rollback to position 0 works
  scanner.setText(input);
  scanner.scan(); // Advance past first token
  
  // TODO: Implement rollback testing when Scanner2 rollback is implemented
  // scanner.rollback(0, RollbackType.DocumentStart);
  // Verify scanner state is reset correctly
}

/**
 * Generate human-readable description of actual token
 */
function describeActualToken(token: ActualToken): string {
  const kindName = SyntaxKind2[token.kind];
  const flagsDesc = token.flags !== TokenFlags2.None ? ` flags=${describeFlagsConcise(token.flags)}` : '';
  
  return `${kindName} "${token.text}"${flagsDesc} pos=${token.pos} len=${token.length}`;
}

/**
 * Generate concise flag description
 */
function describeFlagsConcise(flags: TokenFlags2): string {
  const flagNames: string[] = [];
  
  if (flags & TokenFlags2.PrecedingLineBreak) flagNames.push('PrecedingLineBreak');
  if (flags & TokenFlags2.IsAtLineStart) flagNames.push('IsAtLineStart');
  if (flags & TokenFlags2.IsBlankLine) flagNames.push('IsBlankLine');
  if (flags & TokenFlags2.CanRollbackHere) flagNames.push('CanRollbackHere');
  
  return flagNames.length > 0 ? flagNames.join('|') : 'None';
}

/**
 * Format test results for console output
 */
export function formatTestResults(results: TestResult[], options: { verbose?: boolean } = {}): string {
  const lines: string[] = [];
  
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  
  lines.push(`\n📊 Annotated Test Results: ${passed}/${total} passed\n`);
  
  if (options.verbose || passed < total) {
    for (const result of results) {
      const status = result.passed ? '✅' : '❌';
      lines.push(`${status} ${result.name}`);
      
      if (!result.passed && result.error) {
        lines.push(`   Error: ${result.error}`);
        lines.push('');
      }
      
      if (options.verbose) {
        lines.push(`   Input: "${result.input}"`);
        lines.push(`   Expected: ${result.expected.map(describeExpectation).join(', ')}`);
        lines.push(`   Actual: ${result.actual.map(describeActualToken).join(', ')}`);
        
        if (result.performance) {
          lines.push(`   Performance: ${result.performance.scanTimeUs.toFixed(1)}μs total, ${result.performance.avgTimePerTokenUs.toFixed(1)}μs/token`);
        }
        
        lines.push('');
      }
    }
  }
  
  return lines.join('\n');
}

/**
 * Convert test results to Vitest-compatible assertions
 * This allows annotated tests to integrate seamlessly with existing test infrastructure
 */
export function assertTestResults(results: TestResult[]): void {
  const failed = results.filter(r => !r.passed);
  
  if (failed.length > 0) {
    const errorMessages = failed.map(f => `${f.name}: ${f.error}`).join('\n');
    throw new Error(`${failed.length} annotated tests failed:\n${errorMessages}`);
  }
}