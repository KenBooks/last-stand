// `lab village`'s steady lamps: the hero standing still on the square at midnight, the village's lamps (the street
// lamps' and torches', each an entry of the lamp list the engine lights them by, `core/lamps.ts`) frame by frame. A
// lamp burns steady: lit from the pool's lights, which flickered every light by a random tenth each frame for the
// spells' flashes, the lamps shimmered at the frame rate (from play: "lamps have high frequency flicker, I dont want
// that"). It read the pool's lights, which light no lamp since the engine draws the lamps from the list, and threw
// finding none lit. `canary` shakes a lamp's light by a tenth a frame, which must be found.
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { holdHour } from '../../../src/game/clock';
import type { LightsChecked } from './villageLights';
import { LAMPS_MOST, lampList } from '../../../src/core/lamps';

/** the frames the lamps are given to fade in, and the frames read */
const SETTLE = 120;
const READ = 60;
/** the most a lit lamp's light may change in a frame, as a share of it */
const MOST_CHANGE = 0.01;
/** the least a lamp's light (its colour's channels times its intensity, summed) must give to count as lit */
const LIT = 0.5;
/** how much the canary shakes a lamp's light by, a frame */
const SHAKE = 1.1;

/** Lamp `i`'s first float in the list (its place), and its light's (its colour times its intensity, its side). */
const placeAt = (i: number): number => (1 + i * 2) * 4;
const lightAt = (i: number): number => placeAt(i) + 4;

/** Lamp `i`'s light: its colour's channels summed, none if it's out. */
function lampLight(i: number): number {
  const at = lightAt(i);
  if (lampList[at + 3] === 0) return 0;
  return lampList[at] + lampList[at + 1] + lampList[at + 2];
}

/** The lamps lit now, each by its light. */
function litLamps(): Map<number, number> {
  const lit = new Map<number, number>();
  for (let i = 0; i < LAMPS_MOST; i++) {
    const light = lampLight(i);
    if (light > LIT) lit.set(i, light);
  }
  return lit;
}

/** Lamp `i`'s light shaken up by `SHAKE`, as the pool's flicker shook it. */
function shake(i: number): void {
  const at = lightAt(i);
  for (let channel = 0; channel < 3; channel++) lampList[at + channel] *= SHAKE;
}

/** Where lamp `i` stands, as a line says it. */
function placeOf(i: number): string {
  const at = placeAt(i);
  return [0, 1, 2].map((axis) => lampList[at + axis].toFixed(1)).join(', ');
}

/** The most any lamp lit `before` changed by in `now`, as a share of its light, and which. */
function mostChanged(before: Map<number, number>, now: Map<number, number>): { change: number; lamp: number } {
  let most = { change: 0, lamp: -1 };
  for (const [lamp, was] of before) {
    const is = now.get(lamp);
    const change = is === undefined ? 0 : Math.abs(is - was) / was;
    if (change > most.change) most = { change, lamp };
  }
  return most;
}

/** The village's lamps at midnight, the hero still: no lit lamp changing by over a hundredth a frame. */
export async function lampsSteady(lab: Lab, canary: boolean): Promise<LightsChecked> {
  holdHour(0);
  try {
    // (stood still where the checks before left him: walking, the nearest lamps hand their lights over, fading)
    G.player.walkTo = null;
    G.player.place(G.player.pos.clone(), G.player.facing);
    await lab.step(SETTLE);
    const at = G.player.pos.clone();
    const first = litLamps();
    if (!first.size) throw new Error('lab: village: no lamp lit at midnight');
    const shaken = [...first.keys()][0];
    let most = { change: 0, lamp: shaken };
    let before = first;
    for (let frame = 0; frame < READ; frame++) {
      // (shaken after the frame wrote the list and before it's read: the village writes every lamp each frame)
      await lab.step(1, undefined, canary ? () => shake(shaken) : undefined);
      const now = litLamps();
      const changed = mostChanged(before, now);
      if (changed.change > most.change) most = changed;
      before = now;
    }
    const moved = G.player.pos.distanceTo(at);
    if (moved > 0.05) throw new Error(`lab: village: the hero moved ${moved.toFixed(2)} m while the lamps were read`);
    const line = `lamps: ${first.size} lamps lit at midnight, the most one changed in a frame `
      + `${(most.change * 100).toFixed(1)}% (at ${placeOf(most.lamp)})`;
    const shimmers = most.change > MOST_CHANGE;
    const problems = shimmers && !canary ? [`${line}: a lamp flickers`] : [];
    return { lines: [line], problems, caught: canary ? shimmers : null, moments: [] };
  } finally {
    holdHour(null);
  }
}
