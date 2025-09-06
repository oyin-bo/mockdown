import { describe, test, expect } from 'vitest';
import { verifyTokens } from './verify-tokens';

describe('DOCTYPE Declarations - Stage 4 (Post-implementation)', () => {
  test('simple HTML5 DOCTYPE', () => {
    const tokenTest = `
<!DOCTYPE html>
1
@1 HtmlDoctype "<!DOCTYPE html>"`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('case-insensitive DOCTYPE detection', () => {
    const tokenTest = `
<!doctype html>
1
@1 HtmlDoctype "<!doctype html>"`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('DOCTYPE with quoted greater-than characters', () => {
    const tokenTest = `
<!DOCTYPE test "has>inside">
1
@1 HtmlDoctype "<!DOCTYPE test \\"has>inside\\">"`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('unterminated DOCTYPE shows Unterminated flag', () => {
    const tokenTest = `
<!DOCTYPE html never closed
<!DOCTYPE html never closed
1
@1 HtmlDoctype Unterminated
NextLineAfterDoctype
1
@1 StringLiteral "NextLineAfterDoctype"`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('unterminated DOCTYPE fast-breaks at end of line and continues scanning', () => {
  const tokenTest = `
<!DOCTYPE mydoc never closed here
1
@1 HtmlDoctype Unterminated
NextLineContent
1
@1 StringLiteral "NextLineContent"
`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('unterminated DOCTYPE fast-breaks at next \u003c (less-than) char', () => {
  const tokenTest = `
<!DOCTYPE abc missing but has <
1                             2
@1 HtmlDoctype Unterminated
@2 "<"
`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });

  test('HTML4 DOCTYPE with PUBLIC identifier', () => {
    const tokenTest = `
<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN">
1
@1 HtmlDoctype "<!DOCTYPE HTML PUBLIC \\"-//W3C//DTD HTML 4.01//EN\\">"`;
    expect(verifyTokens(tokenTest)).toBe(tokenTest);
  });
});