// `lab rust --capture`: the tape the page wrote (`window.__rustTape`, a Blob: src/engine/tape.ts) fetched from it
// and saved, for the engine's own harness to replay with no browser.
import { mkdirSync, openSync, writeSync, closeSync } from 'node:fs';
import { dirname } from 'node:path';

/** how much of the tape a round trip to the page carries, in bytes (base64 makes it a third larger) */
const CHUNK = 4 * 1024 * 1024;

/** A stretch of the page's tape as base64, and the tape's whole length. Serialized into the page. */
async function chunkInPage([from, to]) {
  const tape = window.__rustTape;
  if (!tape) return { length: 0, base64: '' };
  const bytes = new Uint8Array(await tape.slice(from, to).arrayBuffer());
  let binary = '';
  for (let at = 0; at < bytes.length; at += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  }
  return { length: tape.size, base64: btoa(binary) };
}

/**
 * Saves the page's tape as `file`, and lets the page forget it.
 * @param {import('playwright').Page} page
 * @param {string} file
 * @returns {Promise<number>} the tape's bytes (0: the page had none)
 */
export async function saveTape(page, file) {
  mkdirSync(dirname(file), { recursive: true });
  const out = openSync(file, 'w');
  let written = 0;
  try {
    for (;;) {
      const { length, base64 } = await page.evaluate(chunkInPage, [written, written + CHUNK]);
      const bytes = Buffer.from(base64, 'base64');
      writeSync(out, bytes);
      written += bytes.length;
      if (written >= length || bytes.length === 0) break;
    }
  } finally {
    closeSync(out);
  }
  await page.evaluate(() => {
    window.__rustTape = null;
  });
  return written;
}
