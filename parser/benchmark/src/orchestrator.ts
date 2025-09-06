import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';

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
    'medium',
    'medium-mixed',
    'large-text-heavy',
    'pathological',
    //'super-heavy'
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
  const updateReadme = argv.includes('--update-readme');
  const saveMeasurements = argv.includes('--save-measurements');

  // Table printing helpers
  const headers = ['Parser', 'Time ms', 'Memory +/-', 'Tokens', 'Notes'];
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

  // Collected reports kept in-memory. By default we do not write per-run JSON files.
  const collectedReports: any[] = [];

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
      const trimmedTimes = times.slice(2, Math.max(2, times.length - 2));
      const avgTime = trimmedTimes.length ? trimmedTimes.reduce((a, b) => a + b, 0) / trimmedTimes.length : null;

      // memory average (in bytes) excluding top2/bottom2
      const mems = measurements.map(m => m.memoryDelta).filter(t => typeof t === 'number');
      mems.sort((a, b) => a - b);
      const trimmedMems = mems.slice(2, Math.max(2, mems.length - 2));
      const avgMem = trimmedMems.length ? trimmedMems.reduce((a, b) => a + b, 0) / trimmedMems.length : null;

      // tokens numeric extraction
      function getNumericTokens(m: any): { val: number; isChars: boolean } | null {
        try {
          const r = m.result || {};
          if (typeof r.tokenCount === 'number') return { val: r.tokenCount, isChars: false };
          if (typeof r.tokensLength === 'number') return { val: r.tokensLength, isChars: false };
          if (typeof r.outLength === 'number') return { val: r.outLength, isChars: true };
          if (typeof r.html === 'string') return { val: r.html.length, isChars: true };
        } catch (e) { /* ignore */ }
        return null;
      }

      const tokenEntries = measurements.map(getNumericTokens).filter((x): x is { val: number; isChars: boolean } => x !== null);
      const tokenVals = tokenEntries.map(t => t.val);
      tokenVals.sort((a, b) => a - b);
      const trimmedTokens = tokenVals.slice(2, Math.max(2, tokenVals.length - 2));
      const avgTokensNum = trimmedTokens.length ? Math.round(trimmedTokens.reduce((a, b) => a + b, 0) / trimmedTokens.length) : null;
      const tokensAreChars = tokenEntries.length ? tokenEntries.reduce((acc, e) => acc + (e.isChars ? 1 : 0), 0) > tokenEntries.length / 2 : false;

      // Print summary row: underscores as padding, no parser name
      function padChar(s: string, width: number, align: 'left' | 'right' = 'left', ch = '_') {
        const str = String(s ?? '');
        if (str.length >= width) return str.slice(0, width);
        const pad = ch.repeat(width - str.length);
        return align === 'left' ? str + pad : pad + str;
      }

      const summaryParserCol = '_'.repeat(parserColWidth);
      const avgTimeStr = avgTime !== null ? Number(avgTime).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 }) : '';
      const avgMemStr = avgMem !== null ? Math.round(avgMem / 1024).toLocaleString() + 'K' : '';
      const avgTokensStr = avgTokensNum !== null ? (avgTokensNum.toLocaleString() + (tokensAreChars ? 'ch' : '')) : '';

      const summaryRow =
        padChar(summaryParserCol, parserColWidth, 'left', '_') +
        padChar(avgTimeStr, numColWidth, 'right', '_') +
        padChar(avgMemStr, numColWidth, 'right', '_') +
        padChar(avgTokensStr, tokensColWidth, 'right', '_') +
        padChar('', notesColWidth, 'left', '_');
      console.log(summaryRow);

      // Keep the aggregate result in memory. If the user requested a single
      // measurements file, we'll write it once at the end.
      const report = {
        parser,
        dataset,
        samples: measurements.length,
        averageParseTimeMs: avgTime,
        averageMemoryBytes: avgMem,
        averageTokens: avgTokensNum,
        tokensAreChars,
        timestamp: new Date().toISOString(),
        measurements // preserve fine-grained per-iteration measurements in memory
      };
      collectedReports.push(report);
    }
  }

  // If requested, write a single measurements JSON file containing all collected reports
  if (saveMeasurements) {
    try {
      const resultsDir = join(benchRoot, 'results');
      await fs.mkdir(resultsDir, { recursive: true });
      const fname = join(resultsDir, `measurements-${Date.now()}.json`);
      await fs.writeFile(fname, JSON.stringify({ generated: new Date().toISOString(), reports: collectedReports }, null, 2), 'utf8');
      console.log('Wrote consolidated measurements to', fname);
    } catch (e) {
      console.error('Failed to write measurements file:', (e as Error).message);
    }
  }

  // Conservative README updater: only replace numeric table cells in the existing
  // benchmark block between <!-- BENCHMARK_RESULTS_START --> and <!-- BENCHMARK_RESULTS_END -->.
  // It uses the in-memory `collectedReports` and does not touch any other part of the README.
  if (updateReadme) {
    try {
      const readmePath = join(benchRoot, 'README.md');
      const readmeRaw = await fs.readFile(readmePath, 'utf8');
      const startMarker = '<!-- BENCHMARK_RESULTS_START -->';
      const endMarker = '<!-- BENCHMARK_RESULTS_END -->';
      const startIdx = readmeRaw.indexOf(startMarker);
      const endIdx = readmeRaw.indexOf(endMarker);
      if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
        console.log('README does not contain expected markers; skipping update.');
        return;
      }

      const before = readmeRaw.slice(0, startIdx + startMarker.length);
      const block = readmeRaw.slice(startIdx + startMarker.length, endIdx);
      const after = readmeRaw.slice(endIdx);

      // Build a quick map latestReport[dataset][parser] -> report
      const latestReport: Record<string, Record<string, any>> = {};
      for (const r of collectedReports) {
        if (!r.dataset || !r.parser) continue;
        latestReport[r.dataset] = latestReport[r.dataset] || {};
        const prev = latestReport[r.dataset][r.parser];
        if (!prev || (r.timestamp && Date.parse(r.timestamp) > Date.parse(prev.timestamp || '0'))) latestReport[r.dataset][r.parser] = r;
      }

      // Replace numeric cells in table rows matching: | ParserName | ... |
      // We'll scan the block line-by-line and for each table row that starts with '| parserName ' and
      // has 5 columns, we'll replace columns 2..5 with computed numeric values if available.
      const lines = block.split('\n');
      const outLines: string[] = [];
      const tableRowRe = /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/;
      let currentDataset: string | null = null;
      const datasetHeaderRe = /^###\s+(.+)$/;
      for (const line of lines) {
        const m = datasetHeaderRe.exec(line);
        if (m) {
          currentDataset = m[1].trim();
          outLines.push(line);
          continue;
        }
        const row = tableRowRe.exec(line);
        if (!row || !currentDataset) { outLines.push(line); continue; }

        const parserName = row[1].trim();
        const existingTime = row[2].trim();
        const existingThroughput = row[3].trim();
        const existingMem = row[4].trim();
        const existingTokens = row[5].trim();

        const rep = latestReport[currentDataset] && latestReport[currentDataset][parserName];
        if (!rep) { outLines.push(line); continue; }

        // Compute conservative replacements
        const time = typeof rep.averageParseTimeMs === 'number' ? Number(rep.averageParseTimeMs).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 }) : existingTime;
        let throughput = existingThroughput;
        if (typeof rep.averageParseTimeMs === 'number') {
          // try to compute throughput if dataset size available in report (it may not be)
          let datasetBytes: number | null = typeof rep.datasetBytes === 'number' ? rep.datasetBytes : null;
          if (datasetBytes === null && rep.measurements && rep.measurements.length) {
            const first = rep.measurements[0];
            if (first && first.input && typeof first.input === 'string') {
              // Use Buffer.byteLength if available, otherwise TextEncoder
              try {
                // @ts-ignore Buffer may not be declared in TS env
                datasetBytes = typeof Buffer !== 'undefined' ? Buffer.byteLength(first.input, 'utf8') : (new TextEncoder().encode(first.input).length);
              } catch (e) {
                try { datasetBytes = new TextEncoder().encode(first.input).length; } catch (_) { datasetBytes = null; }
              }
            }
          }
          if (datasetBytes !== null && rep.averageParseTimeMs > 0) {
            const mb = datasetBytes / (1024 * 1024);
            const s = rep.averageParseTimeMs / 1000;
            const val = s > 0 ? (mb / s) : 0;
            throughput = Number(val).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
          }
        }
        const mem = typeof rep.averageMemoryBytes === 'number' ? Math.round(rep.averageMemoryBytes / 1024).toLocaleString() : existingMem;
        const tokens = typeof rep.averageTokens === 'number' ? rep.averageTokens.toLocaleString() : existingTokens;

        outLines.push(`| ${parserName} | ${time} | ${throughput} | ${mem} | ${tokens} |`);
      }

      // Normalize so we always insert exactly one newline after the start marker and
      // exactly one newline before the end marker. This prevents growth of blank
      // lines when the updater runs multiple times.
      let prefix = before;
      if (!prefix.endsWith('\n')) prefix += '\n';
      // Remove any leading newlines from the 'after' slice so we don't accumulate
      // blank lines before the end marker.
      let suffix = after;
      while (suffix.startsWith('\n')) suffix = suffix.slice(1);

      // Remove leading blank lines so we don't accumulate empty lines after the start marker.
      while (outLines.length > 0 && outLines[0].trim() === '') outLines.shift();
      const content = outLines.join('\n').replace(/\s+$/g, '');
      const out = prefix + content + '\n' + suffix;
      await fs.writeFile(readmePath, out, 'utf8');
      console.log('Conservatively updated README at', readmePath);
    } catch (e) {
      console.error('Failed to update README:', (e as Error).message);
    }
  }
}
