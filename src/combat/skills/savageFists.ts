// Savage Fists: the warrior with both hands empty (#400). Punches, the lead hand then the rear in turn, each striking
// what stands close before him, restoring Energy and building a stack of Frenzy as it lands (combat/frenzy.ts): less
// reach than a weapon's cut, about as much in a blow, and quicker the more Frenzy he has. (At full
// Frenzy every third blow was a two-fisted hammer, taken out: from play, "lets remove two handed strike under
// freenzy, it makes no sense, practically".)
// With a shield and no weapon the free hand punches alone (its style's tuning, lighter, and no Frenzy).
import { G } from '../../state';
import { particles, col } from '../../fx/particles';
import { addShake, rollView } from '../../core/renderer';
import { sfx } from '../../core/audio';
import { rand } from '../../util';
import { CLEAN_HIT, FRENZY, PUNCH_DRIVE } from '../../data/balance';
import { gainFrenzy } from '../frenzy';
import { sweep } from './cleave';
import type { InstantSkill, Needs } from './types';
import type { Enemy } from '../../entities/enemy';
import type { Player } from '../../entities/player';

type Def = Needs<'damage' | 'range' | 'arc' | 'knock'>;

/** how far the view through the eyes rolls with a punch's shoulders as it lands (rad) */
const ROLL = { jab: 0.018, cross: 0.04 };

/** casts whose punch is already heard (its air starts with the punch and peaks as the fist lands) */
const thrown = new WeakSet<object>();
/** each cast's turn so far: the way he faced last frame, and how far he has turned through the wind-up (rad, + to
 *  his left) */
const turns = new WeakMap<object, { last: number; sum: number }>();

/** each player's turning through his punches: game time it was last read, the way he faced then, and how fast he
 *  was turning (rad/s, + to his left) */
const turning = new WeakMap<Player, { at: number; facing: number; rate: number }>();
/** the hand each cast is thrown with, where his turning chose it (`handOf`) */
const hands = new WeakMap<object, number | undefined>();

/** His turning now, read once a frame of a punch (`dt` s). */
function readTurning(player: Player, dt: number): void {
  const was = turning.get(player);
  if (!was || G.time - was.at > 0.2) { turning.set(player, { at: G.time, facing: player.facing, rate: 0 }); return; }
  if (dt <= 0) return;
  const by = player.facing - was.facing, now = Math.atan2(Math.sin(by), Math.cos(by)) / dt;
  was.rate += (now - was.rate) * Math.min(1, dt * 10);
  was.facing = player.facing;
  was.at = G.time;
}

/**
 * The hand his punch being cast is thrown with: the one his turning is behind as it starts (+1 the lead hand's jab
 * as he turns to his right, -1 the rear hand's cross as he turns to his left: `PUNCH_DRIVE.lead`), so the same hand
 * again and again while he keeps turning one way; nothing where he isn't turning, and each hand takes its turn.
 */
function handOf(player: Player): number | undefined {
  const c = player.casting;
  if (!c || player.gear.shield) return undefined;
  if (hands.has(c)) return hands.get(c);
  const now = turning.get(player);
  const led = !!now && G.time - now.at < 0.2 && Math.abs(now.rate) >= PUNCH_DRIVE.lead;
  const hand = led ? (now.rate > 0 ? -1 : 1) : undefined;
  hands.set(c, hand);
  return hand;
}

/** Whether this punch is the lead hand's jab (else the rear hand's cross, every punch with a shield on the arm). */
const isJab = (player: Player): boolean => (player.model.swing ?? 1) > 0 && !player.gear.shield;

/**
 * What his body puts behind the punch landing now, as shares of its damage to add (`PUNCH_DRIVE`): `step` for walking
 * at the foe, `swipe` for the aim swung through the wind-up the way the punching hand travels.
 */
export function punchDrive(player: Player, facing: number): { step: number; swipe: number } {
  const pace = Math.max(1e-3, player.stats.moveSpeed);
  const ahead = (player.vel.x * Math.sin(facing) + player.vel.z * Math.cos(facing)) / pace;
  const turn = player.casting ? turns.get(player.casting)?.sum ?? 0 : 0;
  // (a cross comes round from his right, so a turn to his left is behind it; a jab's the other way)
  const with_ = (isJab(player) ? -turn : turn) / PUNCH_DRIVE.turn;
  const share = (x: number): number => Math.min(1, Math.max(0, x));
  return { step: PUNCH_DRIVE.step * share(ahead), swipe: PUNCH_DRIVE.swipe * share(with_) };
}

/** The colour of what flies off a blow at `frenzy` stacks: dust and sweat, hotter, then embers. */
export function heatOf(frenzy: number): number {
  return frenzy >= FRENZY.cap ? 0xff5a2a : frenzy >= FRENZY.slam ? 0xffa060 : 0xd8c8b0;
}

/** Where a fist lands on a foe: a puff of dust and sweat knocked off it (a blade's sparks are steel's), embers with
 *  the Frenzy hot. */
/** A punch's share of its damage on a foe whose edge is `gap` m from his middle: its clean hit's (`CLEAN_HIT`) at
 *  the end of the arm's reach, else whole. */
export const cleanHit = (gap: number): number => (gap >= CLEAN_HIT.from && gap <= CLEAN_HIT.to ? 1 + CLEAN_HIT.bonus : 1);

/**
 * A punch's extra chance of a critical hit on a foe whose edge is `gap` m from his middle, thrown with `drive` behind
 * it (`PUNCH_DRIVE.crit`, points of a hundred): a clean hit's, and the step's and the swing's by their shares. Any
 * punch's (from play: "or I guess for any punch,,, just LMB will be most affected by it"): Savage Fists' has all
 * three, Rampage's blows the first two, Pounce's landing the first.
 */
export function punchSharp(drive: { step: number; swipe: number }): (gap: number) => number {
  const C = PUNCH_DRIVE.crit;
  const edge = C.step * (drive.step / PUNCH_DRIVE.step) + C.swipe * (drive.swipe / PUNCH_DRIVE.swipe);
  return (gap) => edge + (cleanHit(gap) > 1 ? C.clean : 0);
}

export function fistMark(e: Enemy, frenzy = 0, n = 5): void {
  const hot = heatOf(frenzy);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = rand(1, 3.5);
    particles.glow.spawn({
      x: e.pos.x, y: e.height * 0.6, z: e.pos.z, vx: Math.cos(a) * s, vy: rand(0.5, 2.5), vz: Math.sin(a) * s,
      life: rand(0.15, 0.3), size: rand(0.05, 0.1), sizeEnd: 0, color: col(hot, 1.1), colorEnd: col(0x5a4a3a, 0.2),
      gravity: 9, drag: 3,
    });
  }
}

const skill: InstantSkill = {
  anim: 'punch',
  hits: (def) => [
    { per: 'foe', base: (def as Def).damage, type: 'physical' },
    { per: 'clean hit', base: (def as Def).damage * (1 + CLEAN_HIT.bonus), type: 'physical', note: 'at arm\'s length' },
    {
      per: 'driven hit', type: 'physical', note: 'clean, stepping in, the aim swung with the fist',
      base: (def as Def).damage * (1 + CLEAN_HIT.bonus) * (1 + PUNCH_DRIVE.step + PUNCH_DRIVE.swipe),
    },
  ],
  pose(player, _def, action) {
    const hand = handOf(player);
    if (hand !== undefined) action.hand = hand;
  },
  charging(player, _def, k, dt) {
    const c = player.casting;
    handOf(player);
    readTurning(player, dt);
    // (through his own eyes the view tips with his shoulders as they turn behind the blow, a cross's further than a
    // jab's: the frame held dead level, the arm went out from a body that never moved)
    if (player.local) rollView(((player.model.swing ?? 1) > 0 ? -ROLL.jab : ROLL.cross) * k * k);
    if (c && !thrown.has(c)) { thrown.add(c); sfx.punch(c.fireAt - c.t, -(player.model.swing ?? 1)); }
    if (c) {
      const turn = turns.get(c) ?? { last: player.facing, sum: 0 };
      const by = player.facing - turn.last;
      turn.sum += Math.atan2(Math.sin(by), Math.cos(by));
      turn.last = player.facing;
      turns.set(c, turn);
    }
  },
  cast(player, rawDef) {
    const def = rawDef as Def;
    // the way the body (and so the punch) faces, which turned to the target during the cast
    const facing = player.facing, dir = { x: Math.sin(facing), z: Math.cos(facing) };
    const heat = player.frenzy;
    // (a straight blow: what it kills goes back along it, struck through its middle; a clean hit at arm's length lands
    // harder, and throws twice the spray; harder again with his step and his turn behind it, `punchDrive`)
    const drive = punchDrive(player, facing), driven = 1 + drive.step + drive.swipe;

    const hits = sweep(player, def, facing, {
      knock: def.knock, blow: { dir, lift: 0.2 }, scale: (gap) => cleanHit(gap) * driven,
      sharp: punchSharp(drive),
      mark: (e, k) => fistMark(e, heat, 5 * (k > 1 ? 2 : 1)),
    });
    if (!hits) return;
    // (heavier as the Frenzy rises, a grunt now and then with a blow at high Frenzy)
    const hot = heat / FRENZY.cap;
    sfx.punchLand(-(player.model.swing ?? 1), hot);
    if (hot >= 0.5 && Math.random() < 0.3) sfx.grunt(hot);
    if (player.local) addShake(0.05 + 0.12 * (driven - 1));
    if (player.sandbox) return;
    player.energy = Math.min(player.stats.maxEnergy, player.energy + (def.gain ?? 0) * hits);
    gainFrenzy(player, def.frenzy ?? 0);
  },
};

export default skill;
