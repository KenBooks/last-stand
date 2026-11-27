// Whether two records the engine draws blended share pixels in the frame as drawn (`villageOrderSteady.ts`): a pair
// whose turns swap as the camera moves paints one over the other only where both show. Their boxes on the screen
// overlapping says little (the portico's columns behind the hall's front wall, two windows across a room), so the
// frame is drawn as it is and with each of the two hidden in turn: a pixel of one is a pixel that changes as it's
// hidden, with what's opaque before it hiding it as it does. The frame's light is held meanwhile: the eye's adaptation
// (`holdAdaptation`) and the sun's shadows (`TUNE.shadows`; the lamps' are baked of what stands still, hidden or not),
// as a record hidden took its shadow and the eye's light with it, and a third of the frame changed with each.
import type * as THREE from 'three';
import type { Lab } from './lab';
import { drawFrame } from './light';
import { holdAdaptation } from '../../../src/core/renderer';
import { TUNE } from '../../../src/engine/globals';
import type { Canvas } from './light';

/** the most a channel may move between two draws of one frame and still count as the same (of white: the canvas is
 *  read as floats, and as levels of 255 no pixel ever differed) */
const SAME = 3 / 255;
/** the frames drawn before one is read: the engine's first after a change isn't its steady one */
const STEADY = 2;

/** The frame as the engine draws it once it's steady. */
function steadyFrame(lab: Lab): Canvas {
  let frame = drawFrame(lab);
  for (let draw = 1; draw < STEADY; draw++) frame = drawFrame(lab);
  return frame;
}

/** The frame with `mesh` hidden, drawn at the same moment of the game (a game frame between, the torches' flicker
 *  moved the hall's light, and every pixel of it differed). */
function frameWithout(lab: Lab, mesh: THREE.Mesh): Canvas {
  const shown = mesh.visible;
  mesh.visible = false;
  try {
    return steadyFrame(lab);
  } finally {
    mesh.visible = shown;
  }
}

/** Whether pixel `at` (its first byte) differs between `a` and `b`. */
function differs(a: Canvas, b: Canvas, at: number): boolean {
  const red = Math.abs(a.pixels[at] - b.pixels[at]);
  const green = Math.abs(a.pixels[at + 1] - b.pixels[at + 1]);
  const blue = Math.abs(a.pixels[at + 2] - b.pixels[at + 2]);
  return Math.max(red, green, blue) > SAME;
}

/** How many pixels of the frame as drawn now are both `first`'s and `second`'s. */
export async function pixelsShared(lab: Lab, first: THREE.Mesh, second: THREE.Mesh): Promise<number> {
  const shadows = TUNE.shadows;
  holdAdaptation(true);
  TUNE.shadows = 0;
  try {
    const drawn = steadyFrame(lab);
    const withoutFirst = frameWithout(lab, first);
    const withoutSecond = frameWithout(lab, second);
    return sharedPixels(drawn, withoutFirst, withoutSecond);
  } finally {
    TUNE.shadows = shadows;
    holdAdaptation(false);
  }
}

/** The pixels that differ from `drawn` in both `withoutFirst` and `withoutSecond`. */
function sharedPixels(drawn: Canvas, withoutFirst: Canvas, withoutSecond: Canvas): number {
  let shared = 0;
  for (let at = 0; at < drawn.pixels.length; at += 4) {
    if (differs(drawn, withoutFirst, at) && differs(drawn, withoutSecond, at)) shared++;
  }
  return shared;
}
