// `lab crowd`: a crowd of foes killed at once, and what the frame costs as their bodies fall. Each frame is timed by
// the browser's own clock with the game drawn as it is and waited out on the GPU (what the GPU draws runs behind the
// page, and a frame timed without it missed what the bodies' smoke and embers cost it), the bodies' part of it
// (entities/corpse.ts) apart, against the frames before the kill with the crowd standing: at the CPU's own speed and
// slowed as a low-end device's (`lab.throttle`), at 60 frames a second and at 30 (a device already slow steps each
// body twice as far a frame).
import type * as THREE from 'three';
import type { Fixture, Frame, Lab, Report } from './lab';
import { Enemy } from '../../../src/entities/enemy';
import { G } from '../../../src/state';
import { WAVES } from '../../../src/data/waves';
import { Corpse } from '../../../src/entities/corpse';
import { Ragdoll } from '../../../src/entities/ragdoll';
import { particles } from '../../../src/fx/particles';
import { hitEnemy } from '../../../src/combat/damage';
import { bindKnown, holdFor, pressing, skillNamed, type BoundSkill } from './cast';
import { foeKind, foesAt } from './death';
import { timeCalls, type Timing } from './timing';
import { gpuDone } from '../../../src/core/webgpu';
import { RUST } from '../../../src/engine';

export interface CrowdOptions {
  fixture: Fixture;
  /** how many foes (by default the most a wave keeps alive) */
  count?: number;
  /** the CPU's slowdowns, a round each (1: as it is) */
  throttles?: number[];
  /** the frame rates, a round each at every slowdown */
  rates?: number[];
  /** the crowd killed by a cast of this skill (its key, behaviour or name) instead of a blow each */
  skill?: string;
  /** plant a cost the measure must see: each body made slower by `CANARY_MS` a frame */
  canary: boolean;
}

/** by default: the slowdowns (DevTools' presets: 4 a mid-range phone's, 6 a low-end one's) and the frame rates */
const THROTTLES = [1, 4, 6];
const RATES = [60, 30];
/** where the hero stands and faces (deg) unless the fixture says: open ground, the arena before him */
/** where the hero stands for a crowd (clear of props, the crowd before him on open ground), and the way he faces (°) */
export const CROWD_SPOT: [number, number] = [-11, -12];
export const CROWD_FACING = 90;
/** the crowd stands in rows this wide, this far apart (m), the first this far before the hero */
const ROW = 7;
const APART = 1.3;
const FIRST_ROW = 3;
/** frames timed with the crowd standing, before the kill, after these to settle (the 90th percentile of 30 rested
 *  on the 4th-worst frame: one round in nine failed on it, and passed run twice again) */
const STANDING_FRAMES = 60;
const SETTLE_FRAMES = 10;
/** the bodies followed this long at most (s): a storm holds its kills up for its whole time */
const MOST_SECONDS = 14;
/** a blow kills its foe this many times over (thrown as hard as a kill throws) */
const OVERKILL = 10;
/** the canary's cost: each body's frame made this much slower (ms), of which the measure must see this share */
const CANARY_MS = 0.1;
const CANARY_SEEN = 0.5;
/** as the crowd falls, the frame (its 90th percentile) may be at most this much over the frame with it standing, at the
 *  same CPU and frame rate (the game no slower for the crowd's dying: measured at -4 to +4%, the frame mostly the crowd
 *  drawn), and the bodies' part of it at most this share of the standing frame (measured at 7 to 15%, the most at 30 a
 *  second: each frame steps them twice as far) */
const FRAME_RISE = 0.15;
const BODIES_SHARE = 0.2;

/** One frame as timed: the whole of it, the foes' deaths in it and the bodies' part (ms), and of that their steps and
 *  their poses, and how many bodies lay and moved in it. */
interface Timed {
  frame: number;
  /** the draw calls it made (every pass of the frame's: the shadows, the scene, the post chain), and the particles
   *  alive in it (the glowing ones and the smoke) */
  calls: number;
  glow: number;
  smoke: number;
  deaths: number;
  bodies: number;
  steps: number;
  poses: number;
  lying: number;
  moving: number;
}

/** The bodies' timings: the deaths that made them (`Enemy.die`: the burst, the sound, the run's loot and score, the
 *  body), their whole frame, and the ragdolls' steps and poses within it. */
interface BodyTimings {
  deaths: Timing;
  bodies: Timing;
  steps: Timing;
  poses: Timing;
}

/** The bodies timed, each part by every call of it. */
function timeBodies(): BodyTimings {
  return {
    deaths: timeCalls(Enemy.prototype, 'die'),
    bodies: timeCalls(Corpse.prototype, 'update'),
    steps: timeCalls(Ragdoll.prototype, 'step'),
    poses: timeCalls(Ragdoll.prototype, 'pose'),
  };
}

/** What the bodies took since the last lap, by part (ms). */
function lapBodies(timings: BodyTimings): { deaths: number; bodies: number; steps: number; poses: number } {
  const deaths = timings.deaths.lap();
  return { deaths, bodies: timings.bodies.lap(), steps: timings.steps.lap(), poses: timings.poses.lap() };
}

/** The bodies' timings stopped, each method put back. */
function stopBodies(timings: BodyTimings): void {
  timings.deaths.stop();
  timings.bodies.stop();
  timings.steps.stop();
  timings.poses.stop();
}

/** A round: the crowd at one slowdown and frame rate, its frames timed standing and as it fell. */
interface Round {
  throttle: number;
  rate: number;
  standing: Timed[];
  falling: Timed[];
  /** when every body lay still, and when every one had gone (s after the kill; -1: never within the round) */
  stillAt: number;
  goneAt: number;
}

/** A spread of times: its median, its 90th percentile and its worst (ms). */
interface Spread {
  median: number;
  p90: number;
  worst: number;
}

const ms = (value: number): string => `${value.toFixed(2)} ms`;
const seconds = (value: number): string => (value < 0 ? 'never' : `${value.toFixed(2)} s`);
const frameMs = (rate: number): number => Math.round((1000 / rate) * 1024) / 1024;

/** The median, 90th percentile and worst of `values`. */
function spreadOf(values: number[]): Spread {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (share: number) => sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] ?? 0;
  return { median: at(0.5), p90: at(0.9), worst: sorted[sorted.length - 1] ?? 0 };
}

/** The crowd's places: rows before the hero at `at` facing `facing` (rad), the middle of each row straight ahead. */
export function crowdPlaces(count: number, at: THREE.Vector3, facing: number): THREE.Vector3[] {
  const forward = { x: Math.sin(facing), z: Math.cos(facing) };
  const left = { x: Math.cos(facing), z: -Math.sin(facing) };
  const spots: THREE.Vector3[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / ROW);
    const aside = ((i % ROW) - (ROW - 1) / 2) * APART;
    const ahead = FIRST_ROW + row * APART;
    const x = at.x + forward.x * ahead + left.x * aside;
    const z = at.z + forward.z * ahead + left.z * aside;
    spots.push(at.clone().set(x, at.y, z));
  }
  return spots;
}

/** How the crowd is killed: a blow each from the hero, or a cast of a skill at the crowd's middle. */
type Killing = { skill: BoundSkill; aim: THREE.Vector3 } | null;

/** Frame `frame` of the kill at `rate` frames a second: on the first, each foe struck by a blow from the hero; or the
 *  skill pressed for as long as it's held. */
function killFrame(killing: Killing, foes: Enemy[], frame: number, rate: number): Frame {
  if (killing) {
    const held = frame < Math.max(1, Math.round(holdFor(killing.skill.def) * rate));
    return pressing(killing.skill.key, killing.aim, held);
  }
  if (frame > 0) return {};
  // (struck as by the basic attack, for the battle log)
  const skill = G.player.skillAt('mouse0')!.def;
  for (const foe of foes) {
    hitEnemy(foe, foe.maxLife * OVERKILL, { by: G.player, skill, type: 'physical', from: G.player.pos });
  }
  return {};
}

/** Every body killed in the crowd and still in the game, and how many of them still move. */
function bodiesOf(foes: Enemy[]): { lying: number; moving: number } {
  let lying = 0;
  let moving = 0;
  for (const foe of foes) {
    if (foe.alive || !G.enemies.includes(foe)) continue;
    lying++;
    if (foe.corpse?.ragdoll && !foe.corpse.ragdoll.asleep) moving++;
  }
  return { lying, moving };
}

/** One frame run and timed by the browser's clock, the bodies' part of it by their timings, its draw calls counted. */
async function timedFrame(lab: Lab, foes: Enemy[], timings: BodyTimings, input: () => Frame): Promise<Timed> {
  const now = window.__labClock.realNow;
  const start = now();
  await lab.step(1, input);
  // (waited out on the GPU: what it draws runs behind the page, and the page's own time leaves it out)
  await gpuDone(G.renderer);
  const frame = now() - start;
  // (the engine's: three's renderer, its host alone, draws none of the frame and counts 0)
  const stats = RUST.bridge?.stats;
  const calls = stats ? stats.draws + stats.shadowDraws : 0;
  const alive = { glow: particles.glow.count, smoke: particles.smoke.count };
  return { frame, calls, ...alive, ...lapBodies(timings), ...bodiesOf(foes) };
}

/** Each body's frame made `CANARY_MS` slower; returns what puts it back. */
function plantCost(): () => void {
  const update = Corpse.prototype.update;
  const now = window.__labClock.realNow;
  Corpse.prototype.update = function slowed(this: Corpse, dt: number): boolean {
    const until = now() + CANARY_MS;
    while (now() < until) {
      // (the planted cost: the measure must see it)
    }
    return update.call(this, dt);
  };
  return () => {
    Corpse.prototype.update = update;
  };
}

/** The crowd set up afresh, standing dazed before the hero, and how it's to be killed. */
async function crowdUp(lab: Lab, options: CrowdOptions, count: number): Promise<{ foes: Enemy[]; killing: Killing }> {
  G.arena.restoreProps();
  const facing = options.fixture.facing ?? (CROWD_FACING * Math.PI) / 180;
  await lab.setup({ ...options.fixture, at: options.fixture.at ?? CROWD_SPOT, facing });
  const hero = G.player;
  hero.cooldowns.clear();
  hero.energy = hero.stats.maxEnergy;
  const spots = crowdPlaces(count, hero.pos, hero.facing);
  const foes = await foesAt(lab, spots, spots.map(() => 1));
  if (!options.skill) return { foes, killing: null };
  bindKnown(options.skill);
  const middle = spots.reduce((sum, spot) => sum.add(spot), hero.pos.clone().set(0, 0, 0)).divideScalar(count);
  return { foes, killing: { skill: skillNamed(options.skill), aim: middle } };
}

/** One round: the crowd timed standing and then as it's killed, at `throttle` and `rate`, until its bodies are gone. */
async function round(lab: Lab, options: CrowdOptions, count: number, throttle: number, rate: number): Promise<Round> {
  const { foes, killing } = await crowdUp(lab, options, count);
  const clock = window.__labClock;
  const wasFrame = clock.frame;
  const timings = timeBodies();
  const result: Round = { throttle, rate, standing: [], falling: [], stillAt: -1, goneAt: -1 };
  try {
    clock.frame = frameMs(rate);
    await lab.step(SETTLE_FRAMES);
    lab.drawing = true;
    await lab.throttle(throttle);
    for (let f = 0; f < STANDING_FRAMES; f++) result.standing.push(await timedFrame(lab, foes, timings, () => ({})));
    lapBodies(timings);
    for (let f = 0; f < MOST_SECONDS * rate; f++) {
      const timed = await timedFrame(lab, foes, timings, () => killFrame(killing, foes, f, rate));
      result.falling.push(timed);
      const killed = foes.every((foe) => !foe.alive);
      if (killed && timed.moving === 0 && result.stillAt < 0) result.stillAt = (f + 1) / rate;
      if (killed && timed.lying === 0) {
        result.goneAt = (f + 1) / rate;
        break;
      }
    }
  } finally {
    await lab.throttle(1);
    lab.drawing = false;
    clock.frame = wasFrame;
    stopBodies(timings);
  }
  return result;
}

/** A round's line: its frames standing and as the crowd fell, the bodies' part, and when they lay still and went. */
function roundLine(round: Round): string {
  const standing = spreadOf(round.standing.map((timed) => timed.frame));
  const falling = round.falling.filter((timed) => timed.lying > 0);
  const frames = spreadOf(falling.map((timed) => timed.frame));
  const bodies = spreadOf(falling.map((timed) => timed.bodies));
  const moved = falling.reduce((sum, timed) => sum + timed.moving, 0);
  const total = (part: (timed: Timed) => number) => falling.reduce((sum, timed) => sum + part(timed), 0);
  const movingCost = total((timed) => timed.bodies) / Math.max(1, moved);
  const stepShare = total((timed) => timed.steps) / Math.max(1e-9, total((timed) => timed.bodies));
  const poseShare = total((timed) => timed.poses) / Math.max(1e-9, total((timed) => timed.bodies));
  const shares = `steps ${(stepShare * 100).toFixed(0)}%, poses ${(poseShare * 100).toFixed(0)}%`;
  const deadlier = (most: Timed, timed: Timed) => (timed.deaths > most.deaths ? timed : most);
  const deadliest = round.falling.reduce(deadlier, round.falling[0]);
  const kill = `the kill's worst frame ${ms(deadliest?.frame ?? 0)}, the deaths in it ${ms(deadliest?.deaths ?? 0)}`;
  const cpu = round.throttle === 1 ? 'the CPU as it is' : `the CPU ${round.throttle} times slower`;
  const calls = spreadOf(round.standing.map((timed) => timed.calls)).median;
  const mostGlow = Math.max(0, ...round.falling.map((timed) => timed.glow));
  const mostSmoke = Math.max(0, ...round.falling.map((timed) => timed.smoke));
  const alive = `the most particles alive ${mostGlow} glowing, ${mostSmoke} smoke`;
  return `  ${round.rate} a second, ${cpu}: standing ${ms(standing.median)} a frame (90th ${ms(standing.p90)}, `
    + `${calls} draw calls); `
    + `as they fell ${ms(frames.median)} (90th ${ms(frames.p90)}, worst ${ms(frames.worst)}), the bodies `
    + `${ms(bodies.median)} (90th ${ms(bodies.p90)}, worst ${ms(bodies.worst)}; ${ms(movingCost)} a body moving; `
    + `${shares}); ${kill}; ${alive}; `
    + `all still after ${seconds(round.stillAt)}, gone after ${seconds(round.goneAt)}`;
}

/** What's wrong with a round: the crowd never killed, or its bodies past their share of the frame. */
function roundProblems(round: Round, count: number): string[] {
  const where = `at ${round.rate} a second, the CPU ${round.throttle} times slower`;
  const falling = round.falling.filter((timed) => timed.lying > 0);
  if (!falling.length) return [`${where}: the crowd of ${count} never fell`];
  const problems: string[] = [];
  const standing = spreadOf(round.standing.map((timed) => timed.frame));
  const frames = spreadOf(falling.map((timed) => timed.frame));
  const slowest = standing.p90 * (1 + FRAME_RISE);
  if (frames.p90 > slowest) {
    problems.push(`${where}: the frame as they fell took ${ms(frames.p90)} (90th), past ${ms(slowest)} (the frame `
      + `with the crowd standing, and a little)`);
  }
  const bodies = spreadOf(falling.map((timed) => timed.bodies));
  const most = standing.median * BODIES_SHARE;
  if (bodies.p90 > most) {
    problems.push(`${where}: the bodies took ${ms(bodies.p90)} of a frame (90th), past ${ms(most)} (a share of the `
      + `frame with the crowd standing)`);
  }
  return problems;
}

/** The canary's round against the plain one: the planted cost must show in the bodies' part. */
function canaryProblems(plain: Round, planted: Round): { line: string; problems: string[] } {
  const total = (round: Round) => round.falling.reduce((sum, timed) => sum + timed.bodies, 0);
  const plantedCost = planted.falling.reduce((sum, timed) => sum + timed.lying, 0) * CANARY_MS;
  const seen = total(planted) - total(plain);
  const line = `canary: ${ms(plantedCost)} planted in the bodies, ${ms(seen)} more seen`;
  const problems = seen < plantedCost * CANARY_SEEN ? ['the canary\'s planted cost went unseen'] : [];
  return { line, problems };
}

/** `lab crowd`: a crowd killed at once at each slowdown and frame rate, and what its bodies cost the frame. */
export async function crowd(lab: Lab, options: CrowdOptions): Promise<Report> {
  const count = options.count ?? WAVES.maxAlive(Infinity);
  const throttles = options.throttles ?? THROTTLES;
  const rates = options.rates ?? RATES;
  const how = options.skill ? `by ${options.skill}` : 'by a blow each, thrown hard';
  const lines = [`${G.player.cls.id}: ${count} ${foeKind()}s killed at once ${how}, in ${G.arena.biome}`];
  const rounds: Round[] = [];
  for (const rate of rates) {
    for (const throttle of throttles) {
      const each = await round(lab, options, count, throttle, rate);
      rounds.push(each);
      lines.push(roundLine(each));
    }
  }
  const problems = rounds.flatMap((each) => roundProblems(each, count));
  if (!options.canary) return { text: lines.join('\n'), problems };
  // (the first round again, its bodies made slower)
  const plain = rounds[0];
  const putBack = plantCost();
  let planted: Round;
  try {
    planted = await round(lab, options, count, plain.throttle, plain.rate);
  } finally {
    putBack();
  }
  const canary = canaryProblems(plain, planted);
  lines.push(canary.line);
  return { text: lines.join('\n'), problems: [...problems, ...canary.problems] };
}
