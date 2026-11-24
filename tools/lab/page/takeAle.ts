// A mug of the tavern's ale taken up and drunk as a player does it (from Kenneth's round 3: the mug waits on the
// counter, never handed over by itself; E takes the one the pointer is on; then Drink or Put down, by E and F or the
// buttons at the screen's foot): the mouse moved onto the mug where the screen shows it, E pressed, and once the
// choice shows, E again. `lab tavern`, its first-person case and `lab coop --scenarios tavern` take their ale so.
import { G } from '../../../src/state';
import { drinkChoice } from '../../../src/game/drinkChoice';
import { cursorRay, input } from '../../../src/core/input';
import type { TavernKeeper } from '../../../src/world/tavernKeeper';
import type { Frame, Lab } from './lab';

/** Runs `count` frames of the input given (a measure's own stepper, which reads its watch each frame, or the lab's). */
export type Stepper = (count: number, input: () => Frame) => Promise<unknown>;
const labSteps = (lab: Lab): Stepper => (count, input) => lab.step(count, input);

/** the frames the pointer is held on a mug before E is pressed (the camera's settling after a talk) */
const SETTLE = 45;

/** A full mug waiting on a top within `reach` m of this game's hero (the nearest), or -1. */
export function waitingMug(tv: TavernKeeper, reach = 1.3): number {
  const room = G.arena.rooms!.tavern.group;
  const at = room.worldToLocal(G.player.pos.clone());
  let best = -1, nearest = reach;
  for (const mug of tv.mugs.mugs) {
    if (mug.place.at !== 'bar' && mug.place.at !== 'table') continue;
    if (mug.full <= 0.5) continue;
    const apart = Math.hypot(mug.place.x - at.x, mug.place.z - at.z);
    if (apart < nearest) {
      nearest = apart;
      best = mug.id;
    }
  }
  return best;
}

/** Mug `id` (the nearest waiting one by default) taken up by E with the pointer on it (the lab's aim, which puts the
 *  mouse over a point every frame), held there a moment as the camera settles from the talk's view first. Whether a
 *  mug waited to be taken. */
/** what the game offered as the last take's E was pressed (said where a take fails) */
export let lastOffer = '';

export async function takeMug(lab: Lab, tv: TavernKeeper, id = waitingMug(tv), run: Stepper = labSteps(lab)): Promise<boolean> {
  if (id < 0) return false;
  // (the talk that asked for it put away first, as a player does: open, its card took the pointer over the bar)
  if (document.querySelector('#talk:not(.hidden)')) await run(1, () => ({ keys: ['Escape'], aim: tv.mugAt(id) }));
  await run(SETTLE, () => ({ aim: tv.mugAt(id) }));
  lastOffer = `offered ${tv.doing().offered} as E was pressed, the mouse at ${input.mouse.x.toFixed(0)},${input.mouse.y.toFixed(0)}, ray ${cursorRay() ? 'some' : 'none'}, aim ${input.aim ? 'set' : 'none'}, room ${G.arena.room}`;
  await run(1, () => ({ keys: ['e'], aim: tv.mugAt(id) }));
  return true;
}

/** The choice of the mug in his hand answered: Drink by E, Put down by F (one frame), if it's shown. */
export async function pickAle(lab: Lab, pick: 'drink' | 'down', run: Stepper = labSteps(lab)): Promise<boolean> {
  if (!drinkChoice.shown) return false;
  await run(1, () => ({ keys: [pick === 'drink' ? 'e' : 'f'] }));
  return true;
}

/** Whether the choice of what to do with the mug in his hand is shown. */
export const choosingAle = (): boolean => drinkChoice.shown;
