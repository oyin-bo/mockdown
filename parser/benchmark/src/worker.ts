import { join } from 'path';
import { promises as fs } from 'fs';

export async function runWorker(argv: string[]) {
  // Parse args: --parser=name --dataset=name
  const parserArg = argv.find(a => a.startsWith('--parser=')) || '--parser=mixpad';
  const datasetArg = argv.find(a => a.startsWith('--dataset=')) || '--dataset=small-simple';
  const parser = parserArg.split('=')[1];
  const dataset = datasetArg.split('=')[1];

  // Load dataset (scaffold)
  const benchRoot = __dirname + '/..';
  const resultsDir = join(benchRoot, 'results');
  await fs.mkdir(resultsDir, { recursive: true });

  // Simulate parse and output JSON to stdout
  const out = { parser, dataset, parseTimeMs: 1, memoryDelta: 0, success: true };
  console.log(JSON.stringify(out));
}
