// Static imports so esbuild bundles these libraries into the single output.
import * as commonmark from 'commonmark';
import MarkdownIt from 'markdown-it';
import * as marked from 'marked';
import { micromark } from 'micromark';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
// mparser.js is a local CommonJS build; require it at runtime so esbuild bundles it correctly
// Prefer importing the parser source so changes in the TS sources are picked up
// without needing an intermediate build step.
import { createScanner } from '../../../parser';

const mdIt = new MarkdownIt();
const remarkProcessor = unified().use(remarkParse as any);

export async function parseWithParser(name: string, content: string) {
  switch (name) {
    case 'mixpad': {
      if (createScanner && typeof createScanner === 'function') {
        const scanner = createScanner();
        scanner.initText(content);
        let tokenCount = 0;
        try {
          while (scanner.offsetNext < content.length) {
            scanner.scan();
            tokenCount++;
            if (tokenCount > content.length * 2) break;
          }
        } catch (e) {
          // fallthrough
        }
        return { tokenCount };
      }
      // fallback: simple token approximation
      return { tokenCount: content.length };
    }
    case 'marked': {
      const html = (marked as any).parse(content);
      return { html };
    }
    case 'markdown-it': {
      const tokens = mdIt.parse(content, {} as any);
      return { tokensLength: tokens.length };
    }
    case 'micromark': {
      const out = micromark(content);
      return { outLength: out.length };
    }
    case 'remark': {
      const tree = remarkProcessor.parse(content as any);
      return { type: tree.type };
    }
    case 'commonmark': {
      const reader = new (commonmark as any).Parser();
      const parsed = reader.parse(content);
      return { type: parsed.type };
    }
    default:
      return { error: 'unknown parser' };
  }
}
