// Export Codex portrait originals through the browser's built-in WebP encoder, with no extra codec dependency.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve, join, dirname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { launchBrowser, useLocalTemp } from '../lab/node/browser.mjs';
import { lowerPriority } from '../lab/node/priority.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CLASSES = ['mage', 'warrior', 'ranger'];
const SIZE = 192;
const MAX_BYTES = 20000;
const manifest = process.argv[2];
const replace = process.argv.includes('--replace');
if (!manifest) throw new Error('Usage: node tools/portraits/portraits.mjs <sources.json> [--replace]');
const sources = JSON.parse(readFileSync(resolve(manifest), 'utf8'));
const keys = sources.map((row) => `${row.classId}-${row.id}`);
const classes = CLASSES.filter((classId) => sources.some((row) => row.classId === classId));
const counts = classes.map((classId) => sources.filter((row) => row.classId === classId).length);
const validIds = sources.every((row) => CLASSES.includes(row.classId) && /^\d{2}$/.test(row.id));
if (!validIds || !counts.length || !counts.every((count) => count === counts[0])
  || new Set(keys).size !== keys.length) {
  throw new Error('Expected the same positive number of unique, two-digit portraits for each supplied class');
}
const columns = counts[0];

const originals = join(ROOT, '.tmp/portrait-art');
const output = join(ROOT, 'tools/portraits/out');
mkdirSync(originals, { recursive: true });
mkdirSync(output, { recursive: true });
lowerPriority();
useLocalTemp(output);
const browser = await launchBrowser();
const prompts = [];
const exported = [];
let total = 0;
try {
  const page = await browser.newPage();
  for (const row of sources) {
    const name = `portrait-${row.classId}-${row.id}`;
    const originalName = row.original ?? `${name}.png`;
    if (basename(originalName) !== originalName) throw new Error('Original must be a filename');
    const original = join(originals, originalName);
    if (!existsSync(original)) copyFileSync(row.path, original);
    const data = `data:image/png;base64,${readFileSync(original).toString('base64')}`;
    const webp = await page.evaluate(async ({ data, size, crop }) => {
      const image = new Image();
      image.src = data;
      await image.decode();
      const region = crop ?? { x: 0, y: 0, size: image.width };
      if ((!crop && image.width !== image.height) || ![region.x, region.y, region.size].every(Number.isInteger)
        || region.size < size || region.x < 0 || region.y < 0
        || region.x + region.size > image.width || region.y + region.size > image.height) {
        throw new Error('Expected a square crop within the original, at least the export size');
      }
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const context = canvas.getContext('2d');
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, region.x, region.y, region.size, region.size, 0, 0, size, size);
      return canvas.toDataURL('image/webp', 0.82);
    }, { data, size: SIZE, crop: row.crop });
    if (!webp.startsWith('data:image/webp;base64,')) throw new Error('This browser cannot encode WebP');
    const directory = join(ROOT, 'src/ui/portraits', row.classId);
    mkdirSync(directory, { recursive: true });
    const file = join(directory, `${name}.webp`);
    if (replace && existsSync(file)) {
      const previous = readFileSync(file);
      const hash = createHash('sha256').update(previous).digest('hex').slice(0, 12);
      const archive = join(originals, `${name}-${hash}.webp`);
      if (!existsSync(archive)) writeFileSync(archive, previous);
    }
    if (replace || !existsSync(file)) writeFileSync(file, Buffer.from(webp.split(',')[1], 'base64'));
    const bytes = statSync(file).size;
    if (bytes > MAX_BYTES) throw new Error(`${name} exceeds the ${MAX_BYTES} byte budget`);
    total += bytes;
    const encoded = `data:image/webp;base64,${readFileSync(file).toString('base64')}`;
    const column = exported.filter((item) => item.classId === row.classId).length;
    exported.push({ classId: row.classId, id: row.id, column, data: encoded });
    prompts.push({ classId: row.classId, id: row.id, original: originalName, ...(row.crop ? { crop: row.crop } : {}), prompt: row.prompt ?? '' });
  }
  const sheet = await page.evaluate(async ({ portraits, classes, size, columns }) => {
    const canvas = document.createElement('canvas');
    canvas.width = size * columns;
    canvas.height = (size + 22) * classes.length;
    const context = canvas.getContext('2d');
    context.fillStyle = '#141216';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.font = '14px sans-serif';
    context.fillStyle = '#ddd5c9';
    for (const portrait of portraits) {
      const image = new Image();
      image.src = portrait.data;
      await image.decode();
      if (image.width !== size || image.height !== size) throw new Error('Incorrect export dimensions');
      const x = portrait.column * size;
      const y = classes.indexOf(portrait.classId) * (size + 22);
      context.drawImage(image, x, y);
      context.fillText(`${portrait.classId} ${portrait.id}`, x + 5, y + size + 16);
    }
    return canvas.toDataURL('image/png');
  }, { portraits: exported, classes, size: SIZE, columns });
  writeFileSync(join(originals, 'contact-sheet.png'), Buffer.from(sheet.split(',')[1], 'base64'));
  const catalogPath = join(ROOT, 'src/ui/portraits/prompts.json');
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  const merged = catalog.filter((row) => !keys.includes(`${row.classId}-${row.id}`)).concat(prompts);
  writeFileSync(catalogPath, `${JSON.stringify(merged, null, 2)}\n`);
  writeFileSync(join(originals, 'prompts.json'), `${JSON.stringify(merged, null, 2)}\n`);
  console.log(`${sources.length} portraits verified: ${SIZE}x${SIZE} WebP, ${total} bytes total, at most ${MAX_BYTES} bytes each`);
  console.log(`Contact sheet and prompts: ${originals}`);
} finally {
  await browser.close();
}
