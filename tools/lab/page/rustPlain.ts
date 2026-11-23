// `lab rustcheck`'s check of the lit shaders made for the plain levels alone (Bulwark's `set_plain_only`,
// `rust.plainShader`): at Low and Very low the engine can draw the scene by shaders with what the other levels
// shade with compiled out. They must draw the frame the whole shaders draw there, to the pixel, and be other
// pipelines, kept through the switch. From a phone's profile (an Adreno 810 at Very low, 4YT2-QTZW): the lit
// shading 11.9 ms of a 38.5 ms frame.
import type { Lab } from './lab';
import { type Checked, failed, passed, pixelsIn } from './rustPixels';
import { RUST, rustSwitching } from '../../../src/engine';
import { PIPELINES } from '../../../src/engine/pipelinesAside';
import { G } from '../../../src/state';
import { qualityLevel, setQuality } from '../../../src/core/quality';

/** the frames a level or a shader switched to is given before it's pictured */
const SETTLE_FRAMES = 6;
/** the frames a level switched to is given first, the game running: its shadows' maps drawn again, its light
 *  baked, the frame's exposure come to rest */
const LEVEL_FRAMES = 120;
/** how long the browser is given to compile a switch's pipelines (ms of its own clock) */
const COMPILE_MS = 30000;
/** how far a channel may be off between two pictures of one frame (of 255: the GPU's own rounding) */
const SAME_WITHIN = 2;
/** the share of the frame that may be apart between two pictures of it held still (a spark, a mote: the game's
 *  held, not every effect's own clock) */
const STILL_SHARE = 0.0005;
/** the least share of the frame the plain levels' shaders must change at High (the canary) */
const CANARY_SHARE = 0.01;

/** whether the engine still waits on pipelines, compiling or a switch's own (`plainSet.ts`: in play the other
 *  making's are made aside first, and switched to by the frame after they're all made) */
const waiting = (): boolean => PIPELINES.compiling > 0 || rustSwitching();

/** `rust.plainShader` set to `value`, the frames after it drawn with the game held still, and the browser waited on
 *  for the pipelines it asked, the switch made: how many were asked for. */
async function switched(lab: Lab, value: number): Promise<number> {
  const before = PIPELINES.made;
  RUST.tune.plainShader = value;
  await lab.step(SETTLE_FRAMES);
  const began = window.__labClock.realNow();
  while (waiting() && window.__labClock.realNow() - began < COMPILE_MS) {
    await window.__labClock.realFrame();
    await lab.step(1);
  }
  await lab.step(SETTLE_FRAMES);
  return PIPELINES.made - before;
}

/** The share of two pictures' pixels with a channel more than `SAME_WITHIN` apart. */
export function apartShare(one: Uint8ClampedArray, other: Uint8ClampedArray): number {
  let apart = 0;
  for (let at = 0; at < one.length; at += 4) {
    const most = Math.max(Math.abs(one[at] - other[at]), Math.abs(one[at + 1] - other[at + 1]),
      Math.abs(one[at + 2] - other[at + 2]));
    if (most > SAME_WITHIN) apart++;
  }
  return apart / (one.length / 4);
}

export const percent = (share: number): string => `${(share * 100).toFixed(2)}%`;

/** the most frames a level switch in play is given to make its shaders' pipelines aside and switch */
const SWITCH_FRAMES = 600;

/**
 * A level stepped to in play leaves nothing out of a frame: the plain levels' shaders, not made yet, are made aside
 * while the whole ones draw on, and switched to once all are ready (`plainSet.ts`). From the owner's PC (ZSW4-FVNM,
 * #850's preview): Auto stepped Low to Medium in play, the level's making was switched to at once, and the village
 * drew grey while its ~50 pipelines compiled. Run before the plain making is first made (`plainShaderSameFrame`).
 */
export async function levelSwitchLeavesNothingOut(lab: Lab): Promise<Checked> {
  const level = qualityLevel();
  const tuned = RUST.tune.plainShader;
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    if (PIPELINES.waitLeft !== Infinity) return failed('not in play: the loading screens still wait for pipelines');
    RUST.tune.plainShader = 1;
    setQuality('high');
    await lab.step(SETTLE_FRAMES);
    const made = PIPELINES.made;
    PIPELINES.unready = 0;
    setQuality('verylow');
    let frames = 0;
    do {
      await window.__labClock.realFrame();
      await lab.step(1);
      frames++;
    } while ((waiting() || frames < SETTLE_FRAMES) && frames < SWITCH_FRAMES);
    const leftOut = PIPELINES.unready;
    const asked = PIPELINES.made - made;
    if (waiting()) return failed(`the switch to Very low still waited on its pipelines after ${frames} frames`);
    if (asked === 0) return failed('the switch to Very low asked for no pipeline: the plain making was made before');
    if (leftOut > 0) {
      return failed(`stepping High to Very low in play left ${leftOut} draws out while its ${asked} pipelines `
        + 'compiled: the plain making switched to before it was made');
    }
    return passed(`stepping High to Very low in play made ${asked} pipelines aside over ${frames} frames, no draw `
      + 'left out');
  } finally {
    RUST.tune.plainShader = tuned;
    setQuality(level);
    await lab.step(SETTLE_FRAMES);
    lab.drawing = drawing;
  }
}

/**
 * At Very low the plain levels' shaders draw the frame the whole ones draw: the game held still, the frame
 * pictured with the switch off, on, and off again. Switching back and on again asks for no pipeline (each making's
 * are kept; the plain one's were first made by `levelSwitchLeavesNothingOut`). The canary: the switch forced at High (`rust.plainShader=2`),
 * where the plain levels' shaders must draw another frame, the normal maps and the lights' shine gone from it.
 */
export async function plainShaderSameFrame(lab: Lab): Promise<Checked> {
  const level = qualityLevel();
  const tuned = RUST.tune.plainShader;
  const drawing = lab.drawing;
  const paused = G.paused;
  lab.drawing = true;
  try {
    // (Very low drawn by the whole shaders first: on by default, stepping there would make the plain ones)
    RUST.tune.plainShader = 0;
    setQuality('verylow');
    await lab.step(LEVEL_FRAMES);
    G.paused = true;
    await switched(lab, 0);
    const whole = await pixelsIn(lab, undefined, 'plain: the whole shaders');
    // (their own pipelines were made by the level switch before, `levelSwitchLeavesNothingOut`)
    await switched(lab, 1);
    const plain = await pixelsIn(lab, undefined, 'plain: the plain levels\' shaders');
    const askedBack = await switched(lab, 0);
    const again = await pixelsIn(lab, undefined, 'plain: the whole shaders again');
    const askedAgain = await switched(lab, 1);
    await switched(lab, 0);
    G.paused = paused;
    setQuality('high');
    await lab.step(LEVEL_FRAMES);
    G.paused = true;
    await switched(lab, 0);
    const high = await pixelsIn(lab, undefined, 'plain: High');
    await switched(lab, 2);
    const forced = await pixelsIn(lab, undefined, 'plain: High by the plain levels\' shaders');
    const still = apartShare(whole, again);
    const apart = apartShare(whole, plain);
    const canary = apartShare(high, forced);
    if (still > STILL_SHARE) {
      return failed(`the frame held still moved between two pictures of it (${percent(still)} of its pixels)`);
    }
    if (apart > STILL_SHARE) {
      return failed(`at Very low the plain levels' shaders draw ${percent(apart)} of the frame's pixels apart from `
        + 'the whole shaders\'');
    }
    if (askedBack + askedAgain > 0) {
      return failed(`switching back and on again asked for ${askedBack} and ${askedAgain} pipelines: each making's `
        + 'are kept');
    }
    if (canary < CANARY_SHARE) {
      return failed(`the canary: at High the plain levels' shaders changed ${percent(canary)} of the frame, as if not `
        + 'drawn with');
    }
    return passed(`the plain levels' shaders draw Very low's frame as the whole ones do (${percent(apart)} of its `
      + `pixels apart, two pictures of the whole ones' ${percent(still)}; no pipeline made switching back and on `
      + `again; forced at High they change ${percent(canary)} of the frame)`);
  } finally {
    G.paused = paused;
    RUST.tune.plainShader = tuned;
    setQuality(level);
    await lab.step(SETTLE_FRAMES);
    lab.drawing = drawing;
  }
}
