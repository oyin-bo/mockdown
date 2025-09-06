export function getDataset(name: string): { name: string; content: string } {
  function safeByteLength(s: string) {
    try {
      // @ts-ignore Buffer may not be declared in some TS environments
      if (typeof Buffer !== 'undefined' && typeof Buffer.byteLength === 'function') return Buffer.byteLength(s, 'utf8');
    } catch (e) { }
    try { return new TextEncoder().encode(s).length; } catch (e) { return s.length; }
  }
  if (name === 'small-simple') return { name, content: '# Hi\n\nThis is a small document.' };

  if (name === 'docs-collection') {
    // Read all markdown files from parser/docs and concatenate them.
    // We can't access fs here synchronously from the bundle entry during worker runs,
    // so the orchestrator/worker will import this and read files at runtime via a helper.
    // For simplicity, the worker will call this function which will read relative to repo.
    const root = process.cwd();
    // try reading parser/docs
    try {
      const { readdirSync, readFileSync } = require('fs');
      const path = require('path');
      const docsDir = path.join(root, 'parser', 'docs');
      const files = readdirSync(docsDir).filter((f: string) => f.endsWith('.md'));
      const parts = files.map((f: string) => readFileSync(path.join(docsDir, f), 'utf8'));
      return { name, content: parts.join('\n\n') };
    } catch (e) {
      return { name, content: '' };
    }
  }

  if (name === 'medium') {
    // Medium deterministic markdown generator ~512 KiB
    const targetBytes = 512 * 1024; // 512 KiB
    let seed = 12345;
    function next() { seed = (1103515245 * seed + 12345) >>> 0; return seed; }
    const words = ['lorem','ipsum','dolor','sit','amet','alpha','beta','gamma','delta','example','paragraph','token','scanner','parser','benchmark','node','typescript','javascript','markup','format'];
    const chunks: string[] = [];
    while (Buffer.byteLength(chunks.join('\n\n')) < targetBytes) {
      const wcount = (next() % 30) + 5;
      const lineWords: string[] = [];
      for (let i = 0; i < wcount; i++) lineWords.push(words[next() % words.length]);
      const r = next() % 100;
      if (r < 6) {
        chunks.push('# ' + lineWords.join(' '));
      } else if (r < 18) {
        chunks.push('## ' + lineWords.join(' '));
      } else if (r < 34) {
        chunks.push('- ' + lineWords.join(' '));
      } else if (r < 48) {
        // code block with more content
        chunks.push('```\n' + lineWords.join(' ') + '\n' + lineWords.join(' ') + '\n```');
      } else if (r < 62) {
        // inline code heavy
        chunks.push(lineWords.map(w => '`' + w + '`').join(' '));
      } else {
        chunks.push(lineWords.join(' '));
      }
    }
    return { name, content: chunks.join('\n\n') };
  }

  if (name === 'medium-mixed') {
    // Historical 'medium-mixed' dataset (~50 KiB) used in older benchmarks.
    const targetBytes = 50 * 1024; // 50 KiB
    let seed = 13579;
    function next() { seed = (1103515245 * seed + 12345) >>> 0; return seed; }
    const complexPatterns = [
      '# Complex Document\n\n',
      'This paragraph contains **nested *italic inside bold* formatting** and more text.\n\n',
      '```javascript\n// Code block\nfunction example() {\n  return "Hello World";\n}\n```\n\n',
      '| Column 1 | Column 2 | Column 3 |\n|----------|----------|----------|\n| Cell 1   | Cell 2   | Cell 3   |\n\n',
      '> This is a blockquote with **bold text**\n> and multiple lines.\n\n',
      '1. Ordered list item\n2. Another ordered item\n3. Third item with `code`\n\n'
    ];

    const parts: string[] = [];
    while (safeByteLength(parts.join('\n\n')) < targetBytes) {
      parts.push(complexPatterns[next() % complexPatterns.length]);
    }
    return { name, content: parts.join('\n\n').substring(0, targetBytes) };
  }

  if (name === 'pathological') {
    // Pathological but deterministic input designed to stress parsers.
    // Deeply nested lists, many emphasis/strong markers, many inline code and links.
    const targetBytes = 180 * 1024; // ~180 KiB
    let seed = 424242;
    function next() { seed = (214013 * seed + 2531011) >>> 0; return seed; }
    const emph = ['*', '**', '_', '__'];
    const chunks: string[] = [];

    // Deep nested list blocks
  for (let block = 0; safeByteLength(chunks.join('\n\n')) < targetBytes && block < 1200; block++) {
      const depth = 1 + (next() % 10);
      const items = 1 + (next() % 6);
      for (let i = 0; i < items; i++) {
        const indent = '  '.repeat(depth);
        const e = emph[next() % emph.length];
        // create a list item with heavy inline emphasis and code spans
        const words = [] as string[];
        const wcount = 3 + (next() % 12);
        for (let k = 0; k < wcount; k++) words.push(('word' + ((next() % 1000))));
        const code = '`' + words.slice(0, Math.min(3, words.length)).join('-') + '`';
        const item = `${indent}- ${e}${words.join(' ')}${e} ${code} [link](http://example.com/${next() % 10000})`;
        chunks.push(item);
      }
      // occasional long emphasis paragraph
      if ((next() % 5) === 0) {
        const e1 = emph[next() % emph.length];
        const e2 = emph[next() % emph.length];
        const parts = [] as string[];
        for (let p = 0; p < 4 + (next() % 6); p++) parts.push(e1 + 'patho' + (next() % 10000) + e2);
        chunks.push(parts.join(' '));
      }
    }
    return { name, content: chunks.join('\n\n') };
  }

  if (name === 'super-heavy') {
    // Deterministic pseudo-random generator (LCG) to produce ~12MB of markdown-like content.
    // Use a simple, fast generator so repeated runs are identical.
    const targetBytes = 12 * 1024 * 1024; // 12 MiB
    // LCG params (from Numerical Recipes)
    let seed = 42;
    function next() { seed = (1664525 * seed + 1013904223) >>> 0; return seed; }
    const words = ['lorem','ipsum','dolor','sit','amet','consectetur','adipiscing','elit','markdown','code','list','item','heading','subheading','example','paragraph','token','scanner','parser','benchmark'];
    const chunks: string[] = [];
  while (safeByteLength(chunks.join('\n\n')) < targetBytes) {
      const wcount = (next() % 40) + 1;
      const lineWords: string[] = [];
      for (let i = 0; i < wcount; i++) lineWords.push(words[next() % words.length]);
      // occasional markdown structures
      const r = next() % 100;
      if (r < 5) {
        chunks.push('# ' + lineWords.join(' '));
      } else if (r < 15) {
        chunks.push('## ' + lineWords.join(' '));
      } else if (r < 30) {
        chunks.push('- ' + lineWords.join(' '));
      } else if (r < 40) {
        chunks.push('```\n' + lineWords.join(' ') + '\n```');
      } else {
        chunks.push(lineWords.join(' '));
      }
    }
    return { name, content: chunks.join('\n\n') };
  }

  if (name === 'large-text-heavy') {
    // Historical large text heavy dataset (~500 KiB) used for throughput tests.
    const targetBytes = 500 * 1024; // 500 KiB
    const textBlock = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.\n\n';
    let content = '# Large Text Document\n\n';
  while (safeByteLength(content) < targetBytes) content += textBlock;
    return { name, content: content.substring(0, targetBytes) };
  }

  return { name, content: '' };
}
