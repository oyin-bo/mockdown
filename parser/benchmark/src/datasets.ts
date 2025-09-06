export function getDataset(name: string): { name: string; content: string } {
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

  if (name === 'super-heavy') {
    // Deterministic pseudo-random generator (LCG) to produce ~12MB of markdown-like content.
    // Use a simple, fast generator so repeated runs are identical.
    const targetBytes = 12 * 1024 * 1024; // 12 MiB
    // LCG params (from Numerical Recipes)
    let seed = 42;
    function next() { seed = (1664525 * seed + 1013904223) >>> 0; return seed; }
    const words = ['lorem','ipsum','dolor','sit','amet','consectetur','adipiscing','elit','markdown','code','list','item','heading','subheading','example','paragraph','token','scanner','parser','benchmark'];
    const chunks: string[] = [];
    while (Buffer.byteLength(chunks.join('\n\n')) < targetBytes) {
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

  return { name, content: '' };
}
