/**
 * Frontmatter tests extracted from extensions.test.ts
 */

import { describe, expect, test } from 'vitest';

import { scanTokensStrings } from '../utils.test.js';

describe('Markdown Extensions — Frontmatter', () => {
  test('YAML frontmatter at document start', () => {
    const frontmatter = `---\ntitle: "My Document"\nauthor: "John Doe"\ndate: 2023-01-01\n---\n\n# Content starts here`;
    
  const tokens = scanTokensStrings(frontmatter);
  expect(tokens.join('\n')).toContain('--- DashDashDash');
  });

  test('TOML frontmatter at document start', () => {
    const frontmatter = `+++\ntitle = "My Document"\nauthor = "John Doe"\ndate = 2023-01-01\n+++\n\n# Content starts here`;
    
  const tokens = scanTokensStrings(frontmatter);
  expect(tokens.join('\n')).toContain('+++ PlusToken');
  });

  test('frontmatter not at document start is treated as regular content', () => {
    const content = `Some content\n\n---\nnot: frontmatter\n---`;
    
  const tokens = scanTokensStrings(content).join('\n');
  // Should not find DashDashDash token
  expect(tokens).not.toContain('--- DashDashDash');
  });

  test('incomplete frontmatter fence', () => {
    const tokens = scanTokensStrings('--\ntitle: incomplete\n--');
    // Should not be recognized as frontmatter - should parse as regular dashes and identifiers
    expect(tokens).toEqual([
      '- DashToken',
      '- DashToken',
      '"\\n" NewLineTrivia',
      'title Identifier',
      ': ColonToken',
      '" " WhitespaceTrivia',
      'incomplete Identifier',
      '"\\n" NewLineTrivia',
      '- DashToken',
      '- DashToken',
      'EndOfFileToken'
    ]);
  });

  test('frontmatter with extra dashes', () => {
    const tokens = scanTokensStrings('----\ntitle: test\n----');
    expect(tokens).toEqual([
      '---- DashDashDash',
      '"\\n" NewLineTrivia',
      'title Identifier',
      ': ColonToken',
      '" " WhitespaceTrivia',
      'test Identifier',
      '"\\n" NewLineTrivia',
      '---- DashToken',
      'EndOfFileToken'
    ]);
  });
});
