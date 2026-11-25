// The Stag of Ash's fight (tools/lab `boss`, its parts beside the other bosses' in page/boss.ts; entities/stag.ts).
// It's risen in the Thornwood 13 m from the hero, on a lane chosen for each case, and let charge him.
//
// - `stagCharge`: on open ground: its lane burnt onto the floor towards where the hero stood as it began to paw, its
//   run setting off as its warning ends, the hero standing in the lane gored once, the run carried on to its length
//   (`over` m past him, within `least`..`most`), the fire laid along the way it ran, the hero put in that fire burnt
//   once every `tick` s, and the fire gone after its `life`.
// - `stagCrash`: a charge at a hero standing before the wall, and one at a hero behind a rock or a tree: each must
//   crash, the stag stunned `stun` s and taking `taken` times the damage meanwhile, the hero never gored. With a
//   shield (`--class warrior --gear shield`), the hero raising it towards the charge in the open: it crashes into the
//   shield and he takes no hurt.
// - `stagPhase2`: its life under its second phase's share: a charge that meets nothing wheels round and charges
//   again (the `again` warning) at once, its fire lasting `late` s, and embers falling round the hero, `count` every
//   `every` s.
//
// `stagCompiles` (part of `compiles`) draws every effect of its fight; `stagTtkLines` (part of `ttk`) its time to kill
// at wave 15. `stagPictures` (asked for alone): the stag and each stage of its fight for the eye, and its triangles.
// `--canary` plants a fault in each part: a fire that burns no one, a crash that stuns nothing, a second phase's share
// moved.
import * as THREE from 'three';
import type { Frame, Lab, Pictured } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import type { SkillKey } from '../../../src/types';
import { G } from '../../../src/state';
import { ENEMIES, SCALING } from '../../../src/data/enemies';
import { STAG } from '../../../src/data/foes/stag';
import { damageTaken, forgetBeats } from '../../../src/entities/bossKit';
import { FX, fx } from '../../../src/entities/enemyAI';
import { CRASH, FIRES, RUNS, tossed } from '../../../src/entities/stag';
import { inObstacle } from '../../../src/world/collision';
import { pastWall } from '../../../src/world/edge';
import { hurtPlayer } from '../../../src/combat/damage';
import type { Obstacle } from '../../../src/types';
import { PIPELINES } from '../../../src/engine/pipelinesAside';
import { pressing } from './cast';
import { drawOdd, fixed, standIn, type BossOptions } from './boss';
import { modelTriangles, rootTimeToKill } from './bossRootmother';
import { frameLine, timeFrames } from './bossFrameTimes';

/** frames a second on the lab's clock (boss.ts imports this module: its own constant isn't made yet as this loads) */
const FPS = 60;
/** frames on the lab's clock in seconds */
const secondsOf = (frames: number): number => frames / FPS;

/** how far from the hero it rises (m), and how much room either side of its way a lane must have (m) */
const AWAY = 13;
const ROOM = 2.4;
/** the most frames it takes to rise, and a charge to be pawed, run and done */
const RISE_FRAMES = 200;
const CHARGE_FRAMES = 6 * FPS;
/** how far off its warning the run may set off (frames), and off its stun its stun may be (s) */
const SET_OFF_SLACK = 3;
const STUN_SLACK = 0.1;
/** how long the hero is held in its fire (s), and how many burns either side of that over the tick it may take */
const BURN_HOLD = 2;
const BURN_SLACK = 1;
/** how long phase 2 is followed for its embers (s) */
const EMBERS_HOLD = 8;
/** the share of its life its second phase is measured at */
const LATE = 0.45;

const _n = new THREE.Vector3();

/** A lane for a case: where the hero stands, where the stag rises, and the way from it to him. */
export interface Lane { hero: THREE.Vector3; stag: THREE.Vector3; way: THREE.Vector3; prop?: Obstacle }

/** Whether a body `ROOM` m wide goes clear along from `from` along `way` for `length` m (no prop, the wall out of
 *  reach), but for `skip` (a prop a case means it to meet). */
function clearAlong(from: THREE.Vector3, way: THREE.Vector3, length: number, skip?: { x: number; z: number }): boolean {
  for (let d = 0; d <= length; d += 0.5) {
    const at = from.clone().addScaledVector(way, d);
    if (pastWall(G.arena.biome, at.x, at.z, _n).by > -ROOM) return false;
    const props = G.arena.obstacles.filter((o) => o !== skip);
    if (props.some((o) => Math.hypot(at.x - o.x, at.z - o.z) < o.r + ROOM)) return false;
  }
  return true;
}

/** A lane in the open: the stag `AWAY` m from the hero, its whole charge's length clear. */
export function openLane(): Lane {
  const length = Math.min(STAG.charge.most, AWAY + STAG.charge.over) + 1;
  for (let r = 4; r < 20; r += 2) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
      const hero = new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r);
      for (let b = 0; b < Math.PI * 2; b += Math.PI / 12) {
        const way = new THREE.Vector3(Math.sin(b), 0, Math.cos(b));
        const stag = hero.clone().addScaledVector(way, -AWAY);
        if (clearAlong(stag, way, length)) return { hero, stag, way };
      }
    }
  }
  throw new Error('lab: no open lane in the Thornwood for a charge');
}

/** A lane in the open whose stag has clear ground `SIDE_CLEAR` m off either side of it (its gallop pictured from
 *  its side with nothing in the way). */
export function sideLane(): Lane {
  for (let r = 4; r < 20; r += 2) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
      const hero = new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r);
      for (let b = 0; b < Math.PI * 2; b += Math.PI / 12) {
        const way = new THREE.Vector3(Math.sin(b), 0, Math.cos(b)), across = new THREE.Vector3(way.z, 0, -way.x);
        const stag = hero.clone().addScaledVector(way, -AWAY);
        if (!clearAlong(stag, way, AWAY)) continue;
        if (clearAlong(stag, across, SIDE_CLEAR) && clearAlong(stag, across.negate(), SIDE_CLEAR)) return { hero, stag, way };
      }
    }
  }
  throw new Error('lab: no lane in the Thornwood with its sides clear');
}
/** how far either side of the stag must be clear for its gallop's pictures (m) */
const SIDE_CLEAR = 14;

/** A lane at a hero standing 3 m before the wall: its run carries it on into the wall. */
function wallLane(): Lane {
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 24) {
    const out = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    for (let r = 12; r < 40; r += 0.5) {
      const hero = out.clone().multiplyScalar(r);
      const by = pastWall(G.arena.biome, hero.x, hero.z, _n);
      if (by.gate || by.by < -3.5 || by.by > -2.5) continue;
      const way = out.clone(), stag = hero.clone().addScaledVector(way, -AWAY);
      if (clearAlong(stag, way, AWAY - 0.5) && !inObstacle(hero, 1)) return { hero, stag, way };
      break;
    }
  }
  throw new Error('lab: no lane at a hero before the Thornwood\'s wall');
}

/** A lane for a toss towards a prop: the hero 4 m before a prop (a rock, a tree) from the stag, its throw carrying
 *  him at it (the prop on the lane). */
function tossPropLane(): Lane & { prop: Obstacle } {
  for (const o of G.arena.obstacles) {
    if (o.r < 0.5 || o.r > 2.5 || o.prop?.broken) continue;
    for (let b = 0; b < Math.PI * 2; b += Math.PI / 12) {
      const way = new THREE.Vector3(Math.sin(b), 0, Math.cos(b));
      const hero = new THREE.Vector3(o.x, 0, o.z).addScaledVector(way, -(o.r + 4));
      const stag = hero.clone().addScaledVector(way, -AWAY);
      if (inObstacle(hero, 1) || pastWall(G.arena.biome, hero.x, hero.z, _n).by > -2) continue;
      if (clearAlong(stag, way, AWAY - 1)) return { hero, stag, way, prop: o };
    }
  }
  throw new Error('lab: no prop in the Thornwood with room for a toss at it');
}

/** A lane at a hero standing behind a prop (a rock, a tree) from the stag: its run meets the prop first. */
export function propLane(): Lane {
  for (const o of G.arena.obstacles) {
    if (o.r < 0.5 || o.r > 2.5) continue;
    for (let b = 0; b < Math.PI * 2; b += Math.PI / 12) {
      const way = new THREE.Vector3(Math.sin(b), 0, Math.cos(b));
      const hero = new THREE.Vector3(o.x, 0, o.z).addScaledVector(way, o.r + 1.6);
      const stag = hero.clone().addScaledVector(way, -AWAY);
      const toProp = AWAY - o.r - 1.6 - o.r;
      if (inObstacle(hero, 0.6) || pastWall(G.arena.biome, hero.x, hero.z, _n).by > -1) continue;
      if (clearAlong(stag, way, toProp - ROOM, o)) return { hero, stag, way };
    }
  }
  throw new Error('lab: no prop in the Thornwood with a lane to it');
}

/** The hero set up at the lane's spot facing the stag, and the stag risen at its own, dazed until a case lets it. */
export async function onLane(lab: Lab, options: BossOptions, lane: Lane): Promise<Enemy> {
  await lab.setup({ ...options.fixture, at: [lane.hero.x, lane.hero.z], facing: Math.atan2(-lane.way.x, -lane.way.z) });
  // (the clock set back by the set-up: the last case's warned hits forgotten)
  forgetBeats();
  const boss = lab.spawnFoe('stag', lane.stag.clone());
  lab.letWavesCome();
  await lab.until(() => boss.spawning <= 0, RISE_FRAMES, 'the Stag of Ash never rose');
  boss.facing = boss.targetFacing = Math.atan2(lane.way.x, lane.way.z);
  boss.dazed = 1e4;
  return boss;
}

/** Each of the hero's hurts while `body` runs, by type, and when (frames). */
export interface Hurt { frame: number; type: string; amount: number }

/** `body` run with every hurt the hero takes noted (his own `takeDamage`, which the lab's hold of his life passes). */
export async function noting<T>(hurts: Hurt[], frameOf: () => number, body: () => Promise<T>): Promise<T> {
  const hero = G.player, take = hero.takeDamage.bind(hero);
  hero.takeDamage = (amount, type, from) => {
    const dealt = take(amount, type, from);
    if (dealt) hurts.push({ frame: frameOf(), type: type ?? 'physical', amount: dealt.taken });
    return dealt;
  };
  try {
    return await body();
  } finally {
    hero.takeDamage = take;
  }
}

/** Each of fx `name`'s plays while `body` runs, its arguments. */
async function watching<T>(name: 'chargeLane' | 'stagCrash' | 'ember', seen: number[][], body: () => Promise<T>): Promise<T> {
  const was = FX[name] as (...args: number[]) => void;
  (FX as unknown as Record<string, unknown>)[name] = (...args: number[]) => { seen.push(args); was(...args); };
  try {
    return await body();
  } finally {
    (FX as unknown as Record<string, unknown>)[name] = was;
  }
}

/** What a charge did: when it began to paw and set off, its lane, how far it ran, whether it crashed (and into what),
 *  its stun and its weak window. */
interface ChargeCase {
  pawedAt: number; setOffAt: number; ranTo: number; lanes: number[][]; crashes: number[][];
  stunned: number; weakFor: number; taken: number; hurts: Hurt[]; run: { ox: number; oz: number; dx: number; dz: number } | null;
}

/** The stag let charge once at the hero on `lane`, `held` the frame's input (a shield raised): what came of it. */
async function chargeOn(lab: Lab, options: BossOptions, lane: Lane, held: SkillKey | null, dodge = false): Promise<ChargeCase> {
  const boss = await onLane(lab, options, lane);
  const hero = G.player;
  const result: ChargeCase = { pawedAt: -1, setOffAt: -1, ranTo: 0, lanes: [], crashes: [], stunned: 0, weakFor: 0, taken: 1, hurts: [], run: null };
  let frame = 0;
  boss.dazed = 0;
  boss.cd = 0;
  boss.brain.chargeT = 0;
  const aim = boss.pos.clone().setY(1.5);
  await noting(result.hurts, () => frame, () => watching('chargeLane', result.lanes, () => watching('stagCrash', result.crashes,
    () => lab.step(CHARGE_FRAMES, () => {
      hero.facing = Math.atan2(boss.pos.x - hero.pos.x, boss.pos.z - hero.pos.z);
      return held ? pressing(held, aim, true) : { aim };
    }, (f) => {
      frame = f + 1;
      const run = RUNS.get(boss);
      if (result.pawedAt < 0 && (boss.action?.name === 'charge' || boss.action?.name === 'again')) result.pawedAt = frame;
      if (run && result.setOffAt < 0) {
        result.setOffAt = frame;
        result.run = { ...run };
        // (stepped out of its lane as it sets off: it runs on past him)
        if (dodge) hero.place(hero.pos.clone().add(new THREE.Vector3(run.dz, 0, -run.dx).multiplyScalar(ROOM + 1.6)), hero.facing);
      }
      if (run) result.ranTo = Math.max(result.ranTo, (boss.pos.x - run.ox) * run.dx + (boss.pos.z - run.oz) * run.dz);
      // (one charge read: its wheel-round into another held off, which `stagPhase2` reads)
      if (run) boss.brain.again = 99;
      if (result.crashes.length && boss.dazed > 0) result.stunned++;
      if (boss.weak > 0) { result.weakFor++; result.taken = Math.max(result.taken, damageTaken(boss)); }
      // (one charge followed: after it, nothing more from it)
      if (result.setOffAt >= 0 && !run) boss.brain.chargeT = 99;
      boss.cd = Math.max(boss.cd, boss.action ? 0 : (result.setOffAt >= 0 && !run ? 99 : 0));
    }))));
  return result;
}

// --- the charge -------------------------------------------------------------------------------------------

/** A charge in the open at the hero standing in its lane: its lane, its set-off, the hero gored once, its length,
 *  its fire laid along it, burning him once a tick, and gone after its life. */
export async function stagCharge(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  await standIn(lab, options.fixture, 'forest');
  const lane = openLane();
  const reach = STAG.fire.reach;
  // (a fire that reaches no one: no width, and the hero's own taken off it)
  if (options.canary) STAG.fire.reach = -10;
  try {
    const c = await chargeOn(lab, options, lane, null);
    const warn = ENEMIES.stag.bossKit!.attacks!.charge.warn;
    const wantAngle = Math.atan2(lane.way.x, lane.way.z), wantLength = Math.min(STAG.charge.most, Math.max(STAG.charge.least, AWAY + STAG.charge.over));
    const shown = c.lanes[0];
    const gores = c.hurts.filter((h) => h.frame >= c.setOffAt && h.type === 'fire');
    lines.push(`stagCharge: pawed at ${c.pawedAt}, set off ${c.setOffAt - c.pawedAt} frames on (its warning ${warn * FPS}), `
      + `ran ${fixed(c.ranTo)} m of ${fixed(wantLength)}, ${c.crashes.length ? 'crashed' : 'met nothing'}, gored the hero ${gores.length} time(s)`);
    if (!shown) problems.push('stagCharge: no lane was burnt onto the floor');
    else {
      const off = Math.abs(Math.atan2(Math.sin(shown[3] - wantAngle), Math.cos(shown[3] - wantAngle)));
      lines.push(`stagCharge: its lane ${fixed(shown[4])} m long, ${fixed(off, 3)} rad off the way to the hero`);
      if (off > 0.05) problems.push(`stagCharge: its lane pointed ${fixed(off, 3)} rad off the hero`);
      if (Math.abs(shown[4] - wantLength) > 0.05) problems.push(`stagCharge: its lane ran ${fixed(shown[4])} m, not ${fixed(wantLength)}`);
    }
    if (c.setOffAt < 0) problems.push('stagCharge: it never set off');
    else if (Math.abs(c.setOffAt - c.pawedAt - warn * FPS) > SET_OFF_SLACK) problems.push(`stagCharge: it set off ${c.setOffAt - c.pawedAt} frames into its warning of ${warn * FPS}`);
    if (c.crashes.length) problems.push('stagCharge: a charge in the open crashed');
    if (c.ranTo < wantLength - 0.6) problems.push(`stagCharge: it ran ${fixed(c.ranTo)} m of its ${fixed(wantLength)}`);
    if (gores.length !== 1) problems.push(`stagCharge: the hero in its lane was gored ${gores.length} times, not once`);
    await fireCase(lab, c, lines, problems);
  } finally {
    STAG.fire.reach = reach;
  }
}

/** Its fire after the charge `c`: laid along the way it ran, the hero put in it burnt once a tick, gone after its life. */
async function fireCase(lab: Lab, c: ChargeCase, lines: string[], problems: string[]): Promise<void> {
  const laid = FIRES.reduce((sum, f) => sum + Math.hypot(f.x1 - f.x0, f.z1 - f.z0), 0);
  lines.push(`stagCharge: fire laid along ${fixed(laid)} m of the ${fixed(c.ranTo)} it ran, in ${FIRES.length} pieces`);
  if (laid < c.ranTo * 0.85) problems.push(`stagCharge: its fire lay along ${fixed(laid)} m of the ${fixed(c.ranTo)} it ran`);
  const run = c.run;
  if (!run || !FIRES.length) return;
  const hero = G.player, mid = c.ranTo * 0.5;
  const at = new THREE.Vector3(run.ox + run.dx * mid, 0, run.oz + run.dz * mid);
  hero.place(at, hero.facing);
  const hurts: Hurt[] = [];
  let frame = 0;
  await noting(hurts, () => frame, () => lab.step(BURN_HOLD * FPS, () => ({}), (f) => {
    frame = f + 1;
    hero.place(at, hero.facing);
  }));
  const burns = hurts.filter((h) => h.type === 'fire').length, want = BURN_HOLD / STAG.fire.tick;
  lines.push(`stagCharge: the hero stood in its fire ${BURN_HOLD} s: burnt ${burns} times (a burn every ${STAG.fire.tick} s)`);
  if (Math.abs(burns - want) > BURN_SLACK) problems.push(`stagCharge: in its fire ${BURN_HOLD} s the hero was burnt ${burns} times, not about ${want}`);
  const life = STAG.fire.life;
  hero.place(at.clone().addScaledVector(new THREE.Vector3(run.dz, 0, -run.dx), 6), hero.facing);
  await lab.step(Math.round(life * FPS));
  lines.push(`stagCharge: ${FIRES.length} pieces of fire still burning ${life} s on`);
  if (FIRES.length) problems.push(`stagCharge: its fire still burnt past its ${life} s`);
}

// --- crashing -------------------------------------------------------------------------------------------------

/** The block skill's key on the hero's bar (a shield's raise), or null. */
export function blockKey(): SkillKey | null {
  for (const key of ['mouse2', 'mouse0', '1', '2', '3', '4', 'q', 'e', 'r', 'f'] as SkillKey[]) {
    if (G.player.skillAt(key)?.def.block) return key;
  }
  return null;
}

/** A charge carried into the wall, one into a prop, and (with a shield) one into his raised shield: each crashed,
 *  stunned for its time at twice the damage, the hero never gored. */
export async function stagCrash(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  await standIn(lab, options.fixture, 'forest');
  const stun = STAG.charge.stun;
  if (options.canary) STAG.charge.stun = 0;
  try {
    const cases: [string, number, () => Lane, SkillKey | null, boolean][] = [
      ['the wall', CRASH.wall, wallLane, null, true], ['a prop', CRASH.prop, propLane, null, false],
    ];
    const key = blockKey();
    if (G.player.gear.shield && key) cases.push(['his raised shield', CRASH.shield, openLane, key, false]);
    else lines.push('stagCrash: a raised shield: not run (--class warrior --gear shield)');
    for (const [what, how, lane, held, dodge] of cases) {
      const c = await chargeOn(lab, options, lane(), held, dodge);
      crashProblems(what, how, c, stun, lines, problems);
    }
  } finally {
    STAG.charge.stun = stun;
  }
}

/** A charge `c` meant to crash into `what` (`how`): its stun, its window and its hurt to the hero, judged. */
function crashProblems(what: string, how: number, c: ChargeCase, stun: number, lines: string[], problems: string[]): void {
  const crash = c.crashes[0], gores = c.hurts.filter((h) => h.frame >= c.setOffAt && h.type === 'fire').length;
  const into = crash ? (['a prop', 'the wall', 'a shield'][crash[3]] ?? '?') : 'nothing';
  lines.push(`stagCrash: at a hero before ${what}: ran ${fixed(c.ranTo)} m, crashed into ${into}, stunned `
    + `${fixed(secondsOf(c.stunned))} s, ${fixed(secondsOf(c.weakFor))} s at ${c.taken}x damage, gored him ${gores} time(s)`);
  if (c.setOffAt < 0) { problems.push(`stagCrash: it never charged at the hero before ${what}`); return; }
  if (!crash) { problems.push(`stagCrash: a charge at the hero before ${what} never crashed`); return; }
  if (crash[3] !== how) problems.push(`stagCrash: a charge at the hero before ${what} crashed into ${into}`);
  if (Math.abs(secondsOf(c.stunned) - stun) > STUN_SLACK) problems.push(`stagCrash: stunned ${fixed(secondsOf(c.stunned))} s by ${what}, not ${stun}`);
  if (Math.abs(secondsOf(c.weakFor) - stun) > STUN_SLACK) problems.push(`stagCrash: open ${fixed(secondsOf(c.weakFor))} s after ${what}, not ${stun}`);
  const taken = ENEMIES.stag.bossKit!.weak!.taken;
  if (c.taken !== taken) problems.push(`stagCrash: took ${c.taken}x through its stun, not ${taken}x`);
  if (gores) problems.push(`stagCrash: the hero before ${what} was gored`);
}

// --- phase 2 ---------------------------------------------------------------------------------------------------

/** Its second phase: a charge that met nothing wheeling round into another at once, its fire lasting its `late`, and
 *  embers falling round the hero. */
export async function stagPhase2(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  await standIn(lab, options.fixture, 'forest');
  const kit = ENEMIES.stag.bossKit!;
  const share = kit.phases[1].below;
  if (options.canary) kit.phases[1].below = LATE - 0.2;
  try {
    const lane = openLane();
    const boss = await onLane(lab, options, lane);
    boss.takeDamage(boss.life - LATE * boss.maxLife, {});
    await lab.step(2);
    lines.push(`stagPhase2: at ${fixed(LATE * 100, 0)}% of its life, phase ${boss.bossPhase + 1}`);
    if (boss.bossPhase !== 1) problems.push(`stagPhase2: at ${fixed(LATE * 100, 0)}% of its life it was in phase ${boss.bossPhase + 1}`);
    const lanes: number[][] = [], embers: number[][] = [];
    let firstRunEnd = -1, againAt = -1, frame = 0, running = false;
    const longest = { life: 0 };
    const fireWas = FX.fire as (...args: number[]) => void;
    (FX as unknown as Record<string, unknown>).fire = (...args: number[]) => { longest.life = Math.max(longest.life, args[5]); fireWas(...args); };
    try {
      boss.dazed = 0;
      boss.cd = 0;
      boss.brain.chargeT = 0;
      await watching('chargeLane', lanes, () => watching('ember', embers, () => lab.step(EMBERS_HOLD * FPS, () => ({}), (f) => {
        frame = f + 1;
        const run = RUNS.get(boss);
        if (running && !run && firstRunEnd < 0) firstRunEnd = frame;
        running = !!run;
        if (againAt < 0 && boss.action?.name === 'again') againAt = frame;
        // (after its second, no third: the embers are what's followed)
        if (lanes.length >= 2 && !run && boss.action?.name !== 'again') boss.brain.chargeT = 99;
      })));
    } finally {
      (FX as unknown as Record<string, unknown>).fire = fireWas;
    }
    const want = STAG.embers, wanted = Math.floor((EMBERS_HOLD - 1.2) / want.every) * want.count;
    lines.push(`stagPhase2: ${lanes.length} charges, the second pawed ${againAt < 0 ? 'never' : `${fixed(secondsOf(againAt - firstRunEnd))} s after the first ran out`}, `
      + `its fire ${fixed(longest.life, 1)} s, ${embers.length} embers in ${EMBERS_HOLD} s`);
    if (lanes.length < 2 || againAt < 0) problems.push('stagPhase2: a charge that met nothing was never followed by another');
    else if (secondsOf(againAt - firstRunEnd) > 0.2) problems.push(`stagPhase2: its second charge came ${fixed(secondsOf(againAt - firstRunEnd))} s after the first`);
    if (Math.abs(longest.life - STAG.fire.late) > 0.01) problems.push(`stagPhase2: its fire lasted ${longest.life} s, not ${STAG.fire.late}`);
    if (embers.length < wanted) problems.push(`stagPhase2: ${embers.length} embers fell in ${EMBERS_HOLD} s, under ${wanted}`);
    const far = embers.filter((e) => Math.hypot(e[1] - G.player.pos.x, e[2] - G.player.pos.z) > want.spread + 8);
    if (far.length) problems.push(`stagPhase2: ${far.length} embers fell far from every hero`);
  } finally {
    kit.phases[1].below = share;
  }
}

// --- up close: the toss, and never standing -----------------------------------------------------------------

/** how far before the stag's middle a hero up close is put (m: inside its toss's reach), and the least a toss in the
 *  open must carry him (m) */
const CLOSE = 3.6;
const TOSSED_LEAST = 10;
/** how long it's followed up close (s), the longest it may stand doing nothing there (s), and the least of each attack
 *  it must make meanwhile */
const CLOSE_HOLD = 12;
const IDLE_MOST = 0.6;
const CLOSE_EACH = 2;

/** The stag risen `CLOSE` m before the hero on `lane` (facing him along its way), dazed until a case lets it. */
async function closeTo(lab: Lab, options: BossOptions, lane: Lane): Promise<Enemy> {
  return onLane(lab, options, { ...lane, stag: lane.hero.clone().addScaledVector(lane.way, -CLOSE) });
}

/** What a toss did: when its warning began and he was seized, where he was and landed, his hurts, how high he went,
 *  the frames of his flight and those he was airborne in, and what a hit sent at him in the air dealt. */
interface TossCase {
  warnedAt: number; seizedAt: number; from: THREE.Vector3; to: THREE.Vector3 | null; hurts: Hurt[]; highest: number;
  flight: number; airborne: number; airHit: number;
}

/** How the hero meets a toss: he stands, steps out of its way (`aside`) or back from it (`back`) halfway through its
 *  warning. */
type TossStep = 'aside' | 'back' | null;
/** how far a hero steps aside or back halfway through its warning (m), and how hard the hit sent at him in the air */
const STEP = { aside: 5, back: 1.5 };
const AIR_HIT = 100;

/** The stag let toss the hero on `lane` once (`step`: he steps aside or back halfway through its warning; `held`:
 *  the frame's input, his shield raised towards it). */
async function tossOn(lab: Lab, options: BossOptions, lane: Lane, step: TossStep,
  held: SkillKey | null): Promise<TossCase> {
  const boss = await closeTo(lab, options, lane);
  const hero = G.player;
  const result: TossCase = {
    warnedAt: -1, seizedAt: -1, from: hero.pos.clone(), to: null, hurts: [], highest: 0, flight: 0, airborne: 0, airHit: -1,
  };
  let frame = 0, flying = false;
  boss.dazed = 0;
  boss.cd = 0;
  // (its third close attack is the toss where he stands before it: its turn set for it)
  boss.brain.closeN = 2;
  boss.brain.chargeT = 99;
  const warn = ENEMIES.stag.bossKit!.attacks!.toss.warn;
  const frames = Math.round((warn + STAG.toss.hold + STAG.toss.fly + 1.5) * FPS);
  const aim = boss.pos.clone().setY(1.5);
  const input = (): Frame => {
    if (!held) return {};
    hero.facing = Math.atan2(boss.pos.x - hero.pos.x, boss.pos.z - hero.pos.z);
    return pressing(held, aim, true);
  };
  await noting(result.hurts, () => frame, () => lab.step(frames, input, (f) => {
    frame = f + 1;
    boss.brain.chargeT = 99;
    if (result.warnedAt < 0 && boss.action?.name === 'toss') result.warnedAt = frame;
    if (step && result.warnedAt >= 0 && frame === result.warnedAt + Math.round(warn * FPS * 0.5)) {
      const away = step === 'aside' ? new THREE.Vector3(lane.way.z, 0, -lane.way.x) : lane.way.clone();
      hero.place(hero.pos.clone().addScaledVector(away, STEP[step]), hero.facing);
    }
    if (tossed && !flying) {
      flying = true;
      result.seizedAt = frame;
      result.from = hero.pos.clone();
    }
    if (tossed) result.highest = Math.max(result.highest, hero.lift);
    // (thrown: airborne all the way, and a hit sent at him halfway lands nothing)
    if (tossed && hero.lift > 0.5 && frame > result.seizedAt + STAG.toss.hold * FPS) {
      result.flight++;
      if (hero.airborne) result.airborne++;
      if (result.airHit < 0 && result.flight === Math.round(STAG.toss.fly * FPS / 2)) {
        result.airHit = hurtPlayer(hero, AIR_HIT, 'physical', null, { foe: boss, attack: 'charge' });
      }
    }
    if (flying && !tossed && !result.to) result.to = hero.pos.clone();
    // (one toss followed: nothing more from it after)
    if (result.warnedAt >= 0 && !boss.action) boss.cd = 99;
  }));
  return result;
}

/** Its toss: a hero before it in the open scooped up as its warning ends, held up on its antlers, thrown far and hurt
 *  once as he lands; one before the wall thrown short of it, inside the arena and clear of the props; one who steps
 *  aside through its warning never tossed. */
export async function stagToss(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  await standIn(lab, options.fixture, 'forest');
  const far = STAG.toss.far;
  // (a toss that carries him nowhere)
  if (options.canary) STAG.toss.far = 0.5;
  try {
    const warn = ENEMIES.stag.bossKit!.attacks!.toss.warn;
    const cases: [string, Lane, TossStep, SkillKey | null][] = [
      ['in the open', openLane(), null, null], ['before the wall', wallLane(), null, null],
      ['before a prop', tossPropLane(), null, null], ['stepping aside', openLane(), 'aside', null],
      ['stepping back', openLane(), 'back', null],
    ];
    const key = blockKey();
    if (G.player.gear.shield && key) cases.push(['his shield raised', openLane(), null, key]);
    else lines.push('stagToss: a raised shield: not run (--class warrior --gear shield)');
    for (const [what, lane, step, held] of cases) {
      const c = await tossOn(lab, options, lane, step, held);
      const dodge = step === 'aside';
      const landed = c.hurts.filter((h) => h.type === 'physical');
      const carried = c.to ? Math.hypot(c.to.x - c.from.x, c.to.z - c.from.z) : 0;
      const how = c.seizedAt < 0 ? 'never tossed'
        : `tossed ${c.seizedAt - c.warnedAt} frames on (its warning ${warn * FPS}), `
          + `up to ${fixed(c.highest)} m high, thrown ${fixed(carried)} m`;
      const hurt = landed.length ? ` (${fixed(landed[0].amount, 0)})` : '';
      lines.push(`stagToss: ${what}: warned at ${c.warnedAt}, ${how}, hurt ${landed.length} time(s)${hurt}`);
      if (c.warnedAt < 0) { problems.push(`stagToss: ${what}: it never began a toss at a hero before it`); continue; }
      if (dodge || held) {
        if (c.seizedAt >= 0) problems.push(`stagToss: ${what}: the hero was tossed`);
        if (landed.length) problems.push(`stagToss: ${what}: the hero was hurt`);
        continue;
      }
      if (c.seizedAt < 0) { problems.push(`stagToss: ${what}: the hero before it was never tossed`); continue; }
      const late = c.seizedAt - c.warnedAt;
      if (Math.abs(late - warn * FPS) > SET_OFF_SLACK) {
        problems.push(`stagToss: ${what}: tossed ${late} frames into its warning of ${warn * FPS}`);
      }
      if (!c.to) { problems.push(`stagToss: ${what}: the hero never landed`); continue; }
      if (landed.length !== 1) problems.push(`stagToss: ${what}: hurt ${landed.length} times, not once as he landed`);
      if (c.highest < 3) problems.push(`stagToss: ${what}: thrown no more than ${fixed(c.highest)} m up`);
      if (what === 'in the open' && carried < TOSSED_LEAST) {
        problems.push(`stagToss: in the open the hero was thrown ${fixed(carried)} m, under ${TOSSED_LEAST}`);
      }
      const by = pastWall(G.arena.biome, c.to.x, c.to.z, _n).by;
      if (by > 0) problems.push(`stagToss: ${what}: he landed ${fixed(by)} m past the wall`);
      if (inObstacle(c.to, G.player.radius * 0.8)) problems.push(`stagToss: ${what}: he landed in a prop`);
      if (what === 'before a prop') {
        const prop = lane.prop!, along = (at: THREE.Vector3): number => (at.x - prop.x) * lane.way.x + (at.z - prop.z) * lane.way.z;
        lines.push(`stagToss: before a prop: landed ${fixed(-along(c.to) - prop.r)} m short of its circle`);
        if (along(c.to) > -prop.r) problems.push('stagToss: before a prop: he was thrown through it');
      }
      lines.push(`stagToss: ${what}: airborne ${c.airborne} of the ${c.flight} frames he flew, a hit of ${AIR_HIT} sent `
        + `at him in the air dealt ${fixed(Math.max(0, c.airHit), 0)}`);
      if (c.airborne < c.flight) problems.push(`stagToss: ${what}: not airborne ${c.flight - c.airborne} frames of his flight`);
      if (c.airHit > 0) problems.push(`stagToss: ${what}: a hit landed on him in the air (${fixed(c.airHit, 0)})`);
    }
  } finally {
    STAG.toss.far = far;
  }
}

/** Up close it never stands: the hero kept before it `CLOSE_HOLD` s (put back as he lands from each toss), the longest
 *  it went neither attacking, walking nor turning, and how many tosses, gores and stamps it made. */
export async function stagClose(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  await standIn(lab, options.fixture, 'forest');
  const rest = STAG.close.rest;
  // (a long stand between its attacks)
  if (options.canary) STAG.close.rest = [2.5, 3];
  try {
    const lane = openLane();
    const boss = await closeTo(lab, options, lane);
    const hero = G.player, made = { toss: 0, gore: 0, stamp: 0 };
    let idle = 0, longest = 0, was = boss.facing, last = '';
    boss.dazed = 0;
    boss.cd = 0;
    await lab.step(CLOSE_HOLD * FPS, () => ({}), () => {
      boss.brain.chargeT = 99;
      const name = boss.action?.name ?? '';
      if (name !== last && (name === 'toss' || name === 'gore' || name === 'stamp')) made[name]++;
      last = name;
      // (landed from a toss: put back before it, where it can reach him)
      if (!tossed && !hero.seized && Math.hypot(hero.pos.x - boss.pos.x, hero.pos.z - boss.pos.z) > CLOSE + 1.5) {
        const ahead = new THREE.Vector3(Math.sin(boss.facing), 0, Math.cos(boss.facing));
        hero.place(boss.pos.clone().addScaledVector(ahead, CLOSE), Math.atan2(-ahead.x, -ahead.z));
      }
      const turned = Math.abs(Math.atan2(Math.sin(boss.facing - was), Math.cos(boss.facing - was)));
      const moving = Math.hypot(boss.vel.x, boss.vel.z) >= 0.3 || turned >= 0.005;
      const still = !boss.action && !RUNS.has(boss) && boss.dazed <= 0 && !moving;
      was = boss.facing;
      idle = still && !tossed ? idle + 1 : 0;
      longest = Math.max(longest, idle);
    });
    // (its last blow let land and the hero's shove from it spent: carried into the next part's set-up, it moved him)
    boss.dazed = 1e4;
    await lab.step(Math.round(2.5 * FPS));
    hero.knock.set(0, 0, 0);
    lines.push(`stagClose: ${CLOSE_HOLD} s with the hero up close: ${made.toss} tosses, ${made.gore} gores, `
      + `${made.stamp} stamps, `
      + `its longest stand ${fixed(secondsOf(longest))} s (at most ${IDLE_MOST})`);
    if (secondsOf(longest) > IDLE_MOST) {
      problems.push(`stagClose: it stood ${fixed(secondsOf(longest))} s doing nothing with the hero before it`);
    }
    // (the toss every third attack)
    if (made.toss < 1) problems.push(`stagClose: no toss in ${CLOSE_HOLD} s up close`);
    const blows = made.gore + made.stamp;
    if (blows < CLOSE_EACH) problems.push(`stagClose: ${blows} gores and stamps in ${CLOSE_HOLD} s up close, under ${CLOSE_EACH}`);
  } finally {
    STAG.close.rest = rest;
  }
}

// --- the programs ---------------------------------------------------------------------------------------------

/** Every effect of its fight drawn (its lane, its gallop, its fire, a gore, a crash, its sweep, its toss, an ember, its
 *  window): the programs compiled meanwhile. */
export async function stagCompiles(lab: Lab, options: BossOptions): Promise<number> {
  await standIn(lab, options.fixture, 'forest');
  const lane = openLane();
  const boss = await onLane(lab, options, lane);
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    await lab.step(2);
    const before = PIPELINES.made;
    const h = G.player.pos, x = boss.pos.x, z = boss.pos.z;
    fx('chargeLane', boss.id, x, z, Math.atan2(lane.way.x, lane.way.z), 12, 0.8);
    fx('stagRun', boss.id);
    fx('fire', boss.id, h.x - 5, h.z, h.x - 1, h.z + 2, 2, 0);
    fx('gore', boss.id, -9, 0, 1, 0);
    fx('antlerGore', boss.id, 0);
    fx('stamp', boss.id, 0);
    fx('antlerToss', boss.id, x, z, 0, 0);
    fx('ember', boss.id, h.x + 3, h.z, 0.6, 0);
    fx('kick', boss.id, 0);
    fx('hoofStrike', boss.id, 0);
    const way = Math.atan2(lane.way.x, lane.way.z);
    fx('breathAim', boss.id, x, z, way - 0.7, way + 0.7, 0.4);
    fx('breath', boss.id, x, z, way - 0.7, way + 0.7, 0);
    // (a piece of wood set alight: the nearest stump or log)
    const wood = G.arena.obstacles.find((o) => o.prop?.kind === 'wood' && !o.prop.broken);
    if (wood) fx('woodFire', boss.id, wood.x, wood.z, 0);
    await lab.step(40);
    fx('stagCrash', boss.id, x, z, CRASH.prop, -1, 1);
    fx('bossWeak', boss.id, 1);
    fx('bossPhase', boss.id, 1);
    await lab.step(60, () => ({}), () => { boss.cd = 99; boss.brain.chargeT = 99; });
    if (options.canary) await drawOdd(lab, boss.pos);
    await lab.step(4);
    return PIPELINES.made - before;
  } finally {
    lab.drawing = drawing;
  }
}

// --- time to kill ------------------------------------------------------------------------------------------------

/** How long the stag of life `life` takes at `dps`: struck throughout, and with every charge crashed (each cycle its
 *  `every` s, then its `stun` at `taken` times). */
export function stagTimeToKill(life: number, dps: number, crashing: boolean): number {
  if (!crashing) return life / dps;
  const c = STAG.charge, taken = ENEMIES.stag.bossKit!.weak!.taken;
  let left = life, time = 0;
  while (left > 0 && time < 3600) {
    const plain = Math.min(left, dps * c.every);
    left -= plain;
    time += plain / dps;
    if (left <= 0) break;
    const open = Math.min(left, dps * taken * c.stun);
    left -= open;
    time += open / (dps * taken);
  }
  return time;
}

/** The Stag of Ash at wave 15, from the hero's damage a second, beside the Rootmother at 10. */
export function stagTtkLines(dps: number): string[] {
  const root = rootTimeToKill(ENEMIES.rootmother.life * SCALING.life(10), dps, false);
  const stag = ENEMIES.stag.life * SCALING.life(15);
  const plain = stagTimeToKill(stag, dps, false), crashing = stagTimeToKill(stag, dps, true);
  return [
    `ttk: the Stag of Ash at wave 15 (${fixed(stag, 0)} life): ${fixed(plain, 0)} s struck throughout `
      + `(${fixed(plain / root, 2)}x the Rootmother's), ${fixed(crashing, 0)} s with every charge crashed (${fixed(crashing / root, 2)}x)`,
  ];
}

// --- pictures ----------------------------------------------------------------------------------------------------

/** the most triangles its model may draw (a phone's budget for one boss, as the Rootmother's) */
const STAG_TRIANGLES = 45_000;

/**
 * The stag and its fight for the eye (`stagPictures`, asked for alone): as the player meets it from above and over the
 * shoulder, close up from each side and its head, pawing with its lane burning, galloping with its fire behind it,
 * crashed and reeling, its second phase with its embers falling, its fall; its triangles beside the other bosses'.
 */
export async function stagPictures(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<Pictured[]> {
  await standIn(lab, options.fixture, 'forest');
  const moments: Pictured[] = [];
  const lane = openLane();
  const seen = async (label: string, note: string): Promise<void> => { moments.push(await lab.screen(label, [note])); };
  // (over the shoulder first: a set-up clears the foes a measure spawned, so it's risen again after it)
  // (the Thornwood without it timed first, from the game's own view above, the view its fight is timed in)
  await lab.setup({ ...options.fixture, at: [lane.hero.x, lane.hero.z], facing: Math.atan2(-lane.way.x, -lane.way.z) });
  const without = await timeFrames(lab);
  await lab.setup({ ...options.fixture, at: [lane.hero.x, lane.hero.z], facing: Math.atan2(-lane.way.x, -lane.way.z), view: 'third' });
  const first = lab.spawnFoe('stag', lane.stag.clone());
  lab.letWavesCome();
  await lab.until(() => first.spawning <= 0, RISE_FRAMES, 'the Stag of Ash never rose');
  first.facing = first.targetFacing = Math.atan2(lane.way.x, lane.way.z);
  first.dazed = 1e4;
  await lab.step(20);
  await seen('1 over the shoulder', 'the Stag of Ash as the player meets it over his shoulder');
  const boss = await onLane(lab, options, lane);
  const close = (label: string, note: string, views: ('back' | 'left' | 'right' | 'above' | 'front')[], up: number, distance: number,
    at = boss.pos): void => {
    moments.push(lab.picture(label, views, [note], { at: at.clone().setY(up), distance }));
  };
  await lab.step(30);
  await seen('2 from above', 'the game\'s own view: a huge stag of charred wood, embers in its cracks, antlers burning');
  close('3 whole', 'its whole, from before it, each side and above', ['back', 'left', 'right', 'above'], 3.4, 15);
  const head = boss.pos.clone().add(new THREE.Vector3(Math.sin(boss.facing), 0, Math.cos(boss.facing)).multiplyScalar(2.6));
  close('4 its head', 'its head and burning antlers', ['back', 'left'], 5.6, 5, head);
  // its charge
  boss.dazed = 0;
  boss.cd = 0;
  boss.brain.chargeT = 0;
  await lab.until(() => boss.action?.name === 'charge' && boss.action.t > 0.7, CHARGE_FRAMES, 'it never pawed');
  await seen('5 pawing', 'it paws the earth as its lane burns onto the floor towards the hero: step out of it');
  close('5 pawing (close)', 'a hoof pawing the earth, its head lowered, antlers forward', ['left'], 3, 11);
  await lab.until(() => RUNS.has(boss), CHARGE_FRAMES, 'it never set off');
  await lab.step(30);
  await seen('6 charging', 'it charges along its lane, fire left burning behind it');
  close('6 charging (close)', 'galloping, its fire laid behind it', ['left', 'above'], 3, 14);
  await lab.until(() => !RUNS.has(boss), CHARGE_FRAMES, 'it never stopped');
  await lab.step(20, () => ({}), () => { boss.brain.chargeT = 99; boss.cd = 99; });
  await seen('7 its fire', 'its fire burns on the floor for 8 s');
  // a crash into the wall
  const wall = wallLane();
  const crashed = await onLane(lab, options, wall);
  crashed.dazed = 0;
  crashed.cd = 0;
  crashed.brain.chargeT = 0;
  await lab.until(() => crashed.weak > 0, CHARGE_FRAMES * 2, 'it never crashed into the wall');
  await lab.step(30, () => ({}), () => { crashed.brain.chargeT = 99; });
  await seen('8 crashed', 'it ran into the wall: stunned 3 s, every hit takes twice');
  close('8 crashed (close)', 'reeling, its head hung', ['left', 'back'], 3, 11, crashed.pos);
  // phase 2
  crashed.takeDamage(crashed.life - LATE * crashed.maxLife, {});
  await lab.step(40, () => ({}), () => { crashed.brain.chargeT = 99; crashed.cd = 99; });
  await seen('9 phase 2', 'under half its life: the ash takes fire, it charges twice, embers fall');
  // (its stun let run out first: its window's aura over the frame hid the embers' rings)
  await lab.until(() => crashed.weak <= 0, CHARGE_FRAMES, 'its stun never ended', () => ({}));
  crashed.brain.emberT = 0;
  await lab.step(50, () => ({}), () => { crashed.brain.chargeT = 99; crashed.cd = 99; });
  await seen('10 embers', 'embers fall round the heroes, a ring where each lands');
  // (its fight's cost to the frame at its busiest: it charging and breathing, its fire, embers falling and the most
  // wood its breath may set alight burning, against the Thornwood without it)
  crashed.brain.chargeT = 0;
  crashed.brain.breathT = 0;
  const woods = G.arena.obstacles.filter((o) => o.prop?.kind === 'wood' && !o.prop.broken);
  for (const wood of woods.slice(0, STAG.forestFire.most)) fx('woodFire', crashed.id, wood.x, wood.z, 0);
  const within = await timeFrames(lab);
  lines.push(frameLine('stagPictures', 'the Stag of Ash', without, within));
  crashed.takeDamage(crashed.life + 1, {});
  await lab.step(60);
  close('11 its fall', 'killed: its legs fold and its embers go out', ['left'], 2, 12, crashed.pos);
  const own = modelTriangles('stag');
  const others = `the Rootmother ${modelTriangles('rootmother')}`;
  lines.push(`stagPictures: ${moments.length} moments; its triangles ${own} (${others}; at most ${STAG_TRIANGLES})`);
  if (own > STAG_TRIANGLES) problems.push(`stagPictures: its model draws ${own} triangles, over ${STAG_TRIANGLES}`);
  return moments;
}

/**
 * Its toss for the eye (`stagMoves`, asked for alone), step by step: its head down scraping the earth, the hero up on
 * its antlers, thrown, landed. (Its gallop is `stagStridePictures`'s, along a lane: its stride is keyed to the ground it
 * covers, so galloping in place, as this part once pictured it, it stands still.)
 */
export async function stagMoves(lab: Lab, options: BossOptions): Promise<Pictured[]> {
  await standIn(lab, options.fixture, 'forest');
  const moments: Pictured[] = [];
  const side = (label: string, note: string, boss: Enemy, distance = 21, up = 3.2): void => {
    // (framed a little ahead of its middle, its head and antlers in the picture)
    const ahead = new THREE.Vector3(Math.sin(boss.facing), 0, Math.cos(boss.facing)).multiplyScalar(1.6);
    moments.push(lab.picture(label, ['left'], [note], { at: boss.pos.clone().add(ahead).setY(up), distance }));
  };
  // its toss
  const tosser = await closeTo(lab, options, sideLane());
  tosser.dazed = 0;
  tosser.cd = 0;
  tosser.brain.closeN = 0;
  const hold = (): void => { tosser.brain.chargeT = 99; };
  await lab.until(() => tosser.action?.name === 'toss' && tosser.action.t > 0.4, CHARGE_FRAMES, 'it never tossed', () => {
    hold();
    return {};
  });
  side('toss 1 scraping', 'its head dropped, its antlers scraping the earth: step aside', tosser, 17);
  await lab.until(() => tossed !== null, CHARGE_FRAMES, 'the hero was never tossed', () => {
    hold();
    return {};
  });
  await lab.step(Math.round(STAG.toss.hold * FPS * 0.8), () => ({}), hold);
  side('toss 2 on its antlers', 'scooped up on its antlers', tosser, 17, 4);
  moments.push(await lab.screen('toss 3 thrown', ['thrown across the arena (the game\'s view)']));
  await lab.step(Math.round(STAG.toss.fly * FPS * 0.4), () => ({}), hold);
  moments.push(await lab.screen('toss 4 in the air', ['high over the arena']));
  await lab.until(() => tossed === null, CHARGE_FRAMES, 'the hero never landed', () => {
    hold();
    return {};
  });
  await lab.step(6, () => ({}), hold);
  moments.push(await lab.screen('toss 5 landed', ['landed far off, hurt hard']));
  return moments;
}
