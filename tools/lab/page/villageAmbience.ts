// `lab village --only ambienceHeard` (#745, "Add Day and Night Ambient Sound Effects (Birds, Crickets, Rustling
// Leaves, Fire Crackling)"): the levels the village's ambience asks of its layers (`ambienceNow` in
// `core/ambience.ts`, as `main.ts` asks them each frame) read at noon and at midnight on the square, and at noon beside
// the campfire: the wind always, the birds by day alone, the crickets by night alone, and the fire louder beside it
// than on the square. What they sound like is `lab sound ambienceDay,ambienceNight,ambienceFire`. `canary` holds noon
// for the midnight read too (the hour never reaching the ambience): its crickets must be missed.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { groundHeight } from '../../../src/world/ground';
import { holdHour, heldHour } from '../../../src/game/clock';
import { ambienceNow } from '../../../src/core/ambience';
import { CAMPFIRE } from '../../../src/data/village';
import type { LightsChecked } from './villageLights';

/** the frames each stand is held before it's read */
const SETTLE = 30;
/** where he stands on the square, and beside the campfire (m off its middle, along x) */
const SQUARE: [number, number] = [0, 4.5];
const BY_FIRE = 2;
/** a layer under this is silent, over it heard */
const HEARD = 0.001;

/** The layers' levels as asked at a stand. */
type Levels = ReturnType<typeof ambienceNow>;

/** He stands at (x, z) at `hour`, settled; the levels the ambience asks then. */
async function readAt(lab: Lab, [x, z]: [number, number], hour: number): Promise<Levels> {
  holdHour(hour);
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), 0);
  await lab.step(SETTLE);
  return { ...ambienceNow() };
}

/** A stand's levels said in a line. */
function said(where: string, levels: Levels): string {
  const layers = `wind ${levels.wind.toFixed(3)}, leaves ${levels.leaves.toFixed(3)}, birds ${levels.birds.toFixed(3)}`;
  const fire = `fire ${levels.fire.toFixed(3)} (pan ${levels.firePan.toFixed(2)})`;
  const more = `crickets ${levels.crickets.toFixed(3)}, ${fire}`;
  return `ambience ${where}: ${layers}, ${more}`;
}

/** The ambience by day, by night and beside the campfire, each layer where it belongs. */
export async function ambienceHeard(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const was = heldHour();
  try {
    const noon = await readAt(lab, SQUARE, 12);
    const night = await readAt(lab, SQUARE, canary ? 12 : 0);
    const fire = await readAt(lab, [CAMPFIRE[0] + BY_FIRE, CAMPFIRE[1]], 12);
    const lines = [
      said('at noon on the square', noon),
      said('at midnight on the square', night),
      said('at noon by the campfire', fire),
    ];
    const problems: string[] = [];
    if (noon.wind < HEARD || night.wind < HEARD) problems.push('ambience: no wind');
    if (noon.birds < HEARD) problems.push('ambience: no birds at noon');
    if (night.birds >= HEARD) problems.push('ambience: birds at midnight');
    if (night.crickets < HEARD) problems.push('ambience: no crickets at midnight');
    if (noon.crickets >= HEARD) problems.push('ambience: crickets at noon');
    if (fire.fire <= noon.fire * 2 || fire.fire < HEARD) {
      problems.push('ambience: the campfire no louder beside it than on the square');
    }
    const missedCrickets = problems.some((problem) => problem.includes('crickets at midnight'));
    if (canary) return { lines, problems: [], caught: missedCrickets, moments: [] };
    return { lines, problems, caught: null, moments: [] };
  } finally {
    holdHour(was);
    await lab.step(SETTLE);
  }
}
