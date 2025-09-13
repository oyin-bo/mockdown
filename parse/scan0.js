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

  let posNewLine = input.indexOf('\n', startOffset);
  if (posNewLine < 0 || posNewLine >= endOffset)
    posNewLine = endOffset;

  let added = 0;
  if (posNewLine > startOffset) {
    output.push(
      (posNewLine - startOffset + 1) |
      1 /* InlineText */
    );
    added++;
  }

  if (posNewLine < endOffset) {
    output.push(
      1 | // length
      2 /* NewLine */
    );
    added++;
  }

  return added;
}
