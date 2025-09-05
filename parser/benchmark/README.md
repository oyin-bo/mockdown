# Mixpad Scanner Benchmarking Tool

A comprehensive benchmarking framework to compare the raw performance of the Mixpad scanner against leading Markdown parsers.

## Quick Start

```bash
# From the parser/benchmark directory
npm install
npm start
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

### Run All Benchmarks

```bash
npm start
# or
npm run bench
```

### Run with README Update

```bash
# Simple benchmark with README update
npm run bench:simple:readme

# Working benchmark with README update
npm run bench:working:readme

# Full TypeScript benchmark with README update  
npm run bench:readme

# Or with any benchmark runner
npm run bench:simple -- --update-readme
npm run bench:working -- --update-readme
```

### Run with Garbage Collection (Recommended)

```bash
npm run bench
# Uses --expose-gc flag automatically
```

### Run Compiled JavaScript (Faster)

```bash
# First compile TypeScript to JavaScript
npx tsc runner.ts --target es2022 --module nodenext --moduleResolution nodenext
npm run bench:node
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
**Generated:** 2025-09-05 (TypeScript Implementation)  
**System:** linux x64, Node v20.19.4  
**Parsers:** mixpad, marked, markdown-it, micromark, commonmark  

### small-simple

| Parser | Time (ms) | Throughput (MB/s) | Memory (KB) | Tokens |
|--------|-----------|-------------------|-------------|--------|
| mixpad | 0.47 | 2.1 | 0 | 146 |
| commonmark | 0.96 | 1.0 | 91 | N/A |
| markdown-it | 1.25 | 0.8 | 110 | N/A |
| marked | 1.39 | 0.7 | 39 | N/A |
| micromark | 10.44 | 0.1 | 8 | N/A |

### medium-mixed

| Parser | Time (ms) | Throughput (MB/s) | Memory (KB) | Tokens |
|--------|-----------|-------------------|-------------|--------|
| commonmark | 8.97 | 5.4 | 848 | N/A |
| marked | 10.17 | 4.8 | 375 | N/A |
| mixpad | 10.99 | 4.4 | 36 | 6365 |
| markdown-it | 15.47 | 3.2 | 1732 | N/A |
| micromark | 119.70 | 0.4 | 51 | N/A |

### large-text-heavy

| Parser | Time (ms) | Throughput (MB/s) | Memory (KB) | Tokens |
|--------|-----------|-------------------|-------------|--------|
| commonmark | 3.41 | 143.1 | 49 | N/A |
| mixpad | 15.81 | 30.9 | 1 | 3439 |
| marked | 17.51 | 27.9 | 115 | N/A |
| markdown-it | 19.08 | 25.6 | 1444 | N/A |
| micromark | 121.06 | 4.0 | 783 | N/A |


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

### TypeScript Errors

Make sure you have TypeScript installed:

```bash
npm install --save-dev typescript
```

### Missing Competitive Parsers

Competitive parsers are optional. Install them if you want to compare:

```bash
npm run install-competitors
```

### Memory Measurements

For accurate memory measurements, run with `--expose-gc`:

```bash
node --expose-gc --loader ts-node/esm runner.ts
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