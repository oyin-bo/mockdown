/**
 * Core Parser Implementation - Skeleton for Phase 2
 * 
 * Basic parsing algorithm handling scanner tokens to build AST.
 * This provides the foundation pattern for the next development phase.
 */

import { 
  Parser, 
  ParserOptions, 
  ParseOptions, 
  ParseResult,
  TextChange,
  ParseDiagnostic,
  DiagnosticSeverity,
  DiagnosticCategory,
  ParseErrorCode 
} from './parser-interfaces.js';

import { 
  Document,
  Node,
  NodeKind,
  NodeFlags,
  BlockNode,
  InlineNode,
  InlineTextNode,
  ParagraphNode,
  HeadingNode,
  CodeBlockNode,
  ThematicBreakNode,
  InlineHardBreak,
  HtmlCommentNode
} from './ast-types.js';

import { SyntaxKind, TokenFlags } from './scanner/token-types.js';
import { Scanner } from './scanner/scanner.js';

/**
 * Token structure from scanner
 */
interface Token {
  kind: SyntaxKind;
  flags: TokenFlags;
  pos: number;
  end: number;
  text: string;
}

/**
 * Parser context for state management
 */
interface ParserContext {
  scanner: Scanner;
  tokens: Token[];
  currentIndex: number;
  sourceText: string;
  options: ParseOptions;
  diagnostics: ParseDiagnostic[];
}

/**
 * Core parser implementation class
 */
class CoreParser implements Parser {
  private defaultOptions: ParseOptions;

  constructor(options?: ParserOptions) {
    this.defaultOptions = {
      enableParentLinking: false,
      enablePositionMapping: true,
      enableErrorRecovery: true,
      maxHeadingLevel: 6,
      gfmExtensions: true,
      mathExtensions: false,
      ...options?.defaultParseOptions
    };
  }

  parseDocument(text: string, options?: ParseOptions): ParseResult {
    const startTime = performance.now();
    const parseOptions = { ...this.defaultOptions, ...options };
    
    // Initialize scanner and context
    const scanner = new Scanner(text);
    const tokens = this.scanAllTokens(scanner, text);
    const context: ParserContext = {
      scanner,
      tokens,
      currentIndex: 0,
      sourceText: text,
      options: parseOptions,
      diagnostics: []
    };

    // Parse document
    const document = this.parseDocumentRoot(context);
    
    const parseTime = performance.now() - startTime;
    
    return {
      document,
      diagnostics: context.diagnostics,
      parseTime,
      sourceText: text
    };
  }

  parseIncremental(
    document: Document, 
    changes: TextChange[], 
    sourceText: string,
    options?: ParseOptions
  ): ParseResult {
    // For skeleton implementation, just reparse the entire document
    // Real incremental parsing would be implemented in Phase 2
    return this.parseDocument(sourceText, options);
  }

  /**
   * Scan all tokens from the source text
   */
  private scanAllTokens(scanner: Scanner, text: string): Token[] {
    const tokens: Token[] = [];
    
    while (true) {
      const token = scanner.scan();
      
      if (token.kind === SyntaxKind.EndOfFileToken) {
        tokens.push({
          kind: token.kind,
          flags: token.flags,
          pos: token.pos,
          end: token.end,
          text: ''
        });
        break;
      }
      
      tokens.push({
        kind: token.kind,
        flags: token.flags,
        pos: token.pos,
        end: token.end,
        text: text.slice(token.pos, token.end)
      });
    }
    
    return tokens;
  }

  /**
   * Parse the document root
   */
  private parseDocumentRoot(context: ParserContext): Document {
    const children: BlockNode[] = [];
    const lineStarts = this.computeLineStarts(context.sourceText);
    
    // Parse blocks until end of file
    while (context.currentIndex < context.tokens.length - 1) {
      const block = this.parseBlockElement(context);
      if (block) {
        children.push(block);
      } else {
        // Skip unknown tokens to avoid infinite loop
        context.currentIndex++;
      }
    }
    
    const document: Document = {
      kind: NodeKind.Document,
      flags: NodeFlags.None,
      pos: 0,
      end: context.sourceText.length,
      children,
      lineStarts
    };
    
    return document;
  }

  /**
   * Parse a block-level element
   */
  private parseBlockElement(context: ParserContext): BlockNode | null {
    const token = this.currentToken(context);
    if (!token) return null;
    
    switch (token.kind) {
      case SyntaxKind.HashToken:
        return this.parseHeading(context);
      
      case SyntaxKind.CodeFence:
        return this.parseCodeBlock(context);
      
      case SyntaxKind.ThematicBreak:
        return this.parseThematicBreak(context);
      
      case SyntaxKind.HtmlComment:
        return this.parseHtmlComment(context);
      
      case SyntaxKind.StringLiteral:
        return this.parseParagraph(context);
      
      default:
        // Skip unhandled tokens
        context.currentIndex++;
        return null;
    }
  }

  /**
   * Parse heading (ATX style)
   */
  private parseHeading(context: ParserContext): HeadingNode {
    const hashToken = this.currentToken(context)!;
    const level = Math.min(hashToken.text.length, context.options.maxHeadingLevel || 6) as 1 | 2 | 3 | 4 | 5 | 6;
    
    context.currentIndex++; // consume hash token
    
    const children = this.parseInlineContent(context, SyntaxKind.NewLineTrivia);
    
    return {
      kind: NodeKind.Heading,
      flags: NodeFlags.None,
      pos: hashToken.pos,
      end: this.getLastTokenEnd(context),
      level,
      children
    };
  }

  /**
   * Parse code block
   */
  private parseCodeBlock(context: ParserContext): CodeBlockNode {
    const fenceToken = this.currentToken(context)!;
    context.currentIndex++; // consume fence token
    
    // Look for language info (next string token)
    let language: string | undefined;
    const nextToken = this.currentToken(context);
    if (nextToken && nextToken.kind === SyntaxKind.StringLiteral) {
      language = nextToken.text.trim();
      context.currentIndex++;
    }
    
    // Collect content until closing fence or EOF
    let text = '';
    while (context.currentIndex < context.tokens.length) {
      const token = this.currentToken(context);
      if (!token) break;
      
      if (token.kind === SyntaxKind.CodeFence) {
        context.currentIndex++; // consume closing fence
        break;
      }
      
      text += token.text;
      context.currentIndex++;
    }
    
    return {
      kind: NodeKind.CodeBlock,
      flags: NodeFlags.None,
      pos: fenceToken.pos,
      end: this.getLastTokenEnd(context),
      fenced: true,
      language,
      text: text.trim()
    };
  }

  /**
   * Parse thematic break
   */
  private parseThematicBreak(context: ParserContext): ThematicBreakNode {
    const token = this.currentToken(context)!;
    context.currentIndex++;
    
    return {
      kind: NodeKind.ThematicBreak,
      flags: NodeFlags.None,
      pos: token.pos,
      end: token.end
    };
  }

  /**
   * Parse HTML comment
   */
  private parseHtmlComment(context: ParserContext): HtmlCommentNode {
    const token = this.currentToken(context)!;
    context.currentIndex++;
    
    // Extract comment content (remove <!-- and -->)
    let text = token.text;
    if (text.startsWith('<!--') && text.endsWith('-->')) {
      text = text.slice(4, -3);
    }
    
    return {
      kind: NodeKind.HtmlComment,
      flags: NodeFlags.None,
      pos: token.pos,
      end: token.end,
      text
    };
  }

  /**
   * Parse paragraph
   */
  private parseParagraph(context: ParserContext): ParagraphNode {
    const startPos = this.currentToken(context)!.pos;
    const children = this.parseInlineContent(context, SyntaxKind.NewLineTrivia);
    
    return {
      kind: NodeKind.Paragraph,
      flags: NodeFlags.None,
      pos: startPos,
      end: this.getLastTokenEnd(context),
      children
    };
  }

  /**
   * Parse inline content until stopping token
   */
  private parseInlineContent(context: ParserContext, stopAt?: SyntaxKind): InlineNode[] {
    const children: InlineNode[] = [];
    
    while (context.currentIndex < context.tokens.length) {
      const token = this.currentToken(context);
      if (!token || token.kind === SyntaxKind.EndOfFileToken) break;
      if (stopAt && token.kind === stopAt) break;
      
      const inlineNode = this.parseInlineElement(context);
      if (inlineNode) {
        children.push(inlineNode);
      } else {
        // Skip unknown tokens
        context.currentIndex++;
      }
    }
    
    return children;
  }

  /**
   * Parse inline element
   */
  private parseInlineElement(context: ParserContext): InlineNode | null {
    const token = this.currentToken(context);
    if (!token) return null;
    
    switch (token.kind) {
      case SyntaxKind.StringLiteral:
        return this.parseInlineText(context);
      
      case SyntaxKind.HardLineBreak:
        return this.parseHardLineBreak(context);
      
      default:
        // For now, convert unhandled tokens to text
        context.currentIndex++;
        return {
          kind: NodeKind.InlineText,
          flags: NodeFlags.None,
          pos: token.pos,
          end: token.end,
          text: token.text
        };
    }
  }

  /**
   * Parse inline text
   */
  private parseInlineText(context: ParserContext): InlineTextNode {
    const token = this.currentToken(context)!;
    context.currentIndex++;
    
    return {
      kind: NodeKind.InlineText,
      flags: NodeFlags.None,
      pos: token.pos,
      end: token.end,
      text: token.text
    };
  }

  /**
   * Parse hard line break
   */
  private parseHardLineBreak(context: ParserContext): InlineHardBreak {
    const token = this.currentToken(context)!;
    context.currentIndex++;
    
    return {
      kind: NodeKind.InlineHardBreak,
      flags: NodeFlags.None,
      pos: token.pos,
      end: token.end
    };
  }

  /**
   * Get current token
   */
  private currentToken(context: ParserContext): Token | null {
    return context.tokens[context.currentIndex] || null;
  }

  /**
   * Get the end position of the last processed token
   */
  private getLastTokenEnd(context: ParserContext): number {
    const lastIndex = Math.max(0, context.currentIndex - 1);
    return context.tokens[lastIndex]?.end || 0;
  }

  /**
   * Compute line starts for position mapping
   */
  private computeLineStarts(text: string): number[] {
    const lineStarts = [0];
    
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '\n') {
        lineStarts.push(i + 1);
      }
    }
    
    return lineStarts;
  }
}

/**
 * Parser factory function
 */
export function createParser(options?: ParserOptions): Parser {
  return new CoreParser(options);
}