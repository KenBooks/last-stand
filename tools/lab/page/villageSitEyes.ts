// `lab village --only sitFromEyes` (#720, from play: "Sitting options should appear in all camera views", "Currently
// does not appear in first person"): through the eyes, the crosshair on a log by the campfire, the log must be outlined
// to sit on (`Sitting.pointed`), E must sit him on it, shown over the shoulder while he sits (`sitView` in `main.ts`:
// through his eyes his own seated body would fill the view), and a step must get him up and bring the eyes back. Said:
// the log, each of those, and the view at each. `canary` holds the sit off (`Player.sits`), as through the eyes it was
// held off: E must not sit him.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { pointerLocked } from '../../../src/core/input';
import { viewMode, viewSettled } from '../../../src/core/renderer';
import { groundHeight } from '../../../src/world/ground';
import { villageObject } from '../../../src/game/village';
import type { Seat } from '../../../src/world/seats';
import { satWhole, startOff } from './sit';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** the frames for the crosshair to come over the log, the most for the lock and for him to sit whole after E, the
 *  frames the stick is held, and the most for him to be up and through the eyes again */
const LOOKING = 30;
const LOCK_COMES = 60;
const SITS_BY = 900;
const STEP = 20;
const UP_BY = 240;

/** What the sit through the eyes did. */
interface FromEyes {
  line: string;
  outlined: boolean;
  sat: boolean;
  /** the view shown while he sat */
  satIn: string;
  /** up and through the eyes again after the step */
  backInEyes: boolean;
  moments: Pictured[];
}

/** The log nearest the campfire (a seat that isn't a fire's floor). */
function logByFire(): Seat {
  const fire = villageObject('campfire');
  if (!fire) throw new Error('lab: village: no campfire');
  let best: Seat | null = null;
  let bestD = Infinity;
  for (const seat of G.arena.seats) {
    if (seat.ground) continue;
    const d = Math.hypot((seat.ax + seat.bx) / 2 - fire.at[0], (seat.az + seat.bz) / 2 - fire.at[1]);
    if (d < bestD) {
      best = seat;
      bestD = d;
    }
  }
  if (!best) throw new Error('lab: village: no log by the campfire');
  return best;
}

/** The log's middle at its seat's height: where the crosshair is turned to. */
const logSight = (log: Seat): THREE.Vector3 => {
  const x = (log.ax + log.bx) / 2;
  const z = (log.az + log.bz) / 2;
  return new THREE.Vector3(x, groundHeight(x, z) + log.sit * 0.8, z);
};

/** Through the eyes off the log, the crosshair on it: outlined, E, sat, a step, up. */
async function sitThroughEyes(lab: Lab, log: Seat): Promise<FromEyes> {
  const { at, facing } = startOff(log);
  G.player.sitting.clear();
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(at[0], groundHeight(at[0], at[1]), at[1]), facing);
  await viewBy(lab, 'first');
  lab.pointerLock(true);
  // (a key the game doesn't use, the gesture the lock is taken on)
  await lab.press('KeyJ');
  await lab.until(() => pointerLocked(), LOCK_COMES, 'the pointer locked');
  const sight = logSight(log);
  await lab.step(LOOKING, () => ({ sight }));
  const outlined = G.player.sitting.pointed;
  const moments = [await lab.screen('through the eyes, the crosshair on the log', [outlined ? 'outlined: E Sit' : 'not outlined'])];
  await lab.press('KeyE');
  let sat = false;
  for (let frame = 0; frame < SITS_BY && !sat; frame++) {
    await lab.step(1);
    sat = satWhole(G.player.sitting.pose);
  }
  const satIn = viewMode();
  if (sat) moments.push(await lab.screen('sat on the log, from a sit begun through the eyes', [`shown ${satIn}`]));
  await lab.step(STEP, () => ({ keys: ['w'] }));
  await lab.until(() => !G.player.sitting.under && viewMode() === 'first' && viewSettled(), UP_BY, 'up and through the eyes');
  const backInEyes = !G.player.sitting.under && viewMode() === 'first';
  const line = `through the eyes, the crosshair on the log: ${outlined ? 'outlined' : 'not outlined'}, E ${sat ? 'sat him' : 'never sat him'}`
    + `${sat ? `, shown ${satIn} sat` : ''}; a step: ${backInEyes ? 'up, through the eyes again' : 'not back in the eyes'}`;
  return { line, outlined, sat, satIn, backInEyes, moments };
}

/** Through the eyes, a log is outlined and sat on by E, shown over the shoulder while he sits, the eyes back after. */
export async function sitFromEyes(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const log = logByFire();
  G.player.sits = !canary;
  try {
    const seen = await sitThroughEyes(lab, log);
    if (canary) return { lines: [seen.line], problems: [], caught: !seen.sat, moments: seen.moments };
    const problems: string[] = [];
    if (!seen.outlined) problems.push('sit from the eyes: the log under the crosshair wasn\'t outlined');
    if (!seen.sat) problems.push('sit from the eyes: E never sat him');
    if (seen.sat && seen.satIn !== 'third') problems.push(`sit from the eyes: shown ${seen.satIn} while he sat`);
    if (!seen.backInEyes) problems.push('sit from the eyes: a step didn\'t bring him up and the eyes back');
    return { lines: [seen.line], problems, caught: null, moments: seen.moments };
  } finally {
    G.player.sits = false;
    G.player.sitting.clear();
    await viewBy(lab, 'top');
    lab.pointerLock(false);
  }
}
