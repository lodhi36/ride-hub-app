const fs = require('fs');

const content = fs.readFileSync('datin/DatingApp/src/screens/LiveTrackingScreen.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((l, i) => {
  if (l.includes('isFoodDelivery')) {
    console.log(`L${i + 1}: ${l.trim().substring(0, 110)}`);
  }
});
