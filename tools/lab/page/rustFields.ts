// `lab rustcheck`'s check of the meadow's blades placed once a frame (Bulwark's gpu/placed.rs, `looks/meadow.ts`'s
// `place_hook`): a pass ahead of the draw places each blade and keeps those shown, and only those are drawn. That
// the two ways draw one picture is the engine's own check (`lab fields` there); here, that the village's grass
// goes through the pass, and what it leaves out.
import type { Lab } from './lab';
import { type Checked, failed, passed } from './rustPixels';
import { RUST } from '../../../src/engine';
import type { Bridge } from '../../../src/engine/bridge';

/** how many frames a count takes to come back from the GPU, with some to spare */
const FRAMES = 6;

/** What the engine says of its frame after `FRAMES` more: the blades kept, those counted, the frame's triangles. */
async function counted(lab: Lab, bridge: Bridge): Promise<{ kept: number; of: number; triangles: number }> {
  // (the browser let go after each: a count comes back on its own time, never within a step)
  for (let frame = 0; frame < FRAMES; frame++) {
    await lab.step(1);
    await window.__labClock.realFrame();
  }
  return { kept: bridge.stats.fieldKept, of: bridge.stats.fieldCounted, triangles: bridge.stats.triangles };
}

/**
 * The village's grass is placed by the engine's pass: some of its blades kept, never all (the mask, the rings'
 * bands and the share kept by distance drop the rest), and the frame's triangles fewer than with each blade placed
 * at its vertices (`rust.fieldsPlaced=0`, the canary: no blade counted by the pass, every dropped blade's triangles
 * sent). From a phone over the shoulder at Very low: 8.4 ms of a 16.8 ms frame the grass, 1.7 of it its shading.
 */
export async function grassPlacedOnce(lab: Lab, bridge: Bridge): Promise<Checked> {
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    const once = await counted(lab, bridge);
    if (once.of === 0) return failed('no blade of the village\'s grass was placed by the engine\'s pass');
    if (once.kept === 0 || once.kept >= once.of) {
      return failed(`the pass kept ${once.kept} of the ${once.of} blades it placed: some, never all, are shown`);
    }
    RUST.tune.fieldsPlaced = 0;
    const each = await counted(lab, bridge);
    if (each.of !== 0) return failed(`the canary: with blades placed at their vertices the pass still counted ${each.of}`);
    if (each.triangles <= once.triangles) {
      return failed(`the canary: placed at their vertices the frame drew ${each.triangles} triangles, placed once ${once.triangles}`);
    }
    const share = Math.round((once.kept / once.of) * 100);
    return passed(`the grass placed once: ${once.kept} blades kept of ${once.of} (${share}%), the frame ${once.triangles} `
      + `triangles (placed at every vertex: ${each.triangles})`);
  } finally {
    RUST.tune.fieldsPlaced = 1;
    await lab.step(2);
    lab.drawing = drawing;
  }
}
