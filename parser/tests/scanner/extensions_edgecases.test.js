import { describe, expect, test } from 'vitest';
import { scanTokensStrings } from '../utils.test.js';
describe('Markdown Extensions — Edge Cases', () => {
    test('malformed math delimiters', () => {
        const tokens = scanTokensStrings('$incomplete math');
        expect(tokens).toEqual([
            '$ DollarToken',
            'incomplete Identifier',
            '" " WhitespaceTrivia',
            'math Identifier',
            'EndOfFileToken'
        ]);
    });
    test('malformed table syntax', () => {
        const tokens = scanTokensStrings('| incomplete table');
        expect(tokens).toEqual([
            '| PipeToken',
            '" " WhitespaceTrivia',
            'incomplete Identifier',
            '" " WhitespaceTrivia',
            'table Identifier',
            'EndOfFileToken'
        ]);
    });
    test('malformed attribute blocks', () => {
        const tokens = scanTokensStrings('{incomplete attribute');
        expect(tokens).toEqual([
            '{ OpenBraceToken',
            'incomplete Identifier',
            '" " WhitespaceTrivia',
            'attribute Identifier',
            'EndOfFileToken'
        ]);
    });
    test('mixed delimiters', () => {
        const tokens = scanTokensStrings('```\ncode\n~~~');
        const joined = tokens.join('\n');
        expect(joined).toContain('``` BacktickToken');
        expect(joined).toContain('~~~ TildeToken');
    });
});
