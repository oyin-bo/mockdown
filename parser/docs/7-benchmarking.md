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