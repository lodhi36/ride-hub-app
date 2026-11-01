const fs = require('fs');
const babel = require('./node_modules/@babel/core');

const files = [
  'src/screens/SplashScreen.tsx',
  'src/screens/FashionScreen.tsx',
  'src/screens/CustomerHomeScreen.tsx'
];

for (const f of files) {
  try {
    const code = fs.readFileSync(f, 'utf8');
    babel.transformSync(code, {
      filename: f,
      presets: ['module:@react-native/babel-preset']
    });
    console.log('✅ ' + f + ' syntax & transform valid!');
  } catch (err) {
    console.error('❌ ' + f + ' Error:', err.message);
    process.exit(1);
  }
}
