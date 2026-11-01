const fs = require('fs');

const content = fs.readFileSync('src/screens/DeliveryRiderHomeScreen.tsx', 'utf8');
const lines = content.split('\n');

const stack = [];
lines.forEach((line, idx) => {
  const lineNum = idx + 1;
  const trimmed = line.trim();
  if (trimmed.startsWith('try {') || trimmed === 'try {') {
    stack.push({ type: 'try', line: lineNum });
  }
  if (trimmed.startsWith('} catch') || trimmed.startsWith('} finally')) {
    if (stack.length > 0 && stack[stack.length - 1].type === 'try') {
      stack.pop();
    } else {
      console.log(`Unmatched catch at line ${lineNum}`);
    }
  }
});

console.log('Unclosed try blocks:', stack);
