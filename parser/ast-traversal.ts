/**
 * AST Traversal Infrastructure
 * 
 * Visitor pattern and utility functions for walking and querying AST trees.
 * Following Phase 1 specification from parser/docs/11-parser-layer.md
 */

import { 
  Node, 
  NodeKind, 
  DocumentNode,
  BlockNode,
  InlineNode,
  getNodeKind,
  ContainerNode
} from './ast-types.js';

/**
 * Visit result controls traversal flow
 */
export enum VisitResult {
  /** Continue normal traversal (visit children) */
  Continue,
  
  /** Skip children but continue with siblings */
  Skip,
  
  /** Stop traversal entirely */
  Stop
}

/**
 * Base visitor interface with optional methods for each node type
 */
export interface Visitor {
  /** Generic node visitor (called for all nodes if specific visitor not defined) */
  visitNode?(node: Node, parent?: Node): VisitResult;
  
  /** Document node visitor */
  visitDocument?(node: DocumentNode, parent?: Node): VisitResult;
  
  /** Block node visitors */
  visitParagraph?(node: Node, parent?: Node): VisitResult;
  visitHeading?(node: Node, parent?: Node): VisitResult;
  visitBlockquote?(node: Node, parent?: Node): VisitResult;
  visitList?(node: Node, parent?: Node): VisitResult;
  visitListItem?(node: Node, parent?: Node): VisitResult;
  visitCodeBlock?(node: Node, parent?: Node): VisitResult;
  visitThematicBreak?(node: Node, parent?: Node): VisitResult;
  visitTable?(node: Node, parent?: Node): VisitResult;
  visitTableRow?(node: Node, parent?: Node): VisitResult;
  visitTableCell?(node: Node, parent?: Node): VisitResult;
  visitMathBlock?(node: Node, parent?: Node): VisitResult;
  visitWhitespaceSeparation?(node: Node, parent?: Node): VisitResult;
  
  /** Inline node visitors */
  visitText?(node: Node, parent?: Node): VisitResult;
  visitEmphasis?(node: Node, parent?: Node): VisitResult;
  visitStrong?(node: Node, parent?: Node): VisitResult;
  visitInlineCode?(node: Node, parent?: Node): VisitResult;
  visitStrikethrough?(node: Node, parent?: Node): VisitResult;
  visitLink?(node: Node, parent?: Node): VisitResult;
  visitImage?(node: Node, parent?: Node): VisitResult;
  visitMathInline?(node: Node, parent?: Node): VisitResult;
  visitBreak?(node: Node, parent?: Node): VisitResult;
  
  /** HTML node visitors */
  visitHtmlElement?(node: Node, parent?: Node): VisitResult;
  visitHtmlComment?(node: Node, parent?: Node): VisitResult;
}

/**
 * Walk AST tree using visitor pattern (top-down)
 */
export function walkAST(root: Node, visitor: Visitor): void {
  walkASTRecursive(root, visitor, undefined);
}

/**
 * Walk AST tree bottom-up (children first, then parent)
 */
export function walkASTBottomUp(root: Node, visitor: Visitor): void {
  walkASTBottomUpRecursive(root, visitor, undefined);
}

/**
 * Internal recursive walker for top-down traversal
 */
function walkASTRecursive(node: Node, visitor: Visitor, parent?: Node): VisitResult {
  // Call appropriate visitor method
  const result = callVisitorMethod(node, visitor, parent);
  
  if (result === VisitResult.Stop) {
    return VisitResult.Stop;
  }
  
  if (result === VisitResult.Skip) {
    return VisitResult.Continue;
  }
  
  // Visit children if node is a container
  if (hasChildren(node)) {
    const containerNode = node as ContainerNode;
    for (const child of containerNode.children) {
      const childResult = walkASTRecursive(child, visitor, node);
      if (childResult === VisitResult.Stop) {
        return VisitResult.Stop;
      }
    }
  }
  
  return VisitResult.Continue;
}

/**
 * Internal recursive walker for bottom-up traversal  
 */
function walkASTBottomUpRecursive(node: Node, visitor: Visitor, parent?: Node): VisitResult {
  // Visit children first if node is a container
  if (hasChildren(node)) {
    const containerNode = node as ContainerNode;
    for (const child of containerNode.children) {
      const childResult = walkASTBottomUpRecursive(child, visitor, node);
      if (childResult === VisitResult.Stop) {
        return VisitResult.Stop;
      }
    }
  }
  
  // Then call visitor method for this node
  const result = callVisitorMethod(node, visitor, parent);
  return result;
}

/**
 * Call the appropriate visitor method based on node kind
 */
function callVisitorMethod(node: Node, visitor: Visitor, parent?: Node): VisitResult {
  const kind = getNodeKind(node);
  
  switch (kind) {
    case NodeKind.Document:
      return visitor.visitDocument?.(node as DocumentNode, parent) ?? 
             visitor.visitNode?.(node, parent) ?? 
             VisitResult.Continue;
             
    case NodeKind.Paragraph:
      return visitor.visitParagraph?.(node, parent) ?? 
             visitor.visitNode?.(node, parent) ?? 
             VisitResult.Continue;
             
    case NodeKind.Heading:
      return visitor.visitHeading?.(node, parent) ?? 
             visitor.visitNode?.(node, parent) ?? 
             VisitResult.Continue;
             
    case NodeKind.Blockquote:
      return visitor.visitBlockquote?.(node, parent) ?? 
             visitor.visitNode?.(node, parent) ?? 
             VisitResult.Continue;
             
    case NodeKind.List:
      return visitor.visitList?.(node, parent) ?? 
             visitor.visitNode?.(node, parent) ?? 
             VisitResult.Continue;
             
    case NodeKind.ListItem:
      return visitor.visitListItem?.(node, parent) ?? 
             visitor.visitNode?.(node, parent) ?? 
             VisitResult.Continue;
             
    case NodeKind.CodeBlock:
      return visitor.visitCodeBlock?.(node, parent) ?? 
             visitor.visitNode?.(node, parent) ?? 
             VisitResult.Continue;
             
    case NodeKind.ThematicBreak:
      return visitor.visitThematicBreak?.(node, parent) ?? 
             visitor.visitNode?.(node, parent) ?? 
             VisitResult.Continue;
             
    case NodeKind.Table:
      return visitor.visitTable?.(node, parent) ?? 
             visitor.visitNode?.(node, parent) ?? 
             VisitResult.Continue;
             
    case NodeKind.TableRow:
      return visitor.visitTableRow?.(node, parent) ?? 
             visitor.visitNode?.(node, parent) ?? 
             VisitResult.Continue;
             
    case NodeKind.TableCell:
      return visitor.visitTableCell?.(node, parent) ?? 
             visitor.visitNode?.(node, parent) ?? 
             VisitResult.Continue;
             
    case NodeKind.MathBlock:
      return visitor.visitMathBlock?.(node, parent) ?? 
             visitor.visitNode?.(node, parent) ?? 
             VisitResult.Continue;
             
    case NodeKind.WhitespaceSeparation:
      return visitor.visitWhitespaceSeparation?.(node, parent) ?? 
             visitor.visitNode?.(node, parent) ?? 
             VisitResult.Continue;
             
    case NodeKind.Text:
      return visitor.visitText?.(node, parent) ?? 
             visitor.visitNode?.(node, parent) ?? 
             VisitResult.Continue;
             
    case NodeKind.Emphasis:
      return visitor.visitEmphasis?.(node, parent) ?? 
             visitor.visitNode?.(node, parent) ?? 
             VisitResult.Continue;
             
    case NodeKind.Strong:
      return visitor.visitStrong?.(node, parent) ?? 
             visitor.visitNode?.(node, parent) ?? 
             VisitResult.Continue;
             
    case NodeKind.InlineCode:
      return visitor.visitInlineCode?.(node, parent) ?? 
             visitor.visitNode?.(node, parent) ?? 
             VisitResult.Continue;
             
    case NodeKind.Strikethrough:
      return visitor.visitStrikethrough?.(node, parent) ?? 
             visitor.visitNode?.(node, parent) ?? 
             VisitResult.Continue;
             
    case NodeKind.Link:
      return visitor.visitLink?.(node, parent) ?? 
             visitor.visitNode?.(node, parent) ?? 
             VisitResult.Continue;
             
    case NodeKind.Image:
      return visitor.visitImage?.(node, parent) ?? 
             visitor.visitNode?.(node, parent) ?? 
             VisitResult.Continue;
             
    case NodeKind.MathInline:
      return visitor.visitMathInline?.(node, parent) ?? 
             visitor.visitNode?.(node, parent) ?? 
             VisitResult.Continue;
             
    case NodeKind.Break:
      return visitor.visitBreak?.(node, parent) ?? 
             visitor.visitNode?.(node, parent) ?? 
             VisitResult.Continue;
             
    case NodeKind.HtmlElement:
      return visitor.visitHtmlElement?.(node, parent) ?? 
             visitor.visitNode?.(node, parent) ?? 
             VisitResult.Continue;
             
    case NodeKind.HtmlComment:
      return visitor.visitHtmlComment?.(node, parent) ?? 
             visitor.visitNode?.(node, parent) ?? 
             VisitResult.Continue;
             
    default:
      return visitor.visitNode?.(node, parent) ?? VisitResult.Continue;
  }
}

/**
 * Check if a node has children
 */
function hasChildren(node: Node): boolean {
  return 'children' in node && Array.isArray((node as any).children);
}

// =============================================================================
// Position-based Query Functions
// =============================================================================

/**
 * Find the deepest node that contains the given offset
 */
export function findNodeAt(root: Node, offset: number): Node | undefined {
  if (offset < root.pos || offset > root.end) {
    return undefined;
  }
  
  let result: Node = root;
  
  walkAST(root, {
    visitNode(node: Node): VisitResult {
      if (offset >= node.pos && offset <= node.end) {
        result = node;
        return VisitResult.Continue;
      }
      return VisitResult.Skip;
    }
  });
  
  return result;
}

/**
 * Find all nodes that intersect with the given range
 */
export function findNodesInRange(root: Node, start: number, end: number): Node[] {
  const result: Node[] = [];
  
  walkAST(root, {
    visitNode(node: Node): VisitResult {
      // Check if node intersects with range
      if (node.end < start || node.pos > end) {
        return VisitResult.Skip;
      }
      
      result.push(node);
      return VisitResult.Continue;
    }
  });
  
  return result;
}

/**
 * Get the path from root to a specific node
 */
export function getNodePath(root: Node, target: Node): Node[] {
  const path: Node[] = [];
  let found = false;
  
  function findPath(node: Node): boolean {
    path.push(node);
    
    if (node === target) {
      found = true;
      return true;
    }
    
    if (hasChildren(node)) {
      const containerNode = node as ContainerNode;
      for (const child of containerNode.children) {
        if (findPath(child)) {
          return true;
        }
      }
    }
    
    path.pop();
    return false;
  }
  
  findPath(root);
  return found ? path : [];
}

/**
 * Get all ancestor nodes of a target node (excluding the target itself)
 */
export function getAncestors(root: Node, target: Node): Node[] {
  const path = getNodePath(root, target);
  return path.slice(0, -1); // Remove target node itself
}

/**
 * Get the parent node of a target node
 */
export function getParent(root: Node, target: Node): Node | undefined {
  const ancestors = getAncestors(root, target);
  return ancestors.length > 0 ? ancestors[ancestors.length - 1] : undefined;
}

/**
 * Get all descendant nodes of a given node
 */
export function getDescendants(node: Node): Node[] {
  const descendants: Node[] = [];
  
  walkAST(node, {
    visitNode(visitNode: Node): VisitResult {
      if (visitNode !== node) {
        descendants.push(visitNode);
      }
      return VisitResult.Continue;
    }
  });
  
  return descendants;
}

/**
 * Check if one node is an ancestor of another
 */
export function isAncestor(ancestor: Node, descendant: Node): boolean {
  return descendant.pos >= ancestor.pos && descendant.end <= ancestor.end && ancestor !== descendant;
}

/**
 * Check if one node is a descendant of another
 */
export function isDescendant(descendant: Node, ancestor: Node): boolean {
  return isAncestor(ancestor, descendant);
}

/**
 * Get siblings of a node (requires walking from root)
 */
export function getSiblings(root: Node, target: Node): Node[] {
  const parent = getParent(root, target);
  if (!parent || !hasChildren(parent)) {
    return [];
  }
  
  const containerParent = parent as ContainerNode;
  return containerParent.children.filter(child => child !== target);
}

/**
 * Get the next sibling of a node
 */
export function getNextSibling(root: Node, target: Node): Node | undefined {
  const parent = getParent(root, target);
  if (!parent || !hasChildren(parent)) {
    return undefined;
  }
  
  const containerParent = parent as ContainerNode;
  const index = containerParent.children.indexOf(target);
  return index >= 0 && index < containerParent.children.length - 1 
    ? containerParent.children[index + 1] 
    : undefined;
}

/**
 * Get the previous sibling of a node
 */
export function getPreviousSibling(root: Node, target: Node): Node | undefined {
  const parent = getParent(root, target);
  if (!parent || !hasChildren(parent)) {
    return undefined;
  }
  
  const containerParent = parent as ContainerNode;
  const index = containerParent.children.indexOf(target);
  return index > 0 ? containerParent.children[index - 1] : undefined;
}