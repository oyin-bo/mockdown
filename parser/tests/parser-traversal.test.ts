/**
 * Tests for AST Traversal Infrastructure
 * Testing Phase 1 visitor pattern and query functions
 */

import { beforeEach, describe, expect, test } from 'vitest';
import {
  NodeKind,
  Document,
  ParagraphNode,
  InlineTextNode
} from '../ast-types.js';
import {
  createDocumentNode,
  createParagraphNode,
  createTextNode,
  createHeadingNode
} from '../ast-factory.js';
import {
  Visitor,
  VisitResult,
  walkAST,
  walkASTBottomUp,
  findNodeAt,
  findNodesInRange,
  getNodePath,
  getAncestors,
  getParent,
  getDescendants,
  isAncestor,
  getSiblings,
  getNextSibling,
  getPreviousSibling
} from '../ast-traversal.js';

describe('AST Visitor Pattern', () => {
  let sampleDocument: Document;
  
  beforeEach(() => {
    // Create a sample document structure:
    // Document [0-50]
    //   Paragraph [0-25]
    //     Text [0-10] "Hello "
    //     Text [10-25] "world!"
    //   Heading [25-50]
    //     Text [27-47] "Chapter 1"
    
    const text1 = createTextNode(0, 10, 'Hello ');
    const text2 = createTextNode(10, 25, 'world!');
    const paragraph = createParagraphNode(0, 25, [text1, text2]);
    
    const text3 = createTextNode(27, 47, 'Chapter 1');
    const heading = createHeadingNode(25, 50, 1, [text3]);
    
    sampleDocument = createDocumentNode(0, 50, [paragraph, heading]);
  });

  test('basic visitor pattern - visit all nodes', () => {
    const visitedNodes: NodeKind[] = [];
    
    const visitor: Visitor = {
      visitNode(node) {
        visitedNodes.push(node.kind);
        return VisitResult.Continue;
      }
    };
    
    walkAST(sampleDocument, visitor);
    
    expect(visitedNodes).toEqual([
      NodeKind.Document,
      NodeKind.Paragraph,
      NodeKind.InlineText,
      NodeKind.InlineText,
      NodeKind.Heading,
      NodeKind.InlineText
    ]);
  });

  test('specific visitor methods', () => {
    const visits = {
      document: 0,
      paragraph: 0,
      heading: 0,
      text: 0
    };
    
    const visitor: Visitor = {
      visitDocument() {
        visits.document++;
        return VisitResult.Continue;
      },
      visitParagraph() {
        visits.paragraph++;
        return VisitResult.Continue;
      },
      visitHeading() {
        visits.heading++;
        return VisitResult.Continue;
      },
      visitText() {
        visits.text++;
        return VisitResult.Continue;
      }
    };
    
    walkAST(sampleDocument, visitor);
    
    expect(visits.document).toBe(1);
    expect(visits.paragraph).toBe(1);
    expect(visits.heading).toBe(1);
    expect(visits.text).toBe(3);
  });

  test('visitor skip children', () => {
    const visitedKinds: NodeKind[] = [];
    
    const visitor: Visitor = {
      visitNode(node) {
        const kind = node.kind;
        visitedKinds.push(kind);
        
        // Skip paragraph children
        if (kind === NodeKind.Paragraph) {
          return VisitResult.Skip;
        }
        
        return VisitResult.Continue;
      }
    };
    
    walkAST(sampleDocument, visitor);
    
    expect(visitedKinds).toEqual([
      NodeKind.Document,
      NodeKind.Paragraph, // Visited but children skipped
      NodeKind.Heading,
      NodeKind.InlineText       // Only heading's text child
    ]);
  });

  test('visitor stop traversal', () => {
    const visitedKinds: NodeKind[] = [];
    
    const visitor: Visitor = {
      visitNode(node) {
        const kind = node.kind;
        visitedKinds.push(kind);
        
        // Stop at first text node
        if (kind === NodeKind.InlineText) {
          return VisitResult.Stop;
        }
        
        return VisitResult.Continue;
      }
    };
    
    walkAST(sampleDocument, visitor);
    
    expect(visitedKinds).toEqual([
      NodeKind.Document,
      NodeKind.Paragraph,
      NodeKind.InlineText       // Stop here
    ]);
  });

  test('bottom-up traversal', () => {
    const visitedKinds: NodeKind[] = [];
    
    const visitor: Visitor = {
      visitNode(node) {
        visitedKinds.push(node.kind);
        return VisitResult.Continue;
      }
    };
    
    walkASTBottomUp(sampleDocument, visitor);
    
    expect(visitedKinds).toEqual([
      NodeKind.InlineText,      // First text in paragraph
      NodeKind.InlineText,      // Second text in paragraph
      NodeKind.Paragraph, // Paragraph after its children
      NodeKind.InlineText,      // Text in heading
      NodeKind.Heading,   // Heading after its children
      NodeKind.Document   // Document last
    ]);
  });
});

describe('Position-based Queries', () => {
  let sampleDocument: Document;
  
  beforeEach(() => {
    // Same sample document as above
    const text1 = createTextNode(0, 10, 'Hello ');
    const text2 = createTextNode(10, 25, 'world!');
    const paragraph = createParagraphNode(0, 25, [text1, text2]);
    
    const text3 = createTextNode(27, 47, 'Chapter 1');
    const heading = createHeadingNode(25, 50, 1, [text3]);
    
    sampleDocument = createDocumentNode(0, 50, [paragraph, heading]);
  });

  test('find node at position', () => {
    // Position 5 should find the first text node
    const node1 = findNodeAt(sampleDocument, 5);
    expect(node1?.pos).toBe(0);
    expect(node1?.end).toBe(10);
    
    // Position 15 should find the second text node
    const node2 = findNodeAt(sampleDocument, 15);
    expect(node2?.pos).toBe(10);
    expect(node2?.end).toBe(25);
    
    // Position 30 should find the heading text
    const node3 = findNodeAt(sampleDocument, 30);
    expect(node3?.pos).toBe(27);
    expect(node3?.end).toBe(47);
    
    // Position outside range
    const node4 = findNodeAt(sampleDocument, 100);
    expect(node4).toBeUndefined();
  });

  test('find nodes in range', () => {
    // Range 5-15 should intersect with both text nodes in paragraph
    const nodes1 = findNodesInRange(sampleDocument, 5, 15);
    const positions1 = nodes1.map(n => [n.pos, n.end]);
    
    expect(positions1).toContainEqual([0, 10]);  // First text
    expect(positions1).toContainEqual([10, 25]); // Second text
    expect(positions1).toContainEqual([0, 25]);  // Paragraph container
    expect(positions1).toContainEqual([0, 50]);  // Document
    
    // Range 26-28 should find heading and its text
    const nodes2 = findNodesInRange(sampleDocument, 26, 28);
    const positions2 = nodes2.map(n => [n.pos, n.end]);
    
    expect(positions2).toContainEqual([25, 50]); // Heading
    expect(positions2).toContainEqual([27, 47]); // Heading text
    expect(positions2).toContainEqual([0, 50]);  // Document
  });
});

describe('Node Relationship Queries', () => {
  let sampleDocument: Document;
  let paragraph: ParagraphNode;
  let heading: any;
  let text1: InlineTextNode;
  let text2: InlineTextNode;
  let text3: InlineTextNode;
  
  beforeEach(() => {
    text1 = createTextNode(0, 10, 'Hello ');
    text2 = createTextNode(10, 25, 'world!');
    paragraph = createParagraphNode(0, 25, [text1, text2]);
    
    text3 = createTextNode(27, 47, 'Chapter 1');
    heading = createHeadingNode(25, 50, 1, [text3]);
    
    sampleDocument = createDocumentNode(0, 50, [paragraph, heading]);
  });

  test('get node path', () => {
    const path1 = getNodePath(sampleDocument, text1);
    expect(path1).toHaveLength(3);
    expect(path1[0]).toBe(sampleDocument);
    expect(path1[1]).toBe(paragraph);
    expect(path1[2]).toBe(text1);
    
    const path2 = getNodePath(sampleDocument, heading);
    expect(path2).toHaveLength(2);
    expect(path2[0]).toBe(sampleDocument);
    expect(path2[1]).toBe(heading);
    
    // Non-existent node
    const otherNode = createTextNode(100, 110);
    const path3 = getNodePath(sampleDocument, otherNode);
    expect(path3).toEqual([]);
  });

  test('get ancestors', () => {
    const ancestors1 = getAncestors(sampleDocument, text1);
    expect(ancestors1).toEqual([sampleDocument, paragraph]);
    
    const ancestors2 = getAncestors(sampleDocument, paragraph);
    expect(ancestors2).toEqual([sampleDocument]);
    
    const ancestors3 = getAncestors(sampleDocument, sampleDocument);
    expect(ancestors3).toEqual([]);
  });

  test('get parent', () => {
    expect(getParent(sampleDocument, text1)).toBe(paragraph);
    expect(getParent(sampleDocument, paragraph)).toBe(sampleDocument);
    expect(getParent(sampleDocument, sampleDocument)).toBeUndefined();
  });

  test('get descendants', () => {
    const descendants = getDescendants(paragraph);
    expect(descendants).toContain(text1);
    expect(descendants).toContain(text2);
    expect(descendants).toHaveLength(2);
    
    const docDescendants = getDescendants(sampleDocument);
    expect(docDescendants).toHaveLength(5); // paragraph, text1, text2, heading, text3
  });

  test('ancestor/descendant relationships', () => {
    expect(isAncestor(sampleDocument, text1)).toBe(true);
    expect(isAncestor(paragraph, text1)).toBe(true);
    expect(isAncestor(text1, paragraph)).toBe(false);
    expect(isAncestor(text1, text1)).toBe(false);
  });

  test('siblings', () => {
    // text1 and text2 are siblings
    const siblings1 = getSiblings(sampleDocument, text1);
    expect(siblings1).toEqual([text2]);
    
    const siblings2 = getSiblings(sampleDocument, text2);
    expect(siblings2).toEqual([text1]);
    
    // paragraph and heading are siblings
    const siblings3 = getSiblings(sampleDocument, paragraph);
    expect(siblings3).toEqual([heading]);
  });

  test('next and previous siblings', () => {
    expect(getNextSibling(sampleDocument, text1)).toBe(text2);
    expect(getPreviousSibling(sampleDocument, text2)).toBe(text1);
    
    expect(getNextSibling(sampleDocument, paragraph)).toBe(heading);
    expect(getPreviousSibling(sampleDocument, heading)).toBe(paragraph);
    
    // Edge cases
    expect(getPreviousSibling(sampleDocument, text1)).toBeUndefined();
    expect(getNextSibling(sampleDocument, text2)).toBeUndefined();
  });
});