// Savage Fists: the warrior with both hands empty (#400). Punches, the lead hand then the rear in turn, each striking
// what stands close before him, restoring Energy and building a stack of Frenzy as it lands (combat/frenzy.ts): less
// reach than a weapon's cut, about as much in a blow, and quicker the more Frenzy he has. (At full
// Frenzy every third blow was a two-fisted hammer, taken out: from play, "lets remove two handed strike under
// freenzy, it makes no sense, practically".)
// With a shield and no weapon the free hand punches alone (its style's tuning, lighter, and no Frenzy).
import * as THREE from 'three';
import { G } from '../../state';
import { particles, col } from '../../fx/particles';
import { addShake, liftView, rollView } from '../../core/renderer';
import { sfx } from '../../core/audio';
import { rand } from '../../util';
import { CLEAN_HIT, FRENZY, HEAD_SHOT, PUNCH_CHARGE, PUNCH_DRIVE, PUNCH_WIDE } from '../../data/balance';
import { schedule } from '../../core/timers';
import { dazeEnemy } from '../damage';
import { strikesBody } from '../strikes';
import type { SkillDef } from '../../types';
import { gainFrenzy } from '../frenzy';
import { sweep } from './cleave';
import type { InstantSkill, Needs } from './types';
import type { Enemy } from '../../entities/enemy';
import type { Player } from '../../entities/player';

type Def = Needs<'damage' | 'range' | 'arc' | 'knock'>;

/** the share of the pose's time the gather takes, before the blow (the model's `JAB_OUT`, `CROSS_OUT`), and how long
 *  after the button is let go the fist lands (s): the hit waits for it */
const GATHER = 0.38, STRIKE = 0.055;

/** How far the fist is cocked back by the jaw at `share` of the draw: all the way within `COCK` of the draw past a
 *  click's, at once, so the hand that charges shows (from play: "he should instantly pull back... so its clear which
 *  hand is charging", "pulling back means cocking the hand near jaw, as boxers do"); a click hardly cocks it. */
const COCK = 0.05;
/** a charged punch through his own eyes: how far the view tips towards the chambered hand's side (rad) and sinks (m) */
const LOAD = { roll: 0.045, sink: 0.04 };
const cockOf = (def: SkillDef, share: number): number =>
  Math.min(1, Math.max(0, (share - (def.minDraw ?? 0)) / COCK));

/** How far a punch let go at `power` of its draw was charged past a click (0..1). */
const chargeOf = (def: SkillDef, power: number): number => {
  const least = def.minDraw ?? 0;
  return Math.min(1, Math.max(0, (power - least) / Math.max(1e-3, 1 - least)));
};

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
  // (his turning now, over the time a punch swings: held to charge, the wind-up is as long as he likes)
  const now = turning.get(player);
  const turn = now && G.time - now.at < 0.2 ? now.rate * PUNCH_CHARGE.swing : 0;
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

/** a clean punch charged to the full, over a plain click's */
const CHARGED = (1 + CLEAN_HIT.bonus) * PUNCH_CHARGE.full;

const skill: InstantSkill = {
  anim: 'punch',
  hits: (def) => [
    { per: 'foe', base: (def as Def).damage, type: 'physical' },
    { per: 'clean hit', base: (def as Def).damage * (1 + CLEAN_HIT.bonus), type: 'physical', note: 'at arm\'s length' },
    // (a charged punch from a plain click's up, `least`, to a clean one held to the full: what a punch thrown standing
    // lands, which `lab tooltips --gear bare` holds every hit to and asks one at its full figure of. His step and his
    // swing add to any of the three, up to `PUNCH_DRIVE`'s shares more: said in the skill's own words, not as a line
    // of figures no punch thrown standing reaches)
    {
      per: 'charged hit', type: 'physical', note: `held up to ${def.draw ?? 2} s, at arm's length`,
      base: (def as Def).damage * CHARGED, least: 1 / CHARGED,
    },
  ],
  pose(player, def, action) {
    const hand = handOf(player);
    if (hand !== undefined) action.hand = hand;
    // (the pose's time is the punch's own: gathered as the button goes down, held there with the fist drawn back
    // further the longer it's charged, `draw`, and thrown as it's let go)
    const c = player.casting;
    if (!c?.drawT) return;
    const least = def.minDraw ?? 0;
    if (!c.fired) {
      const share = Math.min(1, c.t / c.drawT);
      action.t = GATHER * Math.min(1, share / Math.max(1e-3, least));
      action.draw = cockOf(def, share);
      return;
    }
    const after = Math.min(1, (c.t - c.fireAt) / Math.max(1e-3, c.dur - c.fireAt));
    action.t = GATHER + (1 - GATHER) * after;
    action.draw = cockOf(def, c.power ?? 0);
  },
  charging(player, def, k, dt) {
    handOf(player);
    readTurning(player, dt);
    // (held to charge, through his own eyes: his shoulders turn back with the hand he chambers and he sinks a little
    // onto his rear leg, as a body loads a blow, so the view tips towards that side and drops; the fist itself is
    // under the view)
    if (!player.local) return;
    const cocked = cockOf(def, k);
    rollView((isJab(player) ? 1 : -1) * LOAD.roll * cocked);
    liftView(-LOAD.sink * cocked);
  },
  cast(player, rawDef, _target, power = 0) {
    // (let go: the fist is thrown, and lands a moment on)
    sfx.punch(STRIKE, -(player.model.swing ?? 1));
    schedule(STRIKE, () => land(player, rawDef as Def, chargeOf(rawDef, power)));
  },
};

const _from = new THREE.Vector3(), _way = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
/** how far behind where the punch starts its line is begun (m: a body he stands against is met from outside it),
 *  and the fist's half breadth, the lines either side of its middle (m) */
const LINE_BACK = 0.6;
/** where on each foe the punch landing now met its body: how high over its feet (m) */
const landed = new WeakMap<Enemy, number>();

/**
 * Whether the punch landing now meets `e`'s body, and where (`landed`): the fist's line from his shoulder the way
 * it's thrown, to the skill's reach, against the body as drawn (`strikesBody`, as an arrow's flight is), its middle
 * and either edge of the fist's breadth (`PUNCH_WIDE`). Through his own eyes the line is the crosshair's; from
 * outside it's level along his facing at the height of the foe's chest, his own shoulders' at the most. A foe whose
 * middle the line passed within its size of was struck, and a fist thrown past a dummy he stood against struck it
 * (from play: "this should be no hit ... and it crits somehow", "and this should be no hit").
 */
function meetsBody(player: Player, def: Def, e: Enemy): boolean {
  if (player.eyes) {
    G.camera.getWorldPosition(_from); G.camera.getWorldDirection(_way);
    _from.y -= 0.1;
  } else {
    const base = e.obj.position.y;
    _from.set(player.pos.x, base + Math.min(1.35, e.height * 0.7), player.pos.z);
    _way.set(Math.sin(player.facing), 0, Math.cos(player.facing));
  }
  const reach = def.range + e.radius, sideX = _way.z, sideZ = -_way.x;
  for (const off of [0, PUNCH_WIDE, -PUNCH_WIDE]) {
    _a.copy(_from).addScaledVector(_way, -LINE_BACK); _a.x += sideX * off; _a.z += sideZ * off;
    _b.copy(_from).addScaledVector(_way, reach); _b.x += sideX * off; _b.z += sideZ * off;
    const t = strikesBody(e, _a, _b);
    if (t < 0 || t * (reach + LINE_BACK) < LINE_BACK - 0.15) continue;
    landed.set(e, _a.y + (_b.y - _a.y) * t - e.obj.position.y);
    return true;
  }
  return false;
}

/** Whether the punch landing now met `e` on its head (`HEAD_SHOT`, `meetsBody`): a critical hit, a training
 *  dummy's too. Where the blow lands, not where the aim is (from play: "aim should not matter, where hit lands
 *  matters... because we have direction now"). */
function toHead(e: Enemy): boolean {
  const up = landed.get(e);
  return up !== undefined && up >= e.height * HEAD_SHOT.from && up <= e.height * HEAD_SHOT.to;
}

/** The punch lands, charged `charge` of the way past a click (0..1). */
function land(player: Player, def: Def, charge: number): void {
    if (!player.alive) return;
    const full = charge >= 0.97, charged = 1 + (PUNCH_CHARGE.full - 1) * charge;
    // the way the body (and so the punch) faces, which turned to the target during the cast
    const facing = player.facing, dir = { x: Math.sin(facing), z: Math.cos(facing) };
    const heat = player.frenzy;
    // (a straight blow: what it kills goes back along it, struck through its middle; a clean hit at arm's length lands
    // harder, and throws twice the spray; harder again with his step and his turn behind it, `punchDrive`)
    const drive = punchDrive(player, facing), driven = 1 + drive.step + drive.swipe;

    // (what it kills is thrown the way the blow went and as hard as it was thrown: on along his facing, carried
    // across by the swing of his aim behind it, harder with his step, his swing and its charge, from play: "ragdoll
    // should account for strike direction and momentum too")
    const now = turning.get(player), rate = now && G.time - now.at < 0.2 ? now.rate : 0;
    const across = Math.max(-0.8, Math.min(0.8, rate * PUNCH_CHARGE.swing));
    const wx = dir.x + Math.cos(facing) * across, wz = dir.z - Math.sin(facing) * across, wl = Math.hypot(wx, wz) || 1;
    const way = { x: wx / wl, z: wz / wl };
    const edge = punchSharp(drive);
    // (and by its charge, a modifier of its own over those; charged to the full it dazes what it hits)
    const hits = sweep(player, def, facing, {
      knock: def.knock * (1 + charge), blow: { dir: way, lift: 0.2 + 0.2 * charge, force: driven * (1 + charge) },
      scale: (gap) => cleanHit(gap) * driven * charged,
      sharp: (gap, e) => (toHead(e) ? 100 : edge(gap)),
      meets: (e) => meetsBody(player, def, e),
      mark: (e, k) => {
        fistMark(e, heat, Math.round(5 * (k > 1 ? 2 : 1) * (1 + charge)));
        if (full && !e.boss && !e.hero) dazeEnemy(e, PUNCH_CHARGE.stun, player);
      },
    });
    if (!hits) return;
    // (heavier as the Frenzy rises, a grunt now and then with a blow at high Frenzy)
    const hot = heat / FRENZY.cap;
    sfx.punchLand(-(player.model.swing ?? 1), hot);
    if (hot >= 0.5 && Math.random() < 0.3) sfx.grunt(hot);
    if (player.local) addShake(0.05 + 0.12 * (driven - 1) + 0.25 * charge);
    if (player.sandbox) return;
    player.energy = Math.min(player.stats.maxEnergy, player.energy + (def.gain ?? 0) * hits);
    gainFrenzy(player, def.frenzy ?? 0);
}

export default skill;
