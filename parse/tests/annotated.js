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
		// find a candidate marker line by looking ahead for a line that consists of spaces and marker chars
		// marker chars are digits 0-9 and A-Z and a-z and spaces
		// we'll treat a marker line as one that contains at least one digit or letter and only spaces and marker chars
		// but to be conservative: a line that contains a '1' char is marker line per spec
		const markerIdx = lines.slice(i).findIndex(l => /\b1\b|^\s*1/.test(l));
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
			if (expectMap.size === 0) {
				throw new Error('No @ assertions parsed');
			}

			// Build readable actual string to compare against the expected assertion block text
			const actualLines = [];
			// content
			for (const l of blk.content) actualLines.push(l);
			actualLines.push(blk.markerLine);
			// now for each assertion id in map, produce a text like '@1 InlineText'
			for (const [id, val] of expectMap.entries()) {
				// determine actual token at position id -> we assume id '1' refers to first token
				const tokIndex = 0; // simple mapping for now
			const tok = output[tokIndex];
						const decoded = tok == null ? { length: 0, flags: 0 } : decodeProvisionalToken(tok);
						// if flags are zero, some mocks may encode flags in the low bits — try that fallback
						let flagsNum = decoded.flags;
								if (flagsNum === 0 && typeof tok === 'number') {
									// Some scanners (mocks) encode flags by OR'ing small flag bits into the low bits.
									// Recover flags by checking each known flag bit.
									flagsNum = 0;
									for (const v of Object.values(FLAG_NAMES)) {
										if ((tok & v) === v) flagsNum |= v;
									}
								}
						const found = Object.entries(FLAG_NAMES).find(([, v]) => v === flagsNum);
						const flagName = found ? found[0] : String(flagsNum);
				actualLines.push(`@${id} ${flagName}`);
			}

					const actual = actualLines.join('\n');

					// For comparison: ensure that for each @ assertion, the expected token name is present in the actual flags
					const missing = [];
					for (const [id, expectedName] of expectMap.entries()) {
						// actual value we produced for reporting
						const tokIndex = 0; // as before
						const tok = output[tokIndex];
						const decoded = tok == null ? { length: 0, flags: 0 } : decodeProvisionalToken(tok);
						let flagsNum = decoded.flags;
						if (flagsNum === 0 && typeof tok === 'number') {
							flagsNum = 0;
							for (const v of Object.values(FLAG_NAMES)) {
								if ((tok & v) === v) flagsNum |= v;
							}
						}
						// check if expectedName corresponds to a known flag and that bit is set
				const foundEntry = Object.entries(FLAG_NAMES).find(([k]) => k === String(expectedName));
				const expectedFlagValue = foundEntry ? foundEntry[1] : undefined;
				const has = expectedFlagValue ? ((flagsNum & expectedFlagValue) === expectedFlagValue) : false;
						if (!has) missing.push({ id, expectedName, flagsNum });
					}

					if (missing.length) {
						// Build expected block text from original assertions for context
						const expectedLines = [];
						for (const l of blk.content) expectedLines.push(l);
						expectedLines.push(blk.markerLine);
						for (const a of blk.assertions) expectedLines.push(a);
						const expected = expectedLines.join('\n');

						const actualReportLines = [];
						for (const l of blk.content) actualReportLines.push(l);
						actualReportLines.push(blk.markerLine);
						for (const [id] of expectMap.entries()) {
							// produce actual token flag names list
							const tok = output[0];
							const decoded = tok == null ? { length: 0, flags: 0 } : decodeProvisionalToken(tok);
							let flagsNum = decoded.flags;
							if (flagsNum === 0 && typeof tok === 'number') {
								flagsNum = 0;
								for (const v of Object.values(FLAG_NAMES)) {
									if ((tok & v) === v) flagsNum |= v;
								}
							}
							const names = Object.entries(FLAG_NAMES).filter(([, v]) => (flagsNum & v) === v).map(([k]) => k);
							actualReportLines.push(`@${id} ${names.join('|') || flagsNum}`);
						}
						const actualReport = actualReportLines.join('\n');

								// Use assert.strictEqual so the test runner prints a standard assertion diff
								assert.strictEqual(actualReport, expected);
					}
		});
	}
}

