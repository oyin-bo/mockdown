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
  HtmlAttribute,
  HtmlComment,
  Table,
  MathBlock,

  // Inline-level nodes  
  InlineText,
  Emphasis,
  Strong,
  InlineCode,
  Strikethrough,
  Link,
  Image,
  MathInline,
  InlineHardBreak,

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
 */
export interface Node {
  kind: NodeKind;        // Node type identifier
  flags: NodeFlags;      // Node flags for metadata
  pos: number;           // Absolute byte offset start
  end: number;           // Absolute byte offset end
  parent?: Node;         // Optional parent linking (gated by option)
}





// =============================================================================
// Specific Node Interfaces
// =============================================================================

/**
 * Document root node
 */
export interface Document extends Node {
  children: BlockNode[];
  lineStarts: number[];           // Precomputed line starts for position mapping
}

/**
 * Inline text content node
 */
export interface InlineTextNode extends Node {
  text: string;                   // Text content materialized from scanner tokens
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
  language?: string;            // Language info for fenced blocks
  text: string;                 // Code content
}

/**
 * Thematic break node (---, ***, ___)
 */
export interface ThematicBreakNode extends Node {
  // Visual representation handled via pos/end scanning
}

/**
 * HTML element node
 */
export interface HtmlElementNode extends Node {
  tagName: string;
  attributes: HtmlAttributeNode[];
  children: (BlockNode | InlineNode)[];
  selfClosing: boolean;
}

/**
 * HTML attribute node
 */
export interface HtmlAttributeNode extends Node {
  name: string;
  value?: string;
}

/**
 * HTML comment node
 */
export interface HtmlCommentNode extends Node {
  text: string;                 // Comment content
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
  text: string;                 // Math content
}

/**
 * Emphasis node (* or _)
 */
export interface EmphasisNode extends Node {
  children: InlineNode[];
}

/**
 * Strong node (** or __)
 */
export interface StrongNode extends Node {
  children: InlineNode[];
}

/**
 * Inline code node
 */
export interface InlineCodeNode extends Node {
  text: string;                 // Code content
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
  text: string;                 // Math content
}

/**
 * Hard line break node (<br/> semantics)
 */
export interface InlineHardBreak extends Node {
  // Represents hard line breaks in inline content
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
  | InlineTextNode 
  | EmphasisNode 
  | StrongNode 
  | InlineCodeNode 
  | StrikethroughNode 
  | LinkNode 
  | ImageNode 
  | MathInlineNode
  | InlineHardBreak 
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
export type AnyNode = Document | BlockNode | InlineNode | TableCellNode | HtmlAttributeNode;