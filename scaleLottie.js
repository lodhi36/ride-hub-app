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

let modifiedCount = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes('LottieView')) {
    let original = content;
    // Scale inline styles like { width: 50, height: 50 } by 1.5x
    content = content.replace(/width:\s*(\d+),\s*height:\s*(\d+)/g, (match, w, h) => {
      const newW = Math.round(parseInt(w) * 1.5);
      const newH = Math.round(parseInt(h) * 1.5);
      return `width: ${newW}, height: ${newH}`;
    });
    
    // Check if anything changed
    if (content !== original) {
      fs.writeFileSync(file, content, 'utf8');
      console.log(`Updated sizes in ${path.basename(file)}`);
      modifiedCount++;
    }
  }
});

console.log(`Total files updated: ${modifiedCount}`);
