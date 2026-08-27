// Run: node scripts/generate-icons.js
// Generates PNG icons for the PWA from an SVG-based approach

const fs = require('fs');
const path = require('path');

const ICONS_DIR = path.join(__dirname, '..', 'public', 'icons');

// Create SVG icon template
function createSVG(size) {
  const padding = size * 0.15;
  const fontSize = size * 0.3;
  const emojiSize = size * 0.35;
  
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a2e"/>
      <stop offset="100%" style="stop-color:#0f3460"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${size * 0.18}" fill="url(#bg)"/>
  <text x="50%" y="42%" text-anchor="middle" dominant-baseline="middle" font-size="${emojiSize}" fill="white">🍺</text>
  <text x="50%" y="72%" text-anchor="middle" dominant-baseline="middle" font-size="${fontSize * 0.45}" font-weight="bold" fill="#e94560" font-family="Arial, sans-serif">POS</text>
</svg>`;
}

// Ensure icons directory exists
if (!fs.existsSync(ICONS_DIR)) {
  fs.mkdirSync(ICONS_DIR, { recursive: true });
}

// Generate SVG files for each size
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

sizes.forEach(size => {
  const svg = createSVG(size);
  const svgPath = path.join(ICONS_DIR, `icon-${size}x${size}.svg`);
  fs.writeFileSync(svgPath, svg);
  console.log(`Created SVG: icon-${size}x${size}.svg`);
});

// Also create a simple favicon
const favicon = createSVG(32);
fs.writeFileSync(path.join(ICONS_DIR, 'favicon.svg'), favicon);
console.log('Created favicon.svg');

console.log('\n✅ SVG icons created!');
console.log('\nTo convert to PNG, install sharp: npm install sharp');
console.log('Then run: node scripts/convert-icons-to-png.js');
console.log('\nOR use the icons directly - modern browsers support SVG in PWA manifests.');
