/**
 * Fenced code block tests extracted from extensions.test.ts
 */
import { describe, expect, test } from 'vitest';
import { scanTokensStrings } from '../utils.test.js';
describe('Markdown Extensions — Fenced Code Blocks', () => {
    test('backtick fence with language', () => {
        const tokens = scanTokensStrings('```javascript\nconsole.log("hello");\n```');
        const joined = tokens.join('\n');
        expect(joined).toContain('```javascript BacktickToken');
    });
    test('tilde fence with language', () => {
        const tokens = scanTokensStrings('~~~python\nprint("hello")\n~~~');
        expect(tokens.join('\n')).toContain('~~~python TildeToken');
    });
    test('fence with complex info string', () => {
        const tokens = scanTokensStrings('```javascript {linenos=true, hl_lines=[1,3]}').join('\n');
        // token text may be JSON-quoted; assert on key parts instead
        expect(tokens).toContain(' BacktickToken');
        expect(tokens).toMatch(/javascript/);
        expect(tokens).toMatch(/hl_lines/);
    });
    test('fence without language', () => {
        const tokens = scanTokensStrings('```\ncode\n```');
        expect(tokens).toEqual([
            '``` BacktickToken',
            '"\\n" NewLineTrivia',
            'code Identifier',
            '"\\n" NewLineTrivia',
            '``` BacktickToken',
            'EndOfFileToken'
        ]);
    });
    test('varying fence lengths', () => {
        const testCases = ['```', '````', '`````'];
        testCases.forEach(fence => {
            const tokens = scanTokensStrings(`${fence}\ncode\n${fence}`);
            expect(tokens.join('\n')).toContain(`${fence} BacktickToken`);
        });
    });
    test('inline code with multiple backticks', () => {
        const tokens = scanTokensStrings('``code with ` backtick``');
        expect(tokens).toEqual([
            '`` BacktickToken',
            'code Identifier',
            '" " WhitespaceTrivia',
            'with Identifier',
            '" " WhitespaceTrivia',
            '` BacktickToken',
            '" " WhitespaceTrivia',
            'backtick Identifier',
            '`` BacktickToken',
            'EndOfFileToken'
        ]);
    });
});
