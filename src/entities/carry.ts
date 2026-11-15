// Foes swept up by a hero's charge (Bull Rush): each one it meets carried before him to the charge's stop, kept
// clear of his body, then thrown on ahead from there through the air, fanned out by where across the charge it rode,
// and dazed where it lands; an elite or a boss is shoved on instead (entities/enemy.ts `carry`, `toss`). The fallen
// in its way, a foe it killed among them, ride before it on its field (`ploughOf`) and are thrown on as it stops
// (`throwPloughed`). Thrown off its line as it was met, a foe the charge ran on past ended behind or beside the hero
// as he stopped, and through the eyes the camera stood inside the one it met.
import { G } from '../state';
import { CARRY } from '../data/balance';
import { GRAVITY, type Field } from './ragdoll';
import { blastCorpses } from './corpse';
import type { XZ } from '../types';
import type { Player } from './player';

/** A foe carried before a charge: by whom, the charge's way (along the ground, its length 1), until when by the clock
 *  (`G.time`), the dash it rides as its game plays it (none seen yet: by the clock alone), and how hard it is thrown
 *  as it's let go, as a multiple of a charge's throw (`carryOf`). */
export interface Carry {
  by: Player; way: XZ; until: number; dash: Player['dash']; power: number;
  /** swung round its hero by its feet (Living Flail): how far it's tipped back (rad, its top away from him) and how
   *  high it's held (m), set by each game's own tick of the skill */
  swung?: { tilt: number; lift: number };
}

/**
 * A carry along `way`, whose length says how hard its throw is: 1 a charge's, more a harder one (Heave's). Co-op
 * sends a carry's way as it is (`net/sync.ts`), so every game throws as hard with no message of its own; a length
 * within a hundredth of 1 (the report's rounding) is a charge's.
 */
export function carryOf(by: Player, way: XZ, until: number): Carry {
  const length = Math.hypot(way.x, way.z) || 1;
  const power = Math.abs(length - 1) < 0.02 ? 1 : length;
  return { by, way: { x: way.x / length, z: way.z / length }, until, dash: by.dash, power };
}

/** Whether `carry`'s charge still runs: its hero's dash until it stops, as this game plays it (a partner's copy of him
 *  too, a little later than his own game: by the clock, the host let go of what a guest's charge carried 50 to 100 ms
 *  before his copy stopped, and threw it 2.5 m short of where the guest's own game did), or by the clock where none
 *  is seen; `CARRY.late` past the clock at most. */
export function carrying(carry: Carry): boolean {
  if (!carry.by.active) return false;
  const dash = carry.dash;
  if (!dash) return G.time < carry.until;
  return carry.by.dash === dash && dash.t < dash.dur && G.time < carry.until + CARRY.late;
}

/** A carry given this long or less (s) is let go at once (`Enemy.carry`): a foe swung, as its hero lets go. More than
 *  nothing, as co-op's report of a carry with no time is no carry at all (`net/sync.ts`): given none, the host never
 *  heard a guest let go, and threw the foe when its own carry ran out, half a second on and another way. */
export const LET_GO = 0.02;

/** A foe thrown through the air: its height over the ground and its rise (m, m/s), its way along the ground (m/s),
 *  and how long it's been up and will be (s). */
export interface Toss { y: number; vy: number; vx: number; vz: number; t: number; flight: number }

/** `pos`, a foe of `radius`, kept before `carry`'s hero: its body at least `CARRY.gap` clear of his along the way,
 *  where it is across it. */
export function placeBefore(pos: XZ, radius: number, carry: Carry): void {
  const { by, way } = carry;
  const dx = pos.x - by.pos.x, dz = pos.z - by.pos.z;
  const along = Math.max(dx * way.x + dz * way.z, by.radius + radius + CARRY.gap);
  const across = dx * way.z - dz * way.x;
  pos.x = by.pos.x + way.x * along + way.z * across;
  pos.z = by.pos.z + way.z * along - way.x * across;
}

/** A foe as a charge carries it: where it is, its size, and its carry. */
export interface Riding { pos: XZ; radius: number; carried: Carry | null }

/**
 * The foes riding before `by`'s charge kept off each other along its way, the nearest him first: each one across
 * its line from another nearer him kept behind that one no nearer than their bodies' clearance (left to be pushed
 * apart, one carried into the next foe ahead was shoved out sideways off it, 60 to 70 cm in a frame).
 */
export function stackBefore(by: Player, riding: Riding[]): void {
  const way = riding[0]?.carried?.way;
  if (!way) return;
  const along = (foe: Riding) => (foe.pos.x - by.pos.x) * way.x + (foe.pos.z - by.pos.z) * way.z;
  const across = (foe: Riding) => (foe.pos.x - by.pos.x) * way.z - (foe.pos.z - by.pos.z) * way.x;
  riding.sort((a, b) => along(a) - along(b));
  for (let i = 1; i < riding.length; i++) {
    const foe = riding[i];
    const side = across(foe);
    let ahead = along(foe);
    for (let j = 0; j < i; j++) {
      const nearer = riding[j];
      const reach = foe.radius + nearer.radius;
      const off = Math.abs(side - across(nearer));
      if (off < reach) ahead = Math.max(ahead, along(nearer) + Math.sqrt(reach * reach - off * off));
    }
    foe.pos.x = by.pos.x + way.x * ahead + way.z * side;
    foe.pos.z = by.pos.z + way.z * ahead - way.x * side;
  }
}

/** Whether `foe` touches one of `riding` (its body within `slack` m of one's). */
export function touchesAny(foe: Riding, riding: readonly Riding[], slack: number): boolean {
  return riding.some((one) => Math.hypot(one.pos.x - foe.pos.x, one.pos.z - foe.pos.z) <= one.radius + foe.radius + slack);
}

/** The throw on ahead that a foe of `radius` at `pos` gets as `carry`'s charge stops (m/s): along the way, fanned
 *  out by where across it the foe rode, and up. */
export function throwOf(pos: XZ, radius: number, carry: Carry): { vx: number; vz: number; vy: number } {
  const { by, way } = carry;
  const across = (pos.x - by.pos.x) * way.z - (pos.z - by.pos.z) * way.x;
  const fan = Math.max(-1, Math.min(1, across / (by.radius + radius))) * CARRY.fan;
  const x = way.x + way.z * fan, z = way.z - way.x * fan, len = Math.hypot(x, z);
  // (a harder throw goes faster and a little higher: as much higher, it hung in the air)
  const lift = CARRY.lift * (1 + (carry.power - 1) * CARRY.higher);
  return { vx: (x / len) * CARRY.throw * carry.power, vz: (z / len) * CARRY.throw * carry.power, vy: lift };
}

/** A co-op guest's copy its own hero's charge threw is held where it landed until the host's reports have it within
 *  `near` m (or `longest` s at most), then eased onto them: eased at once from where its own game let go of it, onto
 *  reports that came 0.4 s behind, it slid back towards where it was met, 1.2 m a frame, and on again. */
export const HAND_OFF = { near: 0.6, longest: 1.5 };

/** A toss begun at `vx`, `vz` and `vy` (m/s), up as long as its rise takes to come down again. */
export const tossOf = (vx: number, vz: number, vy: number): Toss => ({ y: 0, vy, vx, vz, t: 0, flight: (2 * vy) / GRAVITY });

/** `toss` on by `dt` s, falling as the bodies do (entities/ragdoll.ts): whether it has landed. */
export function flown(toss: Toss, dt: number): boolean {
  toss.t += dt;
  toss.y += toss.vy * dt;
  toss.vy -= GRAVITY * dt;
  if (toss.y > 0) return false;
  toss.y = 0;
  return true;
}

/** Whether `x`, `z` is in `by`'s charge's way along `way`: from his back to `CARRY.reach` past his body, and as wide
 *  as what it meets either side (as wide as his body alone, a foe it killed off its line was left lying where it fell
 *  and the charge ran on past it, 1.35 m on). */
function inWay(by: Player, way: XZ, x: number, z: number): boolean {
  const dx = x - by.pos.x, dz = z - by.pos.z;
  const along = dx * way.x + dz * way.z;
  if (along < -by.radius || along > by.radius + CARRY.reach) return false;
  return Math.abs(dx * way.z - dz * way.x) <= by.radius + CARRY.wide;
}

/** The charge's field on the fallen (entities/corpse.ts `addField`) while `on` says it runs: each part of a body in
 *  its way (`inWay`), held along `way` to a little faster than `by` goes, so it rides before him and slows with him as
 *  he skids. */
export function ploughOf(by: Player, way: XZ, on: () => boolean): Field {
  return {
    accel(p, v, out) {
      if (!on() || p.y > CARRY.high || !inWay(by, way, p.x, p.z)) return false;
      const want = by.vel.x * way.x + by.vel.z * way.z + CARRY.ahead;
      const push = (want - (v.x * way.x + v.z * way.z)) * CARRY.grip;
      out.x += way.x * push;
      out.z += way.z * push;
      return true;
    },
  };
}

/** The fallen riding before `by`'s charge as it stops thrown on along `way`, as the living are (`throwOf`): set
 *  going so, not added to the way they rode (it stops from a third of its speed: added, a body slid 15 m on). */
export function throwPloughed(by: Player, way: XZ): void {
  const round = Math.hypot(by.radius + CARRY.reach, by.radius + CARRY.wide);
  const where = (hips: XZ) => inWay(by, way, hips.x, hips.z);
  blastCorpses(by.pos, round, CARRY.throw, { dir: way, lift: CARRY.lift / CARRY.throw, set: true, where });
}

/** How far back a thrown foe tips (rad: its top away from the hero it faced), through its flight and onto its feet. */
export const tipOf = (toss: Toss): number => -CARRY.tilt * Math.sin(Math.PI * Math.min(1, toss.t / toss.flight));
