import { promises as fs } from 'fs';
import { join } from 'path';
import { performance } from 'perf_hooks';
import { getDataset } from './datasets';
import { parseWithParser } from './parsers';

export async function runWorker(argv: string[]) {
  const parserArg = argv.find(a => a.startsWith('--parser=')) || '--parser=mixpad';
  const datasetArg = argv.find(a => a.startsWith('--dataset=')) || '--dataset=small-simple';
  const parser = parserArg.split('=')[1];
  const datasetName = datasetArg.split('=')[1];

  const ds = getDataset(datasetName);
  const content = ds.content || '';

  if (global.gc) global.gc();
  const memBefore = process.memoryUsage().heapUsed;
  const t0 = performance.now();

  const result = await parseWithParser(parser, content as string);

  const t1 = performance.now();
  if (global.gc) global.gc();
  const memAfter = process.memoryUsage().heapUsed;

  const out = {
    parser,
    dataset: datasetName,
    parseTimeMs: t1 - t0,
    memoryDelta: memAfter - memBefore,
    result
  };

  // Write to stdout as JSON for orchestrator to consume
  console.log(JSON.stringify(out));
}
