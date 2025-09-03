/**
 * Tests for context sensitivity, lookahead, and complex scenarios
 */

import { describe, expect, test } from 'vitest';

import { createScanner } from '../../scanner.js';
import { SyntaxKind, TokenFlags } from '../../../token-types.js';
import { scanTokens, scanTokensStrings } from '../utils.test.js';

describe('Context and Advanced Features', () => {

  describe('Context Sensitivity', () => {
    test('tracks line start context', () => {
      const tokens = scanTokens('text\n# heading');
      const hashToken = tokens.find(t => t.kind === SyntaxKind.HashToken);
      expect(hashToken && (hashToken.flags & TokenFlags.IsAtLineStart)).toBeTruthy();
    });

    test('tracks preceding line break', () => {
      const tokens = scanTokens('line1\nline2');
      const identifierTokens = tokens.filter(t => t.kind === SyntaxKind.Identifier);
      expect(identifierTokens[1] && (identifierTokens[1].flags & TokenFlags.PrecedingLineBreak)).toBeTruthy();
    });
  });

  describe('Lookahead and Rescanning', () => {
    test('supports lookahead without affecting state', () => {
      const scanner = createScanner();
      scanner.setText('< test');
      const originalPos = scanner.getTokenStart();
      
      const lookaheadResult = scanner.lookAhead(() => {
        scanner.scan();
        return scanner.getToken();
      });
      
      expect(lookaheadResult).toBe(SyntaxKind.LessThanToken);
      expect(scanner.getTokenStart()).toBe(originalPos);
    });

    test('supports rescanning less than token', () => {
      const scanner = createScanner();
      scanner.setText('<div>');
      scanner.scan(); // Initial scan
      
      const rescanned = scanner.reScanLessThanToken();
      expect(rescanned).toBe(SyntaxKind.HtmlText);
    });
  });

  describe('Complex Real-World Examples', () => {
    const markdown = `# Heading 1

This is a paragraph with **bold** and *italic* text.

- List item 1
- List item 2

\`\`\`javascript
console.log("code block");
\`\`\`

> Blockquote with [link](url)

| Table | Header |
|-------|--------|
| Cell  | Data   |

$$E = mc^2$$

{.class #id}`;

    test('HashToken', () => {
      const tokens = scanTokensStrings(markdown);
      expect(tokens).toContain('# HashToken');
    });
    test('AsteriskAsterisk', () => {
      const tokens = scanTokensStrings(markdown);
      expect(tokens).toContain('** AsteriskAsterisk');
    });

    test('DashToken', () => {
      const tokens = scanTokensStrings(markdown);
      expect(tokens).toContain('- DashToken');
    });

    test('BacktickToken', () => {
      const tokens = scanTokensStrings(markdown);
      expect(tokens.find(t => t.includes('Backtick'))).toBe('```javascript BacktickToken');
    });

    test('BlockquoteToken', () => {
      const tokens = scanTokensStrings(markdown);
      expect(tokens).toContain('> BlockquoteToken');
    });

    test('PipeToken', () => {
      const tokens = scanTokensStrings(markdown);
      expect(tokens).toContain('| PipeToken');
    });

    test('DollarDollar', () => {
      const tokens = scanTokensStrings(markdown);
      expect(tokens.find(t => t.includes('DollarDollar'))).toBe('$$ DollarDollar');
    });

    test('OpenBraceToken', () => {
      const tokens = scanTokensStrings(markdown);
      expect(tokens.find(t => t.includes('OpenBrace'))).toBe('"{.class #id}" OpenBraceToken');
    });
  });
});
