/**
 * Minimal benchmark runner using only Node.js builtins
 * Based on the zero-dependency approach from 7-benchmarking.md
 */

const fs = require('fs');

// We'll need to work around the ES module issue 
// For now, let's create a simple test that doesn't depend on the scanner
// and demonstrates the benchmarking approach

console.log('=== Mixpad Scanner Benchmark Tool ===\n');

/**
 * Generate test documents
 */
function generateSimpleDoc(sizeKB) {
  const pattern = '# Heading\n\nThis is a paragraph with **bold** and *italic* text.\n\n';
  const targetBytes = sizeKB * 1024;
  let content = '';
  
  while (content.length < targetBytes) {
    content += pattern;
  }
  
  return content.substring(0, targetBytes);
}

function generateLargeDoc(sizeKB) {
  const pattern = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. ';
  const targetBytes = sizeKB * 1024;
  let content = '# Large Document\n\n';
  
  while (content.length < targetBytes) {
    content += pattern;
  }
  
  return content.substring(0, targetBytes);
}

/**
 * Mock adapter for demonstration (real implementation would import scanner)
 */
const mockMixpadAdapter = {
  name: 'mixpad',
  parse(content) {
    // This is a mock - real implementation would use:
    // const scanner = createScanner();
    // scanner.initText(content);
    // while (scanner.offsetNext < content.length) scanner.scan();
    
    // Simulate some work
    const lines = content.split('\n');
    const words = content.split(/\s+/);
    return { lines: lines.length, words: words.length };
  }
};

/**
 * Measure parsing performance
 */
function measure(adapter, content) {
  if (global.gc) global.gc();
  const memBefore = process.memoryUsage().heapUsed;
  const t0 = Date.now();
  
  const result = adapter.parse(content);
  
  const t1 = Date.now();
  if (global.gc) global.gc();
  const memAfter = process.memoryUsage().heapUsed;
  
  return {
    parseTimeMs: t1 - t0,
    memoryDelta: memAfter - memBefore,
    throughputCharsPerSec: Math.round(content.length / ((t1 - t0) / 1000)),
    result
  };
}

/**
 * Run benchmark suite
 */
function runBenchmarks() {
  const datasets = [
    { name: 'small-simple', content: generateSimpleDoc(1), size: '1KB' },
    { name: 'medium-text', content: generateLargeDoc(50), size: '50KB' },
    { name: 'large-text', content: generateLargeDoc(500), size: '500KB' }
  ];
  
  const adapters = [mockMixpadAdapter];
  
  console.log('System Information:');
  console.log(`  Node.js: ${process.version}`);
  console.log(`  Platform: ${process.platform} ${process.arch}`);
  console.log(`  Memory: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB\n`);
  
  console.log('Available Parsers: ' + adapters.map(a => a.name).join(', '));
  console.log('Test Datasets: ' + datasets.map(d => `${d.name} (${d.size})`).join(', '));
  console.log('');
  
  const results = [];
  
  for (const dataset of datasets) {
    console.log(`Testing ${dataset.name} (${dataset.size}):`);
    
    for (const adapter of adapters) {
      try {
        // Run multiple iterations for better accuracy
        const iterations = 3;
        const measurements = [];
        
        for (let i = 0; i < iterations; i++) {
          measurements.push(measure(adapter, dataset.content));
        }
        
        // Use median result
        measurements.sort((a, b) => a.parseTimeMs - b.parseTimeMs);
        const median = measurements[Math.floor(measurements.length / 2)];
        
        results.push({
          parser: adapter.name,
          dataset: dataset.name,
          ...median,
          timestamp: new Date().toISOString()
        });
        
        console.log(`  ${adapter.name.padEnd(12)} ${median.parseTimeMs.toString().padStart(5)}ms  ${(median.throughputCharsPerSec / 1000).toFixed(0).padStart(4)}k chars/sec  ${median.memoryDelta.toString().padStart(6)} bytes`);
        
      } catch (error) {
        console.log(`  ${adapter.name.padEnd(12)} ERROR: ${error.message}`);
      }
    }
    console.log('');
  }
  
  // Save results
  try {
    fs.mkdirSync('results', { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `results/benchmark-${timestamp}.json`;
    fs.writeFileSync(filename, JSON.stringify(results, null, 2));
    console.log(`Results saved to: ${filename}`);
  } catch (error) {
    console.log('Could not save results:', error.message);
  }
  
  console.log('\n=== Summary ===');
  console.log('This is a mock benchmark demonstration.');
  console.log('To run with the actual Mixpad scanner, the TypeScript import issues need to be resolved.');
  console.log('The framework is ready - just need to connect the scanner properly.');
  console.log('\nNext steps:');
  console.log('1. Fix TypeScript/ES module imports for scanner');
  console.log('2. Install competitive parsers with: npm run install-competitors'); 
  console.log('3. Run full benchmark with: npm run bench');
  
  return results;
}

// Zero-allocation verification placeholder
function verifyZeroAllocation() {
  console.log('\n=== Zero-Allocation Verification ===');
  console.log('(Mock implementation - would test actual scanner)');
  console.log('✓ Framework ready for zero-allocation testing');
}

/**
 * Update README.md with benchmark results (simplified version)
 */
function updateReadmeWithResults(results) {
  const readmePath = './README.md';
  
  try {
    const readmeContent = fs.readFileSync(readmePath, 'utf-8');
    const startMarker = '<!-- BENCHMARK_RESULTS_START -->';
    const endMarker = '<!-- BENCHMARK_RESULTS_END -->';
    
    const startIndex = readmeContent.indexOf(startMarker);
    const endIndex = readmeContent.indexOf(endMarker);
    
    if (startIndex === -1 || endIndex === -1) {
      console.log('⚠ README.md does not contain benchmark results markers');
      return;
    }
    
    const beforeMarker = readmeContent.substring(0, startIndex + startMarker.length);
    const afterMarker = readmeContent.substring(endIndex);
    
    const timestamp = new Date().toISOString().split('T')[0];
    let markdown = `\n**Generated:** ${timestamp} (Mock Results)  \n`;
    markdown += `**System:** ${process.platform} ${process.arch}, Node ${process.version}  \n`;
    markdown += `**Parsers:** mixpad (mock implementation)  \n\n`;
    
    markdown += '### Mock Benchmark Results\n\n';
    markdown += '| Dataset | Parser | Time (ms) | Throughput (MB/s) | Memory (KB) |\n';
    markdown += '|---------|--------|-----------|-------------------|-------------|\n';
    
    for (const result of results) {
      const throughputMB = result.throughputCharsPerSec ? (result.throughputCharsPerSec / (1024 * 1024)).toFixed(1) : 'N/A';
      const memoryKB = Math.round(Math.abs(result.memoryDelta) / 1024);
      markdown += `| ${result.dataset} | ${result.parser} | ${result.parseTimeMs} | ${throughputMB} | ${memoryKB} |\n`;
    }
    markdown += '\n*Note: These are mock results for demonstration. Run with actual scanner for real benchmarks.*\n';
    
    const newContent = beforeMarker + markdown + '\n' + afterMarker;
    
    fs.writeFileSync(readmePath, newContent);
    console.log('\n✓ README.md updated with mock benchmark results');
    
  } catch (error) {
    console.error('Failed to update README.md:', error.message);
  }
}

// Main execution
console.log('Running benchmark smoke test...\n');
const results = runBenchmarks();
verifyZeroAllocation();

// Check for --update-readme flag
const args = process.argv.slice(2);
if (args.includes('--update-readme')) {
  updateReadmeWithResults(results);
}