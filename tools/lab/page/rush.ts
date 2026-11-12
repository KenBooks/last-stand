// Bull Rush's foes as the player sees them swept up (tools/lab `rush`). Foes stand dazed on the charge's line and at
// its sides (living, a hair from death, an elite and the biome's boss), a set at a time on a fresh set-up, and the
// charge is cast through them. Every foe is followed frame by frame until it has landed and stood, or its body lain
// still: when the charge met it, how long it rode before the hero and how near his body, how it was let go (thrown,
// how high and how far, or shoved on) and where it ended against where he stopped. A foe never met, one met and left
// standing, one carried inside him, one that ended behind him or beside him, a living foe left unthrown and an elite
// or a boss thrown are problems. (Thrown off the line as it was met, a foe the charge ran on past ended behind him
// as he stopped.)
import * as THREE from 'three';
import { screenArea, type Fixture, type Lab, type Pictured, type Report } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import { G } from '../../../src/state';
import * as renderer from '../../../src/core/renderer';
import { BIOMES } from '../../../src/data/biomes';
import { bindKnown, pressing, skillNamed } from './cast';
import { foeKind } from './death';
import { clearFacing, clearLane, waysOf, type LaneSize } from './lanes';
import { castsWithRush } from './rushCasts';

/** The parts `lab rush` can run: the sets of foes the charge is cast through, and the skills cast with it. */
export const RUSH_SCENARIOS = ['sets', 'casts'] as const;
export type RushScenario = typeof RUSH_SCENARIOS[number];

export interface RushOptions {
  fixture: Fixture;
  pictures: boolean;
  /** plant the fault the checks must catch: the first foe thrown put behind the hero as it lands */
  canary: boolean;
  /** the parts to run (all when empty) */
  scenarios?: RushScenario[];
  /** the skills cast with the charge at the lobby's training dummies in place of the biome's foes */
  dummies?: boolean;
}

/** A foe of a set: `ahead` m before the hero and `across` m to his left (+) or his right, living (its life past the
 *  charge's blow) or a hair from death (`dies`), an elite or the biome's boss. */
interface Placed {
  ahead: number;
  across: number;
  dies?: boolean;
  elite?: boolean;
  boss?: boolean;
}

/** A set of foes the charge is cast through, by what it is. */
interface FoeSet {
  name: string;
  foes: Placed[];
}

/** the sets: each in the charge's reach (it meets what comes within 1.1 m of its middle and the foe's own size) */
const SETS: FoeSet[] = [
  { name: 'on its line', foes: [{ ahead: 2.5, across: 0 }, { ahead: 4.5, across: 0.3 }, { ahead: 6.5, across: -0.3 }] },
  { name: 'at its sides', foes: [{ ahead: 3, across: 1.2 }, { ahead: 5, across: -1.4 }] },
  { name: 'killed on its line', foes: [{ ahead: 3, across: 0, dies: true }, { ahead: 5.5, across: 0.4, dies: true }] },
  // (killed off its line, a body lay outside what carries the fallen on, and the charge ran on past it)
  {
    name: 'killed at its sides',
    foes: [{ ahead: 3, across: 1.2, dies: true }, { ahead: 5, across: -1.4, dies: true }],
  },
  { name: 'an elite and a boss', foes: [{ ahead: 3, across: 0, elite: true }, { ahead: 6, across: 0.2, boss: true }] },
];

/** where the hero stands and the way he faces unless the fixture says: the nearest spot to `SPOT` on a grid of
 *  2 m, off the dais, from which a way round has its lane clear (`lanes.ts`; from the spot the fixture gives, the
 *  first way from `FACING`). From the forest's open ground at `SPOT` every way was
 *  blocked by a stump a metre off. */
const SPOT: [number, number] = [-11, -12];
const FACING = 90;
/** how far the charge is aimed (m): its whole range */
const AIM_AHEAD = 9;
/** the lane kept clear of props and the arena's wall (m): the charge, and as far again as a throw goes past its
 *  stop, as wide as the sets' foes reach either side (a thrown foe stops at a prop as it should: met by a log at the
 *  forest's stop, two flew 0.4 m and ended at its side) */
const RUSH_LANE: LaneSize = { long: AIM_AHEAD + 6, wide: 3 };
/** a living foe's life: past what the charge deals it */
const LIVING = 1e5;
/** frames looked at from the press, at most, and once the charge has stopped and every foe is still, a few more */
const MOST_FRAMES = 480;
const SETTLE = 10;
const STILL_FRAMES = 12;
/** the foes risen in at most this many frames */
const RISE_FRAMES = 300;
/** a foe still on its feet once its knock is under this (m/s) */
const STILL_KNOCK = 0.05;
/** a carried foe's body this far into the hero's is inside him (m) */
const INSIDE = 0.02;
const PICTURE_MARGIN = 120;
/** the foes pictured riding before the hero this long before the charge stops (s) */
const RIDING_AT = 0.05;

/** A foe followed from the press: where it was placed, when it was met and how it went from there. */
interface Followed {
  placed: Placed;
  foe: Enemy;
  /** whether the charge's blow has struck it, frames from the press to that (-1: never met), and whether it killed it
   *  there */
  struck: boolean;
  metAt: number;
  killed: boolean;
  /** frames it rode before the hero, and its body's least gap to his then (m; less than 0: inside him) */
  carried: number;
  nearest: number;
  /** how it was let go: thrown through the air (how high its feet went, m), or shoved on */
  thrown: boolean;
  highest: number;
  shoved: boolean;
  /** where it was let go and where it landed, thrown */
  letGo: THREE.Vector3 | null;
  landed: THREE.Vector3 | null;
  /** where it ended: on its feet, or its body's hips */
  end: THREE.Vector3;
}

const metres = (value: number): string => `${value.toFixed(2)} m`;
const centimetres = (value: number): string => `${(value * 100).toFixed(0)} cm`;
const seconds = (value: number): string => `${value.toFixed(2)} s`;
const frameTime = (): number => window.__labClock.frame / 1000;
const flat = (from: THREE.Vector3, to: THREE.Vector3): number => Math.hypot(to.x - from.x, to.z - from.z);

/** The charge's way along the ground and its left, for a hero facing `facing` (rad). */
export { waysOf };

/** The foes of `set` risen round a hero at `at` facing `facing`, standing dazed (still, thinking of nothing). */
async function foesOf(lab: Lab, set: FoeSet, at: THREE.Vector3, facing: number): Promise<Followed[]> {
  const { forward, left } = waysOf(facing);
  const foes = set.foes.map((placed) => {
    const spot = at.clone().addScaledVector(forward, placed.ahead).addScaledVector(left, placed.across);
    const kind = placed.boss ? BIOMES[G.arena.biome].boss : foeKind();
    return lab.spawnFoe(kind, spot, { hero: Boolean(placed.elite) });
  });
  await lab.until(() => foes.every((foe) => foe.spawning <= 0), RISE_FRAMES, 'the foes never rose');
  return foes.map((foe, i) => {
    const placed = set.foes[i];
    foe.dazed = 999;
    foe.life = placed.dies ? 1 : LIVING;
    return followedOf(placed, foe);
  });
}

/** A foe followed from here, its hits noted as they land (the charge's meeting: on a game with no carry, `--ab`'s
 *  other side, it's met all the same). */
function followedOf(placed: Placed, foe: Enemy): Followed {
  const one: Followed = {
    placed, foe, struck: false, metAt: -1, killed: false, carried: 0, nearest: Infinity,
    thrown: false, highest: 0, shoved: false, letGo: null, landed: null, end: foe.pos.clone(),
  };
  const takeDamage = foe.takeDamage.bind(foe);
  foe.takeDamage = (amount, info) => {
    one.struck = true;
    return takeDamage(amount, info);
  };
  return one;
}

/** Where a foe is: on its feet, or its body's hips once it has fallen. */
function placeOf(foe: Enemy): THREE.Vector3 {
  const ragdoll = foe.corpse?.ragdoll;
  if (!foe.alive && ragdoll) return ragdoll.hips(new THREE.Vector3());
  return foe.pos.clone();
}

/** A foe's frame followed: its meeting, its ride, its letting go and its flight, and where it is. */
function follow(one: Followed, frame: number, wasCarried: boolean): void {
  const { foe } = one;
  const hero = G.player;
  if (one.metAt < 0 && one.struck) {
    one.metAt = frame;
    one.killed = !foe.alive;
  }
  if (foe.carried) {
    one.carried++;
    const gap = flat(foe.pos, hero.pos) - hero.radius - foe.radius;
    one.nearest = Math.min(one.nearest, gap);
  }
  if (wasCarried && !foe.carried && foe.alive) {
    one.letGo = foe.pos.clone();
    if (!foe.tossed) one.shoved = true;
  }
  if (foe.tossed) {
    one.thrown = true;
    one.highest = Math.max(one.highest, foe.tossed.y);
  }
  if (one.thrown && !foe.tossed && !one.landed) one.landed = foe.pos.clone();
  one.end = placeOf(foe);
}

/** Whether a foe is done moving: on its feet and still, or its body lying still or gone. */
function still(one: Followed): boolean {
  const { foe } = one;
  if (!G.enemies.includes(foe)) return true;
  if (!foe.alive) return !foe.corpse?.ragdoll || foe.corpse.ragdoll.asleep || foe.model.kit.u.uDissolve.value > 0;
  return !foe.carried && !foe.tossed && foe.knock.length() < STILL_KNOCK;
}

/** One cast through a set: its foes followed, where the hero stopped, and the moments pictured. */
interface Cast {
  set: FoeSet;
  followed: Followed[];
  stop: THREE.Vector3;
  forward: THREE.Vector3;
  left: THREE.Vector3;
  moments: Pictured[];
  /** the canary's plant: whether it put a foe behind the hero */
  planted: boolean;
}

/** What a cast plants and pictures. */
interface CastPlan {
  canary: boolean;
  pictures: boolean;
}

/** The charge cast through `set` on a fresh set-up, every foe followed until it's still. */
async function castThrough(lab: Lab, options: RushOptions, set: FoeSet, plan: CastPlan): Promise<Cast> {
  G.arena.restoreProps();
  const fixture = fixtureOf(options);
  await lab.setup(fixture);
  const hero = G.player;
  bindKnown('bullRush');
  const skill = skillNamed('bullRush');
  hero.cooldowns.clear();
  hero.energy = hero.stats.maxEnergy;
  // (the way it was set up to face, which the set-up turns him to in every view)
  const facing = fixture.facing ?? hero.facing;
  const { forward, left } = waysOf(facing);
  const followed = await foesOf(lab, set, hero.pos, facing);
  const aim = hero.pos.clone().addScaledVector(forward, AIM_AHEAD);
  const moments: Pictured[] = [];
  let planted = false;
  let riding = false;
  let stoppedAt = -1;
  let stillFor = 0;
  // (the crosshair of the close views turned onto the aim first, as the player would: a charge goes the way it says)
  await lab.step(SETTLE, () => ({ aim, sight: aim }));
  for (let frame = 0; frame < MOST_FRAMES; frame++) {
    const carried = followed.map((one) => Boolean(one.foe.carried));
    const sight = frame === 0 ? aim : undefined;
    await lab.step(1, () => ({ ...pressing(skill.key, aim, frame === 0), sight }));
    followed.forEach((one, i) => follow(one, frame, carried[i]));
    if (plan.canary && !planted) planted = plantBehind(followed, forward);
    if (plan.pictures && !riding && nearStop()) {
      riding = true;
      moments.push(await picture(lab, followed, `${set.name}, carried before the charge`));
    }
    if (stoppedAt < 0 && frame > 0 && stopped()) {
      stoppedAt = frame;
      if (plan.pictures) moments.push(await picture(lab, followed, `${set.name}, as the charge stops`));
    }
    stillFor = stoppedAt >= 0 && followed.every(still) ? stillFor + 1 : 0;
    if (stillFor >= STILL_FRAMES) break;
  }
  if (plan.pictures) moments.push(await picture(lab, followed, `${set.name}, once every foe is still`));
  return { set, followed, stop: hero.pos.clone(), forward, left, moments, planted };
}

/** Whether the charge is about to stop: its dash within `RIDING_AT` of its end. */
function nearStop(): boolean {
  const dash = G.player.dash;
  return dash !== null && dash.t >= dash.dur - RIDING_AT && dash.t < dash.dur;
}

/** Whether the charge has stopped: its dash run out, into the hold after it, or over. */
function stopped(): boolean {
  const dash = G.player.dash;
  return dash === null || dash.t >= dash.dur;
}

/** With the canary, the first foe thrown put 2 m behind the hero as it lands: whether it was planted. */
function plantBehind(followed: Followed[], forward: THREE.Vector3): boolean {
  const landed = followed.find((one) => one.landed && one.foe.alive);
  if (!landed) return false;
  landed.foe.pos.copy(G.player.pos).addScaledVector(forward, -2);
  return true;
}

/** The foes pictured: the game's view as the player sees it, clipped round them and the hero (the whole of it through
 *  the eyes), and close from his left and from above, framed on them (but through the eyes, which shows the eyes'
 *  view alone). */
async function picture(lab: Lab, followed: Followed[], label: string): Promise<Pictured> {
  const points = followed.map((one) => placeOf(one.foe).setY(1));
  points.push(G.player.pos.clone());
  if (renderer.viewMode() === 'first') return lab.screen(label);
  const seen = await lab.screen(label, [], screenArea(points, PICTURE_MARGIN));
  const middle = points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(points.length);
  const spread = Math.max(...points.map((point) => flat(point, middle)));
  middle.y = 0.6;
  const close = lab.capture(['left', 'top'], { at: middle, distance: Math.max(6, spread * 3) });
  return { label, tiles: [...seen.tiles, ...close], notes: [] };
}

/** The fixture with the command's own spot and facing where it doesn't say. */
export function fixtureOf(options: RushOptions): Fixture {
  const { at, facing } = options.fixture;
  if (at && facing !== undefined) return options.fixture;
  const first = (FACING * Math.PI) / 180;
  const lane = at ? clearFacing(at, first, RUSH_LANE) ?? { at, facing: first } : clearLane(SPOT, first, RUSH_LANE);
  return { ...options.fixture, at: lane.at, facing: facing ?? lane.facing };
}

/** Where a foe ended against the hero's stop: along the charge's way (m, + before him) and across it (+ his left). */
function endOf(cast: Cast, one: Followed): { along: number; across: number } {
  const off = one.end.clone().sub(cast.stop).setY(0);
  return { along: off.dot(cast.forward), across: off.dot(cast.left) };
}


/** What a foe is, as a line names it. */
function nameOf(one: Followed): string {
  const { placed } = one;
  const what = placed.boss ? 'the boss' : placed.elite ? 'an elite' : placed.dies ? 'a hair from death' : 'living';
  const way = placed.across > 0 ? 'left' : 'right';
  const side = placed.across === 0 ? '' : `, ${metres(Math.abs(placed.across))} to his ${way}`;
  return `${metres(placed.ahead)} ahead${side}, ${what}`;
}

/** A foe's line: its meeting, its ride and its letting go, and where it ended. */
function foeLine(cast: Cast, one: Followed, index: number): string {
  const head = `    ${index + 1} (${nameOf(one)}): `;
  if (one.metAt < 0) return `${head}never met`;
  const met = `met at ${seconds(one.metAt * frameTime())}`;
  const { along, across } = endOf(cast, one);
  const side = across >= 0 ? 'left' : 'right';
  const ended = `ended ${metres(along)} before him, ${metres(Math.abs(across))} to his ${side}`;
  if (one.killed) return `${head}killed as it was ${met}; its body ${ended}`;
  const rode = one.carried ? `carried ${seconds(one.carried * frameTime())}, `
    + `${centimetres(one.nearest)} clear of his body at the nearest` : 'not carried';
  return `${head}${met}, ${rode}, ${letGoOf(one)}; ${ended}`;
}

/** How a foe was let go, as words. */
function letGoOf(one: Followed): string {
  if (one.thrown && one.letGo && one.landed) {
    return `thrown ${metres(one.highest)} up and ${metres(flat(one.letGo, one.landed))} on`;
  }
  if (one.thrown) return `thrown ${metres(one.highest)} up, never landed`;
  if (one.shoved) return 'shoved on';
  return 'never let go';
}

/** What a foe did that the charge mustn't let it, as problems. */
function foeProblems(cast: Cast, one: Followed): string[] {
  const name = `${cast.set.name}, ${nameOf(one)}`;
  if (one.metAt < 0) return [`${name}: never met`];
  const problems: string[] = [];
  // (behind: its middle behind his; beside: level with his body; before him past it)
  const { along } = endOf(cast, one);
  if (along < 0) problems.push(`${name}: ended ${metres(-along)} behind the hero`);
  else if (along < G.player.radius) problems.push(`${name}: ended beside the hero (${metres(along)} before him)`);
  if (one.killed) return problems;
  if (!one.carried) problems.push(`${name}: met and left standing, not carried`);
  if (one.nearest < -INSIDE) problems.push(`${name}: carried ${centimetres(-one.nearest)} inside the hero`);
  const stands = one.placed.elite || one.placed.boss;
  if (stands && one.thrown) problems.push(`${name}: thrown (an elite or a boss is shoved on)`);
  if (!stands && !one.thrown) problems.push(`${name}: not thrown`);
  return problems;
}

/** A cast's lines and problems. */
function judge(cast: Cast): { lines: string[]; problems: string[] } {
  const lines = [`  ${cast.set.name}:`, ...cast.followed.map((one, i) => foeLine(cast, one, i))];
  const problems = cast.followed.flatMap((one) => foeProblems(cast, one));
  for (const problem of problems) lines.push(`    ! ${problem}`);
  return { lines, problems };
}

/** `lab rush`: Bull Rush cast through each set of foes, every foe followed until it's still. */
export async function rush(lab: Lab, options: RushOptions): Promise<Report> {
  const fixture = fixtureOf(options);
  await lab.setup(fixture);
  const facing = ((fixture.facing ?? G.player.facing) * 180) / Math.PI;
  const from = `from ${G.player.pos.x.toFixed(0)}, ${G.player.pos.z.toFixed(0)} at ${facing.toFixed(0)}°`;
  const kinds = `${foeKind()}s and ${BIOMES[G.arena.biome].boss}`;
  const lines = [`${G.player.cls.id}, ${kinds}, ${G.arena.biome}, charging ${from}`];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  const canary: string[] = [];
  const asked = options.scenarios?.length ? options.scenarios : RUSH_SCENARIOS;
  if (asked.includes('sets')) {
    const sets = await setsOf(lab, options);
    lines.push(...sets.lines);
    moments.push(...sets.moments);
    problems.push(...sets.problems);
    canary.push(...sets.canary);
  }
  if (asked.includes('casts')) {
    const casts = await castsWithRush(lab, options);
    lines.push(...casts.lines);
    moments.push(...casts.moments);
    problems.push(...casts.problems);
    canary.push(...casts.canary);
  }
  return { text: lines.join('\n'), problems: options.canary ? canary : problems, moments };
}

/** The charge cast through each set of foes: the sets' lines, problems and moments; with the canary, whether its foe
 *  put behind the hero was caught. */
async function setsOf(lab: Lab, options: RushOptions): Promise<{
  lines: string[]; problems: string[]; moments: Pictured[]; canary: string[];
}> {
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  let planted = false;
  let caught = false;
  for (const set of SETS) {
    const plan = { canary: options.canary && !planted, pictures: options.pictures };
    const cast = await castThrough(lab, options, set, plan);
    const judged = judge(cast);
    lines.push(...judged.lines);
    moments.push(...cast.moments);
    if (!options.canary) problems.push(...judged.problems);
    if (cast.planted) caught = judged.problems.some((problem) => problem.includes('behind the hero'));
    planted ||= cast.planted;
  }
  if (!options.canary) return { lines, problems, moments, canary: [] };
  lines.push(`canary: a foe put behind the hero ${caught ? 'caught' : 'missed'}`);
  const missed = !planted ? ['the canary never put a foe behind the hero']
    : caught ? [] : ['the canary\'s foe put behind the hero went unseen'];
  return { lines, problems, moments, canary: missed };
}
