/**
 * Parser Interfaces and Types
 * 
 * Core interfaces for the MixPad parser system.
 * Following Phase 1 specification from parser/docs/11-parser-layer.md
 */

import { Document } from './ast-types.js';

/**
 * Parser configuration options
 */
export interface ParseOptions {
  /** Include parent pointers in nodes (default: false for performance) */
  enableParentLinking?: boolean;
  
  /** Enable position mapping for editor use cases (default: true) */
  enablePositionMapping?: boolean;
  
  /** Enable graceful error recovery (default: true) */
  enableErrorRecovery?: boolean;
  
  /** Maximum heading level (default: 6) */
  maxHeadingLevel?: number;
  
  /** Enable GFM extensions (tables, strikethrough, task lists) */
  gfmExtensions?: boolean;
  
  /** Enable math extensions (inline and block math) */
  mathExtensions?: boolean;
}

/**
 * Diagnostic severity levels
 */
export enum DiagnosticSeverity {
  Error = 'error',
  Warning = 'warning', 
  Info = 'info'
}

/**
 * Diagnostic categories for structured error reporting
 */
export enum DiagnosticCategory {
  Syntax = 'syntax',
  Structure = 'structure', 
  Nesting = 'nesting',
  Attribute = 'attribute',
  Reference = 'reference',
  Whitespace = 'whitespace',
  Encoding = 'encoding'
}

/**
 * Parse error codes for machine-readable diagnostics
 */
export enum ParseErrorCode {
  UNCLOSED_TAG = 'unclosed-tag',
  MISMATCHED_CLOSE = 'mismatched-close',
  INVALID_NESTING = 'invalid-nesting',
  MALFORMED_LINK = 'malformed-link',
  UNRESOLVED_REFERENCE = 'unresolved-reference',
  INVALID_ATTRIBUTE = 'invalid-attribute',
  UNTERMINATED_CODE_FENCE = 'unterminated-code-fence',
  INVALID_TABLE_STRUCTURE = 'invalid-table-structure',
  HEADING_LEVEL_EXCEEDED = 'heading-level-exceeded'
}

/**
 * Parse diagnostic information
 */
export interface ParseDiagnostic {
  /** Diagnostic severity */
  severity: DiagnosticSeverity;
  
  /** Diagnostic category */
  category: DiagnosticCategory;
  
  /** Machine-readable error code */
  code: ParseErrorCode;
  
  /** Human-readable message */
  message: string;
  
  /** Subject of the diagnostic (e.g., element name) */
  subject?: string;
  
  /** Start position in source */
  pos: number;
  
  /** End position in source */
  end: number;
  
  /** Additional context information */
  context?: Record<string, any>;
}

/**
 * Text change for incremental parsing
 */
export interface TextChange {
  /** Absolute byte offset where change starts */
  start: number;
  
  /** Number of bytes to delete */
  deleteLength: number;
  
  /** Text to insert */
  insertText: string;
}

/**
 * Statistics for incremental parsing performance
 */
export interface ReuseStatistics {
  /** Number of nodes reused from previous parse */
  nodesReused: number;
  
  /** Number of nodes that needed reparsing */
  nodesReparsed: number;
  
  /** Bytes reused from previous parse */
  bytesReused: number;
  
  /** Total bytes in document */
  totalBytes: number;
  
  /** Reuse percentage (bytesReused / totalBytes) */
  reusePercentage: number;
}

/**
 * Result of a parse operation
 */
export interface ParseResult {
  /** Root document node */
  document: Document;
  
  /** Parse diagnostics (errors, warnings, info) */
  diagnostics: ParseDiagnostic[];
  
  /** Parse time in milliseconds */
  parseTime: number;
  
  /** Incremental parsing statistics (if applicable) */
  reuseStats?: ReuseStatistics;
  
  /** Source text that was parsed */
  sourceText: string;
}

/**
 * Main parser interface
 */
export interface Parser {
  /**
   * Parse a complete document from text
   */
  parseDocument(text: string, options?: ParseOptions): ParseResult;
  
  /**
   * Parse incrementally by applying changes to existing document
   */
  parseIncremental(
    document: Document, 
    changes: TextChange[], 
    sourceText: string,
    options?: ParseOptions
  ): ParseResult;
}

/**
 * Parser creation options
 */
export interface ParserOptions {
  /** Default parse options for all operations */
  defaultParseOptions?: ParseOptions;
  
  /** Enable performance monitoring */
  enableProfiling?: boolean;
  
  /** Maximum document size to parse (default: 10MB) */
  maxDocumentSize?: number;
}



/**
 * Position mapping utilities for editor integration
 */
export interface PositionMapper {
  /** Convert byte offset to line/column position */
  offsetToPosition(offset: number): { line: number; column: number };
  
  /** Convert line/column position to byte offset */
  positionToOffset(line: number, column: number): number;
  
  /** Get precomputed line starts array */
  getLineStarts(): number[];
  
  /** Get total number of lines */
  getLineCount(): number;
}



/**
 * Parse mode enumeration
 */
export enum ParseMode {
  /** Top-level document parsing */
  Document = 'document',
  
  /** Block-level constructs */
  Block = 'block',
  
  /** Inline constructs within blocks */
  Inline = 'inline',
  
  /** Content inside HTML elements */
  HtmlContent = 'html-content'
}