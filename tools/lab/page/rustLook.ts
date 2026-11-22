// `lab rustcheck`'s checks of the game's own look over the Rust engine's frame (`src/engine/frameLook.ts`): photo
// mode's look reaches the grade, the blood shows round the screen's edges at low health, and a picture taken of the
// frame holds it (a photo, a bug report's shot: read from three's canvas they were blank).
import type { Lab } from './lab';
import { frameShot } from '../../../src/core/renderer';
import { NEUTRAL_LOOK, applyPhotoLook } from '../../../src/core/photoLook';
import { type Checked, failed, passed, pictureIn } from './rustPixels';

/** how much of the frame's colour a look of no saturation may keep, and the least colour the frame must have
 *  without it (the mean spread of a pixel's channels, of 255) */
const GREY_KEEPS_MOST = 0.35;
const COLOUR_LEAST = 3;
/** the share of the screen's height read along its top edge, and how much redder than green its blood must be
 *  there (of 255) against the frame without it */
const EDGE = 0.07;
const BLOOD_REDDER = 12;
/** the share of his Health he's held at for the blood, and the frames the look is given to come */
const NEXT_TO_NONE = 0.04;
const SETTLE_FRAMES = 60;
/** a picture's mean light below which it's blank (of 255) */
const BLANK = 4;

/** The mean spread of the picture's pixels' channels: how much colour it has. */
function colourOf(picture: ImageData): number {
  let spread = 0;
  for (let at = 0; at < picture.data.length; at += 4) {
    const [r, g, b] = [picture.data[at], picture.data[at + 1], picture.data[at + 2]];
    spread += Math.max(r, g, b) - Math.min(r, g, b);
  }
  return spread / (picture.data.length / 4);
}

/** How much redder than green the picture's top rows are, on average. */
function redOver(picture: ImageData): number {
  const rows = Math.max(1, Math.round(picture.height * EDGE));
  let red = 0;
  for (let at = 0; at < rows * picture.width * 4; at += 4) red += picture.data[at] - picture.data[at + 1];
  return red / (rows * picture.width);
}

/**
 * Photo mode's look with no saturation: the frame is drawn near grey. The canary: without the look it has colour.
 */
export async function photoLookDrawn(lab: Lab): Promise<Checked> {
  await lab.step(2);
  const plain = colourOf(await pictureIn(lab, undefined, 'the frame as played'));
  applyPhotoLook({ ...NEUTRAL_LOOK, saturation: 0 }, true);
  let grey = 0;
  try {
    await lab.step(2);
    grey = colourOf(await pictureIn(lab, undefined, 'the frame, photo mode\'s look with no saturation'));
  } finally {
    applyPhotoLook(NEUTRAL_LOOK, false);
    await lab.step(2);
  }
  const said = `the frame's colour ${plain.toFixed(1)} of 255 as played, ${grey.toFixed(1)} under photo mode's look with no saturation`;
  if (plain < COLOUR_LEAST) return failed(`the canary: the frame as played has no colour to lose: ${said}`);
  if (grey > plain * GREY_KEEPS_MOST) return failed(`photo mode's look doesn't reach the engine's frame: ${said}`);
  return passed(said);
}

/**
 * At next to no Health the blood shows along the screen's top edge. The canary: at full Health it isn't there.
 */
export async function bloodAtLowHealth(lab: Lab): Promise<Checked> {
  // (his Health held, as `lab health` holds it: the game sets the look from it each frame)
  const held = lab.lifeShare;
  lab.lifeShare = 1;
  await lab.step(SETTLE_FRAMES);
  const well = redOver(await pictureIn(lab, undefined, 'the frame at full Health'));
  lab.lifeShare = NEXT_TO_NONE;
  let low = 0;
  try {
    await lab.step(SETTLE_FRAMES);
    low = redOver(await pictureIn(lab, undefined, 'the frame at next to no Health'));
  } finally {
    lab.lifeShare = held;
    await lab.step(SETTLE_FRAMES);
  }
  const said = `the top edge's red over its green: ${well.toFixed(1)} of 255 at full Health, ${low.toFixed(1)} at next to none`;
  if (low - well < BLOOD_REDDER) return failed(`no blood round the screen's edges at low Health: ${said}`);
  return passed(said);
}

/** A picture taken of the frame in its own task, as photo mode takes one, holds the frame. */
export async function frameShotHoldsTheFrame(lab: Lab): Promise<Checked> {
  let light = -1;
  frameShot.take = (canvas) => {
    const side = 64;
    const small = document.createElement('canvas');
    small.width = side;
    small.height = side;
    const context = small.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(canvas, 0, 0, side, side);
    const { data } = context.getImageData(0, 0, side, side);
    light = data.reduce((sum, value, at) => (at % 4 === 3 ? sum : sum + value), 0) / (side * side * 3);
  };
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    await lab.step(1);
  } finally {
    lab.drawing = drawing;
    frameShot.take = null;
  }
  if (light < 0) return failed('a picture asked of the frame was never taken: photo mode\'s shot would wait for ever');
  if (light < BLANK) return failed(`a picture taken of the frame is blank (its mean light ${light.toFixed(1)} of 255)`);
  return passed(`a picture taken of the frame holds it (its mean light ${light.toFixed(0)} of 255)`);
}
