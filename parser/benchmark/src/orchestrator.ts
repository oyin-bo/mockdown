import { spawn } from 'child_process';
import { join } from 'path';
import { promises as fs } from 'fs';

const TIMEOUT_MS = 180_000; // 3 minutes
const ITERATIONS = 5;

export async function runOrchestrator(argv: string[]) {
  const benchRoot = __dirname + '/..';
  const distBundle = join(benchRoot, 'dist', 'benchmark.bundle.js');
  // Simple dataset/parsers list for scaffolding
  const parsers = ['mixpad'];
  const datasets = ['small-simple'];

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
      for (let iter = 0; iter < ITERATIONS; iter++) {
        const child = spawn(process.execPath, [distBundle, '--worker', `--parser=${parser}`, `--dataset=${dataset}`], { stdio: ['ignore', 'pipe', 'pipe'] });
        const timer = setTimeout(() => { child.kill('SIGKILL'); }, TIMEOUT_MS);
        child.stdout.pipe(process.stdout);
        child.stderr.pipe(process.stderr);
        await new Promise((res) => child.on('exit', () => { clearTimeout(timer); res(null); }));
      }
    }
  }
}
