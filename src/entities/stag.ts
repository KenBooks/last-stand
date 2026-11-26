// The Stag of Ash (the Thornwood's third boss, data/enemies.ts `stag`, its numbers `STAG`): a huge stag of charred
// wood, embers glowing through its cracks, its antlers burning, smoke trailing off them. Built on the shared boss
// toolkit (entities/bossKit.ts): its phases, its telegraphed attacks, its stun as its weak-spot window. Its model is
// models/stag.ts.
//
// - **The charge** (both phases): it paws the earth through the `charge` warning, turning after a hero, and its lane
//   burns onto the floor towards where he'll be as it reaches him (`charge.lead`, on along his way as it bends:
//   `watchTurn`, `ledTo`), locked `charge.lock` s before it runs
//   (a change of way or a step out of the lane dodges it: from Kenneth, "it seems very easy to avoid this boss": its
//   lane locked as it began, a hero walking round it was 6 m off it as it ran), then runs along it fast (`charge.speed`),
//   on past where he stood. A hero it runs into is gored and thrown aside, once a charge. The lane it ran is left
//   burning (`fire`), hurting whoever stands in the fire. A rock, a tree, the wall or a hero's shield raised towards
//   it stops it dead: it crashes, stunned `charge.stun` s, and through that every hero's hit takes twice (`openWeak`).
//   A charge that met nothing wheels round and charges again (`again`, `charge.again` times running: once, twice in
//   phase 2), so a hero who stepped out of its lane must step out of the next. A hero far off is charged sooner
//   (`charge.far` once none has come near for `charge.farFor` s): walking round it far off cost nothing before.
//   So every hero can win: the warrior raises his shield in its lane, the mage blinks aside and slows or freezes it
//   with frost, the ranger stands before a rock or the wall and steps aside. (A hero's own wall, the Hedgeward, stops
//   it too once it stands among the arena's obstacles.)
// - **Up close** (both phases) it never stands: one attack after another, a moment between (`close.rest`), turning
//   onto a hero beside it fast (`close.turn`) and after him through each warning (`track`, but its last `lock` s). Every
//   third one, a hero before it is tossed (`toss`): its head dropped, its antlers scraping the earth, then flung up,
//   the hero scooped onto them and thrown far across the arena (short of the wall), hurt hard as he lands; a step
//   aside, a dash or a raised shield saves him. A hero under it, before its chest, it rears over and stamps both fore
//   hooves down on (`stamp`); else it gores (`gore`): its head drawn up and back, then dropped and raked forward and up
//   through where he stands, its antlers reaching the earth at its feet (from Kenneth: "have him actually bend down to
//   reach you, he is just attacking the air instead": the sweep it had swung its antlers at its own head's height).
//   Each game judges its own hero against its own copy as drawn: the gore by the tines' places over the frames they
//   come through, the stamp by the fore hooves' as they land. It charges only at a hero `charge.near` m off or more,
//   so a toss is often followed by a charge at where he landed. A hero behind it, within `kick.reach`, it kicks:
//   its weight thrown onto its fore legs and its haunches gathered (a short warning), then both hind hooves driven back
//   and up (`kick`, judged where the drawn hind hooves are, `kickAt`), knocking him far; no shield takes it.
// - **The breath** (both phases): at a hero `breath.least` to `breath.most` m past its body, every `breath.every` s at
//   most, it draws breath through its warning, its head raised and turned to one side, where a line burns onto the
//   floor (where its fire will begin); then it sweeps a cone of fire across before it to the other side (`breath` fx:
//   every game turns its copy's head and judges its own hero as the cone passes him, a prop between or a shield raised
//   towards it saving him), leaving the ground burning along it (the charge's `fire`). The wood it touches (stumps,
//   logs, young trees: a breakable prop of `wood`) is set alight by the host (`woodFire` fx): it burns `forestFire.life`
//   s, `forestFire.most` at once (the oldest put out first), each a pooled light, hurting a hero beside it; after, a
//   scorch at its foot, the wood as it was. No two of its warned hits land within `breath.gap` of another boss's
//   (`claimBeat`), and no ember falls while it breathes.
// - **Phase 2** (under half its life): it sheds its antlers (its phase's `enter`, where simulated: a warned smash,
//   `shed`, its antlers driven into the earth before it, a hero in its ring hurt; at the smash every game's copy sheds
//   them, `antlerShed` fx, its model's antlers at no size, and they fly out as burning stakes from its model's pool
//   that stick in the floor: each a prop raised in the fight, `raiseProp`, which paths, bodies and shots meet and
//   breaks under `shed.hits` hits, its life told to every game by where it stands, `stakeLife` fx; gone after
//   `shed.life` s; burning a hero who touches it, each game its own). After the shed it neither gores nor tosses: a
//   quick hoof strike in their place (`strike`). A charge that met nothing wheels round twice, its fire lasts longer
//   (`fire.late`), so the floor it leaves free shrinks, and embers rain round the heroes.
// It walks at a hero between charges. A lure never draws it (`EnemyDef.ignoresLures`). Every attack goes through
// enemyAI's `fx`: the host decides the charge and what it meets (a partner's raised shield as the host's copy of him
// shows it), and each game judges its own hero against the fire, the gore, the stamp, the toss and the embers
// (`hurtPlayer`).
import * as THREE from 'three';
import { G } from '../state';
import { STAG } from '../data/foes/stag';
import { BLOCK } from '../data/balance';
import { hurtPlayer } from '../combat/damage';
import { addEffect, decal, fireLine, groundFlash, laneMark, shockwave, telegraph } from '../fx/effects';
import { burst, col, debris, particles, smokePuff } from '../fx/particles';
import { flash, flashFree, release, type LightSlot } from '../fx/lights';
import { addShake } from '../core/renderer';
import { sfx } from '../core/audio';
// (the Rootmother's wood groaning and canopy's rush: its charge's warning and its second phase's flare)
import { rootSounds } from '../core/sounds/rootmother';
import { groundHeight } from '../world/ground';
import { inObstacle, resolveWorld } from '../world/collision';
import { lineClear } from '../world/navigation';
import { pastWall } from '../world/edge';
import { rand, randInt } from '../util';
import { claimBeat, openWeak, telegraphed, telegraphTime } from './bossKit';
import { bossHooks } from './bossHooks';
import { chase, fx } from './enemyAI';
import type { Enemy } from './enemy';
import type { Player } from './player';
import type { Obstacle } from '../types';
import { KICK, NO_SIZE, STAKES, STAKE_LENGTH } from './models/stag';
import { lowerProp, meshLook, raiseProp, setPropLife, type Prop } from '../world/destructible';

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
 *  (the toss, the gore, the stamp), a charge at a hero far enough off whenever it may, and a walk at the hero between; phase 2's
 *  embers. It never stands: between its attacks it's turning onto him or walking at him. */
export function stagAI(e: Enemy, dt: number): void {
  const b = e.brain;
  e.desired.set(0, 0, 0);
  b.chargeT = (b.chargeT ?? 2) - dt;
  // (how long no hero has come within its charge's reach: past `farFor`, it charges again sooner)
  const near = heroes().some((p) => Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z) < S.charge.near + e.radius);
  b.farT = near ? 0 : (b.farT ?? 0) + dt;
  b.breathT = (b.breathT ?? 3) - dt;
  if (e.bossPhase >= 1 && e.action?.name !== 'breath') rainEmbers(e, dt);
  if (e.target) watchTurn(e, e.target, dt);
  if (RUNS.has(e)) { runOn(e, dt); return; }
  if (e.action) { b.goT = 0; track(e, dt); lunge(e); return; }
  if (e.cd > 0) { b.goT = 0; return; }
  // (its second phase begun: its antlers shed first, as soon as it's free)
  if (b.shedDue && !b.shed) { shedAntlers(e); return; }
  const p = e.target!, d = Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
  e.faceTo(p.pos.x, p.pos.z);
  // (up close: within its gore's reach, or behind it within its kick's)
  const behind = angleOff(Math.atan2(p.pos.x - e.pos.x, p.pos.z - e.pos.z), e.facing) > Math.PI - S.kick.arc;
  if (d < e.radius + p.radius + (behind ? S.kick.reach : S.gore.reach)) { closeIn(e, p, d, dt); return; }
  if (mayBreathe(e, d)) { breathe(e, p); return; }
  if (b.chargeT <= 0 && d >= S.charge.near) {
    b.again = 0;
    pawAt(e, 'charge', p);
    return;
  }
  // (a hero far round it, after it stood breathing or striking: turned onto him on the spot first, then walked at;
  // walked at turning hard, two hooves came to their reach at once and one bore it, `lab boss --parts stagStride`)
  const want = Math.atan2(p.pos.x - e.pos.x, p.pos.z - e.pos.z), off = angleOff(want, e.facing);
  if (off > TURN_FIRST) {
    const side = Math.sign(Math.atan2(Math.sin(want - e.facing), Math.cos(want - e.facing)));
    e.facing = e.targetFacing = e.facing + side * Math.min(off, S.close.turn * dt);
    b.goT = 0;
    return;
  }
  chase(e);
  // (setting off from a stand, its walk built up over `SET_OFF` s: at full pace at once, after a breath its hooves
  // fell behind and two stepped at once as a third swung, and one bore it)
  b.goT = Math.min(1, (b.goT ?? 0) + dt / SET_OFF);
  e.desired.multiplyScalar(0.3 + 0.7 * b.goT);
}

/** how far off its facing a hero it walks at may be before it turns onto him on the spot first (rad), and how long
 *  its walk takes to build up from a stand (s) */
const TURN_FIRST = 0.8, SET_OFF = 0.8;

/** Its next charge's wait (s): sooner while no hero has come near it for `farFor` s. */
const chargeWait = (e: Enemy): number => ((e.brain.farT ?? 0) > S.charge.farFor ? S.charge.far : S.charge.every);

/** Where simulated, through a warning: turned after its target at the attack's `track` rad/s, but its last `lock` s
 *  (the charge's to where he'll be as it reaches him, `lead`); the charge's lane locked as its `lock` begins. */
function track(e: Enemy, dt: number): void {
  const a = e.action!, p = e.target;
  if (!p?.active) return;
  const turn = a.name === 'gore' ? S.gore : a.name === 'stamp' ? S.stamp : a.name === 'kick' ? S.kick
    : a.name === 'strike' ? S.strike
    : a.name === 'charge' || a.name === 'again' ? S.charge : null;
  if (!turn) return;
  const warn = e.def.bossKit!.attacks![a.name].warn, left = warn - a.t;
  if (left <= turn.lock) return;
  const at = a.name === 'charge' || a.name === 'again' ? ledTo(e, p) : p.pos;
  // (a kick's haunches swung onto him: its facing turned away from him)
  const want = Math.atan2(at.x - e.pos.x, at.z - e.pos.z) + (a.name === 'kick' ? Math.PI : 0);
  const off = Math.atan2(Math.sin(want - e.facing), Math.cos(want - e.facing));
  const step = Math.max(-turn.track * dt, Math.min(turn.track * dt, off));
  e.facing = e.targetFacing = e.facing + step;
}

/** How fast its target's way turns (rad/s), watched frame by frame and eased over `TURN_EASE` s: a hero running
 *  round it is met where his curve takes him, not on the straight line off it (aimed on along his way alone, a charge
 *  at a hero circling it 13 m off passed 3 m outside him every time). */
function watchTurn(e: Enemy, p: Player, dt: number): void {
  const b = e.brain, speed = Math.hypot(p.vel.x, p.vel.z);
  if (speed < 0.5 || dt <= 0) { b.heroTurn = 0; b.heroWay = NaN; return; }
  const way = Math.atan2(p.vel.x, p.vel.z);
  const turned = !Number.isFinite(b.heroWay ?? NaN) ? 0 : Math.atan2(Math.sin(way - b.heroWay), Math.cos(way - b.heroWay)) / dt;
  b.heroWay = way;
  b.heroTurn = (b.heroTurn ?? 0) + (Math.max(-3, Math.min(3, turned)) - (b.heroTurn ?? 0)) * Math.min(1, dt / TURN_EASE);
}
/** how long its watch of a hero's turning is eased over (s) */
const TURN_EASE = 0.3;

/** Where simulated, through the last of a toss's warning (from `toss.lungeFrom` of it): driven on along its facing
 *  `toss.lunge` m in all, short of a prop or the wall before it (a step back doesn't dodge it; a step aside does). */
function lunge(e: Enemy): void {
  const a = e.action!;
  if (a.name !== 'toss') return;
  const w = S.toss, warn = e.def.bossKit!.attacks!.toss.warn;
  if (a.t < warn * w.lungeFrom || a.t >= warn) return;
  const dx = Math.sin(e.facing), dz = Math.cos(e.facing);
  const ax = e.pos.x + dx * e.radius * AHEAD, az = e.pos.z + dz * e.radius * AHEAD;
  if (inObstacle({ x: ax, z: az }, 0.35) || atWall(ax, az)) return;
  e.desired.set(dx, 0, dz).multiplyScalar(w.lunge / (warn * (1 - w.lungeFrom)));
}

/** Where hero `p` will be as a charge locked now reaches him: on along his way, turning as he turns (`watchTurn`), by
 *  `lead` of the time it takes (its lane's lock and its run to him; found twice, the run's to where he'll be). */
function ledTo(e: Enemy, p: Player): THREE.Vector3 {
  const speed = Math.hypot(p.vel.x, p.vel.z), way = Math.atan2(p.vel.x, p.vel.z), turn = e.brain.heroTurn ?? 0;
  _led.set(p.pos.x, 0, p.pos.z);
  for (let i = 0; i < 2; i++) {
    const d = Math.hypot(_led.x - e.pos.x, _led.z - e.pos.z);
    const time = (S.charge.lock + d / S.charge.speed) * S.charge.lead;
    let dx = Math.sin(way) * speed * time, dz = Math.cos(way) * speed * time;
    if (Math.abs(turn) > 0.02) {
      const r = speed / turn;
      dx = r * (Math.cos(way) - Math.cos(way + turn * time));
      dz = r * (Math.sin(way + turn * time) - Math.sin(way));
    }
    _led.set(p.pos.x + dx, 0, p.pos.z + dz);
  }
  return _led;
}
const _led = new THREE.Vector3();

/** A hero up close: kicked where he stands behind it; turned onto him first where he's beside it (at `close.turn`);
 *  the toss every third attack where he stands before it and near enough, the stamp where he's under it, else the
 *  gore. */
function closeIn(e: Enemy, p: Player, d: number, dt: number): void {
  const b = e.brain, want = Math.atan2(p.pos.x - e.pos.x, p.pos.z - e.pos.z), off = angleOff(want, e.facing);
  // (behind it: kicked, not turned onto)
  if (off > Math.PI - S.kick.arc && d < e.radius + p.radius + S.kick.reach) { kick(e); return; }
  if (off > S.gore.arc) {
    const side = Math.sign(Math.atan2(Math.sin(want - e.facing), Math.cos(want - e.facing)));
    e.facing = e.targetFacing = e.facing + side * Math.min(off, S.close.turn * dt);
    return;
  }
  const turn = b.closeN ?? 0;
  b.closeN = turn + 1;
  // (its antlers shed: no gore or toss, its fore hooves struck down in their place)
  if (b.shed) {
    if (d < e.radius + p.radius + S.stamp.reach) stamp(e);
    else hoofStrike(e);
    return;
  }
  if (turn % 3 === 2 && off < S.toss.arc && d < e.radius + p.radius + S.toss.reach) toss(e);
  else if (d < e.radius + p.radius + S.stamp.reach) stamp(e);
  else gore(e);
}

/** the moment it rests between two attacks up close (s) */
const rest = (): number => rand(S.close.rest[0], S.close.rest[1]);

/** Its head drawn up and back, then dropped and raked through the hero before it (`antlerGore` fx as its antlers come
 *  down: each game judges its own hero against its copy's tines as they pass). */
function gore(e: Enemy): void {
  telegraphed(e, 'gore', () => fx('antlerGore', e.id, e.damage));
  e.cd = telegraphTime(e, 'gore') + rest();
}

/** Reared over the hero under it, its fore hooves stamped down where he stood (`stamp` fx as they land). */
function stamp(e: Enemy): void {
  telegraphed(e, 'stamp', () => fx('stamp', e.id, e.damage));
  e.cd = telegraphTime(e, 'stamp') + rest();
}

/** Its antlers shed: a short rear, then its fore hooves struck down on the hero before it (`hoofStrike` fx as they
 *  land: each game judges its own hero against its copy's drawn fore hooves). */
function hoofStrike(e: Enemy): void {
  telegraphed(e, 'strike', () => fx('hoofStrike', e.id, e.damage));
  e.cd = telegraphTime(e, 'strike') + rest() * 0.6;
}

/** Its antlers smashed into the earth before it and broken off (its second phase's: `shedDue`): a ring where they
 *  strike through its warning, and at the smash (`antlerShed` fx) the stakes they break into thrown out to where the
 *  host finds room for each (clear of the props, the wall and each other). */
function shedAntlers(e: Enemy): void {
  const w = S.shed, b = e.brain;
  b.shed = 1;
  const dx = Math.sin(e.facing), dz = Math.cos(e.facing);
  const at = { x: e.pos.x + dx * w.ahead, z: e.pos.z + dz * w.ahead };
  telegraphed(e, 'shed', () => {
    const spots = stakeSpots(at.x, at.z, e.facing);
    fx('antlerShed', e.id, at.x, at.z, e.damage, ...spots);
  }, { x: at.x, z: at.z, radius: w.near, color: EMBER });
  e.cd = telegraphTime(e, 'shed');
}

/** Where its stakes stick (x, z each, `STAKES` of them): out from (x, z) round its facing, each `shed.out` m off, clear
 *  of the props, the wall and the others; a stake with no room found sticks where it broke. */
function stakeSpots(x: number, z: number, facing: number): number[] {
  const w = S.shed, spots: number[] = [];
  for (let i = 0; i < STAKES; i++) {
    let sx = x, sz = z;
    for (let tries = 0; tries < 24; tries++) {
      const a = facing + (i / STAKES - 0.5 + 1 / (STAKES * 2)) * Math.PI * 1.6 + rand(-0.25, 0.25);
      const r = rand(w.out[0], w.out[1]), tx = x + Math.sin(a) * r, tz = z + Math.cos(a) * r;
      const apart = spots.every((_, k) => k % 2 || Math.hypot(spots[k] - tx, spots[k + 1] - tz) > 2);
      if (!inObstacle({ x: tx, z: tz }, w.stake + 0.6) && !atWall(tx, tz, 2) && apart) {
        sx = tx;
        sz = tz;
        break;
      }
    }
    spots.push(sx, sz);
  }
  return spots;
}

/** Its weight thrown onto its fore legs, its haunches gathered, then both hind hooves driven back (`kick` fx as they
 *  go: each game judges its own hero against its copy's drawn hind hooves). */
function kick(e: Enemy): void {
  telegraphed(e, 'kick', () => fx('kick', e.id, e.damage));
  e.cd = telegraphTime(e, 'kick') + rest();
}

/** Whether it may breathe at a hero `d` m off its middle: in the breath's band, its own wait out, and no other warned
 *  hit landing near its sweep (`claimBeat`, taken as it begins). */
function mayBreathe(e: Enemy, d: number): boolean {
  const w = S.breath, past = d - e.radius;
  if ((e.brain.breathT ?? 0) > 0 || past < w.least || past > w.most) return false;
  return claimBeat(e.def.bossKit!.attacks!.breath.warn, w.gap, w.time);
}

/** Its breath drawn at `p`: its line its facing to him, its sweep from one side of it to the other (either way), the
 *  side it begins on burning onto the floor through its warning (`breathAim` fx), then swept (`breath` fx). */
function breathe(e: Enemy, p: Player): void {
  const w = S.breath, at = Math.atan2(p.pos.x - e.pos.x, p.pos.z - e.pos.z), side = Math.random() < 0.5 ? -1 : 1;
  const from = at - side * w.sweep / 2, to = at + side * w.sweep / 2;
  e.facing = e.targetFacing = at;
  const warn = e.def.bossKit!.attacks!.breath.warn;
  fx('breathAim', e.id, e.pos.x, e.pos.z, from, to, warn);
  telegraphed(e, 'breath', () => fx('breath', e.id, e.pos.x, e.pos.z, from, to, e.damage));
  e.cd = telegraphTime(e, 'breath');
  e.brain.breathT = w.every;
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

/** The earth pawed through attack `name`'s warning as it turns after `p` (`track`); its lane locked and burnt onto
 *  the floor towards where he'll be (`ledTo`) `charge.lock` s before it runs, then it runs along it. */
function pawAt(e: Enemy, name: 'charge' | 'again', p: Player): void {
  const warn = e.def.bossKit!.attacks![name].warn, dur = telegraphTime(e, name);
  const lane = { angle: e.facing, length: S.charge.least };
  const lock = (): void => {
    const to = e.target?.active ? ledTo(e, e.target) : p.pos;
    lane.angle = e.facing = e.targetFacing = Math.atan2(to.x - e.pos.x, to.z - e.pos.z);
    const d = Math.hypot(to.x - e.pos.x, to.z - e.pos.z);
    lane.length = Math.min(S.charge.most, Math.max(S.charge.least, d + S.charge.over));
    fx('chargeLane', e.id, e.pos.x, e.pos.z, lane.angle, lane.length, Math.min(warn, S.charge.lock));
  };
  telegraphed(e, name, () => setOff(e, lane.angle, lane.length), undefined,
    [[Math.max(0, warn - S.charge.lock) / dur, lock]]);
  e.cd = dur;
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

/** Its run out without meeting anything: its fire laid to its end; it wheels round and charges again, `charge.again`
 *  times running (once in phase 1, twice in phase 2), so a hero who stepped out of its lane has to step out again. */
function stop(e: Enemy, run: Run): void {
  layFire(e, run, along(e, run));
  RUNS.delete(e);
  e.cancelAction();
  const p = e.target;
  const again = e.brain.again ?? 0;
  if (again < S.charge.again[e.bossPhase >= 1 ? 1 : 0] && p?.active) {
    e.brain.again = again + 1;
    pawAt(e, 'again', p);
    return;
  }
  e.cd = 1.1;
  e.brain.chargeT = chargeWait(e);
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
  e.brain.chargeT = chargeWait(e) + S.charge.stun;
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
  rootSounds.groan(warn * 0.8);
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

/** What the lab reads of a close attack as this game judged it: its kind, when, the nearest its drawn tines or hooves
 *  came to this game's hero's body (m), and whether it struck him. */
export interface CloseBlow { what: 'gore' | 'stamp' | 'kick' | 'strike'; t: number; nearest: number; struck: boolean }
/** the latest close blows on this game, the newest last */
export const BLOWS: CloseBlow[] = [];
const keepBlow = (b: CloseBlow): void => {
  BLOWS.push(b);
  if (BLOWS.length > 16) BLOWS.shift();
};

/** How near point `at` comes to hero `p`'s body (m): a capsule his radius round from his feet to his head. */
function offBody(p: Player, at: THREE.Vector3): number {
  const floor = groundHeight(p.pos.x, p.pos.z) + (p.lift ?? 0), top = floor + p.model.height;
  const y = Math.max(floor, Math.min(top, at.y));
  return Math.max(0, Math.hypot(at.x - p.pos.x, at.z - p.pos.z, at.y - y) - p.radius);
}

/** Its antlers raked down and through before it (`antlerGore` fx, as they come down): sparks and earth where they rake, and
 *  this game's hero struck if its copy's drawn tines pass within `gore.tines` of his body over the `gore.window` s they
 *  come through (a shield raised towards it takes it), knocked on along its facing. */
export function antlerGoreAt(id: number, damage: number): void {
  const foe = foeOf(id), w = S.gore;
  if (!foe) return;
  const tips = foe.model.root.userData.antlerTips as THREE.Object3D[] | undefined;
  const blow: CloseBlow = { what: 'gore', t: G.time, nearest: Infinity, struck: false };
  keepBlow(blow);
  sfx.swing();
  addShake(0.25);
  const at = new THREE.Vector3();
  let t = 0, sparked = false;
  addEffect({
    update(dt) {
      t += dt;
      const p = G.player;
      if (!foe.alive || !tips?.length) return false;
      for (const tip of tips) {
        tip.getWorldPosition(at);
        if (!sparked && at.y - groundHeight(at.x, at.z) < 0.5) {
          // (where its antlers rake the earth: dug up and sparking)
          sparked = true;
          debris(at, { count: 10, speed: 4, size: 0.16 });
          burst(at, { count: 14, color: 0xffa040, colorEnd: 0xff3010, speed: 3.5, up: 2.5, life: 0.5, size: 0.18 });
        }
        if (!p.active || blow.struck) continue;
        const near = offBody(p, at);
        blow.nearest = Math.min(blow.nearest, near);
        if (near > w.tines) continue;
        blow.struck = true;
        hurtPlayer(p, damage * w.hurt, 'physical', foe.pos.clone(), { foe, attack: 'antlers' });
        const rx = p.pos.x - foe.pos.x, rz = p.pos.z - foe.pos.z, d = Math.max(0.1, Math.hypot(rx, rz));
        p.knock.set((rx / d) * w.knock, 0, (rz / d) * w.knock);
      }
      return t < w.window;
    },
  });
}

/** Its fore hooves stamped down (`stamp` fx, as they land): the earth thrown up under each, and this game's hero
 *  struck within `stamp.radius` of either drawn fore hoof (a shield raised towards it takes it), knocked off. */
export function stampAt(id: number, damage: number, what: 'stamp' | 'strike' = 'stamp'): void {
  const foe = foeOf(id), w = what === 'strike' ? S.strike : S.stamp;
  if (!foe) return;
  const hooves = foe.model.root.userData.foreHooves as THREE.Object3D[] | undefined;
  const blow: CloseBlow = { what, t: G.time, nearest: Infinity, struck: false };
  keepBlow(blow);
  sfx.slam();
  addShake(0.4);
  const p = G.player;
  const at = new THREE.Vector3();
  for (const hoof of hooves ?? []) {
    hoof.getWorldPosition(at);
    const floor = new THREE.Vector3(at.x, groundHeight(at.x, at.z), at.z);
    debris(floor, { count: 12, speed: 5, size: 0.18 });
    smokePuff(floor, { count: 3, color: 0x2a2018, alpha: 0.45, size: 0.9, sizeEnd: 2.4, speed: 1.6, life: 0.9 });
    shockwave(floor, { color: EMBER, intensity: 1.1, from: 0.2, to: w.radius, life: 0.35 });
    if (!p.active) continue;
    blow.nearest = Math.min(blow.nearest, Math.hypot(p.pos.x - at.x, p.pos.z - at.z) - p.radius);
  }
  if (!p.active || blow.nearest > w.radius) return;
  blow.struck = true;
  hurtPlayer(p, damage * w.hurt, 'physical', foe.pos.clone(), { foe, attack: 'hooves' });
  const rx = p.pos.x - foe.pos.x, rz = p.pos.z - foe.pos.z, d = Math.max(0.1, Math.hypot(rx, rz));
  p.knock.set((rx / d) * w.knock, 0, (rz / d) * w.knock);
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
 *  arena) and of the first prop in the way (never through a tree or onto a rock), and clear of the props. */
function landing(from: THREE.Vector3, dx: number, dz: number, radius: number): THREE.Vector3 {
  const at = from.clone();
  for (let r = 0.5; r <= S.toss.far; r += 0.5) {
    const x = from.x + dx * r, z = from.z + dz * r;
    if (atWall(x, z, radius + 1) || (r > 1 && inObstacle({ x, z }, radius + 0.2))) break;
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
  // (thrown: airborne, and nothing else lands on him till he's down)
  p.flying = f < 1;
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
  G.player.flying = false;
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

/** Both its hind hooves driven back (`kick` fx, as they go out): earth thrown up behind it, and this game's hero struck
 *  within `kick.radius` of either drawn hind hoof (no shield takes it), knocked far off. */
export function kickAt(id: number, damage: number): void {
  const foe = foeOf(id), w = S.kick;
  if (!foe) return;
  const hooves = foe.model.root.userData.hindHooves as THREE.Object3D[] | undefined;
  const blow: CloseBlow = { what: 'kick', t: G.time, nearest: Infinity, struck: false };
  keepBlow(blow);
  sfx.slam();
  addShake(0.35);
  const p = G.player, at = new THREE.Vector3();
  for (const hoof of hooves ?? []) {
    hoof.getWorldPosition(at);
    debris(new THREE.Vector3(at.x, groundHeight(at.x, at.z), at.z), { count: 10, speed: 5, size: 0.16 });
    burst(at, { count: 8, color: 0xffa040, colorEnd: 0xff3010, speed: 3, up: 1.5, life: 0.4, size: 0.16 });
    if (p.active && !p.airborne) blow.nearest = Math.min(blow.nearest, offBody(p, at));
  }
  if (!p.active || blow.nearest > w.radius) return;
  blow.struck = true;
  hurtPlayer(p, damage * w.hurt, 'physical', foe.pos.clone(), { foe, attack: 'kick' });
  const rx = p.pos.x - foe.pos.x, rz = p.pos.z - foe.pos.z, d = Math.max(0.1, Math.hypot(rx, rz));
  p.knock.set((rx / d) * w.knock, 0, (rz / d) * w.knock);
}

/** its breath's orange, and its white-hot heart */
const BREATH = { color: 0xff8a2a, core: 0xffe0a0 };
/** An angle brought within a half turn either way (rad). */
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** Its breath drawn (`breathAim` fx): the line where its fire will begin, from its middle at (x, z) along `from`,
 *  burning onto the floor through its `warn` s, and its head turned that way as it draws breath. */
export function breathAimAt(id: number, x: number, z: number, from: number, to: number, warn: number): void {
  const foe = foeOf(id);
  const lane = laneMark(x, z, from, S.breath.reach, 1.6, warn, BREATH.color);
  foe?.onDeath.push(() => lane.cancel());
  foe?.onDazed.push(() => lane.cancel());
  const turned = foe?.model.root.userData.breath as { turn: number } | undefined;
  if (turned) turned.turn = wrap(from - (from + to) / 2);
  rootSounds.groan(warn);
}

/** What the lab reads of a breath as this game judged it: when, whether its cone passed over this game's hero, and
 *  whether it burnt him (no prop between, no shield raised towards it). */
export interface Breathed { t: number; over: boolean; struck: boolean; blocked: boolean }
/** the latest breaths on this game, the newest last */
export const BREATHS: Breathed[] = [];

/** Its breath swept from `from` to `to` from its middle at (x, z) (`breath` fx): its head turned with the fire, flames
 *  streaming from its muzzle, this game's hero burnt once as the cone passes over him (a prop between, or his shield
 *  raised towards it, saves him), the ground left burning along it; where simulated, the wood it touches set alight
 *  (`woodFire` fx). One pooled light at its muzzle while it breathes, held steady. */
export function breathAt(id: number, x: number, z: number, from: number, to: number, damage: number): void {
  const foe = foeOf(id), w = S.breath, mid = (from + to) / 2;
  const mouth = foe?.model.root.userData.mouth as THREE.Object3D | undefined;
  const turned = foe?.model.root.userData.breath as { turn: number } | undefined;
  const judged: Breathed = { t: G.time, over: false, struck: false, blocked: false };
  BREATHS.push(judged);
  if (BREATHS.length > 8) BREATHS.shift();
  const lit = new Set<number>(), at = new THREE.Vector3();
  const light = flashFree({ color: BREATH.color, intensity: 14, distance: 10, life: 0.4, hold: w.time,
    follow: () => (mouth ? mouth.getWorldPosition(at) : at.set(x, 3, z)) });
  sfx.rush();
  addShake(0.3);
  let t = 0, laid = 0;
  addEffect({
    update(dt) {
      t += dt;
      if (!foe?.alive || foe.dazed > 0) return false;
      const k = Math.min(1, t / w.time), angle = from + (to - from) * k;
      if (turned) turned.turn = wrap(angle - mid);
      stream(mouth, angle, x, z);
      // (the ground left burning along it, a line each `step` rad it has swept)
      while (laid <= k * w.sweep / w.step + 1e-6) {
        const a = from + Math.sign(to - from) * laid * w.step, dx = Math.sin(a), dz = Math.cos(a);
        const near = (foe.radius ?? 2) + 0.6, far = w.reach * 0.85;
        fireAt(id, x + dx * near, z + dz * near, x + dx * far, z + dz * far, w.burn, damage);
        laid++;
      }
      burnHero(foe, judged, x, z, angle, damage);
      if (!foe.net) lightWood(foe, lit, x, z, angle, damage);
      return k < 1;
    },
    dispose() { release(light); if (turned) turned.turn = 0; },
  });
}

/** A frame of its breath's flames: streaming out of its muzzle along `angle`, spreading as they go, smoke over them. */
function stream(mouth: THREE.Object3D | undefined, angle: number, x: number, z: number): void {
  const from = mouth ? mouth.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(x, 3, z);
  const dx = Math.sin(angle), dz = Math.cos(angle);
  for (let i = 0; i < 8; i++) {
    const spread = (Math.random() - 0.5) * S.breath.cone * 2, speed = 13 + Math.random() * 8;
    const sx = Math.sin(angle + spread), sz = Math.cos(angle + spread);
    particles.glow.spawn({
      x: from.x + dx * 0.2, y: from.y, z: from.z + dz * 0.2,
      vx: sx * speed, vy: -2 - Math.random() * 2, vz: sz * speed,
      life: 0.5 + Math.random() * 0.3, size: 0.22, sizeEnd: 0.8,
      color: col(i < 2 ? BREATH.core : BREATH.color, 2.2), colorEnd: col(0xff3010, 0.8), gravity: -1, drag: 1.2,
    });
  }
  if (Math.random() < 0.3) {
    const k = 4 + Math.random() * 6;
    smokePuff(new THREE.Vector3(x + dx * k, 1.5, z + dz * k), { count: 1, color: 0x231c18, alpha: 0.35, size: 1, sizeEnd: 3, speed: 0.5, rise: 1.6, life: 1.4 });
  }
}

/** This game's hero, once a breath, burnt where its cone sweeping along `angle` from (x, z) passes over him: no prop
 *  between him and it, no shield raised towards it. */
function burnHero(foe: Enemy, judged: Breathed, x: number, z: number, angle: number, damage: number): void {
  const p = G.player, w = S.breath;
  if (judged.over || !p.active || p.airborne) return;
  const rx = p.pos.x - x, rz = p.pos.z - z, d = Math.hypot(rx, rz);
  if (d > w.reach + p.radius || angleOff(Math.atan2(rx, rz), angle) > w.cone + Math.atan2(p.radius, Math.max(0.5, d))) return;
  judged.over = true;
  if (!lineClear(x, z, p.pos.x, p.pos.z, 0.2)) return;
  if (p.shieldRaised && angleOff(Math.atan2(-rx, -rz), p.facing) < BLOCK.arc) {
    judged.blocked = true;
    sfx.shieldBlock();
    return;
  }
  judged.struck = true;
  hurtPlayer(p, damage * w.hurt, 'fire', new THREE.Vector3(x, 0, z), { foe, attack: 'breath' });
}

/** Where simulated: the wood its breath's cone along `angle` from (x, z) touches set alight, once a breath each. */
function lightWood(foe: Enemy, lit: Set<number>, x: number, z: number, angle: number, damage: number): void {
  const w = S.breath;
  for (const o of G.arena.obstacles) {
    const prop = o.prop;
    if (!prop || prop.kind !== 'wood' || prop.broken || lit.has(prop.id)) continue;
    const rx = o.x - x, rz = o.z - z, d = Math.hypot(rx, rz);
    if (d > w.reach + o.r || angleOff(Math.atan2(rx, rz), angle) > w.cone + Math.atan2(o.r, Math.max(0.5, d))) continue;
    lit.add(prop.id);
    fx('woodFire', foe.id, o.x, o.z, damage);
  }
}

/** A piece of wood alight: its prop, until when it burns, its light, and its effect's end. */
export interface Burning { parts: Obstacle[]; until: number; light: LightSlot | null; out(): void }
/** the wood burning on this game, the oldest first */
export const BURNING: Burning[] = [];
let woodBurnt = -Infinity;

/** The wood standing at (x, z) set alight by its breath (`woodFire` fx, the host's say): flames and smoke off it for
 *  `forestFire.life` s and a pooled light while it burns (`forestFire.most` at once, the oldest put out first), this
 *  game's hero burnt beside it every `tick` s; a scorch at its foot after, the wood as it was. */
export function woodFireAt(id: number, x: number, z: number, damage: number): void {
  const w = S.forestFire, foe = foeOf(id);
  const o = G.arena.obstacles.find((c) => c.prop?.kind === 'wood' && Math.hypot(c.x - x, c.z - z) < 0.6);
  const prop = o?.prop;
  if (!prop || prop.broken) return;
  const already = BURNING.find((b) => b.parts === prop.parts);
  if (already) { already.until = G.time + w.life; return; }
  while (BURNING.length >= w.most) BURNING[0].out();
  const top = Math.max(...prop.parts.map((c) => c.h)), mid = prop.parts[Math.floor(prop.parts.length / 2)];
  const light = flashFree({ color: 0xff7a30, intensity: 10, distance: 7, life: 1, hold: w.life,
    pos: { x: mid.x, y: Math.min(3, top * 0.6 + 0.6), z: mid.z } });
  let done = false, flame = 0, smoke = 0;
  const me: Burning = {
    parts: prop.parts, until: G.time + w.life, light,
    out() {
      if (done) return;
      done = true;
      release(light);
      BURNING.splice(BURNING.indexOf(me), 1);
      for (const c of prop.parts) decal({ x: c.x, z: c.z }, { size: c.r * 2.6 + 0.6, life: 12 });
    },
  };
  BURNING.push(me);
  sfx.crumble();
  addEffect({
    update(dt) {
      if (done) return false;
      if (prop.broken || G.time >= me.until) { me.out(); return false; }
      flame -= dt;
      smoke -= dt;
      for (const c of prop.parts) {
        const y = groundHeight(c.x, c.z) + Math.min(c.h, 4) * Math.random();
        if (flame <= 0) burst({ x: c.x + (Math.random() - 0.5) * c.r * 1.6, y, z: c.z + (Math.random() - 0.5) * c.r * 1.6 },
          { count: 6, color: 0xffa040, colorEnd: 0xff3010, speed: 0.7, up: 3.2, life: 0.9, size: 0.5, sizeEnd: 0.08, gravity: -2.5, spread: c.r });
        if (smoke <= 0) smokePuff({ x: c.x, y: y + 0.8, z: c.z }, { count: 1, color: 0x231c18, alpha: 0.4, size: 0.8, sizeEnd: 2.8, speed: 0.4, rise: 1.8, life: 2 });
      }
      if (flame <= 0) flame = 0.06;
      if (smoke <= 0) smoke = 0.35;
      const p = G.player;
      if (p.active && !p.airborne && G.time - woodBurnt >= w.tick
        && prop.parts.some((c) => Math.hypot(p.pos.x - c.x, p.pos.z - c.z) < c.r + w.near + p.radius)) {
        woodBurnt = G.time;
        hurtPlayer(p, damage * w.hurt, 'fire', new THREE.Vector3(p.pos.x, 0, p.pos.z), { foe, attack: 'burning' });
      }
      return true;
    },
    dispose() { me.out(); },
  });
}

/** A stake of its shed antlers standing in the floor on this game: the prop it is, its joint in the stag's model, where
 *  it stands and until when. */
export interface Stake { prop: Prop; joint: THREE.Object3D; x: number; z: number; until: number; out(): void }
/** the stakes standing on this game */
export const STAKES_STANDING: Stake[] = [];
let touched = -Infinity;

/** Its antlers smashed into the earth at (x, z) and broken off (`antlerShed` fx): its copy's antlers shed, earth and
 *  sparks thrown up, a hero in the smash's ring hurt (each game its own), and its stakes thrown out to the spots given
 *  (x, z each), stuck in the floor where they land. */
export function shedAt(id: number, x: number, z: number, damage: number, ...spots: number[]): void {
  const foe = foeOf(id), w = S.shed;
  const shed = foe?.model.root.userData.shed as { done: boolean } | undefined;
  if (shed) shed.done = true;
  const at = new THREE.Vector3(x, groundHeight(x, z), z);
  debris(at, { count: 28, speed: 7, size: 0.22 });
  burst(at.clone().setY(at.y + 0.5), { count: 40, color: 0xffa040, colorEnd: 0xff3010, speed: 7, up: 5, life: 0.9, size: 0.24 });
  smokePuff(at, { count: 8, color: 0x1a1410, alpha: 0.5, size: 1.2, sizeEnd: 3.4, speed: 2, life: 1.5 });
  shockwave({ x, z }, { color: EMBER, intensity: 1.6, from: 0.5, to: w.near * 1.4, life: 0.6 });
  addShake(0.7);
  sfx.crumble();
  sfx.slam();
  const p = G.player;
  if (p.active && !p.airborne && Math.hypot(p.pos.x - x, p.pos.z - z) < w.near + p.radius) {
    hurtPlayer(p, damage * w.hurt, 'physical', at.clone(), { foe, attack: 'antlers' });
    const rx = p.pos.x - x, rz = p.pos.z - z, d = Math.max(0.1, Math.hypot(rx, rz));
    p.knock.set((rx / d) * w.knock, 0, (rz / d) * w.knock);
  }
  const joints = foe?.model.root.userData.stakes as THREE.Object3D[] | undefined;
  for (let i = 0; i + 1 < spots.length; i += 2) {
    const joint = joints?.[i / 2];
    if (foe && joint) throwStake(foe, joint, x, z, spots[i], spots[i + 1], damage);
  }
}

const _stakeTurn = new THREE.Quaternion(), _rootTurn = new THREE.Quaternion(), _local = new THREE.Vector3();

/** Joint `j` of the stag's model placed in the world: its butt at `at`, turned `turn`, at full size. */
function placeJoint(j: THREE.Object3D, at: THREE.Vector3, turn: THREE.Quaternion): void {
  const root = j.parent!;
  root.updateWorldMatrix(true, false);
  j.position.copy(root.worldToLocal(_local.copy(at)));
  root.getWorldQuaternion(_rootTurn);
  j.quaternion.copy(_rootTurn.invert().multiply(turn));
  j.scale.setScalar(1);
}

/** A stake thrown from (x, z) to (tx, tz) over `shed.flight` s, end over end, then stuck in the floor leaning a little
 *  (a prop raised in the fight from then till its life is out or it breaks), its flames burning a hero who touches it. */
function throwStake(foe: Enemy, joint: THREE.Object3D, x: number, z: number, tx: number, tz: number, damage: number): void {
  const w = S.shed, from = new THREE.Vector3(x, groundHeight(x, z) + 2.5, z);
  const to = new THREE.Vector3(tx, groundHeight(tx, tz) - 0.4, tz);
  const lean = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1)).normalize(), rand(0.08, 0.22));
  const spin = new THREE.Vector3(tz - z, 0, -(tx - x)).normalize(), at = new THREE.Vector3();
  let t = 0, stake: Stake | null = null, flame = 0;
  const stick = (): void => {
    const parts = [{ x: tx, z: tz, r: w.stake, h: w.high }];
    const meshes: THREE.Object3D[] = [];
    joint.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o); });
    const look = meshLook(...meshes);
    let ended = false;
    const end = (): void => {
      if (ended) return;
      ended = true;
      joint.scale.setScalar(NO_SIZE);
      const i = STAKES_STANDING.indexOf(me);
      if (i >= 0) STAKES_STANDING.splice(i, 1);
    };
    const prop = raiseProp(parts, w.hits, 0x2a211b, { ...look, hide: end }, 'wood', (life) => fx('stakeLife', tx, tz, life));
    const me: Stake = { prop, joint, x: tx, z: tz, until: G.time + w.life, out() { if (!prop.broken) lowerProp(prop); end(); } };
    STAKES_STANDING.push(me);
    stake = me;
    debris(to.clone().setY(groundHeight(tx, tz)), { count: 10, speed: 4, size: 0.16 });
    sfx.thud();
  };
  addEffect({
    update(dt) {
      t += dt;
      if (!stake) {
        const k = Math.min(1, t / w.flight);
        at.lerpVectors(from, to, k);
        at.y += 4 * k * (1 - k) * 3;
        const turn = _stakeTurn.setFromAxisAngle(spin, (1 - k) * Math.PI * 3).premultiply(lean);
        placeJoint(joint, at, turn);
        if (k >= 1) stick();
        return true;
      }
      const s = stake as Stake;
      if (s.prop.broken || !STAKES_STANDING.includes(s)) return false;
      if (G.time >= s.until || !foe.alive) { s.out(); return false; }
      // (stood where it stuck: its model's joint follows the stag's root about, so it's placed again each frame)
      placeJoint(joint, to, lean);
      flame -= dt;
      if (flame <= 0) {
        flame = 0.12;
        const top = new THREE.Vector3(0, STAKE_LENGTH, 0).applyQuaternion(lean).add(to);
        burst(top, { count: 2, color: 0xffa040, colorEnd: 0xff3010, speed: 0.4, up: 1.6, life: 0.6, size: 0.18, gravity: -1.5 });
      }
      const p = G.player;
      if (p.active && !p.airborne && G.time - touched >= w.tick && Math.hypot(p.pos.x - tx, p.pos.z - tz) < w.stake + w.touch + p.radius) {
        touched = G.time;
        hurtPlayer(p, damage * w.hurtTouch, 'fire', new THREE.Vector3(tx, 0, tz), { foe, attack: 'burning' });
      }
      return true;
    },
    dispose() { (stake as Stake | null)?.out(); if (!stake) joint.scale.setScalar(NO_SIZE); },
  });
}

/** A stake's life as the fight's owner deals it (`stakeLife` fx), found by where it stands: a guest's copy of it. */
export function stakeLifeAt(x: number, z: number, life: number): void {
  const stake = STAKES_STANDING.find((s) => Math.hypot(s.x - x, s.z - z) < 0.3);
  if (stake && !stake.prop.broken) setPropLife(stake.prop, life);
}

// --- its phases (entities/bossKit.ts), and what every game shows of it each frame --------------------------

/** how often its antlers shed smoke and embers as it stands (s), and as it gallops */
const SMOKE_EVERY = 0.12, SMOKE_RUNNING = 0.05;
/** where its antlers burn over its middle (m: up, and forward along its facing) */
const ANTLERS = { y: 6.4, ahead: 1.6 };
/** how much lower its smoke trails off the stubs once its antlers are shed (m) */
const SHED_LOWER = 1.6;
const smokeT = new WeakMap<Enemy, number>();

bossHooks('stag', {
  enter(e, phase) {
    if (phase < 1) return;
    // (its antlers shed as soon as it's free: entities/stag.ts `shedAntlers`)
    e.brain.shedDue = 1;
    e.brain.emberT = 1.2;
    e.brain.chargeT = Math.min(e.brain.chargeT ?? 0, 1.5);
  },
  cue(e, phase) {
    if (phase < 1) return;
    // the ash takes fire: a ring of flame thrown out from it, its embers flaring
    addShake(0.5);
    rootSounds.canopy();
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
    // (its antlers shed: off the stubs on its brow, lower)
    const shed = (e.model.root.userData.shed as { done: boolean } | undefined)?.done ? SHED_LOWER : 0;
    const at = new THREE.Vector3(x, e.obj.position.y + (ANTLERS.y - shed) * (running ? 0.85 : 1) + rand(0, 0.6), z);
    smokePuff(at, { count: 1, color: 0x231c18, alpha: 0.35, size: 0.7, sizeEnd: 2.6, speed: 0.3, rise: 1.4, life: running ? 1.2 : 2.2 });
    if (Math.random() < 0.6) burst(at, { count: 1, color: 0xffa040, colorEnd: 0xff3010, speed: 0.6, up: 1.4, life: 0.9, size: 0.12, sizeEnd: 0.03, gravity: -0.5 });
  },
});
