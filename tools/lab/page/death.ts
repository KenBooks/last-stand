// Each skill's kills as the player sees them fall (tools/lab `death`). Foes stand dazed where the skill strikes, and
// it is cast at them twice on fresh set-ups: once with each foe a hair from death (the hit's damage nearly all past
// its life, so it is thrown hard) and once with each holding just under what the first cast dealt it (killed with
// little to spare, so it drops). Every fallen body is followed frame by frame, as drawn, until it has dissolved:
// how hard it was thrown and which way against the blow (away from the hero, along a sword's swing), how far it flew
// and how high, how long it took to lie still and how low it lay, and anything a body can't do: a part of it under
// the floor, inside a prop or past the arena's wall, its pose off its points, a number gone NaN. A storm's kills must
// go round it. The shaders compiled meanwhile must be none.
import * as THREE from 'three';
import { screenArea, type Fixture, type Lab, type Pictured, type Report } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import type { EnemyId } from '../../../src/data/enemies';
import type { Fling } from '../../../src/combat/fling';
import type { Joints } from '../../../src/entities/models/rig';
import { G } from '../../../src/state';
import { BIOMES } from '../../../src/data/biomes';
import { GROUND_EDGES, GROUND_LEVELS, groundHeight } from '../../../src/world/ground';
import { RAGDOLL_BONES, RAGDOLL_POINTS, type Ragdoll } from '../../../src/entities/ragdoll';
import { lateCompiles, programsCompiledInGame } from '../../../src/core/shaders';
import { bindKnown, holdFor, pressing, skillNamed, type BoundSkill } from './cast';

export interface DeathOptions {
  fixture: Fixture;
  /** picture each skill's body that lay deepest under the floor close up, framed on that part, at that frame: its pass
   *  cast again, as it was, with the picture taken then (a change to how a body lies, before and after) */
  close?: boolean;
  /** the skills: their keys, behaviours or names (every one of the hero's that deals damage by default) */
  skills: string[];
  pictures: boolean;
  /** plant the faults the checks must catch: a body put under the floor for a frame, one thrown back at the hero,
   *  one struck off its middle turned the other way */
  canary: boolean;
  /** list each frame of each body a skill throws hard: each point's height over the floor less its size, how far the
   *  drawn pose is off it and its point's own height over the floor less its size (cm) */
  trace?: boolean;
}

/** Where a skill's foes stand: `ahead` m before the hero, `across` m either side of that or `along` m apart down the
 *  way, or in a ring `round` m from him; and how many. */
export interface Stand {
  count: number;
  ahead?: number;
  across?: number;
  along?: number;
  round?: number;
}

/** each skill's foes, by its behaviour, where it strikes */
export const STANDS: Record<string, Stand> = {
  cleave: { count: 3, ahead: 1.6, across: 1 },
  twinFangs: { count: 3, ahead: 3.4, across: 0.8 },
  powerStrike: { count: 3, ahead: 2, across: 0.8 },
  crescent: { count: 3, ahead: 4, across: 1.4 },
  bullRush: { count: 3, ahead: 3.5, along: 1.3 },
  tempest: { count: 4, round: 1.7 },
  ironBellow: { count: 4, round: 2.5 },
  glacialNova: { count: 4, round: 3.2 },
  splinterBolt: { count: 3, ahead: 6, across: 1 },
  starfall: { count: 3, ahead: 8, across: 0.9 },
  voidLance: { count: 3, ahead: 3.5, along: 1.4 },
  maelstrom: { count: 3, ahead: 4.5, across: 1.2 },
  nockShot: { count: 1, ahead: 9 },
  fanShot: { count: 3, ahead: 8, across: 1.4 },
  piercingShot: { count: 3, ahead: 6, along: 1.4 },
  arrowRain: { count: 4, ahead: 9, across: 1.1 },
};
/** the skills whose kills go round the hero with the swing, which way it swings (+1 from his right to his left) */
const SWINGS = new Set(['cleave', 'twinFangs', 'tempest']);
/** the skills whose kills go round where they struck (a storm's), not away from the hero */
const WHIRLS = new Set(['maelstrom']);
/** the skills that strike from elsewhere (a shower bursting over its area, crystals landing), whose kills go the way
 *  their throw drove them, not away from the hero (one nearer him than the shower's middle is thrown back at him) */
const ELSEWHERE = new Set(['arrowRain', 'starfall']);

/** where the hero stands and faces (deg) unless the fixture says: open ground, off the dais, the arena before him */
export const SPOT: [number, number] = [-11, -12];
export const FACING = 90;
/** frames looked at from the press, at most (a storm holds its kills up for its whole time) */
const MOST_FRAMES = 900;
/** frames before the press, for the cast's light to clear and the foes to settle */
const SETTLE = 10;
/** the foes risen in at most this many frames */
const RISE_FRAMES = 300;
/** the bare pass: each foe holds this share of what the first cast's killing hit dealt it (a hit's roll is 10% either
 *  way: at 92%, a low roll left foes standing) */
const BARE_SHARE = 0.8;
/** what a body may do (m): a part of it this far under the floor or into a prop, its pose this far off its points,
 *  and a bone stretched or squashed by this share of its length */
const UNDER_MOST = 0.04;
const PROP_MOST = 0.06;
const POSE_MOST = 0.1;
const STRETCH_MOST = 0.08;
/** fallen, its hips lie at most this share of their height standing (a frozen body shatters before it lies) */
const LYING_MOST = 0.6;
/** a storm's kill goes round it: its path at least this many times its way from where it fell to where it lay */
const WHIRL_PATH = 2;
/** the moments pictured after the first kill (s), and the last once every body lies still */
const PICTURE_AT = [0.15, 0.5];
const PICTURE_MARGIN = 120;

/** A fallen body followed from its fall: what was thrown, where it fell and lay, how it went. */
interface Fallen {
  foe: Enemy;
  /** the killing hit's damage, and the life it took it from */
  dealt: number;
  /** frames from the press to the fall, and the throw */
  fellAt: number;
  fling: Fling;
  from: THREE.Vector3;
  /** where the hero stood as it fell (a charge carries him on past it), and which way the swing the player saw went
   *  then (+1 from his right to his left) */
  heroAt: THREE.Vector3;
  swing: number;
  /** the way it was going over the first frames after its fall (m/s, along the ground) */
  early: THREE.Vector3;
  /** the turn its blow gives it about its upright (its lever across the body times its throw, m²/s: + turning as a
   *  heading turns to the left), and how far it turned over its first `TURN_FRAMES` (rad), from its shoulders'
   *  heading as it fell */
  torque: number;
  headingAt: number;
  turned: number;
  standingHips: number;
  path: number;
  highest: number;
  restAt: number;
  /** where it lay still, or began to dissolve (`ended`) without lying still */
  lay: THREE.Vector3;
  ended: boolean;
  layHips: number;
  under: Worst;
  inProp: Worst;
  poseOff: Worst;
  stretch: Worst;
  /** each bone's length at the fall (m) */
  bones: number[];
  outside: boolean;
  broken: boolean;
}

/** The worst of a measure over a body's frames: how much, where on it and when after the fall (s). */
interface Worst {
  amount: number;
  part: string;
  at: number;
}

const noWorst = (): Worst => ({ amount: 0, part: '', at: 0 });
const metres = (value: number): string => `${value.toFixed(2)} m`;
const centimetres = (value: number): string => `${(value * 100).toFixed(0)} cm`;
const seconds = (value: number): string => `${value.toFixed(2)} s`;
const percentOf = (share: number): string => `${(share * 100).toFixed(0)}%`;
const frameTime = (): number => window.__labClock.frame / 1000;
const flat = (from: THREE.Vector3, to: THREE.Vector3): number => Math.hypot(to.x - from.x, to.z - from.z);

/** The kind of foe the skills are cast at: the biome's commonest in its third wave. */
export function foeKind(): EnemyId {
  const pool = BIOMES[G.arena.biome].pool(3).slice().sort((a, b) => b[1] - a[1]);
  return pool[0][0];
}

/** Where `stand` puts its foes round a hero at `at` facing `facing` (rad), and where the skill is aimed. */
export function placesFor(
  stand: Stand, at: THREE.Vector3, facing: number,
): { spots: THREE.Vector3[]; aim: THREE.Vector3 } {
  const forward = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
  const left = new THREE.Vector3(Math.cos(facing), 0, -Math.sin(facing));
  const spots: THREE.Vector3[] = [];
  for (let i = 0; i < stand.count; i++) {
    const middle = stand.count > 1 ? i / (stand.count - 1) - 0.5 : 0;
    if (stand.round !== undefined) {
      const way = facing + (i / stand.count) * Math.PI * 2;
      spots.push(at.clone().add(new THREE.Vector3(Math.sin(way), 0, Math.cos(way)).multiplyScalar(stand.round)));
      continue;
    }
    const ahead = (stand.ahead ?? 4) + (stand.along ?? 0) * i;
    // (down a line, each a little to one side and the other: a body thrown on lands clear of the next)
    const aside = stand.along !== undefined ? (i % 2 ? 0.35 : -0.35) : middle * 2 * (stand.across ?? 0);
    spots.push(at.clone().addScaledVector(forward, ahead).addScaledVector(left, aside));
  }
  const aimAhead = stand.round !== undefined ? 3 : (stand.ahead ?? 4) + ((stand.along ?? 0) * (stand.count - 1)) / 2;
  return { spots, aim: at.clone().addScaledVector(forward, aimAhead) };
}

/** The foes risen at `spots`, standing dazed (still, thinking of nothing), each holding `lives[i]` of its life. */
export async function foesAt(lab: Lab, spots: THREE.Vector3[], lives: number[]): Promise<Enemy[]> {
  const kind = foeKind();
  const foes = spots.map((spot) => lab.spawnFoe(kind, spot));
  await lab.until(() => foes.every((foe) => foe.spawning <= 0), RISE_FRAMES, 'the foes never rose');
  foes.forEach((foe, i) => {
    foe.dazed = 999;
    foe.life = lives[i];
  });
  return foes;
}

/** Each foe's hits counted as they land: the last one's damage, the killing hit's once it's dead. */
function countHits(foes: Enemy[]): number[] {
  const last = foes.map(() => 0);
  foes.forEach((foe, i) => {
    const takeDamage = foe.takeDamage.bind(foe);
    foe.takeDamage = (amount, info) => {
      if (foe.alive) last[i] = amount;
      return takeDamage(amount, info);
    };
  });
  return last;
}

/** A body's points as drawn: each joint's place in the world (the head's middle, above its joint) and its size. */
function drawnPoint(joints: Joints, name: (typeof RAGDOLL_POINTS)[number], out: THREE.Vector3): THREE.Vector3 {
  joints[name].getWorldPosition(out);
  if (name !== 'head') return out;
  const scale = joints.head.getWorldScale(new THREE.Vector3()).x;
  const turn = joints.head.getWorldQuaternion(new THREE.Quaternion());
  const up = new THREE.Vector3(0, joints.P.headR * scale, 0).applyQuaternion(turn);
  return out.add(up);
}

/** The worst `worst` and this frame's `amount` of a part, kept if it's worse. */
function worse(worst: Worst, amount: number, part: string, at: number): void {
  if (amount <= worst.amount) return;
  worst.amount = amount;
  worst.part = part;
  worst.at = at;
}

/**
 * How deep a ball of `radius` at `point` is in the floor (m; 0 clear of it): below its own level's, or into a higher
 * level's square through its top or its side, whichever is less (a ball by the dais's step, its middle off it, is in
 * the step only as far as it reaches over the edge).
 */
function depthInFloor(point: THREE.Vector3, radius: number): number {
  const own = groundHeight(point.x, point.z);
  let deepest = own + radius - point.y;
  GROUND_EDGES.forEach((edge, i) => {
    const top = GROUND_LEVELS[i];
    if (top <= own) return;
    const off = Math.hypot(Math.max(0, Math.abs(point.x) - edge), Math.max(0, Math.abs(point.z) - edge));
    if (off >= radius) return;
    const bottom = point.y - Math.sqrt(radius * radius - off * off);
    if (bottom < top) deepest = Math.max(deepest, Math.min(top - bottom, radius - off));
  });
  return deepest;
}

/** How deep a point of size `radius` at `point` is in a prop (m; 0 out of every one). */
function depthInProps(point: THREE.Vector3, radius: number): number {
  let deepest = 0;
  for (const prop of G.arena.obstacles) {
    const reach = prop.r + radius - Math.hypot(point.x - prop.x, point.z - prop.z);
    const below = groundHeight(prop.x, prop.z) + prop.h - (point.y - radius);
    if (reach > 0 && below > 0) deepest = Math.max(deepest, Math.min(reach, below));
  }
  return deepest;
}

/** A fallen body measured as drawn this frame, `since` s after its fall. */
function measureBody(body: Fallen, since: number): void {
  const corpse = body.foe.corpse;
  const ragdoll = corpse?.ragdoll;
  const joints = body.foe.model.joints;
  if (!ragdoll || !joints) return;
  const at = new THREE.Vector3();
  const point = new THREE.Vector3();
  RAGDOLL_BONES.forEach(([from, to], i) => {
    ragdoll.point(RAGDOLL_POINTS.indexOf(from), at);
    const length = at.distanceTo(ragdoll.point(RAGDOLL_POINTS.indexOf(to), point));
    body.bones[i] ??= length;
    worse(body.stretch, Math.abs(length / body.bones[i] - 1), `${from} to ${to}`, since);
  });
  RAGDOLL_POINTS.forEach((name, i) => {
    drawnPoint(joints, name, at);
    if (![at.x, at.y, at.z].every(Number.isFinite)) body.broken = true;
    const radius = ragdoll.radius(i);
    worse(body.under, depthInFloor(at, radius) - UNDER_MOST / 2, name, since);
    worse(body.inProp, depthInProps(at, radius), name, since);
    worse(body.poseOff, at.distanceTo(ragdoll.point(i, point)), name, since);
  });
  const hips = joints.hips.getWorldPosition(at);
  body.highest = Math.max(body.highest, hips.y - groundHeight(hips.x, hips.z));
  if (Math.hypot(hips.x, hips.z) > G.arena.radius + 0.05) body.outside = true;
}

/** One cast at the foes, followed until every body has dissolved: the bodies, each foe's killing hit (0 for one left
 *  standing), and the moments pictured. */
interface Cast {
  bodies: Fallen[];
  killedBy: number[];
  /** the foes left alive */
  standing: number;
  moments: Pictured[];
  canary: { under: boolean; back: boolean; turned: boolean };
  /** with `--trace`, the first body's frames */
  trace: string[];
}

/** A body followed from the frame it fell (`frame` from the press). */
function fallen(foe: Enemy, dealt: number, frame: number): Fallen {
  const joints = foe.model.joints;
  const hips = joints ? joints.hips.getWorldPosition(new THREE.Vector3()) : foe.pos.clone();
  return {
    foe, dealt, fellAt: frame, fling: foe.fling!, from: foe.pos.clone(), heroAt: G.player.pos.clone(),
    swing: swingSeen(),
    early: new THREE.Vector3(),
    torque: foe.fling!.oz * foe.fling!.vx - foe.fling!.ox * foe.fling!.vz, headingAt: NaN, turned: 0,
    standingHips: hips.y - groundHeight(hips.x, hips.z), path: 0, highest: 0, restAt: -1,
    lay: new THREE.Vector3(), ended: false, layHips: 0,
    under: noWorst(), inProp: noWorst(), poseOff: noWorst(), stretch: noWorst(),
    bones: [], outside: false, broken: false,
  };
}

/** the frames over which a body's turn after its fall is read (before the floor's grip takes it); a blow turning it
 *  less than `TURN_FROM` (m²/s) struck it through its middle, and one turned more than `TURN_WRONG` (rad) against
 *  its blow turned the wrong way */
const TURN_FRAMES = 12;
const TURN_FROM = 0.3;
const TURN_WRONG = (5 * Math.PI) / 180;

/** The heading of a body's shoulders, from its right one to its left (rad, as a heading: 0 along +z). */
function shouldersHeading(ragdoll: Ragdoll): number {
  const left = ragdoll.point(RAGDOLL_POINTS.indexOf('shoulderL'), new THREE.Vector3());
  const right = ragdoll.point(RAGDOLL_POINTS.indexOf('shoulderR'), new THREE.Vector3());
  return Math.atan2(left.x - right.x, left.z - right.z);
}

/** An angle as the least turn it is (-π to π). */
const wrapped = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));
const degrees = (angle: number): string => `${((angle * 180) / Math.PI).toFixed(0)}°`;

/** the frames over which a body's way after its fall is read */
const EARLY_FRAMES = 6;

/** What a pass plants and pictures, and its name in the pictures' labels. */
interface PassPlan {
  canary: boolean;
  pictures: boolean;
  trace: boolean;
  label: string;
  /** a body (by the order the bodies fell in) pictured close up, framed on its part, that many frames after its fall */
  close?: CloseUp;
}

/** A body's moment pictured close up (`--close`). */
interface CloseUp {
  body: number;
  frames: number;
  part: (typeof RAGDOLL_POINTS)[number];
  depth: number;
}

/** how far off a close-up's camera stands from the part it's framed on (m) */
const CLOSE_DISTANCE = 1.4;

/** a trace's heading */
const TRACE_HEAD = '  each body thrown hard by its number, a frame a line: each point\'s clearance drawn, '
  + 'its pose\'s error and its point\'s clearance (cm), and ^ where its point touches a prop; '
  + 'still, or its fastest point (m/s)';

/** a point this near a prop touches it (m) */
const TOUCH = 0.01;

/** short names for the points in a trace */
const SHORT: Record<(typeof RAGDOLL_POINTS)[number], string> = {
  spine: 'sp', thighL: 'tL', thighR: 'tR', kneeL: 'kL', kneeR: 'kR', ankleL: 'aL', ankleR: 'aR', chest: 'ch',
  neck: 'nk', head: 'hd', shoulderL: 'sL', shoulderR: 'sR', elbowL: 'eL', elbowR: 'eR', handL: 'wL', handR: 'wR',
};

/** A body's frame as a trace's line: when, whether it's still, and each point's clearance and pose error (cm). */
function traceLine(body: Fallen, since: number): string {
  const ragdoll = body.foe.corpse?.ragdoll;
  const joints = body.foe.model.joints;
  if (!ragdoll || !joints) return '';
  const at = new THREE.Vector3();
  const point = new THREE.Vector3();
  const parts = RAGDOLL_POINTS.map((name, i) => {
    drawnPoint(joints, name, at);
    const radius = ragdoll.radius(i);
    const clear = -depthInFloor(at, radius);
    const off = at.distanceTo(ragdoll.point(i, point));
    const own = -depthInFloor(point, radius);
    const onProp = depthInProps(point, radius + TOUCH) > 0 ? '^' : '';
    return `${SHORT[name]} ${(clear * 100).toFixed(0)}/${(off * 100).toFixed(0)}/${(own * 100).toFixed(0)}${onProp}`;
  });
  const fastest = ragdoll.fastest;
  const moving = ragdoll.asleep ? 'still' : `${SHORT[RAGDOLL_POINTS[fastest.point]]} ${fastest.speed.toFixed(2)}`;
  return `    ${seconds(since)} ${moving}: ${parts.join(' ')}`;
}

/** The skill cast at `foes` and every body followed until it has dissolved. */
async function castAt(lab: Lab, skill: BoundSkill, foes: Enemy[], aim: THREE.Vector3, plan: PassPlan): Promise<Cast> {
  const dealt = countHits(foes);
  const bodies = new Map<Enemy, Fallen>();
  const last = new Map<Enemy, THREE.Vector3>();
  const moments: Pictured[] = [];
  const canary = { under: false, back: false, turned: false };
  const holdFrames = Math.max(1, Math.round(holdFor(skill.def) / frameTime()));
  const pictureFrames = PICTURE_AT.map((at) => Math.round(at / frameTime()));
  let firstFall = -1;
  let pictured = 0;
  const trace: string[] = [];
  await lab.step(SETTLE, () => ({ aim }));
  for (let frame = 0; frame < MOST_FRAMES; frame++) {
    await lab.step(1, () => pressing(skill.key, aim, frame < holdFrames));
    for (const [i, foe] of foes.entries()) {
      if (foe.alive || bodies.has(foe) || !foe.fling) continue;
      const body = fallen(foe, dealt[i], frame);
      bodies.set(foe, body);
      if (plan.canary && !canary.back && foe.corpse?.ragdoll) {
        // (planted: the first body thrown back at the hero, twice as hard as the blow threw it away)
        canary.back = true;
        foe.corpse.ragdoll.throw(-3 * body.fling.vx, 0, -3 * body.fling.vz, body.fling.at);
      }
      if (plan.canary && !canary.turned && Math.abs(body.torque) >= TURN_FROM && foe.corpse?.ragdoll) {
        // (planted: the first body struck off its middle turned back the other way, three times as hard)
        canary.turned = true;
        const { vx, vz, ox, oz } = body.fling;
        foe.corpse.ragdoll.twist(-3 * vx, -3 * vz, ox, oz);
      }
    }
    if (firstFall < 0 && bodies.size) firstFall = frame;
    for (const body of bodies.values()) {
      if (!G.enemies.includes(body.foe)) continue;
      const since = (frame - body.fellAt) * frameTime();
      plantUnder(plan.canary, body, canary, since);
      followBody(body, last, frame);
      measureBody(body, since);
      if (plan.trace) trace.push(`${[...bodies.values()].indexOf(body) + 1} ${traceLine(body, since)}`);
    }
    const close = plan.close && [...bodies.values()][plan.close.body];
    if (plan.close && close && frame - close.fellAt === plan.close.frames) moments.push(pictureClose(lab, close, plan));
    if (plan.pictures && bodies.size && pictureDue(bodies, firstFall, frame, pictured, pictureFrames)) {
      const after = `${seconds(PICTURE_AT[pictured] ?? 0)} after the first fall`;
      const when = pictured < PICTURE_AT.length ? after : 'lying still';
      moments.push(await pictureBodies(lab, [...bodies.values()], `${plan.label}, ${when}`));
      pictured++;
    }
    const gone = foes.every((foe) => !G.enemies.includes(foe));
    const standing = foes.filter((foe) => foe.alive).length;
    if (gone || (frame > holdFrames + 240 && standing === foes.length)) break;
  }
  const killedBy = foes.map((foe, i) => (bodies.has(foe) ? dealt[i] : 0));
  const standing = foes.filter((foe) => foe.alive).length;
  return { bodies: [...bodies.values()], killedBy, standing, moments, canary, trace };
}

/** Whether a picture is due this frame: at each of `frames` after the first fall, then once every body lies still. */
function pictureDue(
  bodies: Map<Enemy, Fallen>, firstFall: number, frame: number, pictured: number, frames: number[],
): boolean {
  if (pictured < frames.length) return frame - firstFall === frames[pictured];
  if (pictured > frames.length) return false;
  return [...bodies.values()].every((body) => body.restAt >= 0 || !G.enemies.includes(body.foe));
}

/** With the canary, the first body put a metre under the floor for a frame, a quarter of a second after its fall. */
function plantUnder(on: boolean, body: Fallen, canary: { under: boolean }, since: number): void {
  if (!on || canary.under || since < 0.25) return;
  canary.under = true;
  body.foe.obj.position.y -= 1;
  body.foe.obj.updateMatrixWorld(true);
}

/** A body's way over its first frames, its path along the ground, and when and where it lay still. */
function followBody(body: Fallen, last: Map<Enemy, THREE.Vector3>, frame: number): void {
  const joints = body.foe.model.joints;
  const corpse = body.foe.corpse;
  if (!joints || !corpse?.ragdoll) return;
  const hips = joints.hips.getWorldPosition(new THREE.Vector3());
  const before = last.get(body.foe);
  if (before) body.path += flat(before, hips);
  last.set(body.foe, hips);
  if (frame - body.fellAt === EARLY_FRAMES) {
    body.early.set(hips.x - body.from.x, 0, hips.z - body.from.z).divideScalar(EARLY_FRAMES * frameTime());
  }
  if (Number.isNaN(body.headingAt)) body.headingAt = shouldersHeading(corpse.ragdoll);
  if (frame - body.fellAt === TURN_FRAMES) body.turned = wrapped(shouldersHeading(corpse.ragdoll) - body.headingAt);
  // (where it lay still, or where it began to dissolve if it never did: a frozen body shatters as it lands)
  const dissolving = body.foe.model.kit.u.uDissolve.value > 0;
  if (body.restAt < 0 && !body.ended && dissolving) {
    body.ended = true;
    body.lay.copy(hips);
  }
  if (body.restAt >= 0 || !corpse.ragdoll.asleep) return;
  body.restAt = (frame - body.fellAt) * frameTime();
  body.lay.copy(hips);
  body.layHips = hips.y - surfaceUnder(hips);
}

/** The height of what lies under `at`: the floor, or the top of a prop it's over. */
function surfaceUnder(at: THREE.Vector3): number {
  let top = groundHeight(at.x, at.z);
  for (const prop of G.arena.obstacles) {
    if (Math.hypot(at.x - prop.x, at.z - prop.z) < prop.r) top = Math.max(top, groundHeight(prop.x, prop.z) + prop.h);
  }
  return top;
}

/** The bodies pictured: the game's view as the player sees it, clipped round them and the hero, and close from the
 *  hero's left and from behind him, framed on where they fell and where they are. */
async function pictureBodies(lab: Lab, bodies: Fallen[], label: string): Promise<Pictured> {
  const points = bodies.flatMap((body) => [body.from.clone(), body.foe.obj.position.clone().setY(1)]);
  points.push(G.player.pos.clone());
  const seen = await lab.screen(label, [], screenArea(points, PICTURE_MARGIN));
  const middle = points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(points.length);
  const spread = Math.max(...points.map((point) => flat(point, middle)));
  middle.y = 0.6;
  const close = lab.capture(['left', 'back'], { at: middle, distance: Math.max(6, spread * 3) });
  return { label, tiles: [...seen.tiles, ...close], notes: [] };
}

/** A body pictured close up as `plan.close` says, from its left, its right and behind the hero, framed on its part. */
function pictureClose(lab: Lab, body: Fallen, plan: PassPlan): Pictured {
  const { part, depth, frames } = plan.close!;
  const at = drawnPoint(body.foe.model.joints!, part, new THREE.Vector3());
  const tiles = lab.capture(['left', 'right', 'back'], { at, distance: CLOSE_DISTANCE });
  const when = seconds(frames * frameTime());
  const deepest = `its ${part} at its deepest, ${centimetres(depth)} under the floor`;
  const label = `${plan.label}, ${deepest}, ${when} after its fall`;
  return { label, tiles, notes: [] };
}

/** The body of `cast` that lay deepest under the floor, as a close-up of it (none where none went under). */
function deepestOf(cast: Cast): CloseUp | null {
  let best: CloseUp | null = null;
  cast.bodies.forEach((body, i) => {
    const depth = body.under.amount + UNDER_MOST / 2;
    if (depth <= 0 || (best && depth <= best.depth)) return;
    const part = body.under.part as CloseUp['part'];
    best = { body: i, frames: Math.round(body.under.at / frameTime()), part, depth };
  });
  return best;
}

/** The skill's casts, both passes. */
interface SkillRun {
  skill: BoundSkill;
  hard: Cast;
  bare: Cast;
}

/** The fixture with the command's own spot and facing where it doesn't say. */
function fixtureOf(options: DeathOptions): Fixture {
  const facing = options.fixture.facing ?? (FACING * Math.PI) / 180;
  return { ...options.fixture, at: options.fixture.at ?? SPOT, facing };
}

/** A pass's cast and the skill it was. */
interface Pass {
  skill: BoundSkill;
  cast: Cast;
}

/** The way the swing the player sees goes (+1 from the hero's right to his left): the newest blade trail's, as it's
 *  drawn (the model's own `swing` for one with no trail). */
function swingSeen(): number {
  let way: number | null = null;
  G.scene.traverse((object) => {
    const material = (object as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
    const sweep = material?.uniforms?.uDir;
    if (sweep && material.uniforms.uStart) way = sweep.value as number;
  });
  return way ?? G.player.model.swing ?? 1;
}

/** The skill cast at foes holding `lives` (1 where it says none), on a fresh set-up. */
async function onePass(
  lab: Lab, options: DeathOptions, wanted: string, lives: number[], hard: boolean, close?: CloseUp,
): Promise<Pass> {
  G.arena.restoreProps();
  await lab.setup(fixtureOf(options));
  const hero = G.player;
  bindKnown(wanted);
  const skill = skillNamed(wanted);
  const stand = STANDS[skill.def.impl] ?? { count: 3, ahead: 5, across: 1 };
  hero.cooldowns.clear();
  hero.energy = hero.stats.maxEnergy;
  // (no crits: the second pass's foes hold 0.8 of what the first dealt each, and a first hit's crit left them more
  // life than a plain hit takes, "0 fell" by the draws of skills measured before; a fall is a hit's, crit or not)
  hero.stats.crit = 0;
  const { spots, aim } = placesFor(stand, hero.pos, hero.facing);
  const foes = await foesAt(lab, spots, spots.map((_, i) => lives[i] ?? 1));
  const label = `${skill.def.name}, ${hard ? 'a hair from death' : 'with little to spare'}`;
  const plan = {
    canary: options.canary && hard,
    pictures: options.pictures && hard,
    trace: Boolean(options.trace) && hard,
    label,
    close,
  };
  const cast = await castAt(lab, skill, foes, aim, plan);
  return { skill, cast };
}

/** The hero's skills that deal damage, by their behaviours. */
function damagingSkills(): string[] {
  const impls: string[] = [];
  for (const key of ['mouse0', 'mouse2', '1', '2', '3', '4'] as const) {
    const def = G.player.skillAt(key)?.def;
    if (def && STANDS[def.impl] && !impls.includes(def.impl)) impls.push(def.impl);
  }
  return impls;
}

/** `lab death`: each skill's kills followed as they fall; a problem for each thing a body did that a body can't. */
export async function death(lab: Lab, options: DeathOptions): Promise<Report> {
  await lab.setup(fixtureOf(options));
  const wanted = options.skills.length ? options.skills : damagingSkills();
  const compiledBefore = programsCompiledInGame();
  const lateBefore = lateCompiles.length;
  const lines: string[] = [`${G.player.cls.id}, ${foeKind()}s, ${G.arena.biome}`];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  let canaries: Canaries = {
    under: false, back: false, turned: false, underCaught: false, backCaught: false, turnCaught: false,
  };
  for (const name of wanted) {
    const hard = await onePass(lab, options, name, [], true);
    const lives = hard.cast.killedBy.map((dealt) => Math.max(1, dealt * BARE_SHARE));
    const bare = await onePass(lab, options, name, lives, false);
    const run: SkillRun = { skill: hard.skill, hard: hard.cast, bare: bare.cast };
    const judged = judge(run, options.canary);
    lines.push(...judged.lines);
    if (hard.cast.trace.length) lines.push(TRACE_HEAD, ...hard.cast.trace);
    problems.push(...judged.problems);
    moments.push(...hard.cast.moments);
    if (options.close) moments.push(...await closeUp(lab, options, name, hard.cast, bare.cast, lives));
    if (options.canary) canaries = mergeCanary(canaries, hard.cast, judged);
  }
  const compiled = programsCompiledInGame() - compiledBefore;
  lines.push(`shaders compiled meanwhile: ${compiled}`);
  for (const late of lateCompiles.slice(lateBefore)) lines.push(`  ${late}`);
  if (compiled > 0) problems.push(`${compiled} shaders compiled as the bodies fell`);
  if (!options.canary) return { text: lines.join('\n'), problems, moments };
  return canaryReport(lines, canaries, moments);
}

/** The deepest body under the floor of a skill's two passes pictured close up, its pass cast again as it was. */
async function closeUp(
  lab: Lab, options: DeathOptions, name: string, hard: Cast, bare: Cast, lives: number[],
): Promise<Pictured[]> {
  const inHard = deepestOf(hard);
  const inBare = deepestOf(bare);
  const deeper = !inBare || (inHard && inHard.depth >= inBare.depth) ? inHard : inBare;
  if (!deeper) return [];
  const again = deeper === inHard
    ? await onePass(lab, { ...options, pictures: false, canary: false }, name, [], true, deeper)
    : await onePass(lab, { ...options, pictures: false, canary: false }, name, lives, false, deeper);
  return again.cast.moments;
}

/** What the canary's plants came to, over the skills so far. */
interface Canaries {
  under: boolean;
  back: boolean;
  turned: boolean;
  underCaught: boolean;
  backCaught: boolean;
  turnCaught: boolean;
}

/** The canary's plants so far, with a skill's. */
function mergeCanary(was: Canaries, cast: Cast, judged: Judged): Canaries {
  return {
    under: was.under || cast.canary.under,
    back: was.back || cast.canary.back,
    turned: was.turned || cast.canary.turned,
    underCaught: was.underCaught || judged.caughtUnder,
    backCaught: was.backCaught || judged.caughtBack,
    turnCaught: was.turnCaught || judged.caughtTurn,
  };
}

/** With the canary, its plants caught or missed: missed ones are the problems (what the checks caught isn't). */
function canaryReport(lines: string[], canaries: Canaries, moments: Pictured[]): Report {
  const missed: string[] = [];
  if (!canaries.under) missed.push('the canary never put a body under the floor');
  else if (!canaries.underCaught) missed.push('the canary\'s body under the floor went unseen');
  if (!canaries.back) missed.push('the canary never threw a body back');
  else if (!canaries.backCaught) missed.push('the canary\'s body thrown back at the hero went unseen');
  if (!canaries.turned) missed.push('the canary never turned a body against its blow');
  else if (!canaries.turnCaught) missed.push('the canary\'s body turned against its blow went unseen');
  const verdict = (caught: boolean) => (caught ? 'caught' : 'missed');
  lines.push(`canary: under the floor ${verdict(canaries.underCaught)}, thrown back ${verdict(canaries.backCaught)}, `
    + `turned back ${verdict(canaries.turnCaught)}`);
  return { text: lines.join('\n'), problems: missed, moments };
}

/** A skill's lines and problems, and whether it caught the canary's plants. */
interface Judged {
  lines: string[];
  problems: string[];
  caughtUnder: boolean;
  caughtBack: boolean;
  caughtTurn: boolean;
}

const speedOf = (fling: Fling): number => Math.hypot(fling.vx, fling.vy, fling.vz);
const sumOf = (values: number[]): number => values.reduce((total, each) => total + each, 0);
const mean = (values: number[]): number => (values.length ? sumOf(values) / values.length : 0);
const range = (values: number[], shown: (value: number) => string): string => (values.length
  ? `${shown(mean(values))} (${shown(Math.min(...values))} to ${shown(Math.max(...values))})` : 'none');

/** The pass's bodies as a line: how hard each was thrown, how far it flew and how high, when it lay still. */
function passLine(name: string, cast: Cast): string {
  const bodies = cast.bodies;
  const thrown = range(bodies.map((body) => speedOf(body.fling)), (speed) => `${speed.toFixed(1)} m/s`);
  const lay = (body: Fallen) => (body.restAt >= 0 || body.ended ? body.lay : body.from);
  const flew = range(bodies.map((body) => flat(body.from, lay(body))), metres);
  const high = range(bodies.map((body) => body.highest), metres);
  const rest = bodies.filter((body) => body.restAt >= 0).map((body) => body.restAt);
  const styles = [...new Set(bodies.map((body) => body.fling.style))].join(', ');
  const offMiddle = bodies.filter((body) => Math.abs(body.torque) >= TURN_FROM);
  const turns = offMiddle.map((body) => body.turned * Math.sign(body.torque));
  const turned = offMiddle.length ? `, turned ${range(turns, degrees)} its blow's way (${offMiddle.length} struck off `
    + 'its middle)' : '';
  return `  ${name}: ${bodies.length} fell (${styles}), ${cast.standing} left standing; `
    + `thrown ${thrown}, flew ${flew}, `
    + `its hips up to ${high}, still after ${range(rest, seconds)} (${rest.length} of ${bodies.length})${turned}`;
}

/** Whether a body struck off its middle turned the way its blow turns it. */
function turnProblems(body: Fallen): string[] {
  if (Math.abs(body.torque) < TURN_FROM) return [];
  const turned = body.turned * Math.sign(body.torque);
  if (turned >= -TURN_WRONG) return [];
  return [`a body struck off its middle turned against its blow (${degrees(-turned)})`];
}

/** Whether the body went the way its blow drove it: away from the hero (round the storm for a storm's), along the
 *  swing for a sword's. */
function wayProblems(run: SkillRun, cast: Cast, body: Fallen): string[] {
  const impl = run.skill.def.impl;
  const hero = body.heroAt;
  const out = new THREE.Vector3(body.from.x - hero.x, 0, body.from.z - hero.z).normalize();
  const way = body.early;
  if (way.length() < 0.3 || WHIRLS.has(impl)) return [];
  const problems: string[] = [];
  const speed = way.length().toFixed(1);
  if (ELSEWHERE.has(impl)) {
    const thrown = new THREE.Vector3(body.fling.vx, 0, body.fling.vz);
    if (way.dot(thrown) <= 0) problems.push(`a body went against its throw (${speed} m/s)`);
    return problems;
  }
  if (way.dot(out) <= 0) problems.push(`a body went back towards the hero (${speed} m/s)`);
  if (SWINGS.has(impl)) {
    const round = way.x * out.z - way.z * out.x;
    if (Math.sign(round) !== Math.sign(body.swing)) problems.push('a body went against the swing');
  }
  return problems;
}

/** Whether the storm's body went round it: its path well over its way from where it fell, and up. */
function whirlProblems(run: SkillRun, body: Fallen): string[] {
  if (!WHIRLS.has(run.skill.def.impl)) return [];
  const straight = flat(body.from, body.restAt >= 0 || body.ended ? body.lay : body.foe.obj.position);
  if (body.path >= WHIRL_PATH * Math.max(1, straight) && body.highest > 1) return [];
  return [`a body the storm killed didn't go round it (its path ${metres(body.path)}, up to ${metres(body.highest)})`];
}

/** What a body did that a body can't, as problems. */
function bodyProblems(body: Fallen): string[] {
  const problems: string[] = [];
  const at = (worst: Worst) => `the ${worst.part}, ${seconds(worst.at)} after its fall`;
  if (body.broken) problems.push('a body\'s place went NaN');
  const under = body.under.amount + UNDER_MOST / 2;
  if (under > UNDER_MOST) problems.push(`a body ${centimetres(under)} under the floor (${at(body.under)})`);
  const into = body.inProp.amount;
  if (into > PROP_MOST) problems.push(`a body ${centimetres(into)} into a prop (${at(body.inProp)})`);
  const off = body.poseOff.amount;
  if (off > POSE_MOST) problems.push(`a body posed ${centimetres(off)} off its points (${at(body.poseOff)})`);
  const stretched = body.stretch.amount;
  if (stretched > STRETCH_MOST) problems.push(`a bone stretched ${percentOf(stretched)} (${at(body.stretch)})`);
  if (body.outside) problems.push('a body past the arena\'s wall');
  const shattered = body.fling.style === 'frozen';
  if (!shattered && body.restAt >= 0 && body.layHips > body.standingHips * LYING_MOST) {
    problems.push(`a body lay with its hips ${metres(body.layHips)} up (standing, ${metres(body.standingHips)})`);
  }
  return problems;
}

/** A skill's two passes judged: its lines, and a problem for each thing its bodies did that they mustn't. */
function judge(run: SkillRun, canary: boolean): Judged {
  const { skill, hard, bare } = run;
  const name = `${skill.def.name} (${skill.key})`;
  const lines = [name, passLine('a hair from death', hard), passLine('with little to spare', bare)];
  const all = [...hard.bodies, ...bare.bodies];
  const worstUnder = Math.max(0, ...all.map((body) => body.under.amount + UNDER_MOST / 2));
  const worstPose = Math.max(0, ...all.map((body) => body.poseOff.amount));
  const worstStretch = Math.max(0, ...all.map((body) => body.stretch.amount));
  lines.push(`  at the worst: under the floor ${centimetres(worstUnder)}, `
    + `the pose off its points ${centimetres(worstPose)}, `
    + `a bone stretched ${percentOf(worstStretch)}`);
  const found = new Set<string>();
  if (!hard.bodies.length) found.add('nothing fell');
  for (const cast of [hard, bare]) {
    for (const body of cast.bodies) {
      const each = [
        ...bodyProblems(body), ...wayProblems(run, cast, body), ...whirlProblems(run, body), ...turnProblems(body),
      ];
      for (const problem of each) found.add(problem);
    }
  }
  const hardThrow = mean(hard.bodies.map((body) => speedOf(body.fling)));
  const bareThrow = mean(bare.bodies.map((body) => speedOf(body.fling)));
  if (hard.bodies.length && bare.bodies.length && bareThrow >= hardThrow) {
    const speeds = `${bareThrow.toFixed(1)} m/s against ${hardThrow.toFixed(1)}`;
    found.add(`killed with little to spare, they were thrown as hard (${speeds})`);
  }
  const problems = [...found].map((problem) => `${skill.def.name}: ${problem}`);
  for (const problem of found) lines.push(`  ! ${problem}`);
  const caughtUnder = canary && [...found].some((problem) => problem.includes('under the floor'));
  const wrongWays = ['back towards the hero', 'against its throw'];
  const wrongWay = (problem: string) => wrongWays.some((way) => problem.includes(way));
  const caughtBack = canary && [...found].some(wrongWay);
  const caughtTurn = canary && [...found].some((problem) => problem.includes('turned against its blow'));
  return { lines, problems: canary ? [] : problems, caughtUnder, caughtBack, caughtTurn };
}
