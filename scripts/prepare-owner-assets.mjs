// Web encodings only: original artwork and work photographs remain byte-for-byte unchanged.
import sharp from 'sharp';
import { readFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const recent = JSON.parse(await readFile(resolve(root, 'src/data/recent-works.json'), 'utf8'));
const responsive = resolve(root, 'public/images/responsive');
const brand = resolve(root, 'public/brand');
await mkdir(responsive, { recursive: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
for (const work of recent) {
  const original = await readFile(resolve(root, 'public', work.image.slice(1)));
  if (hash(original) !== work.sha256) throw new Error('Original photo checksum differs: ' + work.id);
  const metadata = await sharp(original).metadata();
  if (metadata.width !== work.width || metadata.height !== work.height) throw new Error('Photo dimensions differ: ' + work.id);
  for (const width of [360, 720]) {
    await sharp(original).resize({ width, withoutEnlargement: true }).webp({ quality: 84, effort: 6 }).toFile(resolve(responsive, work.id + '-' + width + '.webp'));
  }
}
const logo = await readFile(resolve(brand, 'klim-logo.jpg'));
if (hash(logo) !== '0090bb524f7d015e4172e2a176613b86539d2f9e59095beee677b2c78a0f717a') throw new Error('Approved logo checksum differs');
for (const width of [384, 768]) await sharp(logo).resize(width, width).webp({ lossless: true, effort: 6 }).toFile(resolve(brand, 'klim-logo-' + width + '.webp'));
for (const width of [180, 192, 512]) await sharp(logo).resize(width, width).png().toFile(resolve(brand, 'klim-logo-' + width + '.png'));
console.log(JSON.stringify({ originalsVerified: recent.length + 1, workVariants: recent.length * 2, logoVariants: 5 }));
