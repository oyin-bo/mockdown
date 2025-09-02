/**
 * Stage 2 Testing Infrastructure for Scanner2
 * 
 * Implements annotated text format testing system as described in
 * 13-parser-scanner-shift-plan.md Stage 2 section.
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
 * Position marker mapping from marker character to text position
 */
interface PositionMarker {
  marker: string; // '1', '2', 'A', 'B', etc.
  position: number; // character offset in source text
}

/**
 * Token assertion extracted from test annotation
 */
interface TokenAssertion {
  marker: string; // '1', '2', 'A', 'B', etc.
  expectedKind: string; // token kind name like 'StringLiteral'
  attributes?: Record<string, unknown>; // optional attributes to check
}

/**
 * Parse a single line to extract position markers
 * Position marker lines contain digits 1-9 and letters A-Z marking positions
 */
function parsePositionMarkers(line: string, textLine: string): PositionMarker[] {
  const markers: PositionMarker[] = [];
  const trimmedLine = line.trim();
  
  // Check if this looks like a position marker line (contains only digits/letters and spaces)
  if (!/^[1-9A-Z\s]*$/.test(trimmedLine) || trimmedLine.length === 0) {
    return markers;
  }
  
  // Map each character position in the marker line to position in text line
  // The marker line should align with the text line above it
  for (let i = 0; i < line.length && i < textLine.length; i++) {
    const char = line[i];
    if (char >= '1' && char <= '9' || char >= 'A' && char <= 'Z') {
      markers.push({ marker: char, position: i });
    }
  }
  
  return markers;
}

/**
 * Parse a token assertion line starting with @
 */
function parseTokenAssertion(line: string): TokenAssertion | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('@')) {
    return null;
  }
  
  // Extract marker and expected kind
  const match = trimmed.match(/^@([1-9A-Z])\s+(\w+)(?:\s+(.*))?$/);
  if (!match) {
    return null;
  }
  
  const [, marker, expectedKind, attributesPart] = match;
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
  
  return { marker, expectedKind, attributes };
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
  // Find token that contains this position
  for (const token of tokens) {
    if (position >= token.start && position < token.end) {
      return token;
    }
  }
  
  // If no exact match, find the closest token
  let closest: TokenInfo | null = null;
  let minDistance = Infinity;
  
  for (const token of tokens) {
    const distance = Math.min(
      Math.abs(position - token.start),
      Math.abs(position - token.end)
    );
    if (distance < minDistance) {
      minDistance = distance;
      closest = token;
    }
  }
  
  return closest;
}

/**
 * Main function: verify tokens in annotated test format
 * Returns the original string if all assertions pass,
 * or injects error messages if any assertions fail.
 */
export function verifyTokens(annotatedText: string): string {
  const lines = annotatedText.split('\n');
  const errors: string[] = [];
  
  // Separate markdown content from test annotations
  const markdownLines: string[] = [];
  const positionMarkers: PositionMarker[] = [];
  const tokenAssertions: TokenAssertion[] = [];
  
  let lastMarkdownLineIndex = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.trim().startsWith('@')) {
      // Token assertion
      const assertion = parseTokenAssertion(line);
      if (assertion) {
        tokenAssertions.push(assertion);
      }
    } else if (i > 0 && /^[1-9A-Z\s]*$/.test(line.trim()) && line.trim().length > 0) {
      // Position marker line - applies to the previous line
      if (lastMarkdownLineIndex >= 0) {
        const prevLineIndex = lastMarkdownLineIndex;
        const markers = parsePositionMarkers(line, markdownLines[prevLineIndex]);
        // Adjust positions to account for all previous lines
        const lineOffset = markdownLines.slice(0, prevLineIndex).join('\n').length + (prevLineIndex > 0 ? 1 : 0);
        for (const marker of markers) {
          positionMarkers.push({ marker: marker.marker, position: marker.position + lineOffset });
        }
      }
    } else if (!line.trim().startsWith('@')) {
      // Markdown content
      markdownLines.push(line);
      lastMarkdownLineIndex = markdownLines.length - 1;
    }
  }
  
  // Reconstruct the markdown text
  const markdownText = markdownLines.join('\n');
  
  // Scan tokens
  const tokens = scanAllTokens(markdownText);
  
  // Verify each assertion
  for (const assertion of tokenAssertions) {
    // Find the position for this marker
    const marker = positionMarkers.find(m => m.marker === assertion.marker);
    if (!marker) {
      errors.push(`ERROR: Position marker '${assertion.marker}' not found`);
      continue;
    }
    
    // Find token at this position
    const token = findTokenAtPosition(tokens, marker.position);
    if (!token) {
      errors.push(`ERROR: No token found at position ${marker.position} (marker '${assertion.marker}')`);
      continue;
    }
    
    // Check token kind
    const actualKindName = getTokenKindName(token.kind);
    if (actualKindName !== assertion.expectedKind) {
      errors.push(`ERROR: At position ${marker.position} (marker '${assertion.marker}'), expected ${assertion.expectedKind} but got ${actualKindName}`);
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
            errors.push(`ERROR: Unknown attribute '${key}' for token at position ${marker.position}`);
            continue;
        }
        
        if (actualValue !== expectedValue) {
          errors.push(`ERROR: At position ${marker.position} (marker '${assertion.marker}'), expected ${key}: ${JSON.stringify(expectedValue)} but got ${JSON.stringify(actualValue)}`);
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