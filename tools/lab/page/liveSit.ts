// tools/lab live sit and hold: a moment of a hero getting up from a seat, held there to be looked at (`lab live`).
// `sit` sits him on a seat as `lab sit` does; `hold` gets him up and holds his hands' stage at a moment of it, so a
// keyed move of it (the warrior taking a two-hander up by a fire, `PICK` in `models/warrior.ts`) is pictured at that
// moment in under a second, its keys changed by `__tune` and looked at again without a boot. From the owner, of a
// motion that took days: "posing should take 10-20min".

import * as THREE from 'three';
import type { Fixture, Lab } from './lab';
import { CASES, satWhole, sitOn } from './sit';
import { fistsUpHandle, handleOf } from './sitAloft';
import { picture, type LivePicture } from './live';
import type { MocapMoment } from './mocap';

/** the lab's frames a second */
const RATE = 60;
/** the frames the key that gets him up is held for: a tap */
const TAP = 3;
/** the most a hold waits for his hands' stage to come down to it (s) */
const HOLD_MOST = 8;

/** The seat he was last sat on here, and the set-up he sat with, to sit him again for a moment gone by. */
let last: { seat: string; fixture: Fixture } | null = null;

/** `lab live sit`: the hero sat on `seat` (`lab sit`'s: log, stone, column, fire, brazier), set up as `fixture`. */
export async function sit(lab: Lab, seat: string, fixture: Fixture): Promise<string> {
  const seatCase = CASES.find((each) => each.name === seat);
  const seats = CASES.map((each) => each.name).join(', ');
  if (!seatCase) throw new Error(`live sit: no seat ${seat} (the seats: ${seats})`);
  lab.player.sitting.holdHands = null;
  const sat = await sitOn(lab, seatCase, { ...fixture, fresh: true });
  if (!sat) throw new Error(`live sit: he never sat by the ${seat}`);
  last = { seat, fixture };
  return `sat by the ${seat}`;
}

/** `lab live hold`: his getting up held where his hands' stage is `hands` (1 as his body is up, 0 done): sat on the
 *  seat afresh each time and got up from it to that moment. Taken from wherever the last hold left him, a hold sat him
 *  down again unasked or came out at another moment (asked for 0.45, held at 0.244). */
export async function hold(lab: Lab, hands: number): Promise<string> {
  await sitAgain(lab);
  // (read after sitting again: a fresh set-up builds him anew, and the last one's sitting was held and read instead)
  const sitting = lab.player.sitting;
  if (!satWhole(sitting.pose)) throw new Error('live hold: he was never sat to get up from');
  sitting.holdHands = hands;
  await lab.step(TAP, () => ({ keys: ['w'] }));
  // (held off sitting again: idle by the seat, the game sat him down again as he got up, and the hold never came)
  lab.player.sits = false;
  await lab.until(() => heldAt(lab, hands), HOLD_MOST * RATE, `live hold: his hands' stage at ${hands}`);
  await lab.step(1);
  const now = sitting.pose;
  return `held getting up: his body ${((now?.w ?? 0) * 100).toFixed(0)}% down, his hands' stage at `
    + `${(now?.before ?? 0).toFixed(3)}; ${fistsSaid(lab)}; ${weaponSaid(lab)}`;
}

/** The weapon's butt and the way it points from there in his frame, in the pick-up's keys' terms (`PICK` in
 *  `models/warrior.ts`: buttRight, buttUp, buttAhead in his units from his feet; wayLeft, wayUp, wayAhead), to key a
 *  moment from one the game already poses (the carry on his shoulder) without working it out by hand. */
function weaponSaid(lab: Lab): string {
  const handle = handleOf(lab);
  if (!handle) return 'no weapon';
  const root = lab.model.root;
  const facing = root.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
  const left = new THREE.Vector3(facing.z, 0, -facing.x);
  const scale = root.scale.y;
  const from = handle.butt.clone().sub(root.getWorldPosition(new THREE.Vector3())).divideScalar(scale);
  const way = handle.far.clone().sub(handle.butt).normalize();
  const fixed = (value: number) => value.toFixed(2);
  const butt = `buttRight=${fixed(-from.dot(left))},buttUp=${fixed(from.y)},buttAhead=${fixed(from.dot(facing))}`;
  const pointing = `wayLeft=${fixed(way.dot(left))},wayUp=${fixed(way.y)},wayAhead=${fixed(way.dot(facing))}`;
  return `its butt and way as keys: ${butt},${pointing}`;
}

/** `lab live holds`: his getting up held at each of `moments` in turn and pictured at each, a row of a sheet a
 *  moment, numbered: a keyed move's key poses shown in one step, to send as they are. */
export async function holds(lab: Lab, moments: number[], options: LivePicture):
  Promise<{ text: string; moments: MocapMoment[] }> {
  const rows: MocapMoment[] = [];
  const lines: string[] = [];
  for (const [i, hands] of moments.entries()) {
    const said = await hold(lab, hands);
    const { tiles } = await picture(lab, options);
    const label = `#${i + 1}: his hands' stage at ${hands}`;
    rows.push({ label, tiles, notes: [said] });
    lines.push(`${label}: ${said}`);
  }
  return { text: lines.join('\n'), moments: rows };
}

/** Each fist's gap to the handle it closes on, as words (a fist off its handle by more than a few cm isn't holding). */
function fistsSaid(lab: Lab): string {
  const fists = lab.model.fists ?? [];
  if (!fists.length) return 'no fist on a handle';
  const up = fistsUpHandle(lab);
  const along = (hand: 'left' | 'right') => {
    if (!up) return '';
    return `, ${((hand === 'right' ? up[0] : up[1]) * 100).toFixed(0)} cm up it`;
  };
  const said = fists.map((fist) => {
    const off = (fist.off * 100).toFixed(1);
    return `his ${fist.hand} fist ${off} cm off its handle${along(fist.hand)}`;
  });
  return said.join(', ');
}

/** Whether his hands' stage has come down to `hands` getting up, his body up. */
function heldAt(lab: Lab, hands: number): boolean {
  const pose = lab.player.sitting.pose;
  // (held at its end, it's over: his getting up done, no pose of it left)
  if (!pose) return hands <= 0;
  return pose.w <= 0 && pose.before <= hands + 1e-6;
}

async function sitAgain(lab: Lab): Promise<void> {
  if (!last) throw new Error('live hold: a moment gone by, and no seat to sit on again (live sit first)');
  await sit(lab, last.seat, last.fixture);
}
