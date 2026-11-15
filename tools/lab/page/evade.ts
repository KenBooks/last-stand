// The shooters getting out of the hero's attacks (tools/lab `evade`): each foe that evades (`EnemyDef.evade`: the
// Sporecaller ducks into the ground, the Rift Witch blinks away) stood before the hero, held to its spot and kept from
// shooting, and each of his attacks it evades cast at it as the player casts it, try after try: from in front of it,
// where it sees the attack coming, from behind it, where it doesn't, and for a foe that ducks, at its feet as it's
// down. Each try's evade is caught as it's played (`Enemy.evade`), and each hit as it lands. From in front, about half
// the tries must be evaded (`chance`), none struck after it evaded, and every one it didn't evade struck (or the try
// measured nothing); a blink must end within its reach, clear of the props, the wall and the hero, a line it could
// walk from where it stood. From behind, none may be evaded and every one struck; at a ducked foe's feet, every shot
// must strike. (The owner's words: "the mushroom shooters should duck down to a mushroom with a 50% chance, so the
// shots will miss, unless fired under their feet"; "the wraiths will teleport to a near location with 50% chance,
// escaping the shot"; "dodge/duck should only work if player is in front of them... if another player shoots from
// behind, they cannot see that".)
import * as THREE from 'three';
import type { Fixture, Frame, Lab, Report } from './lab';
import { viewMode } from '../../../src/core/renderer';
import type { Enemy } from '../../../src/entities/enemy';
import type { EnemyId } from '../../../src/data/enemies';
import type { EvadeDef, SkillDef, ThreatKind, XZ } from '../../../src/types';
import { G } from '../../../src/state';
import { ENEMIES } from '../../../src/data/enemies';
import { EVADE_HOW } from '../../../src/entities/evade';
import { inObstacle } from '../../../src/world/collision';
import { lineClear } from '../../../src/world/navigation';
import { bindKnown, holdFor, pressing, skillNamed, type BoundSkill } from './cast';
import { FACING, SPOT } from './death';

export interface EvadeOptions {
  fixture: Fixture;
  /** the attacks: their keys, behaviours or names (the hero's that a foe evades, by default) */
  skills: string[];
  /** tries from in front of a foe, each attack (from behind and at its feet, a third as many) */
  tries: number;
  /** plant the faults the checks must catch: the foes seeing all round them, and ducking without going down */
  canary: boolean;
  /** list each try: its evade, its hits, and where each of the hero's shots ended against the foe's height */
  trace?: boolean;
}

/** what each of the heroes' attacks is, as a foe sees it coming (entities/evade.ts) */
const THREATS: Record<string, ThreatKind> = {
  nockShot: 'shot',
  fanShot: 'shot',
  piercingShot: 'shot',
  splinterBolt: 'shot',
  arrowRain: 'area',
  starfall: 'area',
  voidLance: 'beam',
  crescent: 'wave',
  bullRush: 'rush',
};

/** the foes that evade, the kinds measured */
const EVADERS: EnemyId[] = ['sporecaller', 'witch'];

/** how far before the hero a foe stands (m) */
const AHEAD = 7;
/** a foe's life: past every blow */
const LIVING = 1e5;
const RISE_FRAMES = 120;
/** frames a try waits before its cast: the foe turned to face as the try has it */
const SETTLE = 20;
/** frames a try is followed after its key is let go: the attack's flight, a crystal's fall */
const FOLLOW = 100;
/** a try at a foe's feet ducks it this many frames before the key is let go */
const DUCK_LEAD = 6;
/** a channel's key held this long (s) in a try: the beam's first tick, and enough of the rain's showers that its
 *  arrows (each coming down anywhere in its area) strike the foe in every try */
const CHANNELS: Record<string, number> = { voidLance: 1, arrowRain: 5 };
/** an area is aimed on the ground this far short of the foe, towards the hero (m): aimed under its feet, the aim met
 *  its body first, and as it blinked away went on to the floor a metre off, carrying the rain onto where it went */
const SHORT = 1.5;
/** from in front, the share of tries evaded must fall within these (its `chance` 0.5) */
const EVADED_SHARE: readonly [number, number] = [0.3, 0.7];
/** how near a blink may end to the hero (m, past both their circles) and how far within the wall */
const CLEAR = { hero: 2, wall: 1 };

const frameTime = (): number => window.__labClock.frame / 1000;

/** Which way a try's attack comes at the foe: from in front, from behind it, or at its feet as it's ducked. */
type Side = 'front' | 'behind' | 'feet';

/** A try: the evade the foe played (null: none), and the hits on it before and after the evade. */
interface Try {
  /** the evade: how, where to, its frame from the press, and what was wrong with a blink as it went (null: nothing) */
  evade: { how: number; to: XZ; frame: number; fault: string | null } | null;
  hitsBefore: number;
  hitsAfter: number;
  /** where each of the hero's shots ended, and the foe's feet and top then (m) */
  ends: { at: THREE.Vector3; feet: number; top: number }[];
  /** where the hero's aim was as the key was let go */
  aimed: THREE.Vector3;
}

/** A foe of a kind kept for every try: held to its spot, kept from shooting and from dying. */
interface Target {
  foe: Enemy;
  spot: THREE.Vector3;
  /** where it faces, in a try from behind (rad; null: at the hero, as its own AI turns it) */
  away: number | null;
  /** the try under way, its evades and hits caught as they're played */
  now: Try | null;
  frame: number;
}

/** The kinds of foe that evade `kind`. */
function evadersOf(kind: ThreatKind): EnemyId[] {
  return EVADERS.filter((id) => ENEMIES[id].evade?.from.includes(kind));
}

/** The attacks measured by default: the hero's own that a foe evades. */
function defaultSkills(): string[] {
  const impls = [...G.player.known.values()].map((known) => known.def.impl);
  return impls.filter((impl, i) => impl in THREATS && impls.indexOf(impl) === i);
}

/** A foe of `kind` risen `AHEAD` before the hero, its evades and hits caught for `target.now`. */
async function targetOf(lab: Lab, kind: EnemyId): Promise<Target> {
  const hero = G.player;
  const forward = new THREE.Vector3(Math.sin(hero.facing), 0, Math.cos(hero.facing));
  const spot = hero.pos.clone().addScaledVector(forward, AHEAD);
  const foe = lab.spawnFoe(kind, spot);
  await lab.until(() => foe.spawning <= 0, RISE_FRAMES, `the ${kind} never rose`);
  const target: Target = { foe, spot, away: null, now: null, frame: 0 };
  const evade = foe.evade.bind(foe);
  foe.evade = (how, x, z, own) => {
    // (a blink judged as it goes: the props a crescent broke since weren't there)
    const reach = foe.def.evade?.reach ?? [3, 5];
    const fault = how === EVADE_HOW.blink ? blinkFault(foe, foe.pos, { x, z }, G.player.pos, reach) : null;
    if (target.now && !target.now.evade) target.now.evade = { how, to: { x, z }, frame: target.frame, fault };
    evade(how, x, z, own);
  };
  const takeDamage = foe.takeDamage.bind(foe);
  foe.takeDamage = (amount, info) => {
    if (target.now?.evade) target.now.hitsAfter++;
    else if (target.now) target.now.hitsBefore++;
    return takeDamage(amount, info);
  };
  const faceTo = foe.faceTo.bind(foe);
  foe.faceTo = (x, z) => {
    if (target.away === null) faceTo(x, z);
    else foe.targetFacing = target.away;
  };
  return target;
}

/** The foe held where a try wants it: on its spot, or where it blinked to (left to its AI, it walked back into a rain
 *  of arrows), kept from shooting, living; and its meshes
 *  placed where it's drawn, as the game's frame places them (the lab's frames draw nothing: a ducked foe's body was
 *  met standing). */
function holdFoe(target: Target): void {
  const foe = target.foe;
  foe.cd = 99;
  foe.life = LIVING;
  const evade = target.now?.evade;
  const at = evade?.how === EVADE_HOW.blink ? evade.to : target.spot;
  foe.pos.set(at.x, foe.pos.y, at.z);
  foe.obj.updateMatrixWorld(true);
}

/** The foe and the hero set for a try: the foe back on its spot, up and about, facing as `side` has it. */
function resetTry(target: Target, side: Side, start: THREE.Vector3, facing: number): void {
  const foe = target.foe;
  const hero = G.player;
  Object.assign(foe, { ducked: 0, forming: 0, dazed: 0, frozen: 0, chill: 0, carried: null, tossed: null });
  foe.knock.set(0, 0, 0);
  foe.cancelAction();
  target.away = side === 'behind' ? facing : null;
  foe.facing = side === 'behind' ? facing : facing + Math.PI;
  hero.pos.copy(start);
  hero.vel.set(0, 0, 0);
  hero.facing = facing;
  hero.cooldowns.clear();
  hero.energy = hero.stats.maxEnergy;
}

/** Where a try's attack is aimed: at the foe's body, at its feet, or for an area on the ground just short of it. */
function aimAt(target: Target, skill: BoundSkill, side: Side): THREE.Vector3 {
  const spot = target.spot;
  if (THREATS[skill.def.impl] === 'area') {
    const hero = G.player.pos;
    const short = SHORT / Math.max(1e-3, Math.hypot(spot.x - hero.x, spot.z - hero.z));
    return new THREE.Vector3(spot.x + (hero.x - spot.x) * short, 0, spot.z + (hero.z - spot.z) * short);
  }
  return new THREE.Vector3(spot.x, side === 'feet' ? 0.05 : target.foe.height * 0.55, spot.z);
}

/** The frame's input aiming at `point`: the mouse over it, and in a close view the crosshair turned onto it. */
function aiming(point: THREE.Vector3): Frame {
  return viewMode() === 'top' ? { aim: point } : { aim: point, sight: point };
}

/** One try: the attack cast at the foe as `side` has it, followed until it's done. */
async function tryOnce(lab: Lab, target: Target, skill: BoundSkill, side: Side, start: THREE.Vector3): Promise<Try> {
  const facing = G.player.facing;
  resetTry(target, side, start, facing);
  const keep = (): void => holdFoe(target);
  await lab.step(SETTLE, () => aiming(aimAt(target, skill, side)), keep);
  const now: Try = { evade: null, hitsBefore: 0, hitsAfter: 0, ends: [], aimed: new THREE.Vector3() };
  target.now = now;
  const hold = CHANNELS[skill.def.impl] ?? holdFor(skill.def);
  const holdFrames = Math.max(1, Math.round(hold / frameTime()));
  const aim = aimAt(target, skill, side);
  const frames = holdFrames + FOLLOW;
  // (at its feet: ducked as the shot is loosed, so it's down as the shot comes)
  const duckAt = side === 'feet' ? Math.max(0, holdFrames - DUCK_LEAD) : -1;
  for (target.frame = 0; target.frame < frames; target.frame++) {
    if (target.frame === duckAt) duckNow(target);
    const flying = G.projectiles.filter((shot) => !shot.hostile && shot.alive);
    await lab.step(1, () => ({ ...pressing(skill.key, aim, target.frame < holdFrames), ...aiming(aim) }), keep);
    for (const shot of flying.filter((each) => !each.alive)) now.ends.push(endOf(shot.pos, target.foe));
    if (target.frame === holdFrames - 1) now.aimed.copy(G.player.aim);
  }
  target.now = null;
  return now;
}

/** Where a shot ended, against the foe's feet and top as drawn then. */
function endOf(at: THREE.Vector3, foe: Enemy): Try['ends'][number] {
  const feet = foe.obj.position.y;
  return { at: at.clone(), feet, top: feet + foe.height };
}

/** A try's line, for `--trace`. */
function traceLine(each: Try, i: number): string {
  const to = each.evade ? `${each.evade.to.x.toFixed(2)}, ${each.evade.to.z.toFixed(2)}` : '';
  const evade = each.evade ? `evaded (${each.evade.how}) to ${to} at frame ${each.evade.frame}` : 'not evaded';
  const ends = each.ends.map((end) => {
    const where = `${end.at.x.toFixed(2)}, ${end.at.y.toFixed(2)}, ${end.at.z.toFixed(2)}`;
    return `${where} (feet ${end.feet.toFixed(2)}, top ${end.top.toFixed(2)})`;
  });
  const aimed = `${each.aimed.x.toFixed(2)}, ${each.aimed.y.toFixed(2)}, ${each.aimed.z.toFixed(2)}`;
  const hits = `hits ${each.hitsBefore} + ${each.hitsAfter}`;
  return `    try ${i}: ${evade}, ${hits}; aimed at ${aimed}; shots ended at ${ends.join('; ')}`;
}

/** The foe ducked by the try itself (a try at its feet), not as an evade of the try's attack. */
function duckNow(target: Target): void {
  const now = target.now;
  target.now = null;
  target.foe.evade(EVADE_HOW.duck, target.spot.x, target.spot.z);
  target.now = now;
}

/** Whether a blink to `to` from `from` ended within `reach`, clear of the props, the wall and the hero, in a line it
 *  could walk; what's wrong with it, if anything. */
function blinkFault(foe: Enemy, from: XZ, to: XZ, hero: XZ, reach: readonly [number, number]): string | null {
  const far = Math.hypot(to.x - from.x, to.z - from.z);
  if (far < reach[0] - 0.01 || far > reach[1] + 0.01) return `went ${far.toFixed(2)} m (reach ${reach.join(' to ')})`;
  if (inObstacle(to, foe.radius)) return `ended in a prop at ${to.x.toFixed(1)}, ${to.z.toFixed(1)}`;
  if (Math.hypot(to.x, to.z) > G.arena.radius - foe.radius - CLEAR.wall) return 'ended at the wall';
  if (!lineClear(from.x, from.z, to.x, to.z, foe.radius)) return 'went through a prop';
  if (Math.hypot(hero.x - to.x, hero.z - to.z) < CLEAR.hero + foe.radius) return 'ended by the hero';
  return null;
}

/** A side's tries summed up, and what's wrong with them. */
function judge(name: string, side: Side, tries: Try[], foe: Enemy): { line: string; problems: string[] } {
  const ev = foe.def.evade as EvadeDef;
  const evaded = tries.filter((each) => each.evade);
  const missed = tries.filter((each) => !each.evade && each.hitsBefore === 0);
  const struckAfter = evaded.filter((each) => each.hitsAfter > 0);
  const faults = evaded.map((each) => each.evade?.fault).filter((fault): fault is string => !!fault);
  const share = evaded.length / tries.length;
  const line = `${name}, ${side}: evaded ${evaded.length} of ${tries.length}, `
    + `struck after evading ${struckAfter.length}, missed without evading ${missed.length}`;
  const problems: string[] = [];
  if (side === 'front' && (share < EVADED_SHARE[0] || share > EVADED_SHARE[1])) {
    problems.push(`${name}: evaded ${evaded.length} of ${tries.length} from in front (${ev.chance} a try)`);
  }
  if (side !== 'front' && evaded.length) problems.push(`${name}: evaded ${evaded.length} from ${side}`);
  if (struckAfter.length) problems.push(`${name}, ${side}: struck after evading in ${struckAfter.length}`);
  if (missed.length) problems.push(`${name}, ${side}: missed without evading in ${missed.length} (measured nothing)`);
  problems.push(...[...new Set(faults)].map((fault) => `${name}: a blink ${fault}`));
  return { line, problems };
}

/** An attack's lines and problems. */
interface Measured {
  lines: string[];
  problems: string[];
}

/** The skill of the hero's that `wanted` names (its behaviour or its name), on a key or not: the gear it needs is set
 *  up before it's bound. */
function knownDef(wanted: string): SkillDef {
  const name = wanted.toLowerCase();
  const defs = [...G.player.known.values()].map((known) => known.def);
  const found = defs.find((def) => [def.impl, def.name].some((each) => each.toLowerCase() === name));
  if (!found) throw new Error(`lab: evade: the ${G.player.cls.id} has no skill ${wanted}`);
  return found;
}

/** The sides an attack is tried from at a foe: at a ducked foe's feet only with a shot aimed by the mouse. */
function sidesFor(foe: Enemy, skill: BoundSkill): Side[] {
  const level = foe.def.evade?.how === 'duck' && skill.def.draw !== undefined;
  return level ? ['front', 'behind', 'feet'] : ['front', 'behind'];
}

/** Each kind of foe that evades `wanted`, tried from each side. */
async function measureAttack(lab: Lab, options: EvadeOptions, wanted: string): Promise<Measured> {
  const def = knownDef(wanted);
  const kind = THREATS[def.impl];
  if (!kind) return { lines: [], problems: [`${wanted}: no attack a foe evades`] };
  const lines: string[] = [];
  const problems: string[] = [];
  for (const evader of evadersOf(kind)) {
    G.arena.restoreProps();
    // (over the shoulder by default: from above, the aim met a cap's or a hood's rim first, and a swaying body let
    // the shot graze past it)
    const fixture: Fixture = { at: SPOT, facing: (FACING * Math.PI) / 180, view: 'third', ...options.fixture };
    // (a skill that needs only something in a hand is cast as the boot dressed him)
    fixture.gear = def.needs === 'armed' ? undefined : def.needs;
    await lab.setup(fixture);
    bindKnown(wanted);
    const skill = skillNamed(wanted);
    const start = G.player.pos.clone();
    const target = await targetOf(lab, evader);
    for (const side of sidesFor(target.foe, skill)) {
      const count = side === 'front' ? options.tries : Math.max(3, Math.round(options.tries / 3));
      const tries: Try[] = [];
      for (let i = 0; i < count; i++) tries.push(await tryOnce(lab, target, skill, side, start));
      const name = `${skill.def.name} at the ${target.foe.def.name}`;
      const judged = judge(name, side, tries, target.foe);
      lines.push(judged.line, ...judged.problems.map((problem) => `  ! ${problem}`));
      if (options.trace) lines.push(...tries.map(traceLine));
      problems.push(...judged.problems);
    }
  }
  return { lines, problems };
}

/** The canary's plants: every evading foe seeing all round it and ducking without going down, until `undo`. */
function plantFaults(): () => void {
  const kept = EVADERS.map((id) => ({ id, evade: ENEMIES[id].evade }));
  for (const { id, evade } of kept) {
    if (evade) ENEMIES[id].evade = { ...evade, sees: Math.PI, top: ENEMIES[id].evade?.how === 'duck' ? 9 : evade.top };
  }
  return () => {
    for (const { id, evade } of kept) ENEMIES[id].evade = evade;
  };
}

/** `lab evade`: each foe that evades, each attack of the hero's it evades cast at it from in front, behind and at its
 *  feet, every evade and hit caught; the canary's plants must be caught. */
export async function evade(lab: Lab, options: EvadeOptions): Promise<Report> {
  const skills = options.skills.length ? options.skills : defaultSkills();
  if (!skills.length) throw new Error(`lab: the ${G.player.cls.id} has no attack a foe evades`);
  const undo = options.canary ? plantFaults() : null;
  const lines: string[] = [];
  const problems: string[] = [];
  try {
    for (const wanted of skills) {
      const measured = await measureAttack(lab, options, wanted);
      lines.push(...measured.lines);
      problems.push(...measured.problems);
    }
  } finally {
    undo?.();
  }
  if (!options.canary) return { text: lines.join('\n'), problems };
  const seen = problems.some((problem) => problem.includes('from behind'));
  const down = problems.some((problem) => problem.includes('struck after evading'));
  const canary = [
    ...(seen ? [] : ['the canary\'s foes seeing all round them went unseen']),
    ...(down || !skills.some((wanted) => THREATS[skillNamed(wanted).def.impl] === 'shot')
      ? [] : ['the canary\'s duck that never went down went unseen']),
  ];
  lines.push(`canary: seen from behind ${seen ? 'caught' : 'missed'}, a duck not down ${down ? 'caught' : 'missed'}`);
  return { text: lines.join('\n'), problems: canary };
}
