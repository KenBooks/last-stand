// A body gone limp: a fallen foe's rig as points joined by its bones (verlet, after Jakobsen's), thrown by the blow
// that killed it and falling under gravity onto the floor, onto and against the props and against the arena's wall.
// Each frame the rig's joints are posed from the points, so whatever the body wears falls with it. Every foe but the
// training dummy is built on the shared rig (models/rig.ts), so one body serves them all.
import * as THREE from 'three';
import { G } from '../state';
import { groundHeight, groundUnder } from '../world/ground';
import type { Joints } from './models/rig';
import type { Obstacle } from '../types';

/** Something moving the fallen while it lasts (a storm's whirl, a beam's push): adds the acceleration it gives a point
 *  at `p` moving at `v` into `out` (m/s²), and says whether it reached it. */
export interface Field { accel(p: THREE.Vector3, v: THREE.Vector3, out: THREE.Vector3): boolean }

/** the rig's joints the points are at, in this order (the head's is its middle, above its joint). The trunk bends off
 *  the pelvis at the spine's joint, as the rig does: the pelvis is the spine's point and the thighs', held at their
 *  lengths, so its turn is theirs. (With a point at the hips' joint instead, 2 cm over the thighs', the pelvis rolled
 *  round its thighs as the trunk bent, and drawn by the trunk, a body folded at the waist lay 5 cm into the floor.) */
const POINTS = ['spine', 'thighL', 'thighR', 'kneeL', 'kneeR', 'ankleL', 'ankleR', 'chest', 'neck', 'head',
  'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'handL', 'handR'] as const;
type Point = typeof POINTS[number];
/** the points' joints in order, for what measures the body (tools/lab `death`) */
export const RAGDOLL_POINTS: readonly Point[] = POINTS;
const N = POINTS.length;
const I = Object.fromEntries(POINTS.map((name, i) => [name, i])) as Record<Point, number>;

/** the joints posed from the points, parents first */
const POSED = ['hips', 'spine', 'chest', 'neck', 'head', 'thighL', 'kneeL', 'ankleL', 'thighR', 'kneeR', 'ankleR',
  'shoulderL', 'elbowL', 'handL', 'shoulderR', 'elbowR', 'handR'] as const;
type Posed = typeof POSED[number];

/** the step (s): fixed, so a fall comes out the same at any frame rate; at most this many a frame (a stall drops time).
 *  (At 120 a second, a hard landing stretched a leg's bones 4% and put a drawn foot 5 cm into the floor.) */
const STEP = 1 / 240, MOST_STEPS = 12;
/** gravity (m/s²): over the Earth's, as foes a head taller than a man falling at 9.8 read as floating */
export const GRAVITY = 15;
/** passes over the joins a step (at 4, a hard landing stretched a leg's bones 6%); fewer in the air, clear of anything
 *  it could strike this step (a body's own swing stretches it little: the passes are a body's cost, and a crowd killed
 *  at once is most of it in the air), clear meaning no point nearer the floor than `CLEAR` (m) and no prop near */
const PASSES = 6, FLYING_PASSES = 3, CLEAR = 0.1;
/** the floor's grip: the speed it takes from a point sliding on it a second, as a share of gravity (Coulomb's), and a
 *  little more by its speed (rolling); how much of its speed into the floor a point keeps, bouncing off it (at 0.55, a
 *  body Bull Rush threw slid 5 m on, as on ice) */
const GRIP = 0.8, ROLL = 1.5, BOUNCE = 0.22;
/** the air's drag, the share of the speed it takes a second */
const DRAG = 0.12;
/** how fast a body's limbs stop swinging on their own once its trunk lies on something: the share of the speeds
 *  between each bone's ends a second (a joint's own friction; the air alone left an arm hanging from a shoulder on a
 *  rock swinging for five seconds, and the body never lay still) */
const LIMP = 5;
/** a blow off a body's middle turns it about its upright: this share of the turn it would give the body held rigid
 *  (the rest lost in its give), at most `MOST_TURN` (rad/s); and the part it struck takes this much more of its throw,
 *  within `KICK_REACH` of where it landed (m at a man's size), so an arm shot is knocked back */
const TWIST = 0.15, MOST_TURN = 7, KICK = 0.6, KICK_REACH = 0.3;
/** a body is still once no point has moved faster than this (m/s) from frame to frame for this long (s) (read by the
 *  step, the joins' corrections back and forth within it counted as speed, and a body lying still never was) */
const STILL = 0.15, STILL_FOR = 0.3;
/** a point running into a step's riser this far under the step's top is held back by it (m): less is stepped over */
const RISER = 0.06;

/** How each point is weighted (inverse mass: the trunk's heavier, so the limbs flail round it) and its size, as a share
 *  of the rig's proportions (models/rig.ts `Proportions`). */
const LIGHT = 1, TRUNK = 0.4, HEAD = 0.7;

/** Bones: joins kept at their length. */
const BONES: [Point, Point][] = [
  ['spine', 'thighL'], ['spine', 'thighR'], ['thighL', 'thighR'], ['thighL', 'kneeL'], ['kneeL', 'ankleL'],
  ['thighR', 'kneeR'], ['kneeR', 'ankleR'], ['spine', 'chest'], ['chest', 'neck'], ['neck', 'head'],
  ['chest', 'shoulderL'], ['chest', 'shoulderR'], ['shoulderL', 'shoulderR'], ['neck', 'shoulderL'],
  ['neck', 'shoulderR'], ['shoulderL', 'elbowL'], ['elbowL', 'handL'], ['shoulderR', 'elbowR'], ['elbowR', 'handR'],
];
/** Braces: joins kept within shares of their length at the fall, so the trunk bends and twists only so far, and the
 *  head on its neck. */
const BRACES: [Point, Point, number, number][] = [
  ['thighL', 'chest', 0.85, 1.05], ['thighR', 'chest', 0.85, 1.05],
  ['shoulderL', 'spine', 0.85, 1.05], ['shoulderR', 'spine', 0.85, 1.05],
  ['thighL', 'shoulderR', 0.85, 1.08], ['thighR', 'shoulderL', 0.85, 1.08],
  ['head', 'shoulderL', 0.8, 1.1], ['head', 'shoulderR', 0.8, 1.1], ['head', 'chest', 0.85, 1.02],
];
/** Limbs folding no further than a body's (the hip to the ankle, the shoulder to the hand: their least reach as a
 *  share of the limb's whole length), and the knees kept apart (a share of the hips' width). */
const FOLDS: [Point, Point, Point, number][] = [
  ['thighL', 'kneeL', 'ankleL', 0.35], ['thighR', 'kneeR', 'ankleR', 0.35],
  ['shoulderL', 'elbowL', 'handL', 0.3], ['shoulderR', 'elbowR', 'handR', 0.3],
];
const KNEES_APART = 0.6;
/** how far a knee may go behind the line from its hip to its ankle before it's put back (m) */
const HINGE_SLACK = 0.005;
/** the most a knee is put forward a pass (m): put back at once from far behind its line (a body dropped onto its knees,
 *  the hips coming down past them), the shin's bone pulled its ankle after it at 44 m/s and the leg flew up to 1.2 m,
 *  stretched 26 to 39% (`lab death`, Hailfletch's kills, #259) */
const HINGE_STEP = 0.01;
/** a hip folds the thigh up to the trunk no closer than this angle between them (rad) */
const HIP_FOLD = 0.9;

interface Join { a: number; b: number; min: number; max: number }

/** The bones' points by name, for what measures the body (tools/lab `death`: how far each is stretched). */
export const RAGDOLL_BONES: readonly (readonly [Point, Point])[] = BONES;

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _v = new THREE.Vector3(), _acc = new THREE.Vector3(), _p = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Quaternion();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _f = new THREE.Vector3();

/** Lengths, as `Math.hypot` gives them, for what runs for every point every pass (hypot is several times slower). */
const length2 = (x: number, z: number): number => Math.sqrt(x * x + z * z);
const length3 = (x: number, y: number, z: number): number => Math.sqrt(x * x + y * y + z * z);

/** The rotation of a frame whose up is `up` and whose left (+x, the rig's) is `left` as near as square to it. */
function frameOf(up: THREE.Vector3, left: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
  _y.copy(up).normalize();
  _x.copy(left).addScaledVector(_y, -left.dot(_y));
  if (_x.lengthSq() < 1e-10) _x.set(1, 0, 0).addScaledVector(_y, -_y.x);
  _x.normalize();
  _z.crossVectors(_x, _y);
  return out.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
}

/** The rotation of a frame whose left (+x) is `left` and whose up is `up` as near as square to it. */
function frameAcross(left: THREE.Vector3, up: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
  _x.copy(left).normalize();
  _y.copy(up).addScaledVector(_x, -up.dot(_x));
  if (_y.lengthSq() < 1e-10) _y.set(0, 1, 0).addScaledVector(_x, -_x.y);
  _y.normalize();
  _z.crossVectors(_x, _y);
  return out.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
}

export interface RagdollOpts {
  /** frozen stiff: every point held where it is against every other, the body falling as one piece */
  stiff?: boolean;
}

/** A fallen body's points, joins and pose. */
export class Ragdoll {
  /** the points: where each is and where it was a step ago (verlet), its inverse mass and size (m) */
  private readonly p = new Float64Array(N * 3);
  private readonly q = new Float64Array(N * 3);
  /** where each was at the last frame's end */
  private readonly framed = new Float64Array(N * 3);
  private readonly w = new Float64Array(N);
  private readonly r = new Float64Array(N);
  /** each point's height on the body as it fell, the feet 0 and the top 1 (where a blow lands), the feet's height and
   *  the body's then (m), and the rig's size against a man's */
  readonly heights = new Float64Array(N);
  private low = 0;
  private tall = 1;
  private readonly size: number;
  private readonly joins: Join[] = [];
  /** the hinges' least reach, each limb's whole length (FOLDS) */
  private readonly folds: { a: number; mid: number; b: number; min: number }[] = [];
  private kneesApart = 0;
  private hipFold: { thigh: number; min: number }[] = [];
  /** the joints' turn in the world as it fell, the trunk's frames then and each limb's way then */
  private readonly q0 = new Map<Posed, THREE.Quaternion>();
  private readonly hips0Inv = new THREE.Quaternion();
  private readonly chest0Inv = new THREE.Quaternion();
  private readonly way0 = new Map<Posed, THREE.Vector3>();
  /** each posed joint's parent among the posed (none for the hips, whose parent is the body) */
  private readonly parentOf = new Map<Posed, Posed | undefined>();
  /** the joints' turn in the world this frame, the trunk's turns since the fall, a limb's and the root's */
  private readonly world = new Map<Posed, THREE.Quaternion>();
  private readonly dHips = new THREE.Quaternion();
  private readonly dChest = new THREE.Quaternion();
  /** where the hips' joint was from the middle between the thighs' points at the fall, and the spine's joint from it
   *  and the chest's from that (the world's axes) */
  private readonly hipsFromMiddle = new THREE.Vector3();
  private readonly spineFromHips = new THREE.Vector3();
  private readonly chestFromSpine = new THREE.Vector3();
  /** each shoulder's point from the chest's at the fall (the world's axes, left then right), and each arm's bones'
   *  lengths (the upper arm, the forearm) */
  private readonly shoulderFromChest = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly armLengths: [number, number][] = [];
  /** the chest's joint, a shoulder's and an elbow's as drawn this frame (`pose`) */
  private readonly chestAt = new THREE.Vector3();
  private readonly jointAt = new THREE.Vector3();
  private readonly turn = new THREE.Quaternion();
  private readonly rootTurn = new THREE.Quaternion();
  private readonly hipsAt = new THREE.Vector3();
  private left = 0;
  private stillFor = 0;
  /** whether its trunk struck something this step (it lies, and its limbs go limp) */
  private lying = false;
  /** whether it has been posed since it fell asleep */
  private posedAsleep = false;
  /** asleep: still, and stepped no more until something moves it */
  asleep = false;
  /** whether a field held it this frame (a storm whirling it) */
  held = false;
  /** the point that moved fastest from the last frame to this one, and how fast (m/s): what keeps it awake */
  fastest = { point: 0, speed: 0 };
  /** the hardest landing since it was last read (m/s into the floor) */
  impact = 0;
  /** the props near enough to be met this frame */
  private near: Obstacle[] = [];

  constructor(private readonly j: Joints, opts: RagdollOpts = {}) {
    j.root.updateWorldMatrix(true, true);
    const P = j.P, scale = j.hips.getWorldScale(_p).x;
    this.size = scale;
    const size: Record<Point, number> = {
      spine: P.hipW * 0.6, thighL: P.thighR, thighR: P.thighR, kneeL: P.shinR * 1.1, kneeR: P.shinR * 1.1,
      ankleL: P.shinR * 1.2, ankleR: P.shinR * 1.2, chest: P.chestD, neck: P.headR * 0.5, head: P.headR,
      shoulderL: P.upperR * 1.2, shoulderR: P.upperR * 1.2, elbowL: P.foreR, elbowR: P.foreR, handL: P.handR,
      handR: P.handR,
    };
    const weight: Record<Point, number> = {
      spine: TRUNK, thighL: TRUNK, thighR: TRUNK, chest: TRUNK, neck: TRUNK, shoulderL: TRUNK, shoulderR: TRUNK,
      head: HEAD, kneeL: LIGHT, kneeR: LIGHT, ankleL: LIGHT, ankleR: LIGHT, elbowL: LIGHT, elbowR: LIGHT,
      handL: LIGHT, handR: LIGHT,
    };
    for (const name of POINTS) {
      const i = I[name];
      const at = j[name].getWorldPosition(_p);
      if (name === 'head') at.add(_a.set(0, P.headR * j.head.getWorldScale(_b).x, 0).applyQuaternion(j.head.getWorldQuaternion(_q)));
      this.set(i, at);
      this.q.set(this.p.subarray(i * 3, i * 3 + 3), i * 3);
      this.w[i] = weight[name];
      this.r[i] = Math.max(0.03, size[name] * scale);
    }
    for (const name of POSED) {
      this.q0.set(name, j[name].getWorldQuaternion(new THREE.Quaternion()));
      this.world.set(name, new THREE.Quaternion());
      this.parentOf.set(name, POSED.find((other) => j[other] === j[name].parent));
    }
    this.trunkFrames(this.hips0Inv, this.chest0Inv);
    this.hips0Inv.invert();
    this.chest0Inv.invert();
    const spine = j.spine.getWorldPosition(new THREE.Vector3());
    const hipsJoint = j.hips.getWorldPosition(new THREE.Vector3());
    this.hipsFromMiddle.copy(hipsJoint).sub(this.middleOfHips(_b));
    this.spineFromHips.copy(spine).sub(hipsJoint);
    this.chestFromSpine.copy(this.point(I.chest, _a)).sub(spine);
    for (const [side, [shoulder, elbow, hand]] of ARMS.entries()) {
      this.shoulderFromChest[side].copy(this.point(I[shoulder], _b)).sub(this.point(I.chest, _a));
      this.armLengths.push([this.between(I[shoulder], I[elbow], _c).length(), this.between(I[elbow], I[hand], _c).length()]);
    }
    const ways: [Posed, Point, Point][] = [
      ['neck', 'neck', 'head'], ['thighL', 'thighL', 'kneeL'], ['kneeL', 'kneeL', 'ankleL'],
      ['thighR', 'thighR', 'kneeR'], ['kneeR', 'kneeR', 'ankleR'], ['shoulderL', 'shoulderL', 'elbowL'],
      ['elbowL', 'elbowL', 'handL'], ['shoulderR', 'shoulderR', 'elbowR'], ['elbowR', 'elbowR', 'handR'],
    ];
    for (const [joint, from, to] of ways) this.way0.set(joint, this.between(I[from], I[to], new THREE.Vector3()));
    this.joinUp(opts.stiff ?? false);
    this.framed.set(this.p);
    let low = Infinity, high = -Infinity;
    for (let i = 0; i < N; i++) { low = Math.min(low, this.p[i * 3 + 1] - this.r[i]); high = Math.max(high, this.p[i * 3 + 1] + this.r[i]); }
    this.low = low;
    this.tall = Math.max(0.1, high - low);
    for (let i = 0; i < N; i++) this.heights[i] = (this.p[i * 3 + 1] - low) / this.tall;
  }

  /** The joins: the bones, the braces, the limbs' folds; frozen stiff, every point to every other. */
  private joinUp(stiff: boolean): void {
    const length = (a: number, b: number) => this.between(a, b, _a).length();
    const fixed = (a: number, b: number) => { const d = length(a, b); this.joins.push({ a, b, min: d, max: d }); };
    if (stiff) {
      for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) fixed(a, b);
      return;
    }
    for (const [a, b] of BONES) fixed(I[a], I[b]);
    for (const [a, b, lo, hi] of BRACES) {
      const d = length(I[a], I[b]);
      this.joins.push({ a: I[a], b: I[b], min: d * lo, max: d * hi });
    }
    for (const [a, mid, b, share] of FOLDS) {
      const whole = length(I[a], I[mid]) + length(I[mid], I[b]);
      this.folds.push({ a: I[a], mid: I[mid], b: I[b], min: whole * share });
    }
    this.kneesApart = length(I.thighL, I.thighR) * KNEES_APART;
    for (const [thigh, knee] of [['thighL', 'kneeL'], ['thighR', 'kneeR']] as const) {
      const trunk = length(I[thigh], I.chest), leg = length(I[thigh], I[knee]);
      this.hipFold.push({ thigh: I[knee], min: Math.sqrt(trunk * trunk + leg * leg - 2 * trunk * leg * Math.cos(HIP_FOLD)) });
    }
  }

  private set(i: number, v: THREE.Vector3): void { this.p[i * 3] = v.x; this.p[i * 3 + 1] = v.y; this.p[i * 3 + 2] = v.z; }
  /** where point `i` is */
  point(i: number, out: THREE.Vector3): THREE.Vector3 { return out.set(this.p[i * 3], this.p[i * 3 + 1], this.p[i * 3 + 2]); }
  /** point `i`'s velocity (m/s) */
  velocity(i: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.p[i * 3] - this.q[i * 3], this.p[i * 3 + 1] - this.q[i * 3 + 1], this.p[i * 3 + 2] - this.q[i * 3 + 2]).divideScalar(STEP);
  }
  private between(a: number, b: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.p[b * 3] - this.p[a * 3], this.p[b * 3 + 1] - this.p[a * 3 + 1], this.p[b * 3 + 2] - this.p[a * 3 + 2]);
  }
  get count(): number { return N; }
  /** where the hips are (between the thighs' points), which the body is placed by */
  hips(out: THREE.Vector3): THREE.Vector3 { return this.middleOfHips(out); }
  /** the size of point `i` (m) */
  radius(i: number): number { return this.r[i]; }

  /** Speed added to point `i` (m/s), waking the body. */
  push(i: number, vx: number, vy: number, vz: number): void {
    this.q[i * 3] -= vx * STEP; this.q[i * 3 + 1] -= vy * STEP; this.q[i * 3 + 2] -= vz * STEP;
    this.asleep = false;
    this.stillFor = 0;
  }

  /** The whole body set going at (`vx`, `vy`, `vz`) m/s, each point keeping its own way about the body's (its turn,
   *  its limbs' swing), waking it. */
  drive(vx: number, vy: number, vz: number): void {
    let mx = 0, my = 0, mz = 0;
    for (let i = 0; i < N; i++) {
      this.velocity(i, _a);
      mx += _a.x / N; my += _a.y / N; mz += _a.z / N;
    }
    for (let i = 0; i < N; i++) this.push(i, vx - mx, vy - my, vz - mz);
  }

  /** Speed added to the whole body, each point by its height's nearness to `at` (0 the feet, 1 the top): a blow
   *  lands hardest where it strikes, so a body struck high topples over its feet. */
  throw(vx: number, vy: number, vz: number, at: number): void {
    for (let i = 0; i < N; i++) {
      const k = 0.4 + 0.6 * Math.exp(-(((this.heights[i] - at) / 0.35) ** 2));
      this.push(i, vx * k, vy * k, vz * k);
    }
  }

  /**
   * A blow's throw (`throw`'s), landing `ox`, `oz` across the body from its middle (m; both 0: through it): off its
   * middle it turns the body about its upright (`twist`) and knocks the part it struck on (`kick`), so a body shot in
   * the shoulder spins away from the shot.
   */
  strike(vx: number, vy: number, vz: number, at: number, ox: number, oz: number): void {
    this.throw(vx, vy, vz, at);
    if (ox === 0 && oz === 0) return;
    this.twist(vx, vz, ox, oz);
    this.kick(vx, vy, vz, at, ox, oz);
  }

  /** The body turned about its upright through its middle by a blow driving it at (`vx`, `vz`) m/s, landing `ox`, `oz`
   *  from its middle: by the turn the blow gives the body held rigid (its lever across the body over the body's own
   *  inertia about its upright), a share of it. Its momentum is kept. */
  twist(vx: number, vz: number, ox: number, oz: number): void {
    const p = this.p, w = this.w;
    let mass = 0, cx = 0, cz = 0;
    for (let i = 0; i < N; i++) {
      mass += 1 / w[i];
      cx += p[i * 3] / w[i];
      cz += p[i * 3 + 2] / w[i];
    }
    cx /= mass;
    cz /= mass;
    let inertia = 0;
    for (let i = 0; i < N; i++) inertia += ((p[i * 3] - cx) ** 2 + (p[i * 3 + 2] - cz) ** 2) / w[i];
    // (the blow's momentum about the upright through the middle, over the body's inertia about it: its turn, rad/s)
    const turn = (TWIST * (oz * vx - ox * vz) * mass) / Math.max(inertia, 1e-4);
    const spin = Math.max(-MOST_TURN, Math.min(MOST_TURN, turn));
    for (let i = 0; i < N; i++) this.push(i, spin * (p[i * 3 + 2] - cz), 0, -spin * (p[i * 3] - cx));
  }

  /** The part of the body a blow landed on (`at` up it, `ox`, `oz` across it from its middle) given `KICK` more of its
   *  throw, the rest of the body that much less (its momentum kept). */
  private kick(vx: number, vy: number, vz: number, at: number, ox: number, oz: number): void {
    const p = this.p, w = this.w, reach = KICK_REACH * this.size;
    this.middleOfHips(_a);
    const hit = _b.set(_a.x + ox, this.low + at * this.tall, _a.z + oz);
    const share = new Float64Array(N);
    let mass = 0, given = 0;
    for (let i = 0; i < N; i++) {
      const d2 = (p[i * 3] - hit.x) ** 2 + (p[i * 3 + 1] - hit.y) ** 2 + (p[i * 3 + 2] - hit.z) ** 2;
      share[i] = KICK * Math.exp(-d2 / (reach * reach));
      mass += 1 / w[i];
      given += share[i] / w[i];
    }
    // (what the struck part takes, the whole body gives back: as much less each, by its weight)
    const back = given / mass;
    for (let i = 0; i < N; i++) this.push(i, vx * (share[i] - back), vy * (share[i] - back), vz * (share[i] - back));
  }

  /** The body moved on by `dt` s, under gravity and `fields`. */
  step(dt: number, fields: readonly Field[]): void {
    if (this.asleep) {
      // (woken by a field reaching its hips)
      for (const f of fields) if (f.accel(this.hips(_a), _b.set(0, 0, 0), _c.set(0, 0, 0))) { this.asleep = false; break; }
      if (this.asleep) return;
    }
    this.nearProps(dt);
    this.held = false;
    this.left = Math.min(this.left + dt, STEP * MOST_STEPS);
    while (this.left >= STEP) {
      this.left -= STEP;
      this.move(fields);
      this.lying = false;
      const passes = this.inFlight() ? FLYING_PASSES : PASSES;
      for (let pass = 0; pass < passes; pass++) {
        this.keepJoins();
        for (let i = 0; i < N; i++) this.collide(i);
      }
      if (this.lying) this.limp();
    }
    // (held up by a field, it isn't lying still however slowly it moves: hovering in a storm's eye, a body slept 0.8 m
    // up)
    this.stillFor = this.fastestSince(dt).speed < STILL && !this.held ? this.stillFor + dt : 0;
    if (this.stillFor >= STILL_FOR) this.asleep = true;
  }

  /** Whether it's clear of anything it could strike this step: every point over the floor by `CLEAR`, in the arena by
   *  as much, and no prop near. */
  private inFlight(): boolean {
    if (this.near.length) return false;
    const p = this.p, r = this.r, wall = G.arena.radius - CLEAR;
    for (let i = 0, k = 0; i < N; i++, k += 3) {
      if (p[k + 1] < groundUnder(p[k], p[k + 2], r[i]) + r[i] + CLEAR) return false;
      if (length2(p[k], p[k + 2]) > wall - r[i]) return false;
    }
    return true;
  }

  /** The bones' ends slowed against each other by `LIMP`, as much as they move apart (the body's own momentum kept). */
  private limp(): void {
    const p = this.p, q = this.q, w = this.w, k = LIMP * STEP;
    for (let n = 0; n < BONES.length; n++) {
      const { a, b } = this.joins[n], ka = a * 3, kb = b * 3, wa = w[a] / (w[a] + w[b]), wb = w[b] / (w[a] + w[b]);
      for (let c = 0; c < 3; c++) {
        const apart = (p[ka + c] - q[ka + c] - (p[kb + c] - q[kb + c])) * k;
        q[ka + c] += apart * wa;
        q[kb + c] -= apart * wb;
      }
    }
  }

  /** The point that moved fastest since the last frame, `dt` s ago, and how fast (m/s); this frame's places kept for
   *  the next. */
  private fastestSince(dt: number): { point: number; speed: number } {
    const p = this.p, was = this.framed, fastest = this.fastest;
    fastest.speed = 0;
    for (let i = 0, k = 0; i < N; i++, k += 3) {
      const moved = length3(p[k] - was[k], p[k + 1] - was[k + 1], p[k + 2] - was[k + 2]) / Math.max(dt, 1e-6);
      if (moved > fastest.speed) {
        fastest.speed = moved;
        fastest.point = i;
      }
    }
    was.set(p);
    return fastest;
  }

  /** The middle between the thighs' points (their sockets). */
  private middleOfHips(out: THREE.Vector3): THREE.Vector3 {
    this.point(I.thighL, out);
    return out.add(this.point(I.thighR, _p)).multiplyScalar(0.5);
  }

  /** Each point moved on by its velocity, gravity and the fields. */
  private move(fields: readonly Field[]): void {
    const p = this.p, q = this.q, keep = 1 - DRAG * STEP;
    for (let i = 0; i < N; i++) {
      const k = i * 3;
      _acc.set(0, -GRAVITY, 0);
      if (fields.length) {
        this.point(i, _p);
        this.velocity(i, _v);
        for (const f of fields) if (f.accel(_p, _v, _acc)) this.held = true;
      } else {
        _v.set(p[k] - q[k], p[k + 1] - q[k + 1], p[k + 2] - q[k + 2]).divideScalar(STEP);
      }
      _acc.multiplyScalar(STEP * STEP);
      q[k] = p[k]; q[k + 1] = p[k + 1]; q[k + 2] = p[k + 2];
      p[k] += _v.x * STEP * keep + _acc.x;
      p[k + 1] += _v.y * STEP * keep + _acc.y;
      p[k + 2] += _v.z * STEP * keep + _acc.z;
    }
  }

  /** The joins kept: each pair within its lengths, the limbs folding no further than a body's, the knees apart and
   *  bending forward only. */
  private keepJoins(): void {
    for (const jn of this.joins) this.within(jn.a, jn.b, jn.min, jn.max);
    for (const f of this.folds) this.within(f.a, f.b, f.min, Infinity);
    if (!this.folds.length) return;
    this.within(I.kneeL, I.kneeR, this.kneesApart, Infinity);
    for (const h of this.hipFold) this.within(I.chest, h.thigh, h.min, Infinity);
    // (forward, the pelvis's, from its points)
    this.between(I.thighR, I.thighL, _a);
    this.point(I.spine, _b).sub(this.middleOfHips(_d));
    const forward = _f.crossVectors(_a, _b).normalize();
    this.hinge(I.thighL, I.kneeL, I.ankleL, forward);
    this.hinge(I.thighR, I.kneeR, I.ankleR, forward);
  }

  /** Points `a` and `b` moved apart or together, by their weights, to within `min` and `max` of each other. */
  private within(a: number, b: number, min: number, max: number): void {
    const p = this.p, ka = a * 3, kb = b * 3;
    const dx = p[kb] - p[ka], dy = p[kb + 1] - p[ka + 1], dz = p[kb + 2] - p[ka + 2];
    // (squared first: most joins hold, and their root was a third of the solver's time, `lab crowd --profile`)
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < 1e-12 || (d2 >= min * min && d2 <= max * max)) return;
    const d = Math.sqrt(d2);
    const goal = d < min ? min : max, wa = this.w[a], wb = this.w[b], share = (d - goal) / (d * (wa + wb));
    p[ka] += dx * share * wa; p[ka + 1] += dy * share * wa; p[ka + 2] += dz * share * wa;
    p[kb] -= dx * share * wb; p[kb + 1] -= dy * share * wb; p[kb + 2] -= dz * share * wb;
  }

  /** A knee bends forward only (`forward`, the pelvis's): put back in front of the line from its hip to its ankle when
   *  it has gone behind it. */
  private hinge(hip: number, knee: number, ankle: number, forward: THREE.Vector3): void {
    this.between(hip, ankle, _a);
    const len = _a.length();
    if (len < 1e-4) return;
    _a.divideScalar(len);
    this.between(hip, knee, _b);
    const off = _d.copy(_b).addScaledVector(_a, -_b.dot(_a));
    const behind = -off.dot(forward);
    if (behind <= HINGE_SLACK) return;
    // (the knee put forward and its hip and ankle back by their weights, each where it was a step ago too: a push of
    // its own is a speed in verlet, and a knee lying on the floor, pulled down by gravity and pushed back up, rocked
    // a centimetre a frame for good)
    const fix = Math.min(behind - HINGE_SLACK, HINGE_STEP), wk = this.w[knee], wEnds = (this.w[hip] + this.w[ankle]) / 2;
    const share = fix / (wk + wEnds);
    this.shift(knee, forward, share * wk);
    this.shift(hip, forward, -share * this.w[hip] / 2);
    this.shift(ankle, forward, -share * this.w[ankle] / 2);
  }

  /** Point `i` moved `by` along `way`, where it was a step ago too (so the move gives it no speed). */
  private shift(i: number, way: THREE.Vector3, by: number): void {
    const p = this.p, q = this.q, k = i * 3, x = way.x * by, y = way.y * by, z = way.z * by;
    p[k] += x; p[k + 1] += y; p[k + 2] += z;
    q[k] += x; q[k + 1] += y; q[k + 2] += z;
  }

  /** The props near enough to the body to be met this frame. */
  private nearProps(dt: number): void {
    this.point(I.spine, _a);
    this.velocity(I.spine, _b);
    const reach = 2.5 + _b.length() * dt;
    // (squared, in a loop: `Math.hypot` over every prop of the arena, each body each frame, was 8% of the solver's time)
    const near = this.near;
    near.length = 0;
    for (const o of G.arena.obstacles) {
      const dx = o.x - _a.x, dz = o.z - _a.z, most = reach + o.r;
      if (dx * dx + dz * dz < most * most) near.push(o);
    }
  }

  /** Point `i` kept out of the floor (bouncing and sliding on it), out of the props standing above it and in the arena. */
  private collide(i: number): void {
    const p = this.p, q = this.q, k = i * 3, r = this.r[i];
    // (the floor under any part of it: by its middle alone, a ball over a step's edge sank into the step)
    const floor = groundUnder(p[k], p[k + 2], r);
    if (p[k + 1] < floor + r) {
      const was = groundUnder(q[k], q[k + 2], r);
      // (into a step's riser from the level below: held back by it, not lifted up the step)
      if (floor > was + 1e-3 && p[k + 1] < floor + r - RISER) { p[k] = q[k]; p[k + 2] = q[k + 2]; }
      else this.land(i, floor + r);
    }
    for (const o of this.near) {
      const dx = p[k] - o.x, dz = p[k + 2] - o.z, min = o.r + r, d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const top = groundHeight(o.x, o.z) + o.h;
      if (p[k + 1] - r >= top) continue;
      // (coming down onto it: it lies on top; else it's pushed out of its side, held by it as it's pressed to it)
      if (q[k + 1] - r >= top - 0.05) { this.land(i, top + r); continue; }
      const d = Math.sqrt(d2) || 1e-3;
      this.offSide(i, o, dx / d, dz / d, min);
    }
    // (the wall: its squared distance first, the root only for a point past it)
    const R = G.arena.radius - r, out2 = p[k] * p[k] + p[k + 2] * p[k + 2];
    if (out2 > R * R) { const out = Math.sqrt(out2); p[k] *= R / out; p[k + 2] *= R / out; }
  }

  /** Point `i` set on the side of prop `o` (`at` from its middle, out along (`nx`, 0, `nz`)), bouncing off it as off the
   *  floor and slowed along it by its grip, as hard as it struck the side (Coulomb's). (Pushed out alone, a point lying
   *  against a rock left it as fast as it was pressed to it, and buzzing there, a body leaning on a rock never lay
   *  still; with nothing holding it, it slid down the rock's side.) */
  private offSide(i: number, o: Obstacle, nx: number, nz: number, at: number): void {
    const p = this.p, q = this.q, k = i * 3;
    const into = Math.min(0, (p[k] - q[k]) * nx + (p[k + 2] - q[k + 2]) * nz);
    this.struck(i);
    p[k] = o.x + nx * at;
    p[k + 2] = o.z + nz * at;
    // (where it was a step ago set so it leaves the side as a bounce of how it came at it)
    const was = (q[k] - o.x) * nx + (q[k + 2] - o.z) * nz, back = at + into * BOUNCE - was;
    q[k] += nx * back;
    q[k + 2] += nz * back;
    let mx = p[k] - q[k], mz = p[k + 2] - q[k + 2];
    const my = p[k + 1] - q[k + 1], out = mx * nx + mz * nz;
    mx -= out * nx;
    mz -= out * nz;
    const slide = length3(mx, my, mz);
    if (slide < 1e-9) return;
    const stop = Math.min(1, (GRIP * -into * (1 + BOUNCE)) / slide);
    q[k] += mx * stop;
    q[k + 1] += my * stop;
    q[k + 2] += mz * stop;
  }

  /** Point `i` has struck something: the trunk lying on it, the body goes limp. */
  private struck(i: number): void { if (i === I.spine || i === I.chest) this.lying = true; }

  /** Point `i` set on a surface at `y`: bouncing off it a little and sliding on it, slowed by its grip. */
  private land(i: number, y: number): void {
    const p = this.p, q = this.q, k = i * 3;
    const down = p[k + 1] - q[k + 1];
    this.impact = Math.max(this.impact, -down / STEP);
    this.struck(i);
    p[k + 1] = y;
    q[k + 1] = y + Math.min(0, down) * BOUNCE;
    const dx = p[k] - q[k], dz = p[k + 2] - q[k + 2], slide = length2(dx, dz);
    if (slide < 1e-9) return;
    const left = Math.max(0, slide - GRIP * GRAVITY * STEP * STEP) * (1 - ROLL * STEP);
    q[k] = p[k] - dx * (left / slide);
    q[k + 2] = p[k + 2] - dz * (left / slide);
  }

  /** The pelvis's frame (left across its thighs, up to its spine) and the chest's (up its neck, left across its
   *  shoulders), from the points. (Up first, with its left squared to it, the hips tilted off the line between the
   *  thighs' points as the trunk bent to the side, and the legs hung 6 cm off theirs.) */
  private trunkFrames(hips: THREE.Quaternion, chest: THREE.Quaternion): void {
    frameAcross(this.between(I.thighR, I.thighL, _b), this.point(I.spine, _a).sub(this.middleOfHips(_c)), hips);
    frameOf(this.between(I.chest, I.neck, _a), this.between(I.shoulderR, I.shoulderL, _b), chest);
  }

  /** The rig posed from the points: the trunk by its frames, each limb swung from its way at the fall onto its way
   *  now (carrying its parent's turn, so it twists with it), the hands and feet with their forearms and shins, and
   *  the body placed so its hips are on their point. */
  pose(): void {
    // (asleep, it lies as it was last posed)
    if (this.asleep && this.posedAsleep) return;
    this.posedAsleep = this.asleep;
    const j = this.j, W = this.world, Q0 = this.q0;
    const dHips = this.dHips, dChest = this.dChest;
    this.trunkFrames(dHips, dChest);
    dHips.multiply(this.hips0Inv);
    dChest.multiply(this.chest0Inv);
    W.get('hips')!.copy(dHips).multiply(Q0.get('hips')!);
    // (the hips' joint placed by the pelvis's points)
    const hipsAt = this.hipsAt.copy(this.hipsFromMiddle).applyQuaternion(dHips).add(this.middleOfHips(_a));
    // (the spine, on its point, swung from the pelvis's turn so the chest's joint lands on its point: turned halfway to
    // the chest's, the chest stood off its point by half the trunk's bend, and the head and arms with it)
    const spineAt = _c.copy(this.spineFromHips).applyQuaternion(dHips).add(hipsAt);
    const was = _a.copy(this.chestFromSpine).applyQuaternion(dHips).normalize();
    const now = this.point(I.chest, _b).sub(spineAt).normalize();
    this.turn.setFromUnitVectors(was, now).multiply(dHips);
    W.get('spine')!.copy(this.turn).multiply(Q0.get('spine')!);
    this.chestAt.copy(now).multiplyScalar(this.chestFromSpine.length()).add(spineAt);
    W.get('chest')!.copy(dChest).multiply(Q0.get('chest')!);
    this.limb(dChest, ['neck', 'neck', 'head'], null, 'head');
    this.limb(dHips, ['thighL', 'thighL', 'kneeL'], ['kneeL', 'kneeL', 'ankleL'], 'ankleL');
    this.limb(dHips, ['thighR', 'thighR', 'kneeR'], ['kneeR', 'kneeR', 'ankleR'], 'ankleR');
    this.arm(dChest, 0);
    this.arm(dChest, 1);
    // the body unturned, placed so the hips land on their point
    j.body.quaternion.identity();
    j.body.position.set(0, 0, 0);
    j.root.updateWorldMatrix(true, false);
    j.body.position.copy(j.root.worldToLocal(_a.copy(hipsAt))).sub(j.hips.position);
    const rootTurn = j.root.getWorldQuaternion(this.rootTurn);
    for (const name of POSED) {
      const joint = j[name], parent = this.parentOf.get(name);
      const parentTurn = parent ? W.get(parent)! : joint.parent === j.body ? rootTurn : joint.parent!.getWorldQuaternion(_q);
      joint.quaternion.copy(_s.copy(parentTurn).invert()).multiply(W.get(name)!);
    }
  }

  /** A limb's joints (`upper`, then `lower`) turned in the world: each swung from its way at the fall (turned on by
   *  its parent's turn since) onto its way now, the next carrying that on, and its `end` (the hand, the foot, the
   *  head) turned with the last. */
  private limb(parentTurn: THREE.Quaternion, upper: Link, lower: Link | null, end: Posed): void {
    const turn = this.turn.copy(parentTurn);
    this.swing(turn, upper);
    if (lower) this.swing(turn, lower);
    this.world.get(end)!.copy(turn).multiply(this.q0.get(end)!);
  }

  /** `turn` carried on through a link: swung from the link's way at the fall, as `turn` has it now, onto its way now
   *  (from its first point to its next, or from `at`, where its joint is drawn, to its next, `length` along: `arm`). */
  private swing(turn: THREE.Quaternion, [joint, from, to]: Link, at?: THREE.Vector3, length = 0): void {
    const was = _a.copy(this.way0.get(joint)!).applyQuaternion(turn).normalize();
    const now = at ? this.aimFrom(at, I[to], length, _b) : this.between(I[from], I[to], _b).normalize();
    turn.premultiply(_s.setFromUnitVectors(was, now));
    this.world.get(joint)!.copy(turn).multiply(this.q0.get(joint)!);
  }

  /** The way from `at` to point `to`, raised so the end of a bone `length` long along it lies no lower than the point
   *  (into `out`, a unit vector): a point lying on the floor, its arm drawn from a shoulder a few centimetres off its
   *  own point, drew its elbow 2 to 4 cm under the floor (`lab death`, Briarflight's and Rending Cleave's kills). */
  private aimFrom(at: THREE.Vector3, to: number, length: number, out: THREE.Vector3): THREE.Vector3 {
    const point = this.point(to, _c);
    const target = _d.copy(point);
    for (let i = 0; i < AIM_LIFTS; i++) {
      out.copy(target).sub(at).normalize();
      const low = point.y - (at.y + out.y * length);
      if (low <= 1e-4) break;
      target.y += low;
    }
    return out.copy(target).sub(at).normalize();
  }

  /** An arm (`side` 0 the left) turned in the world, each bone aimed from where its joint is drawn at its next point:
   *  the shoulder drawn where the chest's turn puts it, the elbow along the upper arm from it. A landing bends the
   *  upper trunk's points a little, and with each bone swung onto the way between its points, the drawn shoulder's
   *  place off its point carried down the whole arm: an elbow or a hand lay 4 to 5 cm in the floor or a step's riser,
   *  the pose 3 to 6 cm off its points (`lab death`, every hero's kills). */
  private arm(chestTurn: THREE.Quaternion, side: 0 | 1): void {
    const [shoulder, elbow, hand] = ARMS[side];
    const [upper, forearm] = this.armLengths[side];
    const at = this.jointAt.copy(this.shoulderFromChest[side]).applyQuaternion(this.dChest).add(this.chestAt);
    const turn = this.turn.copy(chestTurn);
    this.swing(turn, [shoulder, shoulder, elbow], at, upper);
    at.addScaledVector(_b, upper);
    this.swing(turn, [elbow, elbow, hand], at, forearm);
    this.world.get(hand)!.copy(turn).multiply(this.q0.get(hand)!);
  }
}

/** A limb's joint and the points its way runs between. */
type Link = [Posed, Point, Point];
/** how many times a bone's aim is raised towards its end's point (`aimFrom`): each takes most of what is left */
const AIM_LIFTS = 3;
/** each arm's shoulder, elbow and hand, the left then the right */
const ARMS = [['shoulderL', 'elbowL', 'handL'], ['shoulderR', 'elbowR', 'handR']] as const;
