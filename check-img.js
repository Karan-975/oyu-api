const fs = require('fs');

const buf = fs.readFileSync('C:\\Users\\Agnito\\.gemini\\antigravity-ide\\brain\\9707c20d-13ec-433e-ad5a-0c7343df4575\\current_screen.png');
// PNG width is at offset 16 (4 bytes), height at offset 20 (4 bytes)
const width = buf.readInt32BE(16);
const height = buf.readInt32BE(20);
console.log(`Image dimensions: ${width}x${height}`);
