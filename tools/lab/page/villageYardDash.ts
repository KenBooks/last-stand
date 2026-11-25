// `lab village --only dashKeptInYard` (#870: "Bloodrush going out of bounds in training grounds"): the hero stood a
// metre inside each side of the training yard's fence, facing it, and sent through it in a dash at Bloodrush's speed
// (the warrior's bare-handed dash, the fastest a hero has: `range` m at `speed` m/s), held as long as the skill's. The
// fence keeps bodies off one hidden slab 0.12 m thick (`buildYard` in world/village.ts), and a dash moves him 0.45 m a
// frame at 60 a second and 1.45 m at its peak at 20, the slowest the game steps (main.ts holds a frame's time to
// 1/20 s): tested once a frame, his middle passed the slab's and was pushed off it on its far side. The dashes are
// run at 20 frames a second (`SLOW_FRAMES`, the lab's frame made that long), as a player's slow device runs them.
// Each dash must end with him inside the fence. Said: where each dash ended in the yard's own frame. `canary` tests the world once a
// frame again (`holdWorldSteps` in entities/player.ts), and a dash out must be found.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { YARD, worldToYard, yardToWorld, type Spot } from '../../../src/data/village';
import { CLASSES } from '../../../src/data/classes';
import { holdWorldSteps } from '../../../src/entities/player';
import { groundHeight } from '../../../src/world/ground';

/** how far inside the fence each dash starts (m) */
const START_IN = 1;
/** the frames a second the dashes are run at: the slowest the game steps, as its frame's time is held to 1/20 s */
const SLOW_FRAMES = 20;
/** the frames he settles in before a dash (the game steps by the frames' mean, `pacedStep`: the slow frames are
 *  let settle into it), and the frames after its end before where he is is read */
const SETTLE = 30;
const AFTER = 20;
/** the fence's sides, each as the yard's own point a dash starts from and the way it goes (unit, in the yard's frame);
 *  the north side's dash goes at its fence between the gate (`YARD.gateAt` - `gate`) and the west side */
const SIDES = [
  { side: 'north', from: [(YARD.gateAt - YARD.gate - YARD.halfX) / 2, -YARD.halfZ + START_IN], way: [0, -1] },
  { side: 'south', from: [0, YARD.halfZ - START_IN], way: [0, 1] },
  { side: 'east', from: [YARD.halfX - START_IN, 0], way: [1, 0] },
  { side: 'west', from: [-YARD.halfX + START_IN, 0], way: [-1, 0] },
  { side: 'corner', from: [YARD.halfX - START_IN, YARD.halfZ - START_IN], way: [Math.SQRT1_2, Math.SQRT1_2] },
] as const;

/** One dash's end: the side it went at, and where he stood after it in the yard's frame. */
interface DashEnd { side: string; at: Spot; inside: boolean }

/** What the check found, as the village's checks report it. */
interface Checked { lines: string[]; problems: string[]; caught: boolean | null }

/** Bloodrush's tuning as the warrior's data has it: its range (m) and speed (m/s). */
function bloodrush(): { range: number; speed: number } {
  const skill = CLASSES.warrior.skills.find((s) => s.impl === 'bloodrush');
  if (!skill?.range || !skill.speed) throw new Error('lab: village: the warrior has no Bloodrush to time a dash by');
  return { range: skill.range, speed: skill.speed };
}

/** A way in the yard's frame as the village's (the yard is turned about y). */
function worldWay([x, z]: readonly [number, number]): THREE.Vector3 {
  const [ox, oz] = yardToWorld(0, 0);
  const [wx, wz] = yardToWorld(x, z);
  return new THREE.Vector3(wx - ox, 0, wz - oz).normalize();
}

/** Whether a point of the yard's frame is inside its fence. */
const insideFence = ([x, z]: Spot): boolean => Math.abs(x) < YARD.halfX && Math.abs(z) < YARD.halfZ;

/** The hero sent from `from` along `way` in a dash at Bloodrush's speed, and where he stood once it had ended. */
async function dashAt(lab: Lab, side: string, from: readonly [number, number], way: readonly [number, number]):
  Promise<DashEnd> {
  const { range, speed } = bloodrush();
  const [x, z] = yardToWorld(from[0], from[1]);
  const dir = worldWay(way);
  const hero = G.player;
  hero.walkTo = null;
  hero.place(new THREE.Vector3(x, groundHeight(x, z), z), Math.atan2(dir.x, dir.z));
  await lab.step(SETTLE);
  const dur = range / speed;
  hero.startDash(dir, speed, dur);
  await lab.until(() => !hero.dash, Math.ceil(dur * SLOW_FRAMES) + 60, `the ${side} dash never ended`);
  await lab.step(AFTER);
  const at = worldToYard(hero.pos.x, hero.pos.z);
  return { side, at, inside: insideFence(at) };
}

/** Every side's dash ending inside the fence (tested once a frame, with `canary`, where one must end outside it). */
export async function dashKeptInYard(lab: Lab, canary: boolean): Promise<Checked> {
  holdWorldSteps(canary);
  const clock = window.__labClock;
  const frame = clock.frame;
  clock.frame = 1000 / SLOW_FRAMES;
  const ends: DashEnd[] = [];
  try {
    for (const { side, from, way } of SIDES) ends.push(await dashAt(lab, side, from, way));
  } finally {
    clock.frame = frame;
    holdWorldSteps(false);
  }
  const out = ends.filter((end) => !end.inside);
  const place = (end: DashEnd): string => `${end.side} ${end.at[0].toFixed(2)}, ${end.at[1].toFixed(2)}`;
  const lines = [
    `yard dashes at ${SLOW_FRAMES} frames a second: ${ends.length - out.length} of ${ends.length} ended inside the `
      + `fence (the yard's frame, half sides ${YARD.halfX} by ${YARD.halfZ}): ${ends.map(place).join('; ')}`,
  ];
  const problems = out.map((end) => `yard dashes: the ${end.side} dash went through the fence, ending at ${place(end)}`);
  return { lines, problems: canary ? [] : problems, caught: canary ? out.length > 0 : null };
}
