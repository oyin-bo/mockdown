/**
 * Scanner2 Testing Infrastructure
 * 
 * Provides utilities for testing Scanner2 with annotated markdown format.
 * This allows writing tests with position markers and token expectations.
 */

import { createScanner2 } from '../scanner2.js';
import { SyntaxKind2, TokenFlags2 } from '../scanner2-token-types.js';

/**
 * Position marker in annotated test format
 */
interface PositionMarker {
  /** The marker identifier (1-9, A-Z) */
  id: string;
  /** Absolute position in the clean markdown text */
  position: number;
}

/**
 * Token expectation for testing
 */
interface TokenExpectation {
  /** The position marker this expectation is for */
  markerId: string;
  /** Expected token kind name */
  tokenKind: string;
  /** Optional attributes to check */
  attributes?: Record<string, any>;
  /** Line number in the original annotated text */
  lineNumber: number;
}

/**
 * Parsed annotated test format
 */
interface ParsedAnnotatedTest {
  /** The clean markdown text (without position markers and expectations) */
  cleanMarkdown: string;
  /** Position markers found in the text */
  positionMarkers: PositionMarker[];
  /** Token expectations to validate */
  expectations: TokenExpectation[];
  /** Original lines for error injection */
  originalLines: string[];
}

/**
 * Parse annotated markdown test format
 */
function parseAnnotatedTest(annotatedText: string): ParsedAnnotatedTest {
  const lines = annotatedText.split('\n');
  const cleanLines: string[] = [];
  const positionMarkers: PositionMarker[] = [];
  const expectations: TokenExpectation[] = [];
  const originalLines = [...lines];
  
  let i = 0;
  
  while (i < lines.length) {
    const line = lines[i];
    
    // Check if this is a position-reference line (digits 1-9, letters A-Z)
    const positionLineMatch = line.match(/^([1-9A-Z\s]+)$/);
    if (positionLineMatch && i > 0) {
      // This is a position marker line - extract markers
      const markers = positionLineMatch[1].split('').filter(c => c.trim() && /[1-9A-Z]/.test(c));
      
      // Find the last markdown line that these markers refer to
      let lastMarkdownLineIndex = -1;
      for (let j = cleanLines.length - 1; j >= 0; j--) {
        lastMarkdownLineIndex = j;
        break;
      }
      
      if (lastMarkdownLineIndex >= 0) {
        const referenceLine = cleanLines[lastMarkdownLineIndex];
        
        // Calculate absolute position in clean markdown up to the start of the reference line
        let basePosition = 0;
        for (let j = 0; j < lastMarkdownLineIndex; j++) {
          basePosition += cleanLines[j].length + 1; // +1 for newline
        }
        
        // Map each marker to its position in the reference line
        markers.forEach(markerId => {
          const markerIndex = positionLineMatch[1].indexOf(markerId);
          if (markerIndex >= 0) {
            // Position is relative to the reference line
            let absolutePosition = basePosition + markerIndex;
            
            positionMarkers.push({
              id: markerId,
              position: absolutePosition
            });
          }
        });
      }
      
      // Skip this line in clean output
      i++;
      continue;
    }
    
    // Check if this is an expectation line (@1, @2, etc.)
    const expectationMatch = line.match(/^@([1-9A-Z])\s+(\w+)(.*)$/);
    if (expectationMatch) {
      const [, markerId, tokenKind, attributesStr] = expectationMatch;
      const attributes: Record<string, any> = {};
      
      // Parse attributes if present
      if (attributesStr.trim()) {
        const attrMatches = attributesStr.matchAll(/(\w+):\s*(.+?)(?=\s+\w+:|$)/g);
        for (const match of attrMatches) {
          const [, key, valueStr] = match;
          try {
            attributes[key] = JSON.parse(valueStr.trim());
          } catch {
            // If JSON parsing fails, treat as string
            attributes[key] = valueStr.trim();
          }
        }
      }
      
      expectations.push({
        markerId,
        tokenKind,
        attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
        lineNumber: i
      });
      
      // Skip this line in clean output
      i++;
      continue;
    }
    
    // Regular markdown line - add to clean output
    cleanLines.push(line);
    i++;
  }
  
  return {
    cleanMarkdown: cleanLines.join('\n'),
    positionMarkers,
    expectations,
    originalLines
  };
}

/**
 * Get all tokens from scanner at specified positions
 */
function getTokensAtPositions(markdownText: string, positions: PositionMarker[]): Map<string, {token: SyntaxKind2, text: string, flags: TokenFlags2, offset: number}> {
  const scanner = createScanner2();
  scanner.initText(markdownText);
  
  const tokenMap = new Map<string, {token: SyntaxKind2, text: string, flags: TokenFlags2, offset: number}>();
  const sortedPositions = [...positions].sort((a, b) => a.position - b.position);
  
  let positionIndex = 0;
  
  // Scan through all tokens
  while (scanner.token !== SyntaxKind2.EndOfFileToken && positionIndex < sortedPositions.length) {
    scanner.scan();
    
    if (scanner.token === SyntaxKind2.EndOfFileToken) break;
    
    const tokenStart = scanner.offsetNext - scanner.tokenText.length;
    const tokenEnd = scanner.offsetNext;
    
    // Check if any position markers fall within this token
    while (positionIndex < sortedPositions.length) {
      const marker = sortedPositions[positionIndex];
      if (marker.position >= tokenStart && marker.position < tokenEnd) {
        tokenMap.set(marker.id, {
          token: scanner.token,
          text: scanner.tokenText,
          flags: scanner.tokenFlags,
          offset: tokenStart
        });
        positionIndex++;
      } else if (marker.position >= tokenEnd) {
        break; // This marker is in a future token
      } else {
        // This marker is before current token (shouldn't happen with sorted positions)
        positionIndex++;
      }
    }
  }
  
  return tokenMap;
}

/**
 * Convert SyntaxKind2 enum value to string name
 */
function syntaxKindToString(kind: SyntaxKind2): string {
  switch (kind) {
    case SyntaxKind2.Unknown: return 'Unknown';
    case SyntaxKind2.EndOfFileToken: return 'EndOfFileToken';
    case SyntaxKind2.StringLiteral: return 'StringLiteral';
    case SyntaxKind2.WhitespaceTrivia: return 'WhitespaceTrivia';
    case SyntaxKind2.NewLineTrivia: return 'NewLineTrivia';
    case SyntaxKind2.AsteriskToken: return 'AsteriskToken';
    case SyntaxKind2.AsteriskAsterisk: return 'AsteriskAsterisk';
    case SyntaxKind2.UnderscoreToken: return 'UnderscoreToken';
    case SyntaxKind2.UnderscoreUnderscore: return 'UnderscoreUnderscore';
    case SyntaxKind2.BacktickToken: return 'BacktickToken';
    case SyntaxKind2.TildeTilde: return 'TildeTilde';
    // Stage 4: HTML and entities
    case SyntaxKind2.HtmlEntity: return 'HtmlEntity';
    case SyntaxKind2.LessThanToken: return 'LessThanToken';
    case SyntaxKind2.GreaterThanToken: return 'GreaterThanToken';
    case SyntaxKind2.LessThanSlashToken: return 'LessThanSlashToken';
    case SyntaxKind2.SlashGreaterThanToken: return 'SlashGreaterThanToken';
    case SyntaxKind2.HtmlText: return 'HtmlText';
    case SyntaxKind2.HtmlComment: return 'HtmlComment';
    case SyntaxKind2.AmpersandToken: return 'AmpersandToken';
    default: return `SyntaxKind2(${kind})`;
  }
}

/**
 * Verify tokens against annotated test format
 * 
 * Takes annotated Markdown text with position markers and expectations.
 * If all expectations match, returns the original string.
 * If any expectations fail, injects error messages below the failed expectations.
 * 
 * @param annotatedText The annotated test format string
 * @returns The original string if successful, or string with injected error messages
 */
export function verifyTokens(annotatedText: string): string {
  try {
    // Strip single leading/trailing newlines for cleaner format
    const normalizedText = annotatedText.replace(/^\n/, '').replace(/\n$/, '');
    
    const parsed = parseAnnotatedTest(normalizedText);
    const actualTokens = getTokensAtPositions(parsed.cleanMarkdown, parsed.positionMarkers);
    
    const modifiedLines = [...parsed.originalLines];
    let lineOffset = 0;
    
    // Check each expectation
    for (const expectation of parsed.expectations) {
      const actualToken = actualTokens.get(expectation.markerId);
      
      if (!actualToken) {
        // No token found at this position
        const errorMsg = `ERROR: No token found at position marked by '${expectation.markerId}'`;
        modifiedLines.splice(expectation.lineNumber + 1 + lineOffset, 0, errorMsg);
        lineOffset++;
        continue;
      }
      
      const actualKindName = syntaxKindToString(actualToken.token);
      
      // Check token kind
      if (actualKindName !== expectation.tokenKind) {
        const errorMsg = `ERROR: Expected '${expectation.tokenKind}' but got '${actualKindName}'`;
        modifiedLines.splice(expectation.lineNumber + 1 + lineOffset, 0, errorMsg);
        lineOffset++;
        continue;
      }
      
      // Check attributes if specified
      if (expectation.attributes) {
        for (const [attrName, expectedValue] of Object.entries(expectation.attributes)) {
          let actualValue: any;
          
          switch (attrName) {
            case 'text':
              actualValue = actualToken.text;
              break;
            case 'flags':
              actualValue = actualToken.flags;
              break;
            case 'offset':
              actualValue = actualToken.offset;
              break;
            default:
              // Unknown attribute
              const errorMsg = `ERROR: Unknown attribute '${attrName}' for token validation`;
              modifiedLines.splice(expectation.lineNumber + 1 + lineOffset, 0, errorMsg);
              lineOffset++;
              continue;
          }
          
          if (JSON.stringify(actualValue) !== JSON.stringify(expectedValue)) {
            const errorMsg = `ERROR: Attribute '${attrName}' expected ${JSON.stringify(expectedValue)} but got ${JSON.stringify(actualValue)}`;
            modifiedLines.splice(expectation.lineNumber + 1 + lineOffset, 0, errorMsg);
            lineOffset++;
          }
        }
      }
    }
    
    // If there are errors, return the modified text
    if (lineOffset > 0) {
      return modifiedLines.join('\n');
    }
    
    // If verification succeeds, always return the original input unchanged
    return annotatedText;
    
  } catch (error) {
    const normalizedText = annotatedText.replace(/^\n/, '').replace(/\n$/, '');
    return normalizedText + '\nERROR: Failed to parse annotated test format: ' + (error as Error).message;
  }
}