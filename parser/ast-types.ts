/**
 * AST Node Types for Markdown Parser
 * Unified node hierarchy with consistent pos/end positioning
 */

export enum NodeKind {
  Document,
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
  Text,
  Emphasis,
  Strong,
  InlineCode,
  Link,
  Image,
  MathInline,
  Break,
  WhitespaceSeparation,
}

export enum NodeFlags {
  None = 0,
  ContainsError = 1 << 0,
  Synthetic = 1 << 1,
  Missing = 1 << 2,
  SelfClosing = 1 << 3,
}

export interface Node {
  kindFlags: number;  // packed: kind + flags
  pos: number;        // Absolute byte offset start
  end: number;        // Absolute byte offset end
  parent?: Node;      // Optional parent linking
}

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

export enum QuoteKind { None, Single, Double }

export interface AttributeSlice {
  nameStart: number;
  nameEnd: number;
  valueStart?: number;
  valueEnd?: number;
  quoted?: QuoteKind;
}

export interface DocumentNode extends Node {
  children: BlockNode[];
  lineStarts: number[];
}

export interface TextNode extends Node {}

export interface ParagraphNode extends Node {
  children: InlineNode[];
}

export interface HeadingNode extends Node {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children: InlineNode[];
}

export interface HtmlElementNode extends Node {
  tagName: string;
  attributes: AttributeSlice[];
  children: (BlockNode | InlineNode)[];
  selfClosing: boolean;
}

export interface EmphasisNode extends Node {
  marker: string;
  children: InlineNode[];
}

export interface StrongNode extends Node {
  marker: string;
  children: InlineNode[];
}

export interface WhitespaceSeparationNode extends Node {
  count: number;
}

export type BlockNode = 
  | ParagraphNode | HeadingNode | HtmlElementNode | WhitespaceSeparationNode;

export type InlineNode =
  | TextNode | EmphasisNode | StrongNode | HtmlElementNode;
