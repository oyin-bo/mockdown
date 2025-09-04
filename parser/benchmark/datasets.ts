/**
 * Dataset generation for Markdown parsing benchmarks
 * 
 * Generates various types of test documents to evaluate parser performance
 * across different content patterns and sizes.
 */

export interface BenchmarkDataset {
  name: string;
  description: string;
  content: string;
  size: number;
  characteristics: string[];
}

/**
 * Generate a simple document with basic formatting
 */
function generateSimpleDocument(targetSize: number): string {
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
  let patternIndex = 0;
  
  while (content.length < targetSize) {
    content += patterns[patternIndex % patterns.length];
    patternIndex++;
  }
  
  return content.substring(0, targetSize);
}

/**
 * Generate a document with mixed complex elements
 */
function generateMixedDocument(targetSize: number): string {
  const complexPatterns = [
    '# Complex Document\n\n',
    'This paragraph contains **nested *italic inside bold* formatting** and more text.\n\n',
    '```javascript\n// Code block\nfunction example() {\n  return "Hello World";\n}\n```\n\n',
    '| Column 1 | Column 2 | Column 3 |\n|----------|----------|----------|\n| Cell 1   | Cell 2   | Cell 3   |\n| Cell 4   | Cell 5   | Cell 6   |\n\n',
    '> This is a blockquote with **bold text**\n> and multiple lines.\n>\n> Another paragraph in quote.\n\n',
    '1. Ordered list item\n2. Another ordered item\n3. Third item with `code`\n\n',
    'Text with ~~strikethrough~~ and more formatting.\n\n'
  ];
  
  let content = '';
  let patternIndex = 0;
  
  while (content.length < targetSize) {
    content += complexPatterns[patternIndex % complexPatterns.length];
    patternIndex++;
  }
  
  return content.substring(0, targetSize);
}

/**
 * Generate a text-heavy document with minimal formatting
 */
function generateTextHeavyDocument(targetSize: number): string {
  const textBlock = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.\n\n';
  
  let content = '# Large Text Document\n\n';
  
  while (content.length < targetSize) {
    content += textBlock;
  }
  
  return content.substring(0, targetSize);
}

/**
 * Generate a document with heavy inline formatting
 */
function generateFormattingHeavyDocument(targetSize: number): string {
  const heavyPatterns = [
    'Text with **bold** and *italic* and `code` mixed together.\n',
    'More **complex *nested* formatting** with additional text.\n',
    'Line with ~~strikethrough~~ and **bold ~~strikethrough~~** combinations.\n',
    'Text with `inline code` and **bold `code in bold`** patterns.\n',
    'Multiple *emphasis* **strong** `code` ~~strike~~ in one line.\n',
    '\n'
  ];
  
  let content = '# Formatting Heavy Document\n\n';
  let patternIndex = 0;
  
  while (content.length < targetSize) {
    content += heavyPatterns[patternIndex % heavyPatterns.length];
    patternIndex++;
  }
  
  return content.substring(0, targetSize);
}

/**
 * Generate pathological edge cases for stress testing
 */
function generatePathologicalDocument(targetSize: number): string {
  const pathologicalPatterns = [
    '# Edge Cases Document\n\n',
    'Text with unmatched *emphasis and **bold formatting.\n',
    'Multiple ****asterisks**** and ____underscores____.\n',
    'Line with ```unclosed code block\n',
    'Text with <<>> and ++ and @@ special characters.\n',
    'Unicode text: 你好世界 🌍 émojis 🎉 and symbols.\n',
    'Very_long_word_with_many_underscores_that_might_cause_issues.\n',
    'Text with trailing spaces    \nand various whitespace.\n',
    '\n'
  ];
  
  let content = '';
  let patternIndex = 0;
  
  while (content.length < targetSize) {
    content += pathologicalPatterns[patternIndex % pathologicalPatterns.length];
    patternIndex++;
  }
  
  return content.substring(0, targetSize);
}

/**
 * Generate all benchmark datasets
 */
export function generateDatasets(): BenchmarkDataset[] {
  return [
    {
      name: 'small-simple',
      description: 'Basic Markdown with simple formatting',
      content: generateSimpleDocument(1024), // 1KB
      size: 1024,
      characteristics: ['headers', 'paragraphs', 'basic-emphasis']
    },
    {
      name: 'medium-mixed',
      description: 'Real-world document with mixed elements', 
      content: generateMixedDocument(50 * 1024), // 50KB
      size: 50 * 1024,
      characteristics: ['lists', 'code-blocks', 'links', 'tables', 'quotes']
    },
    {
      name: 'large-text-heavy',
      description: 'Large document with extensive text content',
      content: generateTextHeavyDocument(500 * 1024), // 500KB
      size: 500 * 1024,
      characteristics: ['long-paragraphs', 'minimal-formatting']
    },
    {
      name: 'complex-formatting',
      description: 'Heavy emphasis and inline formatting',
      content: generateFormattingHeavyDocument(100 * 1024), // 100KB
      size: 100 * 1024,
      characteristics: ['nested-emphasis', 'inline-code', 'strikethrough']
    },
    {
      name: 'pathological',
      description: 'Edge cases and stress testing',
      content: generatePathologicalDocument(100 * 1024), // 100KB
      size: 100 * 1024,
      characteristics: ['deep-nesting', 'ambiguous-syntax', 'unicode']
    }
  ];
}

// Export datasets instance
export const datasets = generateDatasets();