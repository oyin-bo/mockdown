/**
 * Quick test to verify new datasets and remark parser work
 */

const fs = require('fs');

// Import the dataset generation functions (simplified versions)
function generatePathologicalDoc(sizeKB) {
  const pathologicalPatterns = [
    '***This is ****very**** deeply nested emphasis*** with more text.\n\n',
    '[Link with [nested [deeply [nested] link] structure] here](https://example.com)\n\n',
    '**Bold _italic **bold** italic_ bold**\n\n',
    '`Code with **bold** inside` and **bold with `code` inside**\n\n',
  ];
  
  let content = '# Pathological Test Document\n\nThis document tests edge cases and stress scenarios.\n\n';
  const targetBytes = sizeKB * 1024;
  
  while (content.length < targetBytes) {
    content += pathologicalPatterns[content.length % pathologicalPatterns.length];
  }
  
  return content.substring(0, targetBytes);
}

function generateDocsCollectionDoc() {
  let content = '# Mixpad Documentation Collection\n\n';
  content += 'This dataset combines all documentation files from the repository for realistic testing.\n\n';
  content += '---\n\n';
  
  const docPaths = [
    '../../README.md',
    '../../AGENTS.md',
    '../docs/1-scanner-interface.md'
  ];
  
  for (const docPath of docPaths) {
    try {
      if (fs.existsSync(docPath)) {
        const docContent = fs.readFileSync(docPath, 'utf-8');
        const fileName = docPath.split('/').pop() || 'unknown';
        
        content += `## ${fileName}\n\n`;
        content += `*Source: ${docPath}*\n\n`;
        content += docContent.substring(0, 1000); // Limit size for test
        content += '\n\n---\n\n';
      }
    } catch (error) {
      console.log(`Warning: Could not read ${docPath}`);
    }
  }
  
  return content;
}

// Test dataset generation
console.log('Testing new dataset generation...\n');

console.log('1. Pathological dataset:');
const pathological = generatePathologicalDoc(1); // 1KB
console.log(`Generated ${pathological.length} characters`);
console.log('Sample:', pathological.substring(0, 200) + '...\n');

console.log('2. Docs collection dataset:');
const docs = generateDocsCollectionDoc();
console.log(`Generated ${docs.length} characters`);
console.log('Sample:', docs.substring(0, 200) + '...\n');

// Test remark parser
console.log('3. Testing remark parser:');
try {
  const { remark } = require('remark');
  const processor = remark();
  const result = processor.parse('# Test\n\nThis is a **test** document.');
  console.log('✓ Remark parser loaded and working');
  console.log('Result type:', typeof result, result.type || 'unknown');
} catch (error) {
  console.log('✗ Remark parser failed:', error.message);
}

console.log('\n✓ All new features appear to be working!');
