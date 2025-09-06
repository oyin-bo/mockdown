# Mixpad Scanner Benchmarking Tool

A comprehensive benchmarking framework to compare the raw performance of the Mixpad scanner against leading Markdown parsers.

## Quick Start

```bash
# From the parser/benchmark directory
npm install
npm run install-competitors

# Run competitive benchmark with real Mixpad scanner (recommended)
npm run bench:ts:readme

# Or run with JavaScript implementation (uses mock scanner)
npm run bench:readme
```

## Overview

This benchmarking tool measures:
- **Parsing speed** (milliseconds)
- **Memory usage** (bytes allocated)
- **Throughput** (characters per second)
- **Zero-allocation verification** for Mixpad

## Architecture

### Components

- **`datasets.ts`** - Generates various Markdown test documents
- **`adapters.ts`** - Parser adapters providing unified interface
- **`runner.ts`** - Main benchmarking engine with timing and memory measurement

### Test Datasets

| Dataset | Size | Description |
|---------|------|-------------|
| `small-simple` | 1KB | Basic Markdown with simple formatting |
| `medium-mixed` | 50KB | Real-world document with mixed elements |
| `large-text-heavy` | 500KB | Large document with extensive text content |
| `complex-formatting` | 100KB | Heavy emphasis and inline formatting |
| `pathological` | 100KB | Edge cases and stress testing |

### Supported Parsers

- **mixpad** - Our zero-allocation scanner (always available)
- **marked** - Popular JavaScript Markdown parser
- **markdown-it** - Feature-rich parser with plugins  
- **micromark** - CommonMark-compliant, performant parser
- **remark** - Part of unified ecosystem
- **commonmark** - Reference CommonMark implementation

*Competitive parsers are optional - install them separately if needed.*

## Installation

### Basic Setup (Mixpad only)

```bash
npm install
npm start
```

### With Competitive Parsers

```bash
npm install
npm run install-competitors
npm start
```

Or install specific competitors:

```bash
npm install --no-save marked markdown-it micromark remark commonmark
npm start
```

## Usage

### Run with Real Mixpad Scanner (Recommended)

```bash
# TypeScript implementation with esbuild compilation - uses REAL scanner
npm run bench:ts:readme
npm run bench:ts
```

### Run All Benchmarks (JavaScript Implementation)

```bash
# JavaScript implementation - may use mock scanner if real one can't be loaded
npm run bench:readme
npm run bench:competitive
# or
npm start
```

### Run with README Update

```bash
# Real scanner with README update (recommended)
npm run bench:ts:readme

# JavaScript implementation with README update
npm run bench:readme

# Simple benchmark with README update
npm run bench:simple:readme

# Working benchmark with README update
npm run bench:working:readme

# Or with any benchmark runner
npm run bench:simple -- --update-readme
npm run bench:working -- --update-readme
```

### Run with Garbage Collection (Recommended)

```bash
# All npm scripts use --expose-gc flag automatically for accurate memory measurement
npm run bench:ts:readme
npm run bench:readme
npm run bench:competitive
```

### Run with TypeScript Implementation (Real Scanner)

```bash
# Build and run TypeScript implementation with real scanner
npm run bench:ts:readme

# Or without README update
npm run bench:ts
```

## Output

### Console Output

```
Starting benchmark suite...
System: linux x64, Node v20.0.0
Available parsers: mixpad, marked, markdown-it
Datasets: small-simple (1KB), medium-mixed (50KB), large-text-heavy (500KB)

Testing dataset: small-simple (1KB)
  [1/9] mixpad...
    ✓ 0.42ms, 2380k chars/sec
  [2/9] marked...
    ✓ 1.23ms, 813k chars/sec

=== BENCHMARK SUMMARY ===

Dataset: small-simple
  mixpad       0.42ms    2.3MB/s     0KB
  marked       1.23ms    0.8MB/s    12KB
  markdown-it  2.15ms    0.5MB/s    24KB
```

### JSON Results

Results are automatically saved to `results/benchmark-TIMESTAMP.json`:

```json
[
  {
    "parser": "mixpad",
    "dataset": "small-simple", 
    "metrics": {
      "parseTimeMs": 0.42,
      "memoryPeakBytes": 0,
      "throughputCharsPerSecond": 2380952,
      "tokenCount": 15
    },
    "timestamp": "2024-01-15T10:30:00.000Z",
    "environment": {
      "nodeVersion": "v20.0.0",
      "platform": "linux",
      "arch": "x64"
    }
  }
]
```

## Latest Benchmark Results

<!-- BENCHMARK_RESULTS_START -->
**Generated:** 2025-09-05 (JavaScript Implementation)  
**System:** win32 x64, Node v22.17.1  
**Parsers:** mixpad, marked, markdown-it, micromark, commonmark, remark  

### small-simple

| Parser | Time (ms) | Throughput (MB/s) | Memory (KB) | Tokens |
|--------|-----------|-------------------|-------------|--------|
| mixpad | 0.62 | 0.6 | 8 | 4 |
| commonmark | 1.28 | 0.2 | 26 | N/A |
| marked | 9.20 | 0.2 | 189 | 45 |
| markdown-it | 2.30 | 0.2 | 23 | 6 |
| remark | 3.52 | 0.1 | 202 | N/A |
| micromark | 3.51 | 0.1 | 300 | 44 |

### medium-mixed

| Parser | Time (ms) | Throughput (MB/s) | Memory (KB) | Tokens |
|--------|-----------|-------------------|-------------|--------|
| mixpad | 8.96 | 3.0 | 107 | 10,177 |
| commonmark | 14.34 | 2.9 | 423 | N/A |
| markdown-it | 16.23 | 1.7 | 836 | 2,630 |
| marked | 20.01 | 1.6 | 888 | 76,889 |
| remark | 125.54 | 0.3 | 17,519 | N/A |
| micromark | 125.99 | 0.3 | 16,274 | 76,767 |

### large-text-heavy

| Parser | Time (ms) | Throughput (MB/s) | Memory (KB) | Tokens |
|--------|-----------|-------------------|-------------|--------|
| commonmark | 7.90 | 59.2 | 2,471 | N/A |
| mixpad | 13.96 | 21.4 | 285 | 3,439 |
| marked | 18.64 | 18.7 | 2,203 | 518,884 |
| markdown-it | 17.64 | 18.2 | 3,176 | 3,441 |
| remark | 91.77 | 3.1 | 3,819 | N/A |
| micromark | 93.21 | 3.0 | 11,655 | 518,882 |

### pathological

| Parser | Time (ms) | Throughput (MB/s) | Memory (KB) | Tokens |
|--------|-----------|-------------------|-------------|--------|
| mixpad | 13.56 | 4.2 | 197 | 15,984 |
| commonmark | 20.20 | 4.1 | -1,280 | N/A |
| marked | 29.48 | 1.2 | -681 | 202,930 |
| micromark | 180.12 | 0.2 | 14,256 | 203,393 |
| remark | 183.02 | 0.2 | 15,969 | N/A |

### super-heavy

| Parser | Time (ms) | Throughput (MB/s) | Memory (KB) | Tokens |
|--------|-----------|-------------------|-------------|--------|
| commonmark | 184.76 | 81.2 | 89980 | N/A |
| mixpad | 466.55 | 32.2 | 0 | 370439 |
| markdown-it | 601.03 | 25.0 | 100979 | N/A |
| marked | 995.09 | 15.1 | 17598 | N/A |
| micromark | 6067.82 | 2.5 | 16180 | N/A |
| remark | 8918.06 | 1.7 | 69947 | N/A |

### docs-collection

| Parser | Time (ms) | Throughput (MB/s) | Memory (KB) | Tokens |
|--------|-----------|-------------------|-------------|--------|
| commonmark | 0.80 | 11.1 | 21 | N/A |
| mixpad | 0.21 | 5.3 | 8 | 0 |
| marked | 0.64 | 2.8 | 7 | 0 |
| remark | 1.96 | 0.8 | 86 | N/A |
| micromark | 1.74 | 0.6 | 94 | 0 |
<!-- BENCHMARK_RESULTS_END -->

## Features

### Automatic README Updates

The benchmark tool can automatically inject results into this README file for easy sharing and documentation:

```bash
# Run benchmark and update README with results
npm run bench:simple:readme
npm run bench:working:readme

# Or with any benchmark command
npm run bench:simple -- --update-readme
npm run bench:working -- --update-readme
```

Results are injected between the `<!-- BENCHMARK_RESULTS_START -->` and `<!-- BENCHMARK_RESULTS_END -->` markers, replacing any previous results.

### Zero-Allocation Verification

The tool automatically verifies that the Mixpad scanner maintains its zero-allocation promise:

```
=== ZERO-ALLOCATION VERIFICATION ===

Testing zero-allocation with 500KB document...
Average memory delta: 0 bytes
Maximum memory delta: 128 bytes
✓ Zero-allocation verification PASSED (< 1KB allocated)
```

### Statistical Accuracy

- Multiple iterations per test (default: 3)
- Median result selection to reduce noise
- Garbage collection before/after measurements
- System information capture for reproducibility

## Development

### File Structure

```
parser/benchmark/
├── package.json       # Benchmark project dependencies
├── datasets.ts        # Test data generation
├── adapters.ts        # Parser adapters
├── runner.ts          # Main benchmark runner
├── README.md          # This file
└── results/           # Generated benchmark results
    └── benchmark-*.json
```

### Adding New Parsers

Add a new adapter in `adapters.ts`:

```typescript
function createMyParserAdapter(): ParserAdapter | null {
  try {
    const myParser = require('my-parser');
    return {
      name: 'my-parser',
      version: 'unknown',
      parse(content: string) {
        return myParser.parse(content);
      }
    };
  } catch (error) {
    console.warn('my-parser not available:', error.message);
    return null;
  }
}
```

### Adding New Datasets

Add generators in `datasets.ts`:

```typescript
function generateMyDataset(targetSize: number): string {
  // Generate content...
  return content;
}

// Add to generateDatasets() function
{
  name: 'my-dataset',
  description: 'My custom test dataset',
  content: generateMyDataset(10 * 1024),
  size: 10 * 1024,
  characteristics: ['my-feature']
}
```

## Troubleshooting

### Missing Dependencies

Competitive parsers are optional. Install them if you want to compare:

```bash
npm run install-competitors
```

### Memory Measurements

For accurate memory measurements, run with `--expose-gc`:

```bash
node --expose-gc run-competitive.js
```

### Performance Variations

Benchmark results can vary based on:
- System load
- Node.js version
- V8 optimization state
- Available memory

Run multiple times and compare trends rather than absolute numbers.

## CI/CD Integration

The tool is designed for automated performance regression detection:

```yaml
# Example GitHub Actions workflow
- name: Run Performance Benchmarks
  run: |
    cd parser/benchmark
    npm install
    npm start
    
- name: Upload Results
  uses: actions/upload-artifact@v3
  with:
    name: benchmark-results
    path: parser/benchmark/results/
```

## License

Same as main Mixpad project.