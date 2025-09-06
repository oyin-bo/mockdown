import { spawn } from 'child_process';
import { join } from 'path';
import { promises as fs } from 'fs';

const TIMEOUT_MS = 180_000; // 3 minutes
const ITERATIONS = 5;

export async function runOrchestrator(argv: string[]) {
  const benchRoot = __dirname + '/..';
  const distBundle = join(benchRoot, 'dist', 'benchmark.bundle.js');
  // Simple dataset/parsers list for scaffolding
  const parsers = ['mixpad', 'marked', 'markdown-it', 'micromark', 'remark', 'commonmark'];
  // Temporarily exclude 'super-heavy' while we debug hang issues
  const datasets = [
    'small-simple',
    'docs-collection',
    // 'super-heavy'
  ];

  // Verify bundle exists
  try {
    const st = await fs.stat(distBundle);
    if (!st.isFile()) throw new Error('bundle missing');
  } catch (e) {
    console.error('Bundle not found. Run `npm run build` first.');
    process.exit(1);
  }

  // Allow focused runs via CLI: --only-parser=<name> and/or --only-dataset=<name>
  const onlyParserArg = argv.find(a => a.startsWith('--only-parser='));
  const onlyDatasetArg = argv.find(a => a.startsWith('--only-dataset='));
  const onlyParser = onlyParserArg ? onlyParserArg.split('=')[1] : null;
  const onlyDataset = onlyDatasetArg ? onlyDatasetArg.split('=')[1] : null;

  // Table printing helpers
  const headers = ['Parser', 'Time ms', 'Memory Δ', 'Tokens', 'Notes'];
  const parserColWidth = Math.max(...parsers.map(p => p.length), headers[0].length) + 2;
  const numColWidth = 14;
  const tokensColWidth = 20;
  const notesColWidth = 30;
  const totalWidth = parserColWidth + numColWidth + numColWidth + tokensColWidth + notesColWidth + 10;

  // pad with alignment option: 'left' (default) or 'right'
  function pad(s: string, width: number, align: 'left' | 'right' = 'left') {
    const str = String(s ?? '');
    if (str.length >= width) return str.slice(0, width);
    const space = ' '.repeat(width - str.length);
    return align === 'left' ? str + space : space + str;
  }

  function printHeader() {
  // add 1-char gap between Tokens and Notes so headers don't run together
  const row = pad(headers[0], parserColWidth, 'left') + pad(headers[1], numColWidth, 'right') + pad(headers[2], numColWidth, 'right') + pad(headers[3], tokensColWidth, 'right') + ' ' + pad(headers[4], notesColWidth - 1, 'left');
  console.log(row);
  }

  function printDatasetSeparator(name: string) {
    // Print a single dash line with the dataset name offset from the right.
    // Place the name about 8 characters from the right edge, without any '==' prefix.
    const shiftFromRight = 8;
    const label = ' ' + name;
    const padLen = Math.max(0, totalWidth - label.length - shiftFromRight);
    console.log('-'.repeat(padLen) + ' ' + name);
  }

  function extractTokens(m: any) {
    if (!m) return '';
    const r = m.result || {};
    try {
      if (typeof r.tokenCount === 'number') return r.tokenCount.toLocaleString();
      if (typeof r.tokensLength === 'number') return r.tokensLength.toLocaleString();
      if (typeof r.outLength === 'number') return r.outLength.toLocaleString() + 'ch';
      if (typeof r.html === 'string') return r.html.length.toLocaleString() + 'ch';
    } catch (e) {
      // fall back to plain string
    }
    if (r.type) return String(r.type);
    return '';
  }

  function printRow(m: any) {
    const parserName = pad(String(m.parser || ''), parserColWidth, 'left');
    const time = typeof m.parseTimeMs === 'number'
      ? Number(m.parseTimeMs).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })
      : (m._timedOut ? 'TIMEOUT' : '');
    let mem = '';
    if (typeof m.memoryDelta === 'number') {
      const kb = Math.round(m.memoryDelta / 1024);
      mem = kb.toLocaleString() + 'K';
    }
    const tokens = extractTokens(m);
    const notesParts: string[] = [];
    if (m.error) notesParts.push(String(m.error));
    if (m.exitCode !== undefined) notesParts.push('exit=' + String(m.exitCode));
    if (m._timedOut) notesParts.push('timedout');
    const notes = notesParts.join(' ');
    const row =
      pad(m.parser, parserColWidth).slice(m.parser.length) +
      pad(time, numColWidth, 'right') +
      pad(mem, numColWidth, 'right') +
      pad(tokens, tokensColWidth, 'right') +
      pad(notes, notesColWidth, 'left');
    console.log(row);
  }

  // Print the table header once
  printHeader();
  const runDatasets = onlyDataset ? [onlyDataset] : datasets;
  const runParsers = onlyParser ? [onlyParser] : parsers;

  for (const dataset of runDatasets) {
    printDatasetSeparator(dataset);
    for (const parser of runParsers) {
      const measurements: any[] = [];
      for (let iter = 0; iter < ITERATIONS; iter++) {
        const child = spawn(process.execPath, [distBundle, '--worker', `--parser=${parser}`, `--dataset=${dataset}`], { stdio: ['ignore', 'pipe', 'pipe'] });
        process.stdout.write(parser);

        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          try {
            // Prefer Node's process management APIs. Attempt a forceful kill by PID first.
            if (child.pid) {
              try {
                // numeric signal 9 is SIGKILL on POSIX; on Windows this will also terminate the process by PID.
                process.kill(child.pid as number, 'SIGKILL' as any);
              } catch (e) {
                // Fallback to child.kill()
                try { child.kill(); } catch (_) { /* ignore */ }
              }
            } else {
              try { child.kill(); } catch (_) { /* ignore */ }
            }
          } catch (e) {
            try { child.kill(); } catch (_) { /* ignore */ }
          }
        }, TIMEOUT_MS);

        const outChunks: Buffer[] = [];
        const errChunks: Buffer[] = [];
        child.stdout.on('data', (d) => outChunks.push(Buffer.from(d)));
        child.stderr.on('data', (d) => errChunks.push(Buffer.from(d)));

        const exitInfo: { code: number | null; signal: NodeJS.Signals | null } = await new Promise((res) => {
          child.on('exit', (code, signal) => { clearTimeout(timer); res({ code: code ?? null, signal: signal ?? null }); });
          // also handle error
          child.on('error', (err) => { clearTimeout(timer); res({ code: null, signal: null }); });
        });

        const raw = Buffer.concat(outChunks).toString('utf8').trim();
        const stderr = Buffer.concat(errChunks).toString('utf8').trim();
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (timedOut) parsed._timedOut = true;
            if (exitInfo.code !== null) parsed._exitCode = exitInfo.code;
            measurements.push(parsed);
            // print row for this iteration
            printRow(parsed);
            continue;
          } catch (e) {
            // fallthrough to record failure
          }
        }

        const failure: any = { error: 'worker-failed', parser, dataset };
        if (timedOut) failure.error = 'timeout';
        if (stderr) failure.stderr = stderr;
        if (raw) failure.stdout = raw;
        if (exitInfo.code !== null) failure.exitCode = exitInfo.code;
        measurements.push(failure);
        printRow(failure);
      }

      // Trim top2/bottom2 if possible and compute average
      const times = measurements.map(m => m.parseTimeMs).filter(t => typeof t === 'number');
      times.sort((a, b) => a - b);
      const trimmed = times.slice(2, Math.max(2, times.length - 2));
      const avg = trimmed.length ? trimmed.reduce((a, b) => a + b, 0) / trimmed.length : null;

      // Save aggregate result
      const resultsDir = join(benchRoot, 'results');
      await fs.mkdir(resultsDir, { recursive: true });
      const report = {
        parser, dataset, samples: measurements.length, averageParseTimeMs: avg, timestamp: new Date().toISOString()
      };
      const fname = join(resultsDir, `result-${parser}-${dataset}-${Date.now()}.json`);
      await fs.writeFile(fname, JSON.stringify(report, null, 2), 'utf8');
      // console.log('Wrote', fname);
    }
  }
}
