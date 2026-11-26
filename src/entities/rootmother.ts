// The Rootmother (the Thornwood's second boss, data/enemies.ts `rootmother`, its numbers `ROOTMOTHER`): a giant woman
// grown out of a hollow tree in the arena's middle, her lower half all roots. She never walks: she burrows, going
// under the floor and rising again near the hero she goes for (entities/rootBurrow.ts). Built on the shared boss
// toolkit (entities/bossKit.ts): her phases, her telegraphed attacks, her heart as her weak-spot window. Her model is
// models/rootmother.ts, her seed pods' models/seedpod.ts.
//
// - **Creeping vines** (her arms drawn back, then driven down): 2 to 3 vines crawl out from her roots along the floor,
//   each after a hero, turning towards him no faster than `turn` (a step aside dodges one), laid in short straight
//   pieces (the Barkhide Hulk's vine, fx/vine.ts, one a piece: no program of its own). Any of it a hero touches holds
//   him `hold` s (`Player.root`), coils winding up his legs; a dash tears him free. One arrow cuts a vine whole
//   (entities/throws.ts `cutVineAlong`: each piece is laid there), withering it and letting go of whoever it holds.
//   The host lays each piece as its head reaches it (enemyAI's `creeper` fx) and every game draws it and judges its own
//   hero against it.
// - **Seed pods** (a pod plucked from her hair and flung): `count` pods arc out to land round the arena, each a foe of
//   its own (`seedpod`: one hit of anything pops it) that bursts into `brood` Thornlings after `hatch` s unless popped.
// - **Thorn ring** (her arms raised as the thorns stir, a ring on the floor for its warning): thorns rise round her
//   trunk for `last` s, hurting a hero in them every `tick` s. She raises them while a hero stands near her.
// - **Thrown branches** (from Kenneth: "we need more attacks, what about spikes that it throws at you, some spike
//   branches maybe. Needs to be more dangerous"): her right hand up to her crown, a branch snapped off it (a crack,
//   splinters), her arm drawn back over her shoulder, then hurled overhand at a hero `branch.near` m or more from her,
//   or at one a vine holds wherever he is. It flies end over end on an arc from her hand to where he stood as it left
//   it, its landing ringed on the floor while it flies (`branch` fx: each game flies it and judges its own hero),
//   bursts where it lands and sticks there in the earth, or in a prop it meets on its way. Phase 2 throws a fan of
//   three across where he stood; her rage, a line of five across her line to him that stays as bramble a while. No
//   two of her hits land together (`claimBeat`); a shield raised towards her takes a branch.
// - **Her rage** (under a quarter of her life, her third phase): her pause between attacks shorter, the line of
//   branches, and the earth erupting under a hero three times running, each where he stands as it begins (`chase`).
// - **Phase 2** (under half her life): the canopy closes and the battleground darkens (`Arena.setShade`: the sky's,
//   the sun's and the surroundings' strengths, no shader change); slow spore clouds drift over the floor, hurting
//   whoever stands in one; and **root eruptions**: the earth cracks under a hero for about a second (a ring, cracks,
//   dust), then spikes burst from it.
// - **Her heart** (both phases): `heart.first` s after she rises and every `heart.every` s after, it opens in her trunk
//   for `heart.open` s (`openWeak`), plain to see: a banner, a beat a second, its doors thrown wide, a light, her aura
//   amber. An arrow or a bolt that strikes it meanwhile takes half again its damage (`BossKitDef.weak.spot`); the rest
//   of her takes as ever. She meditates through it, attacking nothing and dragging nowhere, and flings pods round the
//   arena one after another (`heart.pods`).
// - **Her root cage** (every phase; entities/rootCage.ts): a hero who stands still a couple of seconds is caged in
//   roots, and a great root she raises beside the cage comes down on it.
// - **Her burrow** (every phase; entities/rootBurrow.ts; from Kenneth: "instead of moving slowly, it teleports, just
//   going underground, roots going into the ground, and then it appears near you"): her roots driven into the soil,
//   her body after them, a ridge of soil travelling over her way under the floor, the earth bulging and cracking where
//   she'll rise, then her roots bursting out and her body rising, a few metres from the hero she goes for. She attacks
//   nothing and nothing strikes her from half under till she rises.
// (She moves only so: a lure never draws her, `EnemyDef.ignoresLures`.)
// Every attack goes through enemyAI's `fx`, so each co-op game plays it from the same numbers and judges its own hero
// alone (`hurtPlayer` on the local player, `Player.root` on his own game).
import * as THREE from 'three';
import { G } from '../state';
import { emit } from '../events';
import type { EnemyId } from '../data/enemies';
import { ROOTMOTHER } from '../data/foes/rootmother';
import { ARENA, partyScale } from '../data/balance';
import { hurtPlayer } from '../combat/damage';
import { addEffect, crackDecal, driftGlow, iceSpikes, shockwave, telegraph } from '../fx/effects';
import { groundVine, type Vine } from '../fx/vine';
import { burst, debris, smokePuff } from '../fx/particles';
import { flash } from '../fx/lights';
import { addShake } from '../core/renderer';
import { sfx } from '../core/audio';
import { rootSounds } from '../core/sounds/rootmother';
import { schedule } from '../core/timers';
import { groundHeight } from '../world/ground';
import { inObstacle } from '../world/collision';
import { rand, randInt } from '../util';
import { spawnEnemy } from './spawner';
import { claimBeat, openWeak, telegraphed, telegraphTime } from './bossKit';
import { bossHooks } from './bossHooks';
import { chase, fx } from './enemyAI';
import { VINE, coilRound, layVine, liftVine, releaseFrom, type LyingVine } from './throws';
import { BRANCH_LENGTH, NO_SIZE } from './models/rootmother';
import { cageDue, caged, tickCage } from './rootCage';
import { burrowDue, tickBurrow } from './rootBurrow';
import { THROWS, aheadOf, branchFlight, hurl, rainLater, rainOne, watchPaces, type Throw } from './rootVolleys';
import type { Enemy } from './enemy';
import type { Player } from './player';

const R = ROOTMOTHER;
/** her sap's green (the thorn ring's warning, the pods' flight), and her heart's amber (an eruption's warning) */
const SAP = 0x9aff40, AMBER = 0xff9a38;
/** a great pod's glow (amber, so it reads apart from a small pod's green from above) */
const GREAT_GLOW = 0xffb040;
/** how high her hand flings a pod from (m), and how high its arc rises over the straight line (m) */
const FLING_Y = 5.4, ARC = 4;
/** how fast a cut vine withers, and one left to lie once its last piece is laid (s) */
const CUT_WITHERS = 0.25, WITHERS = 0.5;

/** what a pod bursts into */
const BROOD: EnemyId = 'thornling';

const foeOf = (id: number): Enemy | null => G.enemies.find((e) => e.id === id) ?? null;
const heroes = (): Player[] => G.players.filter((p) => p.active);

// --- her decisions, where the fight is simulated ---------------------------------------------------------

/** What she does next in turn: each phase's round (a throw only at a hero far enough off, the thorns only with one
 *  near), an eruption every `erupt.every` attacks in phase 2. Her throws are named in rootVolleys.ts: a pair in every
 *  phase, her rain from phase 2, a fan and a line as before. */
export type Attack = 'vines' | 'seeds' | 'thorns' | 'erupt' | 'chase' | Throw;
export const ROUNDS: Attack[][] = [
  ['vines', 'pair', 'seeds', 'branch', 'pair', 'thorns'],
  ['vines', 'fan', 'rain', 'seeds', 'pair', 'thorns'],
  ['volley', 'rain', 'chase', 'fan', 'vines', 'rain', 'thorns'],
];
/** Whether `a` is one of her throws. */
const isThrow = (a: Attack): a is Throw => a in THROWS;

/** The Rootmother's AI, where the fight is simulated: an attack whenever her cooldown allows, none while her heart is
 *  open or she's burrowing; the spores' clouds in phase 2; her burrow between her sets of attacks or to a hero far off. */
export function rootmotherAI(e: Enemy, dt: number): void {
  const b = e.brain;
  e.desired.set(0, 0, 0);
  // (each hero's pace over the floor, read every frame: her throws lead it)
  watchPaces(heroes(), dt);
  if (tickBurrow(e, dt)) return;
  tickCage(e, dt, vineHolds);
  if (e.bossPhase >= 1) drift(e, dt);
  if (e.weak > 0) {
    meditate(e, dt);
    e.cd = Math.max(e.cd, 1);
    return;
  }
  if (heartDue(e, dt)) return;
  if (e.action || e.cd > 0) return;
  // (a hero standing still caged first: it punishes standing still)
  if (cageDue(e)) return;
  // (her burrow: between her sets of attacks, the last of a set done, or to a hero gone far off)
  const set = ROUNDS[Math.min(2, e.bossPhase)].length;
  if (burrowDue(e, b.round !== undefined && (b.round + 1) % set === 0)) return;
  const { attack, at: p } = nextAttack(e);
  e.faceTo(p.pos.x, p.pos.z);
  // (none of her hits lands within `branch.gap` s of another: one that would waits a moment and is chosen again)
  if (!claimed(e, attack, p)) {
    e.cd = 0.25;
    b.round = (b.round ?? 0) - 1;
    return;
  }
  if (attack === 'vines') telegraphed(e, 'vines', () => sendVines(e));
  else if (attack === 'seeds') telegraphed(e, 'seeds', () => flingSeeds(e));
  else if (attack === 'thorns') {
    const t = R.thorns;
    telegraphed(e, 'thorns', () => fx('thorns', e.id, e.pos.x, e.pos.z, t.radius, t.last, e.damage),
      { x: e.pos.x, z: e.pos.z, radius: t.radius, color: SAP });
  } else if (attack === 'rain') {
    // (her rain: a branch as its warning ends and one every `rain.every` s after, each at the far hero whose turn it
    // is as it leaves her hand)
    fx('branchTorn', e.id, 1);
    const turn = (i: number): Player | null => farInTurn(e, i) ?? (p.active ? p : null);
    telegraphed(e, 'rain', () => rainOne(e, 0, () => turn(0)), undefined,
      rainLater(e, e.def.bossKit!.attacks!.rain.warn, turn));
  } else if (isThrow(attack)) {
    if (heldHero() === p) b.heldThrowT = G.time;
    fx('branchTorn', e.id, THROWS[attack] > 1 ? 2 : 1);
    telegraphed(e, attack, () => hurl(e, attack, p));
  } else if (attack === 'chase') {
    telegraphed(e, 'chase', () => {});
    chaseEarth(e, p);
  } else {
    // (her eruption: where he'll be as it bursts, led as her branches are, so a stop or a turn still takes him out)
    const { x, z } = aheadOf(p, e.def.bossKit!.attacks!.erupt.warn);
    fx('cracks', x, z, telegraphTime(e, 'erupt') * 0.68);
    telegraphed(e, 'erupt', () => {
      fx('erupt', e.id, x, z, R.erupt.radius, e.damage);
    }, { x, z, radius: R.erupt.radius, color: AMBER });
  }
  rootSounds.groan(telegraphTime(e, attack) * 0.6);
  b.attacks = (b.attacks ?? 0) + 1;
  // (a pause after each, shorter in phase 2 and shorter still as she rages)
  e.cd = telegraphTime(e, attack) + e.def.cooldown * rand(0.85, 1.15) * R.tempo[Math.min(2, e.bossPhase)];
}

/** Where simulated: attack `attack` at hero `p` let land (`claimBeat`): its hits' first moment and their spread. */
function claimed(e: Enemy, attack: Attack, p: Player): boolean {
  const B = R.branch, warn = e.def.bossKit!.attacks![attack].warn;
  const d = Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
  if (isThrow(attack)) {
    // (a fan's and a line's branches land a little apart, over their flights' differences too; a pair's second and a
    // rain's last a while after its first)
    const n = THROWS[attack];
    const spread = attack === 'volley' ? (n - 1) * B.lineEvery : attack === 'fan' ? 0.2
      : attack === 'pair' ? B.pair.later : attack === 'rain' ? (n - 1) * B.rain.every : 0;
    return claimBeat(warn + branchFlight(d) - 0.15, B.gap, spread + 0.3);
  }
  if (attack === 'chase') return claimBeat(R.rage.chase.warn, B.gap, (R.rage.chase.count - 1) * R.rage.chase.every);
  if (attack === 'erupt') return claimBeat(warn, B.gap);
  if (attack === 'thorns') return claimBeat(warn, B.gap, R.thorns.last);
  return true;
}

/**
 * Her next attack and its hero: a branch at a hero a vine holds (once a hold), phase 2's eruption on its turn, else her
 * round's next: a throw at the nearest hero `branch.near` m or more from her trunk, the thorns only with a hero near
 * her, the rest at her target.
 */
function nextAttack(e: Enemy): { attack: Attack; at: Player } {
  const b = e.brain, phase = Math.min(2, e.bossPhase), round = ROUNDS[phase];
  const held = heldHero();
  if (held && !caged(held) && G.time - (b.heldThrowT ?? -99) > R.vines.hold) return { attack: 'branch', at: held };
  const target = e.target!;
  if (phase === 1 && (b.attacks ?? 0) % R.erupt.every === 0) return { attack: 'erupt', at: target };
  const off = (p: Player): number => Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z) - e.radius;
  // (never a throw into her cage while it holds him: its blow is coming; the far heroes each in turn)
  const far = farInTurn(e, 0, true);
  const near = heroes().some((p) => off(p) < R.thorns.near);
  for (let i = 0; i < round.length; i++) {
    // (wrapped both ways: a claim refused steps her round back one, and twice running it went under 0)
    const a = round[(b.round = (((b.round ?? -1) + 1) % round.length + round.length) % round.length)];
    if (isThrow(a) && far) return { attack: a, at: far };
    if (a === 'thorns' && near) return { attack: a, at: target };
    if (!isThrow(a) && a !== 'thorns') return { attack: a, at: target };
  }
  return { attack: 'vines', at: target };
}

// --- her thrown branches ------------------------------------------------------------------------------------

/**
 * The far heroes (`branch.near` m or more off her trunk, none her cage holds), each in turn: the `i`th after the one
 * whose turn it is; `next` moves the turn on (her next throw). With several heroes far off she throws at each in
 * turn, and her rain's branches go to them in turn.
 */
function farInTurn(e: Enemy, i: number, next = false): Player | null {
  const off = (p: Player): number => Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z) - e.radius;
  const far = heroes().filter((p) => off(p) >= R.branch.near && !caged(p)).sort((p, q) => p.slot - q.slot);
  if (!far.length) return null;
  if (next) e.brain.farTurn = (e.brain.farTurn ?? -1) + 1;
  return far[((e.brain.farTurn ?? 0) + i) % far.length];
}

/** Where simulated, her rage: the earth erupting under hero `p` `chase.count` times, each warned where he stands as
 *  it begins (its cracks and its ring), `chase.every` s apart, while she lives and stands undazed. */
function chaseEarth(e: Enemy, p: Player): void {
  const c = R.rage.chase;
  for (let i = 0; i < c.count; i++) {
    schedule(i * c.every, () => {
      if (!e.alive || e.dazed > 0 || !p.active) return;
      const x = p.pos.x, z = p.pos.z;
      fx('cracks', x, z, c.warn * 0.68);
      fx('tele', e.id, x, z, c.radius, c.warn, AMBER);
      // (its damage given so the eruption's own share of it comes to `chase.hurt`)
      schedule(c.warn, () => { if (e.alive) fx('erupt', e.id, x, z, c.radius, (e.damage * c.hurt) / R.erupt.hurt); });
    });
  }
}

// --- her heart --------------------------------------------------------------------------------------------

/** Where simulated: her heart's next opening counted down (her own time: not while she's dazed or frozen), and opened
 *  once her attack under way is done. True as it opens. */
function heartDue(e: Enemy, dt: number): boolean {
  const b = e.brain, h = R.heart;
  b.heartT = (b.heartT ?? h.first) - dt;
  if (b.heartT > 0 || e.action) return false;
  b.heartT = h.every;
  b.podsFlung = 0;
  b.podT = 0.6;
  openWeak(e, h.open);
  fx('heartOpens', e.id, h.open);
  return true;
}

/** Where simulated, through her heart's window: a pod flung round the arena every `podEvery` s, `pods` in all. */
function meditate(e: Enemy, dt: number): void {
  const b = e.brain, h = R.heart;
  b.podT = (b.podT ?? 0) - dt;
  if (b.podT > 0 || (b.podsFlung ?? 0) >= h.pods) return;
  b.podT = h.podEvery;
  b.podsFlung = (b.podsFlung ?? 0) + 1;
  flingPod(e);
}

/** what the banner says as her heart opens */
const HEART_LINE = 'Her heart opens · Strike it';
/** her heart's place on her (m: up her trunk and out from its middle), for its light */
const HEART_AT = { y: 1.75, out: 1.9 };

/** Her heart opened for `open` s on this game (`heartOpens` fx): the banner, a deep beat a second, a warm light
 *  before it, a shake. (Its doors, its glow and her pose are her model's, by `AnimState.boss.weak`.) */
export function heartOpened(id: number, open: number): void {
  const foe = foeOf(id);
  if (!foe) return;
  emit('bossCall', foe, HEART_LINE);
  rootSounds.canopy();
  addShake(0.35);
  const x = foe.pos.x + Math.sin(foe.facing) * HEART_AT.out, z = foe.pos.z + Math.cos(foe.facing) * HEART_AT.out;
  shockwave({ x: foe.pos.x, z: foe.pos.z }, { color: AMBER, intensity: 1.4, from: 1, to: 8, life: 0.9 });
  // (one light, held soft through it: its beat is the heart's own glow, a beat a second)
  flash({ color: AMBER, intensity: 9, distance: 9, life: open, hold: open - 0.6, pos: { x, y: HEART_AT.y, z } });
  let t = 0, beat = 0;
  addEffect({
    update(dt) {
      t += dt;
      beat -= dt;
      if (beat <= 0 && foe.alive) {
        beat = 1;
        rootSounds.heart();
      }
      return t < open && foe.alive;
    },
  });
}

// --- the heroes her vines hold ----------------------------------------------------------------------------

/** Whether one of her vines holds hero `p` now, as this game has it (the host's: a partner's copy too). */
function vineHolds(p: Player): boolean {
  for (const c of CREEPERS.values()) {
    if (c.cut < 0 && !c.gone && G.time < c.heldUntil && c.caught.has(p)) return true;
  }
  return false;
}

/** A hero one of her vines holds now, as this game has it (the host's, which decides her throws), or null. */
function heldHero(): Player | null {
  for (const c of CREEPERS.values()) {
    if (c.cut >= 0 || c.gone || G.time >= c.heldUntil) continue;
    for (const p of c.caught) if (p.active) return p;
  }
  return null;
}

// --- the creeping vines -----------------------------------------------------------------------------------

/** the host's vines as they creep: their heads, their way, how far each has gone and the next piece's moment */
interface Creeping { id: number; boss: Enemy; x: number; z: number; angle: number; slot: number; grown: number }
let creeperIds = 0;

/** Her vines sent out from her roots, each after a hero (shared round them), spread a little either side. */
function sendVines(e: Enemy): void {
  const v = R.vines, n = randInt(v.count[0], v.count[1]), targets = heroes();
  if (!targets.length) return;
  for (let i = 0; i < n; i++) {
    const p = targets[i % targets.length];
    const angle = Math.atan2(p.pos.x - e.pos.x, p.pos.z - e.pos.z) + (i - (n - 1) / 2) * 0.55;
    const out = e.radius + 0.4;
    creep({ id: ++creeperIds, boss: e, x: e.pos.x + Math.sin(angle) * out, z: e.pos.z + Math.cos(angle) * out, angle, slot: p.slot, grown: 0 });
  }
}

/** A vine crept on where simulated: a piece laid each time its head reaches the last one's end, turned towards its
 *  hero by at most a piece's share of `turn`, until it's as long as it grows, leaves the arena, reaches a hero or is
 *  cut. */
function creep(c: Creeping): void {
  const v = R.vines, every = v.piece / v.speed;
  let wait = 0;
  addEffect({
    update(dt) {
      wait -= dt;
      if (wait > 0) return true;
      const laid = CREEPERS.get(c.id);
      if ((laid && laid.cut >= 0) || !c.boss.alive || c.grown >= v.length) return false;
      const p = G.players.find((q) => q.slot === c.slot && q.active) ?? heroes()[0];
      if (p) {
        const want = Math.atan2(p.pos.x - c.x, p.pos.z - c.z), most = v.turn * every;
        const off = Math.atan2(Math.sin(want - c.angle), Math.cos(want - c.angle));
        c.angle += Math.max(-most, Math.min(most, off));
      }
      fx('creeper', c.boss.id, c.id, c.x, c.z, c.angle, v.piece);
      c.x += Math.sin(c.angle) * v.piece;
      c.z += Math.cos(c.angle) * v.piece;
      c.grown += v.piece;
      wait += every;
      // (its head past the wall, or on a hero: it stops there)
      if (Math.hypot(c.x, c.z) > ARENA.radius) return false;
      return !G.players.some((q) => q.active && Math.hypot(q.pos.x - c.x, q.pos.z - c.z) < v.reach + q.radius);
    },
  });
}

/** A piece of a vine on the floor, as every game draws it. */
interface Piece { vine: Vine; ox: number; oz: number; dx: number; dz: number; length: number; born: number; lying: LyingVine }
/** A vine as every game has it: its pieces, when it was cut (-1: not), the heroes it holds, when its last piece was
 *  laid and until when it holds them, and whether it's gone. */
interface Creeper { pieces: Piece[]; cut: number; caught: Set<Player>; lastAt: number; heldUntil: number; gone: boolean }
/** every game's vines by their id (the host's, from its `creeper` fx) */
export const CREEPERS = new Map<number, Creeper>();

/** A piece of vine `id` laid from (x, z) along `angle` for `length` m (the `creeper` fx), on this game: drawn growing at
 *  the vines' speed, cut by an arrow (the whole vine with it), and this game's hero held by any of it he touches. */
export function creeperPiece(id: number, x: number, z: number, angle: number, length: number): void {
  let c = CREEPERS.get(id);
  if (c && (c.cut >= 0 || c.gone)) return;
  if (!c) {
    c = { pieces: [], cut: -1, caught: new Set(), lastAt: G.time, heldUntil: -1, gone: false };
    CREEPERS.set(id, c);
    tend(id, c);
    sfx.rush();
  }
  const dx = Math.sin(angle), dz = Math.cos(angle);
  const vine = groundVine(x, z, dx, dz, length, VINE.bark, VINE.sap);
  vine.mesh.name = 'rootmother vine';
  G.scene.add(vine.mesh);
  const creeper = c;
  const lying: LyingVine = {
    ox: x, oz: z, dx, dz,
    grown: () => (creeper.cut < 0 ? vine.grow : 0),
    cut(at) { cutCreeper(creeper, at); },
  };
  layVine(lying);
  c.pieces.push({ vine, ox: x, oz: z, dx, dz, length, born: G.time, lying });
  c.lastAt = G.time;
}

/** Vine `c` cut where an arrow met it: every piece withers, and this game's hero it holds is let go. */
function cutCreeper(c: Creeper, at: THREE.Vector3): void {
  if (c.cut >= 0) return;
  c.cut = G.time;
  for (const p of c.pieces) liftVine(p.lying);
  for (const p of c.caught) if (p.local) p.letGo();
  burst(at.clone().setY(groundHeight(at.x, at.z) + 0.15), { count: 18, color: VINE.sap, speed: 3.5, life: 0.5, size: 0.16 });
  debris(at, { count: 8, speed: 2.5 });
  sfx.thud();
}

/** Vine `c`'s pieces grown, held to, withered and gone, a frame at a time. */
function tend(id: number, c: Creeper): void {
  const v = R.vines;
  let dust = 0;
  addEffect({
    update(dt) {
      const now = G.time;
      dust += dt;
      for (const piece of c.pieces) piece.vine.grow = Math.min(piece.length, (now - piece.born) * v.speed);
      // the earth thrown up at its head as it creeps
      const head = c.pieces[c.pieces.length - 1];
      if (head && head.vine.grow < head.length && c.cut < 0 && dust > 0.06) {
        dust = 0;
        const x = head.ox + head.dx * head.vine.grow, z = head.oz + head.dz * head.vine.grow;
        smokePuff(new THREE.Vector3(x, groundHeight(x, z), z), { count: 1, color: 0x2a2418, size: 0.45, sizeEnd: 1.1, speed: 0.6, life: 0.5 });
      }
      if (c.cut < 0) for (const p of G.players) touch(c, p);
      // (the last piece grown, it lies `lies` s, longer while it holds someone, then withers; cut, at once)
      const grownAt = c.lastAt + v.piece / v.speed, ends = c.cut >= 0 ? c.cut : Math.max(grownAt + v.lies, c.heldUntil);
      const wither = Math.min(1, Math.max(0, (now - ends) / (c.cut >= 0 ? CUT_WITHERS : WITHERS)));
      for (const piece of c.pieces) { piece.vine.wither = wither; piece.vine.update(now); }
      if (wither < 1) return true;
      c.gone = true;
      return false;
    },
    dispose() {
      c.gone = true;
      for (const piece of c.pieces) { liftVine(piece.lying); piece.vine.dispose(); }
      // (kept a while, so a piece the host lays late finds it gone and lays nothing)
      schedule(5, () => CREEPERS.delete(id));
    },
  });
}

/** Hero `p` held by vine `c` if any of what it has laid reaches him, once a vine: his own game holds him (a dash goes
 *  free), a partner's copy is shown in its coils. */
function touch(c: Creeper, p: Player): void {
  const v = R.vines;
  if (c.caught.has(p) || !p.active) return;
  for (const piece of c.pieces) {
    const rx = p.pos.x - piece.ox, rz = p.pos.z - piece.oz;
    const along = rx * piece.dx + rz * piece.dz, off = Math.abs(rx * piece.dz - rz * piece.dx);
    if (along < -p.radius || along > piece.vine.grow + v.reach * 0.5 || off > v.reach + p.radius) continue;
    if (p.local ? !p.root(v.hold) : !!p.dash) return;
    c.caught.add(p);
    c.heldUntil = Math.max(c.heldUntil, G.time + v.hold);
    coilRound(p, v.hold, () => c.cut >= 0);
    return;
  }
}

// --- the seed pods ----------------------------------------------------------------------------------------

/** Her pods flung from her hand to land round the arena, each a foe there when it lands, while the arena isn't full:
 *  of them, `great.byPhase` of her phase are great pods (from her second phase). */
function flingSeeds(e: Enemy): void {
  const great = R.seeds.great.byPhase[Math.min(2, e.bossPhase)];
  for (let i = 0; i < R.seeds.count; i++) flingPod(e, i < great);
}

/** A pod (`great`: a great one) flung from her hand to land somewhere round the arena (`podSpot`), a foe there as it
 *  lands, while the arena isn't full. */
function flingPod(e: Enemy, great = false): void {
  const s = R.seeds;
  if (G.enemies.filter((x) => x.alive).length >= s.aliveMost) return;
  const at = podSpot(e);
  if (!at) return;
  fx('seedFling', e.pos.x, e.pos.z, at.x, at.z, s.flight, great ? 1 : 0);
  schedule(s.flight, () => {
    if (!e.alive) return;
    spawnEnemy(great ? 'bigpod' : 'seedpod', at, { wave: G.run?.wave ?? 1, training: e.training });
  });
}

/** A spot `near`..`far` m from her, inside the wall, clear of props and `clear` m from every hero, or null. */
function podSpot(e: Enemy): THREE.Vector3 | null {
  const s = R.seeds;
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2, r = rand(s.near, s.far);
    const at = new THREE.Vector3(e.pos.x + Math.sin(a) * r, 0, e.pos.z + Math.cos(a) * r);
    if (Math.hypot(at.x, at.z) > ARENA.radius - 2 || inObstacle(at, 0.6)) continue;
    if (heroes().some((p) => Math.hypot(p.pos.x - at.x, p.pos.z - at.z) < s.clear)) continue;
    return at;
  }
  return null;
}

/** A seed pod's AI, where simulated: it ripens where it fell (its `ripen` action, for its look), and bursts into its
 *  brood when its `hatch` s have passed since it rose (frozen, its time stands still with it): a small pod's
 *  Thornlings, a great pod's (`bigpod`) Mossback, each a foe of its kind as a wave brings it. */
export function seedPodAI(e: Enemy, dt: number): void {
  const great = e.type === 'bigpod', g = R.seeds.great;
  const b = e.brain, hatch = great ? g.hatch : R.seeds.hatch;
  e.desired.set(0, 0, 0);
  b.ripe = (b.ripe ?? 0) + dt;
  if (!e.action) e.startAction('ripen', Math.max(0.05, hatch - b.ripe) + 0.5);
  if (b.ripe < hatch) return;
  fx('podBurst', e.pos.x, e.pos.z, great ? 1 : 0);
  const kind = (great ? g.hatches : BROOD) as EnemyId, count = great ? g.brood : R.seeds.brood;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, out = count > 1 ? 0.9 : 0;
    const at = new THREE.Vector3(e.pos.x + Math.sin(a) * out, 0, e.pos.z + Math.cos(a) * out);
    spawnEnemy(kind, at, { wave: G.run?.wave ?? 1, lifeMult: partyScale(G.run?.party ?? 1).life, training: e.training });
  }
  e.die();
}

// --- what every game plays (enemyAI's fx) ---------------------------------------------------------------

/** A pod flung from over (ox, oz) to land at (tx, tz) in `flight` s (`seedFling` fx; `great` 1: a great pod, its ring
 *  and trail larger and amber): a glowing seed on its arc, a ring where it will land. */
export function seedFlung(ox: number, oz: number, tx: number, tz: number, flight: number, great = 0): void {
  const colour = great ? GREAT_GLOW : SAP, size = great ? 1.8 : 1;
  telegraph({ x: tx, z: tz }, 0.8 * size, flight, colour);
  sfx.swing();
  const at = new THREE.Vector3();
  let t = 0, trail = 0;
  addEffect({
    update(dt) {
      t = Math.min(flight, t + dt);
      const k = t / flight;
      at.set(ox + (tx - ox) * k, FLING_Y * (1 - k) + groundHeight(tx, tz) * k + ARC * 4 * k * (1 - k), oz + (tz - oz) * k);
      trail += dt;
      if (trail > 0.03) {
        trail = 0;
        burst(at, { count: 2, color: colour, speed: 0.4, up: 0, life: 0.35, size: 0.22 * size, sizeEnd: 0.05, gravity: 0 });
      }
      if (t < flight) return true;
      debris(at, { count: 6, speed: 2 });
      smokePuff(at, { count: 3, color: 0x2a2418, size: 0.5, sizeEnd: 1.2, speed: 0.8, life: 0.6 });
      sfx.thud();
      return false;
    },
  });
}

/** A pod burst into its brood at (x, z) (`podBurst` fx; `great` 1: a great pod's, more and amber): sap and husk. */
export function podBurst(x: number, z: number, great = 0): void {
  const size = great ? 1.8 : 1;
  const at = new THREE.Vector3(x, groundHeight(x, z) + 0.6 * size, z);
  burst(at, { count: Math.round(26 * size), color: great ? GREAT_GLOW : SAP, speed: 4.5 * size, up: 2, life: 0.6, size: 0.22 });
  debris(at, { count: Math.round(10 * size), color: 0x6a5a2a, speed: 4 * size });
  rootSounds.pod();
}

/**
 * Thorns risen round boss `id`'s trunk at (x, z) out to `radius` m for `last` s (`thorns` fx): this game's hero hurt
 * `hurt` of `damage` every `tick` s he stands among them.
 */
export function thornsAt(id: number, x: number, z: number, radius: number, last: number, damage: number): void {
  const foe = foeOf(id), t = R.thorns, inner = (foe?.radius ?? 2.4) * 0.9;
  iceSpikes({ x, z }, radius, 70, inner, { look: 'thorn', life: last, height: 1.35 });
  shockwave({ x, z }, { color: SAP, intensity: 1.2, from: inner, to: radius * 1.05, life: 0.5 });
  debris({ x, y: 0.2, z }, { count: 20, speed: 5 });
  rootSounds.thorns();
  addShake(0.3);
  let time = 0, next = 0.1;
  addEffect({
    update(dt) {
      time += dt;
      if (time >= next) {
        next += t.tick;
        const p = G.player, d = Math.hypot(p.pos.x - x, p.pos.z - z);
        if (p.active && d < radius + p.radius * 0.5) hurtPlayer(p, damage * t.hurt, 'physical', new THREE.Vector3(x, 0, z), { foe, attack: 'thorns' });
      }
      return time < last;
    },
  });
}

/** The earth cracking at (x, z) for `warn` s before an eruption (`cracks` fx): glowing cracks, dust thrown up, a
 *  rumble. (Its ring on the floor is the telegraph's.) */
export function cracksAt(x: number, z: number, warn: number): void {
  const r = R.erupt.radius;
  crackDecal({ x, z }, { size: r * 1.3, color: AMBER, intensity: 1.2, life: warn + 0.8 });
  rootSounds.crack(warn);
  let t = 0, next = 0;
  addEffect({
    update(dt) {
      t += dt;
      if (t >= next) {
        next += 0.22;
        const a = Math.random() * Math.PI * 2, rr = Math.random() * r;
        const at = new THREE.Vector3(x + Math.sin(a) * rr, groundHeight(x, z), z + Math.cos(a) * rr);
        debris(at, { count: 3, speed: 1.6, size: 0.1, life: 0.6 });
        smokePuff(at, { count: 1, color: 0x2a2418, alpha: 0.35, size: 0.5, sizeEnd: 1.2, speed: 0.4, life: 0.7 });
      }
      return t < warn;
    },
  });
}

/** Roots bursting from the earth at (x, z), `radius` m round (`erupt` fx): spikes, earth flying, one soft light, and
 *  this game's hero hurt `hurt` of `damage` if he's in it. */
export function eruptAt(id: number, x: number, z: number, radius: number, damage: number): void {
  const foe = foeOf(id), pos = new THREE.Vector3(x, groundHeight(x, z), z);
  iceSpikes({ x, z }, radius, 26, 0, { look: 'thorn', life: 1.4, height: 1.7 });
  shockwave(pos, { color: AMBER, intensity: 1.6, from: 0.4, to: radius * 1.2, life: 0.45 });
  debris(pos, { count: 22, speed: 6 });
  smokePuff(pos, { count: 8, color: 0x2a2418, size: 1.2, sizeEnd: 3, speed: 2.5 });
  // (one light, soft: nothing large flashes faster than about 1.5 times a second)
  flash({ color: AMBER, intensity: 14, distance: radius * 4, life: 0.5, pos: { x, y: 1, z } });
  addShake(0.5);
  sfx.crumble();
  const p = G.player;
  if (p.active && Math.hypot(p.pos.x - x, p.pos.z - z) < radius + p.radius) {
    hurtPlayer(p, damage * R.erupt.hurt, 'physical', pos, { foe, attack: 'roots' });
  }
}

// --- her branches, as every game plays them ------------------------------------------------------------------

/** a branch's fall (m/s²: the Brute's chunk's, so its arc reads as a throw), its turns end over end through a
 *  flight, how deep its tip goes into the earth (m), and how long it takes to sink away once its time is up (s) */
const BRANCH = { fall: 22, turns: 1.5, sink: 0.35, gone: 0.4, ring: SAP };

/** A branch in the air or stuck where it landed, kept for the lab (`lab boss --parts branches`). */
export interface ThrownBranch {
  /** game time it left her hand, its landing aimed at (its ring's middle), and how many s it flies */
  at: number;
  to: { x: number; z: number };
  flight: number;
  splash: number;
  /** where it came down (game time), and whether in a prop it met on its way */
  landed?: { x: number; z: number; t: number; inProp: boolean };
  /** the players' slots it hurt, and when (its burst or its bramble) */
  struck: { slot: number; t: number; bramble: boolean }[];
}
/** the latest branches, the newest last */
export const BRANCHES: ThrownBranch[] = [];

/** A branch torn off boss `id`'s crown (`branchTorn` fx; `hands` 2: both her hands, for a fan or a line): its crack,
 *  splinters off her hand. */
export function branchTorn(id: number, hands: number): void {
  const foe = foeOf(id);
  rootSounds.snap();
  if (!foe) return;
  const at = releaseFrom(foe, new THREE.Vector3());
  debris(at, { count: 5 * hands, color: 0x4a3a22, speed: 2.5, size: 0.1, life: 0.6 });
}

/**
 * A branch thrown by boss `id` from (ox, oy, oz) to land at (tx, tz) after `flight` s (`branch` fx): spun end over
 * end on its arc, its landing ringed meanwhile; it bursts there (`hurt` of `damage` to this game's hero within `splash`
 * m, a shield raised towards her taking it) and sticks in the earth, or in a prop it meets first (hurting no one); it
 * stays `stay` s as bramble (`brambleHurt` every `brambleTick` s to whoever stands within `brambleReach` m), else
 * `sticks` s, then sinks away.
 */
export function branchAt(id: number, ox: number, oy: number, oz: number, tx: number, tz: number, flight: number,
  damage: number, hurt: number, splash: number, stay: number): void {
  const B = R.branch, foe = foeOf(id);
  const ty = groundHeight(tx, tz);
  const vel = new THREE.Vector3((tx - ox) / flight, (ty - oy + 0.5 * BRANCH.fall * flight * flight) / flight, (tz - oz) / flight);
  const flat = new THREE.Vector3(vel.x, 0, vel.z).normalize();
  const across = new THREE.Vector3(flat.z, 0, -flat.x);
  // (one of her model's own branches, the oldest taken where all are out: its look warmed with hers)
  const mesh = takeBranch(foe);
  const ring = telegraph({ x: tx, z: tz }, splash, flight, BRANCH.ring);
  const kept: ThrownBranch = { at: G.time, to: { x: tx, z: tz }, flight, splash, struck: [] };
  BRANCHES.push(kept);
  if (BRANCHES.length > 24) BRANCHES.shift();
  if (mesh) mesh.owner = kept;
  const from = new THREE.Vector3(foe?.pos.x ?? ox, oy, foe?.pos.z ?? oz);
  // (`pos` its middle on its arc, then where it came down: `shown` where it's drawn, sunk into the earth)
  const pos = new THREE.Vector3(ox, oy, oz), shown = new THREE.Vector3(), v = new THREE.Vector3(), dir = new THREE.Vector3();
  const lying = new THREE.Quaternion().setFromUnitVectors(UP, flat), q = new THREE.Quaternion();
  // (spun end over end about its across, coming down tip first along its way as it lands)
  const world = new THREE.Quaternion(), butt = new THREE.Vector3();
  const pose = (along: THREE.Vector3, spin: number): void => {
    q.setFromUnitVectors(flat, dir.copy(along).normalize());
    world.copy(q).multiply(_spin.setFromAxisAngle(across, spin)).multiply(lying);
  };
  const place = (middle: THREE.Vector3): void => {
    butt.copy(middle).sub(_off.set(0, BRANCH_LENGTH / 2, 0).applyQuaternion(world));
    if (mesh && mesh.owner === kept) setWorld(mesh.joint, butt, world);
  };
  rootSounds.whirl(flight);
  // (the bramble's first tick a tick after its burst: never two hits at once)
  let t = 0, stuck = -1, inProp = false, hurtNext = B.brambleTick, sinking = 0;
  addEffect({
    update(dt) {
      if (stuck < 0) {
        t = Math.min(flight, t + dt);
        pos.set(ox + vel.x * t, oy + vel.y * t - 0.5 * BRANCH.fall * t * t, oz + vel.z * t);
        v.set(vel.x, vel.y - BRANCH.fall * t, vel.z);
        const spin = -Math.PI * 2 * BRANCH.turns * (1 - t / flight);
        pose(v, spin);
        place(pos);
        const prop = t < flight ? propAt(pos) : null;
        if (prop || t >= flight) {
          inProp = !!prop;
          stuck = 0;
          ring.cancel();
          // (its tip gone into the earth or the prop along its way)
          pose(v, 0);
          place(shown.copy(pos).addScaledVector(dir, BRANCH.sink));
          kept.landed = { x: pos.x, z: pos.z, t: G.time, inProp };
          landed(pos, inProp, from, damage * hurt, splash, kept, foe);
        }
        return true;
      }
      stuck += dt;
      const lasts = stay > 0 ? stay : B.sticks;
      if (stay > 0 && !inProp && stuck >= hurtNext) {
        hurtNext += B.brambleTick;
        const p = G.player;
        if (p.active && Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z) < B.brambleReach + p.radius * 0.5) {
          hurtPlayer(p, damage * B.brambleHurt, 'physical', pos, { foe, attack: 'bramble' });
          kept.struck.push({ slot: p.slot, t: G.time, bramble: true });
        }
      }
      if (stuck < lasts) return true;
      sinking += dt;
      place(shown.addScaledVector(dir, (dt / BRANCH.gone) * BRANCH_LENGTH * 0.8));
      return sinking < BRANCH.gone;
    },
    dispose() {
      if (mesh && mesh.owner === kept) {
        mesh.joint.scale.setScalar(NO_SIZE);
        mesh.owner = null;
      }
    },
  });
}

/** One of her model's thrown branches, and the throw that has it now. */
interface PoolBranch { joint: THREE.Object3D; owner: ThrownBranch | null; since: number }
/** each model's thrown branches as the throws hold them */
const POOLS = new WeakMap<THREE.Object3D, PoolBranch[]>();

/** A thrown branch of her model's for a throw (a free one, else the oldest out), or null with no model. */
function takeBranch(foe: Enemy | null): PoolBranch | null {
  const root = foe?.model.root;
  const joints = root?.userData.thrown as THREE.Object3D[] | undefined;
  if (!root || !joints?.length) return null;
  let pool = POOLS.get(root);
  if (!pool) {
    pool = joints.map((joint) => ({ joint, owner: null, since: 0 }));
    POOLS.set(root, pool);
  }
  const branch = pool.find((b) => !b.owner) ?? pool.reduce((a, b) => (a.since < b.since ? a : b));
  branch.since = G.time;
  return branch;
}

/** Joint `j` (under her model's root) put at `at` turned `turn` in the world, at full size. */
function setWorld(j: THREE.Object3D, at: THREE.Vector3, turn: THREE.Quaternion): void {
  const root = j.parent!;
  root.updateWorldMatrix(true, false);
  j.position.copy(root.worldToLocal(_local.copy(at)));
  root.getWorldQuaternion(_rootTurn);
  j.quaternion.copy(_rootTurn.invert().multiply(turn));
  j.scale.setScalar(1);
}
const _local = new THREE.Vector3(), _rootTurn = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const _spin = new THREE.Quaternion(), _off = new THREE.Vector3();

/** A prop a branch at `at` has flown into (its circle, under its top), or null. */
function propAt(at: THREE.Vector3): boolean {
  for (const o of G.arena.obstacles) {
    if (Math.hypot(at.x - o.x, at.z - o.z) < o.r && at.y - groundHeight(o.x, o.z) < o.h) return true;
  }
  return false;
}

/** A branch come down at `at`: earth (or bark) thrown up, a soft ring, its thud; out in the open, this game's hero
 *  hurt `damage` within `splash` m (from `from`, her side: a shield raised towards her takes it). */
function landed(at: THREE.Vector3, inProp: boolean, from: THREE.Vector3, damage: number, splash: number,
  kept: ThrownBranch, foe: Enemy | null): void {
  const floor = new THREE.Vector3(at.x, groundHeight(at.x, at.z), at.z);
  debris(inProp ? at : floor, { count: inProp ? 6 : 10, color: inProp ? 0x4a3a22 : undefined, speed: 3 });
  rootSounds.stake();
  if (inProp) return;
  smokePuff(floor, { count: 3, color: 0x2a2418, size: 0.6, sizeEnd: 1.6, speed: 1, life: 0.6 });
  shockwave(floor, { color: SAP, intensity: 0.9, from: 0.2, to: splash, life: 0.35 });
  addShake(0.12);
  const p = G.player;
  if (p.active && Math.hypot(p.pos.x - at.x, p.pos.z - at.z) < splash + p.radius) {
    hurtPlayer(p, damage, 'physical', from, { foe, attack: 'branch' });
    kept.struck.push({ slot: p.slot, t: G.time, bramble: false });
  }
}

// --- the spores, in phase 2 -------------------------------------------------------------------------------

/** Where simulated: a spore cloud let loose every `every` s while fewer than `most` drift, from somewhere round the
 *  arena, drifting across it towards a hero (give or take). */
function drift(e: Enemy, dt: number): void {
  const b = e.brain, s = R.spores;
  b.sporeT = (b.sporeT ?? 1) - dt;
  if (b.sporeT > 0) return;
  b.sporeT = s.every;
  const drifting = (cloudsOf.get(e) ?? []).filter((t) => t > G.time);
  cloudsOf.set(e, drifting);
  const all = heroes(), p = all[randInt(0, Math.max(0, all.length - 1))];
  if (drifting.length >= s.most || !p) return;
  const a = Math.random() * Math.PI * 2, r = rand(8, ARENA.radius - 4);
  const x = Math.sin(a) * r, z = Math.cos(a) * r;
  const tx = p.pos.x + rand(-5, 5), tz = p.pos.z + rand(-5, 5), d = Math.max(1, Math.hypot(tx - x, tz - z));
  fx('spores', e.id, x, z, ((tx - x) / d) * s.speed, ((tz - z) / d) * s.speed, s.life, e.damage);
  drifting.push(G.time + s.life);
}
/** when each of her drifting clouds is gone (game time), where simulated */
const cloudsOf = new WeakMap<Enemy, number[]>();

/**
 * A spore cloud from (x, z) drifting at (vx, vz) m/s for `life` s (`spores` fx): a soft green glow on the floor and
 * spores puffing up over it, this game's hero hurt `hurt` of `damage` every `tick` s he stands in it. Gone sooner
 * past the wall, or once she's dead.
 */
export function sporesAt(id: number, x: number, z: number, vx: number, vz: number, life: number, damage: number): void {
  const s = R.spores, foe = foeOf(id);
  let ends = life;
  const where = (t: number, out: THREE.Vector3): boolean => {
    out.set(x + vx * t, 0, z + vz * t);
    if (Math.hypot(out.x, out.z) > ARENA.radius + 1 || (foe && !foe.alive)) ends = Math.min(ends, t + 1);
    return t < ends;
  };
  driftGlow(where, s.radius, life, { color: 0x8adf40, intensity: 0.55 });
  const at = new THREE.Vector3();
  let t = 0, next = 0.5, puff = 0;
  addEffect({
    update(dt) {
      t += dt;
      if (!where(t, at)) return false;
      puff += dt;
      if (puff > 0.1 && t < ends - 0.6) {
        puff = 0;
        const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * s.radius * 0.85;
        const px = at.x + Math.sin(a) * rr, pz = at.z + Math.cos(a) * rr;
        smokePuff(new THREE.Vector3(px, groundHeight(px, pz) + 0.2, pz), { count: 1, color: 0x7aa838, alpha: 0.28, size: 1.1, sizeEnd: 2.6, speed: 0.25, rise: 0.5, life: 1.8 });
      }
      if (t >= next) {
        next += s.tick;
        const p = G.player;
        if (p.active && Math.hypot(p.pos.x - at.x, p.pos.z - at.z) < s.radius + p.radius * 0.3) {
          hurtPlayer(p, damage * s.hurt, 'vitality', at, { foe, attack: 'spores' });
        }
      }
      return t < ends;
    },
  });
}

// --- her phases (entities/bossKit.ts) ----------------------------------------------------------------------

bossHooks('rootmother', {
  enter(e, phase) {
    if (phase < 1) return;
    // (the first eruption soon: the change is felt; raging, her round from its start)
    e.brain.attacks = 0;
    e.brain.round = -1;
    if (phase === 1) e.brain.sporeT = 2;
    e.cd = Math.min(e.cd, 1.5);
  },
  cue(e, phase) {
    if (phase === 2) {
      // her rage: her bark splitting, a shudder through her, sap and splinters thrown off her
      rootSounds.groan(1.6);
      addShake(0.5);
      shockwave(e.pos, { color: AMBER, intensity: 1.4, from: 1, to: 9, life: 1 });
      debris(new THREE.Vector3(e.pos.x, 3, e.pos.z), { count: 30, color: 0x4a3a22, speed: 6 });
      return;
    }
    if (phase < 1) return;
    // the canopy closes overhead: leaves falling, the light going
    G.arena.setShade(1);
    e.onDeath.push(() => G.arena.setShade(0));
    rootSounds.canopy();
    addShake(0.4);
    shockwave(e.pos, { color: SAP, intensity: 1.6, from: 1, to: 10, life: 1.1 });
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2, r = rand(2, ARENA.radius - 2);
      burst(new THREE.Vector3(Math.sin(a) * r, rand(6, 10), Math.cos(a) * r), { count: 3, color: 0x3a6a26, intensity: 0.6, speed: 0.6, up: -1, life: 2.4, size: 0.18, sizeEnd: 0.12, gravity: 1.5, drag: 1.5 });
    }
  },
});
