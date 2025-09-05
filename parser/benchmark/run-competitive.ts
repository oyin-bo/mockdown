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
    },
    'pathological': {
      size: '100KB',
      content: generatePathologicalDoc(100),
      characteristics: ['edge-cases', 'stress-testing', 'complex-nesting']
    },
    'super-heavy': {
      size: '15MB',
      content: generateSuperHeavyDoc(15 * 1024),
      characteristics: ['massive-document', 'realistic-content', 'performance-test']
    },
    'docs-collection': {
      size: 'Variable',
      content: generateDocsCollectionDoc(),
      characteristics: ['real-documents', 'mixed-content', 'actual-usage']
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

function generatePathologicalDoc(sizeKB: number): string {
  const pathologicalPatterns = [
    // Deeply nested emphasis
    '***This is ****very**** deeply nested emphasis*** with more text.\n\n',
    // Complex link structures
    '[Link with [nested [deeply [nested] link] structure] here](https://example.com)\n\n',
    // Mixed list structures
    '1. Ordered item\n   - Nested unordered\n     1. Nested ordered\n       - More nesting\n         * Even more\n\n',
    // Edge case markdown
    '**Bold _italic **bold** italic_ bold**\n\n',
    '`Code with **bold** inside` and **bold with `code` inside**\n\n',
    // Table with complex content
    '| **Bold** | *Italic* | `Code` | [Link](url) |\n|----------|----------|--------|-------------|\n| **B** | *I* | `C` | [L](u) |\n\n',
    // Complex blockquotes
    '> This is a quote\n> > With nested quote\n> > > And deeper nesting\n> Back to level 1\n\n',
    // Problematic characters and escapes
    'Text with \\*escaped\\* chars and \\[brackets\\] and \\`backticks\\`.\n\n',
    // HTML mixed with markdown
    '<div>HTML with **markdown** inside</div>\n\n**Markdown with <em>HTML</em> inside**\n\n',
    // Edge case headers
    '### Header with *italic* and **bold** and `code`\n\n'
  ];
  
  let content = '# Pathological Test Document\n\nThis document tests edge cases and stress scenarios.\n\n';
  const targetBytes = sizeKB * 1024;
  
  while (content.length < targetBytes) {
    content += pathologicalPatterns[content.length % pathologicalPatterns.length];
  }
  
  return content.substring(0, targetBytes);
}

function generateSuperHeavyDoc(sizeKB: number): string {
  // Use a simple Linear Congruential Generator for reproducible pseudo-random content
  class SimpleRandom {
    private seed: number;
    
    constructor(seed: number = 12345) {
      this.seed = seed;
    }
    
    next(): number {
      this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
      return this.seed / 4294967296;
    }
    
    choice<T>(array: T[]): T {
      return array[Math.floor(this.next() * array.length)];
    }
    
    int(min: number, max: number): number {
      return Math.floor(this.next() * (max - min + 1)) + min;
    }
  }
  
  const rng = new SimpleRandom(42); // Fixed seed for reproducibility
  
  const headingWords = ['Introduction', 'Overview', 'Analysis', 'Implementation', 'Results', 'Discussion', 'Conclusion', 'Background', 'Methodology', 'Findings', 'Summary', 'Details', 'Process', 'Framework', 'Architecture', 'Design', 'Performance', 'Optimization', 'Strategy', 'Approach'];
  
  const topics = ['system', 'data', 'algorithm', 'network', 'security', 'performance', 'scalability', 'architecture', 'design', 'implementation', 'analysis', 'research', 'development', 'testing', 'optimization', 'framework', 'methodology', 'strategy', 'solution', 'technology'];
  
  const adjectives = ['advanced', 'comprehensive', 'detailed', 'efficient', 'robust', 'scalable', 'innovative', 'complex', 'sophisticated', 'reliable', 'flexible', 'powerful', 'modern', 'integrated', 'optimized', 'enhanced', 'streamlined', 'effective', 'practical', 'strategic'];
  
  const sentences = [
    'This approach provides significant improvements in overall system performance and reliability.',
    'The implementation demonstrates excellent scalability characteristics under various load conditions.',
    'Our analysis reveals important insights into the underlying mechanisms and their interactions.',
    'The proposed methodology offers a comprehensive framework for addressing complex challenges.',
    'Experimental results validate the effectiveness of the developed solution across multiple scenarios.',
    'The architecture supports flexible configuration and extensible functionality for future enhancements.',
    'Performance metrics indicate substantial gains in throughput and response time optimization.',
    'The framework enables seamless integration with existing systems and legacy infrastructure.',
    'Detailed analysis shows consistent behavior patterns across diverse operational environments.',
    'The solution addresses critical requirements while maintaining backward compatibility and stability.'
  ];
  
  let content = '# Super Heavy Performance Test Document\n\n';
  content += 'This document contains a large amount of realistic markdown content for performance testing.\n\n';
  content += '**Document Size:** Approximately 15MB of varied markdown content\n\n';
  content += '**Purpose:** Stress testing parser performance with realistic document structures\n\n';
  content += '---\n\n';
  
  const targetBytes = sizeKB * 1024;
  
  while (content.length < targetBytes) {
    // Generate a section
    const headingLevel = rng.int(1, 3);
    const heading = rng.choice(headingWords);
    const topic = rng.choice(topics);
    const adjective = rng.choice(adjectives);
    
    content += '#'.repeat(headingLevel) + ` ${heading}: ${adjective} ${topic}\n\n`;
    
    // Add some paragraphs
    const paragraphCount = rng.int(2, 5);
    for (let p = 0; p < paragraphCount; p++) {
      const sentenceCount = rng.int(3, 7);
      let paragraph = '';
      
      for (let s = 0; s < sentenceCount; s++) {
        let sentence = rng.choice(sentences);
        
        // Add some formatting randomly
        if (rng.next() < 0.3) {
          const words = sentence.split(' ');
          const wordIndex = rng.int(0, words.length - 1);
          const formatType = rng.int(1, 3);
          
          if (formatType === 1) {
            words[wordIndex] = `**${words[wordIndex]}**`;
          } else if (formatType === 2) {
            words[wordIndex] = `*${words[wordIndex]}*`;
          } else {
            words[wordIndex] = `\`${words[wordIndex]}\``;
          }
          
          sentence = words.join(' ');
        }
        
        paragraph += sentence + ' ';
      }
      
      content += paragraph.trim() + '\n\n';
    }
    
    // Add some structured content occasionally
    if (rng.next() < 0.2) {
      // Add a list
      const listType = rng.next() < 0.5 ? '-' : '1.';
      const itemCount = rng.int(3, 8);
      
      content += 'Key points:\n\n';
      for (let i = 0; i < itemCount; i++) {
        const item = rng.choice(sentences);
        const listMarker = listType === '-' ? '-' : `${i + 1}.`;
        content += `${listMarker} ${item}\n`;
      }
      content += '\n';
    }
    
    if (rng.next() < 0.15) {
      // Add a code block
      content += 'Example implementation:\n\n';
      content += '```javascript\n';
      content += `function ${rng.choice(topics)}${rng.choice(['Process', 'Handler', 'Manager', 'Controller'])}() {\n`;
      content += '  // Implementation details\n';
      content += `  const ${rng.choice(['config', 'options', 'settings'])} = {\n`;
      content += `    ${rng.choice(['enabled', 'active', 'ready'])}: true,\n`;
      content += `    ${rng.choice(['timeout', 'delay', 'interval'])}: ${rng.int(100, 5000)},\n`;
      content += `    ${rng.choice(['mode', 'type', 'strategy'])}: '${rng.choice(['auto', 'manual', 'hybrid'])}'\n`;
      content += '  };\n';
      content += '  return processData(config);\n';
      content += '}\n';
      content += '```\n\n';
    }
    
    if (rng.next() < 0.1) {
      // Add a table
      content += 'Performance comparison:\n\n';
      content += '| Metric | Before | After | Improvement |\n';
      content += '|--------|---------|-------|-------------|\n';
      
      const metrics = ['Throughput', 'Latency', 'Memory Usage', 'CPU Usage', 'Response Time'];
      for (let i = 0; i < rng.int(3, 5); i++) {
        const metric = rng.choice(metrics);
        const before = rng.int(10, 100);
        const after = rng.int(5, before);
        const improvement = Math.round(((before - after) / before) * 100);
        content += `| ${metric} | ${before} | ${after} | ${improvement}% |\n`;
      }
      content += '\n';
    }
    
    if (rng.next() < 0.1) {
      // Add a blockquote
      content += '> ' + rng.choice(sentences) + '\n';
      content += '> \n';
      content += '> ' + rng.choice(sentences) + '\n\n';
    }
    
    // Add some spacing
    if (rng.next() < 0.3) {
      content += '---\n\n';
    }
  }
  
  return content.substring(0, targetBytes);
}

function generateDocsCollectionDoc(): string {
  let content = '# Mixpad Documentation Collection\n\n';
  content += 'This dataset combines all documentation files from the repository for realistic testing.\n\n';
  content += '---\n\n';
  
  // List of all documentation files in the repository
  const docPaths = [
    '../../README.md',
    '../../AGENTS.md',
    '../docs/1-scanner-interface.md',
    '../docs/2-parser-scanner-shift.md',
    '../docs/3-parser-scanner-shift-plan.md',
    '../docs/4-scanner-1-basic.md',
    '../docs/5-scanner-2-verify-tokens.md',
    '../docs/6-scanner-leaner.md',
    '../docs/7-benchmarking.md',
    '../docs/8-html-entities.md',
    '../prev/docs/0-prior-art.md',
    '../prev/docs/1-plan.md',
    '../prev/docs/2-scanner.md',
    '../prev/docs/3-scanner-followup.md',
    '../prev/docs/4-scanner-followup-strictness-and-breadth.md',
    '../prev/docs/5-scanner-followup-markdown-in-html.md',
    '../prev/docs/6-scanner-followup-post-mdhtml-shift.md',
    '../prev/docs/7-parser.md',
    '../prev/docs/8-parser-1-core.md',
    '../prev/docs/9-parser-2-engine.md',
    '../prev/docs/10-side-quest-identifier-tokens.md'
  ];
  
  for (const docPath of docPaths) {
    try {
      if (fs.existsSync(docPath)) {
        const docContent = fs.readFileSync(docPath, 'utf-8');
        const fileName = docPath.split('/').pop() || 'unknown';
        
        content += `## ${fileName}\n\n`;
        content += `*Source: ${docPath}*\n\n`;
        content += docContent;
        content += '\n\n---\n\n';
      }
    } catch (error) {
      // Skip files that can't be read
      console.log(`Warning: Could not read ${docPath}`);
    }
  }
  
  return content;
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
      name: 'remark',
      load: () => {
        const { remark } = require('remark');
        const processor = remark();
        return {
          name: 'remark',
          version: 'unknown',
          parse: (content: string) => processor.parse(content)
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