/**
 * Setext heading tests extracted from extensions.test.ts
 */
import { describe, expect, test } from 'vitest';
import { scanTokensStrings } from '../utils.test.js';
describe('Markdown Extensions — Setext Headings', () => {
    test('setext heading with equals underline', () => {
        const heading = `Main Heading\n============`;
        const tokens = scanTokensStrings(heading);
        expect(tokens.join('\n')).toContain('= EqualsToken');
    });
    test('setext heading with dash underline', () => {
        const heading = `Sub Heading\n-----------`;
        const tokens = scanTokensStrings(heading);
        expect(tokens.join('\n')).toContain('- DashToken');
    });
});
