/**
 * Testing Utilities for Scanner2 Testing Infrastructure
 * 
 * Provides helper functions for common testing patterns, debugging,
 * and integration with existing test frameworks.
 */

import { expect } from 'vitest';
import { createScanner2, type Scanner2, type ScannerDebugState } from '../../scanner2.js';
import { SyntaxKind2, TokenFlags2 } from '../../scanner2-token-types.js';
import { 
  parseAnnotatedTest, 
  type AnnotatedTest, 
  type TokenExpectation 
} from './annotated-test-format.js';
import { 
  runAnnotatedTests, 
  formatTestResults, 
  assertTestResults,
  type TestResult,
  type ActualToken
} from './test-runner.js';

/**
 * Main entry point for running annotated tests in Vitest
 */
export function testAnnotated(annotatedMarkdown: string, options: { verbose?: boolean } = {}): void {
  const tests = parseAnnotatedTest(annotatedMarkdown);
  const results = runAnnotatedTests(tests);
  
  if (options.verbose) {
    console.log(formatTestResults(results, { verbose: true }));
  }
  
  assertTestResults(results);
}

/**
 * Create a Scanner2 test helper with additional debugging capabilities
 */
export function createTestScanner(): TestScannerHelper {
  const scanner = createScanner2();
  return new TestScannerHelper(scanner);
}

/**
 * Enhanced scanner wrapper with testing utilities
 */
export class TestScannerHelper {
  private scanner: Scanner2;
  private tokenHistory: ActualToken[] = [];
  private debugHistory: ScannerDebugState[] = [];
  
  constructor(scanner: Scanner2) {
    this.scanner = scanner;
  }
  
  /**
   * Set text and reset history
   */
  setText(text: string): void {
    this.scanner.setText(text);
    this.tokenHistory = [];
    this.debugHistory = [];
  }
  
  /**
   * Scan next token and record in history
   */
  scan(): void {
    // Capture debug state before scanning
    const debugState: ScannerDebugState = {
      pos: 0, line: 0, column: 0, mode: '',
      atLineStart: false, inParagraph: false, precedingLineBreak: false,
      currentToken: SyntaxKind2.Unknown, currentTokenText: '', 
      currentTokenFlags: TokenFlags2.None, nextOffset: 0
    };
    this.scanner.fillDebugState(debugState);
    this.debugHistory.push(debugState);
    
    const startPos = this.scanner.offsetNext;
    this.scanner.scan();
    
    // Record token in history
    const token: ActualToken = {
      kind: this.scanner.token,
      text: this.scanner.tokenText,
      flags: this.scanner.tokenFlags,
      pos: startPos,
      length: this.scanner.offsetNext - startPos
    };
    this.tokenHistory.push(token);
  }
  
  /**
   * Scan all remaining tokens
   */
  scanAll(): ActualToken[] {
    const tokens: ActualToken[] = [];
    
    while (this.scanner.token !== SyntaxKind2.EndOfFileToken) {
      this.scan();
      tokens.push(this.tokenHistory[this.tokenHistory.length - 1]);
    }
    
    return tokens;
  }
  
  /**
   * Get current token
   */
  get token(): SyntaxKind2 {
    return this.scanner.token;
  }
  
  /**
   * Get current token text
   */
  get tokenText(): string {
    return this.scanner.tokenText;
  }
  
  /**
   * Get current token flags
   */
  get tokenFlags(): TokenFlags2 {
    return this.scanner.tokenFlags;
  }
  
  /**
   * Get next token position
   */
  get offsetNext(): number {
    return this.scanner.offsetNext;
  }
  
  /**
   * Get all scanned tokens
   */
  getTokenHistory(): ActualToken[] {
    return [...this.tokenHistory];
  }
  
  /**
   * Get debug state history
   */
  getDebugHistory(): ScannerDebugState[] {
    return [...this.debugHistory];
  }
  
  /**
   * Assert that the next tokens match expectations
   */
  expectTokens(...expectations: TokenExpectation[]): void {
    for (const expectation of expectations) {
      this.scan();
      this.expectCurrentToken(expectation);
    }
  }
  
  /**
   * Assert that current token matches expectation
   */
  expectCurrentToken(expectation: TokenExpectation): void {
    expect(this.token).toBe(expectation.kind);
    expect(this.tokenText).toBe(expectation.text);
    
    if (expectation.flags !== undefined) {
      expect(this.tokenFlags & expectation.flags).toBe(expectation.flags);
    }
    
    if (expectation.pos !== undefined) {
      const currentPos = this.offsetNext - this.tokenText.length;
      expect(currentPos).toBe(expectation.pos);
    }
  }
  
  /**
   * Print current scanner state for debugging
   */
  debugPrint(): void {
    console.log('📍 Scanner State:');
    console.log(`   Token: ${SyntaxKind2[this.token]}`);
    console.log(`   Text: "${this.tokenText}"`);
    console.log(`   Flags: ${describeFlagsConcise(this.tokenFlags)}`);
    console.log(`   Position: ${this.offsetNext}`);
    
    if (this.debugHistory.length > 0) {
      const latest = this.debugHistory[this.debugHistory.length - 1];
      console.log(`   Debug: line=${latest.line} col=${latest.column} mode=${latest.mode}`);
    }
  }
  
  /**
   * Print token history for debugging
   */
  debugPrintHistory(): void {
    console.log('📜 Token History:');
    this.tokenHistory.forEach((token, i) => {
      const kindName = SyntaxKind2[token.kind];
      const flagsDesc = token.flags !== TokenFlags2.None ? ` flags=${describeFlagsConcise(token.flags)}` : '';
      console.log(`   ${i}: ${kindName} "${token.text}"${flagsDesc} pos=${token.pos} len=${token.length}`);
    });
  }
}

/**
 * Create quick token expectation objects
 */
export const token = {
  string: (text: string, flags?: TokenFlags2): TokenExpectation => ({
    kind: SyntaxKind2.StringLiteral,
    text,
    flags
  }),
  
  whitespace: (text: string, flags?: TokenFlags2): TokenExpectation => ({
    kind: SyntaxKind2.WhitespaceTrivia,
    text,
    flags
  }),
  
  newline: (text: string = '\n', flags?: TokenFlags2): TokenExpectation => ({
    kind: SyntaxKind2.NewLineTrivia,
    text,
    flags
  }),
  
  eof: (): TokenExpectation => ({
    kind: SyntaxKind2.EndOfFileToken,
    text: ''
  })
};

/**
 * Performance testing utilities
 */
export class PerformanceTester {
  private scanner: Scanner2;
  
  constructor() {
    this.scanner = createScanner2();
  }
  
  /**
   * Measure scanning performance for given input
   */
  measureScanTime(input: string, iterations: number = 1000): PerformanceResult {
    const results: number[] = [];
    
    for (let i = 0; i < iterations; i++) {
      this.scanner.setText(input);
      
      // Use more precise timing - process.hrtime.bigint() if available, otherwise Date.now()
      const start = typeof process !== 'undefined' && process.hrtime ? 
        Number(process.hrtime.bigint()) / 1000 : // Convert nanoseconds to microseconds
        Date.now() * 1000; // Convert milliseconds to microseconds
      
      let tokenCount = 0;
      while (this.scanner.token !== SyntaxKind2.EndOfFileToken) {
        this.scanner.scan();
        tokenCount++;
      }
      
      const end = typeof process !== 'undefined' && process.hrtime ? 
        Number(process.hrtime.bigint()) / 1000 : 
        Date.now() * 1000;
        
      const timeUs = end - start;
      // Ensure we have a minimum measurable time
      results.push(Math.max(timeUs, 0.1));
    }
    
    const totalTime = results.reduce((sum, time) => sum + time, 0);
    const avgTime = totalTime / iterations;
    const minTime = Math.min(...results);
    const maxTime = Math.max(...results);
    
    return {
      input,
      iterations,
      avgTimeUs: avgTime,
      minTimeUs: minTime,
      maxTimeUs: maxTime,
      totalTimeUs: totalTime
    };
  }
  
  /**
   * Compare scanning performance between different inputs
   */
  compare(inputs: string[], iterations: number = 100): PerformanceComparison {
    const results = inputs.map(input => this.measureScanTime(input, iterations));
    
    return {
      results,
      fastest: results.reduce((min, curr) => curr.avgTimeUs < min.avgTimeUs ? curr : min),
      slowest: results.reduce((max, curr) => curr.avgTimeUs > max.avgTimeUs ? curr : max)
    };
  }
}

export interface PerformanceResult {
  input: string;
  iterations: number;
  avgTimeUs: number;
  minTimeUs: number;
  maxTimeUs: number;
  totalTimeUs: number;
}

export interface PerformanceComparison {
  results: PerformanceResult[];
  fastest: PerformanceResult;
  slowest: PerformanceResult;
}

/**
 * Utility functions for common test patterns
 */
export const testUtils = {
  /**
   * Test that scanning is deterministic (multiple runs produce same result)
   */
  testDeterministic(input: string, runs: number = 10): void {
    const scanner = createScanner2();
    const reference: ActualToken[] = [];
    
    // Get reference result
    scanner.setText(input);
    while (scanner.token !== SyntaxKind2.EndOfFileToken) {
      scanner.scan();
      reference.push({
        kind: scanner.token,
        text: scanner.tokenText,
        flags: scanner.tokenFlags,
        pos: 0, // Position tracking varies
        length: scanner.tokenText.length
      });
    }
    
    // Verify all subsequent runs match
    for (let i = 1; i < runs; i++) {
      scanner.setText(input);
      let tokenIndex = 0;
      
      while (scanner.token !== SyntaxKind2.EndOfFileToken) {
        scanner.scan();
        
        expect(scanner.token).toBe(reference[tokenIndex].kind);
        expect(scanner.tokenText).toBe(reference[tokenIndex].text);
        expect(scanner.tokenFlags).toBe(reference[tokenIndex].flags);
        
        tokenIndex++;
      }
      
      expect(tokenIndex).toBe(reference.length);
    }
  },
  
  /**
   * Test that different line ending styles produce consistent results
   */
  testLineEndingConsistency(input: string): void {
    const scanner = createScanner2();
    
    // Test with different line endings
    const variants = [
      input, // Original
      input.replace(/\n/g, '\r\n'), // CRLF
      input.replace(/\n/g, '\r')    // CR only
    ];
    
    const results = variants.map(variant => {
      scanner.setText(variant);
      const tokens: ActualToken[] = [];
      
      while (scanner.token !== SyntaxKind2.EndOfFileToken) {
        scanner.scan();
        tokens.push({
          kind: scanner.token,
          text: scanner.tokenText,
          flags: scanner.tokenFlags,
          pos: 0,
          length: scanner.tokenText.length
        });
      }
      
      return tokens;
    });
    
    // All results should have same token structure (ignoring exact newline text)
    for (let i = 1; i < results.length; i++) {
      expect(results[i].length).toBe(results[0].length);
      
      for (let j = 0; j < results[0].length; j++) {
        expect(results[i][j].kind).toBe(results[0][j].kind);
        expect(results[i][j].flags).toBe(results[0][j].flags);
        
        // Text should match for non-newline tokens
        if (results[0][j].kind !== SyntaxKind2.NewLineTrivia) {
          expect(results[i][j].text).toBe(results[0][j].text);
        }
      }
    }
  }
};

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