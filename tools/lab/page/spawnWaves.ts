// Waves set off and read for tools/lab `spawns` (page/spawns.ts): the run set up afresh and a wave set off from a seed
// of its own, every foe read as it rises, the wave's first group timed to the hero, and a boss walked to him.
import type { Fixture, Lab } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import { G } from '../../../src/state';
import { WAVES } from '../../../src/data/waves';
import type { Rise, Walk } from './spawnVerdicts';
import { gateOf } from './spawnGates';

/** A wave as it is set off: its place in a series, its seed and its number in the run. */
export interface WaveAsk {
  index: number;
  seed: number;
  number: number;
}

/** the first wave's seed, each wave's the next: each set-up seeds the same numbers, which would roll the same gates */
const WAVE_SEED = 0x5bd1e995;
/** the boss waves taken in turn: the 5th, 10th, 15th and 20th, their groups of more foes and more of them */
export const BOSS_ROUNDS = 4;
/** the frames a wave's foes have to rise and its first group to reach the hero */
const READ_FRAMES = 2400;
/** the most a foe of the first group is waited for to reach the hero (s) */
const REACH_SECONDS = 25;
/** the most a boss walks to the hero, s */
const WALK_SECONDS = 30;
/** how near the hero a boss has come (m) past its slam's reach, which the boss AI strikes within */
const SLAM_REACH = 1.5;

/** The `index`th wave of a biome's series. */
export function waveAt(index: number): WaveAsk {
  return { index, seed: WAVE_SEED + index, number: WAVES.bossEvery * (1 + index % BOSS_ROUNDS) };
}

/** The boss of the wave under way, once it has come. */
export function bossOf(): Enemy | undefined {
  return G.enemies.find((enemy) => enemy.boss && enemy.alive);
}

/** Whether a foe has come within its reach of the hero: its range and his body, as the foes' AI strikes within. */
export function withinReach(lab: Lab, foe: Enemy): boolean {
  const distance = Math.hypot(foe.pos.x - lab.player.pos.x, foe.pos.z - lab.player.pos.z);
  return distance < (foe.def.range ?? 0) + lab.player.radius;
}

/** A body's least distance from the props' circles (m; under 0, inside one). */
function roomFromProps(x: number, z: number, radius: number): number {
  let room = Infinity;
  for (const obstacle of G.arena.obstacles) {
    room = Math.min(room, Math.hypot(x - obstacle.x, z - obstacle.z) - obstacle.r - radius);
  }
  return room;
}

/** How a foe rose, read from where it is: the `order`th foe of its wave, in its `group`th group. */
export function riseOf(foe: Enemy, wave: number, group: number, order: number): Rise {
  const { x, z } = foe.pos;
  const gate = gateOf(x, z);
  const portal = G.arena.portals[gate];
  const offX = x - portal.pos.x;
  const offZ = z - portal.pos.z;
  return {
    wave,
    group,
    order,
    type: foe.type,
    boss: foe.boss,
    time: G.time,
    gate,
    depth: offX * portal.dir.x + offZ * portal.dir.z,
    side: offX * -portal.dir.z + offZ * portal.dir.x,
    props: roomFromProps(x, z, foe.radius),
    // (the wall as drawn, a gate's opening out to its portal: read off the ring at the arena's radius, a brute rising
    // in a gate's mouth read 0.2 m past an edge no wall stands at)
    edge: G.arena.wall.roomOut(x, z, foe.radius),
    reached: null,
  };
}

/** Takes foes out of the run, as the set-up's hold of the wave does. */
export function removeFoes(foes: Enemy[]): void {
  for (const foe of foes) foe.dispose();
  const kept = G.enemies.filter((enemy) => !foes.includes(enemy));
  G.enemies.splice(0, G.enemies.length, ...kept);
}

/** The run set up afresh, the random numbers seeded with the wave's seed, and the wave set off. */
export async function setOffWave(lab: Lab, fixture: Fixture, wave: WaveAsk): Promise<void> {
  await lab.setup(fixture);
  window.__labSeed(wave.seed);
  lab.letWavesCome();
  const run = G.run!;
  run.wave = wave.number;
  run.timer = 0;
}

/** The wave set off and begun: its foes in their groups, none come yet (they come from the next frame). */
export async function beginWave(lab: Lab, fixture: Fixture, wave: WaveAsk): Promise<void> {
  await setOffWave(lab, fixture, wave);
  await lab.step(1);
  if (G.run!.phase !== 'fighting') throw new Error(`lab: spawns: wave ${wave.index} never began`);
}

/** The first group's foes still on their way to the hero: each one's time marked as it comes within its reach. */
function markReached(lab: Lab, walking: Map<Enemy, Rise>): void {
  for (const [foe, rise] of walking) {
    if (!withinReach(lab, foe)) continue;
    rise.reached = G.time;
    walking.delete(foe);
  }
}

/**
 * Every foe of the wave under way read as it rises, group by group, the boss when it comes. The first group is left
 * standing, each foe of it timed as it comes within its reach of the hero (the boss's time is reckoned from it); a
 * later group is taken out once its last foe has risen, and the next called at once (its first foe rises in the frame
 * it comes, so none comes early). Returns once every foe has come and the first group has reached the hero (or been
 * waited for `REACH_SECONDS`); the first group and the boss are left standing, the boss's summons held off. `read` is
 * shown each foe as it is read, for a canary.
 */
export async function readWave(lab: Lab, wave: WaveAsk, read?: (foe: Enemy, group: number) => void): Promise<Rise[]> {
  const run = G.run!;
  const rises: Rise[] = [];
  const seen = new Set<Enemy>();
  const walking = new Map<Enemy, Rise>();
  let group: Enemy[] = [];
  let groups = 0;
  for (let frame = 0; frame < READ_FRAMES; frame++) {
    await lab.step(1);
    for (const foe of G.enemies.filter((enemy) => !seen.has(enemy))) {
      const rise = riseOf(foe, wave.index, groups, rises.length);
      seen.add(foe);
      group.push(foe);
      rises.push(rise);
      if (groups === 0 && !foe.boss) walking.set(foe, rise);
      if (foe.boss) holdSummons(foe);
      read?.(foe, groups);
    }
    markReached(lab, walking);
    if (rises.length > 0 && G.time - rises[0].time > REACH_SECONDS) walking.clear();
    if (group.length > 0 && run.pending === 0) {
      if (groups > 0) removeFoes(group.filter((foe) => !foe.boss));
      run.nextGroupT = 0;
      group = [];
      groups++;
    }
    const allCame = groups > 0 && group.length === 0 && run.queue.length === 0 && !run.boss;
    if (allCame && walking.size === 0) return rises;
  }
  throw new Error(`lab: spawns: wave ${wave.index}'s foes never all came (not within ${READ_FRAMES} frames)`);
}

/** How far the boss is from the hero (m). */
function bossDistance(lab: Lab, boss: Enemy): number {
  return Math.hypot(boss.pos.x - lab.player.pos.x, boss.pos.z - lab.player.pos.z);
}

/**
 * The boss, risen by gate `gate` at the game's time `rose`, walked to the hero until `WALK_SECONDS` after it rose: how
 * long from its rise it took to come within its slam's reach (it may have walked a while as its wave was read).
 */
export async function walkOf(lab: Lab, boss: Enemy, gate: number, rose: number): Promise<Walk> {
  const reach = (boss.def.range ?? 0) + SLAM_REACH;
  let closest = bossDistance(lab, boss);
  while (closest >= reach && G.time - rose < WALK_SECONDS) {
    await lab.step(1);
    closest = Math.min(closest, bossDistance(lab, boss));
  }
  return { gate, seconds: closest < reach ? G.time - rose : null, closest };
}

/** The boss's summons held off: they rise round it, not by a gate, and would be read as a group of the wave's. */
function holdSummons(boss: Enemy): void {
  boss.brain.summonT = Infinity;
}

/** The boss frozen where it rose, for `WALK_SECONDS` and more, as a canary's is. */
export function freeze(boss: Enemy): void {
  boss.frozen = WALK_SECONDS * 2;
}
