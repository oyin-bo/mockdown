/**
 * Annotated Test Format for Scanner2 Testing Infrastructure
 * 
 * Allows embedding test expectations directly in markdown text using special comments.
 * This enables more readable and maintainable tests for complex markdown parsing scenarios.
 */

import { SyntaxKind2, TokenFlags2 } from '../../scanner2-token-types.js';

/**
 * Represents a single token expectation in an annotated test
 */
export interface TokenExpectation {
  /** Expected token type */
  kind: SyntaxKind2;
  /** Expected token text content */
  text: string;
  /** Expected token flags */
  flags?: TokenFlags2;
  /** Expected position (optional, calculated if not provided) */
  pos?: number;
  /** Expected length (optional, calculated from text if not provided) */
  length?: number;
  /** Human-readable description for test output */
  description?: string;
}

/**
 * Represents a complete annotated test case
 */
export interface AnnotatedTest {
  /** Original markdown input text */
  input: string;
  /** Expected sequence of tokens */
  expected: TokenExpectation[];
  /** Test case name/description */
  name: string;
  /** Optional test configuration */
  config?: {
    /** Whether to test rollback functionality */
    testRollback?: boolean;
    /** Whether to test debug state */
    testDebugState?: boolean;
    /** Whether to run performance measurements */
    testPerformance?: boolean;
  };
}

/**
 * Parse annotated markdown text into test cases
 * 
 * Format:
 * ```markdown
 * <!-- TEST: Test case name -->
 * Hello world
 * <!-- EXPECT: StringLiteral "Hello world" flags=IsAtLineStart -->
 * <!-- EXPECT: EndOfFileToken "" -->
 * <!-- /TEST -->
 * ```
 */
export function parseAnnotatedTest(annotatedMarkdown: string): AnnotatedTest[] {
  const tests: AnnotatedTest[] = [];
  const lines = annotatedMarkdown.split('\n');
  
  let currentTest: Partial<AnnotatedTest> | null = null;
  let inputLines: string[] = [];
  let expectations: TokenExpectation[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Start of test case
    const testMatch = line.match(/^<!--\s*TEST:\s*(.+?)\s*-->$/);
    if (testMatch) {
      if (currentTest) {
        throw new Error(`Nested TEST comment at line ${i + 1}. Close previous test first.`);
      }
      currentTest = {
        name: testMatch[1],
        config: {}
      };
      inputLines = [];
      expectations = [];
      continue;
    }
    
    // End of test case
    if (line === '<!-- /TEST -->') {
      if (!currentTest) {
        throw new Error(`Closing TEST comment at line ${i + 1} without opening TEST.`);
      }
      
      tests.push({
        name: currentTest.name!,
        input: inputLines.join('\n'),
        expected: expectations,
        config: currentTest.config
      });
      
      currentTest = null;
      continue;
    }
    
    // Expectation comment
    const expectMatch = line.match(/^<!--\s*EXPECT:\s*(.+?)\s*-->$/);
    if (expectMatch) {
      if (!currentTest) {
        throw new Error(`EXPECT comment at line ${i + 1} outside of TEST block.`);
      }
      
      // When we hit the first expectation, finalize the input text
      if (expectations.length === 0 && inputLines.length > 0) {
        // Remove any trailing empty lines from input
        while (inputLines.length > 0 && inputLines[inputLines.length - 1].trim() === '') {
          inputLines.pop();
        }
      }
      
      const expectation = parseExpectation(expectMatch[1], i + 1);
      expectations.push(expectation);
      continue;
    }
    
    // Configuration comment
    const configMatch = line.match(/^<!--\s*CONFIG:\s*(.+?)\s*-->$/);
    if (configMatch) {
      if (!currentTest) {
        throw new Error(`CONFIG comment at line ${i + 1} outside of TEST block.`);
      }
      
      parseConfig(configMatch[1], currentTest.config!, i + 1);
      continue;
    }
    
    // Regular content line (if inside test)
    if (currentTest && expectations.length === 0) {
      // Only add to input if we haven't started parsing expectations yet
      inputLines.push(lines[i]); // Keep original line with whitespace
    }
  }
  
  if (currentTest) {
    throw new Error(`Unclosed TEST block. Add <!-- /TEST --> at the end.`);
  }
  
  return tests;
}

/**
 * Parse a single EXPECT directive
 */
function parseExpectation(expectText: string, lineNum: number): TokenExpectation {
  // Format: TokenKind "text content" flags=Flag1|Flag2 pos=123 length=456 desc="description"
  const parts = expectText.split(/\s+/);
  
  if (parts.length === 0) {
    throw new Error(`Empty EXPECT directive at line ${lineNum}`);
  }
  
  // Parse token kind
  const kindName = parts[0];
  const kind = parseTokenKind(kindName, lineNum);
  
  // Parse quoted text content
  const textMatch = expectText.match(/"([^"]*)"/);
  if (!textMatch) {
    throw new Error(`Missing quoted text in EXPECT directive at line ${lineNum}. Use "text content" format.`);
  }
  const text = textMatch[1]
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\')
    .replace(/\\"/g, '"');
  
  const expectation: TokenExpectation = { kind, text };
  
  // Parse optional attributes
  const flagsMatch = expectText.match(/flags=([A-Za-z0-9|]+)/);
  if (flagsMatch) {
    expectation.flags = parseTokenFlags(flagsMatch[1], lineNum);
  }
  
  const posMatch = expectText.match(/pos=(\d+)/);
  if (posMatch) {
    expectation.pos = parseInt(posMatch[1], 10);
  }
  
  const lengthMatch = expectText.match(/length=(\d+)/);
  if (lengthMatch) {
    expectation.length = parseInt(lengthMatch[1], 10);
  }
  
  const descMatch = expectText.match(/desc="([^"]*)"/);
  if (descMatch) {
    expectation.description = descMatch[1];
  }
  
  return expectation;
}

/**
 * Parse token kind name to enum value
 */
function parseTokenKind(kindName: string, lineNum: number): SyntaxKind2 {
  // Handle common aliases
  const aliases: Record<string, SyntaxKind2> = {
    'EOF': SyntaxKind2.EndOfFileToken,
    'String': SyntaxKind2.StringLiteral,
    'Text': SyntaxKind2.StringLiteral,
    'Whitespace': SyntaxKind2.WhitespaceTrivia,
    'NewLine': SyntaxKind2.NewLineTrivia,
    'Unknown': SyntaxKind2.Unknown
  };
  
  if (kindName in aliases) {
    return aliases[kindName];
  }
  
  // Try exact enum name
  if (kindName in SyntaxKind2) {
    return (SyntaxKind2 as any)[kindName];
  }
  
  throw new Error(`Unknown token kind "${kindName}" at line ${lineNum}. Valid kinds: ${Object.keys(SyntaxKind2).filter(k => isNaN(Number(k))).join(', ')}`);
}

/**
 * Parse token flags from pipe-separated list
 */
function parseTokenFlags(flagsText: string, lineNum: number): TokenFlags2 {
  if (flagsText === 'None') {
    return TokenFlags2.None;
  }
  
  const flagNames = flagsText.split('|');
  let flags = TokenFlags2.None;
  
  for (const flagName of flagNames) {
    const trimmed = flagName.trim();
    if (trimmed in TokenFlags2) {
      flags |= (TokenFlags2 as any)[trimmed];
    } else {
      throw new Error(`Unknown token flag "${trimmed}" at line ${lineNum}. Valid flags: ${Object.keys(TokenFlags2).filter(k => isNaN(Number(k))).join(', ')}`);
    }
  }
  
  return flags;
}

/**
 * Parse configuration directive
 */
function parseConfig(configText: string, config: NonNullable<AnnotatedTest['config']>, lineNum: number): void {
  const parts = configText.split(/\s+/);
  
  for (const part of parts) {
    const [key, value] = part.split('=');
    
    switch (key) {
      case 'rollback':
        config.testRollback = value === 'true';
        break;
      case 'debug':
        config.testDebugState = value === 'true';
        break;
      case 'performance':
        config.testPerformance = value === 'true';
        break;
      default:
        throw new Error(`Unknown config option "${key}" at line ${lineNum}`);
    }
  }
}

/**
 * Generate human-readable description of a token expectation
 */
export function describeExpectation(expectation: TokenExpectation): string {
  const kindName = SyntaxKind2[expectation.kind];
  const flagsDesc = expectation.flags ? ` flags=${describeFlagsConcise(expectation.flags)}` : '';
  const posDesc = expectation.pos !== undefined ? ` pos=${expectation.pos}` : '';
  
  return `${kindName} "${expectation.text}"${flagsDesc}${posDesc}`;
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