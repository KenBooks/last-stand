// `lab rustcheck`'s check of what three draws over the engine's frame (the world's labels, the outline): its canvas
// is cleared by the first of those draws as its pass begins (core/webgpu.ts `clearOverFrame`), never by a pass of its
// own before them. On a phone's GPU, which draws by tiles, each pass after a clear read the whole canvas back first:
// 10.9 ms a frame with an outline shown, a report from play (64P8-0VPK).
import type { Lab } from './lab';
import { type Checked, failed, passed, pictureIn } from './rustPixels';
import { G } from '../../../src/state';
import { RUST } from '../../../src/engine';
import { outline } from '../../../src/ui/overlay/outline';
import { drawnLabels } from '../../../src/ui/overlay/layer';
import { overFramePasses } from '../../../src/core/webgpu';

/** the outline's colours here: one no scene has (magenta), then another barely shown */
const FIRST = 0xff00ff;
const THEN = 0x00ff00;
const FAINT = 0.02;
/** the frames an outline is given to show, and the least pixels of the first that must (of the page's picture) */
const FRAMES = 3;
const SHOWN_LEAST = 40;

/** How many of a picture's pixels are the first outline's colour: red and blue high, green low. */
function magenta(picture: ImageData): number {
  const { data } = picture;
  let count = 0;
  for (let at = 0; at < data.length; at += 4) {
    if (data[at] > 180 && data[at + 2] > 180 && data[at + 1] < 110) count++;
  }
  return count;
}

/** The page pictured with the hero outlined in `colour` at `strength` for a few frames. */
async function outlined(lab: Lab, colour: number, strength: number, label: string): Promise<ImageData> {
  for (let frame = 0; frame < FRAMES; frame++) {
    outline(G.player.obj, colour, strength);
    await lab.step(1);
  }
  return pictureIn(lab, undefined, label);
}

/**
 * An outline drawn over the engine's frame, then another barely shown in its place: nothing of the first is left
 * on the canvas, and the frame drew a pass for the outline and one for the labels if any are shown, none to
 * clear it. The canary (`rust.overCleared=0`, as it was): a pass more.
 */
export async function overCanvasCleared(lab: Lab): Promise<Checked> {
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    const before = magenta(await outlined(lab, THEN, FAINT, 'before an outline'));
    const first = magenta(await outlined(lab, FIRST, 1, 'the hero outlined')) - before;
    if (first < SHOWN_LEAST) return failed(`the hero's outline showed in ${first} pixels: none was drawn over the frame`);
    const after = magenta(await outlined(lab, THEN, FAINT, 'another outline in its place')) - before;
    if (after > first / 20) return failed(`${after} of the first outline's ${first} pixels are left under the next frame's`);
    const draws = 1 + (drawnLabels().length ? 1 : 0);
    const passes = overFramePasses();
    if (passes !== draws) return failed(`the overlays' canvas took ${passes} passes a frame for its ${draws} draws`);
    RUST.tune.overCleared = 0;
    await outlined(lab, THEN, FAINT, 'the canary');
    const asItWas = overFramePasses();
    if (asItWas !== draws + 1) return failed(`the canary: cleared by a pass of its own, ${asItWas} passes, not ${draws + 1}`);
    return passed(`the overlays' canvas is cleared by its first draw: ${passes} passes a frame for an outline and `
      + `${drawnLabels().length} labels (cleared by a pass of its own, ${asItWas}); an outline of ${first} pixels gone `
      + `the frame after (${after} left)`);
  } finally {
    RUST.tune.overCleared = 1;
    outline(null);
    await lab.step(2);
    lab.drawing = drawing;
  }
}
