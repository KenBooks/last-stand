// The Rootmother's root cage (tools/lab `boss --parts rootCage`; entities/rootCage.ts; from Kenneth: "Roots burst up in
// a ring round you after a short warning. Dash out before it closes, or cut a root to escape. While you're caged, she
// winds up a big hit. It punishes standing still.").
//
// Each case grows her in the arena's middle with the hero standing still off her, lets her think (her heart and spores
// held), and reads what the game did (`CAGE_LOG`, `CAGE`, his own `takeDamage`, `PIPELINES.made`):
// - standing still: caged `still.time` s after he stopped, warned `cage`'s warning before it shut, her blow landing on
//   him `crush`'s warning after it shut, the cage withered `life` s after; none of her other hits within `gap` s of its
//   shut or its blow; no pipeline made;
// - walking out as the cracks show: never caged, never hurt by her blow;
// - shut, walking at the gap between two roots nearest his way out: still inside;
// - one root broken (struck its hits as a prop, by his game): he walks out through its gap before her blow;
// - the hero's own way out, acting at once as it shuts (`--class`): the ranger shooting the nearest root, the warrior's
//   Bull Rush through it, the mage's Veilstep through the roots: out before her blow, and how long it took;
// - with a shield (`--class warrior --gear shield`), raised towards her as her blow lands: hurt less than standing, by
//   what his block takes of it (said).
//
// `--canary` makes the roots too thin to hold him: walking at them he gets out, and the part says so.
//
// `rootCagePictures` (asked for by name, no verdict): the cage for the eye, the same cases pictured as they run.
import * as THREE from 'three';
import { screenArea, type Clip, type Frame, type Lab, type Pictured } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import type { SkillKey } from '../../../src/types';
import { G } from '../../../src/state';
import { ROOTMOTHER } from '../../../src/data/foes/rootmother';
import { ENEMIES } from '../../../src/data/enemies';
import { FX } from '../../../src/entities/enemyAI';
import { CAGE, CAGE_LOG, type CageLog } from '../../../src/entities/rootCage';
import { forgetBeats } from '../../../src/entities/bossKit';
import { hurtProp } from '../../../src/world/destructible';
import { cameraYaw } from '../../../src/core/renderer';
import { PIPELINES } from '../../../src/engine/pipelinesAside';
import { pressing, skillNamed } from './cast';
import { fixed } from './boss';
import { rootmother, standClear } from './bossRootmother';
import { endSideView, holdSideView, sideView } from './bossSideView';

/** frames a second on the lab's clock */
const FPS = 60;
const C = ROOTMOTHER.cage;
/** how long a case waits at most for her cage to warn (s), and how long it follows it from its shut (its blow and its
 *  withering) */
const WAIT = 12;
const FOLLOW = C.life + 1.5;
/** how long he walks at the roots of a shut cage (s), and how far out of its ring counts as out (m) */
const PUSH = 1.5;
const OUT = 0.6;
/** the most of the standing case's hurt a raised shield may leave him (a block takes a real share of it) */
const SHIELD_MOST = 0.75;
/** how far out past a root the case from outside stands to strike it (m): a partner come up to the cage */
const OUTSIDE = 3;
/** how long Veilstep's key is held aimed before it's let go (frames), and how far past the ring it's aimed (m) */
const BLINK_HOLD = 10;
const BLINK_PAST = 3;
/** her fx that land a hit (none may land within `gap` s of the cage's shut or its blow) */
const HER_HITS = ['branch', 'erupt', 'thorns'] as const;

/** How a case's hero meets her cage. */
type How = 'standing' | 'walking out' | 'pushing' | 'a root broken' | 'his way out' | 'his shield' | 'from outside';

/** What a case read: the cage's log, how far out of its ring he ended up at its blow (m, past its radius), the frames
 *  from its shut to when he got out (-1: never), his hurts, the pipelines made, her other hits' times, and how many
 *  hits a root took to break where he cut one. */
interface CageCase {
  how: How; log: CageLog | null; outAtBlow: number; outAfter: number; hurts: Hurt[]; made: number; others: number[];
  rootHits: number; rootLife: number;
  /** when the root he went at was struck, and when he let a shot or a blow go (s after it shut) */
  struckAt: number[]; loosedAt: number[];
}

/** One of the hero's hurts: when (frames), its type and how much. */
interface Hurt { frame: number; type: string; amount: number; at: number }

/** What her blow took off him in case `c`: his hurts as it landed (its frame), none of her others. */
function blowHurt(c: { log: CageLog | null; hurts: Hurt[] }): number {
  const blowAt = c.log?.blowAt ?? -1;
  if (blowAt < 0) return 0;
  return c.hurts.filter((h) => Math.abs(h.at - blowAt) < 0.5 / FPS).reduce((sum, h) => sum + h.amount, 0);
}

/** `body` run with every hurt the hero takes noted (his own `takeDamage`). */
async function noting<T>(hurts: Hurt[], frameOf: () => number, body: () => Promise<T>): Promise<T> {
  const hero = G.player, take = hero.takeDamage.bind(hero);
  hero.takeDamage = (amount, type, from) => {
    const dealt = take(amount, type, from);
    if (dealt) hurts.push({ frame: frameOf(), type: type ?? 'physical', amount: dealt.taken, at: G.time });
    return dealt;
  };
  try {
    return await body();
  } finally {
    hero.takeDamage = take;
  }
}

/** The touch stick pushed to walk the hero along world way (x, z), as the screen turns it. */
function stickToward(x: number, z: number): [number, number] {
  const yaw = cameraYaw(), cy = Math.cos(yaw), sy = Math.sin(yaw), length = Math.hypot(x, z) || 1;
  return [(x * cy - z * sy) / length, (x * sy + z * cy) / length];
}

/** How far past the cage's ring the hero stands (m; under 0: inside). */
const pastRing = (log: CageLog): number => Math.hypot(G.player.pos.x - log.x, G.player.pos.z - log.z) - C.radius;

/** A root of the cage on this game. */
type Root = NonNullable<typeof CAGE>['roots'][number];

/** The standing root of the cage on this game nearest (x, z), or null. */
function nearestRoot(x: number, z: number): Root | null {
  const roots = CAGE?.roots.filter((r) => r.prop && !r.prop.broken) ?? [];
  return roots.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0] ?? null;
}

/** Each of her hit fx she plays while `body` runs, with its time. */
async function herHits<T>(times: number[], body: () => Promise<T>): Promise<T> {
  const was = HER_HITS.map((name) => FX[name] as (...args: number[]) => void);
  HER_HITS.forEach((name, i) => {
    (FX as unknown as Record<string, unknown>)[name] = (...args: number[]) => { times.push(G.time); was[i](...args); };
  });
  try {
    return await body();
  } finally {
    HER_HITS.forEach((name, i) => { (FX as unknown as Record<string, unknown>)[name] = was[i]; });
  }
}

/** A case's pictures: called after each frame with the cage's log (null before it warns) and the boss; true ends
 *  the case there. */
type Shoot = (log: CageLog | null, boss: Enemy) => Promise<boolean>;

/** One case: her grown and let think, the hero standing still till she cages him, then meeting it as `how` says;
 *  `shoot`, its pictures as it runs, frame by frame (`before`: set up once she's grown). The ranger's way out begins
 *  shooting her `lead` s into the case, so the cage shuts at another point of his shot. */
async function oneCase(lab: Lab, options: { fixture: object; canary?: boolean }, how: How, shoot?: Shoot,
  before?: (boss: Enemy) => void, lead = 0): Promise<CageCase> {
  await standClear(lab, options as never);
  // (the set-up turns the clock back: the case before's blow, claimed ahead, would hold off this one's cage)
  forgetBeats();
  const boss = await rootmother(lab);
  const hero = G.player;
  const result: CageCase = {
    how, log: null, outAtBlow: NaN, outAfter: -1, hurts: [], made: 0, others: [], rootHits: 0, rootLife: NaN,
    struckAt: [], loosedAt: [],
  };
  let lifeWas = Infinity, firedWas = false;
  // (the case's cage is a log made after it began: the log keeps the last 8, so it's told by itself, not its count)
  const was = CAGE_LOG[CAGE_LOG.length - 1] ?? null;
  const logNow = (): CageLog | null => {
    const last = CAGE_LOG[CAGE_LOG.length - 1] ?? null;
    return last === was ? null : last;
  };
  boss.dazed = 0;
  boss.brain.cageT = 0;
  // (her first thought the cage: none of her other attacks before he has stood still long enough)
  boss.cd = C.still.time + 0.2;
  before?.(boss);
  const made = PIPELINES.made;
  const began = G.time;
  const way = new THREE.Vector3(hero.pos.x - boss.pos.x, 0, hero.pos.z - boss.pos.z).normalize();
  let frame = 0, cut: Root | null = null, blinked = -1, placedOut = false;
  const input = (): Frame => cageInput();
  const cageInput = (): Frame => {
    boss.brain.heartT = 1e9;
    boss.brain.sporeT = 1e9;
    const log = logNow();
    // (the ranger stands to shoot: caged as he shoots her, an arrow let go or on its way as it shuts)
    if (how === 'his way out' && hero.cls.id === 'ranger' && (!log || log.shutAt < 0)) {
      return G.time - began < lead ? {} : shootAt(boss.pos.clone().setY(2));
    }
    if (!log) return {};
    const shut = log.shutAt >= 0;
    // (walking out as the cracks show, before it shuts)
    if (how === 'walking out' && !shut && G.time - log.warnedAt > 0.2) return { stick: stickToward(way.x, way.z) };
    if (!shut || log.blowAt >= 0) return { stick: [0, 0] };
    if (how === 'pushing') return pushing(log);
    if (how === 'a root broken') return brokenRoot(log);
    if (how === 'his way out') return wayOut(log);
    if (how === 'his shield') return shielding(boss);
    if (how === 'from outside') return fromOutside(log);
    return {};
  };
  /** A partner's way of freeing him, played by him: set down `OUTSIDE` m out past the root on his way out as it
   *  shuts, and striking it from there with his basic attack till it breaks. */
  const fromOutside = (log: CageLog): Frame => {
    cut ??= nearestRoot(log.x + way.x * C.radius, log.z + way.z * C.radius);
    const root = cut;
    if (!root) return {};
    if (!placedOut) {
      placedOut = true;
      const out = new THREE.Vector3(root.x - log.x, 0, root.z - log.z).normalize();
      hero.place(new THREE.Vector3(root.x, 0, root.z).addScaledVector(out, OUTSIDE), hero.facing);
    }
    if (root.prop?.broken) return {};
    return shootAt(new THREE.Vector3(root.x, 1, root.z));
  };
  /** Walking out through the gap between two roots nearest his way out (the line most likely to let him by). */
  const pushing = (log: CageLog): Frame => {
    const gap = gapToward(Math.atan2(way.x, way.z));
    const at = { x: log.x + Math.sin(gap) * (C.radius + BLINK_PAST), z: log.z + Math.cos(gap) * (C.radius + BLINK_PAST) };
    return { stick: stickToward(at.x - hero.pos.x, at.z - hero.pos.z) };
  };
  /** One root broken by his game's hits, then walked out through its gap. */
  const brokenRoot = (log: CageLog): Frame => {
    if (!cut) {
      cut = nearestRoot(log.x + way.x * C.radius, log.z + way.z * C.radius);
      if (cut?.prop) for (let i = 0; i < C.hits && !cut.prop.broken; i++) hurtProp(cut.prop.parts[0], 1);
    }
    // (on through its gap, out past the ring)
    const out = cut ? throughGap(log, cut) : null;
    return { stick: out ? stickToward(out.x - hero.pos.x, out.z - hero.pos.z) : [0, 0] };
  };
  /** His class's own way out, at once: shots at the nearest root, a charge or a blink through it. */
  const wayOut = (log: CageLog): Frame => {
    cut ??= nearestRoot(log.x + way.x * C.radius, log.z + way.z * C.radius);
    const root = cut;
    if (!root) return {};
    const at = new THREE.Vector3(root.x, 1, root.z);
    const past = at.clone().add(new THREE.Vector3(root.x - log.x, 0, root.z - log.z).normalize().multiplyScalar(BLINK_PAST));
    if (root.prop?.broken || blinked >= 0 && frame > blinked + BLINK_HOLD + 30) {
      return { stick: stickToward(past.x - hero.pos.x, past.z - hero.pos.z) };
    }
    const cls = hero.cls.id;
    if (cls === 'mage') {
      const key = skillNamed('blink').key;
      if (blinked < 0) blinked = frame;
      return pressing(key, past, frame - blinked < BLINK_HOLD);
    }
    if (cls === 'warrior') {
      const key = trySkill('bullRush');
      if (key) return pressing(key, past, frame % 20 < 2);
      hero.facing = Math.atan2(at.x - hero.pos.x, at.z - hero.pos.z);
      return { m0: frame % 30 < 2, aim: at };
    }
    // (the ranger: drawn and let go at the root, again and again)
    return shootAt(at);
  };
  /** A frame of his basic attack at `at`, as fast as he can: held down (a press while he's busy is queued), let go
   *  as his draw reaches its least. */
  const shootAt = (at: THREE.Vector3): Frame => {
    hero.facing = Math.atan2(at.x - hero.pos.x, at.z - hero.pos.z);
    const cast = hero.casting;
    const drawn = cast?.drawT && !cast.fired ? (cast.t - (cast.nockT ?? 0)) / cast.drawT : 0;
    const ready = drawn >= (cast?.skill.def.minDraw ?? 1);
    return { m0: !ready, aim: at };
  };
  /** The root's hits and his shots this frame, by the root's life and his cast's `fired`. */
  const noteStrokes = (log: CageLog): void => {
    if (log.shutAt < 0) return;
    const since = G.time - log.shutAt;
    const fired = hero.casting?.fired ?? false;
    if (fired && !firedWas) result.loosedAt.push(since);
    firedWas = fired;
    const life = cut?.prop?.life ?? Infinity;
    if (life < lifeWas && lifeWas !== Infinity) result.struckAt.push(since);
    lifeWas = life;
  };
  const frames = Math.round((WAIT + FOLLOW) * FPS);
  const afterFrame = (): void => {
    frame++;
    const log = logNow();
    if (!log) return;
    result.log = log;
    noteStrokes(log);
    if (log.shutAt >= 0 && result.outAfter < 0 && pastRing(log) > OUT) result.outAfter = Math.round((G.time - log.shutAt) * FPS);
    if (log.blowAt >= 0 && Number.isNaN(result.outAtBlow)) result.outAtBlow = pastRing(log);
  };
  /** The frames run at once, or one at a time with their pictures. */
  /** Followed far enough: `FOLLOW` s after the cage shut. */
  const followed = (): boolean => {
    const log = logNow();
    return !!log && log.shutAt >= 0 && G.time - log.shutAt >= FOLLOW;
  };
  /** The frames run until it's followed far enough (or no cage came), a step at a time, with their pictures. */
  const run = async (): Promise<void> => {
    for (let at = 0; at < frames && !followed(); at++) {
      await lab.step(1, input, afterFrame);
      if (shoot && await shoot(logNow(), boss)) return;
    }
  };
  await herHits(result.others, () => noting(result.hurts, () => frame, run));
  result.made = PIPELINES.made - made;
  // (set in the frames' closures: read as they left it)
  const struck = cut as Root | null;
  if (struck?.prop) {
    result.rootHits = C.hits;
    result.rootLife = struck.prop.broken ? 0 : struck.prop.life;
  }
  return result;
}

/** The way (radians round the cage, as its roots are laid) of the middle of the gap between two roots nearest `way`. */
function gapToward(way: number): number {
  const step = (Math.PI * 2) / C.roots;
  return (Math.round(way / step - 0.5) + 0.5) * step;
}

/** A spot `BLINK_PAST` m out past the ring through root `root`'s place (the way out through its gap). */
function throughGap(log: CageLog, root: Root): THREE.Vector3 {
  const out = new THREE.Vector3(root.x - log.x, 0, root.z - log.z).normalize();
  return new THREE.Vector3(root.x, 1, root.z).addScaledVector(out, BLINK_PAST);
}

/** The hero's skill bound by behaviour `impl`, or null. */
function trySkill(impl: string): SkillKey | null {
  try {
    return skillNamed(impl).key;
  } catch {
    return null;
  }
}

/** His shield raised towards her as her blow comes (its last half second), else lowered. */
function shielding(boss: Enemy): Frame {
  const key = trySkill('raiseShield');
  const a = boss.action;
  const late = a?.name === 'crush' && a.t > ENEMIES.rootmother.bossKit!.attacks!.crush.warn - 0.6;
  return key ? pressing(key, boss.pos.clone().setY(1), late) : {};
}

/** A case's lines and its problems. */
function judge(c: CageCase, standingHurt: number, lines: string[], problems: string[]): void {
  const part = `rootCage: ${c.how}`, log = c.log;
  if (!log) {
    lines.push(`${part}: no cage`);
    problems.push(`${part}: she never caged the hero standing still`);
    return;
  }
  const crush = blowHurt(c);
  const warned = log.shutAt >= 0 ? log.shutAt - log.warnedAt : NaN;
  const blowAfter = log.blowAt >= 0 && log.shutAt >= 0 ? log.blowAt - log.shutAt : NaN;
  const out = c.outAfter >= 0 ? `out ${fixed(c.outAfter / FPS, 2)} s after it shut` : 'never out';
  lines.push(`${part}: warned ${fixed(warned, 2)} s before it shut, its blow ${fixed(blowAfter, 2)} s after, ${out}, `
    + `${fixed(c.outAtBlow, 2)} m past its ring at the blow, hurt ${fixed(crush, 0)} by it`
    + (log.endedAt >= 0 ? `, withered ${fixed(log.endedAt - log.shutAt, 2)} s after it shut` : '')
    + (Number.isNaN(c.rootLife) ? '' : `, the root he went at left ${fixed(c.rootLife, 1)} of its ${C.hits}`)
    + (c.loosedAt.length ? `, let go at ${c.loosedAt.map((t) => fixed(t, 2)).join(', ')} s` : '')
    + (c.struckAt.length ? `, the root struck at ${c.struckAt.map((t) => fixed(t, 2)).join(', ')} s` : ''));
  const kit = ENEMIES.rootmother.bossKit!.attacks!;
  if (Math.abs(warned - kit.cage.warn) > 0.05) problems.push(`${part}: warned ${fixed(warned, 2)} s, not ${kit.cage.warn}`);
  if (Math.abs(blowAfter - kit.crush.warn) > 0.1) problems.push(`${part}: its blow ${fixed(blowAfter, 2)} s after it shut`);
  const escaped = c.how === 'walking out' || c.how === 'a root broken' || c.how === 'his way out';
  if (escaped && !(c.outAtBlow > 0)) problems.push(`${part}: still in the cage as her blow came`);
  if (escaped && crush > 0) problems.push(`${part}: hurt ${fixed(crush, 0)} by her blow, out of the cage`);
  if (c.how === 'pushing' && c.outAtBlow > 0) problems.push(`${part}: walked out of the shut cage`);
  if (c.how === 'from outside' && c.rootLife !== 0) {
    problems.push(`${part}: the root struck from outside left ${fixed(c.rootLife, 1)} of its ${C.hits}`);
  }
  if ((c.how === 'standing' || c.how === 'pushing') && !(crush > 0)) problems.push(`${part}: her blow never hurt him in the cage`);
  if (c.how === 'his shield') lines.push(`${part}: hurt ${fixed(crush, 0)} of standing's ${fixed(standingHurt, 0)}`);
  if (c.how === 'his shield' && !(crush < standingHurt * SHIELD_MOST)) {
    problems.push(`${part}: hurt ${fixed(crush, 0)} of standing's ${fixed(standingHurt, 0)}: his shield took little of it`);
  }
  if (c.how === 'standing') {
    if (log.endedAt < 0 || Math.abs(log.endedAt - log.shutAt - C.life) > 0.1) problems.push(`${part}: it never withered on time`);
    const near = c.others.filter((t) => Math.abs(t - log.shutAt) < C.gap || Math.abs(t - log.blowAt) < C.gap);
    if (near.length) problems.push(`${part}: ${near.length} of her other hits within ${C.gap} s of its shut or its blow`);
    if (c.made > 0) problems.push(`${part}: ${c.made} pipelines made`);
  }
}

/** the ranger's other starts (s into the case), so the cage shuts at each point of his shot (a shot every 1.45 s), and
 *  the share of them all he must get out of in time ("most times") */
const LEADS = [0.25, 0.5, 0.75, 1, 1.25];
const MOST = 0.6;

/** The ranger's way out with the cage shutting at each point of his shot: when he got out, and in how many in time. */
async function rangerLeads(lab: Lab, options: { fixture: object; canary?: boolean }, first: CageCase, lines: string[],
  problems: string[]): Promise<void> {
  const cases = [first];
  for (const lead of LEADS) cases.push(await oneCase(lab, options, 'his way out', undefined, undefined, lead));
  const outs = cases.map((c) => (c.outAfter >= 0 ? c.outAfter / FPS : Infinity));
  const blow = ENEMIES.rootmother.bossKit!.attacks!.crush.warn;
  const inTime = outs.filter((t, i) => t < blow && blowHurt(cases[i]) === 0).length;
  const said = outs.map((t) => (Number.isFinite(t) ? fixed(t, 2) : 'never')).join(', ');
  lines.push(`rootCage: his way out, shut at ${cases.length} points of his shot: out ${said} s after it shut; `
    + `in time (before her blow at ${blow} s) ${inTime} of ${cases.length}`);
  if (inTime < cases.length * MOST) {
    problems.push(`rootCage: the ranger out in time ${inTime} of ${cases.length}, not most times`);
  }
}

/** `rootCage`: her root cage at a hero standing still, met each way. */
export async function rootCage(lab: Lab, options: { fixture: object; canary?: boolean }, lines: string[],
  problems: string[]): Promise<void> {
  const rootR = C.rootR;
  if (options.canary) C.rootR = 0.01;
  try {
    const hows: How[] = ['standing', 'walking out', 'pushing', 'a root broken', 'his way out', 'from outside'];
    if (G.player.gear.shield && trySkill('raiseShield')) hows.push('his shield');
    else lines.push('rootCage: his shield: not run (--class warrior --gear shield)');
    let standingHurt = 0;
    for (const how of hows) {
      const c = await oneCase(lab, options, how);
      if (how === 'standing') standingHurt = blowHurt(c);
      judge(c, standingHurt, lines, problems);
      if (how === 'his way out' && G.player.cls.id === 'ranger') await rangerLeads(lab, options, c, lines, problems);
      if (how === 'standing') lines.push(`rootCage: standing: her other hits at ${c.others.map((t) => fixed(t - (c.log?.shutAt ?? 0), 1)).join(', ') || 'none'} s from its shut; ${c.made} pipelines made`);
    }
  } finally {
    C.rootR = rootR;
  }
  lines.push(`rootCage: the ${G.player.cls.id}; ${C.roots} roots ${C.radius} m round, each ${C.hits} of a prop's hits; `
    + `its blow ${ENEMIES.rootmother.bossKit!.attacks!.crush.warn} s after it shuts`);
}

/** the side strip of the roots: frames between pictures from the shut, and how many */
const BURST_EVERY = 4;
const BURST_SHOTS = 10;
/** her blow's strip: seconds before it lands to begin, frames between, how many */
const BLOW_FROM = 0.9;
const BLOW_EVERY = 8;
const BLOW_SHOTS = 9;
/** how far the side view stands off the cage (m), and how far round the cage the player's view's crop takes in */
const SIDE_OFF = 9;
/** how far towards her the side picture reaches from the cage (m): her great root's foot and its height */
const SIDE_SPAN = 5;
const SIDE_HIGH = 6;
const SEEN_REACH = 4.5;

/** The screen over the line from her to the cage at `centre` (`way` from her), `SIDE_SPAN` m towards her and the
 *  ring past it, as high as her great root stands, as the camera now shows it. */
function alongLine(centre: THREE.Vector3, way: THREE.Vector3): Clip {
  const points: THREE.Vector3[] = [];
  for (const along of [-SIDE_SPAN, C.radius + 1]) {
    for (const y of [0, SIDE_HIGH]) points.push(centre.clone().addScaledVector(way, along).setY(y));
  }
  return screenArea(points);
}

/** The screen round the cage at (x, z), `reach` m about it on the floor and 3 m up, as the game's camera shows it. */
function roundCage(x: number, z: number, reach: number): Clip {
  const points: THREE.Vector3[] = [];
  for (const dx of [-reach, reach]) {
    for (const dz of [-reach, reach]) {
      for (const y of [0, 3]) points.push(new THREE.Vector3(x + dx, y, z + dz));
    }
  }
  return screenArea(points);
}

/** Pictures at the moments `at` (s from the cage's warning, its shut or its blow, each as `from` names), as the game's
 *  camera shows the cage. */
function seenAt(lab: Lab, moments: Pictured[], name: string, at: { from: 'warned' | 'shut' | 'blow'; t: number; note: string }[]): Shoot {
  let next = 0;
  return async (log) => {
    // (never ended early: a case left with its cage standing leaves the next one none)
    if (!log || next >= at.length) return false;
    const moment = at[next];
    const start = moment.from === 'warned' ? log.warnedAt : moment.from === 'shut' ? log.shutAt : log.blowAt;
    if (start < 0 || G.time - start < moment.t) return false;
    next++;
    moments.push(await lab.screen(`${name} ${next}`, [moment.note], roundCage(log.x, log.z, SEEN_REACH)));
    return false;
  };
}

/** `rootCagePictures`: her root cage for the eye (no verdict): its warning ring, the roots bursting and closing from
 *  the side, a hero breaking a root and stepping out, and her great root's blow from the side and as the player sees
 *  it. */
export async function rootCagePictures(lab: Lab, options: { fixture: object }, lines: string[]): Promise<Pictured[]> {
  const moments: Pictured[] = [];
  // (the side strip: the roots bursting and closing from the shut, then her great root rising and falling)
  try {
    let shot = 0, blowShot = 0, clip: Clip | null = null;
    let line: { centre: THREE.Vector3; way: THREE.Vector3 } | null = null;
    await oneCase(lab, options, 'standing', async (log, boss) => {
      if (!log) return false;
      // (looking across the line from her to the cage, her great root falling along it; set as it warns)
      if (!line) {
        const centre = new THREE.Vector3(log.x, 0, log.z);
        line = { centre, way: new THREE.Vector3(log.x - boss.pos.x, 0, log.z - boss.pos.z).normalize() };
        holdSideView(sideView(centre, line.way, SIDE_OFF, C.radius + 0.5));
        return false;
      }
      // (cropped once the side view holds the camera: it takes it from the frame after it's asked)
      clip ??= alongLine(line.centre, line.way);
      if (log.shutAt < 0) return false;
      const since = Math.round((G.time - log.shutAt) * FPS);
      if (shot < BURST_SHOTS && since === shot * BURST_EVERY) {
        moments.push(await lab.screen(`burst ${shot + 1}`, [`the roots from the side, ${since} frames after it shut`], clip));
        shot++;
      }
      const toBlow = Math.round((G.time - log.shutAt - (ENEMIES.rootmother.bossKit!.attacks!.crush.warn - BLOW_FROM)) * FPS);
      if (blowShot < BLOW_SHOTS && toBlow === blowShot * BLOW_EVERY) {
        const note = `her great root from the side, ${fixed(BLOW_FROM - toBlow / FPS, 2)} s before it lands`;
        moments.push(await lab.screen(`blow side ${blowShot + 1}`, [note], clip));
        blowShot++;
      }
      // (run to its end, its cage withered: a case left with her blow to come leaves the next one none)
      return false;
    });
  } finally {
    endSideView();
  }
  // (as the player sees it: the warning, the cage shut, then its blow on a hero who stayed)
  const seenCase = await oneCase(lab, options, 'standing', seenAt(lab, moments, 'seen', [
    { from: 'warned', t: 0.5, note: 'the earth cracking in a ring round him, as the player sees it' },
    { from: 'shut', t: 0.12, note: 'the roots bursting up' },
    { from: 'shut', t: 0.6, note: 'the cage shut over him' },
    { from: 'shut', t: ENEMIES.rootmother.bossKit!.attacks!.crush.warn - 0.25, note: 'her great root falling' },
    { from: 'blow', t: 0.05, note: 'her blow landing' },
    { from: 'blow', t: 0.5, note: 'after it' },
  ]));
  // (a root broken and stepped out of, as the player sees it)
  const cutCase = await oneCase(lab, options, 'his way out', seenAt(lab, moments, 'cut', [
    { from: 'shut', t: 0.3, note: `the ${G.player.cls.id} at a root` },
    { from: 'shut', t: 0.9, note: 'the root struck' },
    { from: 'shut', t: 1.5, note: 'its gap' },
    { from: 'shut', t: 2.6, note: 'stepping out' },
    { from: 'shut', t: 3.6, note: 'out' },
    { from: 'blow', t: 0.1, note: 'her blow landing on the empty cage' },
  ]));
  for (const c of [seenCase, cutCase]) {
    const log = c.log;
    const said = log ? `warned at ${fixed(log.warnedAt, 2)} s, shut at ${fixed(log.shutAt, 2)}, its blow at `
      + `${fixed(log.blowAt, 2)}, out ${c.outAfter >= 0 ? fixed(c.outAfter / FPS, 2) + ' s after it shut' : 'never'}, `
      + `hurt ${fixed(blowHurt(c), 0)} by it` : 'no cage';
    lines.push(`rootCagePictures: ${c.how}: ${said}`);
  }
  lines.push(`rootCagePictures: ${moments.length} moments`);
  return moments;
}
