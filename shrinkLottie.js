const fs = require('fs');
const path = require('path');

const dir = 'c:/Users/pc/Downloads/o/DatingApp/src';

function walk(directory) {
  let results = [];
  const list = fs.readdirSync(directory);
  list.forEach(file => {
    file = path.join(directory, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.tsx')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk(dir);

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // Reduce the windowWidth multiplier by about 30-35% to make it smaller
  // Currently they are like width: windowWidth * 0.20
  content = content.replace(/(width|height):\s*windowWidth\s*\*\s*([0-9.]+)/g, (match, prop, val) => {
    let newVal = parseFloat(val) * 0.65; // reduce by 35%
    return `${prop}: windowWidth * ${newVal.toFixed(2)}`;
  });

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    console.log('Reduced size in ' + path.basename(file));
  }
});
