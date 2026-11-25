// `lab village --only freeCamWhole`: the village from the developer mode's free camera, the hero in the hall of heroes
// and behind a cottage, from above, where the game's own view thins the most for him. Flown high over the village and
// low over him, the frame is drawn as flown and again with nothing thinned and no fog by the lab's own hand (every
// hole and ghost let go, the fog off): no pixel may differ. And low over him, looking down the meadow, its blades are
// drawn alone on black: the ground 60 m and more from him where grass grows must show them. From play (#616): "in free
// cam mode, there is a circle beyond which grass disappears, it should not", "also in free cam we should not thin
// anything". `canary` flies the free camera as it was, the game's view's rules left on (`core/wholeView.ts` let go).
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { COTTAGES, HALL, TERRACE } from '../../../src/data/village';
import { COTTAGE } from '../../../src/world/villagePlan';
import { holdHour } from '../../../src/game/clock';
import { faceCamera, viewMode } from '../../../src/core/renderer';
import { updateSeeThrough } from '../../../src/core/seeThrough';
import { SIGHT } from '../../../src/core/sight';
import { setWholeView } from '../../../src/core/wholeView';
import { groundHeight } from '../../../src/world/ground';
import type { MeadowMask } from '../../../src/world/meadow';
import { drawFrame, type Canvas } from './light';
import { endFlight, flewFrom, flyTo, takeFlight, type Flown } from './perfFly';
import { groundUnder, hiddenAround } from './villageGrassRing';
import { changedShare, viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';
import { nothingThinned } from './nothingThinned';

/** the frames given to settle where he stands (what thins for him fades over a second; the fog eases in) */
const SETTLE = 90;
/** how far in from the hall's door he stands, and how far out of a cottage's back wall (m) */
const IN_FROM_DOOR = 7;
const OUT_OF_WALL = 1.5;
/** high over the village, all of it in the frame */
const HIGH: Flown = { pos: new THREE.Vector3(0, 70, 45), yaw: 0, pitch: -1 };
/** low over him: how high (m: under the height the ring from above draws its near blades, 35 m out), and how far
 *  down it looks along the meadow (rad) */
const LOW_UP = 25;
const LOW_PITCH = -0.3;
/** the most of a frame's pixels that may differ from the frame with nothing thinned (the frames are drawn alike) */
const MOST_THINNED = 0.0005;
/** the grass read: the ground this far from him and more (m), every this many pixels each way, where grass grows on
 *  every side (the mask's cells, m); a pixel lit by a blade (black is none); the fewest pixels that make a reading
 *  and the least of them that must show blades */
const FAR = 60;
const STEP = 3;
const MASK_CELL = 1;
const LIT = 0.004;
const FEWEST = 300;
// (0.93 to 0.97 as it's read: the rest is the ground between the far blades; none at all unfixed)
const LEAST_GRASS = 0.8;

/** Where he stands for a reading. */
interface Stand { name: string; at: [number, number] }

function stands(): Stand[] {
  const cottage = COTTAGES[0];
  const out = COTTAGE.d / 2 * cottage.size + OUT_OF_WALL;
  return [
    { name: 'in the hall', at: [TERRACE.x, HALL.door - IN_FROM_DOOR] },
    { name: 'behind a cottage', at: [cottage.x - Math.sin(cottage.facing) * out, cottage.z - Math.cos(cottage.facing) * out] },
  ];
}

/** Low over him, looking down the meadow past its middle. */
function lowOver(him: THREE.Vector3): Flown {
  const away = Math.hypot(him.x, him.z) || 1;
  // (a yaw's forward is (-sin, -cos): toward the meadow's middle from him)
  return { pos: new THREE.Vector3(him.x, him.y + LOW_UP, him.z), yaw: Math.atan2(him.x / away, him.z / away), pitch: LOW_PITCH };
}

/** The free camera flown to `flown` and a frame run from there. */
async function flownTo(lab: Lab, flown: Flown): Promise<void> {
  flyTo(flown);
  await lab.step(2);
  if (!flewFrom(flown)) throw new Error('lab: village: the free camera never flew where it was put');
}

/** The share of the frame's pixels that differ from the frame with nothing thinned for him and no fog, each let go
 *  at once by the lab's own hand; the game's own are set again by its next frame. */
function thinnedShare(lab: Lab): number {
  const flown = drawFrame(lab);
  const him = G.player.pos;
  const fog = SIGHT.uSightOn.value;
  const putBack = nothingThinned();
  updateSeeThrough(him.x, him.y, him.z, 0, 0);
  SIGHT.uSightOn.value = 0;
  try {
    return changedShare(flown, drawFrame(lab));
  } finally {
    SIGHT.uSightOn.value = fog;
    putBack();
  }
}

/** The meadow's blades drawn alone on black, as flown. */
function bladesAlone(lab: Lab): Canvas {
  const meadow = G.scene.getObjectByName('meadow');
  if (!meadow) throw new Error('lab: village: no meadow in the scene');
  const hidden = hiddenAround(meadow);
  const background = G.scene.background;
  for (const object of hidden) object.visible = false;
  G.scene.background = null;
  try {
    return drawFrame(lab);
  } finally {
    for (const object of hidden) object.visible = true;
    G.scene.background = background;
  }
}

/** The grass on the ground `FAR` m and more from `him`: the pixels read there, where grass grows, and the share of
 *  them a blade lights. */
function farGrass(lab: Lab, him: THREE.Vector3): { read: number; share: number } {
  const canvas = bladesAlone(lab);
  const mask = G.scene.getObjectByName('meadow')!.userData.mask as MeadowMask;
  const grown = mask.grassCells(MASK_CELL, 0);
  const cellAt = (v: number): number => Math.floor((v + mask.half) / grown.cell);
  // (grass on every side of it: at the meadow's edges and by a lane the blades are thinned out)
  const grows = (x: number, z: number): boolean => {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = cellAt(x) + dx, cz = cellAt(z) + dz;
        if (cx < 0 || cz < 0 || cx >= grown.n || cz >= grown.n || !grown.has[cz * grown.n + cx]) return false;
      }
    }
    return true;
  };
  const ray = new THREE.Ray();
  const ground = new THREE.Vector3();
  let read = 0, lit = 0;
  for (let y = 0; y < canvas.height; y += STEP) {
    for (let x = 0; x < canvas.width; x += STEP) {
      if (!groundUnder(canvas, x, y, ray, ground)) continue;
      if (Math.hypot(ground.x - him.x, ground.z - him.z) < FAR || !grows(ground.x, ground.z)) continue;
      const at = (y * canvas.width + x) * 4;
      read++;
      if ((canvas.pixels[at] + canvas.pixels[at + 1] + canvas.pixels[at + 2]) / 3 > LIT) lit++;
    }
  }
  return { read, share: read ? lit / read : 0 };
}

/** The village whole from the free camera, wherever he stands: nothing thinned, no fog, grass far from him. */
export async function freeCamWhole(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const kept = viewMode();
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  let grassRead = false;
  holdHour(12);
  try {
    await viewBy(lab, 'top');
    faceCamera(Math.PI);
    for (const stand of stands()) {
      const [x, z] = stand.at;
      G.player.walkTo = null;
      G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), 0);
      await lab.step(SETTLE);
      takeFlight();
      // (the free camera as it was: the game's own view's thinning, fog and grass under it)
      if (canary) setWholeView(false);
      try {
        const him = G.player.pos.clone();
        await flownTo(lab, HIGH);
        const high = thinnedShare(lab);
        await lab.step(1);
        if (!canary) moments.push(await lab.screen(`from the free camera, the hero ${stand.name}`, []));
        await flownTo(lab, lowOver(him));
        const low = thinnedShare(lab);
        await lab.step(1);
        const grass = farGrass(lab, him);
        const percent = (share: number): string => `${(share * 100).toFixed(2)}%`;
        lines.push(`the hero ${stand.name}: ${percent(high)} of the frame thinned or fogged from high up, ${percent(low)} `
          + `from low over him; grass on ${percent(grass.share)} of the meadow ${FAR} m and more from him (${grass.read} pixels)`);
        for (const [from, share] of [['high up', high], ['low over him', low]] as const) {
          if (share > MOST_THINNED) problems.push(`the hero ${stand.name}, from ${from}: ${percent(share)} of the frame thinned or fogged`);
        }
        if (grass.read >= FEWEST) {
          grassRead = true;
          if (grass.share < LEAST_GRASS) {
            problems.push(`the hero ${stand.name}: grass on ${percent(grass.share)} of the meadow ${FAR} m and more from him`);
          }
        }
      } finally {
        endFlight();
      }
      await lab.step(1);
    }
    if (!grassRead) problems.push(`no stand had ${FEWEST} pixels of meadow ${FAR} m from the hero to read`);
  } finally {
    holdHour(null);
    await viewBy(lab, kept);
  }
  if (canary) return { lines, problems: [], caught: problems.length > 0, moments: [] };
  return { lines, problems, caught: null, moments };
}
