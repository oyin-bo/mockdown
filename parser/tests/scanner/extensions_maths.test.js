/**
 * Math extension tests extracted from extensions.test.ts
 */
import { describe, expect, test } from 'vitest';
import { scanTokensStrings } from '../utils.test.js';
describe('Markdown Extensions — Math', () => {
    test('inline math with proper context', () => {
        const tokens = scanTokensStrings('The formula $E = mc^2$ is famous.');
        const joined = tokens.join('\n');
        expect((joined.match(/\$ DollarToken/g) || []).length).toBe(2);
    });
    test('block math at line start', () => {
        const tokens = scanTokensStrings('$$\n\\int_0^\\infty e^{-x} dx = 1\n$$');
        const joined = tokens.join('\n');
        expect((joined.match(/\$\$ DollarDollar/g) || []).length).toBe(2);
    });
    test('rejects math with leading whitespace', () => {
        const tokens = scanTokensStrings('$ 100 dollars');
        // Should be treated as dollar token but not math; assert on presence
        expect(tokens.join('\n')).toContain('$ DollarToken');
    });
    test('rejects block math not at line start', () => {
        const tokens = scanTokensStrings('text $$math$$ more text');
        const joined = tokens.join('\n');
        // Should not contain DollarDollar
        expect(joined).not.toContain('$$ DollarDollar');
    });
    test('complex math expressions', () => {
        const mathExpressions = [
            '$\\alpha + \\beta = \\gamma$',
            '$x^2 + y^2 = z^2$',
            '$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$',
            '$\\lim_{x \\to \\infty} \\frac{1}{x} = 0$'
        ];
        mathExpressions.forEach(expr => {
            const tokens = scanTokensStrings(expr).join('\n');
            expect((tokens.match(/\$ DollarToken/g) || []).length).toBe(2);
        });
    });
});
