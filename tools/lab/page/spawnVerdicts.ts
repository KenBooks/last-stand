// What the foes' rises say (tools/lab `spawns`, page/spawns.ts reads them): the gates each group and wave came by, the
// spots they rose on against the props and the arena's edge, when each boss came against its wave's first group
// reaching the hero, and the bosses' walks to the hero; as the report's lines and its problems.
import type { EnemyId } from '../../../src/data/enemies';
import type { BiomeId } from '../../../src/data/biomes';
import { gateName, gatesLines, gatesProblems, groupsOf } from './spawnGates';
import { WAVES } from '../../../src/data/waves';

/** A foe as it rose: its wave, its group, its place in the wave, what it is, when, by which gate, where, its room. */
export interface Rise {
  wave: number;
  group: number;
  /** its place among the wave's foes as they rose */
  order: number;
  type: EnemyId;
  boss: boolean;
  /** the game's time as it rose (s) */
  time: number;
  gate: number;
  /** how far into the arena from its gate it rose, and how far to the side of the gate's middle (m) */
  depth: number;
  side: number;
  /** its body's least distance from a prop's circle (m; under 0, it is inside one) */
  props: number;
  /** how far its body may go straight out before it meets the wall as drawn, a gate's opening out to its portal (m) */
  edge: number;
  /** a foe of the wave's first group: the game's time it came within its reach of the hero (s), null if it never did
   *  (or if it is of another group) */
  reached: number | null;
}

/** A boss's walk from its gate to the hero. */
export interface Walk {
  gate: number;
  /** the seconds it took from its rise to come within its slam's reach of the hero; null if it never did */
  seconds: number | null;
  /** the nearest it came (m) */
  closest: number;
}

/** When a wave's boss came: whether after its wave's first group, and against that group's foes reaching the hero. */
interface BossCame {
  rise: Rise;
  afterFirst: boolean;
  /** its rise against the mean moment its wave's first group reached the hero (s; under 0, before): null when none of
   *  that group did */
  offset: number | null;
  /** how long that group took to reach the hero on average, from its coming (s) */
  firstReach: number | null;
  /** how many of that group's foes never reached the hero */
  neverReached: number;
}

/** how far into a prop a foe may rise and still count as clear (m): pushed out, it rises touching it */
export const ROOM_SLACK = 0.001;
/** how far outside its give or take a boss may come (s): the game times it by a straight walk at each foe's wave's
 *  pace, and each foe's own pace is a few percent either way, a prop makes a walk longer and a crowd slows one */
const BOSS_SLACK = 1.5;

/** A length in metres to the centimetre, a hair under nothing shown as nothing (a spot pushed out touches). */
export function metres(length: number): string {
  return (Math.abs(length) < ROOM_SLACK ? 0 : length).toFixed(2);
}

/** The range of a list of numbers, as a line's part: `lo to hi`. */
function spanOf(values: number[]): string {
  return `${Math.min(...values).toFixed(1)} to ${Math.max(...values).toFixed(1)}`;
}

/** How a list of foes rose, as a line's part: how far in, and how far to the side of the gate's middle. */
function spotsOf(rises: Rise[]): string {
  if (rises.length === 0) return 'none';
  const depths = spanOf(rises.map((rise) => rise.depth));
  const sides = spanOf(rises.map((rise) => rise.side));
  return `${depths} m into the arena, ${sides} m to the side of the gate's middle`;
}

/** Where a foe rose, as a line's part: what it is, its wave and its gate. */
function whoRose(rise: Rise): string {
  return `a ${rise.type}, wave ${rise.wave}, by ${gateName(rise.gate)}`;
}

/** The foes risen inside a prop or past the edge. */
export function inside(rises: Rise[]): Rise[] {
  return rises.filter((rise) => Math.min(rise.props, rise.edge) < -ROOM_SLACK);
}

/**
 * The window a boss comes in against its wave's first group reaching the hero (s), as the tree's waves say (give or
 * take `bossJitter`, and `BOSS_SLACK`); null in a tree with no such time (on main the boss came in the first group).
 */
export function bossWindow(): [number, number] | null {
  const timing = WAVES as { bossDelay?: number; bossJitter?: number };
  if (timing.bossJitter === undefined || timing.bossDelay !== undefined) return null;
  return [-timing.bossJitter - BOSS_SLACK, timing.bossJitter + BOSS_SLACK];
}

/** The mean of some numbers. */
function meanOf(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** When each wave's boss came, against its wave's first group (its group 0) reaching the hero. */
function bossesCame(rises: Rise[]): BossCame[] {
  const came: BossCame[] = [];
  for (const wave of groupsOf(rises, (rise) => `${rise.wave}`)) {
    const boss = wave.find((rise) => rise.boss);
    if (!boss) continue;
    const first = wave.filter((rise) => rise.group === 0 && !rise.boss);
    const reached = first.flatMap((rise) => (rise.reached === null ? [] : [rise.reached]));
    // (from the moment the group came: its first foe rises in the frame it comes)
    const groupCame = Math.min(...wave.filter((rise) => rise.group === 0).map((rise) => rise.time));
    const meanReached = reached.length > 0 ? meanOf(reached) : null;
    came.push({
      rise: boss,
      afterFirst: boss.group > 0,
      offset: meanReached === null ? null : boss.time - meanReached,
      firstReach: meanReached === null ? null : meanReached - groupCame,
      neverReached: first.length - reached.length,
    });
  }
  return came;
}

/** The bosses that came outside their window. */
function outsideWindow(came: BossCame[], window: [number, number]): BossCame[] {
  return came.filter((boss) => boss.offset !== null && (boss.offset < window[0] || boss.offset > window[1]));
}

/** The numbers of a list that are there. */
function present(values: (number | null)[]): number[] {
  return values.flatMap((value) => (value === null ? [] : [value]));
}

/** When the bosses came, as a line: after the first group or not, and against that group reaching the hero. */
function bossesLine(came: BossCame[]): string {
  const afterFirst = came.filter((boss) => boss.afterFirst).length;
  const offsets = present(came.map((boss) => boss.offset));
  const reaches = present(came.map((boss) => boss.firstReach));
  const never = came.reduce((sum, boss) => sum + boss.neverReached, 0);
  const against = offsets.length > 0
    ? `, ${spanOf(offsets)} s from the moment it reached the hero (${meanOf(offsets).toFixed(1)} on average; the `
      + `first groups reached him ${spanOf(reaches)} s after they came, ${never} of their foes never did)`
    : '';
  return `the bosses rose after their wave's first group in ${afterFirst} of ${came.length}${against}`;
}

/** The foes' rises as lines: the gates, the groups and waves, the spots and the room, the bosses' gates and time. */
export function risesLines(rises: Rise[]): string[] {
  const tightest = rises.reduce((best, rise) => (rise.props < best.props ? rise : best));
  const edge = Math.min(...rises.map((rise) => rise.edge));
  const bosses = rises.filter((rise) => rise.boss);
  return [
    ...gatesLines(rises),
    `rose ${spotsOf(rises.filter((rise) => !rise.boss))}; a boss ${spotsOf(bosses)}`,
    `room from the props ${metres(tightest.props)} m at least (${whoRose(tightest)}), from the edge `
      + `${metres(edge)} m; ${inside(rises).length} rose inside a prop or past the edge`,
    bossesLine(bossesCame(rises)),
  ];
}

/** The problems with when the bosses came: in their wave's first group, or outside their window against it. */
function bossProblems(biome: BiomeId, rises: Rise[]): string[] {
  const problems: string[] = [];
  const came = bossesCame(rises);
  const early = came.filter((boss) => !boss.afterFirst);
  if (early.length > 0) {
    problems.push(`${biome}: ${early.length} of ${came.length} bosses rose with or before their wave's first group`);
  }
  const window = bossWindow();
  const outside = window ? outsideWindow(came, window) : [];
  if (window && outside.length > 0) {
    const worst = outside.map((boss) => boss.offset!.toFixed(1)).join(', ');
    problems.push(`${biome}: ${outside.length} bosses came outside ${window[0].toFixed(1)} to `
      + `${window[1].toFixed(1)} s from their first group reaching the hero (${worst} s)`);
  }
  return problems;
}

/** The problems with the rises: the gates' (page/spawnGates.ts), foes risen in a prop, and the bosses' time. */
export function riseProblems(biome: BiomeId, rises: Rise[]): string[] {
  const problems: string[] = [...gatesProblems(biome, rises)];
  const risenInside = inside(rises);
  if (risenInside.length > 0) {
    const deepest = risenInside.reduce((best, rise) => (rise.props < best.props ? rise : best));
    problems.push(`${biome}: ${risenInside.length} foes rose inside a prop or past the edge, the deepest `
      + `${metres(-Math.min(deepest.props, deepest.edge))} m (${whoRose(deepest)})`);
  }
  return [...problems, ...bossProblems(biome, rises)];
}

/** Whether the boss checks find a canary's wave: its boss first, or outside its window. */
export function bossesCaught(biome: BiomeId, rises: Rise[]): boolean {
  return bossProblems(biome, rises).length > 0;
}

/** A walk as a line of the report. */
export function walkLine(walk: Walk): string {
  const from = `the boss from ${gateName(walk.gate)}`;
  if (walk.seconds === null) return `${from}: never reached the hero (${walk.closest.toFixed(1)} m at the nearest)`;
  return `${from}: reached the hero in ${walk.seconds.toFixed(1)} s`;
}

/** The problems with the walks: a gate from which the boss never reached the hero. */
export function walkProblems(biome: BiomeId, walks: Walk[]): string[] {
  return walks.filter((walk) => walk.seconds === null).map((walk) => `${biome}: ${walkLine(walk)}`);
}
