import { verifyTokens } from './parser/tests/verify-tokens.ts';

// Test current entity behavior
const entityTest = `
&gt;
1
@1 EntityToken "&gt;"`;

console.log('Input test:');
console.log(entityTest);
console.log('\nActual result:');
const result = verifyTokens(entityTest);
console.log(result);
console.log('\nMatches input:', entityTest.trim() === result.trim());