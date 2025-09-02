/**
 * AST Factory Utilities
 * Helper functions for creating and manipulating AST nodes
 */
import { NodeKind, NodeFlags, setNodeFlags as setNodeFlagsHelper } from './ast-types.js';
/**
 * Creates a new node with the specified kind and position
 */
export function createNode(kind, pos, end) {
    return {
        kindFlags: kind,
        pos,
        end
    };
}
/**
 * Starts a new node at the current position (end will be set later)
 */
export function startNode(kind, pos) {
    return {
        kindFlags: kind,
        pos,
        end: pos
    };
}
/**
 * Finishes a node by setting its end position
 */
export function finishNode(node, end) {
    node.end = end;
    return node;
}
/**
 * Creates a missing node for error recovery
 */
export function createMissingNode(kind, pos) {
    const node = createNode(kind, pos, pos);
    setNodeFlags(node, NodeFlags.Missing | NodeFlags.Synthetic);
    return node;
}
/**
 * Sets parent pointers if parent linking is enabled
 */
export function setParent(node, parent, enableParentLinking) {
    if (enableParentLinking && parent) {
        node.parent = parent;
    }
}
/**
 * Sets node flags
 */
export function setNodeFlags(node, flags) {
    setNodeFlagsHelper(node, flags);
}
/**
 * Adds a flag to existing flags
 */
export function addNodeFlag(node, flag) {
    const currentFlags = (node.kindFlags >> 8) & 0xFFFFFF;
    node.kindFlags = (node.kindFlags & 0xFF) | ((currentFlags | flag) << 8);
}
// Specific node creation functions
export function createDocumentNode(pos, end, children) {
    return {
        ...createNode(NodeKind.Document, pos, end),
        children,
        lineStarts: []
    };
}
export function createTextNode(pos, end) {
    return {
        ...createNode(NodeKind.Text, pos, end)
    };
}
export function createParagraphNode(pos, end, children) {
    return {
        ...createNode(NodeKind.Paragraph, pos, end),
        children
    };
}
export function createHeadingNode(pos, end, level, children) {
    return {
        ...createNode(NodeKind.Heading, pos, end),
        level,
        children
    };
}
export function createHtmlElementNode(pos, end, tagName, attributes = [], children = [], selfClosing = false) {
    return {
        ...createNode(NodeKind.HtmlElement, pos, end),
        tagName,
        attributes,
        children,
        selfClosing
    };
}
export function createEmphasisNode(pos, end, marker, children) {
    return {
        ...createNode(NodeKind.Emphasis, pos, end),
        marker,
        children
    };
}
export function createStrongNode(pos, end, marker, children) {
    return {
        ...createNode(NodeKind.Strong, pos, end),
        marker,
        children
    };
}
export function createWhitespaceSeparationNode(pos, end, count) {
    return {
        ...createNode(NodeKind.WhitespaceSeparation, pos, end),
        count
    };
}
/**
 * Utility to set children with optional parent linking
 */
export function setChildren(parent, children, enableParentLinking) {
    if (enableParentLinking) {
        children.forEach(child => {
            child.parent = parent;
        });
    }
}
/**
 * Utility to add a child with optional parent linking
 */
export function addChild(parent, child, enableParentLinking) {
    if (enableParentLinking) {
        child.parent = parent;
    }
}
