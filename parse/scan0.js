// @ts-check

/**
 * Bitwise OR: length: lower 24 bits, flags: upper 7 bits.
 * @typedef {number} ProvisionalToken
 */

/**
 * Scan ahead producing provisional tokens, until a decisive resolution point reached.
 * The last token may carry flags reporting what kind of resolution was reached.
 * @param {{
 *  input: string,
 *  startOffset: number,
 *  endOffset: number,
 *  output: ProvisionalToken[]
 * }} _
 * @return {number} The count of tokens pushed into output.
 */

export function scan0({
  input,
  startOffset, endOffset,
  output
}) {
  // mock implementation for now

  let tokenCount = 0;
  let offset = startOffset;
  while (offset < endOffset) {
    const ch = input.charCodeAt(offset++);
    switch (ch) {
      case 10 /* \n */:
      case 0: {
        output.push(0x1000001 /* NewLine, length: 1 */);
        tokenCount++;
        break;
      }

      case 13 /* \r */: {
        if (offset < endOffset && input.charCodeAt(offset) === 10 /* \n */) {
          offset++;
          output.push(0x1000002 /* NewLine, length: 2 */);
        } else {
          output.push(0x1000001 /* NewLine, length: 1 */);
        }
        tokenCount++;
        break;
      }

      case 38 /* & */: {
        // TODO: seek ahead for entity, either emit entity token or fall back to InlineText
        const entityLength = scanEntity(input, offset - 1, endOffset);
        if (entityLength > 0) {
          output.push(0x3000000 | entityLength /* EntityNamed, length: entityLength */);
          tokenCount++;
          offset += entityLength - 1;
        } else {
          tokenCount += scanInlineTextChar(input, offset - 1, endOffset, output);
        }
        continue;
      }
 
      case 9 /* \t */:
      case 32 /* space */: {
        // TODO: if latest token is Whitespace, append to it, else emit new Whitespace token
        if (output.length > 0 && (output[output.length - 1] & 0x2000000) === 0x2000000) {
          output[output.length - 1] ++; // Increment length
        } else {
          output.push(0x2000001 /* Whitespace, length: 1 */);
          tokenCount++;
        }
        continue;
      }
 
      default: {
        tokenCount += scanInlineTextChar(input, offset - 1, endOffset, output);
      }
    }
  }

  return tokenCount;
}

/**
 * Parse a range of text from the input string.
 * Returns increment of token count:
 *  -1 (merged into previous InlineText),
 *  0 (added to previous InlineText),
 *  +1 (new InlineText token)
 * @param {string} input
 * @param {number} offset
 * @param {number} endOffset
 * @param {ProvisionalToken[]} output
 */
function scanInlineTextChar(input, offset, endOffset, output) {
  if (output.length > 1 && // previous token is a single whitespace
    (output[output.length - 1] & 0x2000000) === 0x2000000 && (output[output.length - 2] & 0x1FFFFFF) === 0x1000001 &&
    input.charCodeAt(offset - 2) === 32 /* space */
  ) {
    output[output.length - 2]++; // Increment length of InlineText
    output.pop(); // Remove Whitespace token

    // this optimisation merges "word<space>word" into a single InlineText token
    return -1;
  }

  if (output.length > 0 && (output[output.length - 1] & 0x1000000) === 0x1000000) {
    // add to existing InlineText token
    output[output.length - 1]++; // Increment length
    return 0;
  } else {
    // emit new InlineText token
    output.push(0x1000001 /* InlineText, length: 1 */);
    return +1;
  }
}

/**
 * Try to parse an entity starting at `start` (expected to point at '&').
 * If a valid entity is found that ends with a semicolon, return its total length
 * (including the leading '&' and trailing ';'), otherwise return 0.
 *
 * Supports:
 *  - Named entities: &name;
 *  - Decimal numeric entities: &#1234;
 *  - Hex numeric entities: &#x1A3F; or &#X1A3F;
 *
 * Note: This is a conservative parser that requires the terminating ';'.
 *
 * @param {string} input
 * @param {number} start  Index of '&'
 * @param {number} end  Exclusive end index to not read past buffer
 * @returns {number} length of the entity (>=1) or 0 if not a valid entity
 */
function scanEntity(input, start, end) {
  if (start < 0 || start >= end) return 0;
  if (input.charCodeAt(start) !== 38 /* & */) return 0;

  let offset = start + 1;
  if (offset >= end) return 0;

  const ch = input.charCodeAt(offset);

  // Numeric entity: &#... or &#x...
  if (ch === 35 /* # */) {
    offset++;
    if (offset >= end) return 0;

    // hex?
    const cc = input.charCodeAt(offset);
    let isHex = false;
    if (cc === 120 /* x */ || cc === 88 /* X */) {
      isHex = true;
      offset++;
      if (offset >= end) return 0;
    }

    const digitsStart = offset;
    while (offset < end) {
      const d = input.charCodeAt(offset);
      if (isHex) {
        const isHexDigit = (d >= 48 && d <= 57) || (d >= 65 && d <= 70) || (d >= 97 && d <= 102);
        if (!isHexDigit) break;
      } else {
        if (!(d >= 48 && d <= 57)) break;
      }
      offset++;
    }

    // require at least one digit
    if (offset === digitsStart) return 0;
    // require terminating semicolon
    if (offset < end && input.charCodeAt(offset) === 59 /* ; */) {
      return offset - start + 1;
    }
    return 0;
  }

  // Named entity: &name;
  const nameStart = offset;
  while (offset < end) {
    const d = input.charCodeAt(offset);
    if (!isAlphaNum(d)) break;
    offset++;
  }

  // require at least one name character and a terminating semicolon
  if (offset === nameStart) return 0;
  if (offset < end && input.charCodeAt(offset) === 59 /* ; */) {
    return offset - start + 1;
  }

  return 0;
}

/** @param {number} ch */
function isAlphaNum(ch) {
  return (
    (ch >= 65 /* A */ && ch <= 90 /* Z */) ||
    (ch >= 97 /* a */ && ch <= 122 /* z */) ||
    (ch >= 48 /* 0 */ && ch <= 57 /* 9 */)
  );
}

export const PARSE_TOKENS = {
  InlineText: 0x1000000,
  Whitespace: 0x2000000,
  NewLine: 0x1000000,
  EntityNamed: 0x3000000,
  EntityDecimal: 0x4000000,
  EntityHex: 0x5000000
};