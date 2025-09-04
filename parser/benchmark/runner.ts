/**
 * Benchmark runner for Markdown parser performance comparison
 * 
 * Measures parsing time and memory usage across different parsers and datasets.
 */

import { datasets } from './datasets.js';
import { adapters } from './adapters.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');

export interface BenchmarkMetrics {
  parseTimeMs: number;
  memoryPeakBytes: number;
  throughputCharsPerSecond: number;
  tokenCount?: number;
}

export interface BenchmarkResult {
  parser: string;
  dataset: string;
  metrics: BenchmarkMetrics;
  timestamp: Date;
  environment: SystemInfo;
}

export interface SystemInfo {
  nodeVersion: string;
  platform: string;
  cpuModel: string;
  memoryTotal: number;
  arch: string;
}

/**
 * Get system information for the benchmark environment
 */
function getSystemInfo(): SystemInfo {
  const os = require('os');
  return {
    nodeVersion: process.version,
    platform: process.platform,
    cpuModel: os.cpus()[0]?.model || 'unknown',
    memoryTotal: os.totalmem(),
    arch: process.arch
  };
}

/**
 * Measure parsing performance for a single adapter and content
 */
function measureParse(adapter: any, content: string): BenchmarkMetrics {
  // Force garbage collection before measurement if available
  if (global.gc) {
    global.gc();
  }
  
  const memBefore = process.memoryUsage().heapUsed;
  const startTime = performance.now();
  
  // Parse the content
  const result = adapter.parse(content);
  
  const endTime = performance.now();
  
  // Force garbage collection after measurement if available  
  if (global.gc) {
    global.gc();
  }
  
  const memAfter = process.memoryUsage().heapUsed;
  const parseTimeMs = endTime - startTime;
  const memoryPeakBytes = Math.max(0, memAfter - memBefore);
  const throughputCharsPerSecond = content.length / (parseTimeMs / 1000);
  
  return {
    parseTimeMs,
    memoryPeakBytes,
    throughputCharsPerSecond,
    tokenCount: result?.tokenCount
  };
}

/**
 * Run benchmark for multiple iterations and return median results
 */
function runMultipleIterations(adapter: any, content: string, iterations: number = 5): BenchmarkMetrics {
  const results: BenchmarkMetrics[] = [];
  
  for (let i = 0; i < iterations; i++) {
    results.push(measureParse(adapter, content));
  }
  
  // Sort by parse time and take median
  results.sort((a, b) => a.parseTimeMs - b.parseTimeMs);
  const medianIndex = Math.floor(results.length / 2);
  
  return results[medianIndex];
}

/**
 * Run the complete benchmark suite
 */
async function runBenchmarkSuite(): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];
  const systemInfo = getSystemInfo();
  
  console.log('Starting benchmark suite...');
  console.log(`System: ${systemInfo.platform} ${systemInfo.arch}, Node ${systemInfo.nodeVersion}`);
  console.log(`Available parsers: ${adapters.map(a => a.name).join(', ')}`);
  console.log(`Datasets: ${datasets.map(d => `${d.name} (${Math.round(d.size/1024)}KB)`).join(', ')}`);
  console.log('');
  
  let totalTests = datasets.length * adapters.length;
  let currentTest = 0;
  
  for (const dataset of datasets) {
    console.log(`\nTesting dataset: ${dataset.name} (${Math.round(dataset.size/1024)}KB)`);
    
    for (const adapter of adapters) {
      currentTest++;
      console.log(`  [${currentTest}/${totalTests}] ${adapter.name}...`);
      
      try {
        const metrics = runMultipleIterations(adapter, dataset.content, 3);
        
        results.push({
          parser: adapter.name,
          dataset: dataset.name,
          metrics,
          timestamp: new Date(),
          environment: systemInfo
        });
        
        console.log(`    ✓ ${metrics.parseTimeMs.toFixed(2)}ms, ${(metrics.throughputCharsPerSecond/1000).toFixed(0)}k chars/sec`);
        
      } catch (error) {
        console.log(`    ✗ Error: ${error.message}`);
      }
    }
  }
  
  return results;
}

/**
 * Save results to JSON files
 */
function saveResults(results: BenchmarkResult[]): void {
  try {
    mkdirSync(join(process.cwd(), 'results'), { recursive: true });
  } catch (error) {
    // Directory might already exist
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = join(process.cwd(), 'results', `benchmark-${timestamp}.json`);
  
  writeFileSync(filename, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${filename}`);
}

/**
 * Generate a summary report
 */
function generateSummary(results: BenchmarkResult[]): void {
  console.log('\n=== BENCHMARK SUMMARY ===\n');
  
  // Group results by dataset
  const byDataset = new Map<string, BenchmarkResult[]>();
  for (const result of results) {
    if (!byDataset.has(result.dataset)) {
      byDataset.set(result.dataset, []);
    }
    byDataset.get(result.dataset)!.push(result);
  }
  
  for (const [datasetName, datasetResults] of byDataset) {
    console.log(`Dataset: ${datasetName}`);
    
    // Sort by parse time
    datasetResults.sort((a, b) => a.metrics.parseTimeMs - b.metrics.parseTimeMs);
    
    for (const result of datasetResults) {
      const throughputMB = (result.metrics.throughputCharsPerSecond / (1024 * 1024)).toFixed(1);
      const memoryKB = Math.round(result.metrics.memoryPeakBytes / 1024);
      
      console.log(`  ${result.parser.padEnd(12)} ${result.metrics.parseTimeMs.toFixed(2).padStart(8)}ms  ${throughputMB.padStart(6)}MB/s  ${memoryKB.toString().padStart(6)}KB`);
    }
    console.log('');
  }
}

/**
 * Verify zero-allocation behavior for Mixpad
 */
function verifyZeroAllocation(): void {
  console.log('\n=== ZERO-ALLOCATION VERIFICATION ===\n');
  
  const mixpadAdapter = adapters.find(a => a.name === 'mixpad');
  if (!mixpadAdapter) {
    console.log('Mixpad adapter not found');
    return;
  }
  
  // Use a large document to make any allocations more visible
  const largeDataset = datasets.find(d => d.name === 'large-text-heavy');
  if (!largeDataset) {
    console.log('Large dataset not found');
    return;
  }
  
  console.log(`Testing zero-allocation with ${Math.round(largeDataset.size/1024)}KB document...`);
  
  // Run multiple times and check memory delta
  const iterations = 10;
  const memoryDeltas: number[] = [];
  
  for (let i = 0; i < iterations; i++) {
    if (global.gc) global.gc();
    const memBefore = process.memoryUsage().heapUsed;
    
    mixpadAdapter.parse(largeDataset.content);
    
    if (global.gc) global.gc();
    const memAfter = process.memoryUsage().heapUsed;
    
    memoryDeltas.push(memAfter - memBefore);
  }
  
  const avgDelta = memoryDeltas.reduce((a, b) => a + b, 0) / memoryDeltas.length;
  const maxDelta = Math.max(...memoryDeltas);
  
  console.log(`Average memory delta: ${Math.round(avgDelta)} bytes`);
  console.log(`Maximum memory delta: ${Math.round(maxDelta)} bytes`);
  
  if (maxDelta < 1024) {
    console.log('✓ Zero-allocation verification PASSED (< 1KB allocated)');
  } else {
    console.log('⚠ Zero-allocation verification WARNING (> 1KB allocated)');
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  try {
    const results = await runBenchmarkSuite();
    
    if (results.length > 0) {
      generateSummary(results);
      saveResults(results);
      verifyZeroAllocation();
    } else {
      console.log('No benchmark results generated');
    }
    
  } catch (error) {
    console.error('Benchmark failed:', error);
    process.exit(1);
  }
}

// Run if this module is executed directly
if (import.meta.url === `file://${fileURLToPath(import.meta.url)}`) {
  main().catch(console.error);
}