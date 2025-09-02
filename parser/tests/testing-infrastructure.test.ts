/**
 * Test file for the Stage 2 Testing Infrastructure
 * 
 * This file demonstrates the new annotated testing system and validates
 * that it works correctly with Scanner2.
 */

import { describe, test, expect } from 'vitest';
import { 
  testAnnotated, 
  createTestScanner, 
  token, 
  examples,
  parseAnnotatedTest,
  runAnnotatedTests,
  PerformanceTester,
  testUtils
} from './testing-harness/index.js';
import { SyntaxKind2, TokenFlags2 } from '../scanner2-token-types.js';

describe('Stage 2: Testing Infrastructure', () => {
  
  describe('Annotated Test Format', () => {
    test('should parse basic annotated test', () => {
      const tests = parseAnnotatedTest(examples.basic);
      
      expect(tests).toHaveLength(1);
      expect(tests[0].name).toBe('Basic text tokenization');
      expect(tests[0].input).toBe('Hello world');
      expect(tests[0].expected).toHaveLength(2);
      expect(tests[0].expected[0].kind).toBe(SyntaxKind2.StringLiteral);
      expect(tests[0].expected[0].text).toBe('Hello world');
      expect(tests[0].expected[1].kind).toBe(SyntaxKind2.EndOfFileToken);
    });
    
    test('should handle multi-line tests with whitespace', () => {
      const tests = parseAnnotatedTest(examples.multiline);
      
      expect(tests).toHaveLength(1);
      expect(tests[0].input).toBe('  First line\n    Second line');
      expect(tests[0].expected).toHaveLength(6);
      
      // Verify whitespace token expectations
      expect(tests[0].expected[0].kind).toBe(SyntaxKind2.WhitespaceTrivia);
      expect(tests[0].expected[0].text).toBe('  ');
      expect(tests[0].expected[0].flags).toBe(TokenFlags2.IsAtLineStart);
    });
    
    test('should parse configuration options', () => {
      const tests = parseAnnotatedTest(examples.performance);
      
      expect(tests[0].config?.testPerformance).toBe(true);
    });
  });
  
  describe('Test Runner Integration', () => {
    test('should run basic annotated test successfully', () => {
      testAnnotated(examples.basic);
      // If this doesn't throw, the test passed
    });
    
    test('should run multi-line test successfully', () => {
      testAnnotated(examples.multiline);
      // If this doesn't throw, the test passed
    });
    
    test('should run blank line test successfully', () => {
      testAnnotated(examples.blankLines);
      // If this doesn't throw, the test passed
    });
    
    test('should handle performance testing', () => {
      testAnnotated(examples.performance);
      // Verify performance data is collected (implementation will add this)
    });
  });
  
  describe('TestScannerHelper', () => {
    test('should provide enhanced scanning capabilities', () => {
      const scanner = createTestScanner();
      scanner.setText('  Hello\nWorld  ');
      
      // Test expectation helpers
      scanner.expectTokens(
        token.whitespace('  ', TokenFlags2.IsAtLineStart),
        token.string('Hello'),
        token.newline('\n'),
        token.string('World', TokenFlags2.IsAtLineStart | TokenFlags2.PrecedingLineBreak),
        token.eof()
      );
      
      // Verify token history
      const history = scanner.getTokenHistory();
      expect(history).toHaveLength(5);
      expect(history[0].kind).toBe(SyntaxKind2.WhitespaceTrivia);
      expect(history[1].kind).toBe(SyntaxKind2.StringLiteral);
    });
    
    test('should track debug state', () => {
      const scanner = createTestScanner();
      scanner.setText('Test');
      scanner.scan();
      
      const debugHistory = scanner.getDebugHistory();
      expect(debugHistory.length).toBeGreaterThan(0);
    });
  });
  
  describe('Performance Testing', () => {
    test('should measure scanning performance', () => {
      const tester = new PerformanceTester();
      const result = tester.measureScanTime('Hello world\nSecond line', 10);
      
      expect(result.iterations).toBe(10);
      expect(result.avgTimeUs).toBeGreaterThan(0);
      expect(result.minTimeUs).toBeGreaterThan(0);
      expect(result.maxTimeUs).toBeGreaterThanOrEqual(result.minTimeUs);
    });
    
    test('should compare performance between inputs', () => {
      const tester = new PerformanceTester();
      const comparison = tester.compare(['short', 'this is a much longer input text'], 5);
      
      expect(comparison.results).toHaveLength(2);
      expect(comparison.fastest).toBeDefined();
      expect(comparison.slowest).toBeDefined();
    });
  });
  
  describe('Test Utilities', () => {
    test('should verify deterministic scanning', () => {
      testUtils.testDeterministic('Hello\nWorld', 5);
      // If this doesn't throw, scanning is deterministic
    });
    
    test('should verify line ending consistency', () => {
      testUtils.testLineEndingConsistency('Hello\nWorld\n');
      // If this doesn't throw, line endings are handled consistently
    });
  });
  
  describe('Advanced Annotated Tests', () => {
    test('should handle complex whitespace scenarios', () => {
      const complexTest = `
<!-- TEST: Complex whitespace -->
\t\tTabs and spaces  \t
  Mixed\twhitespace
<!-- EXPECT: WhitespaceTrivia "\\t\\t" flags=IsAtLineStart -->
<!-- EXPECT: StringLiteral "Tabs and spaces" -->
<!-- EXPECT: NewLineTrivia "\\n" -->
<!-- EXPECT: WhitespaceTrivia "  " flags=IsAtLineStart|PrecedingLineBreak -->
<!-- EXPECT: StringLiteral "Mixed whitespace" -->
<!-- EXPECT: EndOfFileToken "" -->
<!-- /TEST -->
`;
      
      testAnnotated(complexTest);
    });
    
    test('should handle edge cases', () => {
      const edgeCaseTest = `
<!-- TEST: Edge cases -->
<!-- EXPECT: EndOfFileToken "" -->
<!-- /TEST -->
`;
      
      testAnnotated(edgeCaseTest);
    });
  });
  
  describe('Error Handling', () => {
    test('should detect missing expectations', () => {
      const invalidTest = `
<!-- TEST: Missing expectation -->
Hello world
<!-- EXPECT: StringLiteral "Hello world" -->
<!-- Note: Missing EOF expectation -->
<!-- /TEST -->
`;
      
      expect(() => testAnnotated(invalidTest)).toThrow();
    });
    
    test('should detect wrong token types', () => {
      const invalidTest = `
<!-- TEST: Wrong token type -->
Hello world
<!-- EXPECT: WhitespaceTrivia "Hello world" -->
<!-- EXPECT: EndOfFileToken "" -->
<!-- /TEST -->
`;
      
      expect(() => testAnnotated(invalidTest)).toThrow();
    });
  });
});

describe('Integration with Existing Tests', () => {
  test('should not conflict with existing scanner tests', () => {
    // This test ensures the new testing infrastructure doesn't break existing functionality
    // by running a simple test that resembles existing scanner2-stage1.test.ts patterns
    
    const scanner = createTestScanner();
    scanner.setText('Hello world');
    scanner.scan();
    
    expect(scanner.token).toBe(SyntaxKind2.StringLiteral);
    expect(scanner.tokenText).toBe('Hello world');
    expect(scanner.tokenFlags & TokenFlags2.IsAtLineStart).toBeTruthy();
  });
});