import { describe, expect, test } from 'vitest';
import { scanTokensStrings } from '../utils.test.js';
describe('Code Blocks and Math (concise)', () => {
    test('scans inline math', () => {
        expect(scanTokensStrings('text $x + y$ more text')).toContain('$ DollarToken');
    });
    test('scans block math', () => {
        const tokens = scanTokensStrings('$$\nx^2 + y^2 = z^2\n$$');
        expect(tokens[0]).toBe('$$ DollarDollar');
    });
    test('does not treat dollar followed by whitespace as math', () => {
        const tokens = scanTokensStrings('$ 100');
        expect(tokens[0]).toBe('$ DollarToken');
    });
    test('scans backtick code fence', () => {
        const tokens = scanTokensStrings('```javascript\nconsole.log("hello");\n```');
        expect(tokens[0]).toBe('```javascript BacktickToken');
    });
    test('scans tilde code fence', () => {
        const tokens = scanTokensStrings('~~~python\nprint("hello")\n~~~');
        expect(tokens[0]).toBe('~~~python TildeToken');
    });
    test('scans inline code with single backtick', () => {
        const tokens = scanTokensStrings('`code`');
        expect(tokens[0]).toBe('` BacktickToken');
    });
    test('scans inline code with double backticks', () => {
        const tokens = scanTokensStrings('``code with ` backtick``');
        expect(tokens[0]).toBe('`` BacktickToken');
    });
});
