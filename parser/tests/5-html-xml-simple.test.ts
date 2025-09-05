import { describe, expect, test } from 'vitest';
import { createScanner } from '../scanner/scanner';
import { SyntaxKind } from '../scanner/token-types';

describe('XML-like Constructs - Stage 4', () => {
  test('CDATA section', () => {
    const scanner = createScanner();
    scanner.initText('<![CDATA[ var x = "<test>"; ]]>');
    
    scanner.scan();
    
    expect(scanner.token).toBe(SyntaxKind.HtmlCdata);
    expect(scanner.tokenText).toBe('<![CDATA[ var x = "<test>"; ]]>');
    expect(scanner.offsetNext).toBe(31); // Full length of input
  });

  test('processing instruction', () => {
    const scanner = createScanner();
    scanner.initText('<?xml version="1.0"?>');
    
    scanner.scan();
    
    expect(scanner.token).toBe(SyntaxKind.HtmlProcessingInstruction);
    expect(scanner.tokenText).toBe('<?xml version="1.0"?>');
    expect(scanner.offsetNext).toBe(21); // Full length of input
  });

  test('multiple CDATA sections', () => {
    const scanner = createScanner();
    scanner.initText('<![CDATA[first]]><![CDATA[second]]>');
    
    // First CDATA
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.HtmlCdata);
    expect(scanner.tokenText).toBe('<![CDATA[first]]>');
    
    // Second CDATA
    scanner.scan();
    expect(scanner.token).toBe(SyntaxKind.HtmlCdata);
    expect(scanner.tokenText).toBe('<![CDATA[second]]>');
  });

  test('nested brackets in CDATA', () => {
    const scanner = createScanner();
    scanner.initText('<![CDATA[<tag>content</tag>]]>');
    
    scanner.scan();
    
    expect(scanner.token).toBe(SyntaxKind.HtmlCdata);
    expect(scanner.tokenText).toBe('<![CDATA[<tag>content</tag>]]>');
  });
});