/**
 * Comprehensive competitive benchmark runner (TypeScript implementation)
 * Tests Mixpad scanner against major Markdown parsers
 */

import { createScanner } from '../index.js';
import { performance } from 'perf_hooks';
import * as fs from 'fs';
import { join } from 'path';
import * as os from 'os';

interface BenchmarkResult {
  parser: string;
  dataset: string;
  parseTimeMs: number;
  memoryDelta: number;
  throughputCharsPerSec: number;
  throughputMBPerSec: number;
  tokenCount?: number;
  timestamp: string;
}

interface Dataset {
  size: string;
  content: string;
  characteristics: string[];
}

interface ParserAdapter {
  name: string;
  version: string;
  isReal?: boolean;
  parse(content: string): any;
}

console.log('=== Mixpad Scanner vs Competitive Parsers Benchmark (TypeScript) ===\n');

/**
 * Generate test documents with various characteristics
 */
function generateTestDatasets(): Record<string, Dataset> {
  return {
    'small-simple': {
      size: '1KB',
      content: generateSimpleDoc(1),
      characteristics: ['headers', 'paragraphs', 'basic-emphasis']
    },
    'medium-mixed': {
      size: '50KB', 
      content: generateMixedDoc(50),
      characteristics: ['lists', 'code-blocks', 'links', 'tables', 'quotes']
    },
    'large-text-heavy': {
      size: '500KB',
      content: generateTextHeavyDoc(500),
      characteristics: ['long-paragraphs', 'minimal-formatting']
    }
  };
}

function generateSimpleDoc(sizeKB: number): string {
  const patterns = [
    '# Heading Level 1\n\n',
    'This is a paragraph with some **bold text** and *italic text*.\n\n',
    '## Heading Level 2\n\n',
    'Another paragraph with `inline code` and [a link](https://example.com).\n\n',
    '- List item 1\n',
    '- List item 2\n',
    '- List item 3\n\n'
  ];
  
  let content = '';
  const targetBytes = sizeKB * 1024;
  
  while (content.length < targetBytes) {
    content += patterns[content.length % patterns.length];
  }
  
  return content.substring(0, targetBytes);
}

function generateMixedDoc(sizeKB: number): string {
  const complexPatterns = [
    '# Complex Document\n\n',
    'This paragraph contains **nested *italic inside bold* formatting** and more text.\n\n',
    '```javascript\n// Code block\nfunction example() {\n  return "Hello World";\n}\n```\n\n',
    '| Column 1 | Column 2 | Column 3 |\n|----------|----------|----------|\n| Cell 1   | Cell 2   | Cell 3   |\n\n',
    '> This is a blockquote with **bold text**\n> and multiple lines.\n\n',
    '1. Ordered list item\n2. Another ordered item\n3. Third item with `code`\n\n'
  ];
  
  let content = '';
  const targetBytes = sizeKB * 1024;
  
  while (content.length < targetBytes) {
    content += complexPatterns[content.length % complexPatterns.length];
  }
  
  return content.substring(0, targetBytes);
}

function generateTextHeavyDoc(sizeKB: number): string {
  const textBlock = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.\n\n';
  
  let content = '# Large Text Document\n\n';
  const targetBytes = sizeKB * 1024;
  
  while (content.length < targetBytes) {
    content += textBlock;
  }
  
  return content.substring(0, targetBytes);
}

/**
 * Create Mixpad scanner adapter
 */
function createMixpadAdapter(): ParserAdapter {
  try {
    return {
      name: 'mixpad',
      version: '0.0.4',
      isReal: true,
      parse(content: string) {
        const scanner = createScanner();
        scanner.initText(content);
        let tokenCount = 0;
        
        while (scanner.offsetNext < content.length) {
          scanner.scan();
          tokenCount++;
          
          // Safety check to prevent infinite loops
          if (tokenCount > content.length * 2) {
            console.log('Warning: Possible infinite loop in scanner, breaking');
            break;
          }
        }
        
        return { tokenCount };
      }
    };
  } catch (error) {
    console.log('⚠ Could not create real Mixpad scanner:', (error as Error).message);
    
    // Fallback to mock
    return {
      name: 'mixpad-mock',
      version: '0.0.4',
      isReal: false,
      parse(content: string) {
        // Sophisticated mock that simulates real tokenization
        let tokenCount = 0;
        let i = 0;
        
        while (i < content.length) {
          const char = content[i];
          
          if (char === ' ' || char === '\t') {
            tokenCount++;
            i++;
            while (i < content.length && (content[i] === ' ' || content[i] === '\t')) {
              i++;
            }
          } else if (char === '\n' || char === '\r') {
            tokenCount++;
            i++;
            if (char === '\r' && content[i] === '\n') i++;
          } else if ('*_`#[]()!-+'.includes(char)) {
            tokenCount++;
            i++;
            if (i < content.length && content[i] === char && (char === '*' || char === '_')) {
              i++;
            }
          } else {
            tokenCount++;
            while (i < content.length && 
                   content[i] !== ' ' && content[i] !== '\t' && 
                   content[i] !== '\n' && content[i] !== '\r' &&
                   !'*_`#[]()!-+'.includes(content[i])) {
              i++;
            }
          }
        }
        
        return { tokenCount };
      }
    };
  }
}

/**
 * Create parser adapters for all available parsers
 */
function createParserAdapters(): ParserAdapter[] {
  const adapters: ParserAdapter[] = [];
  
  // Mixpad scanner - real TypeScript implementation
  adapters.push(createMixpadAdapter());
  
  // Try to load competitive parsers
  const competitors = [
    {
      name: 'marked',
      load: () => {
        const marked = require('marked');
        return {
          name: 'marked',
          version: marked.options?.version || 'unknown',
          parse: (content: string) => marked.parse(content)
        };
      }
    },
    {
      name: 'markdown-it',
      load: () => {
        const MarkdownIt = require('markdown-it');
        const md = new MarkdownIt();
        return {
          name: 'markdown-it',
          version: MarkdownIt.version || 'unknown',
          parse: (content: string) => md.parse(content)
        };
      }
    },
    {
      name: 'micromark',
      load: () => {
        const { micromark } = require('micromark');
        return {
          name: 'micromark',
          version: 'unknown',
          parse: (content: string) => micromark(content)
        };
      }
    },
    {
      name: 'commonmark',
      load: () => {
        const commonmark = require('commonmark');
        const parser = new commonmark.Parser();
        return {
          name: 'commonmark',
          version: 'unknown',
          parse: (content: string) => parser.parse(content)
        };
      }
    }
  ];
  
  for (const competitor of competitors) {
    try {
      adapters.push(competitor.load());
    } catch (error) {
      console.log(`${competitor.name} not available: ${(error as Error).message}`);
    }
  }
  
  return adapters;
}

/**
 * Measure parsing performance with multiple iterations
 */
function measureParse(adapter: ParserAdapter, content: string, iterations: number = 3): BenchmarkResult {
  const measurements: Array<{
    parseTimeMs: number;
    memoryDelta: number;
    throughputCharsPerSec: number;
    result: any;
  }> = [];
  
  for (let i = 0; i < iterations; i++) {
    if (global.gc) global.gc();
    const memBefore = process.memoryUsage().heapUsed;
    const startTime = performance.now();
    
    const result = adapter.parse(content);
    
    const endTime = performance.now();
    if (global.gc) global.gc();
    const memAfter = process.memoryUsage().heapUsed;
    
    const parseTimeMs = endTime - startTime;
    const throughputCharsPerSec = Math.round(content.length / (parseTimeMs / 1000));
    
    measurements.push({
      parseTimeMs,
      memoryDelta: memAfter - memBefore,
      throughputCharsPerSec,
      result
    });
  }
  
  // Return median measurement
  measurements.sort((a, b) => a.parseTimeMs - b.parseTimeMs);
  const median = measurements[Math.floor(measurements.length / 2)];
  
  return {
    parser: adapter.name,
    dataset: '',
    parseTimeMs: median.parseTimeMs,
    memoryDelta: median.memoryDelta,
    throughputCharsPerSec: median.throughputCharsPerSec,
    throughputMBPerSec: median.throughputCharsPerSec / (1024 * 1024),
    tokenCount: median.result?.tokenCount,
    timestamp: new Date().toISOString()
  };
}

/**
 * Run comprehensive benchmark suite
 */
function runComprehensiveBenchmark(): BenchmarkResult[] {
  console.log('Initializing benchmark...\n');
  
  const datasets = generateTestDatasets();
  const adapters = createParserAdapters();
  
  console.log('System Information:');
  console.log(`  Node.js: ${process.version}`);
  console.log(`  Platform: ${process.platform} ${process.arch}`);
  console.log(`  Memory: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`);
  console.log(`  CPU Count: ${os.cpus().length}`);
  console.log('');
  
  console.log('Available Parsers:', adapters.map(a => a.name).join(', '));
  console.log('Test Datasets:', Object.keys(datasets).map(name => `${name} (${datasets[name].size})`).join(', '));
  console.log('');
  
  const results: BenchmarkResult[] = [];
  const datasetNames = Object.keys(datasets);
  
  for (const datasetName of datasetNames) {
    const dataset = datasets[datasetName];
    console.log(`\n=== Testing ${datasetName} (${dataset.size}) ===`);
    
    for (const adapter of adapters) {
      console.log(`Testing ${adapter.name}...`);
      
      try {
        const result = measureParse(adapter, dataset.content);
        result.dataset = datasetName;
        results.push(result);
        
        const throughputMB = result.throughputMBPerSec.toFixed(1);
        const memoryKB = Math.round(Math.abs(result.memoryDelta) / 1024);
        
        console.log(`  ✓ ${result.parseTimeMs.toFixed(2)}ms | ${throughputMB}MB/s | ${memoryKB}KB memory`);
        
      } catch (error) {
        console.log(`  ✗ ERROR: ${(error as Error).message}`);
      }
    }
  }
  
  return results;
}

/**
 * Generate comparison report
 */
function generateComparisonReport(results: BenchmarkResult[]): void {
  console.log('\n\n=== PERFORMANCE COMPARISON REPORT ===\n');
  
  const datasets = [...new Set(results.map(r => r.dataset))];
  
  for (const dataset of datasets) {
    const datasetResults = results.filter(r => r.dataset === dataset);
    datasetResults.sort((a, b) => a.parseTimeMs - b.parseTimeMs);
    
    console.log(`Dataset: ${dataset}`);
    console.log('Parser               Time  Throughput    Memory');
    console.log('-----------------------------------------------');
    
    for (const result of datasetResults) {
      const name = result.parser.padEnd(15);
      const time = `${result.parseTimeMs.toFixed(2)}ms`.padStart(8);
      const throughput = `${result.throughputMBPerSec.toFixed(1)}MB/s`.padStart(10);
      const memory = `${Math.round(Math.abs(result.memoryDelta) / 1024)}KB`.padStart(8);
      
      console.log(`${name} ${time} ${throughput} ${memory}`);
    }
    console.log('');
  }
  
  // Summary
  console.log('=== PERFORMANCE SUMMARY ===\n');
  const parsers = [...new Set(results.map(r => r.parser))];
  
  console.log('Parser           Avg Time Avg Throughput  Avg Memory');
  console.log('----------------------------------------------------');
  
  for (const parser of parsers) {
    const parserResults = results.filter(r => r.parser === parser);
    const avgTime = parserResults.reduce((sum, r) => sum + r.parseTimeMs, 0) / parserResults.length;
    const avgThroughput = parserResults.reduce((sum, r) => sum + r.throughputMBPerSec, 0) / parserResults.length;
    const avgMemory = parserResults.reduce((sum, r) => sum + Math.abs(r.memoryDelta), 0) / parserResults.length;
    
    const name = parser.padEnd(15);
    const time = `${avgTime.toFixed(2)}ms`.padStart(8);
    const throughput = `${avgThroughput.toFixed(1)}MB/s`.padStart(12);
    const memory = `${Math.round(avgMemory / 1024)}KB`.padStart(10);
    
    console.log(`${name} ${time} ${throughput} ${memory}`);
  }
}

/**
 * Save detailed results to JSON file
 */
function saveDetailedResults(results: BenchmarkResult[]): void {
  try {
    fs.mkdirSync('results', { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = join('results', `competitive-benchmark-ts-${timestamp}.json`);
    
    const report = {
      metadata: {
        timestamp: new Date().toISOString(),
        implementation: 'TypeScript',
        environment: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          cpuCount: os.cpus().length,
          memory: process.memoryUsage()
        }
      },
      results
    };
    
    fs.writeFileSync(filename, JSON.stringify(report, null, 2));
    console.log(`\nDetailed results saved to: ${filename}`);
    
  } catch (error) {
    console.log('\nCould not save results:', (error as Error).message);
  }
}

/**
 * Update README.md with benchmark results (if --update-readme flag is passed)
 */
function updateReadmeWithResults(results: BenchmarkResult[]): void {
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
    let markdown = `\n**Generated:** ${timestamp} (TypeScript Implementation)  \n`;
    markdown += `**System:** ${process.platform} ${process.arch}, Node ${process.version}  \n`;
    markdown += `**Parsers:** ${[...new Set(results.map(r => r.parser))].join(', ')}  \n\n`;
    
    // Group by dataset
    const datasets = [...new Set(results.map(r => r.dataset))];
    
    for (const dataset of datasets) {
      const datasetResults = results.filter(r => r.dataset === dataset);
      markdown += `### ${dataset}\n\n`;
      markdown += '| Parser | Time (ms) | Throughput (MB/s) | Memory (KB) | Tokens |\n';
      markdown += '|--------|-----------|-------------------|-------------|--------|\n';
      
      datasetResults.sort((a, b) => a.parseTimeMs - b.parseTimeMs);
      
      for (const result of datasetResults) {
        const parseTime = result.parseTimeMs.toFixed(2);
        const throughputMB = result.throughputMBPerSec.toFixed(1);
        const memoryKB = Math.round(Math.abs(result.memoryDelta) / 1024);
        const tokens = result.tokenCount || 'N/A';
        
        markdown += `| ${result.parser} | ${parseTime} | ${throughputMB} | ${memoryKB} | ${tokens} |\n`;
      }
      markdown += '\n';
    }
    
    const newContent = beforeMarker + markdown + '\n' + afterMarker;
    
    fs.writeFileSync(readmePath, newContent);
    console.log('\n✓ README.md updated with benchmark results');
    
  } catch (error) {
    console.error('Failed to update README.md:', (error as Error).message);
  }
}

/**
 * Main execution
 */
function main(): void {
  try {
    const results = runComprehensiveBenchmark();
    
    if (results.length > 0) {
      generateComparisonReport(results);
      saveDetailedResults(results);
      
      // Check for --update-readme flag
      const args = process.argv.slice(2);
      if (args.includes('--update-readme')) {
        updateReadmeWithResults(results);
      }
      
      console.log('\n=== Benchmark Suite Complete ===');
      console.log(`Tested ${new Set(results.map(r => r.parser)).size} parsers across ${new Set(results.map(r => r.dataset)).size} datasets`);
      
      // Check if we're using real or mock scanner
      const mixpadResults = results.find(r => r.parser.startsWith('mixpad'));
      if (mixpadResults) {
        if (mixpadResults.parser === 'mixpad') {
          console.log('✓ Benchmarked with REAL Mixpad scanner via TypeScript!');
        } else {
          console.log('⚠ Benchmarked with mock Mixpad scanner (real scanner import failed).');
        }
      }
      
      console.log('Framework successfully demonstrates competitive benchmarking!');
      
    } else {
      console.log('No benchmark results generated');
    }
    
  } catch (error) {
    console.error('Benchmark failed:', error);
    process.exit(1);
  }
}

// Run the comprehensive benchmark
main();