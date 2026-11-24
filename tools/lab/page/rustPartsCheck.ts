// `lab rustcheck`'s check of a frame broken down by its parts (Bulwark's gpu/parts.rs, `src/perf/gpuParts.ts`): a
// profile draws the scene as a pass for each run of its draws of one kind, each loading what the one before stored,
// and what it times must be the frame the player sees. The frame is drawn as it is and broken down, each read from
// the engine's canvas in the task that drew it, and the two must be the same picture; the frame read must be one
// the engine did break down (its parts' times came back for it), in several passes.
import type { Lab } from './lab';
import { apartShare, percent } from './rustPlain';
import { type Checked, failed, passed } from './rustPixels';
import { render } from '../../../src/core/renderer';
import type { Bridge } from '../../../src/engine/bridge';
import { G } from '../../../src/state';

/** the share of the frame that may be apart between two pictures of it held still */
const STILL_SHARE = 0.0005;
/** the most of the browser's frames waited for the engine's stamps to come back */
const WAITED_MOST = 240;
/** the least passes a frame of the village broken down is drawn in (its scene alone is several) */
const PASSES_LEAST = 5;
/** the frames stepped before the two pictures: past a roof's fade (0.4 s), which opens while he sees into its room */
const SETTLE_FRAMES = 40;

/** The browser's next frame, by its own clock. */
function browserFrame(): Promise<void> {
  return (window as unknown as { __labClock: { realFrame: () => Promise<void> } }).__labClock.realFrame();
}

/** The frame drawn now and read from the engine's canvas in the same task (its picture is gone after it). */
function drawnNow(canvas: HTMLCanvasElement): Uint8ClampedArray {
  const copy = Object.assign(document.createElement('canvas'), { width: canvas.width, height: canvas.height });
  const context = copy.getContext('2d', { willReadFrequently: true })!;
  render();
  context.drawImage(canvas, 0, 0);
  return context.getImageData(0, 0, copy.width, copy.height).data;
}

/** The browser's frames waited through while `still` holds, `WAITED_MOST` at most: whether it stopped holding. */
async function waitedWhile(still: () => boolean): Promise<boolean> {
  for (let waited = 0; waited < WAITED_MOST && still(); waited++) await browserFrame();
  return !still();
}

/** A frame broken down by its parts is the frame as it is, and was drawn in several passes. */
export async function brokenDownSameFrame(lab: Lab, bridge: Bridge): Promise<Checked> {
  const canvas = document.getElementById('rust-canvas') as HTMLCanvasElement;
  const levels = bridge.levels;
  if (levels.gpuClock().reads === 0) return passed('a frame broken down by its parts: not checked, the browser gives no timestamps');
  const paused = G.paused;
  G.paused = true;
  try {
    await lab.step(SETTLE_FRAMES);
    const whole = drawnNow(canvas);
    // (and once more as it is: how far two frames of it are apart with nothing broken down, said when the check fails)
    const still = apartShare(whole, drawnNow(canvas));
    levels.setBreakdown(true);
    await waitedWhile(() => levels.breakdown().busy);
    const before = levels.breakdown().reads;
    const broken = drawnNow(canvas);
    const came = await waitedWhile(() => levels.breakdown().reads === before);
    if (!came) return failed('the frame drawn with its parts asked for was never broken down: no part\'s time came back');
    const { passes, ms } = levels.breakdown();
    const apart = apartShare(whole, broken);
    if (passes < PASSES_LEAST) return failed(`a frame broken down was drawn in ${passes} passes (${PASSES_LEAST} at least)`);
    if (apart > STILL_SHARE) return failed(`a frame broken down by its parts differs from the frame as it is: ${percent(apart)}`
      + ` (two frames as it is, one after the other: ${percent(still)})`);
    const sum = ms.reduce((all, part) => all + part, 0);
    return passed(`a frame broken down by its parts, ${passes} passes adding up to ${sum.toFixed(2)} ms, is the frame `
      + `as it is (${percent(apart)} of its pixels apart)`);
  } finally {
    levels.setBreakdown(false);
    G.paused = paused;
  }
}
