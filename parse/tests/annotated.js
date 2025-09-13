// @ts-check
/// <reference types="node" />

// TODO: implement annotated Markdown test harness here
import fs from 'fs';
import path from 'path';
import assert from 'node:assert';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'url';

// __dirname replacement for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load the scanner under test (relative path) via dynamic import
const scanPath = path.join(__dirname, '..', 'scan0.js');
const scanUrl = pathToFileURL(scanPath).href;
const scanModule = await import(scanUrl);
const { scan0 } = scanModule;

/**
 * Find .md files recursively under a directory.
 * @param {string} dir
 * @returns {string[]} absolute paths
 */
function findMarkdownFiles(dir) {
	const out = [];
	for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, name.name);
		if (name.isDirectory()) {
			out.push(...findMarkdownFiles(full));
		} else if (name.isFile() && full.endsWith('.md')) {
			out.push(full);
		}
	}
	return out;
}

/**
 * Parse an annotated markdown file and yield blocks with: contentLines, markerLine, assertions
 * A block is: one or more content lines, then a marker line (starts with optional space and a digit '1'),
 * followed by one or more lines starting with '@'.
 * We'll accept markers with digits/letters and assertions like `@1 InlineText` or `@1 "text"`.
 * @param {string} text
 * @returns {Array<{startLine:number, content:string[], markerLine:string, assertions:string[]}>}
 */
function parseAnnotatedBlocks(text) {
	const lines = text.replace(/\r\n/g, '\n').split('\n');
	const blocks = [];
	let i = 0;
	while (i < lines.length) {
		// find a candidate marker line by looking ahead for a line that contains only
		// spaces and marker characters (digits/letters) and at least one alphanumeric char.
		// This lets us support multiple markers like: "1    2"
		const markerIdx = lines.slice(i).findIndex(l => /^[ \t0-9A-Za-z]+$/.test(l) && /[0-9A-Za-z]/.test(l));
		if (markerIdx === -1) break;
		const markerLineIndex = i + markerIdx;
		// now collect content lines immediately above the marker line: at least one
		// backtrack to include preceding non-empty lines until an empty line or start or another marker separator
		let contentStart = markerLineIndex - 1;
		if (contentStart < 0) { i = markerLineIndex + 1; continue; }
		const contentLines = [];
		// collect lines above until blank line or start of file
		while (contentStart >= 0 && lines[contentStart].trim() !== '') {
			contentLines.unshift(lines[contentStart]);
			contentStart--;
		}

		// collect assertions lines starting at markerLineIndex+1 while they start with @
		const assertions = [];
		let j = markerLineIndex + 1;
		while (j < lines.length && lines[j].startsWith('@')) {
			assertions.push(lines[j]);
			j++;
		}

		if (contentLines.length && assertions.length) {
			blocks.push({ startLine: contentStart + 2, content: contentLines, markerLine: lines[markerLineIndex], assertions });
		}

		i = j + 0;
	}
	return blocks;
}

/**
 * Convert provisional token (number) to { length, flags }
 * As documented in scan0: lower 24 bits length, upper bits flags.
 * @param {number} tok
 */
function decodeProvisionalToken(tok) {
	const length = tok & 0xffffff;
	const flags = tok >>> 24;
	return { length, flags };
}

/**
 * Extract expected flags from assertion lines for a particular marker number.
 * For scan0 tests we expect assertions like `@1 InlineText` where the token kind is given.
 * We'll return an array of expected flag names in order of markers found on the marker line.
 * @param {string} markerLine
 * @param {string[]} assertions
 */
function mapAssertions(markerLine, assertions) {
	// markerLine contains positions marked by digits/letters at the columns corresponding to characters above.
	// For our simple harness, we assume a single marker per test (common in examples). We'll parse all @ lines and
	// build a map position->assertion (like '@1 InlineText').
	const map = new Map();
	for (const a of assertions) {
		// remove leading @ and split
		const m = a.match(/^@(\S+)\s+(.*)$/);
		if (!m) continue;
		const id = m[1];
		const value = m[2].trim();
		map.set(id, value);
	}
	return map;
}

/**
 * Simple mapping for token flag names used in scan0.js mock. In the project's scanner there will be an enum.
 * We'll provide common names used in examples: InlineText -> 1, NewLine -> 2
 */
const FLAG_NAMES = {
	InlineText: 1,
	NewLine: 2
};

// Main: find markdown files under tests directory relative to this file
const testsDir = __dirname; // parse/tests
const mdFiles = findMarkdownFiles(testsDir);

for (const md of mdFiles) {
	const raw = fs.readFileSync(md, 'utf8');
	const blocks = parseAnnotatedBlocks(raw);
	for (const blk of blocks) {
		// Test name: `{line-text-content} {positional-marker-line}` (use the last content line)
		const contentLine = blk.content[blk.content.length - 1] || '';
		const niceName = `${contentLine} ${blk.markerLine}`;
		test(niceName, () => {
			// construct clean input (content lines joined with newlines)
			const input = blk.content.join('\n');
			// run scan0 across the whole input
			/** @type {number[]} */
			const output = [];
			scan0({ input, startOffset: 0, endOffset: input.length, output });

			// decode tokens and compare to assertions
			// map assertions by id
			const expectMap = mapAssertions(blk.markerLine, blk.assertions);

			// For simplicity support single assertion @1 per block describing the first token's flag name
			if (expectMap.size === 0) throw new Error('No @ assertions parsed');

			// Build mapping of marker id -> absolute character index in the input string
			// markerLine contains spaces and digits at columns aligned with the content above.
			const contentJoin = blk.content.join('\n');
			// compute offset of the last content line start in the joined content
			let lastLineOffset = 0;
			if (blk.content.length > 1) {
				for (let k = 0; k < blk.content.length - 1; k++) lastLineOffset += blk.content[k].length + 1; // +1 for newline
			}

			// Build arrays of marker chars and their column offsets (left-to-right)
			/** @type {string[]} */
			const positionMarkerChars = [];
			/** @type {number[]} */
			const positionMarkerLineOffsets = [];
			for (let col = 0; col < blk.markerLine.length; col++) {
				const ch = blk.markerLine.charAt(col);
				if (/\s/.test(ch)) continue;
				positionMarkerChars.push(ch);
				positionMarkerLineOffsets.push(col);
			}

			// Helper: map a marker label to its column offset (case-insensitive match)
			/**
			 * @param {string} label
			 */
			function findMarkerOffsetByLabel(label) {
				const up = label.toUpperCase();
				for (let k = 0; k < positionMarkerChars.length; k++) {
					if (positionMarkerChars[k].toUpperCase() === up) return positionMarkerLineOffsets[k];
				}
				return undefined;
			}

			// For each assertion label, map it to a token start by finding the token that covers
			// the corresponding marker column. Deduplicate multiple assertions that map to the same token start
			// by keeping the first one (canonicalization like verify-tokens.ts).
			const tokenStartToAssertionIndex = new Map();
			const assertionEntries = Array.from(expectMap.entries()); // [ [label, expectedName], ... ]
			for (let ai = 0; ai < assertionEntries.length; ai++) {
				const [label] = assertionEntries[ai];
				const col = findMarkerOffsetByLabel(label);
				if (col == null) continue;
				const absPos = lastLineOffset + col;

				// locate token covering absPos
				let acc = 0;
				let foundIndex = -1;
				for (let ti = 0; ti < output.length; ti++) {
					const t = output[ti];
					const len = (typeof t === 'number') ? (t & 0xffffff) : 0;
					if (absPos >= acc && absPos < acc + len) { foundIndex = ti; break; }
					acc += len;
				}
				if (foundIndex === -1) continue;
				// find token start absolute index
				let startAcc = 0;
				for (let ti = 0; ti < foundIndex; ti++) startAcc += (typeof output[ti] === 'number') ? (output[ti] & 0xffffff) : 0;
				if (!tokenStartToAssertionIndex.has(startAcc)) tokenStartToAssertionIndex.set(startAcc, ai);
			}

				const orderedTokenStarts = Array.from(tokenStartToAssertionIndex.keys()).sort((a, b) => a - b);

				const missing = [];
			// Build actual report lines: content, marker line, then per-canonical-marker reported flags
			const actualReportLines = [];
			for (const l of blk.content) actualReportLines.push(l);
			// We'll build a canonical position line with markers placed at token starts
			let positionLine = '';
			const assertionReportLines = [];
			for (let emitted = 0; emitted < orderedTokenStarts.length; emitted++) {
				const tokenStart = orderedTokenStarts[emitted];
				const assertionIndex = tokenStartToAssertionIndex.get(tokenStart);
				const [label, expectedName] = assertionEntries[assertionIndex];

				// canonical marker char
				const positionMarker = (emitted + 1) < 10 ? String(emitted + 1) :
					String.fromCharCode('A'.charCodeAt(0) + emitted - 9);

				const positionMarkerOffset = tokenStart - lastLineOffset;
				while (positionLine.length < positionMarkerOffset) positionLine += ' ';
				positionLine += positionMarker;

				// produce actual token data for this tokenStart
				// find token by start index
				let acc = 0;
				let tokenIdx = -1;
				for (let ti = 0; ti < output.length; ti++) {
					const len = (typeof output[ti] === 'number') ? (output[ti] & 0xffffff) : 0;
					if (acc === tokenStart) { tokenIdx = ti; break; }
					acc += len;
				}
				const tok = output[tokenIdx];
				const decoded = tok == null ? { length: 0, flags: 0 } : decodeProvisionalToken(tok);
				let flagsNum = decoded.flags;
				if (flagsNum === 0 && typeof tok === 'number') {
					flagsNum = 0;
					for (const v of Object.values(FLAG_NAMES)) if ((tok & v) === v) flagsNum |= v;
				}
				const names = Object.entries(FLAG_NAMES).filter(([, v]) => (flagsNum & v) === v).map(([k]) => k);
				assertionReportLines.push('@' + positionMarker + ' ' + (names.join('|') || flagsNum));

				// compare expected
				let expectedFlagValue;
				for (const [k, v] of Object.entries(FLAG_NAMES)) if (k === expectedName) { expectedFlagValue = v; break; }
				const has = expectedFlagValue ? ((flagsNum & expectedFlagValue) === expectedFlagValue) : false;
				if (!has) {
					// if mismatch we'll later assert with a diff using the built actual/expected blocks
				}
			}

				actualReportLines.push(positionLine);
				for (const ln of assertionReportLines) actualReportLines.push(ln);
				const actualReport = actualReportLines.join('\n');

				// Always build expected block text from original assertions for context
				const expectedLines = [];
				for (const l of blk.content) expectedLines.push(l);
				expectedLines.push(blk.markerLine);
				for (const a of blk.assertions) expectedLines.push(a);
				const expected = expectedLines.join('\n');

				// Compare canonicalized actual report with the original expected block. This will
				// surface mismatches where markers/labels don't map to tokens as written in the test.
				// Per spec: include repository-relative path and start line as third parameter to strictEqual
				const repoRelative = path.relative(process.cwd(), md).replace(/\\/g, '/');
				const lineNumber = blk.startLine;
				assert.strictEqual(actualReport, expected, repoRelative + ':' + lineNumber);

					if (missing.length) {
						// Build expected block text from original assertions for context
						const expectedLines = [];
						for (const l of blk.content) expectedLines.push(l);
						expectedLines.push(blk.markerLine);
						for (const a of blk.assertions) expectedLines.push(a);
						const expected = expectedLines.join('\n');

						// Use assert.strictEqual so the test runner prints a standard assertion diff
						if (missing.length) {
							// Build expected block text from original assertions for context
							const expectedLines = [];
							for (const l of blk.content) expectedLines.push(l);
							expectedLines.push(blk.markerLine);
							for (const a of blk.assertions) expectedLines.push(a);
							const expected = expectedLines.join('\n');
							assert.strictEqual(actualReport, expected);
						}
					}
		});
	}
}

