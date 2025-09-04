/**
 * Parser adapters for benchmarking different Markdown parsers
 * 
 * Each adapter provides a consistent interface for measuring parser performance.
 */

// Import Mixpad scanner
import { createScanner } from '../scanner/scanner.ts';

export interface ParserAdapter {
  name: string;
  version: string;
  parse(content: string): any;
  supportsIncremental?: boolean;
  parseIncremental?(content: string, changes: any[]): any;
}

/**
 * Mixpad Scanner Adapter
 */
export const MixpadAdapter: ParserAdapter = {
  name: 'mixpad',
  version: '0.0.4',
  parse(content: string) {
    const scanner = createScanner();
    scanner.initText(content);
    let tokenCount = 0;
    while (scanner.offsetNext < content.length) {
      scanner.scan();
      tokenCount++;
    }
    return { tokenCount };
  },
  supportsIncremental: false // For now, we don't have incremental parsing implemented
};

/**
 * Marked Adapter (if available)
 */
function createMarkedAdapter(): ParserAdapter | null {
  try {
    // Dynamic import to handle missing dependency gracefully
    const marked = require('marked');
    return {
      name: 'marked',
      version: marked.version || 'unknown',
      parse(content: string) {
        return marked.parse(content);
      }
    };
  } catch (error) {
    console.warn('marked not available:', error.message);
    return null;
  }
}

/**
 * Markdown-it Adapter (if available)
 */
function createMarkdownItAdapter(): ParserAdapter | null {
  try {
    const MarkdownIt = require('markdown-it');
    const md = new MarkdownIt();
    return {
      name: 'markdown-it',
      version: MarkdownIt.version || 'unknown',
      parse(content: string) {
        return md.parse(content);
      }
    };
  } catch (error) {
    console.warn('markdown-it not available:', error.message);
    return null;
  }
}

/**
 * Micromark Adapter (if available)
 */
function createMicromarkAdapter(): ParserAdapter | null {
  try {
    const { micromark } = require('micromark');
    return {
      name: 'micromark',
      version: 'unknown', // micromark doesn't expose version easily
      parse(content: string) {
        return micromark(content);
      }
    };
  } catch (error) {
    console.warn('micromark not available:', error.message);
    return null;
  }
}

/**
 * Remark Adapter (if available)
 */
function createRemarkAdapter(): ParserAdapter | null {
  try {
    const { remark } = require('remark');
    const processor = remark();
    return {
      name: 'remark',
      version: 'unknown',
      parse(content: string) {
        return processor.parse(content);
      }
    };
  } catch (error) {
    console.warn('remark not available:', error.message);
    return null;
  }
}

/**
 * CommonMark Adapter (if available)
 */
function createCommonMarkAdapter(): ParserAdapter | null {
  try {
    const commonmark = require('commonmark');
    const parser = new commonmark.Parser();
    return {
      name: 'commonmark',
      version: 'unknown',
      parse(content: string) {
        return parser.parse(content);
      }
    };
  } catch (error) {
    console.warn('commonmark not available:', error.message);
    return null;
  }
}

/**
 * Get all available adapters
 */
export function getAvailableAdapters(): ParserAdapter[] {
  const adapters: ParserAdapter[] = [MixpadAdapter];
  
  // Add competitive parsers if available
  const competitiveAdapters = [
    createMarkedAdapter(),
    createMarkdownItAdapter(), 
    createMicromarkAdapter(),
    createRemarkAdapter(),
    createCommonMarkAdapter()
  ].filter(adapter => adapter !== null) as ParserAdapter[];
  
  adapters.push(...competitiveAdapters);
  
  return adapters;
}

// Export adapters instance
export const adapters = getAvailableAdapters();