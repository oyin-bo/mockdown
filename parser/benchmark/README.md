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
**Parsers:** mixpad, marked, markdown-it, micromark, commonmark  

### small-simple

| Parser | Time (ms) | Throughput (MB/s) | Memory (KB) | Tokens |
|--------|-----------|-------------------|-------------|--------|
| mixpad | 1.58 | 0.6 | 0 | 205 |
| commonmark | 3.32 | 0.3 | 59 | N/A |
| marked | 3.92 | 0.2 | 28 | N/A |
| markdown-it | 4.84 | 0.2 | 96 | N/A |
| micromark | 16.67 | 0.1 | 34 | N/A |

### medium-mixed

| Parser | Time (ms) | Throughput (MB/s) | Memory (KB) | Tokens |
|--------|-----------|-------------------|-------------|--------|
| mixpad | 13.69 | 3.6 | 5 | 10240 |
| commonmark | 15.44 | 3.2 | 1601 | N/A |
| markdown-it | 30.52 | 1.6 | 1982 | N/A |
| marked | 31.89 | 1.5 | 435 | N/A |
| micromark | 165.98 | 0.3 | 95 | N/A |

### large-text-heavy

| Parser | Time (ms) | Throughput (MB/s) | Memory (KB) | Tokens |
|--------|-----------|-------------------|-------------|--------|
| commonmark | 7.51 | 65.1 | 1326 | N/A |
| mixpad | 21.04 | 23.2 | 45 | 102400 |
| marked | 23.48 | 20.8 | 107 | N/A |
| markdown-it | 30.59 | 16.0 | 1450 | N/A |
| micromark | 149.80 | 3.3 | 355 | N/A |


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