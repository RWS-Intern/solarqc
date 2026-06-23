import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = join(__dirname, '../public/solar-icon.png');
const outDir = join(__dirname, '../public/icons');

mkdirSync(outDir, { recursive: true });

const sizes = [
  { name: 'icon-72.png',   size: 72  },
  { name: 'icon-96.png',   size: 96  },
  { name: 'icon-128.png',  size: 128 },
  { name: 'icon-144.png',  size: 144 },
  { name: 'icon-152.png',  size: 152 },
  { name: 'icon-192.png',  size: 192 },
  { name: 'icon-384.png',  size: 384 },
  { name: 'icon-512.png',  size: 512 },
];

for (const { name, size } of sizes) {
  await sharp(src)
    .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toFile(join(outDir, name));
  console.log(`✓ Generated ${name}`);
}

// Also generate favicon as 32x32 PNG (browsers accept PNG favicon)
await sharp(src)
  .resize(32, 32, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
  .png()
  .toFile(join(__dirname, '../public/favicon.png'));
console.log('✓ Generated favicon.png');

console.log('All icons generated successfully!');
