// `lab village --only grassSteadyInWind`: the grass's light as the wind moves it, the hero stood still (from play, of
// High's tufts: "grass shading flipping between dark/bright is still an issue, happens in idle (from wind), dont need
// to move anywhere... you need to improve lab so you could see it", and of a still of it, "some grass is very dark and
// some is very bright, if you compare with reference, there is no such thing there"). A still showed nothing of the
// first, so frames over three seconds are read: the frame in cells of a few pixels, those the grass's blades change
// kept (the frame drawn with the blades and without), and each cell's light followed from frame to frame. A cell whose
// light goes from dark to bright and back within the three seconds is a flip; and in one frame, how far apart the
// grass's dark cells and its bright ones lie. `canary` has a tuft take the sun's shadow where the wind has pushed it,
// as it did, which must be found.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { holdHour } from '../../../src/game/clock';
import { faceCamera, viewMode } from '../../../src/core/renderer';
import * as meadow from '../../../src/world/meadow';
import { drawFrame, type Canvas } from './light';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** where he stands and the way he faces: open meadow by the cottages, and the grass by the campfire, under the
 *  trees' shade and in the fire's own light */
const STANDS: { name: string; at: THREE.Vector3; facing: number }[] = [
  { name: 'on the meadow', at: new THREE.Vector3(12, 0, 6), facing: Math.PI / 2 },
  { name: 'by the campfire', at: new THREE.Vector3(-4, 0, 6), facing: -0.87 },
];
/** a cell's side (px): wide enough that a blade swaying across it isn't a change of its light */
const CELL = 12;
/** the frames read, and the frames run between them: three seconds in all */
const READS = 16;
const BETWEEN = 12;
/** the frames the camera is given to come to rest */
const SETTLE = 240;
/** how much the blades must change a cell's light for it to be the grass's */
const GRASS_FROM = 0.02;
/** a cell flips when its light swings by this share of its mean within the frames read */
const FLIP = 0.4;
/** the most of the grass's cells that may flip, and the most its bright cells may be to its dark ones in one frame
 *  (its 90th centile against its 10th) */
const MOST_FLIPPING = 0.08;
const MOST_APART = 3.2;
/** the most the grass's light may swing as a whole in the frames read */
const MOST_WHOLE = 0.08;
/** the frames read one after another for the flicker, and the most of the grass's light that may change from one
 *  frame to the next */
const FLICKER_FRAMES = 8;
const MOST_FLICKER = 0.05;

/** The light of each cell of `canvas`, row by row. */
function cellsOf(canvas: Canvas): Float32Array {
  const across = Math.floor(canvas.width / CELL);
  const down = Math.floor(canvas.height / CELL);
  const cells = new Float32Array(across * down);
  for (let cy = 0; cy < down; cy++) {
    for (let cx = 0; cx < across; cx++) {
      let sum = 0;
      for (let y = cy * CELL; y < (cy + 1) * CELL; y += 2) {
        for (let x = cx * CELL; x < (cx + 1) * CELL; x += 2) {
          const at = (y * canvas.width + x) * 4;
          sum += 0.2126 * canvas.pixels[at] + 0.7152 * canvas.pixels[at + 1] + 0.0722 * canvas.pixels[at + 2];
        }
      }
      cells[cy * across + cx] = sum / ((CELL / 2) * (CELL / 2));
    }
  }
  return cells;
}

/** The meadow's blades shown or hidden (its ground stays). */
function showBlades(shown: boolean): void {
  G.arena.village!.meadow.traverse((part) => {
    const mesh = part as THREE.Mesh;
    if (mesh.isMesh && (mesh.geometry as THREE.InstancedBufferGeometry).isInstancedBufferGeometry) mesh.visible = shown;
  });
}

/** The value a share of the way up `values` in order. */
function centile(values: number[], share: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))];
}

/** The wind pushing the grass as hard as it did (a commit from before the hold has none: an A/B's other side loads
 *  this module too). */
function holdWindWild(held: boolean): void {
  const holds = meadow as { holdGrassWindWild?: (held: boolean) => void; holdGrassDropByPixel?: (held: boolean) => void };
  holds.holdGrassWindWild?.(held);
  holds.holdGrassDropByPixel?.(held);
}

/** How much of the grass's light changes from one frame to the next, pixel by pixel (every other one), over
 *  `FLICKER_FRAMES` frames one after another: the mean change in the grass's cells as a share of their light. A
 *  blade that comes and goes between frames shows here and not in a cell's light, which hardly moves. */
async function flickerOf(lab: Lab, grass: number[]): Promise<number> {
  let last = drawFrame(lab);
  const across = Math.floor(last.width / CELL);
  let changed = 0;
  let light = 0;
  for (let frame = 0; frame < FLICKER_FRAMES; frame++) {
    await lab.step(1);
    const next = drawFrame(lab);
    for (const cell of grass) {
      const left = (cell % across) * CELL;
      const bottom = Math.floor(cell / across) * CELL;
      for (let y = bottom; y < bottom + CELL; y += 2) {
        for (let x = left; x < left + CELL; x += 2) {
          const at = (y * last.width + x) * 4;
          const was = 0.2126 * last.pixels[at] + 0.7152 * last.pixels[at + 1] + 0.0722 * last.pixels[at + 2];
          const is = 0.2126 * next.pixels[at] + 0.7152 * next.pixels[at + 1] + 0.0722 * next.pixels[at + 2];
          changed += Math.abs(is - was);
          light += is;
        }
      }
    }
    last = next;
  }
  return changed / Math.max(light, 1e-6);
}

/** One stand's reading: its line, its problems, and whether its grass flips past the limit. */
interface Read { line: string; problems: string[]; flips: boolean; moments: Pictured[] }

/** The cells of `bare` the blades change the light of in `shown`: the grass's. */
function grassCells(bare: Float32Array, shown: Float32Array): number[] {
  const grass: number[] = [];
  for (let cell = 0; cell < bare.length; cell++) {
    if (Math.abs(shown[cell] - bare[cell]) > GRASS_FROM) grass.push(cell);
  }
  return grass;
}

/** How far `lights` swing, as a share of their mean. */
function swingOf(lights: number[]): number {
  const mean = lights.reduce((sum, light) => sum + light, 0) / lights.length;
  return (Math.max(...lights) - Math.min(...lights)) / Math.max(mean, 1e-4);
}

/** The grass's light at `stand` over three seconds of wind, the camera at rest. */
async function readStand(lab: Lab, stand: (typeof STANDS)[number], pictured: boolean): Promise<Read> {
  G.player.walkTo = null;
  G.player.place(stand.at, stand.facing);
  faceCamera(stand.facing);
  // (the camera glides to its place for some two seconds after a view is taken: read sooner, its last centimetres
  // moved every thin blade a pixel and a sixth of the grass's cells swung with no wind at all)
  await lab.step(SETTLE);
  showBlades(false);
  const bare = cellsOf(drawFrame(lab));
  showBlades(true);
  const frames: Float32Array[] = [];
  const moments: Pictured[] = [];
  for (let read = 0; read < READS; read++) {
    frames.push(cellsOf(drawFrame(lab)));
    const shown = pictured && read % (READS / 2) === 0;
    if (shown) moments.push(await lab.screen(`grass ${stand.name}, frame ${read * BETWEEN}`, []));
    await lab.step(BETWEEN);
  }
  const grass = grassCells(bare, frames[0]);
  if (grass.length < 200) throw new Error(`lab: village: grassSteadyInWind found the grass in ${grass.length} cells`);
  const swings = grass.map((cell) => swingOf(frames.map((frame) => frame[cell])));
  const share = swings.filter((swing) => swing > FLIP).length / grass.length;
  // (all of it together: a whole patch going pale and back, as a fire's light on it does)
  const whole = swingOf(frames.map((frame) => grass.reduce((sum, cell) => sum + frame[cell], 0) / grass.length));
  // (against the same cells with the blades hidden: the grade's film grain changes every pixel every frame)
  showBlades(false);
  const grain = await flickerOf(lab, grass);
  showBlades(true);
  const flicker = Math.max(0, await flickerOf(lab, grass) - grain);
  const first = grass.map((cell) => frames[0][cell]);
  const apart = centile(first, 0.9) / Math.max(centile(first, 0.1), 1e-4);
  const line = `grass in the wind ${stand.name}, he stood still: ${(share * 100).toFixed(1)}% of its ${grass.length} `
    + `cells swing over ${FLIP * 100}% of their light in 3 s (at most ${MOST_FLIPPING * 100}%), the median cell's `
    + `${(centile(swings, 0.5) * 100).toFixed(0)}%; all of it together ${(whole * 100).toFixed(1)}% (at most `
    + `${MOST_WHOLE * 100}%); in one frame its bright cells ${apart.toFixed(1)} times its dark ones `
    + `(at most ${MOST_APART}); from one frame to the next ${(flicker * 100).toFixed(1)}% of its light changes over the grain's ${(grain * 100).toFixed(1)}% `
    + `(at most ${MOST_FLICKER * 100}%)`;
  const problems: string[] = [];
  const said = `grassSteadyInWind: ${stand.name}`;
  if (share > MOST_FLIPPING) problems.push(`${said} ${(share * 100).toFixed(1)}% of the grass flips in the wind`);
  if (whole > MOST_WHOLE) problems.push(`${said} the grass's light swings ${(whole * 100).toFixed(1)}% as a whole`);
  if (apart > MOST_APART) problems.push(`${said} the grass's bright cells are ${apart.toFixed(1)} times its dark ones`);
  if (flicker > MOST_FLICKER) problems.push(`${said} the grass flickers: ${(flicker * 100).toFixed(1)}% a frame`);
  return { line, problems, flips: share > MOST_FLIPPING || flicker > MOST_FLICKER, moments };
}

/** The grass's light over three seconds of wind at each stand, he stood still. */
export async function grassSteadyInWind(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const view = viewMode();
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  let caught = false;
  holdHour(12);
  await viewBy(lab, 'third');
  holdWindWild(canary);
  try {
    for (const stand of STANDS) {
      const read = await readStand(lab, stand, !canary);
      lines.push(read.line);
      moments.push(...read.moments);
      caught = caught || read.flips;
      if (!canary) problems.push(...read.problems);
    }
  } finally {
    showBlades(true);
    holdWindWild(false);
    holdHour(null);
    await viewBy(lab, view);
  }
  return { lines, problems, caught: canary ? caught : null, moments };
}
