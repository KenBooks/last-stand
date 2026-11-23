// `lab rustcheck`'s check of what's thinned to nothing whole (`SeeKinds.gone` in src/engine/seeKinds.ts,
// `rust.goneWhole`): stood before the hall of heroes with the camera over its roof, as a phone's profile had it
// (BVTG-0HZ8), the roof's layers are thinned all the way and the engine's shader drops every pixel of them. Left
// out of the frame's draws they must leave the same picture, in fewer draws; the canary is the switch off, which
// must draw no fewer.
import type { Lab } from './lab';
import { apartShare, percent } from './rustPlain';
import { type Checked, failed, passed, pixelsIn } from './rustPixels';
import { faceCamera } from '../../../src/core/renderer';
import { RUST } from '../../../src/engine';
import type { Bridge } from '../../../src/engine/bridge';
import { G } from '../../../src/state';
import { standAt } from './draws';

/** where he stands before the hall (x, z), the camera's turn (degrees, as a report's Scene line) and its zoom */
const BEFORE_HALL: [number, number] = [-0.6, -5.9];
const TURNED = 178;
const ZOOM = 0.5;
/** the frames a switch is given before the frame is pictured */
const SETTLE_FRAMES = 6;
/** the share of the frame that may be apart between two pictures of it held still */
const STILL_SHARE = 0.0005;
/** the least draws leaving them out must save there (the hall's roof alone is three) */
const SAVED_LEAST = 2;

/** `rust.goneWhole` set and the frame after it pictured: its pixels and its draw calls. */
async function drawnWith(lab: Lab, bridge: Bridge, on: number, label: string): Promise<[Uint8ClampedArray, number]> {
  RUST.tune.goneWhole = on;
  await lab.step(SETTLE_FRAMES);
  return [await pixelsIn(lab, undefined, label), bridge.stats.draws];
}

/** What's thinned to nothing whole is left out of the frame's draws, and the frame is the same. */
export async function goneWholeLeftOut(lab: Lab, bridge: Bridge): Promise<Checked> {
  const drawing = lab.drawing;
  const paused = G.paused;
  await standAt(lab, { biome: G.arena.biome, view: 'top', village: true, at: BEFORE_HALL, hour: 0, zoom: ZOOM });
  faceCamera((TURNED * Math.PI) / 180 - Math.PI);
  lab.drawing = true;
  await lab.step(60);
  G.paused = true;
  try {
    const [without, few] = await drawnWith(lab, bridge, 1, 'thinned to nothing: left out');
    const [drawn, all] = await drawnWith(lab, bridge, 0, 'thinned to nothing: drawn and dropped');
    const apart = apartShare(without, drawn);
    if (all - few < SAVED_LEAST) {
      return failed(`before the hall, what's thinned to nothing left out saves ${all - few} of ${all} draws `
        + `(${SAVED_LEAST} at least: nothing there is thinned whole, or it's drawn all the same)`);
    }
    if (apart > STILL_SHARE) {
      return failed(`before the hall, leaving out what's thinned to nothing changes ${percent(apart)} of the frame's pixels`);
    }
    return passed(`before the hall, what's thinned to nothing whole is left out: ${few} draws for ${all}, the frame the `
      + `same (${percent(apart)} of its pixels apart)`);
  } finally {
    RUST.tune.goneWhole = 1;
    G.paused = paused;
    await lab.step(SETTLE_FRAMES);
    lab.drawing = drawing;
  }
}
