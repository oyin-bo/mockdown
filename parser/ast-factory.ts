/**
 * AST Factory Utilities
 * 
 * Helper functions for creating and manipulating AST nodes.
 * Following Phase 1 specification from parser/docs/11-parser-layer.md
 */

import { 
  Node, 
  NodeKind, 
  NodeFlags, 
  Document, 
  InlineTextNode, 
  ParagraphNode, 
  HeadingNode, 
  BlockquoteNode,
  ListNode,
  ListItemNode,
  CodeBlockNode,
  ThematicBreakNode,
  HtmlElementNode, 
  HtmlAttributeNode,
  HtmlCommentNode,
  TableNode,
  TableRowNode,
  TableCellNode,
  MathBlockNode,
  EmphasisNode, 
  StrongNode, 
  InlineCodeNode,
  StrikethroughNode,
  LinkNode,
  ImageNode,
  MathInlineNode,
  InlineHardBreak,
  WhitespaceSeparationNode,
  BlockNode,
  InlineNode
} from './ast-types.js';

/**
 * Creates a new node with the specified kind and position
 */
export function createNode(kind: NodeKind, pos: number, end: number): Node {
  return {
    kind,
    flags: NodeFlags.None,
    pos,
    end
  };
}

/**
 * Starts a new node at the current position (end will be set later)
 */
export function startNode(kind: NodeKind, pos: number): Node {
  return {
    kindFlags: kind,
    pos,
    end: pos
  };
}

/**
 * Finishes a node by setting its end position
 */
export function finishNode<T extends Node>(node: T, end: number): T {
  node.end = end;
  return node;
}

/**
 * Creates a missing node for error recovery
 */
export function createMissingNode(kind: NodeKind, pos: number): Node {
  const node = createNode(kind, pos, pos);
  node.flags = NodeFlags.Missing | NodeFlags.Synthetic;
  return node;
}

/**
 * Sets parent pointers if parent linking is enabled
 */
export function setParent(node: Node, parent: Node | undefined, enableParentLinking: boolean): void {
  if (enableParentLinking && parent) {
    node.parent = parent;
  }
}

/**
 * Utility to set children with optional parent linking
 */
export function setChildren<T extends Node>(
  parent: Node,
  children: T[],
  enableParentLinking: boolean
): void {
  if (enableParentLinking) {
    children.forEach(child => {
      child.parent = parent;
    });
  }
}

/**
 * Utility to add a child with optional parent linking
 */
export function addChild<T extends Node>(
  parent: Node,
  child: T,
  enableParentLinking: boolean
): void {
  if (enableParentLinking) {
    child.parent = parent;
  }
}

/**
 * Validates that a node's position is within bounds
 */
export function validateNodePosition(node: Node, sourceLength: number): boolean {
  return node.pos >= 0 && 
         node.end >= node.pos && 
         node.end <= sourceLength;
}

/**
 * Validates that child positions are within parent bounds
 */
export function validateChildPositions(parent: Node, children: Node[]): boolean {
  return children.every(child => 
    child.pos >= parent.pos && 
    child.end <= parent.end
  );
}

// =============================================================================
// Specific Node Creation Functions
// =============================================================================

/**
 * Creates a document node
 */
export function createDocumentNode(
  pos: number, 
  end: number, 
  children: BlockNode[] = [],
  lineStarts: number[] = []
): Document {
  return {
    ...createNode(NodeKind.Document, pos, end),
    children,
    lineStarts
  };
}

/**
 * Creates a text node
 */
export function createTextNode(pos: number, end: number, text: string): InlineTextNode {
  return {
    ...createNode(NodeKind.InlineText, pos, end),
    text
  };
}

/**
 * Creates a paragraph node
 */
export function createParagraphNode(
  pos: number, 
  end: number, 
  children: InlineNode[] = []
): ParagraphNode {
  return {
    ...createNode(NodeKind.Paragraph, pos, end),
    children
  };
}

/**
 * Creates a heading node
 */
export function createHeadingNode(
  pos: number,
  end: number,
  level: 1 | 2 | 3 | 4 | 5 | 6,
  children: InlineNode[] = []
): HeadingNode {
  return {
    ...createNode(NodeKind.Heading, pos, end),
    level,
    children
  };
}

/**
 * Creates a blockquote node
 */
export function createBlockquoteNode(
  pos: number,
  end: number,
  children: BlockNode[] = []
): BlockquoteNode {
  return {
    ...createNode(NodeKind.Blockquote, pos, end),
    children
  };
}

/**
 * Creates a list node
 */
export function createListNode(
  pos: number,
  end: number,
  ordered: boolean,
  tight: boolean = true,
  start?: number,
  children: ListItemNode[] = []
): ListNode {
  return {
    ...createNode(NodeKind.List, pos, end),
    ordered,
    start,
    tight,
    children
  };
}

/**
 * Creates a list item node
 */
export function createListItemNode(
  pos: number,
  end: number,
  children: BlockNode[] = [],
  taskList?: boolean,
  checked?: boolean
): ListItemNode {
  return {
    ...createNode(NodeKind.ListItem, pos, end),
    taskList,
    checked,
    children
  };
}

/**
 * Creates a code block node
 */
export function createCodeBlockNode(
  pos: number,
  end: number,
  fenced: boolean,
  infoString?: string,
  fenceChar?: string,
  fenceLength?: number
): CodeBlockNode {
  return {
    ...createNode(NodeKind.CodeBlock, pos, end),
    fenced,
    infoString,
    fenceChar,
    fenceLength
  };
}

/**
 * Creates a thematic break node
 */
export function createThematicBreakNode(
  pos: number,
  end: number,
  marker: string,
  count: number
): ThematicBreakNode {
  return {
    ...createNode(NodeKind.ThematicBreak, pos, end),
    marker,
    count
  };
}

/**
 * Creates an HTML element node
 */
export function createHtmlElementNode(
  pos: number,
  end: number,
  tagName: string,
  attributes: AttributeSlice[] = [],
  children: (BlockNode | InlineNode)[] = [],
  selfClosing: boolean = false
): HtmlElementNode {
  return {
    ...createNode(NodeKind.HtmlElement, pos, end),
    tagName,
    attributes,
    children,
    selfClosing
  };
}

/**
 * Creates an HTML comment node
 */
export function createHtmlCommentNode(pos: number, end: number): HtmlCommentNode {
  return {
    ...createNode(NodeKind.HtmlComment, pos, end)
  };
}

/**
 * Creates a table node
 */
export function createTableNode(
  pos: number,
  end: number,
  children: TableRowNode[] = [],
  columnAlignments: ('left' | 'center' | 'right' | null)[] = []
): TableNode {
  return {
    ...createNode(NodeKind.Table, pos, end),
    children,
    columnAlignments
  };
}

/**
 * Creates a table row node
 */
export function createTableRowNode(
  pos: number,
  end: number,
  children: TableCellNode[] = [],
  header: boolean = false
): TableRowNode {
  return {
    ...createNode(NodeKind.TableRow, pos, end),
    children,
    header
  };
}

/**
 * Creates a table cell node
 */
export function createTableCellNode(
  pos: number,
  end: number,
  children: InlineNode[] = []
): TableCellNode {
  return {
    ...createNode(NodeKind.TableCell, pos, end),
    children
  };
}

/**
 * Creates a math block node
 */
export function createMathBlockNode(pos: number, end: number): MathBlockNode {
  return {
    ...createNode(NodeKind.MathBlock, pos, end)
  };
}

/**
 * Creates an emphasis node
 */
export function createEmphasisNode(
  pos: number,
  end: number,
  marker: string,
  children: InlineNode[] = []
): EmphasisNode {
  return {
    ...createNode(NodeKind.Emphasis, pos, end),
    marker,
    children
  };
}

/**
 * Creates a strong node
 */
export function createStrongNode(
  pos: number,
  end: number,
  marker: string,
  children: InlineNode[] = []
): StrongNode {
  return {
    ...createNode(NodeKind.Strong, pos, end),
    marker,
    children
  };
}

/**
 * Creates an inline code node
 */
export function createInlineCodeNode(
  pos: number,
  end: number,
  backtickCount: number = 1
): InlineCodeNode {
  return {
    ...createNode(NodeKind.InlineCode, pos, end),
    backtickCount
  };
}

/**
 * Creates a strikethrough node
 */
export function createStrikethroughNode(
  pos: number,
  end: number,
  children: InlineNode[] = []
): StrikethroughNode {
  return {
    ...createNode(NodeKind.Strikethrough, pos, end),
    children
  };
}

/**
 * Creates a link node
 */
export function createLinkNode(
  pos: number,
  end: number,
  destination: string,
  children: InlineNode[] = [],
  title?: string,
  reference?: string
): LinkNode {
  return {
    ...createNode(NodeKind.Link, pos, end),
    destination,
    title,
    reference,
    children
  };
}

/**
 * Creates an image node
 */
export function createImageNode(
  pos: number,
  end: number,
  destination: string,
  altText: string,
  title?: string,
  reference?: string
): ImageNode {
  return {
    ...createNode(NodeKind.Image, pos, end),
    destination,
    altText,
    title,
    reference
  };
}

/**
 * Creates an inline math node
 */
export function createMathInlineNode(pos: number, end: number): MathInlineNode {
  return {
    ...createNode(NodeKind.MathInline, pos, end)
  };
}

/**
 * Creates a break node
 */
export function createBreakNode(pos: number, end: number, hard: boolean = false): BreakNode {
  return {
    ...createNode(NodeKind.Break, pos, end),
    hard
  };
}

/**
 * Creates a whitespace separation node
 */
export function createWhitespaceSeparationNode(
  pos: number,
  end: number,
  count: number = 1
): WhitespaceSeparationNode {
  return {
    ...createNode(NodeKind.WhitespaceSeparation, pos, end),
    count
  };
}