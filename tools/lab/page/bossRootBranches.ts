// The Rootmother's thrown branches (tools/lab `boss --parts branches`; entities/rootmother.ts `hurl`, `branchAt`):
// from Kenneth, "we need more attacks, what about spikes that it throws at you ... Needs to be more dangerous", and
// Victor's bar, that each be dodgeable and warned. Each case lets her throw at the hero 14 m off and reads what the
// game did: where each branch came down against the ring that marked its landing (`BRANCHES`: its aim and its
// landing), what landed on the hero (his own `takeDamage`, after armour and block), and the engine's pipelines made
// meanwhile (`PIPELINES.made`: her thrown branches are her model's own, warmed with her).
//
// - one branch at a hero standing still: it lands in its ring and strikes him once;
// - one branch, the hero stepping aside at a walk as it leaves her hand: it misses him;
// - one branch at a warrior with his shield raised towards her (`--class warrior --gear shield`): the shield takes it;
// - her fan (phase 2) at a hero standing still: three land, each in its ring, and strike him once, never twice;
// - her line (her rage) at a hero standing still: five land in their rings, one strikes him, and its bramble hurts
//   him while he stands in it, then nothing once he has walked out along her line (the line lies across it);
// - no two hits landing on him within `branch.gap` s but a bramble's ticks, and no pipeline made.
//
// `--canary` makes each branch's burst six metres wide: stepping aside must be struck, and the fan strike twice.
import * as THREE from 'three';
import { screenArea, type Clip, type Lab, type Pictured } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import { G } from '../../../src/state';
import type { SkillKey } from '../../../src/types';
import { ROOTMOTHER } from '../../../src/data/foes/rootmother';
import { BRANCHES, type Attack, type ThrownBranch } from '../../../src/entities/rootmother';
import { CAGE } from '../../../src/entities/rootCage';
import { PIPELINES } from '../../../src/engine/pipelinesAside';
import { fixed, type BossOptions } from './boss';
import { holdHerAfter, nextIs, rootmother, standClear } from './bossRootmother';
import { pressing } from './cast';
import { endSideView, holdSideView, sideClip, sideView } from './bossSideView';

/** The hero's skill that raises a shield (a block), or null where he has none. */
function blockKey(): SkillKey | null {
  for (const key of ['mouse2', 'mouse0', '1', '2', '3', '4', 'q', 'e', 'r', 'f'] as SkillKey[]) {
    if (G.player.skillAt(key)?.def.block) return key;
  }
  return null;
}

/** frames a second, and the most frames a case is followed for */
const FPS = 60;
const CASE_FRAMES = 6 * FPS;
/** how far a branch may come down from its ring's middle (m) */
const IN_RING = 0.2;
/** how fast and how long the hero steps aside once a branch leaves her hand (m/s, s): a walk's pace */
const STEP_SPEED = 5;
const STEP_FOR = 0.7;
/** how far out the bramble's case walks him after it has hurt him (m), and the frames it waits there */
const WALK_OUT = 3;
const OUT_FRAMES = 2 * FPS;
/** the canary's burst (m) */
const CANARY_SPLASH = 6;

/** What landed on the hero in a case: each hit's game time, what it took off his Health and what his shield took. */
interface Landed { t: number; taken: number; blocked: number }

/** One case's reading: the branches thrown, the hits on him, and the pipelines made meanwhile. */
interface Case { thrown: ThrownBranch[]; hits: Landed[]; pipelines: number; brambleOut: number }

/** How a case's hero meets the throw: standing still, stepping aside as it leaves her hand, or behind his shield. */
type Answer = 'stand' | 'step' | 'shield';

/** `attack` thrown at the hero 14 m off, her life at `life` of its most (her phase), the hero answering as `answer`
 *  asks; `walkOut` walks him out of where he stood once something has struck him (the bramble's case). */
async function throwCase(lab: Lab, options: BossOptions, attack: Attack, life: number, answer: Answer,
  walkOut = false): Promise<Case> {
  await standClear(lab, options);
  const hero = G.player;
  const boss: Enemy = await rootmother(lab);
  if (life < 1) boss.takeDamage(boss.life - life * boss.maxLife, {});
  const from = BRANCHES.length ? BRANCHES[BRANCHES.length - 1] : null;
  const hits: Landed[] = [];
  const own = hero.takeDamage.bind(hero);
  hero.takeDamage = (amount, type, at) => {
    const r = own(amount, type, at);
    if (r) hits.push({ t: G.time, taken: r.taken, blocked: r.blocked });
    return r;
  };
  const made = PIPELINES.made;
  const key = answer === 'shield' ? blockKey() : null;
  const aim = boss.pos.clone().setY(2);
  // (stepping across her line to him, at a walk; walked out of the line's bramble along her line, away from her: the
  // line lies across it)
  const across = new THREE.Vector3(hero.pos.z - boss.pos.z, 0, boss.pos.x - hero.pos.x).normalize();
  const away = new THREE.Vector3(hero.pos.x - boss.pos.x, 0, hero.pos.z - boss.pos.z).normalize();
  let releasedAt = -1, walkedFrom = -1, outFrom = -1;
  let brambleOut = 0;
  nextIs(boss, attack);
  try {
    await lab.step(CASE_FRAMES, () => {
      holdHerAfter(boss, attack);
      hero.facing = Math.atan2(boss.pos.x - hero.pos.x, boss.pos.z - hero.pos.z);
      if (answer === 'step' && releasedAt >= 0 && G.time - releasedAt < STEP_FOR) {
        hero.place(hero.pos.clone().addScaledVector(across, STEP_SPEED / FPS), hero.facing);
      }
      if (walkOut && walkedFrom >= 0 && G.time - walkedFrom < WALK_OUT / STEP_SPEED) {
        hero.place(hero.pos.clone().addScaledVector(away, STEP_SPEED / FPS), hero.facing);
      }
      return key ? pressing(key, aim, true) : { aim };
    }, () => {
      const last = BRANCHES.length ? BRANCHES[BRANCHES.length - 1] : null;
      if (releasedAt < 0 && last && last !== from) releasedAt = G.time;
      // (the line's bramble: walked out once it has hurt him a second time, its burst and a tick)
      if (walkOut && walkedFrom < 0 && hits.length >= 2) walkedFrom = G.time;
      if (walkOut && walkedFrom >= 0 && G.time - walkedFrom > WALK_OUT / STEP_SPEED) {
        if (outFrom < 0) outFrom = hits.length;
      }
    });
  } finally {
    hero.takeDamage = own;
  }
  if (outFrom >= 0) brambleOut = hits.length - outFrom;
  const fromIndex = from ? BRANCHES.indexOf(from) + 1 : 0;
  return { thrown: BRANCHES.slice(fromIndex), hits, pipelines: PIPELINES.made - made, brambleOut };
}

/** How far each branch came down from its ring's middle (m), and whether every one came down. */
function offRing(thrown: ThrownBranch[]): { most: number; landed: number } {
  let most = 0, landed = 0;
  for (const b of thrown) {
    if (!b.landed) continue;
    landed++;
    if (!b.landed.inProp) most = Math.max(most, Math.hypot(b.landed.x - b.to.x, b.landed.z - b.to.z));
  }
  return { most, landed };
}

/** The shortest time between two hits on him that aren't the bramble's ticks (s), or Infinity. */
function closestHits(c: Case): number {
  const bursts = c.thrown.flatMap((b) => b.struck.filter((s) => !s.bramble).map((s) => s.t)).sort((a, b) => a - b);
  let least = Infinity;
  for (let i = 1; i < bursts.length; i++) least = Math.min(least, bursts[i] - bursts[i - 1]);
  return least;
}

/** A case's line, and its problems by what it must show. */
function judge(name: string, c: Case, wanted: { thrown: number; struck: number | 'none' | 'blocked' }, lines: string[],
  problems: string[]): void {
  const ring = offRing(c.thrown);
  const taken = c.hits.reduce((sum, h) => sum + h.taken, 0), blocked = c.hits.reduce((sum, h) => sum + h.blocked, 0);
  const bursts = c.thrown.reduce((n, b) => n + b.struck.filter((s) => !s.bramble).length, 0);
  const what = `branches: ${name}`;
  lines.push(`${what}: ${c.thrown.length} thrown, ${ring.landed} landed, ${fixed(ring.most)} m off its ring at most; `
    + `struck him ${bursts} time(s) (${c.hits.length} hits, ${fixed(taken, 0)} taken, ${fixed(blocked, 0)} `
    + `blocked); ${c.pipelines} pipelines made`);
  if (c.thrown.length !== wanted.thrown) problems.push(`${what}: ${c.thrown.length} thrown, not ${wanted.thrown}`);
  if (ring.landed !== c.thrown.length) problems.push(`${what}: ${c.thrown.length - ring.landed} never came down`);
  if (ring.most > IN_RING) problems.push(`branches: ${name}: a branch came down ${fixed(ring.most)} m off its ring`);
  if (wanted.struck === 'none' && bursts > 0) problems.push(`branches: ${name}: it struck him ${bursts} time(s)`);
  if (typeof wanted.struck === 'number' && bursts !== wanted.struck) {
    problems.push(`branches: ${name}: struck him ${bursts} time(s), not ${wanted.struck}`);
  }
  if (wanted.struck === 'blocked' && !(blocked > 0)) problems.push(`branches: ${name}: his shield took none of it`);
  if (c.pipelines > 0) problems.push(`branches: ${name}: ${c.pipelines} pipelines made in her fight`);
  const closest = closestHits(c);
  if (closest < ROOTMOTHER.branch.gap) {
    problems.push(`${what}: two of her hits landed ${fixed(closest)} s apart, under ${ROOTMOTHER.branch.gap}`);
  }
}

/** `branches`: her thrown branches, each landing in its ring, dodged by a step aside or a raised shield, her fan
 *  striking once, her line's bramble hurting him in it and not out of it. */
export async function branches(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  const B = ROOTMOTHER.branch, splash = B.splash, small = B.smallSplash;
  if (options.canary) {
    B.splash = CANARY_SPLASH;
    B.smallSplash = CANARY_SPLASH;
  }
  try {
    const one = (answer: Answer): Promise<Case> => throwCase(lab, options, 'branch', 1, answer);
    judge('one, standing still', await one('stand'), { thrown: 1, struck: 1 }, lines, problems);
    judge('one, stepping aside', await one('step'), { thrown: 1, struck: 'none' }, lines, problems);
    if (G.player.gear.shield && blockKey()) {
      judge('one, his shield raised', await one('shield'), { thrown: 1, struck: 'blocked' }, lines, problems);
    } else lines.push('branches: one, his shield raised: not run (--class warrior --gear shield)');
    const fan = await throwCase(lab, options, 'fan', 0.45, 'stand');
    judge('her fan, standing still', fan, { thrown: 3, struck: 1 }, lines, problems);
    const line = await throwCase(lab, options, 'volley', 0.2, 'stand', true);
    judge('her line, standing still', line, { thrown: 5, struck: 1 }, lines, problems);
    const ticks = line.thrown.reduce((n, b) => n + b.struck.filter((s) => s.bramble).length, 0);
    lines.push(`branches: her line's bramble: hurt him ${ticks} time(s) in it, ${line.brambleOut} once he had walked `
      + `${WALK_OUT} m out`);
    if (!(ticks > 0)) problems.push('branches: her line\'s bramble never hurt him standing in it');
    if (line.brambleOut > 0) {
      problems.push(`branches: her line's bramble hurt him ${line.brambleOut} time(s) out of it`);
    }
  } finally {
    B.splash = splash;
    B.smallSplash = small;
  }
}

/** a branch's side strip: frames from her action's start, how many, and the frames between (her wind-up, the throw,
 *  its flight and its landing), and how far to the side of her line to him the camera stands (m) */
const SIDE_SHOTS = 16;
const SIDE_EVERY = 8;
const SIDE_DISTANCE = 17;
/** the player's view's strips: how many frames and the frames between, from her action's start */
const SEEN_SHOTS = 12;
const SEEN_EVERY = 14;
/** how far round the hero the player's view's crop takes in (m) */
const SEEN_REACH = 9;

/** The screen round the hero, `reach` m about him on the floor and 3 m up, as the game's camera shows it. */
function roundHero(reach: number): Clip {
  const p = G.player.pos, points: THREE.Vector3[] = [];
  for (const dx of [-reach, reach]) {
    for (const dz of [-reach, reach]) {
      for (const y of [0, 3]) points.push(new THREE.Vector3(p.x + dx, p.y + y, p.z + dz));
    }
  }
  return screenArea(points);
}

/** Her attack `attack` at the hero standing 14 m off, her life at `life`, pictured every `every` frames from her
 *  action's start, `shots` in all, by `shoot` (its frame's number from the start). */
async function strip(lab: Lab, options: BossOptions, attack: Attack, life: number, shots: number, every: number,
  shoot: (shot: number, boss: Enemy) => Promise<void>, before?: (boss: Enemy) => void): Promise<void> {
  await standClear(lab, options);
  const hero = G.player;
  const boss = await rootmother(lab);
  if (life < 1) boss.takeDamage(boss.life - life * boss.maxLife, {});
  before?.(boss);
  nextIs(boss, attack);
  let from = -1, shot = 0;
  for (let frame = 0; frame < CASE_FRAMES && shot < shots; frame++) {
    await lab.step(1, () => {
      holdHerAfter(boss, attack);
      hero.facing = Math.atan2(boss.pos.x - hero.pos.x, boss.pos.z - hero.pos.z);
      return { aim: boss.pos.clone().setY(2) };
    });
    if (from < 0 && boss.action?.name === attack) from = frame;
    if (from >= 0 && (frame - from) % every === 0) await shoot(shot++, boss);
  }
}

/** `branchPictures`: her new attacks for the eye (no verdict): a branch from its side at a man's eye (her wind-up, the
 *  throw, its flight end over end and its landing) and as the player sees it; her fan, her line and its bramble, and
 *  her eruption chasing him, as the player sees them. */
export async function branchPictures(lab: Lab, options: BossOptions, lines: string[]): Promise<Pictured[]> {
  const moments: Pictured[] = [];
  let clip: Clip | null = null, mid: THREE.Vector3 | null = null, way: THREE.Vector3 | null = null;
  try {
    await strip(lab, options, 'branch', 1, SIDE_SHOTS, SIDE_EVERY, async (shot) => {
      clip ??= sideClip(mid!.clone().addScaledVector(way!, -7), way!, 14, 2.5, 8);
      const note = `her branch from the side, ${shot * SIDE_EVERY} frames into her throw`;
      moments.push(await lab.screen(`branch ${shot + 1}`, [note], clip));
    }, (boss) => {
      const hero = G.player;
      way = new THREE.Vector3(hero.pos.x - boss.pos.x, 0, hero.pos.z - boss.pos.z).normalize();
      mid = boss.pos.clone().lerp(hero.pos, 0.5);
      holdSideView(sideView(mid, way, SIDE_DISTANCE, 2));
    });
  } finally {
    endSideView();
  }
  const seen = async (name: string, attack: Attack, life: number, note: string): Promise<void> => {
    await strip(lab, options, attack, life, SEEN_SHOTS, SEEN_EVERY, async (shot) => {
      const said = `${note}, ${shot * SEEN_EVERY} frames in`;
      moments.push(await lab.screen(`${name} ${shot + 1}`, [said], roundHero(SEEN_REACH)));
    });
  };
  await seen('branch seen', 'branch', 1, 'her branch as the player sees it');
  await seen('fan', 'fan', 0.45, 'her fan of three as the player sees it');
  await seen('line', 'volley', 0.2, 'her line of five and its bramble as the player sees it');
  await seen('chase', 'chase', 0.2, 'her eruption chasing him as the player sees it');
  lines.push(`branchPictures: ${moments.length} moments`);
  return moments;
}

/** the cost's turns: frames a turn, the frames at its start left out (the turn before's effects dying away), and how
 *  many turns each way */
const COST_TURN = 120;
const COST_SETTLE = 60;
const COST_TURNS = 4;

/** The browser's own clock (the page's `performance.now` is the lab's, which stands still within a frame). */
const realNow = (): number => (window as unknown as { __labClock: { realNow: () => number } }).__labClock.realNow();

/** A list's median. */
function median(times: number[]): number {
  const sorted = [...times].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/**
 * `rootCost` (asked for by name): her fight's cost to the frame at its busiest (her rage: her line, her fan, her
 * eruption chasing him, her branches) against the battleground without her, in turns of `COST_TURN` frames within one
 * page, drawn as the game draws: she fights the hero 14 m off, then is hidden and thinks nothing, by turns; each turn's
 * first `COST_SETTLE` frames are left out. Each frame timed by the browser's clock. No verdict: this PC's GPU is not a
 * player's (`lab perf --device`).
 */
export async function rootCost(lab: Lab, options: BossOptions, lines: string[]): Promise<void> {
  await standClear(lab, options);
  const hero = G.player;
  const boss = await rootmother(lab);
  boss.takeDamage(boss.life - 0.2 * boss.maxLife, {});
  boss.brain.heartT = 1e9;
  const fighting: number[] = [], empty: number[] = [];
  // (her frames timed with her root cage standing, apart: the hero stands still, so she cages him as she rages)
  const caged: number[] = [];
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    for (let turn = 0; turn < COST_TURNS * 2; turn++) {
      const fights = turn % 2 === 0;
      boss.obj.visible = fights;
      boss.dazed = fights ? 0 : 1e4;
      for (let frame = 0; frame < COST_TURN; frame++) {
        const start = realNow();
        await lab.step(1, () => {
          hero.facing = Math.atan2(boss.pos.x - hero.pos.x, boss.pos.z - hero.pos.z);
          // (her heart held shut and her spores' clouds let be: the rest of her rage fights, her root cage as soon as
          // she may, so it stands through as much of it as its own rules let it)
          boss.brain.heartT = 1e9;
          boss.brain.cageT = 0;
          return { aim: boss.pos.clone().setY(2) };
        });
        if (frame >= COST_SETTLE) (fights ? (CAGE?.shut ? caged : fighting) : empty).push(realNow() - start);
      }
    }
  } finally {
    lab.drawing = drawing;
    boss.obj.visible = true;
  }
  const a = median(fighting), b = median(empty);
  lines.push(`rootCost: in turns of ${COST_TURN} frames, drawn: the frame ${fixed(a)} ms median with her raging, `
    + `${fixed(b)} ms without her: ${fixed(a / Math.max(0.01, b))}x; with her root cage standing, `
    + `${fixed(median(caged))} ms (${caged.length} frames of ${caged.length + fighting.length})`);
}
