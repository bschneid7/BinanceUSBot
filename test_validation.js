#!/usr/bin/env node

console.log('='.repeat(70));
console.log('BinanceUSBot LOT_SIZE Validation Test Suite');
console.log('='.repeat(70));
console.log('');

function getPrecision(stepSize) {
  const s = typeof stepSize === 'number' ? stepSize.toString() : stepSize;
  if (s.toLowerCase().includes('e')) {
    const match = s.toLowerCase().match(/e-(\d+)/);
    if (match) return parseInt(match[1], 10);
  }
  if (!s.includes('.')) return 0;
  let trimmed = s.replace(/(\.\d*?)0+$/, '$1');
  if (trimmed.endsWith('.')) trimmed = trimmed.substring(0, trimmed.length - 1);
  if (!trimmed.includes('.')) return 0;
  return trimmed.length - trimmed.indexOf('.') - 1;
}

function validateLotSizeBroken(quantity, stepSize) {
  const step = parseFloat(stepSize);
  const remainder = quantity % step;
  const isValid = Math.abs(remainder) < 1e-8 || Math.abs(remainder - step) < 1e-8;
  return { valid: isValid, remainder: remainder };
}

function validateLotSizeFixed(quantity, stepSize) {
  const step = parseFloat(stepSize);
  const precision = getPrecision(stepSize);
  const scaleFactor = Math.pow(10, precision);
  const quantityScaled = Math.round(quantity * scaleFactor);
  const stepScaled = Math.round(step * scaleFactor);
  const remainder = quantityScaled % stepScaled;
  return { valid: remainder === 0, remainder, quantityScaled, stepScaled, precision };
}

const testCases = [
  { symbol: 'DOGEUSD', quantity: 2424.24, stepSize: 0.01, shouldPass: true },
  { symbol: 'SOLUSD', quantity: 5.147, stepSize: 0.001, shouldPass: true },
  { symbol: 'ETHUSD', quantity: 0.931, stepSize: 0.001, shouldPass: true },
  { symbol: 'BTCUSD', quantity: 0.06195, stepSize: 0.00001, shouldPass: true },
];

console.log('Demonstrating the Floating-Point Problem:');
console.log('-'.repeat(70));
const demo = testCases[0];
console.log(\`\${demo.quantity} % \${demo.stepSize} = \${demo.quantity % demo.stepSize}\`);
console.log(\`Expected: 0.00, Actual: \${demo.quantity % demo.stepSize}\`);
console.log('❌ This is why validation fails!\\n\\n');

console.log('Current (Broken) Validation:');
console.log('-'.repeat(70));
let brokenCorrect = 0;
testCases.forEach(test => {
  const result = validateLotSizeBroken(test.quantity, test.stepSize);
  const correct = result.valid === test.shouldPass;
  if (correct) brokenCorrect++;
  console.log(\`\${correct ? '✅' : '❌'} \${test.symbol}: \${result.valid ? 'PASS' : 'FAIL'} (remainder: \${result.remainder.toFixed(20)})\`);
});
console.log(\`\\nAccuracy: \${brokenCorrect}/\${testCases.length}\\n\\n\`);

console.log('Fixed Validation (Scaled Integer):');
console.log('-'.repeat(70));
let fixedCorrect = 0;
testCases.forEach(test => {
  const result = validateLotSizeFixed(test.quantity, test.stepSize);
  const correct = result.valid === test.shouldPass;
  if (correct) fixedCorrect++;
  console.log(\`\${correct ? '✅' : '❌'} \${test.symbol}: \${result.valid ? 'PASS' : 'FAIL'} (scaled: \${result.quantityScaled} % \${result.stepScaled} = \${result.remainder})\`);
});
console.log(\`\\nAccuracy: \${fixedCorrect}/\${testCases.length}\\n\`);

console.log('='.repeat(70));
if (fixedCorrect === testCases.length) {
  console.log('🎉 SUCCESS! The fix resolves all test cases!');
} else {
  console.log('⚠️ Some issues remain');
}
console.log('='.repeat(70));
