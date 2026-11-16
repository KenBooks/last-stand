// The foes coming in (tools/lab `spawns`): waves set off one after another in each biome, each from a seed of its own
// (boss waves, the 5th, 10th, 15th and 20th in turn), the hero standing at the arena's middle, and how every foe came:
// the gate it came in by and the spot it rose on against the props and the arena's edge, the gates each group of foes
// and each wave came by, when the boss came against its wave's first group reaching the hero, and from each gate a
// boss's walk to the hero; then a few waves at the game's own pace (page/spawnPace.ts). A number of gates (one to
// four) no group came by, a wave that left a gate idle though its packs were enough for every gate, a gate no boss
// came by, a foe risen inside a prop (it rises in place, and once up is shoved out of the prop in a frame), a boss
// with or before its wave's first group or outside its time against it, and a gate from which the boss never reached
// the hero are problems (page/spawnGates.ts and page/spawnVerdicts.ts judge them). On main each group came by two
// gates picked at random, often one twice, every boss in the first group by one gate, anywhere 3 m to either side of
// its middle, and by the Thornwood's west gate foes and the boss rose in a log.
import type { Fixture, Lab, Report } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import type { BiomeId } from '../../../src/data/biomes';
import type { Obstacle } from '../../../src/types';
import { G } from '../../../src/state';
import {
  bossesCaught, bossWindow, inside, metres, riseProblems, risesLines, walkLine, walkProblems, type Rise, type Walk,
} from './spawnVerdicts';
import { gateName, oneGateVerdict } from './spawnGates';
import {
  BOSS_ROUNDS, beginWave, bossOf, freeze, readWave, riseOf, setOffWave, walkOf, waveAt, type WaveAsk,
} from './spawnWaves';
import { PACED_WAVES, paceWave, pacedLine } from './spawnPace';

export interface SpawnsOptions {
  fixture: Fixture;
  biomes: BiomeId[];
  /** the waves set off in each biome */
  waves: number;
  canary?: boolean;
}

/** where the hero stands unless the fixture says: the arena's middle, as far from every gate */
const MIDDLE: [number, number] = [0, 0];
/** with --canary, the gate every foe is moved onto once read, which the gates' counts must find alone */
const CANARY_GATE = 1;
/** how far into the arena from a gate a canary's foe is put (m) */
const CANARY_DEPTH = 2;
/** with --canary, how much later than its window a planted boss comes (s) */
const CANARY_LATE = 2;
/** the frames a canary's wave has for its first group to come */
const FIRST_FRAMES = 60;

/** What one biome's waves found: its lines of the report and its problems. */
interface BiomeRound {
  lines: string[];
  problems: string[];
}

/** The foe moved to `x`, `z`, as a canary's is. */
function moveFoe(foe: Enemy, x: number, z: number): void {
  foe.pos.x = x;
  foe.pos.z = z;
}

/** The foe moved with its middle onto the edge of the prop nearest it, half inside it. */
function intoNearestProp(foe: Enemy): void {
  const { x, z } = foe.pos;
  const distanceTo = (obstacle: Obstacle) => Math.hypot(x - obstacle.x, z - obstacle.z);
  const nearer = (best: Obstacle, obstacle: Obstacle) => (distanceTo(obstacle) < distanceTo(best) ? obstacle : best);
  const nearest = G.arena.obstacles.reduce(nearer);
  const away = distanceTo(nearest) || 1;
  moveFoe(foe, nearest.x + (x - nearest.x) / away * nearest.r, nearest.z + (z - nearest.z) / away * nearest.r);
}

/** The boss of a wave just read walked to the hero, from its rise; null if none stands (on main it came first). */
async function walkTheBoss(lab: Lab, rises: Rise[]): Promise<Walk | null> {
  const boss = bossOf();
  const rose = rises.find((rise) => rise.boss);
  if (!boss || !rose) return null;
  return walkOf(lab, boss, rose.gate, rose.time);
}

/** A canary's line: what it planted, what the measure made of it, and whether that caught it. */
function canaryLine(planted: string, found: string, caught: boolean): string {
  return `  canary, ${planted}: ${found}${caught ? ': caught' : ''}`;
}

/**
 * The canaries, in the first biome: every foe of its waves read again moved onto `CANARY_GATE`, whose groups, waves
 * and bosses the gates' checks must find leaving gates idle; the first moved half into a prop, which the room must
 * find; and three waves of their own: one with its boss put first, one with its boss come late, which the boss
 * checks must find, and one with its boss frozen where it rose, whose walk must never reach the hero.
 */
class Canaries {
  private readonly oneGate: Rise[] = [];
  private inProp: Rise | null = null;
  private bossFirst: Rise[] = [];
  private bossLate: Rise[] | null = null;
  private frozen: Walk | null = null;

  /** Each foe of a wave read again moved onto the canary's gate, the first of the first wave half into a prop. */
  reader(wave: WaveAsk): (foe: Enemy, group: number) => void {
    return (foe, group) => {
      const { x, z } = foe.pos;
      const portal = G.arena.portals[CANARY_GATE];
      moveFoe(foe, portal.pos.x + portal.dir.x * CANARY_DEPTH, portal.pos.z + portal.dir.z * CANARY_DEPTH);
      this.oneGate.push(riseOf(foe, wave.index, group, this.oneGate.length));
      if (this.inProp === null) {
        intoNearestProp(foe);
        this.inProp = riseOf(foe, wave.index, group, 0);
      }
      moveFoe(foe, x, z);
    };
  }

  /** The canaries' waves of their own, from the series' `waves`th on. */
  async plantWaves(lab: Lab, fixture: Fixture, waves: number): Promise<void> {
    await this.plantFirst(lab, fixture, waveAt(waves));
    await this.plantLate(lab, fixture, waveAt(waves + 1));
    await setOffWave(lab, fixture, waveAt(waves + 2));
    const rises = await readWave(lab, waveAt(waves + 2), (foe) => foe.boss && freeze(foe));
    this.frozen = await walkTheBoss(lab, rises);
  }

  /** A boss put ahead of its wave's first group (on main it came in it anyway). */
  private async plantFirst(lab: Lab, fixture: Fixture, wave: WaveAsk): Promise<void> {
    await beginWave(lab, fixture, wave);
    const run = G.run!;
    if (run.boss) {
      run.queue.unshift(run.boss);
      run.boss = null;
    }
    this.bossFirst = await readWave(lab, wave);
  }

  /** A boss come later than its window, its time put back once the wave's first group has come. */
  private async plantLate(lab: Lab, fixture: Fixture, wave: WaveAsk): Promise<void> {
    const window = bossWindow();
    if (!window) return;
    await beginWave(lab, fixture, wave);
    const run = G.run!;
    await lab.until(() => run.dealt > 0, FIRST_FRAMES, 'the canary\'s wave\'s first group never came');
    run.bossT += window[1] - window[0] + CANARY_LATE;
    this.bossLate = await readWave(lab, wave);
  }

  /** Each canary's line, and a problem for each one missed. */
  verdict(biome: BiomeId, round: BiomeRound): void {
    const oneGate = oneGateVerdict(this.oneGate);
    const unseen = oneGate.unseen.length > 0 ? oneGate.unseen.join(' or ') : 'none';
    const idle = `no group by ${unseen} gates, ${oneGate.waves} waves left a gate idle`;
    round.lines.push(canaryLine(`every foe moved onto ${gateName(CANARY_GATE)}`, idle, oneGate.caught));
    if (!oneGate.caught) round.problems.push(`${biome}: the canary's foes all on one gate went unseen`);
    const propCaught = this.inProp !== null && inside([this.inProp]).length > 0;
    const room = `room ${metres(this.inProp?.props ?? 0)} m`;
    round.lines.push(canaryLine('a foe moved half into a prop', room, propCaught));
    if (!propCaught) round.problems.push(`${biome}: the canary's foe in a prop went unseen`);
    const firstCaught = bossesCaught(biome, this.bossFirst);
    const firstAt = this.bossFirst.find((rise) => rise.boss)?.order;
    round.lines.push(canaryLine('a boss put first', `rose ${firstAt ?? 'never'} of its wave`, firstCaught));
    if (!firstCaught) round.problems.push(`${biome}: the canary's boss put first went unseen`);
    this.lateVerdict(biome, round);
    const frozenCaught = this.frozen !== null && this.frozen.seconds === null;
    const walked = this.frozen ? walkLine(this.frozen) : 'no boss stood to walk';
    round.lines.push(canaryLine('a boss frozen where it rose', walked, frozenCaught));
    if (this.frozen && !frozenCaught) round.problems.push(`${biome}: the canary's frozen boss went unseen`);
  }

  /** The late boss's line, and a problem if it went unseen; none in a tree with no time for the boss. */
  private lateVerdict(biome: BiomeId, round: BiomeRound): void {
    if (!this.bossLate) {
      round.lines.push('  canary, a boss come late: no time for the boss in this tree');
      return;
    }
    const caught = bossesCaught(biome, this.bossLate);
    round.lines.push(canaryLine(`a boss come ${CANARY_LATE} s after its window`, 'judged', caught));
    if (!caught) round.problems.push(`${biome}: the canary's late boss went unseen`);
  }
}

/** What a biome's round is asked for: the set-up, the biome, its waves and whether its canaries are planted. */
interface BiomeAsk {
  fixture: Fixture;
  biome: BiomeId;
  waves: number;
  canary: boolean;
}

/** What a biome's series read: every foe's rise, and the bosses' walks. */
interface Series {
  rises: Rise[];
  walks: Walk[];
}

/** Every foe's rise over the biome's waves, and from each gate a boss came by the first boss's walk to the hero. */
async function readSeries(lab: Lab, ask: BiomeAsk, canaries: Canaries | null): Promise<Series> {
  const rises: Rise[] = [];
  const walks: Walk[] = [];
  for (let index = 0; index < ask.waves; index++) {
    const wave = waveAt(index);
    await setOffWave(lab, ask.fixture, wave);
    const read = await readWave(lab, wave, canaries?.reader(wave));
    rises.push(...read);
    const boss = read.find((rise) => rise.boss);
    if (boss && !walks.some((walk) => walk.gate === boss.gate)) {
      const walk = await walkTheBoss(lab, read);
      if (walk) walks.push(walk);
    }
  }
  return { rises, walks: walks.sort((a, b) => a.gate - b.gate) };
}

/** The paced waves, as lines. */
async function pacedLines(lab: Lab, fixture: Fixture): Promise<string[]> {
  const lines = ['at the game\'s own pace, each foe taken out as it reaches the hero (groups\' foes and seconds):'];
  for (const [index, number] of PACED_WAVES.entries()) {
    lines.push(`  ${pacedLine(await paceWave(lab, fixture, number, index))}`);
  }
  return lines;
}

/**
 * One biome's waves, the hero at the fixture's spot: every foe's rise, a boss's walk to the hero from each gate one
 * came by, and the paced waves.
 */
async function biomeRound(lab: Lab, ask: BiomeAsk): Promise<BiomeRound> {
  const { fixture, biome } = ask;
  if (G.arena.biome !== biome) G.arena.setBiome(biome);
  const canaries = ask.canary ? new Canaries() : null;
  const { rises, walks } = await readSeries(lab, ask, canaries);
  const bossGates = [...new Set(rises.filter((rise) => rise.boss).map((rise) => rise.gate))];
  const unwalked = bossGates.filter((gate) => !walks.some((walk) => walk.gate === gate));
  const unwalkedLines = unwalked.map((gate) => `no boss walked from ${gateName(gate)}: none stood once its wave had `
    + 'all come');
  const paced = await pacedLines(lab, fixture);
  if (canaries) await canaries.plantWaves(lab, fixture, ask.waves);
  const [x, z] = fixture.at ?? MIDDLE;
  const numbers = Array.from({ length: BOSS_ROUNDS }, (_, round) => waveAt(round).number).join(', ');
  const round: BiomeRound = {
    lines: [
      `${biome}: ${ask.waves} boss waves (waves ${numbers} in turn), each from a seed of its own, `
        + `the hero at ${x},${z}`,
      ...risesLines(rises).map((line) => `  ${line}`),
      ...walks.map((walk) => `  ${walkLine(walk)}`),
      ...unwalkedLines.map((line) => `  ${line}`),
      ...paced.map((line) => `  ${line}`),
    ],
    problems: [
      ...riseProblems(biome, rises),
      ...walkProblems(biome, walks),
      ...unwalkedLines.map((line) => `${biome}: ${line}`),
    ],
  };
  canaries?.verdict(biome, round);
  return round;
}

/**
 * `lab spawns`: waves in each biome, and how every foe came in: by which gate, in which group, onto what spot, when
 * the boss came, whether it walked to the hero from each gate, and a few waves at the game's own pace; a group or wave
 * leaving a gate idle, a gate no boss came by, a foe risen in a prop, a boss early or late, a boss that never reached
 * the hero and a canary missed are problems.
 */
export async function spawns(lab: Lab, options: SpawnsOptions): Promise<Report> {
  const fixture: Fixture = { ...options.fixture, at: options.fixture.at ?? MIDDLE };
  const lines: string[] = [];
  const problems: string[] = [];
  for (const [index, biome] of options.biomes.entries()) {
    const canary = options.canary === true && index === 0;
    const round = await biomeRound(lab, { fixture, biome, waves: options.waves, canary });
    lines.push(...round.lines);
    problems.push(...round.problems);
  }
  return { text: lines.join('\n'), problems };
}
