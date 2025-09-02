import { describe, expect, test } from 'vitest';
import { scanTokensStrings } from '../utils.test.js';
describe('Markdown Extensions — Attribute Blocks', () => {
    test('simple attribute block', () => {
        const tokens = scanTokensStrings('{#myid}');
        expect(tokens).toEqual(['{#myid} OpenBraceToken', 'EndOfFileToken']);
    });
    test('attribute block with class', () => {
        const tokens = scanTokensStrings('{.myclass}');
        expect(tokens).toEqual(['{.myclass} OpenBraceToken', 'EndOfFileToken']);
    });
    test('attribute block with key-value pairs', () => {
        const tokens = scanTokensStrings('{style="color: red" data-value="test"}').join('\n');
        expect(tokens).toContain(' OpenBraceToken');
        expect(tokens).toContain('style');
        expect(tokens).toContain('data-value');
    });
    test('complex attribute block', () => {
        const tokens = scanTokensStrings('{#id .class1 .class2 key=value style="color: blue"}').join('\n');
        expect(tokens).toContain(' OpenBraceToken');
        expect(tokens).toContain('#id');
        expect(tokens).toContain('.class1');
    });
    test('nested braces in attribute values', () => {
        const tokens = scanTokensStrings('{style="background: {color}"}').join('\n');
        expect(tokens).toContain(' OpenBraceToken');
        expect(tokens).toContain('{color}');
    });
    test('empty attribute block', () => {
        const tokens = scanTokensStrings('{}');
        expect(tokens).toEqual(['{ OpenBraceToken', '} CloseBraceToken', 'EndOfFileToken']);
    });
    test('multiline attribute blocks are rejected', () => {
        const tokens = scanTokensStrings('{\nid="test"\n}');
        // Should fallback to plain brace tokens, not full attribute value
        expect(tokens).toEqual([
            '{ OpenBraceToken',
            '"\\n" NewLineTrivia',
            'id Identifier',
            '= EqualsToken',
            '"\\"" Unknown',
            'test Identifier',
            '"\\"" Unknown',
            '"\\n" NewLineTrivia',
            '} CloseBraceToken',
            'EndOfFileToken',
        ]);
    });
});
