/**
 * List extension tests extracted from extensions.test.ts
 */
import { describe, expect, test } from 'vitest';
import { scanTokensStrings } from '../utils.test.js';
describe('Markdown Extensions — Lists', () => {
    test('task lists with checkboxes', () => {
        const taskList = `- [x] Completed task\n- [ ] Incomplete task\n- [X] Another completed task`;
        const tokens = scanTokensStrings(taskList);
        // Expect dash tokens at line starts and bracket tokens present
        expect(tokens.join('\n')).toContain('- DashToken');
        expect(tokens.join('\n')).toContain('[ OpenBracketToken');
    });
    test('nested lists with different markers', () => {
        const nestedList = `1. First item\n   - Sub item A\n   - Sub item B\n2. Second item\n   * Sub item C\n   * Sub item D`;
        const tokens = scanTokensStrings(nestedList);
        const joined = tokens.join('\n');
        expect(joined).toContain('1 NumericLiteral');
        expect(joined).toContain('- DashToken');
        expect(joined).toContain('* AsteriskToken');
    });
});
