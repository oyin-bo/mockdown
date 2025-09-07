/**
 * AST Node Types for MixPad Parser
 * 
 * Unified node hierarchy with packed kind+flags for memory efficiency.
 * Following Phase 1 specification from parser/docs/11-parser-layer.md
 */

/**
 * Node kinds - each node type gets a unique identifier
 */
export enum NodeKind {
  // Root node
  Document,

  // Block-level nodes
  Paragraph,
  Heading,
  Blockquote,
  List,
  ListItem,
  CodeBlock,
  ThematicBreak,
  HtmlElement,
  HtmlComment,
  Table,
  MathBlock,

  // Inline-level nodes  
  Text,
  Emphasis,
  Strong,
  InlineCode,
  Strikethrough,
  Link,
  Image,
  MathInline,
  Break,

  // Special nodes
  WhitespaceSeparation,
  
  // Table nodes (for completeness)
  TableRow,
  TableCell,
}

/**
 * Node flags for additional metadata
 */
export enum NodeFlags {
  None = 0,
  ContainsError = 1 << 0,     // Node contains parsing errors
  Synthetic = 1 << 1,         // Node was created for error recovery
  Missing = 1 << 2,           // Node represents missing content
  SelfClosing = 1 << 3,       // HTML element is self-closing
  CanRollback = 1 << 4,       // Node can serve as reparse boundary
  IsIncremental = 1 << 5,     // Node created via incremental parsing
}

/**
 * Base interface for all AST nodes
 * Uses packed kind+flags for memory efficiency
 */
export interface Node {
  kindFlags: number;      // Lower 8 bits: NodeKind, upper 24 bits: NodeFlags
  pos: number;           // Absolute byte offset start
  end: number;           // Absolute byte offset end
  parent?: Node;         // Optional parent linking (gated by option)
}

/**
 * Helper functions for kind/flags manipulation
 */
export function getNodeKind(node: Node): NodeKind {
  return node.kindFlags & 0xFF;
}

export function getNodeFlags(node: Node): NodeFlags {
  return (node.kindFlags >> 8) & 0xFFFFFF;
}

export function setNodeFlags(node: Node, flags: NodeFlags): void {
  node.kindFlags = (node.kindFlags & 0xFF) | (flags << 8);
}

export function addNodeFlag(node: Node, flag: NodeFlags): void {
  const currentFlags = getNodeFlags(node);
  setNodeFlags(node, currentFlags | flag);
}

export function hasNodeFlag(node: Node, flag: NodeFlags): boolean {
  return (getNodeFlags(node) & flag) !== 0;
}

/**
 * Quote types for attribute values
 */
export enum QuoteKind { 
  None, 
  Single, 
  Double 
}

/**
 * Attribute slice for HTML elements
 */
export interface AttributeSlice {
  nameStart: number;
  nameEnd: number;
  valueStart?: number;
  valueEnd?: number;
  quoted?: QuoteKind;
}

// =============================================================================
// Specific Node Interfaces
// =============================================================================

/**
 * Document root node
 */
export interface DocumentNode extends Node {
  children: BlockNode[];
  lineStarts: number[];           // Precomputed line starts for position mapping
}

/**
 * Text content node
 */
export interface TextNode extends Node {
  // Text content is materialized via pos/end slice
}

/**
 * Paragraph node
 */
export interface ParagraphNode extends Node {
  children: InlineNode[];
}

/**
 * Heading node (ATX and Setext)
 */
export interface HeadingNode extends Node {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children: InlineNode[];
}

/**
 * Blockquote node
 */
export interface BlockquoteNode extends Node {
  children: BlockNode[];
}

/**
 * List node (ordered/unordered)
 */
export interface ListNode extends Node {
  ordered: boolean;
  start?: number;               // Start number for ordered lists
  tight: boolean;               // Tight vs loose list semantics
  children: ListItemNode[];
}

/**
 * List item node
 */
export interface ListItemNode extends Node {
  taskList?: boolean;           // Task list item
  checked?: boolean;            // Task list checked state
  children: BlockNode[];
}

/**
 * Code block node (fenced/indented)
 */
export interface CodeBlockNode extends Node {
  fenced: boolean;
  infoString?: string;          // Language info for fenced blocks
  fenceChar?: string;           // ` or ~ for fenced blocks
  fenceLength?: number;         // Fence length for reconstruction
}

/**
 * Thematic break node (---, ***, ___)
 */
export interface ThematicBreakNode extends Node {
  marker: string;               // Character used (-, *, _)
  count: number;                // Number of marker characters
}

/**
 * HTML element node
 */
export interface HtmlElementNode extends Node {
  tagName: string;
  attributes: AttributeSlice[];
  children: (BlockNode | InlineNode)[];
  selfClosing: boolean;
}

/**
 * HTML comment node
 */
export interface HtmlCommentNode extends Node {
  // Comment content via pos/end slice
}

/**
 * Table node (GFM extension)
 */
export interface TableNode extends Node {
  children: TableRowNode[];
  columnAlignments: ('left' | 'center' | 'right' | null)[];
}

/**
 * Table row node
 */
export interface TableRowNode extends Node {
  children: TableCellNode[];
  header: boolean;              // Header row vs data row
}

/**
 * Table cell node
 */
export interface TableCellNode extends Node {
  children: InlineNode[];
}

/**
 * Math block node
 */
export interface MathBlockNode extends Node {
  // Math content via pos/end slice
}

/**
 * Emphasis node (* or _)
 */
export interface EmphasisNode extends Node {
  marker: string;               // * or _
  children: InlineNode[];
}

/**
 * Strong node (** or __)
 */
export interface StrongNode extends Node {
  marker: string;               // ** or __
  children: InlineNode[];
}

/**
 * Inline code node
 */
export interface InlineCodeNode extends Node {
  backtickCount: number;        // Number of backticks for reconstruction
}

/**
 * Strikethrough node (~~)
 */
export interface StrikethroughNode extends Node {
  children: InlineNode[];
}

/**
 * Link node
 */
export interface LinkNode extends Node {
  destination: string;
  title?: string;
  reference?: string;           // For reference-style links
  children: InlineNode[];
}

/**
 * Image node
 */
export interface ImageNode extends Node {
  destination: string;
  title?: string;
  altText: string;
  reference?: string;           // For reference-style images
}

/**
 * Inline math node
 */
export interface MathInlineNode extends Node {
  // Math content via pos/end slice
}

/**
 * Break node (soft/hard line break)
 */
export interface BreakNode extends Node {
  hard: boolean;                // Hard break vs soft break
}

/**
 * Whitespace separation node
 */
export interface WhitespaceSeparationNode extends Node {
  count: number;                // Number of blank lines
}

// =============================================================================
// Type Unions for Category Safety
// =============================================================================

/**
 * Block-level node types
 */
export type BlockNode = 
  | ParagraphNode 
  | HeadingNode 
  | BlockquoteNode
  | ListNode 
  | ListItemNode 
  | CodeBlockNode 
  | ThematicBreakNode
  | HtmlElementNode 
  | HtmlCommentNode
  | TableNode 
  | TableRowNode
  | MathBlockNode
  | WhitespaceSeparationNode;

/**
 * Inline-level node types
 */
export type InlineNode =
  | TextNode 
  | EmphasisNode 
  | StrongNode 
  | InlineCodeNode 
  | StrikethroughNode 
  | LinkNode 
  | ImageNode 
  | MathInlineNode
  | BreakNode 
  | HtmlElementNode;

/**
 * Container nodes that have children
 */
export interface ContainerNode extends Node {
  children: Node[];
}

/**
 * All possible node types
 */
export type AnyNode = DocumentNode | BlockNode | InlineNode | TableCellNode;