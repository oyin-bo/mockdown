# Scanner Performance Benchmarking Tool

## Overview

A comprehensive benchmarking framework to compare the raw performance of our Mixpad scanner against leading Markdown parsers, focusing on parsing speed, memory efficiency, and incremental update performance.

## Competitive Landscape

### Target Competitors

1. **marked** - The most popular JavaScript Markdown parser (~30k stars)
   - Well-established, battle-tested
   - Pure JavaScript, no dependencies
   - Good baseline for performance comparison

2. **markdown-it** - Feature-rich parser with plugins (~16k stars)
   - Highly extensible architecture
   - Similar feature set to our goals
   - Active development, modern codebase

3. **micromark** - CommonMark-compliant, performant parser (~2k stars)
   - Zero-allocation design principles (similar to ours)
   - Our architecture is micromark-inspired
   - Direct performance comparison target

4. **remark** - Part of unified ecosystem (~6k stars)
   - AST-focused approach
   - Wide ecosystem adoption
   - Good for feature completeness comparison

5. **commonmark.js** - Reference CommonMark implementation
   - Specification compliance baseline
   - Official reference for correctness

## Benchmarking Architecture

### 1. Test Data Generation

```typescript
interface BenchmarkDataset {
  name: string;
  description: string;
  content: string;
  size: number;
  characteristics: string[];
}

const datasets: BenchmarkDataset[] = [
  {
    name: 'small-simple',
    description: 'Basic Markdown with simple formatting',
    size: 1024, // 1KB
    characteristics: ['headers', 'paragraphs', 'basic-emphasis']
  },
  {
    name: 'medium-mixed',
    description: 'Real-world document with mixed elements',
    size: 50 * 1024, // 50KB
    characteristics: ['lists', 'code-blocks', 'links', 'tables', 'math']
  },
  {
    name: 'large-text-heavy',
    description: 'Large document with extensive text content',
    size: 500 * 1024, // 500KB
    characteristics: ['long-paragraphs', 'minimal-formatting']
  },
  {
    name: 'complex-formatting',
    description: 'Heavy emphasis and inline formatting',
    size: 100 * 1024, // 100KB
    characteristics: ['nested-emphasis', 'inline-code', 'strikethrough']
  },
  {
    name: 'html-heavy',
    description: 'Mixed HTML and Markdown content',
    size: 200 * 1024, // 200KB
    characteristics: ['html-blocks', 'inline-html', 'mixed-content']
  },
  {
    name: 'pathological',
    description: 'Edge cases and stress testing',
    size: 100 * 1024, // 100KB
    characteristics: ['deep-nesting', 'ambiguous-syntax', 'unicode']
  }
];
```

### 2. Performance Metrics

#### Core Metrics
- **Parse Time**: Total time to process document (milliseconds)
- **Memory Usage**: Peak memory consumption during parsing
- **Allocations**: Number of object allocations (where measurable)
- **Tokens/sec**: Scanner throughput (characters processed per second)

#### Advanced Metrics
- **Incremental Performance**: Time to re-parse after small changes
- **Memory Efficiency**: Bytes allocated per character processed
- **GC Pressure**: Garbage collection impact (via `--expose-gc`)
- **Cache Performance**: CPU cache efficiency indicators

### 3. Benchmarking Framework

```typescript
interface BenchmarkResult {
  parser: string;
  dataset: string;
  metrics: {
    parseTime: number;        // milliseconds
    memoryPeak: number;       // bytes
    allocations?: number;     // count
    throughput: number;       // chars/sec
    gcTime?: number;         // milliseconds
  };
  timestamp: Date;
  environment: SystemInfo;
}

interface SystemInfo {
  nodeVersion: string;
  platform: string;
  cpuModel: string;
  memoryTotal: number;
  arch: string;
}

class BenchmarkRunner {
  async runSuite(datasets: BenchmarkDataset[]): Promise<BenchmarkResult[]>;
  async runIncremental(dataset: BenchmarkDataset, changes: Change[]): Promise<IncrementalResult[]>;
  async runMemoryProfile(dataset: BenchmarkDataset): Promise<MemoryProfile>;
}
```

### 4. Scanner-Specific Benchmarks

#### Zero-Allocation Verification
```typescript
describe('Memory Discipline', () => {
  test('No allocations in hot scanning path', async () => {
    const scanner = createScanner();
    const doc = generateLargeDocument(1000000); // 1MB
    
    // Force GC before measurement
    if (global.gc) global.gc();
    const memBefore = process.memoryUsage().heapUsed;
    
    scanner.initText(doc);
    while (scanner.offsetNext < doc.length) {
      scanner.scan(); // Should not allocate
    }
    
    if (global.gc) global.gc();
    const memAfter = process.memoryUsage().heapUsed;
    const allocated = memAfter - memBefore;
    
    // Allow minimal allocations for test infrastructure
    expect(allocated).toBeLessThan(1024); // < 1KB allocated
  });
});
```

#### Incremental Update Performance
```typescript
interface ChangeOperation {
  type: 'insert' | 'delete' | 'replace';
  position: number;
  length?: number;
  content?: string;
}

const incrementalBenchmarks = [
  {
    name: 'single-character-insert',
    operation: { type: 'insert', position: 1000, content: 'x' }
  },
  {
    name: 'paragraph-insert',
    operation: { type: 'insert', position: 1000, content: '\n\nNew paragraph.' }
  },
  {
    name: 'emphasis-toggle',
    operation: { type: 'replace', position: 100, length: 4, content: '**text**' }
  },
  {
    name: 'block-restructure',
    operation: { type: 'replace', position: 500, length: 100, content: '# New heading\n\nContent' }
  }
];
```

### 5. Competitive Analysis Framework

```typescript
interface ParserAdapter {
  name: string;
  version: string;
  parse(content: string): any;
  supportsIncremental?: boolean;
  parseIncremental?(content: string, changes: Change[]): any;
}

const adapters: ParserAdapter[] = [
  new MarkedAdapter(),
  new MarkdownItAdapter(),
  new MicromarkAdapter(),
  new RemarkAdapter(),
  new CommonMarkAdapter(),
  new MixpadAdapter() // Our implementation
];
```

### 6. Reporting and Visualization

#### Performance Dashboard
- **Speed Comparison Charts**: Parse time vs document size
- **Memory Efficiency Graphs**: Memory usage patterns
- **Throughput Rankings**: Characters/second by parser
- **Incremental Performance**: Update time vs change size

#### Regression Detection
```typescript
interface PerformanceBaseline {
  dataset: string;
  parser: string;
  benchmarkValue: number;
  tolerance: number; // ±percentage
  timestamp: Date;
}

class RegressionDetector {
  checkAgainstBaseline(results: BenchmarkResult[]): RegressionReport;
  updateBaselines(results: BenchmarkResult[]): void;
  generateAlert(regression: Regression): void;
}
```

## Implementation Plan

### Phase 1: Foundation (Week 1)
- [ ] Data generation system
- [ ] Basic timing infrastructure
- [ ] Simple competitive comparison
- [ ] Mixpad scanner integration

### Phase 2: Advanced Metrics (Week 2)
- [ ] Memory profiling
- [ ] Allocation tracking
- [ ] GC impact measurement
- [ ] Throughput calculations

### Phase 3: Incremental Benchmarks (Week 3)
- [ ] Change operation framework
- [ ] Incremental update testing
- [ ] Rollback performance measurement
- [ ] Editor simulation

### Phase 4: Competitive Analysis (Week 4)
- [ ] All competitor integrations
- [ ] Comprehensive test matrix
- [ ] Performance dashboard
- [ ] Regression detection

### Phase 5: Production Integration (Week 5)
- [ ] CI/CD integration
- [ ] Automated baseline updates
- [ ] Performance alerts
- [ ] Public benchmark results

## Success Criteria

### Performance Targets
1. **Speed**: Match or exceed micromark performance
2. **Memory**: 50% less allocation than markdown-it
3. **Incremental**: Sub-millisecond updates for small changes
4. **Consistency**: <5% variance across runs

### Quality Metrics
1. **Accuracy**: 100% CommonMark compliance
2. **Robustness**: Handle pathological inputs gracefully
3. **Scalability**: Linear performance up to 10MB documents
4. **Reliability**: Zero crashes or infinite loops

## Integration with Development Workflow

### Continuous Integration
```yaml
# .github/workflows/benchmark.yml
name: Performance Benchmarks
on:
  pull_request:
    paths: ['parser/**']
  schedule:
    - cron: '0 2 * * *' # Daily at 2 AM

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run Benchmarks
        run: npm run bench:competitive
      - name: Check Regression
        run: npm run bench:check-regression
      - name: Comment PR
        if: github.event_name == 'pull_request'
        run: npm run bench:comment-pr
```

### Development Scripts
```json
{
  "scripts": {
    "bench:all": "node benchmark/run-all.js",
    "bench:competitive": "node benchmark/competitive.js",
    "bench:memory": "node --expose-gc benchmark/memory.js",
    "bench:incremental": "node benchmark/incremental.js",
    "bench:regression": "node benchmark/check-regression.js",
    "bench:profile": "clinic doctor -- node benchmark/profile.js",
    "bench:flamegraph": "clinic flame -- node benchmark/profile.js"
  }
}
```

## Expected Outcomes

### Performance Leadership
- Demonstrate scanner performance advantages
- Quantify zero-allocation benefits
- Validate incremental parsing claims
- Establish performance benchmarks for the ecosystem

### Development Confidence
- Catch performance regressions early
- Guide optimization efforts with data
- Validate architectural decisions
- Enable confident refactoring

### Community Adoption
- Provide transparent performance data
- Enable informed parser selection
- Contribute to Markdown parsing research
- Establish new performance standards

This benchmarking framework will position Mixpad as a performance leader in the Markdown parsing ecosystem while ensuring we maintain our architectural advantages through systematic measurement and comparison.

## Implementation: step-by-step guide

Below are concrete, copy-pasteable steps to implement the benchmark. Two workflows are shown: (A) a self-contained `parser/benchmark` project with local dev dependencies, and (B) a zero-dependency, minimal runner that uses only Node.js builtins. Both approaches keep your root `package.json` unchanged.

### Checklist (what we'll do)
- Create `parser/benchmark` directory and a nested `package.json` (optional)
- Add dataset generator and parser adapters (`mixpad` + competitors)
- Add runner that measures time and memory and writes JSON results
- Provide an incremental-change harness and a zero-allocation check
- Add simple npm scripts and README explaining how to run

---

### A — Recommended: self-contained `parser/benchmark` project (local deps)

1) Create the folder and init a nested project (Windows `cmd.exe`):

```bat
mkdir parser\benchmark
cd parser\benchmark
npm init -y
```

2) Install only benchmark-related dev dependencies locally (keeps root clean):

```bat
npm install --save-dev benchmark benchtable typescript ts-node @types/node
```

Add competitor parsers (optional, one-by-one when you actually need them):

```bat
npm install --no-save marked markdown-it micromark remark commonmark
```

3) Create minimal TypeScript/JS files inside `parser/benchmark`:

- `datasets.ts` — generate or load test documents (programmatic generators help reproducibility)
- `adapters.ts` — small adapter objects for each parser. Example for Mixpad:

```ts
// ...existing code...
import { createScanner } from '..\scanner\scanner.js';

export const MixpadAdapter = {
  name: 'mixpad',
  parse(content: string) {
    const scanner = createScanner();
    scanner.initText(content);
    while (scanner.offsetNext < content.length) scanner.scan();
  }
};
// ...existing code...
```

- `runner.ts` — iterate datasets and adapters, measure using `performance.now()` and `process.memoryUsage()`; write results to `results/` as JSON.

4) Example `runner.ts` skeleton (timing + memory):

```ts
import { datasets } from './datasets';
import { adapters } from './adapters';

function measureParse(adapter, content) {
  if (global.gc) global.gc();
  const memBefore = process.memoryUsage().heapUsed;
  const t0 = performance.now();
  adapter.parse(content);
  const t1 = performance.now();
  if (global.gc) global.gc();
  const memAfter = process.memoryUsage().heapUsed;
  return {
    parseTimeMs: t1 - t0,
    memoryPeakBytes: Math.max(0, memAfter - memBefore)
  };
}

async function runAll() {
  const results = [];
  for (const ds of datasets) {
    for (const ad of adapters) {
      const metrics = measureParse(ad, ds.content);
      results.push({ parser: ad.name, dataset: ds.name, metrics });
    }
  }
  console.log(JSON.stringify(results, null, 2));
}

runAll();
```

5) Add scripts to `parser/benchmark/package.json`:

```json
{
  "scripts": {
    "bench": "node --expose-gc --loader ts-node/esm runner.ts",
    "bench:node": "node runner.js"
  }
}
```

6) Run the bench (from `parser\benchmark`):

```bat
npm install
npm run bench
```

---

### B — Minimal, zero-dependency runner (no local node_modules required)

Use this when you want to avoid any installs. It relies only on built-in `performance.now()` and `process.memoryUsage()`.

1) Create a single file `parser/benchmark/run-minimal.js` with plain Node (CommonJS) code. Important: import your scanner using a relative path.

2) Minimal runner sketch (CommonJS):

```js
// parser/benchmark/run-minimal.js
const fs = require('fs');
const { createScanner } = require('../scanner/scanner.js');

function generateLargeDoc(kb) {
  return ('# heading\n\n' + 'lorem ipsum dolor sit amet. ').repeat((kb * 1024) / 40);
}

function measure(adapter, content) {
  if (global.gc) global.gc();
  const memBefore = process.memoryUsage().heapUsed;
  const t0 = Date.now();
  adapter.parse(content);
  const t1 = Date.now();
  if (global.gc) global.gc();
  const memAfter = process.memoryUsage().heapUsed;
  return { parseTimeMs: t1 - t0, memoryDelta: memAfter - memBefore };
}

const adapter = {
  name: 'mixpad',
  parse(content) {
    const s = createScanner();
    s.initText(content);
    while (s.offsetNext < content.length) s.scan();
  }
};

const doc = generateLargeDoc(100); // 100KB
console.log(measure(adapter, doc));
```

3) Run with Node (Windows `cmd.exe`):

```bat
cd parser\benchmark
node --expose-gc run-minimal.js
```

Notes: this minimal runner is excellent for smoke tests and quick comparisons. It lacks the statistical rigor of repeated-sample benchmarking libraries but has zero overhead and no new dependencies.

---

### Zero-allocation verification and incremental harness

- To verify zero-allocation behavior, run the scanner on a large document while forcing GC before/after and measuring heap delta (as shown earlier). Run multiple iterations and use median.
- For incremental benchmarks, build a small harness that applies an array of `ChangeOperation` objects to a base document and measures the time for the scanner to rescan only the affected region (or full document if that's your current API). Emit JSON lines with timings for each operation.

### Next steps I can do for you now
- Create the `parser/benchmark` folder and add `run-minimal.js` and a `README.md` (zero-deps runner) so you can run it immediately.
- Or scaffold the TypeScript benchmark project (local deps) with `datasets.ts`, `adapters.ts`, `runner.ts`, and `package.json`.

Tell me which of the two you'd like me to create and I will scaffold the files and run a local smoke check.