// `npm run fire-bake`: the fire's simulation (src/world/fireBake.ts) run here, its frames drawn from the side as the
// game's ray-march draws them, so a value is tried in seconds where a page takes a minute. No browser: its picture
// isn't the game's light, only the fire's shape and colour against a reference.
//   npm run fire-bake -- [key=value ...]   (a key of FireTuning or FLAME_LOOK; `name=x` names the picture)
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import {
  BAKE, bakeFlames, BUDGET_KB, decodeFrame, DOMAIN, FIRE, FLAME_LOOK, FRAME_CELLS, keptCell, loopSizesKb, LOOP,
} from '../../../src/world/fireBake.ts';

/** how many picture pixels a cell is, and how many frames are drawn */
const CELL_PIXELS = 3;
const DRAWN = 6;
/** a share of a pixel's light the picture's exposure gives it, as a grade compresses it */
const EXPOSURE = 1.1;
/** a life under this counts as no flame, read with how far up the flames stand */
const LIT_LIFE = 12;

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
function png(rgb, width, height) {
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

/** A gas's colour and radiance at `life` (0 to 1), as the ray-march's `flameColour`. */
function flameColour(life) {
  const stops = FLAME_LOOK.blackbody;
  const upper = stops.findIndex(([at]) => life <= at);
  if (upper <= 0) return stops[0].slice(1, 4).map((part) => part * stops[0][4]);
  const [before, r0, g0, b0, bright0] = stops[upper - 1];
  const [at, r1, g1, b1, bright1] = stops[upper];
  const share = (life - before) / (at - before);
  const low = [r0 * bright0, g0 * bright0, b0 * bright0];
  const high = [r1 * bright1, g1 * bright1, b1 * bright1];
  return low.map((part, i) => part + (high[i] - part) * share);
}

/** How much of what it could a flame at `life` holds back what's behind it, as the ray-march's `smoothstep`. */
function holding(life) {
  const share = (life - FLAME_LOOK.holdsFrom) / (FLAME_LOOK.holdsFully - FLAME_LOOK.holdsFrom);
  const held = Math.min(1, Math.max(0, share));
  return held * held * (3 - 2 * held);
}

/** A picture column's light through one frame, from z's near side back: as the ray-march gathers it. */
function lightThrough(cellAt, x, y) {
  const stride = (DOMAIN.half * 2) / BAKE.nz;
  const light = [0, 0, 0];
  let through = 1;
  for (let z = 0; z < BAKE.nz && through > 0.02; z++) {
    const life = cellAt(x, y, z) / 255;
    if (life <= 0.004) continue;
    const glowing = Math.min(1, life / FLAME_LOOK.glowFullLife);
    const thick = 1 - Math.exp(-glowing * stride * FLAME_LOOK.thickPerMetre);
    const colour = flameColour(life);
    for (let part = 0; part < 3; part++) light[part] += through * thick * colour[part] * FLAME_LOOK.glow;
    through *= 1 - thick * holding(life);
  }
  return light;
}

/** The loop's sizes against `BUDGET_KB`, said, and what's over (or cut off outside the kept box). */
function sizeProblems(baked) {
  const { kept: keptKb, gpu: gpuKb } = loopSizesKb(baked);
  const outside = (baked.outside * 100).toFixed(2);
  console.log(`kept ${keptKb.toFixed(0)} KB (budget ${BUDGET_KB.kept}), on the GPU ${gpuKb.toFixed(0)} KB `
    + `(budget ${BUDGET_KB.gpu}); ${outside}% of the flame outside the kept box (KEPT in fireBake.ts)`);
  const problems = [];
  if (keptKb > BUDGET_KB.kept) problems.push(`the loop kept is ${keptKb.toFixed(0)} KB, over ${BUDGET_KB.kept}`);
  if (gpuKb > BUDGET_KB.gpu) problems.push(`its frames on the GPU are ${gpuKb.toFixed(0)} KB, over ${BUDGET_KB.gpu}`);
  if (baked.outside > 0.001) problems.push(`${outside}% of the flame is cut off outside the kept box: widen KEPT`);
  return problems;
}

/** The arguments as a tuning and a look laid over the game's, and the picture's name. */
function readArguments(words) {
  const fire = { ...FIRE };
  let name = 'bake';
  for (const word of words) {
    const [key, value] = word.split('=');
    if (key === 'name') name = value;
    else if (key in fire) fire[key] = Number(value);
    else if (key in FLAME_LOOK && key !== 'blackbody') FLAME_LOOK[key] = Number(value);
    else throw new Error(`fire-bake: no such value: ${key} (one of ${Object.keys(fire).join(', ')})`);
  }
  return { fire, name };
}

/** Draws `DRAWN` of the loop's frames in a row, and says how the flames stand. */
function drawSheet(baked, path) {
  const every = Math.floor(LOOP.frames / DRAWN);
  const width = BAKE.nx * CELL_PIXELS * DRAWN;
  const height = BAKE.ny * CELL_PIXELS;
  const rgb = Buffer.alloc(width * height * 3);
  const tops = [];
  for (let shown = 0; shown < DRAWN; shown++) {
    const frame = shown * every;
    const cells = decodeFrame(baked, frame, new Uint8Array(FRAME_CELLS));
    const cellAt = (x, y, z) => keptCell(cells, x, y, z);
    let top = 0;
    for (let y = 0; y < BAKE.ny; y++) {
      for (let x = 0; x < BAKE.nx; x++) {
        const light = lightThrough(cellAt, x, y);
        for (let z = 0; z < BAKE.nz; z++) if (cellAt(x, y, z) > LIT_LIFE) top = Math.max(top, y);
        const bytes = light.map((part) => Math.round(255 * (1 - Math.exp(-part * EXPOSURE))));
        for (let py = 0; py < CELL_PIXELS; py++) {
          for (let px = 0; px < CELL_PIXELS; px++) {
            const row = height - 1 - (y * CELL_PIXELS + py);
            const at = (row * width + shown * BAKE.nx * CELL_PIXELS + x * CELL_PIXELS + px) * 3;
            rgb[at] = bytes[0];
            rgb[at + 1] = bytes[1];
            rgb[at + 2] = bytes[2];
          }
        }
      }
    }
    tops.push(((top / BAKE.ny) * DOMAIN.high).toFixed(2));
  }
  writeFileSync(path, png(rgb, width, height));
  return tops;
}

const { fire, name } = readArguments(process.argv.slice(2));
const started = performance.now();
const baked = bakeFlames(fire);
const took = performance.now() - started;
mkdirSync('tools/lab/out/fire', { recursive: true });
const path = `tools/lab/out/fire/${name}.png`;
const tops = drawSheet(baked, path);
console.log(`baked in ${(took / 1000).toFixed(1)} s, flames' tops (m): ${tops.join(' ')}; ${path}`);
const problems = sizeProblems(baked);
for (const problem of problems) console.log(`fire-bake: ${problem}`);
if (problems.length) process.exitCode = 1;
