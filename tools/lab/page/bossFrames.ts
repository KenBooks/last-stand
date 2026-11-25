// `boss --parts frames`: the frame's time through each of the Crypt's boss waves, against its first (the Colossus's,
// as on main): each wave set off from its countdown as the game sets one off, its bosses risen, and its frames timed
// whole by the browser's clock (the game's frame run and drawn, then waited out on the GPU, `gpuDone`), the waves in
// turns in one page, round after round, so the shared PC's load and the page's warming fall on each alike (an `--ab`'s
// first side read faster than its second). The foes the wave has sent by then come too, as in play: each turn says
// how many stood. Wave 10 is timed a second way too, at its busiest (`busiest`): its Cantor's choir's ring up and its
// stones standing at their most, both guards up, as late in its fight. `--canary` times the second boss wave a second
// time with `CANARY_SLOW` ms of work planted in each of its frames (before the game's frame, inside the step): it must
// read at least `CANARY_SHARE` of it more.
import type { Lab } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import { G } from '../../../src/state';
import { WAVES } from '../../../src/data/waves';
import { startNextWave } from '../../../src/game/run';
import { gpuDone } from '../../../src/core/webgpu';
import { quantile } from './timing';
import { fx } from '../../../src/entities/enemyAI';
import { graveSpot } from '../../../src/entities/cantor';
import { gravesLeft } from '../../../src/world/risenGraves';
import { ENEMIES } from '../../../src/data/enemies';

/** The rounds of turns, and the frames a turn settles over untimed and then times. */
const ROUNDS = 3;
const SETTLE_FRAMES = 60;
const TIMED_FRAMES = 120;
/** Frames for a wave to start from its countdown, and for its bosses to rise after. */
const START_FRAMES = 30;
const RISE_FRAMES = 600;
/** The canary's work planted in each frame (ms), and the least share of it the frame must read more. */
const CANARY_SLOW = 2;
const CANARY_SHARE = 0.8;

/** What the part is handed: the lab, its set-up (stood in the crypt), the canary, and where to report. */
export interface FramesMeasure {
  lab: Lab;
  stand: () => Promise<void>;
  canary: boolean;
  lines: string[];
  problems: string[];
}

/** One turn's frames: their times (ms) and the foes standing through them. */
interface Turn {
  times: number[];
  foes: number;
  bosses: string;
}

/** A wave timed: its number, whether its frames carry the canary's planted work, and whether it's timed at its busiest
 *  (the encounter's choir's ring up and its stones at their most). */
interface Timing {
  wave: number;
  slowed: boolean;
  busiest?: boolean;
}

/** The Crypt's boss waves timed in turns, each against the first's. */
export async function bossFrames({ lab, stand, canary, lines, problems }: FramesMeasure): Promise<void> {
  const waves = [1, 2, 3].map((k) => k * WAVES.bossEvery);
  const timings: Timing[] = waves.map((wave) => ({ wave, slowed: false }));
  timings.splice(2, 0, { wave: waves[1], slowed: false, busiest: true });
  if (canary) timings.push({ wave: waves[1], slowed: true });
  const turns = new Map<Timing, Turn[]>(timings.map((timing) => [timing, []]));
  for (let round = 0; round < ROUNDS; round++) {
    // (each round begins one wave further on, so no wave always follows the same one)
    const order = timings.map((_, i) => timings[(i + round) % timings.length]);
    for (const timing of order) {
      await stand();
      turns.get(timing)!.push(await timedWave(lab, timing));
    }
  }
  const timesOf = (timing: Timing): number[] => turns.get(timing)!.flatMap((turn) => turn.times);
  const medians = new Map(timings.map((timing) => [timing, medianOf(timesOf(timing))]));
  const first = medians.get(timings[0])!;
  for (const timing of timings.filter((each) => !each.slowed)) {
    lines.push(waveLine(timing, turns.get(timing)!, medians.get(timing)!, first));
  }
  if (canary) {
    const slowed = timings.find((timing) => timing.slowed)!;
    const plain = timings.find((timing) => timing.wave === slowed.wave && !timing.slowed)!;
    const more = medians.get(slowed)! - medians.get(plain)!;
    const read = `${more.toFixed(2)} ms`;
    lines.push(`frames: canary: wave ${slowed.wave} with ${CANARY_SLOW} ms planted a frame read ${read} more`);
    if (more >= CANARY_SHARE * CANARY_SLOW) problems.push(`frames: canary: the planted ${CANARY_SLOW} ms read ${read}`);
  }
}

/** A wave's line: its bosses, the frame's median and 90th over its turns, each turn's median, against the first's. */
function waveLine(timing: Timing, turns: Turn[], median: number, first: number): string {
  const all = turns.flatMap((turn) => turn.times).sort((a, b) => a - b);
  const each = turns.map((turn) => `${medianOf(turn.times).toFixed(2)} ms with ${turn.foes} foes`).join(', ');
  const firstWave = WAVES.bossEvery;
  const against = timing.wave === firstWave ? '' : `, ${(median / first).toFixed(2)}x wave ${firstWave}'s`;
  const busiest = timing.busiest ? ' at its busiest (its choir\'s ring up, its stones at their most)' : '';
  return `frames: wave ${timing.wave}${busiest} (${turns[0].bosses}): the frame ${median.toFixed(2)} ms, `
    + `90th ${quantile(all, 0.9).toFixed(2)} ms${against} (${all.length} frames; each turn ${each})`;
}

/** The Crypt's wave `timing.wave` set off from its countdown, its bosses risen, then its frames timed and the wave
 *  stopped. */
async function timedWave(lab: Lab, timing: Timing): Promise<Turn> {
  lab.letWavesCome();
  const run = G.run!;
  run.wave = timing.wave;
  startNextWave();
  run.phase = 'countdown';
  run.timer = 0;
  await lab.until(() => run.phase === 'fighting', START_FRAMES, `frames: wave ${timing.wave} never started`);
  await lab.until(() => run.boss === null && bossesUp().length > 0, RISE_FRAMES,
    `frames: wave ${timing.wave}'s bosses never rose`);
  if (timing.busiest) await busiest(lab);
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    for (let frame = 0; frame < SETTLE_FRAMES; frame++) await timedFrame(lab, timing.slowed);
    const times: number[] = [];
    let foes = 0;
    for (let frame = 0; frame < TIMED_FRAMES; frame++) {
      times.push(await timedFrame(lab, timing.slowed));
      foes = Math.max(foes, G.enemies.filter((foe) => foe.alive).length);
    }
    const bosses = bossesUp().map((boss) => boss.type).join(', ');
    return { times, foes, bosses };
  } finally {
    lab.drawing = drawing;
    run.queue.length = 0;
    run.boss = null;
    for (const foe of G.enemies) foe.takeDamage(foe.life + 1, {});
  }
}

/** How long the stones are given to rise, from their warning (frames). */
const STONES_UP = 60;

/** The encounter at its busiest: the Cantor's choir's ring cast round it, and stones warned at the spots its fight
 *  rolls until they stand at their most. */
async function busiest(lab: Lab): Promise<void> {
  const cantor = G.enemies.find((foe) => foe.type === 'cantor' && foe.alive);
  if (!cantor) throw new Error('frames: no Cantor stands at its busiest');
  fx('choirRing', cantor.id, cantor.pos.x, cantor.pos.z, ENEMIES.cantor.bossKit!.attacks!.choir.warn);
  for (let left = gravesLeft(); left > 0; left--) {
    const spot = graveSpot();
    if (!spot) break;
    fx('graveStone', cantor.id, spot.x, spot.z, Math.atan2(-spot.x, -spot.z), 0, 0.3);
  }
  await lab.step(STONES_UP, () => {
    G.player.life = G.player.stats.maxLife;
    return {};
  });
}

/** The bosses up and risen (an encounter's guards among them). */
function bossesUp(): Enemy[] {
  const guards = (foe: Enemy): boolean => Boolean((foe as { guard?: boolean }).guard);
  return G.enemies.filter((foe) => foe.alive && foe.spawning <= 0 && (foe.def.boss || guards(foe)));
}

/** One frame run and drawn, `slowed` by the canary's planted work, waited out on the GPU: its time (ms, by the
 *  browser's clock). */
async function timedFrame(lab: Lab, slowed: boolean): Promise<number> {
  const now = window.__labClock.realNow;
  const start = now();
  await lab.step(1, () => {
    G.player.life = G.player.stats.maxLife;
    if (slowed) busy(CANARY_SLOW);
    return {};
  });
  await gpuDone(G.renderer);
  return now() - start;
}

/** The thread held `ms` by the browser's clock. */
function busy(ms: number): void {
  const now = window.__labClock.realNow;
  const until = now() + ms;
  while (now() < until) {
    // (the canary's planted work)
  }
}

/** The median of `values`. */
const medianOf = (values: number[]): number => quantile([...values].sort((a, b) => a - b), 0.5);
