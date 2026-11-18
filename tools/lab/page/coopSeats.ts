// `lab coop --scenarios seats`' side on each page (node/coopSeats.mjs): a seat a partner sits on can't be used (from
// the owner: "need to check if another player is already sitting, if yes, then cannot use an object", "it should work
// in coop ofc (in village)"). The guest sits on a log round the village's campfire; the host, by it, points at it.
import * as THREE from 'three';
import { G } from '../../../src/state';
import { SIT } from '../../../src/entities/sitting';
import { seatTopAt, type Seat } from '../../../src/world/seats';
import { groundHeight } from '../../../src/world/ground';
import { faceCamera, settleCamera } from '../../../src/core/renderer';
import { startOff } from './sit';
import type { Lab } from './lab';

/** how high over a seat's top the pointing ray starts (m): straight down onto it, as a cursor over it from above */
const RAY_OVER = 3;
/** the frame's step the host's pointing is followed by (s) */
const STEP = 1 / 60;

/** The village's seat `index` that isn't the floor round a fire (the campfire's logs, in the order they're built). */
function seatOf(index: number): Seat {
  const seat = G.arena.seats.filter((s) => !s.ground)[index];
  if (!seat) throw new Error(`lab: coop seats: the village has no seat ${index}`);
  return seat;
}

/** This game's hero stood off seat `index`, facing it, his camera behind him. */
export function coopStandBySeat(_lab: Lab, { index }: { index: number }): void {
  const { at, facing } = startOff(seatOf(index));
  G.player.walkTo = null;
  G.player.sitting.clear();
  G.player.place(new THREE.Vector3(at[0], groundHeight(at[0], at[1]), at[1]), facing);
  faceCamera(facing);
  settleCamera(G.player.pos);
}

/** This game's hero let sit on seat `index` by himself once idle (as `lab sit` sits him: E is the host's to test). */
export function coopSitOn(_lab: Lab, { index }: { index: number }): void {
  SIT.auto = true;
  G.player.sitting.only = seatOf(index);
  G.player.sits = true;
}

/** This game's hero up off his seat at once, and held from sitting again. */
export function coopStandUp(): void {
  G.player.sits = false;
  G.player.sitting.clear();
}

/** Whether this game's hero is sat whole, and how far down its partners' copies are (the share their games report). */
export interface SeatsSeen { sat: boolean; partners: number[] }

export function coopSeatsSeen(): SeatsSeen {
  const pose = G.player.sitting.pose;
  const partners = G.players.filter((p) => !p.local).map((p) => p.remote.sit.w);
  return { sat: !!pose && pose.w >= 1 && pose.after >= 1, partners };
}

/** Seat `index` pointed at by this game's hero as a cursor over its middle points: whether it's outlined for him to
 *  sit on. `canary`: the partners' reported sits taken away first (as a game that never read them), which must leave
 *  it outlined. */
export function coopPointAtSeat(_lab: Lab, { index, canary = false }: { index: number; canary?: boolean }): boolean {
  if (canary) for (const p of G.players) if (!p.local) p.remote.sit.w = p.remote.sit.before = 0;
  const seat = seatOf(index);
  const x = (seat.ax + seat.bx) / 2, z = (seat.az + seat.bz) / 2;
  const from = new THREE.Vector3(x, seatTopAt(seat, x, z) + RAY_OVER, z);
  const ray = new THREE.Ray(from, new THREE.Vector3(0, -1, 0));
  const sitting = G.player.sitting;
  sitting.point(G.player, ray, STEP, true);
  const lit = sitting.pointed;
  // (left as it was: the next frame's pointing follows the real cursor again)
  sitting.point(G.player, null, STEP, true);
  return lit;
}
