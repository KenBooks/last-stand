// A skill's blows as they land (tools/lab `hits`): foes stand dazed where it strikes (as `death` stands them), living
// past every blow, and it is cast at them on a fresh set-up as the player casts it (held through for a channel, drawn
// to full for a drawn shot), `--than`'s skill held down for a row of its blows. Every hit is caught as it lands: its
// frame from the press, the foe, how much and how (`log` holds the battle log to them, cast as here). A blow is the
// hits landing within a frame of each other (one cut
// striking three foes); each blow's time, the gaps between them, when the hero was free again and the damage a second
// till then are listed. Striking nothing, a gap past `--apart` and blows no quicker than `--than`'s are problems.
// (The owner's Twin Fangs, its two cuts 0.36 s apart: "too slow", "both hits in a rapid succession... maybe 0.2sec",
// "should be faster than regular LMB skill".)
import type { Fixture, Lab, Report } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import type { DamageType } from '../../../src/types';
import { G } from '../../../src/state';
import { hitEnemy } from '../../../src/combat/damage';
import { bindKnown, holdFor, pressing, skillNamed, type BoundSkill } from './cast';
import { FACING, SPOT, STANDS, foesAt, placesFor, type Stand } from './death';
import { clearLane, laneClear, type LaneSize } from './lanes';

export interface HitsOptions {
  fixture: Fixture;
  /** the skills: their keys, behaviours or names */
  skills: string[];
  /** the most a skill's blows may be apart (s) */
  apart?: number;
  /** a skill whose blows each skill's must come quicker than (the basic attack: `cleave`), held down for a row */
  than?: string;
  /** plant the fault the checks must catch: a late blow after each skill's own (with `apart` or `than`), or else the
   *  foes kept from harm */
  canary: boolean;
}

/** What the canary plants in a skill's cast: a blow of its own struck `LATE` after its first, or its foes kept from
 *  harm all through it. */
type Plant = 'late' | 'harmless';

/** a foe's life: past every blow */
const LIVING = 1e5;
const SETTLE = 10;
/** frames followed from the press, at most, and once the hero is free again with the key up */
const MOST_FRAMES = 600;
const AFTER = 10;
/** how long `--than`'s skill is held down (s): a row of its blows */
const ROW_HOLD = 1.2;
/** hits this many frames or fewer apart are one blow */
const BLOW_FRAMES = 1;
/** where foes stand for a skill `death` doesn't stand them for */
const NEAR: Stand = { count: 3, ahead: 2, across: 0.8 };
/** with the canary: the late blow, this long after the first (s; past any skill's gap and the basic attack's) */
const LATE = 1;

const seconds = (value: number): string => `${value.toFixed(2)} s`;
const frameTime = (): number => window.__labClock.frame / 1000;

/** A hit as it landed: its frame from the press, the foe's number, how much it dealt and of which type, whether it was
 *  a crit and whether it killed. */
export interface Hit {
  frame: number;
  foe: number;
  amount: number;
  type: DamageType;
  crit: boolean;
  kill: boolean;
}

/** A blow: when it landed (s from the press), how many foes it struck and how much it dealt. */
interface Blow {
  at: number;
  foes: number;
  amount: number;
}

/** A skill cast at its foes: how long its key was held, the foes and the hits on them, its blows, when the hero was
 *  free again (s from the press; -1: never), and whether the canary planted its fault. */
export interface Cast {
  skill: BoundSkill;
  held: number;
  foes: Enemy[];
  hits: Hit[];
  blows: Blow[];
  free: number;
  planted: boolean;
}

/** A canary's plant in a cast, tried each frame once the frame has run, given the cast so far: true once planted.
 *  The cast is followed until it is. */
export type Planting = (frame: number, cast: Cast) => boolean;

/** The fixture with `death`'s spot and facing where it doesn't say. */
function fixtureOf(fixture: Fixture): Fixture {
  const facing = fixture.facing ?? (FACING * Math.PI) / 180;
  return { ...fixture, at: fixture.at ?? SPOT, facing };
}

/** The hits landing on `foes` from now on, each at the frame `frameNow` says. */
function catchHits(foes: Enemy[], frameNow: () => number): Hit[] {
  const hits: Hit[] = [];
  foes.forEach((foe, i) => {
    const takeDamage = foe.takeDamage.bind(foe);
    foe.takeDamage = (amount, info) => {
      const dealt = takeDamage(amount, info);
      const type = info?.type ?? 'physical';
      hits.push({ frame: frameNow(), foe: i, amount: dealt, type, crit: !!info?.crit, kill: !foe.alive });
      return dealt;
    };
  });
  return hits;
}

/** `hits` as blows: those landing within `BLOW_FRAMES` of the last one in it are one. */
function blowsOf(hits: Hit[]): Blow[] {
  const blows: Blow[] = [];
  let last = -Infinity;
  let struck = new Set<number>();
  for (const hit of hits) {
    if (hit.frame - last > BLOW_FRAMES) {
      blows.push({ at: hit.frame * frameTime(), foes: 0, amount: 0 });
      struck = new Set<number>();
    }
    const blow = blows[blows.length - 1];
    struck.add(hit.foe);
    blow.foes = struck.size;
    blow.amount += hit.amount;
    last = hit.frame;
  }
  return blows;
}

/** The gaps between `blows`, in turn (s). */
function gapsOf(blows: Blow[]): number[] {
  return blows.slice(1).map((blow, i) => blow.at - blows[i].at);
}

/** The middle of `values` (0: none). */
function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** The canary's 'harmless' plant: the foes kept from harm from the press. */
function keepFromHarm(_frame: number, cast: Cast): boolean {
  for (const foe of cast.foes) foe.invulnerable = true;
  return true;
}

/** The canary's 'late' plant: a blow of the skill's own struck `LATE` after its first. */
function lateBlow(frame: number, cast: Cast): boolean {
  if (!cast.hits.length) return false;
  if (frame !== cast.hits[0].frame + Math.round(LATE / frameTime())) return false;
  hitEnemy(cast.foes[0], 1, { by: G.player, skill: cast.skill.def, tags: ['physical'], type: 'physical' });
  return true;
}

const PLANTINGS: Record<Plant, Planting> = { harmless: keepFromHarm, late: lateBlow };

/** the way before the hero kept clear of props (m): as far as the foes stand and a bolt's splits fly on, and either
 *  side as far as they stand off it */
const CAST_LANE: LaneSize = { long: 9, wide: 2 };

/** The run set up as `fixture` says, the hero moved to the nearest clear lane where the set-up's props stand in his
 *  way and the fixture didn't say where he stands: the crypt's columns are rolled with each run, and one stood between
 *  him and the foes at the lab's spot in some, the log's bolts striking nothing there (`lab log --class mage`). */
async function clearSetup(lab: Lab, fixture: Fixture): Promise<Fixture> {
  const set = fixtureOf(fixture);
  await lab.setup(set);
  const at = set.at as [number, number];
  const facing = set.facing as number;
  if (fixture.at || laneClear(at, facing, CAST_LANE)) return set;
  const lane = clearLane(at, facing, CAST_LANE);
  const moved = { ...set, at: lane.at, facing: fixture.facing ?? lane.facing };
  await lab.setup(moved);
  if (!laneClear(lane.at, moved.facing, CAST_LANE)) {
    throw new Error(`lab: no lane clear of props for the cast near ${at.join(',')} in the ${G.arena.place}`);
  }
  return moved;
}

/** `wanted` cast at its foes (each with `lives` of life) on a fresh set-up as `fixture` says, its key held as long as
 *  `holding` says for it (s; a frame at least), followed until the hero is free again (and `plant` has planted), and
 *  for `lasting` s from the press at least (an effect that strikes on after it: a zone's ticks). */
export async function castAt(
  lab: Lab, fixture: Fixture, wanted: string, holding: (skill: BoundSkill) => number, plant: Planting | null,
  lives = LIVING, lasting = 0,
): Promise<Cast> {
  G.arena.restoreProps();
  const set = await clearSetup(lab, fixture);
  bindKnown(wanted);
  const skill = skillNamed(wanted);
  const hold = holding(skill);
  const hero = G.player;
  hero.cooldowns.clear();
  hero.energy = hero.stats.maxEnergy;
  const stand = STANDS[skill.def.impl] ?? NEAR;
  const { spots, aim } = placesFor(stand, hero.pos, set.facing ?? hero.facing);
  const foes = await foesAt(lab, spots, spots.map(() => lives));
  let frame = 0;
  const hits = catchHits(foes, () => frame);
  const holdFrames = Math.max(1, Math.round(hold / frameTime()));
  const lastingFrames = Math.round(lasting / frameTime());
  const cast: Cast = { skill, held: hold, foes, hits, blows: [], free: -1, planted: false };
  await lab.step(SETTLE, () => ({ aim }));
  let freeFor = 0;
  for (; frame < MOST_FRAMES; frame++) {
    await lab.step(1, () => pressing(skill.key, aim, frame < holdFrames));
    cast.planted ||= plant?.(frame, cast) ?? false;
    const busy = hero.casting || hero.channel || hero.dash || frame < holdFrames;
    freeFor = busy ? 0 : freeFor + 1;
    if (busy) cast.free = -1;
    else if (cast.free < 0) cast.free = frame * frameTime();
    const waiting = plant !== null && !cast.planted;
    if (freeFor >= AFTER && !waiting && frame >= lastingFrames) break;
  }
  for (const foe of foes) foe.invulnerable = false;
  cast.blows = blowsOf(hits);
  return cast;
}

/** A cast's line: its blows, the gaps between them, when the hero was free again and the damage a second till then. */
function castLine(cast: Cast, gear: string): string {
  const { skill, blows } = cast;
  const name = `${skill.def.name} (${gear}${cast.held > frameTime() ? `, held ${seconds(cast.held)}` : ''})`;
  if (!blows.length) return `${name}: struck nothing`;
  const each = blows.map((blow) => `${seconds(blow.at)} (${blow.foes} foes, ${blow.amount.toFixed(0)})`);
  const gaps = gapsOf(blows);
  const apart = gaps.length ? `; apart ${gaps.map(seconds).join(', ')}` : '';
  const dealt = blows.reduce((sum, blow) => sum + blow.amount, 0);
  const free = cast.free > 0 ? `; free again at ${seconds(cast.free)}, ${(dealt / cast.free).toFixed(0)} a second` : '';
  return `${name}: ${blows.length} blows from the press, at ${each.join(', ')}${apart}${free}`;
}

/** A measured cast's problems: striking nothing, a gap past `apart`, its widest gap no quicker than `row`'s. */
function problemsOf(cast: Cast, apart: number | undefined, row: Cast | null): string[] {
  const name = cast.skill.def.name;
  if (!cast.blows.length) return [`${name} struck nothing`];
  const problems: string[] = [];
  const widest = Math.max(0, ...gapsOf(cast.blows));
  if (apart !== undefined && widest > apart) {
    problems.push(`${name}: its blows ${seconds(widest)} apart (at most ${seconds(apart)})`);
  }
  const pace = row ? median(gapsOf(row.blows)) : 0;
  if (row && widest >= pace) {
    const than = `${row.skill.def.name} (${seconds(pace)})`;
    problems.push(`${name}: its blows ${seconds(widest)} apart, no quicker than ${than}`);
  }
  return problems;
}

/** `lab hits`: each skill's blows as they land, held to `--apart` and to `--than`'s pace. */
export async function hits(lab: Lab, options: HitsOptions): Promise<Report> {
  const gear = () => G.player.weaponStyle ?? G.player.cls.id;
  const lines: string[] = [];
  const problems: string[] = [];
  const canary: string[] = [];
  let row: Cast | null = null;
  if (options.than) {
    row = await castAt(lab, options.fixture, options.than, () => ROW_HOLD, null);
    lines.push(castLine(row, gear()));
    if (!row.blows.length) problems.push(`${row.skill.def.name} struck nothing`);
  }
  const judged = options.apart !== undefined || row !== null;
  const plant: Plant | null = options.canary ? (judged ? 'late' : 'harmless') : null;
  for (const wanted of options.skills) {
    const planting = plant ? PLANTINGS[plant] : null;
    const cast = await castAt(lab, options.fixture, wanted, (skill) => holdFor(skill.def), planting);
    const found = problemsOf(cast, options.apart, row);
    lines.push(castLine(cast, gear()), ...found.map((problem) => `  ! ${problem}`));
    if (!options.canary) {
      problems.push(...found);
      continue;
    }
    const mark = plant === 'late' ? 'apart' : 'struck nothing';
    const caught = cast.planted && found.some((problem) => problem.includes(mark));
    lines.push(`  canary: ${plant} in ${cast.skill.def.name} ${caught ? 'caught' : 'missed'}`);
    if (!caught) canary.push(`the canary's ${plant} in ${cast.skill.def.name} went unseen`);
  }
  return { text: lines.join('\n'), problems: options.canary ? canary : problems };
}
