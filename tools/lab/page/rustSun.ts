// `lab rustcheck`'s check of the sun's shadow as the Rust engine draws it: at noon in the village what stands in
// the sun casts a shadow on the ground. For a day of play it cast none but at the village's very middle: the sun's
// shadow camera kept three's default box, 5 m either way, its projection made only in three's own shadow pass,
// which the engine never runs. Found beside three's frame of the same stand, by nothing else.
import type { Lab } from './lab';
import { RUST } from '../../../src/engine';
import { type Checked, blocksChanged, failed, passed, pictureIn } from './rustPixels';

/** the least share of the frame the sun's shadows must darken at noon in the village (a tree's, a lamp post's, a
 *  house's: 4% of the blocks of the square's frame read here), and how many times the frame's own change from one frame to the next */
const SHADOWED_LEAST = 0.02;
const OVER_NOISE = 4;
/** the frames the stand is given to settle before it's read */
const SETTLE_FRAMES = 120;

/**
 * At noon in the village: the frame with the sun's shadow and without it differ over a good share of it. The
 * canary: two frames drawn the same differ by far less (the grass in the wind, the frame's grain).
 */
export async function sunCastsShadows(lab: Lab): Promise<Checked> {
  // (the eye's adaptation settled, and a first picture taken and left: the page lays its layers out for it)
  await lab.step(SETTLE_FRAMES);
  await pictureIn(lab, undefined, 'the village at noon, settling');
  await lab.step(2);
  const one = await pictureIn(lab, undefined, 'the village at noon');
  await lab.step(2);
  const again = await pictureIn(lab, undefined, 'the village at noon, again');
  RUST.tune.shadows = 0;
  let none: ImageData;
  try {
    await lab.step(2);
    none = await pictureIn(lab, undefined, 'the village at noon, the sun casting nothing');
  } finally {
    RUST.tune.shadows = 1;
    await lab.step(2);
  }
  const noise = blocksChanged(one, again);
  const shadowed = blocksChanged(one, none);
  const said = `the sun's shadows change ${(shadowed * 100).toFixed(1)}% of the village's frame at noon `
    + `(two frames alike differ in ${(noise * 100).toFixed(1)}%)`;
  if (shadowed < SHADOWED_LEAST || shadowed < noise * OVER_NOISE) return failed(`the sun casts next to no shadow: ${said}`);
  return passed(said);
}
