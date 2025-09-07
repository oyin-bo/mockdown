/**
 * Tests for AST Types and Factory Functions
 * Testing Phase 1 core infrastructure implementation
 */

import { beforeEach, describe, expect, test } from 'vitest';
import {
  NodeKind,
  NodeFlags,
  getNodeKind,
  getNodeFlags,
  setNodeFlags,
  addNodeFlag,
  hasNodeFlag
} from '../ast-types.js';
import {
  createNode,
  startNode,
  finishNode,
  createMissingNode,
  createDocumentNode,
  createTextNode,
  createParagraphNode,
  createHeadingNode,
  validateNodePosition,
  validateChildPositions
} from '../ast-factory.js';

describe('AST Types and Flags', () => {
  test('packed kind+flags system', () => {
    const node = createNode(NodeKind.Paragraph, 0, 10);
    
    // Initial state
    expect(getNodeKind(node)).toBe(NodeKind.Paragraph);
    expect(getNodeFlags(node)).toBe(NodeFlags.None);
    
    // Set flags
    setNodeFlags(node, NodeFlags.Synthetic | NodeFlags.Missing);
    expect(getNodeKind(node)).toBe(NodeKind.Paragraph); // Kind preserved
    expect(getNodeFlags(node)).toBe(NodeFlags.Synthetic | NodeFlags.Missing);
    
    // Add flag
    addNodeFlag(node, NodeFlags.ContainsError);
    expect(getNodeFlags(node)).toBe(NodeFlags.Synthetic | NodeFlags.Missing | NodeFlags.ContainsError);
    
    // Check flag
    expect(hasNodeFlag(node, NodeFlags.Synthetic)).toBe(true);
    expect(hasNodeFlag(node, NodeFlags.CanRollback)).toBe(false);
  });

  test('node creation and positioning', () => {
    const node = createNode(NodeKind.Text, 5, 15);
    
    expect(getNodeKind(node)).toBe(NodeKind.Text);
    expect(node.pos).toBe(5);
    expect(node.end).toBe(15);
    expect(node.parent).toBeUndefined();
  });

  test('start and finish node pattern', () => {
    const node = startNode(NodeKind.Heading, 10);
    expect(node.pos).toBe(10);
    expect(node.end).toBe(10);
    
    finishNode(node, 20);
    expect(node.end).toBe(20);
  });

  test('missing node creation', () => {
    const node = createMissingNode(NodeKind.Text, 5);
    
    expect(getNodeKind(node)).toBe(NodeKind.Text);
    expect(node.pos).toBe(5);
    expect(node.end).toBe(5);
    expect(hasNodeFlag(node, NodeFlags.Missing)).toBe(true);
    expect(hasNodeFlag(node, NodeFlags.Synthetic)).toBe(true);
  });
});

describe('AST Factory Functions', () => {
  test('document node creation', () => {
    const doc = createDocumentNode(0, 100, [], [0, 20, 50]);
    
    expect(getNodeKind(doc)).toBe(NodeKind.Document);
    expect(doc.pos).toBe(0);
    expect(doc.end).toBe(100);
    expect(doc.children).toEqual([]);
    expect(doc.lineStarts).toEqual([0, 20, 50]);
  });

  test('text node creation', () => {
    const text = createTextNode(10, 25);
    
    expect(getNodeKind(text)).toBe(NodeKind.Text);
    expect(text.pos).toBe(10);
    expect(text.end).toBe(25);
  });

  test('paragraph node creation', () => {
    const textChild = createTextNode(5, 15);
    const para = createParagraphNode(0, 20, [textChild]);
    
    expect(getNodeKind(para)).toBe(NodeKind.Paragraph);
    expect(para.children).toHaveLength(1);
    expect(para.children[0]).toBe(textChild);
  });

  test('heading node creation', () => {
    const textChild = createTextNode(2, 10);
    const heading = createHeadingNode(0, 12, 2, [textChild]);
    
    expect(getNodeKind(heading)).toBe(NodeKind.Heading);
    expect(heading.level).toBe(2);
    expect(heading.children).toHaveLength(1);
    expect(heading.children[0]).toBe(textChild);
  });
});

describe('Node Validation', () => {
  test('position validation', () => {
    const validNode = createNode(NodeKind.Text, 10, 20);
    const invalidNode1 = createNode(NodeKind.Text, 20, 10); // end < start
    const invalidNode2 = createNode(NodeKind.Text, -5, 10); // negative start
    const invalidNode3 = createNode(NodeKind.Text, 10, 110); // end > source length
    
    expect(validateNodePosition(validNode, 100)).toBe(true);
    expect(validateNodePosition(invalidNode1, 100)).toBe(false);
    expect(validateNodePosition(invalidNode2, 100)).toBe(false);
    expect(validateNodePosition(invalidNode3, 100)).toBe(false);
  });

  test('child position validation', () => {
    const parent = createNode(NodeKind.Paragraph, 0, 30);
    const validChild1 = createNode(NodeKind.Text, 5, 15);
    const validChild2 = createNode(NodeKind.Text, 15, 25);
    const invalidChild = createNode(NodeKind.Text, 25, 35); // extends beyond parent
    
    expect(validateChildPositions(parent, [validChild1, validChild2])).toBe(true);
    expect(validateChildPositions(parent, [validChild1, invalidChild])).toBe(false);
  });
});

describe('Memory Efficiency', () => {
  test('packed kind+flags reduces memory footprint', () => {
    // Test that kindFlags is a single number field
    const node = createNode(NodeKind.Heading, 0, 10);
    setNodeFlags(node, NodeFlags.Synthetic | NodeFlags.Missing);
    
    // Verify it's packed in single field
    expect(typeof node.kindFlags).toBe('number');
    expect(getNodeKind(node)).toBe(NodeKind.Heading);
    expect(getNodeFlags(node)).toBe(NodeFlags.Synthetic | NodeFlags.Missing);
  });

  test('optional parent linking', () => {
    const node = createNode(NodeKind.Text, 0, 5);
    
    // By default, parent is undefined to save memory
    expect(node.parent).toBeUndefined();
    
    // Can be set when needed
    const parentNode = createNode(NodeKind.Paragraph, 0, 10);
    node.parent = parentNode;
    expect(node.parent).toBe(parentNode);
  });
});