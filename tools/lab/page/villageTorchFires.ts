// `lab village --only hallTorchesBurn`: the hall of heroes' torches burn, and their light flickers with their fires
// (from play, "hall lights are completely broken and static", "these lights are super lame": each was a lit tongue in
// a cup, the same every frame, its lamp steady). Stood in the hall at midnight: every column's and door's torch has a
// fire's flames by it (a mesh `buildFire` marks, `fireFlames`), and over two seconds each torch's lamp, as the lit
// shaders' list holds it (`lampList`), moves by at least `LEAST_SWAY` of its middle. `canary` holds every torch's
// flicker still: a light of its own in each one's place that no fire moves.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { holdHour } from '../../../src/game/clock';
import { lampList } from '../../../src/core/lamps';
import { TERRACE } from '../../../src/data/village';
import type { LightsChecked } from './villageLights';

/** where he stands (the hall's middle), the frames given to settle and read over */
const STAND = new THREE.Vector3(TERRACE.x, TERRACE.high, -22);
const SETTLE = 30;
const FRAMES = 120;
/** how near a torch's light its fire must burn (m: the light stands out from the torch, `wallTorch`'s `out`) */
const FIRE_NEAR = 1.4;
/** the least a torch's lamp must move by over the frames read, of its middle */
const LEAST_SWAY = 0.08;
/** the dais's lights ahead of the torches among the hall's (`TORCHLIGHT.dais` in game/village.ts) */
const DAIS_LIGHTS = 2;

/** The fires' flames in the scene, where each stands in the world. */
function flamesAt(): THREE.Vector3[] {
  const at: THREE.Vector3[] = [];
  G.scene.traverse((object) => {
    if (object.userData.fireFlames) at.push(object.getWorldPosition(new THREE.Vector3()));
  });
  return at;
}

/** Lamp `i`'s strength in the lit shaders' list: its colour's brightest channel. */
function lampStrength(i: number): number {
  const light = (1 + i * 2) * 4 + 4;
  return Math.max(lampList[light], lampList[light + 1], lampList[light + 2]);
}

/** The torches' places (the columns' and the door's) and their lamps' indices in the list. */
function torches(): { at: THREE.Vector3; lamp: number }[] {
  const village = G.arena.village;
  const first = village.lanterns.length;
  const columns = village.hallTorches.slice(DAIS_LIGHTS).map((at, k) => ({ at, lamp: first + DAIS_LIGHTS + k }));
  const porchFirst = first + village.hallTorches.length;
  const porch = village.porchTorches.map((at, k) => ({ at, lamp: porchFirst + k }));
  return [...columns, ...porch];
}

/** Every torch's flicker swapped for a light no fire moves; returns what puts them back. */
function flickersHeld(): () => void {
  const flickers = G.arena.village.torchFlickers as THREE.PointLight[];
  const kept = [...flickers];
  for (let k = 0; k < flickers.length; k++) flickers[k] = new THREE.PointLight(0xffffff, 1);
  return () => {
    for (let k = 0; k < kept.length; k++) flickers[k] = kept[k];
  };
}

/** The hall's torches burn, their light flickering. */
export async function hallTorchesBurn(lab: Lab, canary: boolean): Promise<LightsChecked> {
  holdHour(0);
  const putBack = canary ? flickersHeld() : null;
  try {
    G.player.walkTo = null;
    G.player.place(STAND, Math.PI);
    await lab.step(SETTLE);
    const list = torches();
    const lowest = list.map(() => Infinity);
    const highest = list.map(() => -Infinity);
    for (let frame = 0; frame < FRAMES; frame++) {
      await lab.step(1);
      list.forEach((torch, k) => {
        const strength = lampStrength(torch.lamp);
        lowest[k] = Math.min(lowest[k], strength);
        highest[k] = Math.max(highest[k], strength);
      });
    }
    const flames = flamesAt();
    const unlit = list.filter((torch) => !flames.some((flame) => flame.distanceTo(torch.at) < FIRE_NEAR));
    const sways = list.map((_, k) => (highest[k] - lowest[k]) / Math.max((highest[k] + lowest[k]) / 2, 1e-6));
    const still = sways.filter((sway) => sway < LEAST_SWAY).length;
    const least = Math.min(...sways);
    const lines = [
      `hall's torches: ${list.length - unlit.length} of ${list.length} with a fire by them`,
      `their lamps over ${FRAMES} frames: the least moved by ${(least * 100).toFixed(1)}% of its middle,`
        + ` ${still} under ${LEAST_SWAY * 100}%`,
    ];
    const problems: string[] = [];
    if (list.length === 0) problems.push('no torch in the hall');
    if (unlit.length > 0) problems.push(`${unlit.length} torches with no fire by them`);
    if (still > 0) problems.push(`${still} torches' light steady, no flicker`);
    if (canary) return { lines, problems: [], caught: still > 0, moments: [] };
    return { lines, problems, caught: null, moments: [] };
  } finally {
    putBack?.();
    holdHour(null);
  }
}
