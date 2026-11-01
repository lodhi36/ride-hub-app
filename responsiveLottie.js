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

    // We will use Dimensions for responsive sizing
    let needsDimensions = false;

    content = content.replace(/width:\s*(\d+),\s*height:\s*(\d+)/g, (match, w, h) => {
      // Calculate responsive percentage based on an average 375px width screen
      const pW = (parseInt(w) / 375).toFixed(2);
      const pH = (parseInt(h) / 375).toFixed(2);
      
      // We will use windowWidth * pW
      needsDimensions = true;
      return `width: windowWidth * ${pW}, height: windowWidth * ${pH}`;
    });
    
    if (needsDimensions) {
      if (!content.includes('import { Dimensions }')) {
        // Add it after React import
        content = content.replace(/(import React.*?;\n)/, "$1import { Dimensions } from 'react-native';\n");
      }
      
      if (!content.includes('windowWidth = Dimensions.get')) {
        // Add windowWidth globally in the file
        content = content.replace(/(import .*?;\n)(?!import)/s, "$1\nconst windowWidth = Dimensions.get('window').width;\n");
      }
    }
    
    if (content !== original) {
      fs.writeFileSync(file, content, 'utf8');
      console.log(`Made responsive sizes in ${path.basename(file)}`);
      modifiedCount++;
    }
  }
});

console.log(`Total files updated to responsive: ${modifiedCount}`);
