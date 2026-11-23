// `lab rustcheck`'s check of what the engine keeps (Bulwark's kept.rs, `src/engine/kept.ts`, `rust.kept`): the parts
// of the world the game says stand still are handed over once and drawn with no walk of them. They must draw the
// frame the walk draws, to the pixel; a kept mesh hidden must go from the frame and come back shown; and a change
// nothing tells of (a mesh given another material) must be found by the audit.
// With it, the doorways' cull the engine's frame runs (`doorwaysLeaveTheFrame`).
import * as THREE from 'three';
import type { Lab } from './lab';
import { apartShare, percent } from './rustPlain';
import { type Checked, failed, passed, pixelsIn } from './rustPixels';
import { RUST } from '../../../src/engine';
import type { Bridge } from '../../../src/engine/bridge';
import { G } from '../../../src/state';
import { standAt } from './draws';

/** where the hero stands in the hall of heroes for the doorways' check (x, z): before its dais, his back to the door */
const IN_HALL: [number, number] = [-1.6, -22.3];
/** the least records the doorways' cull must leave out there (the village behind him: 76 as this was written) */
const CULLED_LEAST = 20;

/**
 * Stood in the hall of heroes, seen over his shoulder: what its doorway hides (`cullForEngine` in
 * world/doorways.ts, `rust.doorways`) is left out of the frame's records, and the frame is drawn as with it all
 * walked. The canary: with the switch off no fewer records are written.
 */
export async function doorwaysLeaveTheFrame(lab: Lab, bridge: Bridge): Promise<Checked> {
  const drawing = lab.drawing, paused = G.paused;
  await standAt(lab, { biome: G.arena.biome, view: 'third', village: true, at: IN_HALL, hour: 12 });
  lab.drawing = true;
  await lab.step(90);
  G.paused = true;
  try {
    RUST.tune.doorways = 1;
    await lab.step(SETTLE_FRAMES);
    const culled = await pixelsIn(lab, undefined, 'doorways: what the doorway hides left out');
    const few = bridge.stats.records;
    RUST.tune.doorways = 0;
    await lab.step(SETTLE_FRAMES);
    const whole = await pixelsIn(lab, undefined, 'doorways: everything walked');
    const all = bridge.stats.records;
    const apart = apartShare(culled, whole);
    if (all - few < CULLED_LEAST) {
      return failed(`in the hall the doorway's cull leaves out ${all - few} of ${all} records (${CULLED_LEAST} at least)`);
    }
    if (apart > STILL_SHARE) {
      return failed(`in the hall what the doorway hides changes ${percent(apart)} of the frame's pixels left out`);
    }
    return passed(`in the hall what its doorway hides is left out of the frame: ${few} records for ${all}, the frame `
      + `the same (${percent(apart)} of its pixels apart)`);
  } finally {
    RUST.tune.doorways = 1;
    G.paused = paused;
    await lab.step(SETTLE_FRAMES);
    lab.drawing = drawing;
  }
}

/** the frames a switch is given before the frame is pictured */
const SETTLE_FRAMES = 6;
/** the share of the frame that may be apart between two pictures of it held still (a spark, a mote) */
const STILL_SHARE = 0.0005;
/** the least share of the frame the kept meshes must cover: hidden, that much of it changes (the canary) */
const HIDDEN_SHARE = 0.01;
/** how many frames the audit is given to find a change nothing told of (it writes a few meshes again a frame) */
const AUDIT_FRAMES = 900;

/** The meshes the engine draws from what it keeps. */
function keptMeshes(bridge: Bridge): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  bridge.kept.eachDrawn((mesh) => meshes.push(mesh));
  return meshes;
}

/** `rust.kept` set, and the frames after it drawn: the frame pictured. */
async function pictured(lab: Lab, kept: number, label: string): Promise<Uint8ClampedArray> {
  RUST.tune.kept = kept;
  await lab.step(SETTLE_FRAMES);
  return pixelsIn(lab, undefined, label);
}

/** Frames stepped until the audit has found one more change, `AUDIT_FRAMES` at most: whether it did. */
async function auditFinds(lab: Lab, bridge: Bridge): Promise<boolean> {
  const before = bridge.kept.stale;
  for (let frame = 0; frame < AUDIT_FRAMES && bridge.kept.stale === before; frame++) await lab.step(1);
  return bridge.kept.stale > before;
}

/**
 * Where the hero stands, the game held still: the frame with the still parts kept, walked, and kept again must be
 * one frame. The canaries: every kept mesh hidden must change the frame and shown again must give it back (a
 * change the game tells by `visible`); one given another material with nothing said must be found by the audit,
 * and so must its own material given back.
 */
export async function keptSameFrame(lab: Lab, bridge: Bridge): Promise<Checked> {
  const drawing = lab.drawing, paused = G.paused, stale = bridge.kept.stale;
  lab.drawing = true;
  G.paused = true;
  try {
    const kept = await pictured(lab, 1, 'kept: the still parts kept');
    const { records, meshes, parts } = bridge.kept.now;
    const all = bridge.stats.records;
    if (!records) return failed('nothing is kept by the engine where the hero stands: no part says it stands still');
    const walked = await pictured(lab, 0, 'kept: every part walked');
    if (bridge.kept.now.records) return failed(`with the switch off ${bridge.kept.now.records} records are still kept`);
    const again = await pictured(lab, 1, 'kept: the still parts kept again');
    const still = apartShare(kept, again), apart = apartShare(kept, walked);
    if (still > STILL_SHARE) {
      return failed(`the frame held still moved between two pictures of it kept (${percent(still)} of its pixels)`);
    }
    if (apart > STILL_SHARE) {
      return failed(`kept, the still parts draw ${percent(apart)} of the frame's pixels apart from the walk's`);
    }
    const hidden = keptMeshes(bridge);
    for (const mesh of hidden) mesh.visible = false;
    await lab.step(SETTLE_FRAMES);
    const without = await pixelsIn(lab, undefined, 'kept: every kept mesh hidden');
    for (const mesh of hidden) mesh.visible = true;
    await lab.step(SETTLE_FRAMES);
    const back = await pixelsIn(lab, undefined, 'kept: every kept mesh shown again');
    const gone = apartShare(kept, without), returned = apartShare(kept, back);
    if (gone < HIDDEN_SHARE) {
      return failed(`the canary: ${hidden.length} kept meshes hidden changed ${percent(gone)} of the frame, as if still drawn`);
    }
    if (returned > STILL_SHARE) {
      return failed(`kept meshes hidden and shown again draw ${percent(returned)} of the frame apart from before`);
    }
    const one = keptMeshes(bridge).find((mesh) => !Array.isArray(mesh.material));
    if (!one) return failed('no kept mesh of one material to give another');
    const own = one.material as THREE.Material;
    one.material = own.clone();
    const found = await auditFinds(lab, bridge);
    one.material = own;
    const foundBack = found && await auditFinds(lab, bridge);
    if (!found) return failed('the canary: a kept mesh given another material was never found by the audit');
    if (!foundBack) return failed('a kept mesh given its own material back was never found by the audit');
    return passed(`the engine keeps ${records} of the frame's ${all} records (${meshes} meshes in ${parts} parts that `
      + `stand still) and draws the frame the walk draws (${percent(apart)} of its pixels apart, two pictures of it `
      + `kept ${percent(still)}); hidden, they change ${percent(gone)} of the frame and come back; a material `
      + 'changed with nothing said is found by the audit');
  } finally {
    RUST.tune.kept = 1;
    G.paused = paused;
    bridge.kept.stale = stale;
    await lab.step(SETTLE_FRAMES);
    lab.drawing = drawing;
  }
}
