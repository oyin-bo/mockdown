/**
 * Tests for AST Types and Factory Functions
 * Testing Phase 1 core infrastructure implementation
 */

import { beforeEach, describe, expect, test } from 'vitest';
import {
  NodeKind,
  NodeFlags
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
  test('separate kind and flags system', () => {
    const node = createNode(NodeKind.Paragraph, 0, 10);
    
    // Initial state
    expect(node.kind).toBe(NodeKind.Paragraph);
    expect(node.flags).toBe(NodeFlags.None);
    
    // Set flags
    node.flags = NodeFlags.Synthetic | NodeFlags.Missing;
    expect(node.kind).toBe(NodeKind.Paragraph); // Kind preserved
    expect(node.flags).toBe(NodeFlags.Synthetic | NodeFlags.Missing);
    
    // Add flag
    node.flags |= NodeFlags.ContainsError;
    expect(node.flags).toBe(NodeFlags.Synthetic | NodeFlags.Missing | NodeFlags.ContainsError);
    
    // Check flag
    expect((node.flags & NodeFlags.Synthetic) !== 0).toBe(true);
    expect((node.flags & NodeFlags.CanRollback) !== 0).toBe(false);
  });

  test('node creation and positioning', () => {
    const node = createNode(NodeKind.InlineText, 5, 15);
    
    expect(node.kind).toBe(NodeKind.InlineText);
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
    const node = createMissingNode(NodeKind.InlineText, 5);
    
    expect(node.kind).toBe(NodeKind.InlineText);
    expect(node.pos).toBe(5);
    expect(node.end).toBe(5);
    expect((node.flags & NodeFlags.Missing) !== 0).toBe(true);
    expect((node.flags & NodeFlags.Synthetic) !== 0).toBe(true);
  });
});

describe('AST Factory Functions', () => {
  test('document node creation', () => {
    const doc = createDocumentNode(0, 100, [], [0, 20, 50]);
    
    expect(doc.kind).toBe(NodeKind.Document);
    expect(doc.pos).toBe(0);
    expect(doc.end).toBe(100);
    expect(doc.children).toEqual([]);
    expect(doc.lineStarts).toEqual([0, 20, 50]);
  });

  test('text node creation', () => {
    const text = createTextNode(10, 25, 'sample text');
    
    expect(text.kind).toBe(NodeKind.InlineText);
    expect(text.pos).toBe(10);
    expect(text.end).toBe(25);
    expect(text.text).toBe('sample text');
  });

  test('paragraph node creation', () => {
    const textChild = createTextNode(5, 15, 'sample text');
    const para = createParagraphNode(0, 20, [textChild]);
    
    expect(para.kind).toBe(NodeKind.Paragraph);
    expect(para.children).toHaveLength(1);
    expect(para.children[0]).toBe(textChild);
  });

  test('heading node creation', () => {
    const textChild = createTextNode(2, 10, 'heading text');
    const heading = createHeadingNode(0, 12, 2, [textChild]);
    
    expect(heading.kind).toBe(NodeKind.Heading);
    expect(heading.level).toBe(2);
    expect(heading.children).toHaveLength(1);
    expect(heading.children[0]).toBe(textChild);
  });
});

describe('Node Validation', () => {
  test('position validation', () => {
    const validNode = createNode(NodeKind.InlineText, 10, 20);
    const invalidNode1 = createNode(NodeKind.InlineText, 20, 10); // end < start
    const invalidNode2 = createNode(NodeKind.InlineText, -5, 10); // negative start
    const invalidNode3 = createNode(NodeKind.InlineText, 10, 110); // end > source length
    
    expect(validateNodePosition(validNode, 100)).toBe(true);
    expect(validateNodePosition(invalidNode1, 100)).toBe(false);
    expect(validateNodePosition(invalidNode2, 100)).toBe(false);
    expect(validateNodePosition(invalidNode3, 100)).toBe(false);
  });

  test('child position validation', () => {
    const parent = createNode(NodeKind.Paragraph, 0, 30);
    const validChild1 = createNode(NodeKind.InlineText, 5, 15);
    const validChild2 = createNode(NodeKind.InlineText, 15, 25);
    const invalidChild = createNode(NodeKind.InlineText, 25, 35); // extends beyond parent
    
    expect(validateChildPositions(parent, [validChild1, validChild2])).toBe(true);
    expect(validateChildPositions(parent, [validChild1, invalidChild])).toBe(false);
  });
});

describe('Memory Efficiency', () => {
  test('separate kind and flags for clarity', () => {
    // Test that kind and flags are separate fields for better readability
    const node = createNode(NodeKind.Heading, 0, 10);
    node.flags = NodeFlags.Synthetic | NodeFlags.Missing;
    
    // Verify separate fields
    expect(typeof node.kind).toBe('number');
    expect(typeof node.flags).toBe('number');
    expect(node.kind).toBe(NodeKind.Heading);
    expect(node.flags).toBe(NodeFlags.Synthetic | NodeFlags.Missing);
  });

  test('optional parent linking', () => {
    const node = createNode(NodeKind.InlineText, 0, 5);
    
    // By default, parent is undefined to save memory
    expect(node.parent).toBeUndefined();
    
    // Can be set when needed
    const parentNode = createNode(NodeKind.Paragraph, 0, 10);
    node.parent = parentNode;
    expect(node.parent).toBe(parentNode);
  });
});