/**
 * Stage 2 Testing Infrastructure for Scanner2
 * 
 * Implements annotated text format testing system as described in
 * 13-parser-scanner-shift-plan.md Stage 2 section.
 * 
 * Simplified version that works with exact position specifications.
 * 
 * Usage:
 * ------
 * 
 * The `verifyTokens` function takes annotated text in this format:
 * 
 * ```
 * Markdown content here
 * More markdown content
 * @<position> <TokenKind> [optional attributes]
 * @<position> <TokenKind> [optional attributes]
 * ```
 * 
 * Example:
 * ```
 * Hello World
 * @0 StringLiteral
 * @11 EndOfFileToken
 * ```
 * 
 * The function returns the original string if all assertions pass,
 * or injects error messages if any assertions fail.
 * 
 * Supported attributes:
 * - text: "expected text content"
 * - start: expected start position
 * - end: expected end position
 * - flags: expected token flags
 * 
 * Stage 1 tokens available:
 * - StringLiteral: Text content (normalized, one per line)
 * - WhitespaceTrivia: Leading whitespace at line start
 * - NewLineTrivia: Line breaks (LF, CRLF, CR)
 * - EndOfFileToken: End of input
 * - Unknown: Fallback token type
 */

import { createScanner2, type Scanner2 } from '../scanner2.js';
import { SyntaxKind2, TokenFlags2 } from '../scanner2-token-types.js';

/**
 * Token information for testing
 */
interface TokenInfo {
  kind: SyntaxKind2;
  text: string;
  start: number;
  end: number;
  flags: TokenFlags2;
}

/**
 * Token assertion extracted from test annotation
 */
interface TokenAssertion {
  position: number; // exact character position
  expectedKind: string; // token kind name like 'StringLiteral'
  attributes?: Record<string, unknown>; // optional attributes to check
}

/**
 * Parse a token assertion line starting with @<position>
 */
function parseTokenAssertion(line: string): TokenAssertion | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('@')) {
    return null;
  }
  
  // Extract position and expected kind: @<position> <tokenKind> [attributes]
  const match = trimmed.match(/^@(\d+)\s+(\w+)(?:\s+(.*))?$/);
  if (!match) {
    return null;
  }
  
  const [, posStr, expectedKind, attributesPart] = match;
  const position = parseInt(posStr, 10);
  let attributes: Record<string, unknown> | undefined;
  
  // Parse attributes if present (simple JSON-like format)
  if (attributesPart) {
    try {
      // Simple attribute parsing - for now just support key: value format
      const attrMatches = attributesPart.matchAll(/(\w+):\s*([^,]+)/g);
      attributes = {};
      for (const attrMatch of attrMatches) {
        const [, key, value] = attrMatch;
        try {
          attributes[key] = JSON.parse(value.trim());
        } catch {
          attributes[key] = value.trim();
        }
      }
    } catch {
      // Ignore parsing errors for now
    }
  }
  
  return { position, expectedKind, attributes };
}

/**
 * Convert SyntaxKind2 enum value to string name
 */
function getTokenKindName(kind: SyntaxKind2): string {
  switch (kind) {
    case SyntaxKind2.Unknown: return 'Unknown';
    case SyntaxKind2.EndOfFileToken: return 'EndOfFileToken';
    case SyntaxKind2.StringLiteral: return 'StringLiteral';
    case SyntaxKind2.WhitespaceTrivia: return 'WhitespaceTrivia';
    case SyntaxKind2.NewLineTrivia: return 'NewLineTrivia';
    default: return `Unknown(${kind})`;
  }
}

/**
 * Scan all tokens from the given text
 */
function scanAllTokens(text: string): TokenInfo[] {
  const scanner = createScanner2();
  const tokens: TokenInfo[] = [];
  
  scanner.initText(text);
  
  while (true) {
    const prevOffset = scanner.offsetNext;
    scanner.scan();
    
    const token: TokenInfo = {
      kind: scanner.token,
      text: scanner.tokenText,
      start: prevOffset,
      end: scanner.offsetNext,
      flags: scanner.tokenFlags
    };
    
    tokens.push(token);
    
    if (scanner.token === SyntaxKind2.EndOfFileToken) {
      break;
    }
  }
  
  return tokens;
}

/**
 * Find token at or near the specified position
 */
function findTokenAtPosition(tokens: TokenInfo[], position: number): TokenInfo | null {
  // Find token that starts at this position or contains this position
  for (const token of tokens) {
    if (token.start === position) {
      return token;
    }
    if (position > token.start && position < token.end) {
      return token;
    }
  }
  
  // Special case: EndOfFileToken - it has start === end, look for exact match
  for (const token of tokens) {
    if (token.start === token.end && token.start === position) {
      return token;
    }
  }
  
  return null;
}

/**
 * Main function: verify tokens in annotated test format
 * Returns the original string if all assertions pass,
 * or injects error messages if any assertions fail.
 * 
 * Format: 
 * - Markdown content lines
 * - @<position> <TokenKind> [attributes] - assertions
 */
export function verifyTokens(annotatedText: string): string {
  const lines = annotatedText.split('\n');
  const errors: string[] = [];
  
  // Separate markdown content from test annotations
  const markdownLines: string[] = [];
  const tokenAssertions: TokenAssertion[] = [];
  
  for (const line of lines) {
    if (line.trim().startsWith('@')) {
      // Token assertion
      const assertion = parseTokenAssertion(line);
      if (assertion) {
        tokenAssertions.push(assertion);
      }
    } else {
      // Markdown content
      markdownLines.push(line);
    }
  }
  
  // Reconstruct the markdown text
  const markdownText = markdownLines.join('\n');
  
  // Scan tokens
  const tokens = scanAllTokens(markdownText);
  
  // Verify each assertion
  for (const assertion of tokenAssertions) {
    // Find token at this position
    const token = findTokenAtPosition(tokens, assertion.position);
    if (!token) {
      errors.push(`ERROR: No token found at position ${assertion.position}`);
      continue;
    }
    
    // Check token kind
    const actualKindName = getTokenKindName(token.kind);
    if (actualKindName !== assertion.expectedKind) {
      errors.push(`ERROR: At position ${assertion.position}, expected ${assertion.expectedKind} but got ${actualKindName}`);
      continue;
    }
    
    // Check attributes if specified
    if (assertion.attributes) {
      for (const [key, expectedValue] of Object.entries(assertion.attributes)) {
        let actualValue: unknown;
        
        switch (key) {
          case 'text':
            actualValue = token.text;
            break;
          case 'start':
            actualValue = token.start;
            break;
          case 'end':
            actualValue = token.end;
            break;
          case 'flags':
            actualValue = token.flags;
            break;
          default:
            errors.push(`ERROR: Unknown attribute '${key}' for token at position ${assertion.position}`);
            continue;
        }
        
        if (actualValue !== expectedValue) {
          errors.push(`ERROR: At position ${assertion.position}, expected ${key}: ${JSON.stringify(expectedValue)} but got ${JSON.stringify(actualValue)}`);
        }
      }
    }
  }
  
  // If no errors, return original text
  if (errors.length === 0) {
    return annotatedText;
  }
  
  // Inject errors into the text
  const resultLines = lines.slice();
  let insertOffset = 0;
  
  for (const error of errors) {
    // Insert error after the last token assertion line
    let insertIndex = resultLines.length;
    for (let i = resultLines.length - 1; i >= 0; i--) {
      if (resultLines[i].trim().startsWith('@')) {
        insertIndex = i + 1;
        break;
      }
    }
    
    resultLines.splice(insertIndex + insertOffset, 0, error);
    insertOffset++;
  }
  
  return resultLines.join('\n');
}