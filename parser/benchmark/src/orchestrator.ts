import { spawn } from 'child_process';
import { join } from 'path';
import { promises as fs } from 'fs';

const TIMEOUT_MS = 180_000; // 3 minutes
const ITERATIONS = 5;

export async function runOrchestrator(argv: string[]) {
  const benchRoot = __dirname + '/..';
  const distBundle = join(benchRoot, 'dist', 'benchmark.bundle.js');
  // Simple dataset/parsers list for scaffolding
  const parsers = ['mixpad','marked','markdown-it','micromark','remark','commonmark'];
  const datasets = ['small-simple', 'docs-collection', 'super-heavy'];

  // Verify bundle exists
  try {
    const st = await fs.stat(distBundle);
    if (!st.isFile()) throw new Error('bundle missing');
  } catch (e) {
    console.error('Bundle not found. Run `npm run build` first.');
    process.exit(1);
  }

  for (const dataset of datasets) {
    for (const parser of parsers) {
      const measurements: any[] = [];
      for (let iter = 0; iter < ITERATIONS; iter++) {
        const child = spawn(process.execPath, [distBundle, '--worker', `--parser=${parser}`, `--dataset=${dataset}`], { stdio: ['ignore', 'pipe', 'pipe'] });
        const timer = setTimeout(() => { child.kill('SIGKILL'); }, TIMEOUT_MS);

        const outChunks: Buffer[] = [];
        child.stdout.on('data', (d) => outChunks.push(Buffer.from(d)));
        child.stderr.pipe(process.stderr);

        await new Promise((res) => child.on('exit', () => { clearTimeout(timer); res(null); }));

        const raw = Buffer.concat(outChunks).toString('utf8').trim();
        try {
          const parsed = JSON.parse(raw || '{}');
          measurements.push(parsed);
        } catch (e) {
          // parse error
        }
      }

      // Trim top2/bottom2 if possible and compute average
      const times = measurements.map(m => m.parseTimeMs).filter(t => typeof t === 'number');
      times.sort((a,b)=>a-b);
      const trimmed = times.slice(2, Math.max(2, times.length-2));
      const avg = trimmed.length ? trimmed.reduce((a,b)=>a+b,0)/trimmed.length : null;

      // Save aggregate result
      const resultsDir = join(benchRoot, 'results');
      await fs.mkdir(resultsDir, { recursive: true });
      const report = {
        parser, dataset, samples: measurements.length, averageParseTimeMs: avg, timestamp: new Date().toISOString()
      };
      const fname = join(resultsDir, `result-${parser}-${dataset}-${Date.now()}.json`);
      await fs.writeFile(fname, JSON.stringify(report, null, 2), 'utf8');
      console.log('Wrote', fname);
    }
  }
}
