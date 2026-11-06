// A tar archive read as it streams in (POSIX ustar, what `scripts/preview/tar.mjs` writes and `tar --format=ustar`
// makes): plain files and folders only. A link, a device, a long-name or pax entry, or a path that would climb out
// of the folder or name a hidden file turns the whole archive away: a build is a folder of plain files.

const BLOCK = 512;

/** A path segment a build may hold: no leading dot (so no `..`, no hidden file), nothing a shell or URL needs to
 *  escape but `@`, `+` and `~`. */
const SEGMENT = /^[A-Za-z0-9_@+~-][A-Za-z0-9._@+~-]*$/;
const MOST_DEPTH = 16;
const MOST_PATH = 255;

/** A NUL-ended field as text. */
function text(block, start, length) {
  const field = block.subarray(start, start + length);
  const end = field.indexOf(0);
  return field.toString('utf8', 0, end === -1 ? length : end);
}

/** An octal number field (spaces and NULs around it), or NaN. Base-256 sizes (over 8 GB) aren't taken. */
function octal(block, start, length) {
  if (block[start] & 0x80) return NaN;
  const digits = text(block, start, length).trim();
  return /^[0-7]+$/.test(digits) ? parseInt(digits, 8) : NaN;
}

/** Whether a header's checksum holds: the sum of its bytes, its own field read as spaces. */
function checksumHolds(block) {
  let sum = 0;
  for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 0x20 : block[i];
  return sum === octal(block, 148, 8);
}

/** A tar entry's path made safe, or '' for the archive's own root (`.`, `./`). Throws on any other. */
export function safePath(raw) {
  const trimmed = raw.replace(/^(\.\/)+/, '').replace(/\/+$/, '');
  if (trimmed === '' || trimmed === '.') return '';
  if (trimmed.length > MOST_PATH) throw new Error(`a path over ${MOST_PATH} characters: ${trimmed.slice(0, 40)}...`);
  const segments = trimmed.split('/');
  if (segments.length > MOST_DEPTH) throw new Error(`a path deeper than ${MOST_DEPTH}: ${trimmed}`);
  for (const segment of segments) {
    if (!SEGMENT.test(segment)) throw new Error(`a path a build can't hold: ${JSON.stringify(trimmed)}`);
  }
  return segments.join('/');
}

/** One header block read: { path, type: file | dir, size }. */
function readHeader(block) {
  if (!checksumHolds(block)) throw new Error('a header whose checksum is wrong: not a tar archive');
  const magic = text(block, 257, 6);
  if (magic !== 'ustar' && magic !== 'ustar ') throw new Error('not a ustar archive');
  const name = text(block, 0, 100);
  // (GNU's old format keeps other fields where ustar has its prefix: only ustar's is read)
  const prefix = magic === 'ustar' ? text(block, 345, 155) : '';
  const path = safePath(prefix ? `${prefix}/${name}` : name);
  const flag = String.fromCharCode(block[156]);
  const size = octal(block, 124, 12);
  if (Number.isNaN(size)) throw new Error(`an entry without a size: ${path}`);
  if (flag === '5') return { path, type: 'dir', size: 0 };
  if (flag === '0' || flag === '\0') return { path, type: 'file', size };
  throw new Error(`an entry that isn't a plain file or folder (type ${JSON.stringify(flag)}): ${path}`);
}

const isZeros = (block) => block.every((byte) => byte === 0);
const padding = (size) => (BLOCK - (size % BLOCK)) % BLOCK;

/** The entries of the tar archive coming in as `chunks` (an async iterable of Buffers), each as it ends:
 *  { path, type: file, data } or { path, type: dir }. A file over `mostFile` bytes, or an archive cut short,
 *  throws. */
export async function* readTar(chunks, { mostFile = 64 << 20 } = {}) {
  let held = Buffer.alloc(0);
  let skip = 0;
  let file = null;
  let ended = false;
  for await (const chunk of chunks) {
    held = held.length ? Buffer.concat([held, chunk]) : chunk;
    for (;;) {
      if (skip > 0) {
        const dropped = Math.min(skip, held.length);
        held = held.subarray(dropped);
        skip -= dropped;
        if (skip > 0) break;
      }
      if (file) {
        const taken = Math.min(file.left, held.length);
        if (taken > 0) file.parts.push(held.subarray(0, taken));
        held = held.subarray(taken);
        file.left -= taken;
        if (file.left > 0) break;
        yield { path: file.path, type: 'file', data: Buffer.concat(file.parts) };
        skip = padding(file.size);
        file = null;
        continue;
      }
      // (what follows the two zero blocks that end it is read and dropped)
      if (ended) {
        held = Buffer.alloc(0);
        break;
      }
      if (held.length < BLOCK) break;
      const block = held.subarray(0, BLOCK);
      held = held.subarray(BLOCK);
      if (isZeros(block)) {
        ended = true;
        continue;
      }
      const header = readHeader(block);
      if (header.type === 'dir') {
        if (header.path) yield { path: header.path, type: 'dir' };
        continue;
      }
      if (!header.path) throw new Error('a file with no name');
      if (header.size > mostFile) throw new Error(`a file over ${mostFile} bytes: ${header.path}`);
      file = { path: header.path, size: header.size, left: header.size, parts: [] };
    }
  }
  if (file || !ended) throw new Error('the archive was cut short');
}
