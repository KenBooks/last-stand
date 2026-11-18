// A picture's pixels written as a PNG's bytes, for the tools that draw without a browser (`fire-bake`, `handref`).
import { deflateSync } from 'node:zlib';

/** A number's 4 bytes, high first. */
function bigEndian(value) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value >>> 0);
  return bytes;
}

/** The CRC of `bytes`, a PNG chunk's. */
function crc32(bytes) {
  let crc = ~0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc;
}

/** One chunk of a PNG. */
function chunk(type, data) {
  const named = Buffer.concat([Buffer.from(type), data]);
  return Buffer.concat([bigEndian(data.length), named, bigEndian(crc32(named))]);
}

/** `rgb` (3 bytes a pixel, rows from the top) as a PNG's bytes. */
export function png(rgb, width, height) {
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const start = y * (width * 3 + 1);
    rows[start] = 0;
    rgb.copy(rows, start + 1, y * width * 3, (y + 1) * width * 3);
  }
  const header = Buffer.concat([bigEndian(width), bigEndian(height), Buffer.from([8, 2, 0, 0, 0])]);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunks = [chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))];
  return Buffer.concat([signature, ...chunks]);
}
