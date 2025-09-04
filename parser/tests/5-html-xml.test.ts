import { describe, expect, test } from 'vitest';
import { verifyTokens } from './verify-tokens';

describe('XML-like Constructs - Stage 4', () => {
  test('CDATA section', () => {
    expect(verifyTokens(`
<![CDATA[ var x = "<test>"; ]]>
1
@1 HtmlCdata "<![CDATA[ var x = \\"<test>\\"; ]]>"
`)).toBe(`
<![CDATA[ var x = "<test>"; ]]>
1
@1 HtmlCdata "<![CDATA[ var x = \\"<test>\\"; ]]>"
`);
  });

  test('processing instruction', () => {
    expect(verifyTokens(`
<?xml version="1.0"?>
1
@1 HtmlProcessingInstruction "<?xml version=\\"1.0\\"?>"
`)).toBe(`
<?xml version="1.0"?>
1
@1 HtmlProcessingInstruction "<?xml version=\\"1.0\\"?>"
`);
  });
});