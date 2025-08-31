/**
 * AST Factory Utilities
 * Helper functions for creating and manipulating AST nodes
 */

import { 
  Node, 
  NodeKind, 
  NodeFlags, 
  DocumentNode, 
  TextNode, 
  ParagraphNode, 
  HeadingNode, 
  HtmlElementNode, 
  EmphasisNode, 
  StrongNode, 
  WhitespaceSeparationNode,
  AttributeSlice,
  BlockNode,
  InlineNode,
  setNodeFlags as setNodeFlagsHelper
} from './ast-types.js';

/**
 * Creates a new node with the specified kind and position
 */
export function createNode(kind: NodeKind, pos: number, end: number): Node {
  return {
    kindFlags: kind,
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
  setNodeFlags(node, NodeFlags.Missing | NodeFlags.Synthetic);
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
 * Sets node flags
 */
export function setNodeFlags(node: Node, flags: NodeFlags): void {
  setNodeFlagsHelper(node, flags);
}

/**
 * Adds a flag to existing flags
 */
export function addNodeFlag(node: Node, flag: NodeFlags): void {
  const currentFlags = (node.kindFlags >> 8) & 0xFFFFFF;
  node.kindFlags = (node.kindFlags & 0xFF) | ((currentFlags | flag) << 8);
}

// Specific node creation functions

export function createDocumentNode(pos: number, end: number, children: BlockNode[]): DocumentNode {
  return {
    ...createNode(NodeKind.Document, pos, end),
    children,
    lineStarts: []
  };
}

export function createTextNode(pos: number, end: number): TextNode {
  return {
    ...createNode(NodeKind.Text, pos, end)
  };
}

export function createParagraphNode(pos: number, end: number, children: InlineNode[]): ParagraphNode {
  return {
    ...createNode(NodeKind.Paragraph, pos, end),
    children
  };
}

export function createHeadingNode(
  pos: number, 
  end: number, 
  level: 1 | 2 | 3 | 4 | 5 | 6, 
  children: InlineNode[]
): HeadingNode {
  return {
    ...createNode(NodeKind.Heading, pos, end),
    level,
    children
  };
}

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

export function createEmphasisNode(
  pos: number,
  end: number,
  marker: string,
  children: InlineNode[]
): EmphasisNode {
  return {
    ...createNode(NodeKind.Emphasis, pos, end),
    marker,
    children
  };
}

export function createStrongNode(
  pos: number,
  end: number,
  marker: string,
  children: InlineNode[]
): StrongNode {
  return {
    ...createNode(NodeKind.Strong, pos, end),
    marker,
    children
  };
}

export function createWhitespaceSeparationNode(
  pos: number,
  end: number,
  count: number
): WhitespaceSeparationNode {
  return {
    ...createNode(NodeKind.WhitespaceSeparation, pos, end),
    count
  };
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
