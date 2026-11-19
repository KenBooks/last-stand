// The Stag of Ash (the Thornwood's third boss, data/enemies.ts `stag`, its numbers `STAG`): a huge stag of charred
// wood, embers glowing through its cracks, its antlers burning, smoke trailing off them. Built on the shared boss
// toolkit (entities/bossKit.ts): its phases, its telegraphed attacks, its stun as its weak-spot window. Its model is
// models/stag.ts.
//
// - **The charge** (both phases): it paws the earth through the `charge` warning as a lane burns onto the floor from
//   it towards a hero (locked as it begins: a step out of the lane dodges it), then runs along it fast (`charge.speed`),
//   on past where he stood. A hero it runs into is gored and thrown aside, once a charge. The lane it ran is left
//   burning (`fire`), hurting whoever stands in the fire. A rock, a tree, the wall or a hero's shield raised towards
//   it stops it dead: it crashes, stunned `charge.stun` s, and through that every hero's hit takes twice (`openWeak`).
//   So every hero can win: the warrior raises his shield in its lane, the mage blinks aside and slows or freezes it
//   with frost, the ranger stands before a rock or the wall and steps aside. (A hero's own wall, the Hedgeward, stops
//   it too once it stands among the arena's obstacles.)
// - **Up close** (both phases) it never stands: one attack after another, a moment between (`close.rest`). Every
//   other one, a hero before it is tossed (`toss`): its head dropped, its antlers scraping the earth, then flung up,
//   the hero scooped onto them and thrown far across the arena (short of the wall), hurt hard as he lands; a step
//   aside, a dash or a raised shield saves him. Else, and wherever he stands beside it, its antlers' sweep: its head
//   drawn back and low, then swept round before it. It charges only at a hero `charge.near` m off or more, so a
//   toss is often followed by a charge at where he landed.
// - **Phase 2** (under half its life): a charge that met nothing wheels round and charges again at once (`again`),
//   its fire lasts longer (`fire.late`), so the floor it leaves free shrinks, and embers rain round the heroes.
// It walks at a hero between charges. A lure never draws it (`EnemyDef.ignoresLures`). Every attack goes through
// enemyAI's `fx`: the host decides the charge and what it meets (a partner's raised shield as the host's copy of him
// shows it), and each game judges its own hero against the fire, the sweep, the toss and the embers (`hurtPlayer`).
import * as THREE from 'three';
import { G } from '../state';
import { STAG } from '../data/foes/stag';
import { BLOCK } from '../data/balance';
import { hurtPlayer } from '../combat/damage';
import { addEffect, decal, fireLine, groundFlash, laneMark, shockwave, telegraph } from '../fx/effects';
import { burst, debris, smokePuff } from '../fx/particles';
import { flash } from '../fx/lights';
import { addShake } from '../core/renderer';
import { sfx } from '../core/audio';
import { groundHeight } from '../world/ground';
import { inObstacle, resolveWorld } from '../world/collision';
import { pastWall } from '../world/edge';
import { rand, randInt } from '../util';
import { openWeak, telegraphed, telegraphTime } from './bossKit';
import { bossHooks } from './bossHooks';
import { chase, fx } from './enemyAI';
import type { Enemy } from './enemy';
import type { Player } from './player';

const S = STAG;
/** its embers' orange (the lane, the sweep, the embers' rings) */
const EMBER = 0xff6a20;
/** how often the fire is laid behind it as it runs (m), and how far ahead of its middle it meets what stops it (a
 *  share of its radius) */
const FIRE_EVERY = 2.4, AHEAD = 0.85;
/** what stopped a charge (`stagCrash` fx): a prop, the wall, a hero's raised shield */
export const CRASH = { prop: 0, wall: 1, shield: 2 } as const;
/** a charge that has covered less than this in `STUCK_FOR` s is stuck against something (m, s) */
const STUCK = 0.6, STUCK_FOR = 0.4;

const angleOff = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const foeOf = (id: number): Enemy | null => G.enemies.find((e) => e.id === id) ?? null;
const heroes = (): Player[] => G.players.filter((p) => p.active);
const _n = new THREE.Vector3();

// --- its decisions, where the fight is simulated ---------------------------------------------------------

/** A charge under way, where simulated: where it set off, its way, how long it runs, the heroes it has met, where its
 *  fire was last laid, and where it was a moment ago (to tell it stuck). */
export interface Run {
  ox: number; oz: number; dx: number; dz: number; length: number;
  met: Set<number>; laid: number; checkT: number; checkAt: number;
}
/** each stag's charge under way, where simulated (the lab reads it) */
export const RUNS = new WeakMap<Enemy, Run>();

/** The Stag of Ash's AI, where the fight is simulated: running a charge out; else up close an attack after another
 *  (the toss, the sweep), a charge at a hero far enough off whenever it may, and a walk at the hero between; phase 2's
 *  embers. It never stands: between its attacks it's turning onto him or walking at him. */
export function stagAI(e: Enemy, dt: number): void {
  const b = e.brain;
  e.desired.set(0, 0, 0);
  b.chargeT = (b.chargeT ?? 2) - dt;
  if (e.bossPhase >= 1) rainEmbers(e, dt);
  if (RUNS.has(e)) { runOn(e, dt); return; }
  if (e.action || e.cd > 0) return;
  const p = e.target!, d = Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
  e.faceTo(p.pos.x, p.pos.z);
  if (d < e.radius + p.radius + S.sweep.reach) { closeIn(e, p, d); return; }
  if (b.chargeT <= 0 && d >= S.charge.near) {
    b.again = 0;
    pawAt(e, 'charge', p);
    return;
  }
  chase(e);
}

/** A hero up close: the toss every other attack where he stands before it and near enough, else the sweep; turned onto
 *  him first where he's beside or behind it (`faceTo`, as it decides). */
function closeIn(e: Enemy, p: Player, d: number): void {
  const b = e.brain, off = angleOff(Math.atan2(p.pos.x - e.pos.x, p.pos.z - e.pos.z), e.facing);
  if (off > S.sweep.arc) return;
  const turn = b.closeN ?? 0;
  b.closeN = turn + 1;
  if (turn % 2 === 0 && off < S.toss.arc && d < e.radius + p.radius + S.toss.reach) toss(e);
  else sweep(e);
}

/** the moment it rests between two attacks up close (s) */
const rest = (): number => rand(S.close.rest[0], S.close.rest[1]);

/** Its antlers swept round before it at the hero near it, after its head is drawn back and low. */
function sweep(e: Enemy): void {
  telegraphed(e, 'sweep', () => fx('sweep', e.id, e.pos.x, e.pos.z, e.facing, e.damage));
  e.cd = telegraphTime(e, 'sweep') + rest();
}

/** Its head dropped, its antlers scraping the earth, then flung up: a hero before it tossed (`antlerToss` fx, each game its
 *  own hero); a charge at where he lands comes soon after. */
function toss(e: Enemy): void {
  telegraphed(e, 'toss', () => {
    fx('antlerToss', e.id, e.pos.x, e.pos.z, e.facing, e.damage);
    e.brain.chargeT = Math.min(e.brain.chargeT ?? 0, 1.5);
  });
  e.cd = telegraphTime(e, 'toss') + rest();
}

/** The earth pawed through attack `name`'s warning, its lane burning onto the floor towards `p`, locked now; then it
 *  runs along it. */
function pawAt(e: Enemy, name: 'charge' | 'again', p: Player): void {
  const angle = Math.atan2(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
  const d = Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
  const length = Math.min(S.charge.most, Math.max(S.charge.least, d + S.charge.over));
  e.facing = e.targetFacing = angle;
  const warn = e.def.bossKit!.attacks![name].warn;
  fx('chargeLane', e.id, e.pos.x, e.pos.z, angle, length, warn);
  telegraphed(e, name, () => setOff(e, angle, length));
  e.cd = telegraphTime(e, name);
}

/** Its run begun along `angle` for `length` m (its gallop the action every game shows). */
function setOff(e: Enemy, angle: number, length: number): void {
  const run: Run = {
    ox: e.pos.x, oz: e.pos.z, dx: Math.sin(angle), dz: Math.cos(angle), length,
    met: new Set(), laid: 0, checkT: STUCK_FOR, checkAt: 0,
  };
  RUNS.set(e, run);
  e.startAction('gallop', length / S.charge.speed + 2);
  fx('stagRun', e.id);
}

/** How far along its way a charge has come (m). */
const along = (e: Enemy, run: Run): number => (e.pos.x - run.ox) * run.dx + (e.pos.z - run.oz) * run.dz;

/** A frame of its run, where simulated: on along its way, its fire laid behind it, crashing into what stands before
 *  it, goring a hero it meets, done at its length or stuck. */
function runOn(e: Enemy, dt: number): void {
  const run = RUNS.get(e)!, c = S.charge;
  e.desired.set(run.dx * c.speed, 0, run.dz * c.speed);
  e.targetFacing = Math.atan2(run.dx, run.dz);
  const gone = along(e, run);
  if (gone - run.laid >= FIRE_EVERY) layFire(e, run, gone);
  const ax = e.pos.x + run.dx * e.radius * AHEAD, az = e.pos.z + run.dz * e.radius * AHEAD;
  if (inObstacle({ x: ax, z: az }, 0.35)) { crash(e, CRASH.prop, -1); return; }
  if (atWall(ax, az)) { crash(e, CRASH.wall, -1); return; }
  for (const p of heroes()) {
    if (run.met.has(p.slot)) continue;
    const rx = p.pos.x - e.pos.x, rz = p.pos.z - e.pos.z, d = Math.hypot(rx, rz);
    if (d > e.radius + p.radius + 0.15 || rx * run.dx + rz * run.dz < -e.radius * 0.3) continue;
    run.met.add(p.slot);
    // (his shield raised towards it: it runs into it as into a rock)
    if (p.shieldRaised && angleOff(Math.atan2(-rx, -rz), p.facing) < BLOCK.arc) { crash(e, CRASH.shield, p.slot); return; }
    fx('gore', e.id, p.slot, e.damage, run.dx, run.dz);
  }
  run.checkT -= dt;
  if (run.checkT <= 0) {
    if (gone - run.checkAt < STUCK) { crash(e, atWall(ax, az, 1.5) ? CRASH.wall : CRASH.prop, -1); return; }
    run.checkT = STUCK_FOR;
    run.checkAt = gone;
  }
  if (gone >= run.length) stop(e, run);
}

/** Whether (x, z) is at the wall as it's drawn (`margin` m short of it): the forest's thicket stops a body short of
 *  the ring `pastWall` reads, so it's asked where the wall keeps a body. */
function atWall(x: number, z: number, margin = 0.3): boolean {
  const probe = { x, z };
  G.arena.wall.keepIn(probe, margin);
  return Math.hypot(probe.x - x, probe.z - z) > 1e-3 || pastWall(G.arena.biome, x, z, _n).by > -margin;
}

/** Its fire laid on from where it was last laid to `to` m along its way (none for a piece under 0.3 m). */
function layFire(e: Enemy, run: Run, to: number): void {
  const from = run.laid;
  if (to - from < 0.3) return;
  const life = e.bossPhase >= 1 ? S.fire.late : S.fire.life;
  fx('fire', e.id, run.ox + run.dx * from, run.oz + run.dz * from, run.ox + run.dx * to, run.oz + run.dz * to, life, e.damage);
  run.laid = to;
}

/** Its run out without meeting anything: its fire laid to its end; in phase 2 it wheels round and charges again, once. */
function stop(e: Enemy, run: Run): void {
  layFire(e, run, along(e, run));
  RUNS.delete(e);
  e.cancelAction();
  const p = e.target;
  if (e.bossPhase >= 1 && !e.brain.again && p?.active) {
    e.brain.again = 1;
    pawAt(e, 'again', p);
    return;
  }
  e.cd = 1.1;
  e.brain.chargeT = S.charge.every;
}

/** Its run stopped dead by what stood before it (`how`: CRASH, `slot` the hero whose shield it met): stunned and open
 *  to every hit (`openWeak`), told to every game. */
function crash(e: Enemy, how: number, slot: number): void {
  const run = RUNS.get(e)!;
  layFire(e, run, along(e, run));
  RUNS.delete(e);
  e.cancelAction();
  fx('stagCrash', e.id, e.pos.x + run.dx * e.radius, e.pos.z + run.dz * e.radius, how, slot, S.charge.stun);
  openWeak(e, S.charge.stun);
  e.cd = 0.6;
  e.brain.chargeT = S.charge.every + S.charge.stun;
}

/** Where simulated, in phase 2: `count` embers falling round the heroes every `every` s. */
function rainEmbers(e: Enemy, dt: number): void {
  const b = e.brain, m = S.embers;
  b.emberT = (b.emberT ?? 1.5) - dt;
  if (b.emberT > 0) return;
  b.emberT = m.every;
  const all = heroes();
  for (let i = 0; i < m.count && all.length; i++) {
    const p = all[randInt(0, all.length - 1)], a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * m.spread;
    fx('ember', e.id, p.pos.x + Math.sin(a) * r, p.pos.z + Math.cos(a) * r, m.fall + i * 0.15, e.damage);
  }
}

// --- what every game plays (enemyAI's fx) ---------------------------------------------------------------

/** The lane its charge will run burning onto the floor from (x, z) along `angle` for `length` m over `warn` s
 *  (`chargeLane` fx), and its hoof pawing the earth meanwhile: dust and sparks, a stamp. Gone if it dies or is
 *  dazed first. */
export function chargeLane(id: number, x: number, z: number, angle: number, length: number, warn: number): void {
  const foe = foeOf(id);
  const lane = laneMark(x, z, angle, length, S.charge.width, warn, EMBER);
  foe?.onDeath.push(() => lane.cancel());
  foe?.onDazed.push(() => lane.cancel());
  sfx.rootGroan(warn * 0.8);
  let t = 0, stamp = 0.25;
  addEffect({
    update(dt) {
      t += dt;
      if (!foe || !foe.alive) return false;
      if (t >= stamp) {
        stamp += 0.42;
        const hx = foe.pos.x + Math.sin(foe.facing) * foe.radius * 0.7, hz = foe.pos.z + Math.cos(foe.facing) * foe.radius * 0.7;
        const at = new THREE.Vector3(hx, groundHeight(hx, hz), hz);
        debris(at, { count: 5, speed: 2.5, size: 0.14, life: 0.7 });
        smokePuff(at, { count: 2, color: 0x2a2018, alpha: 0.4, size: 0.7, sizeEnd: 1.8, speed: 0.8, life: 0.9 });
        burst(at.setY(at.y + 0.2), { count: 6, color: 0xffa040, speed: 2.5, up: 2.5, life: 0.5, size: 0.14 });
        sfx.thud();
        addShake(0.08);
      }
      return t < warn;
    },
  });
}

/** Its run begun (`stagRun` fx): a bellow, the ground shaking, its hooves drumming while it gallops. */
export function stagRun(id: number): void {
  const foe = foeOf(id);
  if (!foe) return;
  sfx.rush();
  addShake(0.25);
  let beat = 0;
  addEffect({
    update(dt) {
      if (!foe.alive || foe.action?.name !== 'gallop') return false;
      beat -= dt;
      if (beat <= 0) {
        beat = 0.2;
        sfx.thud();
        addShake(0.06);
      }
      return true;
    },
  });
}

/** Its fire left burning from (x0, z0) to (x1, z1) for `life` s (`fire` fx): each game's hero burnt in it. */
export function fireAt(id: number, x0: number, z0: number, x1: number, z1: number, life: number, damage: number): void {
  fireLine(x0, z0, x1, z1, S.fire.reach, life);
  FIRES.push({ id, x0, z0, x1, z1, until: G.time + life, damage });
  if (!burning) watchFires();
}

/** the fires burning on this game: their lines, until when and the stag's damage */
interface Fire { id: number; x0: number; z0: number; x1: number; z1: number; until: number; damage: number }
export const FIRES: Fire[] = [];
let burning = false, burnt = -Infinity;

/** How far (x, z) is from fire `f`'s line (m). */
function offFire(f: Fire, x: number, z: number): number {
  const lx = f.x1 - f.x0, lz = f.z1 - f.z0, l2 = Math.max(1e-6, lx * lx + lz * lz);
  const k = Math.max(0, Math.min(1, ((x - f.x0) * lx + (z - f.z0) * lz) / l2));
  return Math.hypot(x - f.x0 - lx * k, z - f.z0 - lz * k);
}

/** This game's hero burnt every `tick` s he stands in any fire (once a tick, however many he stands in), while any
 *  burns. */
function watchFires(): void {
  burning = true;
  addEffect({
    update() {
      for (let i = FIRES.length - 1; i >= 0; i--) if (FIRES[i].until <= G.time) FIRES.splice(i, 1);
      const p = G.player;
      if (p.active && !p.airborne && G.time - burnt >= S.fire.tick) {
        const f = FIRES.find((x) => offFire(x, p.pos.x, p.pos.z) < S.fire.reach + p.radius * 0.5);
        if (f) {
          burnt = G.time;
          hurtPlayer(p, f.damage * S.fire.hurt, 'fire', new THREE.Vector3(p.pos.x, 0, p.pos.z), { foe: foeOf(f.id), attack: 'fire' });
        }
      }
      if (FIRES.length) return true;
      burning = false;
      return false;
    },
    dispose() { FIRES.length = 0; burning = false; },
  });
}

/** Hero `slot` gored by its charge going along (dx, dz) (`gore` fx): his own game hurts him and throws him aside, off
 *  its line; every game shows the blow. */
export function goreAt(id: number, slot: number, damage: number, dx: number, dz: number): void {
  const foe = foeOf(id), p = G.players.find((q) => q.slot === slot);
  if (!p) return;
  burst(new THREE.Vector3(p.pos.x, 1.2, p.pos.z), { count: 18, color: 0xff7a30, speed: 5, life: 0.45, size: 0.22 });
  debris(p.pos, { count: 8, speed: 4 });
  sfx.slam();
  if (!p.local || !p.active) return;
  addShake(0.5);
  hurtPlayer(p, damage * S.charge.hurt, 'fire', foe?.pos ?? null, { foe, attack: 'charge' });
  // (thrown off its line, to whichever side of it he stood, and on along it)
  const side = foe ? Math.sign((p.pos.x - foe.pos.x) * dz - (p.pos.z - foe.pos.z) * dx) || 1 : 1;
  p.knock.set((dz * side + dx * 0.5) * S.charge.throw, 0, (-dx * side + dz * 0.5) * S.charge.throw);
}

/** Its charge stopped dead at (x, z) (`stagCrash` fx: `how` a CRASH, `slot` the hero whose shield it met): stunned
 *  `stun` s on every game (stars, its head down), the impact, and the shield's hero staggered back. */
export function stagCrashed(id: number, x: number, z: number, how: number, slot: number, stun: number): void {
  const foe = foeOf(id);
  if (foe) {
    foe.dazed = Math.max(foe.dazed, stun);
    if (!foe.net) foe.cancelAction();
  }
  const at = new THREE.Vector3(x, groundHeight(x, z) + 1.2, z);
  debris(at, { count: 26, speed: 7, size: 0.22 });
  burst(at, { count: 40, color: 0xffa040, colorEnd: 0xff3010, speed: 7, up: 4, life: 0.9, size: 0.24 });
  smokePuff(at, { count: 10, color: 0x1a1410, alpha: 0.5, size: 1.4, sizeEnd: 3.6, speed: 2.4, life: 1.6 });
  shockwave({ x, z }, { color: EMBER, intensity: 1.6, from: 0.6, to: 6, life: 0.6 });
  // (one light, soft: nothing large flashes faster than about 1.5 times a second)
  flash({ color: EMBER, intensity: 16, distance: 10, life: 0.6, pos: { x, y: 2, z } });
  addShake(0.7);
  sfx.crumble();
  sfx.slam();
  if (how !== CRASH.shield) return;
  sfx.shieldBlock();
  const p = G.players.find((q) => q.slot === slot);
  if (p?.local && foe) {
    // (the shield held; its weight drives him back a step)
    const d = Math.max(0.1, Math.hypot(p.pos.x - foe.pos.x, p.pos.z - foe.pos.z));
    p.knock.set(((p.pos.x - foe.pos.x) / d) * 6, 0, ((p.pos.z - foe.pos.z) / d) * 6);
  }
}

/** Its antlers swept round before it from (x, z) facing `facing` (`sweep` fx): embers thrown in an arc, this game's
 *  hero hurt and shoved if he's within its reach and its arc. */
export function sweepAt(id: number, x: number, z: number, facing: number, damage: number): void {
  const foe = foeOf(id), w = S.sweep, reach = (foe?.radius ?? 2) + w.reach;
  for (let i = 0; i < 9; i++) {
    const a = facing - w.arc + (i / 8) * w.arc * 2;
    const at = new THREE.Vector3(x + Math.sin(a) * reach * 0.8, groundHeight(x, z) + 1.4, z + Math.cos(a) * reach * 0.8);
    burst(at, { count: 3, color: 0xffa040, speed: 3, up: 1, life: 0.45, size: 0.18 });
  }
  sfx.swing();
  addShake(0.2);
  const p = G.player;
  if (!p.active) return;
  const rx = p.pos.x - x, rz = p.pos.z - z, d = Math.hypot(rx, rz);
  if (d > reach + p.radius || angleOff(Math.atan2(rx, rz), facing) > w.arc) return;
  hurtPlayer(p, damage * w.hurt, 'physical', new THREE.Vector3(x, 0, z), { foe, attack: 'antlers' });
  p.knock.set((rx / Math.max(0.1, d)) * 7, 0, (rz / Math.max(0.1, d)) * 7);
}

/** A hero on its antlers or thrown off them: the stag, where he was scooped from and where he lands, how long since,
 *  how high he was held and its damage. */
export interface Tossed { foe: Enemy | null; from: THREE.Vector3; to: THREE.Vector3; t: number; up: number; damage: number }
/** this game's hero tossed now, if he is (his own game alone moves him: a partner's copy is placed by his reports) */
export let tossed: Tossed | null = null;
/** where its antlers hold a hero where its model isn't there to say (m over the floor, and before it past its
 *  radius), and how far under its tines his feet hang (m) */
const HELD = { up: 4.4, ahead: 0.7, under: 1.1 };
const _tines = new THREE.Vector3();

/** Its antlers flung up from (x, z) facing `facing` (`antlerToss` fx): earth and sparks thrown up before it; this game's hero,
 *  if he's before it within its reach and not saved (a step aside, a dash, his shield raised towards it), scooped up
 *  and thrown far on along its facing, hurt as he lands. */
export function tossAt(id: number, x: number, z: number, facing: number, damage: number): void {
  const foe = foeOf(id), w = S.toss, radius = foe?.radius ?? 2, reach = radius + w.reach;
  const dx = Math.sin(facing), dz = Math.cos(facing);
  const front = new THREE.Vector3(x + dx * reach * 0.6, 0, z + dz * reach * 0.6);
  front.y = groundHeight(front.x, front.z) + 0.3;
  debris(front, { count: 14, speed: 5, size: 0.18 });
  smokePuff(front, { count: 4, color: 0x2a2018, alpha: 0.4, size: 0.9, sizeEnd: 2.4, speed: 1.4, life: 1 });
  burst(front.setY(front.y + 0.6), { count: 20, color: 0xffa040, colorEnd: 0xff3010, speed: 4, up: 6, life: 0.7, size: 0.2 });
  sfx.swing();
  addShake(0.25);
  const p = G.player;
  if (!p.active || tossed) return;
  const rx = p.pos.x - x, rz = p.pos.z - z, d = Math.hypot(rx, rz);
  if (d > reach + p.radius || angleOff(Math.atan2(rx, rz), facing) > w.arc) return;
  if (p.shieldRaised && angleOff(Math.atan2(-rx, -rz), p.facing) < BLOCK.arc) {
    // (the shield took the antlers: driven back, on his feet)
    sfx.shieldBlock();
    p.knock.set((rx / Math.max(0.1, d)) * 8, 0, (rz / Math.max(0.1, d)) * 8);
    return;
  }
  if (!p.seize(w.hold + w.fly)) return;
  const held = new THREE.Vector3(x + dx * (radius + HELD.ahead), 0, z + dz * (radius + HELD.ahead));
  const me: Tossed = { foe, from: p.pos.clone(), to: landing(held, dx, dz, p.radius), t: 0, up: HELD.up, damage };
  tossed = me;
  sfx.slam();
  addShake(0.45);
  burst(new THREE.Vector3(p.pos.x, 1.4, p.pos.z), { count: 16, color: 0xff7a30, speed: 4, life: 0.45, size: 0.2 });
  addEffect({
    update(dt) { return tossed === me && flyOn(me, held, dt); },
    dispose() { if (tossed === me) letGo(); },
  });
}

/** Where a hero thrown from `from` along (dx, dz) lands: `far` m on, short of the wall (he can't be thrown out of the
 *  arena), and clear of the props (a body can't land in a rock). */
function landing(from: THREE.Vector3, dx: number, dz: number, radius: number): THREE.Vector3 {
  const at = from.clone();
  for (let r = 0.5; r <= S.toss.far; r += 0.5) {
    const x = from.x + dx * r, z = from.z + dz * r;
    if (atWall(x, z, radius + 1)) break;
    at.set(x, 0, z);
  }
  resolveWorld(at, radius);
  // (pushed out of a rock into the wall: back along the throw until clear)
  for (let i = 0; i < 40 && (atWall(at.x, at.z, radius + 0.5) || inObstacle(at, radius)); i++) {
    at.x -= dx * 0.5;
    at.z -= dz * 0.5;
    resolveWorld(at, radius);
  }
  return at;
}

/** A tossed hero carried on by `dt`: up onto its antlers (`hold` s), then thrown in a high arc to where he lands, hurt
 *  as he lands. False once he has. */
function flyOn(s: Tossed, held: THREE.Vector3, dt: number): boolean {
  const p = G.player, w = S.toss;
  s.t += dt;
  if (!p.active) { letGo(); return false; }
  p.vel.set(0, 0, 0);
  p.knock.set(0, 0, 0);
  if (s.t < w.hold) {
    // (carried up on its tines as its head comes up: where its model holds them, else where they'd be)
    const tines = s.foe?.alive ? s.foe.model.root.userData.tines as THREE.Object3D | undefined : undefined;
    if (tines) {
      tines.getWorldPosition(_tines);
      held.set(_tines.x, 0, _tines.z);
      s.up = Math.max(0, _tines.y - groundHeight(_tines.x, _tines.z) - HELD.under);
    }
    const k = s.t / w.hold, ease = k * k * (3 - 2 * k);
    p.pos.lerpVectors(s.from, held, ease);
    p.lift = s.up * Math.sin(k * Math.PI / 2);
    return true;
  }
  const f = Math.min(1, (s.t - w.hold) / w.fly);
  p.pos.lerpVectors(held, s.to, f);
  p.lift = s.up * (1 - f) + w.high * 4 * f * (1 - f);
  if (f < 1) return true;
  // (landed: hurt hard, dust and a thud)
  hurtPlayer(p, s.damage * w.hurt, 'physical', new THREE.Vector3(p.pos.x, 0, p.pos.z), { foe: s.foe, attack: 'toss' });
  smokePuff({ x: p.pos.x, y: 0, z: p.pos.z }, { count: 10, color: 0x2a2620, alpha: 0.45, size: 0.7, sizeEnd: 2.2, life: 0.9, speed: 2 });
  debris(p.pos, { count: 10, speed: 4 });
  addShake(0.55);
  sfx.bodyFall(1);
  letGo();
  return false;
}

/** This game's tossed hero let go (landed, or the run left): on the ground again. */
function letGo(): void {
  G.player.lift = 0;
  tossed = null;
}

/** how high an ember falls from (m) */
const EMBER_FROM = 11;

/** An ember falling onto (x, z) in `fall` s (`ember` fx): a ring where it lands, a glowing coal streaking down, a
 *  burst of sparks and a scorch as it lands, this game's hero hurt if he's in it. */
export function emberAt(id: number, x: number, z: number, fall: number, damage: number): void {
  const m = S.embers, ground = groundHeight(x, z);
  const ring = telegraph({ x, z }, m.radius, fall, EMBER);
  const foe = foeOf(id);
  foe?.onDeath.push(() => ring.cancel());
  const at = new THREE.Vector3(), drift = rand(-1.5, 1.5);
  let t = 0, trail = 0;
  addEffect({
    update(dt) {
      t = Math.min(fall, t + dt);
      const k = t / fall;
      at.set(x + drift * (1 - k), ground + EMBER_FROM * (1 - k * k), z);
      trail += dt;
      if (trail > 0.025) {
        trail = 0;
        burst(at, { count: 2, color: 0xffb050, colorEnd: 0xff3010, speed: 0.3, up: 0.5, life: 0.4, size: 0.26, sizeEnd: 0.05, gravity: 0 });
      }
      if (t < fall) return true;
      burst(at, { count: 22, color: 0xffa040, colorEnd: 0xff3010, speed: 4.5, up: 3, life: 0.6, size: 0.2 });
      smokePuff(at, { count: 3, color: 0x1a1410, alpha: 0.4, size: 0.8, sizeEnd: 2, speed: 1, life: 1.1 });
      groundFlash({ x, z }, { color: EMBER, intensity: 1.4, radius: m.radius * 1.2, life: 0.5 });
      decal({ x, z }, { size: m.radius * 1.3, life: 5 });
      sfx.thud();
      const p = G.player;
      if (p.active && Math.hypot(p.pos.x - x, p.pos.z - z) < m.radius + p.radius) {
        hurtPlayer(p, damage * m.hurt, 'fire', new THREE.Vector3(x, 0, z), { foe, attack: 'embers' });
      }
      return false;
    },
  });
}

// --- its phases (entities/bossKit.ts), and what every game shows of it each frame --------------------------

/** how often its antlers shed smoke and embers as it stands (s), and as it gallops */
const SMOKE_EVERY = 0.12, SMOKE_RUNNING = 0.05;
/** where its antlers burn over its middle (m: up, and forward along its facing) */
const ANTLERS = { y: 6.4, ahead: 1.6 };
const smokeT = new WeakMap<Enemy, number>();

bossHooks('stag', {
  enter(e, phase) {
    if (phase < 1) return;
    e.brain.emberT = 1.2;
    e.brain.chargeT = Math.min(e.brain.chargeT ?? 0, 1.5);
  },
  cue(e, phase) {
    if (phase < 1) return;
    // the ash takes fire: a ring of flame thrown out from it, its embers flaring
    addShake(0.5);
    sfx.canopyClose();
    shockwave(e.pos, { color: EMBER, intensity: 1.8, from: 1, to: 11, life: 1.1 });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      burst(new THREE.Vector3(e.pos.x + Math.sin(a) * 2.5, 2.5, e.pos.z + Math.cos(a) * 2.5),
        { count: 4, color: 0xffa040, colorEnd: 0xff3010, speed: 4, up: 4, life: 1.1, size: 0.24 });
    }
    flash({ color: EMBER, intensity: 12, distance: 14, life: 1.2, pos: { x: e.pos.x, y: 4, z: e.pos.z } });
  },
  frame(e, dt) {
    if (!e.alive) return;
    // smoke trailing off its burning antlers, and embers shed from them: more as it gallops
    const running = e.action?.name === 'gallop';
    const t = (smokeT.get(e) ?? 0) - dt;
    if (t > 0) { smokeT.set(e, t); return; }
    smokeT.set(e, running ? SMOKE_RUNNING : SMOKE_EVERY);
    const x = e.pos.x + Math.sin(e.facing) * ANTLERS.ahead + rand(-0.7, 0.7);
    const z = e.pos.z + Math.cos(e.facing) * ANTLERS.ahead + rand(-0.7, 0.7);
    const at = new THREE.Vector3(x, e.obj.position.y + ANTLERS.y * (running ? 0.85 : 1) + rand(0, 0.6), z);
    smokePuff(at, { count: 1, color: 0x231c18, alpha: 0.35, size: 0.7, sizeEnd: 2.6, speed: 0.3, rise: 1.4, life: running ? 1.2 : 2.2 });
    if (Math.random() < 0.6) burst(at, { count: 1, color: 0xffa040, colorEnd: 0xff3010, speed: 0.6, up: 1.4, life: 0.9, size: 0.12, sizeEnd: 0.03, gravity: -0.5 });
  },
});
