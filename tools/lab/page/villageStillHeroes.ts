// `lab village`'s still heroes drawn as one: the hall of heroes' heroes standing still on its dais while the camera is
// outside, each drawn as a few meshes of his alike parts merged where they stand (`models/stillAsOne.ts`), where part
// by part the two were 133 of the square's 439 draws for 0.03% of its pixels. Stood on the square over the shoulder
// (the dais seen through the door), at midnight and noon, the frame is drawn merged and part by part, the hall's
// heroes stepped between with no game time passing: the heroes must be merged, the draws fewer, and the pixels the
// same, as the game's camera sees them and from a camera of the check's own before the dais (from the square they're
// a few hundred pixels). `canary` lays the normals as they were made, not turned as their parts are drawn, which
// must change the close look.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { holdHour } from '../../../src/game/clock';
import { groundHeight } from '../../../src/world/ground';
import { faceCamera, viewMode } from '../../../src/core/renderer';
import { HALL, TERRACE } from '../../../src/data/village';
import { standHeroes } from '../../../src/game/hall';
import { stillAsOne } from '../../../src/entities/models/stillAsOne';
import { changedShare, countedFrame, viewBy, type Counted } from './villageHallCull';
import { VILLAGE_SPOT } from './draws';
import type { LightsChecked } from './villageLights';

/** the hours read, and the frames he's given to settle */
const HOURS = [0, 12];
const SETTLE = 30;
/** the most of the frame's pixels the merge may change, and the fewest draws it must save */
const MOST_CHANGED = 0.0001;
const FEWEST_SAVED = 30;
/** the name the merged meshes go by */
const MERGED = 'still as one';
/** the close look: how far before the dais's plinths the camera stands, how high over the dais and how high it
 *  looks, and its field of view (deg) */
const CLOSE = { back: 6, up: 1.6, at: 1.1, fov: 50 };

/** Where the hero stands for a reading: its name, where and which way (rad: 0 is along +z). */
interface Stand { name: string; x: number; z: number; facing: number }

const STANDS: Stand[] = [
  { name: 'on the square, over the shoulder', x: VILLAGE_SPOT[0], z: VILLAGE_SPOT[1], facing: Math.PI },
];

/** The hero stood at `stand` over the shoulder, let settle. */
async function standAt(lab: Lab, stand: Stand): Promise<void> {
  const at = new THREE.Vector3(stand.x, 0, stand.z);
  at.y = groundHeight(at.x, at.z);
  G.player.walkTo = null;
  G.player.place(at, stand.facing);
  await viewBy(lab, 'third');
  faceCamera(stand.facing);
  await lab.step(SETTLE);
}

/** The game's camera put before the dais's plinths, looking at them; returns what puts it back. */
function closeToDais(): () => void {
  const camera = G.camera;
  const kept = { position: camera.position.clone(), quaternion: camera.quaternion.clone(), fov: camera.fov };
  const dais = groundHeight(TERRACE.x, HALL.plinthZ);
  camera.position.set(TERRACE.x, dais + CLOSE.up, HALL.plinthZ + CLOSE.back);
  camera.fov = CLOSE.fov;
  camera.updateProjectionMatrix();
  camera.lookAt(TERRACE.x, dais + CLOSE.at, HALL.plinthZ);
  camera.updateMatrixWorld();
  return () => {
    camera.position.copy(kept.position);
    camera.quaternion.copy(kept.quaternion);
    camera.fov = kept.fov;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  };
}

/** One look's frames: part by part, and merged. */
interface Look { apart: Counted; merged: Counted }

/** The frames as the game's camera sees them and from before the dais, with the hall's heroes merged (`on`) or part
 *  by part, their merge stepped with no game time passing. */
function drawnBoth(lab: Lab, on: boolean): { seen: Counted; close: Counted } {
  stillAsOne.on = on;
  standHeroes(true, 0, true);
  const seen = countedFrame(lab);
  const back = closeToDais();
  try {
    return { seen, close: countedFrame(lab) };
  } finally {
    back();
  }
}

/** The share of the pixels a look's merge changed. */
const changedIn = (look: Look): number => changedShare(look.apart.canvas, look.merged.canvas);

/** What the merge changes, drawn now: the draws it saves as seen, and the pixels it changes as seen and close. The
 *  canary's merge lays the normals unturned. */
function mergeChanges(lab: Lab, canary: boolean): { saved: number; seen: number; close: number } {
  stillAsOne.unturned = canary;
  try {
    const apart = drawnBoth(lab, false);
    const merged = drawnBoth(lab, true);
    return {
      saved: apart.seen.draws - merged.seen.draws,
      seen: changedIn({ apart: apart.seen, merged: merged.seen }),
      close: changedIn({ apart: apart.close, merged: merged.close }),
    };
  } finally {
    // (merged again as the game would: the canary's meshes let go of)
    stillAsOne.unturned = false;
    stillAsOne.on = false;
    standHeroes(true, 0, true);
    stillAsOne.on = true;
    standHeroes(true, 0, true);
  }
}

/** How many meshes the hall's heroes are drawn with merged. */
function mergedMeshes(): number {
  let count = 0;
  G.scene.traverse((object) => {
    if (object.name === MERGED) count++;
  });
  return count;
}

/** A share of the pixels said. */
const percent = (share: number): string => `${(share * 100).toFixed(4)}%`;

/** The hall's still heroes merged against part by part, from each stand, at each hour. */
export async function heroesStillAsOne(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const view = viewMode();
  const lines: string[] = [];
  const problems: string[] = [];
  let caught = false;
  try {
    for (const stand of STANDS) {
      await standAt(lab, stand);
      const read: string[] = [];
      for (const hour of HOURS) {
        holdHour(hour);
        await lab.step(SETTLE);
        // (the state it measures: the heroes standing still and merged by the game's own frames)
        const merged = mergedMeshes();
        const { saved, seen, close } = mergeChanges(lab, canary);
        read.push(`${hour}:00 ${merged} merged meshes, ${saved} draws fewer, ${percent(seen)} of pixels changed as `
          + `seen, ${percent(close)} close`);
        if (Math.max(seen, close) > MOST_CHANGED) caught = true;
        if (canary) continue;
        const at = `the hall's still heroes, ${stand.name}, at ${hour}:00`;
        if (merged === 0) problems.push(`${at}: they weren't merged`);
        else if (saved < FEWEST_SAVED) problems.push(`${at}: merged, they're ${saved} draws fewer, not ${FEWEST_SAVED}`);
        if (seen > MOST_CHANGED) problems.push(`${at}: the frame changed`);
        if (close > MOST_CHANGED) problems.push(`${at}: they changed, close`);
      }
      lines.push(`the hall's still heroes merged against part by part, ${stand.name}: ${read.join('; ')}`);
    }
  } finally {
    holdHour(null);
    await viewBy(lab, view);
  }
  return { lines, problems, caught: canary ? caught : null, moments: [] };
}
