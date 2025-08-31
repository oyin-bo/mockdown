/**
 * Table extension tests extracted from extensions.test.ts
 */

import { describe, expect, test } from 'vitest';

import { scanTokensStrings } from '../utils.test.js';

describe('Markdown Extensions — Tables', () => {
  test('simple table structure', () => {
    const tokens = scanTokensStrings('| Col 1 | Col 2 | Col 3 |').join('\n');
    expect((tokens.match(/\| PipeToken/g) || []).length).toBe(4);
  });

  test('table with header separator', () => {
    const table = `| Header 1 | Header 2 |\n|----------|----------|\n| Cell 1   | Cell 2   |`;

    const tokens = scanTokensStrings(table).join('\n');
    expect((tokens.match(/\| PipeToken/g) || []).length).toBeGreaterThan(4);
  });

  test('table with alignment', () => {
    const table = `| Left | Center | Right |\n|:-----|:------:|------:|\n| L1   |   C1   |    R1 |`;

    const tokens = scanTokensStrings(table).join('\n');
    expect((tokens.match(/\| PipeToken/g) || []).length).toBeGreaterThan(6);
    expect(tokens).toContain(': ColonToken');
  });

  test('table without leading/trailing pipes', () => {
    const tokens = scanTokensStrings('Col 1 | Col 2 | Col 3').join('\n');
    expect((tokens.match(/\| PipeToken/g) || []).length).toBe(2);
  });

  test('escaped pipes in table cells', () => {
    const tokens = scanTokensStrings('| Code: `a \\| b` | Result |').join('\n');
    expect((tokens.match(/\| PipeToken/g) || []).length).toBe(3);
    // escaped pipe shows up inside tokens as an escaped sequence ("\\|") or quoted
    expect(/\\\|/.test(tokens)).toBeTruthy();
  });
});
