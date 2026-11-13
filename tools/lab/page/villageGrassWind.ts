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

/** where he stands and the way he faces: the grass by the campfire before him, under the trees' shade */
const STAND = new THREE.Vector3(-4, 0, 6);
const FACING = -0.87;
/** a cell's side (px): wide enough that a blade swaying across it isn't a change of its light */
const CELL = 12;
/** the frames read, and the frames run between them: three seconds in all */
const READS = 16;
const BETWEEN = 12;
/** how much the blades must change a cell's light for it to be the grass's */
const GRASS_FROM = 0.02;
/** a cell flips when its light swings by this share of its mean within the frames read */
const FLIP = 0.4;
/** the most of the grass's cells that may flip, and the most its bright cells may be to its dark ones in one frame
 *  (its 90th centile against its 10th) */
const MOST_FLIPPING = 0.04;
const MOST_APART = 3.2;

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

/** A tuft's shadow taken where the wind pushed it, as it was (a commit from before the hold has none: an A/B's other
 *  side loads this module too). */
function holdShadowSwayed(held: boolean): void {
  const hold = (meadow as { holdGrassShadowSwayed?: (held: boolean) => void }).holdGrassShadowSwayed;
  hold?.(held);
}

/** The grass's light over three seconds of wind, he stood still: the cells that flip, and how far apart they lie. */
export async function grassSteadyInWind(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const view = viewMode();
  const problems: string[] = [];
  const moments: Pictured[] = [];
  holdHour(12);
  G.player.walkTo = null;
  G.player.place(STAND, FACING);
  await viewBy(lab, 'third');
  faceCamera(FACING);
  holdShadowSwayed(canary);
  let line = '';
  let caught = false;
  try {
    await lab.step(40);
    showBlades(false);
    const bare = cellsOf(drawFrame(lab));
    showBlades(true);
    const frames: Float32Array[] = [];
    for (let read = 0; read < READS; read++) {
      frames.push(cellsOf(drawFrame(lab)));
      if (!canary && (read === 0 || read === READS / 2)) moments.push(await lab.screen(`grass in the wind, frame ${read * BETWEEN}`, []));
      await lab.step(BETWEEN);
    }
    const grass: number[] = [];
    for (let cell = 0; cell < bare.length; cell++) {
      if (Math.abs(frames[0][cell] - bare[cell]) > GRASS_FROM) grass.push(cell);
    }
    if (grass.length < 200) throw new Error(`lab: village: grassSteadyInWind found the grass in ${grass.length} cells`);
    let flipping = 0;
    const swings: number[] = [];
    for (const cell of grass) {
      let least = Infinity;
      let most = 0;
      let sum = 0;
      for (const frame of frames) {
        least = Math.min(least, frame[cell]);
        most = Math.max(most, frame[cell]);
        sum += frame[cell];
      }
      const swing = (most - least) / Math.max(sum / frames.length, 1e-4);
      swings.push(swing);
      if (swing > FLIP) flipping++;
    }
    const lights = grass.map((cell) => frames[0][cell]);
    const apart = centile(lights, 0.9) / Math.max(centile(lights, 0.1), 1e-4);
    const share = flipping / grass.length;
    line = `grass in the wind, he stood still: ${(share * 100).toFixed(1)}% of its ${grass.length} cells swing over `
      + `${FLIP * 100}% of their light in 3 s (at most ${MOST_FLIPPING * 100}%), the median cell's `
      + `${(centile(swings, 0.5) * 100).toFixed(0)}%, the 95th centile's ${(centile(swings, 0.95) * 100).toFixed(0)}%; `
      + `in one frame its bright cells ${apart.toFixed(1)} times its dark ones (at most ${MOST_APART})`;
    caught = share > MOST_FLIPPING;
    if (!canary) {
      if (share > MOST_FLIPPING) problems.push(`grassSteadyInWind: ${(share * 100).toFixed(1)}% of the grass flips in the wind`);
      if (apart > MOST_APART) problems.push(`grassSteadyInWind: the grass's bright cells are ${apart.toFixed(1)} times its dark ones`);
    }
  } finally {
    showBlades(true);
    holdShadowSwayed(false);
    holdHour(null);
    await viewBy(lab, view);
  }
  return { lines: [line], problems, caught: canary ? caught : null, moments };
}
