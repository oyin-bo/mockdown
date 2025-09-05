import { createScanner } from './parser/index';

console.log('Testing CDATA directly with scanner...');

const scanner = createScanner();
const testText = '<![CDATA[ var x = "<test>"; ]]>';

console.log('Input text:', testText);
scanner.initText(testText);

console.log('Starting scan...');
let iterationCount = 0;
const maxIterations = 10;

while (scanner.offsetNext < testText.length && iterationCount < maxIterations) {
  const beforePos = scanner.offsetNext;
  console.log(`Iteration ${iterationCount}: offsetNext=${scanner.offsetNext}, remaining=${testText.length - scanner.offsetNext}`);
  
  scanner.scan();
  
  console.log(`After scan: token=${scanner.token}, tokenText="${scanner.tokenText}", offsetNext=${scanner.offsetNext}`);
  
  if (scanner.offsetNext === beforePos) {
    console.log('ERROR: Scanner did not advance position - infinite loop detected!');
    break;
  }
  
  iterationCount++;
}

if (iterationCount >= maxIterations) {
  console.log('ERROR: Reached maximum iterations - likely infinite loop');
}

console.log('Done.');