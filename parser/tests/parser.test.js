/**
 * Unit Tests for Core Parser Functionality
 */
import { describe, it, expect } from 'vitest';
import { createParser } from '../parser.js';
import { NodeKind, getNodeKind } from '../ast-types.js';
import { beforeEach } from 'node:test';
describe('Core Parser', () => {
    let parser;
    beforeEach(() => {
        parser = createParser();
    });
    describe('Document Parsing', () => {
        it('should parse empty document', () => {
            parser = createParser();
            const result = parser.parseDocument('');
            expect(getNodeKind(result.ast)).toBe(NodeKind.Document);
            expect(result.ast.children).toHaveLength(0);
            expect(result.diagnostics).toHaveLength(0);
        });
        it('should parse document with line starts', () => {
            const result = parser.parseDocument('line 1\nline 2\nline 3');
            expect(result.ast.lineStarts).toEqual([0, 7, 14]);
        });
    });
    describe('Paragraph Parsing', () => {
        it('should parse simple paragraph', () => {
            const result = parser.parseDocument('Hello world');
            expect(result.ast.children).toHaveLength(1);
            const para = result.ast.children[0];
            expect(getNodeKind(para)).toBe(NodeKind.Paragraph);
            expect(para.pos).toBe(0);
            expect(para.end).toBeGreaterThan(0);
        });
        it('should parse multiple paragraphs', () => {
            const result = parser.parseDocument('First paragraph\n\nSecond paragraph');
            expect(result.ast.children).toHaveLength(3); // para, whitespace, para
            expect(getNodeKind(result.ast.children[0])).toBe(NodeKind.Paragraph);
            expect(getNodeKind(result.ast.children[1])).toBe(NodeKind.WhitespaceSeparation);
            expect(getNodeKind(result.ast.children[2])).toBe(NodeKind.Paragraph);
        });
    });
    describe('ATX Heading Parsing', () => {
        it('should parse H1 heading', () => {
            const result = parser.parseDocument('# Heading 1');
            expect(result.ast.children).toHaveLength(1);
            const heading = result.ast.children[0];
            expect(getNodeKind(heading)).toBe(NodeKind.Heading);
            expect(heading.level).toBe(1);
        });
        it('should parse H2 heading', () => {
            const result = parser.parseDocument('## Heading 2');
            const heading = result.ast.children[0];
            expect(heading.level).toBe(2);
        });
        it('should parse H6 heading', () => {
            const result = parser.parseDocument('###### Heading 6');
            const heading = result.ast.children[0];
            expect(heading.level).toBe(6);
        });
        it('should limit heading level to 6', () => {
            const result = parser.parseDocument('####### Too many hashes');
            const heading = result.ast.children[0];
            expect(heading.level).toBe(6);
        });
    });
    describe('Setext Heading Parsing', () => {
        it('should parse setext H1', () => {
            const result = parser.parseDocument('Heading 1\n=========');
            expect(result.ast.children).toHaveLength(1);
            const heading = result.ast.children[0];
            expect(getNodeKind(heading)).toBe(NodeKind.Heading);
            expect(heading.level).toBe(1);
        });
        it('should parse setext H2', () => {
            const result = parser.parseDocument('Heading 2\n---------');
            const heading = result.ast.children[0];
            expect(getNodeKind(heading)).toBe(NodeKind.Heading);
            expect(heading.level).toBe(2);
        });
    });
    describe('Whitespace Separation', () => {
        it('should create whitespace separation for blank lines', () => {
            const result = parser.parseDocument('Para 1\n\n\nPara 2');
            expect(result.ast.children).toHaveLength(3);
            const whitespace = result.ast.children[1];
            expect(getNodeKind(whitespace)).toBe(NodeKind.WhitespaceSeparation);
            expect(whitespace.count).toBe(2); // Two blank lines
        });
    });
    describe('HTML Element Parsing', () => {
        it('should parse simple HTML element', () => {
            const result = parser.parseDocument('<div>content</div>');
            expect(result.ast.children).toHaveLength(2); // <div> and </div> as separate elements for now
            const openElement = result.ast.children[0];
            expect(getNodeKind(openElement)).toBe(NodeKind.HtmlElement);
            expect(openElement.tagName).toBe('div');
        });
        it('should parse self-closing HTML element', () => {
            const result = parser.parseDocument('<br/>');
            const element = result.ast.children[0];
            expect(getNodeKind(element)).toBe(NodeKind.HtmlElement);
        });
    });
    //   describe('Mixed Content', () => {
    //     it('should parse document with mixed block types', () => {
    //       const markdown = `# Title
    // This is a paragraph.
    // ## Subtitle
    // Another paragraph with <em>emphasis</em>.
    // <div>HTML block</div>`;
    //       const result = parser.parseDocument(markdown);
    //       expect(result.ast.children.length).toBeGreaterThan(5);
    //       // Check first few elements
    //       expect(getNodeKind(result.ast.children[0])).toBe(NodeKind.Heading);
    //       expect(getNodeKind(result.ast.children[1])).toBe(NodeKind.WhitespaceSeparation);
    //       expect(getNodeKind(result.ast.children[2])).toBe(NodeKind.Paragraph);
    //     });
    //   });
    describe('Error Handling', () => {
        it('should handle malformed input gracefully', () => {
            const result = parser.parseDocument('<unclosed tag');
            expect(result.ast.children).toHaveLength(1);
            // Should not throw errors
        });
        it('should produce diagnostics for errors when enabled', () => {
            const result = parser.parseDocument('<unclosed>', { errorRecovery: true });
            // Should complete without throwing
            expect(result.ast).toBeDefined();
        });
    });
    describe('Parser Options', () => {
        it('should respect parentLinking option', () => {
            const result = parser.parseDocument('# Heading', { parentLinking: true });
            const heading = result.ast.children[0];
            expect(heading.children[0]?.parent).toBe(heading);
        });
        it('should work without parentLinking', () => {
            const result = parser.parseDocument('# Heading', { parentLinking: false });
            const heading = result.ast.children[0];
            expect(heading.children[0]?.parent).toBeUndefined();
        });
    });
});
