// A build's folder packed as a gzipped POSIX ustar archive, what the previews service (server/previews/tar.mjs)
// reads: plain files and folders only, in a stable order. No `tar` binary, so it packs the same on any OS and in the
// tests. Links are left out (stage.mjs's cleanSite never let one through either).
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { createGzip } from 'node:zlib';

const BLOCK = 512;

/** `value` written into `block` at `start` as an octal field `length` long, NUL-ended. */
function putOctal(block, start, length, value) {
  block.write(value.toString(8).padStart(length - 1, '0'), start, length - 1, 'ascii');
}

/** A path split into ustar's name (100 bytes) and prefix (155), at a slash. */
function splitName(name) {
  if (Buffer.byteLength(name) <= 100) return { name, prefix: '' };
  for (let at = name.indexOf('/'); at !== -1; at = name.indexOf('/', at + 1)) {
    const prefix = name.slice(0, at);
    const rest = name.slice(at + 1);
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(rest) <= 100) return { name: rest, prefix };
  }
  throw new Error(`a path too long for ustar: ${name}`);
}

/** One entry's header block: `type` '0' a file, '5' a folder. */
export function header(name, { size = 0, type = '0', mtime = 0 } = {}) {
  const block = Buffer.alloc(BLOCK);
  const split = splitName(name);
  block.write(split.name, 0, 100, 'utf8');
  putOctal(block, 100, 8, type === '5' ? 0o755 : 0o644);
  putOctal(block, 108, 8, 0);
  putOctal(block, 116, 8, 0);
  putOctal(block, 124, 12, size);
  putOctal(block, 136, 12, mtime);
  block.fill(0x20, 148, 156);
  block.write(type, 156, 1, 'ascii');
  block.write('ustar\u000000', 257, 8, 'ascii');
  block.write(split.prefix, 345, 155, 'utf8');
  let sum = 0;
  for (const byte of block) sum += byte;
  block.write(`${sum.toString(8).padStart(6, '0')}\u0000 `, 148, 8, 'ascii');
  return block;
}

/** Every file and folder under `dir`, as archive paths, parents first, sorted. */
export function walk(dir, prefix = '') {
  const found = [];
  const names = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of names) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push({ name, type: 'dir' }, ...walk(path.join(dir, entry.name), name));
    else if (entry.isFile()) found.push({ name, type: 'file', file: path.join(dir, entry.name) });
  }
  return found;
}

/** The archive's blocks, file by file (each read as it comes, so a big build isn't held whole). */
async function* blocks(dir) {
  for (const entry of walk(dir)) {
    if (entry.type === 'dir') {
      yield header(`${entry.name}/`, { type: '5' });
      continue;
    }
    const data = fs.readFileSync(entry.file);
    yield header(entry.name, { size: data.length });
    yield data;
    const pad = (BLOCK - (data.length % BLOCK)) % BLOCK;
    if (pad) yield Buffer.alloc(pad);
  }
  yield Buffer.alloc(BLOCK * 2);
}

/** `dir`'s files packed into `file` (`.tar.gz`): { bytes } of the packed archive. */
export async function packFolder(dir, file) {
  await pipeline(Readable.from(blocks(dir)), createGzip({ level: 6 }), fs.createWriteStream(file));
  return { bytes: fs.statSync(file).size };
}
