// `lab hedgeward`'s debris (page/hedgeward.ts): what a broken Hedgeward leaves, in the village's training yard where
// Victor saw it ("too much debris", "like a tree", "it also cannot fall apart in to sawn off log pieces >head in
// diameter", "should be just wooden sticks"). The wall raised from the yard's spot, then broken; every frame after, the
// rubble's pieces read off their pools (`rubble: <shape> <n>`): how many lie, the thickest and the longest against a
// stake's size, how far from the wall's line they come to rest, and how soon the last is gone. Meanwhile whatever the
// renderer says (an error from the engine drawing is a fault: a pass the GPU refuses draws black and says nothing
// else), and anything the engine newly leaves undrawn. The frame's draws with the wall standing and with its pieces
// down. Pictured as the player sees it, numbered, from the same spot each run. `--canary` takes the wall's own break
// away (`BREAKS.sticks`), so it breaks as a big prop, which must be caught.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { RUST } from '../../../src/engine';
import { faceCamera } from '../../../src/core/renderer';
import { YARD, yardToWorld } from '../../../src/data/village';
import { groundHeight } from '../../../src/world/ground';
import { breakProp } from '../../../src/world/destructible';
import type { Ward } from '../../../src/world/wards';
// (the module whole: a commit from before `BREAKS` has none, and the case runs there for the pictures before)
import * as rubbleModule from '../../../src/fx/rubble';

/** a stake as built (models/hedgeward.ts): at most this thick and this long (m), with room for the rubble's own
 *  stretch of a piece (a fifth either way) */
export const STAKE_THICK = 0.15, STAKE_LONG = 2.0;
/** the most pieces a broken wall may leave, the most from its line they may lie (m), and how soon the last must be
 *  gone (s) */
export const MOST_PIECES = 16, MOST_FROM_LINE = 2.5, GONE_IN = 6;
/** the frames it's watched after it breaks, and the moments pictured (frames after the break: 0 the wall standing) */
const WATCHED = 480, PICTURED = [0, 10, 40, 120, 300];

/** What the case is handed by `hedgeward()`: how to raise a wall at an aim, the skill's key, and whether to plant. */
export interface DebrisCase {
  raise: (aim: THREE.Vector3) => Promise<Ward>;
  canary: boolean;
}

const IDENTITY = new THREE.Matrix4();

/** The pieces lying now: each one's thickness, length and place. */
interface Piece { thick: number; long: number; at: THREE.Vector3; name: string }

/** Every rubble instance's matrix now, by its pool's name and slot: what stood before the break (a slot the boot's
 *  warm-up left, still at the world's middle full size) isn't the break's, and is left out of `piecesNow`. */
export function rubbleNow(): Map<string, number[]> {
  const now = new Map<string, number[]>();
  const m = new THREE.Matrix4();
  for (const o of G.scene.children) {
    const mesh = o as THREE.InstancedMesh;
    if (!mesh.isInstancedMesh || !mesh.name.startsWith('rubble:')) continue;
    for (let i = 0; i < mesh.count; i++) now.set(`${mesh.name}#${i}`, mesh.getMatrixAt(i, m).toArray());
  }
  return now;
}

/** Every live rubble piece the break made, read off its pool's instances (a piece shrunk away is gone; one as it
 *  stood before the break, `before`, isn't the break's). */
export function piecesNow(before: Map<string, number[]>): Piece[] {
  const pieces: Piece[] = [];
  const m = new THREE.Matrix4(), at = new THREE.Vector3(), scale = new THREE.Vector3();
  for (const o of G.scene.children) {
    const mesh = o as THREE.InstancedMesh;
    if (!mesh.isInstancedMesh || !mesh.name.startsWith('rubble:') || !mesh.visible) continue;
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m);
      const was = before.get(`${mesh.name}#${i}`);
      if (was && m.elements.every((value, k) => value === was[k])) continue;
      // (a slot no piece has written yet: the instanced mesh's own identity, full size at the world's middle)
      if (m.equals(IDENTITY)) continue;
      // (each axis's length read off the matrix's columns: a piece shrunk away is a matrix of no size, and three's
      // `decompose` calls its scale 1, a stick two metres thick where nothing was)
      const e = m.elements;
      scale.set(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10]));
      if (Math.max(scale.x, scale.y, scale.z) < 1e-3) continue;
      at.setFromMatrixPosition(m);
      // (its geometry about 1 each way from its middle: a piece's size is twice its scale)
      const name = `${mesh.name}#${i} at ${at.x.toFixed(2)}, ${at.y.toFixed(2)}, ${at.z.toFixed(2)}, `
        + `scaled ${scale.x.toFixed(3)}, ${scale.y.toFixed(3)}, ${scale.z.toFixed(3)}`;
      pieces.push({ thick: 2 * Math.max(scale.x, scale.y), long: 2 * scale.z, at: at.clone(), name });
    }
  }
  return pieces;
}

/** How far `p` is from the line a to b, on the floor. */
function fromLine(p: THREE.Vector3, ward: Ward): number {
  const dx = ward.bx - ward.ax, dz = ward.bz - ward.az, len2 = dx * dx + dz * dz;
  const k = Math.max(0, Math.min(1, ((p.x - ward.ax) * dx + (p.z - ward.az) * dz) / len2));
  return Math.hypot(p.x - (ward.ax + dx * k), p.z - (ward.az + dz * k));
}

/** The case run: its lines and problems, and its pictures. */
export async function debris(lab: Lab, c: DebrisCase): Promise<{ lines: string[]; problems: string[]; moments: Pictured[] }> {
  const lines: string[] = [], problems: string[] = [], moments: Pictured[] = [];
  // --- the yard's spot, the wall raised a few metres before him ---
  const [x, z] = yardToWorld(0, -2);
  lab.player.walkTo = null;
  lab.player.place(new THREE.Vector3(x, groundHeight(x, z), z), YARD.turn);
  // (the camera behind him, as a player looking where he raises it: the same view each run, for its pictures)
  faceCamera(YARD.turn);
  await lab.step(30);
  const ahead = new THREE.Vector3(Math.sin(YARD.turn), 0, Math.cos(YARD.turn));
  const ward = await c.raise(lab.player.pos.clone().addScaledVector(ahead, 3.2));
  await lab.step(40);
  const breaks = (rubbleModule as { BREAKS?: Record<string, unknown> }).BREAKS;
  const own = breaks?.sticks;
  if (c.canary && breaks) delete breaks.sticks;
  // --- watched from the break on ---
  const said: string[] = [];
  const consoleError = console.error;
  console.error = (...parts: unknown[]) => { said.push(parts.map(String).join(' ')); consoleError(...parts); };
  const bridge = RUST.bridge;
  const undrawnBefore = new Set(bridge ? [...bridge.skipped.keys()] : []);
  const undrawnNew = new Set<string>();
  const drawsStanding = bridge?.stats.draws ?? 0;
  let thickestIs = '';
  const bigFrames: number[] = [];
  let most = 0, thickest = 0, longest = 0, farthest = 0, goneAt = -1, drawsDown = 0;
  try {
    moments.push(await lab.screen('debris 1: the wall standing'));
    const before = rubbleNow();
    breakProp(ward.prop);
    for (let frame = 1; frame <= WATCHED; frame++) {
      await lab.step(1);
      const pieces = piecesNow(before);
      most = Math.max(most, pieces.length);
      for (const p of pieces) {
        if (p.thick > thickest) thickestIs = p.name;
        if (p.thick > STAKE_THICK) bigFrames.push(frame);
        thickest = Math.max(thickest, p.thick);
        longest = Math.max(longest, p.long);
        if (frame > 90) farthest = Math.max(farthest, fromLine(p.at, ward));
      }
      if (frame === 90) drawsDown = bridge?.stats.draws ?? 0;
      if (bridge) for (const kind of bridge.skipped.keys()) if (!undrawnBefore.has(kind)) undrawnNew.add(kind);
      if (!pieces.length && goneAt < 0 && frame > 5) goneAt = frame;
      const n = PICTURED.indexOf(frame);
      if (n > 0) moments.push(await lab.screen(`debris ${n + 1}: ${(frame / 60).toFixed(2)} s after it broke`));
    }
  } finally {
    console.error = consoleError;
    if (c.canary && breaks && own) breaks.sticks = own;
  }
  const cm = (m: number) => `${(m * 100).toFixed(0)} cm`;
  lines.push(`debris: ${most} pieces at most, the thickest ${cm(thickest)} and the longest ${cm(longest)} `
    + `(a stake: ${cm(STAKE_THICK)}, ${cm(STAKE_LONG)}), lying at most ${farthest.toFixed(2)} m from the wall's line, `
    + `${goneAt < 0 ? 'some still lying' : `all gone ${(goneAt / 60).toFixed(1)} s after it broke`}; `
    + `the frame's draws ${drawsStanding} with it standing, ${drawsDown} with its pieces down`);
  if (most > MOST_PIECES) problems.push(`debris: a broken wall left ${most} pieces (at most ${MOST_PIECES})`);
  if (thickest > STAKE_THICK) problems.push(`debris: a piece ${cm(thickest)} thick, thicker than a stake (${cm(STAKE_THICK)}): ${thickestIs}, seen on frames ${bigFrames.slice(0, 6).join(', ')}${bigFrames.length > 6 ? ` and ${bigFrames.length - 6} more` : ''}`);
  if (longest > STAKE_LONG) problems.push(`debris: a piece ${cm(longest)} long, longer than a stake (${cm(STAKE_LONG)})`);
  if (farthest > MOST_FROM_LINE) problems.push(`debris: a piece came to rest ${farthest.toFixed(2)} m from the wall (at most ${MOST_FROM_LINE})`);
  if (goneAt < 0 || goneAt > GONE_IN * 60) problems.push(`debris: its pieces still lay ${GONE_IN} s after it broke`);
  if (!most) problems.push('debris: the broken wall left nothing at all (its pieces not drawn, or the break not seen)');
  if (said.length) problems.push(`debris: the renderer said while it fell: ${said.slice(0, 3).join(' | ')}`);
  if (undrawnNew.size) problems.push(`debris: the engine left undrawn: ${[...undrawnNew].join(', ')}`);
  if (!bridge) problems.push('debris: no engine to draw it (RUST.bridge)');
  return { lines, problems, moments };
}
