/**
 * HTML entity decoding utilities (non-scanner)
 * Scanner should continue to return raw lexemes; decoding is opt-in via these helpers.
 */

const namedEntities: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00A0'
};

/**
 * Decode a numeric entity like &#65; or &#x41;.
 * Returns the decoded string, or the replacement character on invalid input.
 */
export function decodeNumericEntity(text: string): string {
  // Expect patterns: "&#<digits>;" or "&#x<hex>;"
  if (!text.startsWith('&#') || !text.endsWith(';')) return '\uFFFD';
  const body = text.slice(2, -1);
  let codePoint: number | null = null;
  if (body.length === 0) return '\uFFFD';
  if (body[0] === 'x' || body[0] === 'X') {
    const hex = body.slice(1);
    if (!/^[0-9A-Fa-f]+$/.test(hex)) return '\uFFFD';
    codePoint = parseInt(hex, 16);
  } else {
    if (!/^\d+$/.test(body)) return '\uFFFD';
    codePoint = parseInt(body, 10);
  }
  // Clamp to valid Unicode range and exclude surrogate halves
  if (codePoint < 0 || codePoint > 0x10FFFF) return '\uFFFD';
  if (codePoint >= 0xD800 && codePoint <= 0xDFFF) return '\uFFFD';
  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return '\uFFFD';
  }
}

/**
 * Decode a named or numeric entity. Unknown names return the input unchanged if allowUnknown is true, else U+FFFD.
 */
export function decodeEntity(text: string, allowUnknown = true): string {
  if (text.startsWith('&#')) return decodeNumericEntity(text);
  if (text.startsWith('&') && text.endsWith(';')) {
    const name = text.slice(1, -1);
    if (name in namedEntities) return namedEntities[name];
    return allowUnknown ? text : '\uFFFD';
  }
  return text;
}
