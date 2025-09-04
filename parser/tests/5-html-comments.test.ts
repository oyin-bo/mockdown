import { describe, expect, test } from 'vitest';
import { verifyTokens } from './verify-tokens';

describe('HTML Comments - Stage 4', () => {
  test('basic HTML comment', () => {
    expect(verifyTokens(`
<!-- comment -->
1
@1 HtmlComment "<!-- comment -->"
`)).toBe(`
<!-- comment -->
1
@1 HtmlComment "<!-- comment -->"
`);
  });

  test('HTML comment with nested angle brackets', () => {
    expect(verifyTokens(`
<!-- <div>not a tag</div> -->
1
@1 HtmlComment "<!-- <div>not a tag</div> -->"
`)).toBe(`
<!-- <div>not a tag</div> -->
1
@1 HtmlComment "<!-- <div>not a tag</div> -->"
`);
  });
});