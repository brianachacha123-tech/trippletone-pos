const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const ICONS_DIR = path.join(__dirname, '..', 'public', 'icons');
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

async function convertIcons() {
  for (const size of sizes) {
    const svgPath = path.join(ICONS_DIR, `icon-${size}x${size}.svg`);
    const pngPath = path.join(ICONS_DIR, `icon-${size}x${size}.png`);
    
    if (fs.existsSync(svgPath)) {
      try {
        await sharp(svgPath)
          .resize(size, size)
          .png()
          .toFile(pngPath);
        console.log(`✅ icon-${size}x${size}.png`);
      } catch (err) {
        console.log(`⚠️ Failed icon-${size}x${size}: ${err.message}`);
      }
    }
  }
  
  // Also create apple-touch-icon (180x180)
  const touchSvg = path.join(ICONS_DIR, 'icon-192x192.svg');
  const touchPng = path.join(ICONS_DIR, 'apple-touch-icon.png');
  if (fs.existsSync(touchSvg)) {
    try {
      await sharp(touchSvg).resize(180, 180).png().toFile(touchPng);
      console.log('✅ apple-touch-icon.png (180x180)');
    } catch (err) {
      console.log(`⚠️ Failed apple-touch-icon: ${err.message}`);
    }
  }
  
  console.log('\n🎉 All icons converted!');
}

convertIcons();
