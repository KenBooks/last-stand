// `lab village`'s chest's hoard as full as the stash is (from play, "it should be filled proportionally to how full it
// actually is, if 0, it should be literally empty"): the frame from over the open chest drawn with the hoard and
// without at one moment, as the stash holds more. `canary` reads five items as the empty stash, which must be found.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { RUN } from '../../../src/data/balance';
import { groundHeight } from '../../../src/world/ground';
import { CHEST, TERRACE } from '../../../src/data/village';
import { villageObject } from '../../../src/game/village';
import type { Item } from '../../../src/types';
import { drawFrame } from './light';
import { changedShare } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** the frames given for the lid to open and the hoard to settle */
const SETTLE = 90;
/** how high over the terrace the frame is drawn from (m), and how far before the chest */
const OVER = 2;
const BEFORE = 0.6;
/** the stash's sizes read, the first of them empty */
const SIZES = [0, 1, Math.round(RUN.bagLimit / 2), RUN.bagLimit];
/** what the canary reads as empty */
const CANARY_ITEMS = 5;

/** The share of the frame over the chest the hoard draws. */
function hoardDraws(lab: Lab, stand: readonly [number, number]): number {
  const pile = G.scene.getObjectByName('chest-hoard');
  if (!pile) throw new Error('lab: village: no chest-hoard in the scene');
  const camera = G.camera;
  const kept = { at: camera.position.clone(), turn: camera.quaternion.clone() };
  const off = Math.hypot(stand[0] - CHEST.x, stand[1] - CHEST.z);
  camera.position.set(
    CHEST.x + ((stand[0] - CHEST.x) / off) * BEFORE,
    TERRACE.high + OVER,
    CHEST.z + ((stand[1] - CHEST.z) / off) * BEFORE,
  );
  camera.lookAt(CHEST.x, TERRACE.high + 0.4, CHEST.z);
  camera.updateMatrixWorld();
  try {
    const shown = drawFrame(lab);
    pile.visible = false;
    const hidden = drawFrame(lab);
    return changedShare(shown, hidden);
  } finally {
    pile.visible = true;
    camera.position.copy(kept.at);
    camera.quaternion.copy(kept.turn);
    camera.updateMatrixWorld();
  }
}

/** The vertices the hoard's meshes draw: its share of a frame stops growing once the chest's mouth is full (30 of 60
 *  read 38% and 60 read 29%, the picture plainly fuller), but what it draws goes on growing. */
function hoardVertices(): number {
  const pile = G.scene.getObjectByName('chest-hoard');
  let vertices = 0;
  pile?.traverse((part) => {
    const mesh = part as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    const range = mesh.geometry.drawRange.count;
    const all = mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count;
    vertices += Math.min(range, all);
  });
  return vertices;
}

/** The hoard read with the stash at each size: nothing in an empty one, more as it fills. */
export async function hoardShowsStash(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const stand = villageObject('chest')?.stand;
  if (!stand) throw new Error('lab: village: no chest to stand by');
  const stash = G.profile.stash;
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(stand[0], groundHeight(stand[0], stand[1]), stand[1]), 0);
  const shares: number[] = [];
  const drawn: number[] = [];
  try {
    for (const size of SIZES) {
      const held = size === 0 && canary ? CANARY_ITEMS : size;
      G.profile.stash = Array<Item>(held).fill({} as Item);
      await lab.step(SETTLE);
      shares.push(hoardDraws(lab, stand));
      drawn.push(hoardVertices());
    }
  } finally {
    G.profile.stash = stash;
    await lab.step(SETTLE);
  }
  const read = shares.map((share, i) => `${SIZES[i]}: ${(share * 100).toFixed(2)}%`).join(', ');
  const line = `the chest's hoard draws of the frame over it, by the stash's size: ${read}; `
    + `vertices ${drawn.join(', ')}`;
  const [empty, one] = shares;
  const [, oneDrawn, half, full] = drawn;
  if (canary) return { lines: [line], problems: [], caught: empty > 0, moments: [] };
  const problems: string[] = [];
  if (empty > 0) problems.push(`${line}: an empty stash shows something`);
  if (one <= 0) problems.push(`${line}: an item shows nothing`);
  if (oneDrawn >= half || half >= full) problems.push(`${line}: not more as it fills`);
  return { lines: [line], problems, caught: null, moments: [] };
}
