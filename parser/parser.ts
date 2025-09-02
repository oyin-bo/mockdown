/**
 * Core Parser Implementation
 * Recursive descent parser for Markdown with native HTML support
 */

import { Scanner, createScanner } from './scanner.js';
import { SyntaxKind, TokenFlags, TokenFlagRunLengthMask, TokenFlagRunLengthShift } from './token-types.js';
import { 
  Node, 
  NodeKind, 
  NodeFlags,
  DocumentNode, 
  BlockNode, 
  InlineNode,
  ParagraphNode,
  HeadingNode,
  TextNode,
  EmphasisNode,
  StrongNode,
  InlineCodeNode,
  StrikethroughNode,
  HtmlElementNode,
  WhitespaceSeparationNode,
  getNodeKind
} from './ast-types.js';
import {
  createDocumentNode,
  createParagraphNode,
  createHeadingNode,
  createTextNode,
  createHtmlElementNode,
  createEmphasisNode,
  createStrongNode,
  createInlineCodeNode,
  createStrikethroughNode,
  createWhitespaceSeparationNode,
  finishNode,
  setChildren,
  createMissingNode
} from './ast-factory.js';
import {
  skipTrivia,
  parseExpected,
  parseOptional,
  tryParse,
  isAtLineStart,
  isBlankLine,
  isListMarkerAhead,
  isThematicBreakAhead,
  isSetextUnderlineAhead,
  recoverToSafeBoundary
} from './parser-utils.js';

// Parser interfaces
export interface ParseOptions {
  parentLinking?: boolean;          // Include parent pointers in nodes
  errorRecovery?: boolean;          // Enable permissive error recovery
}

export interface ParseDiagnostic {
  code: ParseErrorCode;
  category: DiagnosticCategory;
  subject: string;
  pos: number;
  end: number;
  message?: string;
}

export const enum DiagnosticCategory {
  Syntax,
  Structure,
  Nesting,
  Attribute,
  Reference,
  Whitespace,
  Encoding
}

export const enum ParseErrorCode {
  UNCLOSED_TAG,
  MISMATCHED_CLOSE,
  INVALID_NESTING,
  MALFORMED_LINK,
  UNRESOLVED_REFERENCE,
  INVALID_ATTRIBUTE,
  UNTERMINATED_CODE_FENCE
}

export interface ParseResult {
  ast: DocumentNode;
  diagnostics: ParseDiagnostic[];
}

export interface Parser {
  parseDocument(source: string, options?: ParseOptions): ParseResult;
}

// Parser context
interface ParseContext {
  scanner: Scanner;
  diagnostics: ParseDiagnostic[];
  options: ParseOptions;
}

const enum ParseMode {
  Document,     // Top-level document parsing
  Block,        // Block-level constructs
  Inline,       // Inline constructs within blocks
  HtmlContent,  // Inside HTML elements (Markdown active)
}

export function createParser(): Parser {
  return {
    parseDocument
  };
}

function parseDocument(source: string, options: ParseOptions = {}): ParseResult {
  const scanner = createScanner();
  scanner.setText(source);
  
  const context: ParseContext = {
    scanner,
    diagnostics: [],
    options: {
      parentLinking: options.parentLinking ?? false,
      errorRecovery: options.errorRecovery ?? true
    }
  };

  const filePos = scanner.getTokenStart();
  scanner.scan(); // Initialize first token

  const children: BlockNode[] = [];
  
  // Parse block-level constructs
  while (scanner.getToken() !== SyntaxKind.EndOfFileToken) {
    const block = parseBlockConstruct(context);
    if (block) {
      children.push(block);
      setChildren(block, [block], context.options.parentLinking ?? false);
    }
  }

  const doc = createDocumentNode(filePos, scanner.getTokenEnd(), children);
  
  // Set line starts for source mapping
  doc.lineStarts = computeLineStarts(source);
  
  return {
    ast: doc,
    diagnostics: context.diagnostics
  };
}

function parseBlockConstruct(context: ParseContext): BlockNode | null {
  const { scanner } = context;
  const token = scanner.getToken();
  const flags = scanner.getTokenFlags();

  // Skip whitespace separation and create nodes for blank lines
  if (isBlankLine(scanner)) {
    return parseWhitespaceSeparation(context);
  }

  // HTML elements
  if (token === SyntaxKind.LessThanToken || token === SyntaxKind.LessThanSlashToken || token === SyntaxKind.HtmlText) {
    return parseHtmlElement(context);
  }

  // ATX headings at line start
  if ((flags & TokenFlags.IsAtLineStart) && token === SyntaxKind.HashToken) {
    return parseAtxHeading(context);
  }

  // Try other block constructs (lists, thematic breaks, etc.)
  if (isAtLineStart(scanner)) {
    if (isListMarkerAhead(scanner)) {
      // TODO: Implement list parsing in phase 4
      return parseParagraph(context);
    }
    
    if (isThematicBreakAhead(scanner)) {
      // TODO: Implement thematic break parsing in phase 4
      return parseParagraph(context);
    }
  }

  // Check for setext heading
  if (isSetextUnderlineAhead(scanner)) {
    return parseSetextHeading(context);
  }

  // Default to paragraph
  return parseParagraph(context);
}

function parseWhitespaceSeparation(context: ParseContext): WhitespaceSeparationNode {
  const { scanner } = context;
  const start = scanner.getTokenStart();
  let count = 0;

  while (isBlankLine(scanner)) {
    count++;
    scanner.scan();
  }

  const end = scanner.getTokenStart();
  return createWhitespaceSeparationNode(start, end, count);
}

function parseAtxHeading(context: ParseContext): HeadingNode {
  const { scanner } = context;
  const start = scanner.getTokenStart();
  
  // Count hash marks to determine level
  const hashText = scanner.getTokenText();
  const level = Math.min(hashText.length, 6) as 1 | 2 | 3 | 4 | 5 | 6;
  
  scanner.scan(); // consume hash token
  
  // Skip optional space after hashes
  if (scanner.getToken() === SyntaxKind.WhitespaceTrivia) {
    scanner.scan();
  }

  // Parse inline content until end of line
  const children = parseInlineContent(context, SyntaxKind.NewLineTrivia);
  
  // Consume newline if present
  if (scanner.getToken() === SyntaxKind.NewLineTrivia) {
    scanner.scan();
  }

  const end = scanner.getTokenStart();
  const heading = createHeadingNode(start, end, level, children);
  
  if (context.options.parentLinking) {
    setChildren(heading, children, true);
  }
  
  return heading;
}

function parseSetextHeading(context: ParseContext): HeadingNode {
  const { scanner } = context;
  const start = scanner.getTokenStart();
  
  // Parse the heading content (current line)
  const children = parseInlineContent(context, SyntaxKind.NewLineTrivia);
  
  // Consume newline
  if (scanner.getToken() === SyntaxKind.NewLineTrivia) {
    scanner.scan();
  }
  
  // Parse underline to determine level
  const underlineToken = scanner.getToken();
  const level: 1 | 2 = underlineToken === SyntaxKind.EqualsToken ? 1 : 2;
  
  // Consume entire underline (may be multiple tokens if scanner splits them)
  while (scanner.getToken() === underlineToken && scanner.getToken() !== SyntaxKind.EndOfFileToken) {
    scanner.scan();
  }
  
  // Consume trailing newline if present
  if (scanner.getToken() === SyntaxKind.NewLineTrivia) {
    scanner.scan();
  }

  const end = scanner.getTokenStart();
  const heading = createHeadingNode(start, end, level, children);
  
  if (context.options.parentLinking) {
    setChildren(heading, children, true);
  }
  
  return heading;
}

function parseParagraph(context: ParseContext): ParagraphNode {
  const { scanner } = context;
  const start = scanner.getTokenStart();
  
  const children = parseInlineContent(context, SyntaxKind.NewLineTrivia);
  
  // Consume trailing newline if present
  if (scanner.getToken() === SyntaxKind.NewLineTrivia) {
    scanner.scan();
  }

  const end = scanner.getTokenStart();
  const paragraph = createParagraphNode(start, end, children);
  
  if (context.options.parentLinking) {
    setChildren(paragraph, children, true);
  }
  
  return paragraph;
}

function parseInlineContent(context: ParseContext, stopToken?: SyntaxKind): InlineNode[] {
  const { scanner } = context;
  const children: InlineNode[] = [];

  while (scanner.getToken() !== SyntaxKind.EndOfFileToken) {
    if (stopToken && scanner.getToken() === stopToken) {
      break;
    }

    const inline = parseInlineConstruct(context);
    if (inline) {
      children.push(inline);
    } else {
      // If we can't parse anything, consume one token as text to avoid infinite loop
      const start = scanner.getTokenStart();
      scanner.scan();
      const end = scanner.getTokenStart();
      children.push(createTextNode(start, end));
    }
  }

  return children;
}

function parseInlineConstruct(context: ParseContext): InlineNode | null {
  const { scanner } = context;
  const token = scanner.getToken();

  // HTML elements
  if (token === SyntaxKind.LessThanToken || token === SyntaxKind.LessThanSlashToken) {
    return parseHtmlElement(context) as InlineNode;
  }

  // Inline code spans
  if (token === SyntaxKind.BacktickToken) {
    return parseInlineCode(context);
  }

  // Strikethrough
  if (token === SyntaxKind.TildeTilde) {
    return parseStrikethrough(context);
  }

  // Emphasis and strong (both single and double markers)
  if (token === SyntaxKind.AsteriskToken || token === SyntaxKind.UnderscoreToken ||
      token === SyntaxKind.AsteriskAsterisk || token === SyntaxKind.UnderscoreUnderscore) {
    return parseEmphasisOrStrong(context);
  }

  // Default: parse as text
  return parseTextRun(context);
}

function parseInlineCode(context: ParseContext): InlineCodeNode | null {
  const { scanner } = context;
  const start = scanner.getTokenStart();
  const flags = scanner.getTokenFlags();
  
  // Extract backtick run length from token flags
  const openRunLength = (flags & TokenFlagRunLengthMask) >> TokenFlagRunLengthShift;
  
  // Get the opening backticks 
  const openText = scanner.getTokenText();
  scanner.scan(); // consume opening backticks
  
  // Find matching closing backticks with same run length
  let codeStart = scanner.getTokenStart();
  let foundClose = false;
  
  while (scanner.getToken() !== SyntaxKind.EndOfFileToken) {
    if (scanner.getToken() === SyntaxKind.BacktickToken) {
      const closeFlags = scanner.getTokenFlags();
      const closeRunLength = (closeFlags & TokenFlagRunLengthMask) >> TokenFlagRunLengthShift;
      
      if (closeRunLength === openRunLength) {
        // Found matching closing backticks
        foundClose = true;
        scanner.scan(); // consume closing backticks
        break;
      }
    }
    scanner.scan();
  }
  
  const end = scanner.getTokenStart();
  
  if (!foundClose) {
    // Unterminated code span - treat opening backticks as literal text
    // Reset scanner to start position and return null to let parseTextRun handle it
    return null;
  }
  
  return createInlineCodeNode(start, end, openRunLength);
}

function parseStrikethrough(context: ParseContext): StrikethroughNode | null {
  const { scanner } = context;
  const start = scanner.getTokenStart();
  
  scanner.scan(); // consume opening ~~
  
  // Parse inline content until closing ~~
  const children = parseInlineContentUntil(context, SyntaxKind.TildeTilde);
  
  // Check if we found closing ~~
  if (scanner.getToken() === SyntaxKind.TildeTilde) {
    scanner.scan(); // consume closing ~~
    const end = scanner.getTokenStart();
    
    const strikethrough = createStrikethroughNode(start, end, children);
    
    if (context.options.parentLinking) {
      setChildren(strikethrough, children, true);
    }
    
    return strikethrough;
  }
  
  // No closing delimiter found - treat as literal text
  return null;
}

function parseEmphasisOrStrong(context: ParseContext): InlineNode | null {
  const { scanner } = context;
  const token = scanner.getToken();
  const flags = scanner.getTokenFlags();
  const start = scanner.getTokenStart();
  
  // Check if this token can open emphasis/strong based on flanking rules
  if (!(flags & TokenFlags.CanOpen)) {
    return null; // Can't open, treat as text
  }
  
  const markerText = scanner.getTokenText();
  scanner.scan(); // consume opening marker
  
  // Determine if this is emphasis (single) or strong (double)
  const isStrong = (token === SyntaxKind.AsteriskAsterisk || token === SyntaxKind.UnderscoreUnderscore);
  const targetToken = token; // Same token type for closing
  
  // Parse inline content until closing marker
  const children = parseInlineContentUntil(context, targetToken);
  
  // Check if we found a proper closing marker
  if (scanner.getToken() === targetToken) {
    const closeFlags = scanner.getTokenFlags();
    if (closeFlags & TokenFlags.CanClose) {
      scanner.scan(); // consume closing marker
      const end = scanner.getTokenStart();
      
      let result: EmphasisNode | StrongNode;
      if (isStrong) {
        result = createStrongNode(start, end, markerText, children);
      } else {
        result = createEmphasisNode(start, end, markerText, children);
      }
      
      if (context.options.parentLinking) {
        setChildren(result, children, true);
      }
      
      return result;
    }
  }
  
  // No proper closing delimiter found - treat as literal text
  return null;
}

function parseInlineContentUntil(context: ParseContext, stopToken: SyntaxKind): InlineNode[] {
  const { scanner } = context;
  const children: InlineNode[] = [];
  
  while (scanner.getToken() !== SyntaxKind.EndOfFileToken && scanner.getToken() !== stopToken) {
    // Avoid parsing nested constructs of the same type to prevent infinite recursion
    if (scanner.getToken() === stopToken) {
      break;
    }
    
    const inline = parseInlineConstruct(context);
    if (inline) {
      children.push(inline);
    } else {
      // If we can't parse anything, consume one token as text to avoid infinite loop
      const start = scanner.getTokenStart();
      scanner.scan();
      const end = scanner.getTokenStart();
      children.push(createTextNode(start, end));
    }
  }
  
  return children;
}

function parseTextRun(context: ParseContext): TextNode {
  const { scanner } = context;
  const start = scanner.getTokenStart();
  
  // Consume tokens until we hit something that needs special parsing
  while (scanner.getToken() !== SyntaxKind.EndOfFileToken &&
         scanner.getToken() !== SyntaxKind.NewLineTrivia &&
         scanner.getToken() !== SyntaxKind.LessThanToken &&
         scanner.getToken() !== SyntaxKind.LessThanSlashToken) {
    scanner.scan();
  }

  const end = scanner.getTokenStart();
  return createTextNode(start, end);
}

function parseHtmlElement(context: ParseContext): HtmlElementNode {
  const { scanner } = context;
  const start = scanner.getTokenStart();
  
  // Handle HtmlText tokens (complete HTML tags)
  if (scanner.getToken() === SyntaxKind.HtmlText) {
    const text = scanner.getTokenText();
    scanner.scan(); // consume the HTML text token
    
    // Extract tag name from the HTML text
    let tagName = '';
    const match = text.match(/^<\/?([a-zA-Z][a-zA-Z0-9]*)/);
    if (match) {
      tagName = match[1];
    }
    
    const end = scanner.getTokenStart();
    return createHtmlElementNode(start, end, tagName, [], [], false);
  }
  
  // Handle opening tags
  if (scanner.getToken() === SyntaxKind.LessThanToken) {
    scanner.scan(); // consume '<'
    
    // Get tag name
    let tagName = '';
    if (scanner.getToken() === SyntaxKind.Identifier) {
      tagName = scanner.getTokenText();
      scanner.scan();
    }
    
    // Skip attributes for now (TODO: implement in phase 3)
    while (scanner.getToken() !== SyntaxKind.GreaterThanToken && 
           scanner.getToken() !== SyntaxKind.SlashGreaterThanToken &&
           scanner.getToken() !== SyntaxKind.EndOfFileToken &&
           scanner.getToken() !== SyntaxKind.NewLineTrivia) {
      scanner.scan();
    }
    
    // Consume closing '>' or '/>'
    if (scanner.getToken() === SyntaxKind.GreaterThanToken || scanner.getToken() === SyntaxKind.SlashGreaterThanToken) {
      scanner.scan();
    }
    
    const end = scanner.getTokenStart();
    return createHtmlElementNode(start, end, tagName, [], [], false);
  }
  
  // Handle closing tags
  if (scanner.getToken() === SyntaxKind.LessThanSlashToken) {
    scanner.scan(); // consume '</'
    
    // Get tag name
    let tagName = '';
    if (scanner.getToken() === SyntaxKind.Identifier) {
      tagName = scanner.getTokenText();
      scanner.scan();
    }
    
    // Skip to closing '>'
    while (scanner.getToken() !== SyntaxKind.GreaterThanToken && 
           scanner.getToken() !== SyntaxKind.EndOfFileToken &&
           scanner.getToken() !== SyntaxKind.NewLineTrivia) {
      scanner.scan();
    }
    
    // Consume '>'
    if (scanner.getToken() === SyntaxKind.GreaterThanToken) {
      scanner.scan();
    }
    
    const end = scanner.getTokenStart();
    // For now, treat closing tags as empty elements (TODO: proper HTML tree in phase 3)
    return createHtmlElementNode(start, end, tagName, [], [], false);
  }
  
  // Fallback: consume at least one token to avoid infinite loop
  scanner.scan();
  const end = scanner.getTokenStart();
  return createHtmlElementNode(start, end, '', [], [], false);
}

function computeLineStarts(source: string): number[] {
  const lineStarts: number[] = [0];
  
  for (let i = 0; i < source.length; i++) {
    const ch = source.charCodeAt(i);
    if (ch === 10 || ch === 13) { // \n or \r
      if (ch === 13 && i + 1 < source.length && source.charCodeAt(i + 1) === 10) {
        i++; // Skip \r\n
      }
      lineStarts.push(i + 1);
    }
  }
  
  return lineStarts;
}

function addDiagnostic(
  context: ParseContext,
  code: ParseErrorCode,
  category: DiagnosticCategory,
  subject: string,
  pos: number,
  end: number,
  message?: string
): void {
  context.diagnostics.push({
    code,
    category,
    subject,
    pos,
    end,
    message
  });
}
