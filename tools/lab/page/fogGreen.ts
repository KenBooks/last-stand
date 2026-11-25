// The green left in the village's fog of what he can't see, read in the frame drawn: what `lab village`'s fog checks
// share (`leavesInFog`, `fogUnderEaves`, `fogPastCottages`). The fog is soft (#755, from play: "Reduce the intensity
// of the grey effect (top down view) to make it less harsh": the engine mixes it in at 0.7, `rust.sightFog`), so
// fogged grass still reads greener than red or blue, and a count of plainly green pixels read 16 to 29% of what he
// can't see as green: what the fog took of a place's green is read instead, against the same frame drawn again with
// the fog mixed in by next to nothing (33 to 59% of it).
import type * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { RUST } from '../../../src/engine';
import { drawFrame, type Canvas } from './light';

/** how much greener than its red and blue a pixel is to count as plainly green */
const GREENER = 1.3;
/** the engine's fog mixed in by next to nothing: none of its colour taken, his sight still on (with it off, a house
 *  from above is drawn by its kinds' shares instead of the house rule, and the two frames differ by its roofs) */
const FOG_NONE = 1e-4;
/** the least of the green the places read must hold with the fog off for what it took to be read (a share of white,
 *  a place's mean): ground with no green to take says nothing either way */
const LEAST_GREEN_READ = 0.01;

/** Whether a pixel is plainly green, by its channels. */
export function isGreen(red: number, middle: number, blue: number): boolean {
  return middle > red * GREENER && middle > blue * GREENER;
}

/** The pixel's index in `canvas` (its red's) where `point` is drawn, null off the frame. */
function pixelOf(canvas: Canvas, point: THREE.Vector3): number | null {
  const place = point.clone().project(G.camera);
  const column = Math.floor(((place.x + 1) / 2) * canvas.width);
  const row = Math.floor(((place.y + 1) / 2) * canvas.height);
  if (column < 0 || column >= canvas.width || row < 0 || row >= canvas.height) return null;
  return (row * canvas.width + column) * 4;
}

/** The share of `points`' pixels in the frame drawn now that's plainly green. */
export function greenAt(lab: Lab, points: THREE.Vector3[]): number {
  const canvas = drawFrame(lab);
  let green = 0;
  let read = 0;
  for (const point of points) {
    const pixel = pixelOf(canvas, point);
    if (pixel === null) continue;
    read++;
    if (isGreen(canvas.pixels[pixel], canvas.pixels[pixel + 1], canvas.pixels[pixel + 2])) green++;
  }
  if (read === 0) throw new Error('lab: village: none of the places read is in the frame');
  return green / read;
}

/** How much greener than its red and blue the pixel at `pixel` is, a share of white. */
function greenOver(canvas: Canvas, pixel: number): number {
  const scale = canvas.pixels instanceof Uint8Array ? 255 : 1;
  const [red, green, blue] = [canvas.pixels[pixel], canvas.pixels[pixel + 1], canvas.pixels[pixel + 2]];
  return Math.max(0, green - Math.max(red, blue)) / scale;
}

/** The green of `points` in the frame drawn now (the whole frame's with none), summed, and the pixels read. */
function greenIn(lab: Lab, points: THREE.Vector3[] | null): { green: number; read: number } {
  const canvas = drawFrame(lab);
  let green = 0;
  let read = 0;
  if (!points) {
    for (let pixel = 0; pixel < canvas.width * canvas.height * 4; pixel += 4) green += greenOver(canvas, pixel);
    return { green, read: canvas.width * canvas.height };
  }
  for (const point of points) {
    const pixel = pixelOf(canvas, point);
    if (pixel === null) continue;
    green += greenOver(canvas, pixel);
    read++;
  }
  return { green, read };
}

/** What the fog took of the green at `points` (the whole frame's with none): its share, 1 where there was none to
 *  take, and the mean green with the fog off. */
export interface GreenTaken {
  taken: number;
  clear: number;
}

/** The share of the green at `points` (the whole frame with none) the fog takes in the frame drawn now: the frame drawn
 *  again at once with the fog mixed in by next to nothing, as between two frames the grass moves. */
export function greenTaken(lab: Lab, points: THREE.Vector3[] | null): GreenTaken {
  const fogged = greenIn(lab, points);
  const fog = RUST.tune.sightFog;
  RUST.tune.sightFog = FOG_NONE;
  let clear: { green: number; read: number };
  try {
    clear = greenIn(lab, points);
  } finally {
    RUST.tune.sightFog = fog;
  }
  if (clear.read === 0) throw new Error('lab: village: none of the places read is in the frame');
  const mean = clear.green / clear.read;
  if (mean < LEAST_GREEN_READ) return { taken: 1, clear: mean };
  return { taken: 1 - fogged.green / clear.green, clear: mean };
}
