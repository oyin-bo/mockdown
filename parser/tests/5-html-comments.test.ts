import { describe, expect, test } from 'vitest';
import { verifyTokens } from './verify-tokens';

describe('HTML Comments - Stage 4', () => {
  test('basic HTML comment', () => {
  const tokenTest = `
<!-- comment -->
1
@1 HtmlComment "<!-- comment -->"
`;
  expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('HTML comment with nested angle brackets', () => {
  const tokenTest = `
<!-- <div>not a tag</div> -->
1
@1 HtmlComment "<!-- <div>not a tag</div> -->"
`;
  expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });
});