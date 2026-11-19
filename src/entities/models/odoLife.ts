// Odo's day in his shop (merchant.ts poses his body from it; world/houses/merchant.ts gives him its places and the things he
// handles): what he's doing and where his feet stand, a frame at a time. Behind his counter he works at one task after
// another (from Kenneth: "sometimes doing something else like stocking or checking something out... It should be
// different tasks"): jars from the crate stocked onto a shelf, the shelves dusted, a dagger picked up and looked over,
// a coin weighed on his scale, a line written in his ledger. Now and then he glances at whoever is in his shop. A
// customer coming in, or up to his counter, has him set down what he holds, walk to his desk and greet them ("when
// player comes in he leaves those tasks and goes right to desk to help customer"); once nobody stands at the counter
// for a while, and no trade is open, he goes back to work. Each task is a generator run a frame at a time, so it reads
// as the steps a person takes, and dropping it mid-way is how he's interrupted.
// His feet are planted and stepped (`Walker`): the body moves smoothly and each foot stays where it was set down until
// it falls too far behind where it should stand, then steps there (so he never slides, and turns on the spot in small
// steps). Every place is in the shop's frame (`S`: the room's group, his root's parent); what his hands do is in his
// root's frame, worked out each frame from where he stands.
import * as THREE from 'three';
import { clamp, damp, mulberry, smooth } from '../../util';

/** A place he stands, facing `yaw` (0 faces +z, the shop's door, over his counter). */
export interface Spot { x: number; z: number; yaw: number }

/** A thing he handles: lying in the shop (its parent the shop's group) or in one of his hands. */
export interface Thing {
  obj: THREE.Object3D;
  /** where it belongs, and where it lies now while it isn't held (the shop's frame) */
  home: { pos: THREE.Vector3; turn: THREE.Quaternion };
  at: { pos: THREE.Vector3; turn: THREE.Quaternion };
  /** how it sits in a hand: its origin and its turn in the hand's frame */
  grip: { pos: THREE.Vector3; turn: THREE.Quaternion };
  /** its turn set down on the counter, about his facing (a jar stands, a blade lies flat) */
  laid: THREE.Quaternion;
  /** how far the fingers close on it (`poseHand`'s curl): round a handle a full fist, over a jar's neck less */
  curl: number;
  held: 'L' | 'R' | null;
}

/** His shop as he works in it: all in its frame. */
export interface OdoShop {
  /** the counter's top, the z of its near (his) and far edges, and where a customer stands up to it */
  counter: { top: number; near: number; far: number; front: THREE.Vector3 };
  /** where he serves from */
  desk: Spot;
  /** the scale's near pan, the ledger's middle (where he writes) */
  pan: THREE.Vector3; ledger: THREE.Vector3;
  /** the jars on the crate, the shelf's places they go to, and where he stands between them */
  stock: { stand: Spot; jars: Thing[]; slots: THREE.Vector3[] };
  /** the line along the middle of the way behind the counter (z) he walks along, clear of the counter and the shelves */
  aisle: number;
  /** the duster in its pot, where he stands to take it, and where he dusts from (the shelves' front, its rows) */
  dust: { duster: Thing; take: Spot; spots: Spot[]; front: number; rows: number[] };
  /** the dagger lying on the counter, and where he stands to take it */
  blade: { dagger: Thing; stand: Spot };
}

/** What an arm does this frame: from its rest (hanging, or on the counter at his desk) to `at` by `w`. */
export interface ArmGoal {
  w: number;
  /** the wrist, and the hand's turn (his root's frame) */
  at: THREE.Vector3; turn: THREE.Quaternion;
  curl: number; drum: number;
  /** how far its fingers fan (0.15 as a hand rests) */
  spread: number;
}

/** What his body does this frame, set fresh each frame by the task under way. */
export interface Doing {
  L: ArmGoal; R: ArmGoal;
  /** his arms' rest: hanging at his sides, or on the counter (at his desk) */
  onCounter: boolean;
  /** leaning forward (rad), lowering his hips (m), turning his chest (rad) */
  bend: number; crouch: number; twist: number;
  /** where he looks (his root's frame) */
  look: THREE.Vector3;
  /** a nod (0 to 1, down and back), the coin and the quill held, his right hand in a pinch for the coin */
  nod: number; coin: boolean; quill: boolean; pinch: boolean;
  /** where the duster's feathers brush the shelf, while they do (the shop's frame: it raises the dust) */
  dusting: THREE.Vector3 | null;
}

/** What he's given each frame: where the customers in the shop stand (the shop's frame, on the floor), and whether a
 *  trade is open. */
export interface OdoScene { customers: readonly THREE.Vector3[]; trading: boolean; t: number }

export type OdoTask = 'stock' | 'dust' | 'inspect' | 'weigh' | 'write';
/** the ways he waits at his desk */
export type Waiting = 'rest' | 'lean' | 'belt' | 'square';
const TASKS: readonly OdoTask[] = ['write', 'stock', 'weigh', 'dust', 'inspect'];

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** 0 outside [a, b], 1 inside it, eased in and out over `rise` at each end */
export const span = (t: number, a: number, b: number, rise: number): number =>
  smooth(clamp((t - a) / rise, 0, 1)) * (1 - smooth(clamp((t - (b - rise)) / rise, 0, 1)));
/** where `t` is between a and b (0 to 1) */
export const along = (t: number, a: number, b: number): number => clamp((t - a) / (b - a), 0, 1);
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

const fx = new THREE.Vector3(), fy = new THREE.Vector3(), fz = new THREE.Vector3(), basis = new THREE.Matrix4();
/** A hand's turn (his root's frame): its fingers along `fingers`, its palm facing `palm`. */
export function handTurn(fingers: THREE.Vector3, palm: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
  fy.copy(fingers).normalize().negate();
  fz.copy(palm).negate();
  fz.addScaledVector(fy, -fz.dot(fy)).normalize();
  fx.crossVectors(fy, fz);
  return out.setFromRotationMatrix(basis.makeBasis(fx, fy, fz));
}

/** a customer: how near the counter's front calls him to his desk (m), how far off they must stand for him to go back
 *  to work (and for how long, s), and how long he keeps at his task once called (s) */
export const SERVE = { near: 1.7, far: 2.6, after: 6, finish: 1.6 };

/** how far apart his feet stand from his middle, how fast he walks and turns, a step's time and lift */
export const GAIT = { stance: 0.105, speed: 0.6, accel: 1.2, turn: 2.4, step: 0.46, lift: 0.055, lead: 0.2 };
/** a step's foot: how far its toes are ahead of the ankle and its heel behind (m), how high the ankle stands over the
 *  floor (merchant.ts's `ANKLE_H`), the heel's lift as the toes push off and the toes' as the heel lands (rad) */
const FOOT = { toe: 0.15, heel: 0.075, ankle: 0.086, push: 0.42, strike: 0.28 };
/** a step's parts (shares of it): the heel peeling up off the toes, the swing through, the heel down and the foot
 *  rolled flat onto the floor */
const ROLL = { off: 0.2, land: 0.85 };

/** How far the ankle moves (along the foot, up) as the foot turns `pitch` (+ heel up about its toes, - toes up about
 *  its heel): a foot rolls over its toes and its heel, never through the floor. */
function rolled(pitch: number, out: { along: number; up: number }): { along: number; up: number } {
  const { toe, heel, ankle } = FOOT;
  if (pitch >= 0) {
    out.along = toe * (1 - Math.cos(pitch)) + ankle * Math.sin(pitch);
    out.up = toe * Math.sin(pitch) + ankle * (Math.cos(pitch) - 1);
  } else {
    const q = -pitch;
    out.along = heel * Math.cos(q) - ankle * Math.sin(q) - heel;
    out.up = heel * Math.sin(q) + ankle * (Math.cos(q) - 1);
  }
  return out;
}
const _roll = { along: 0, up: 0 };
/** how near a foot must stand to where it should before it's left there: walking, and settling still */
const STEP_AT = { moving: 0.07, still: 0.035, turn: 0.28 };

interface Foot {
  /** where it stands (or, stepping, where it is now), its heading, how high it's lifted, its toes' pitch */
  x: number; z: number; yaw: number; lift: number; pitch: number;
  step: { fx: number; fz: number; fyaw: number; tx: number; tz: number; tyaw: number; k: number; dur: number; len: number } | null;
  /** how long since it last landed (s) */
  down: number;
}

/** His body's place and his feet, stepped to keep under it. */
export class Walker {
  x: number; z: number; yaw: number;
  vx = 0; vz = 0;
  goal: Spot;
  feet: [Foot, Foot];
  /** the hips' bob and sway this frame, from the steps */
  bob = 0; sway = 0;
  /** how long he has stood still (s), and which foot stepped last */
  private still = 0;
  private last = 1;

  constructor(at: Spot) {
    this.x = at.x; this.z = at.z; this.yaw = at.yaw;
    this.goal = { ...at };
    const foot = (s: number): Foot => {
      const [x, z] = this.ideal(s, at.x, at.z, at.yaw, 0, 0);
      return { x, z, yaw: at.yaw, lift: 0, pitch: 0, step: null, down: 1 };
    };
    this.feet = [foot(1), foot(-1)];
  }

  /** stood at `at` at once, his feet under him */
  place(at: Spot): void {
    this.x = at.x; this.z = at.z; this.yaw = at.yaw; this.vx = this.vz = 0;
    this.goal = { ...at };
    this.feet.forEach((f, i) => {
      [f.x, f.z] = this.ideal(i === 0 ? 1 : -1, at.x, at.z, at.yaw, 0, 0);
      f.yaw = at.yaw; f.lift = f.pitch = 0; f.step = null; f.down = 1;
    });
  }

  get speed(): number { return Math.hypot(this.vx, this.vz); }
  get stepping(): boolean { return !!(this.feet[0].step || this.feet[1].step); }
  /** whether he stands at his goal, turned to it, his feet settled under him */
  get arrived(): boolean {
    const d = Math.hypot(this.goal.x - this.x, this.goal.z - this.z);
    return d < 0.02 && Math.abs(wrap(this.goal.yaw - this.yaw)) < 0.05 && this.speed < 0.05 && !this.stepping
      && this.feet.every((f, i) => this.error(f, i === 0 ? 1 : -1, 0) < STEP_AT.still + 0.01);
  }

  /** where foot `s` (1 his left, -1 his right) would stand under a body at (x, z) facing yaw, moving (vx, vz) */
  private ideal(s: number, x: number, z: number, yaw: number, vx: number, vz: number, lead = GAIT.lead): [number, number] {
    const c = Math.cos(yaw), si = Math.sin(yaw), ox = s * GAIT.stance;
    return [x + ox * c + vx * lead, z - ox * si + vz * lead];
  }

  private error(f: Foot, s: number, lead: number): number {
    const [ix, iz] = this.ideal(s, this.x, this.z, this.yaw, this.vx, this.vz, lead);
    return Math.hypot(f.x - ix, f.z - iz) + 0.25 * Math.abs(wrap(f.yaw - this.yaw));
  }

  update(dt: number): void {
    if (dt <= 0) return;
    const g = this.goal, dx = g.x - this.x, dz = g.z - this.z, d = Math.hypot(dx, dz);
    // (toward his goal, slowing to stop on it; never faster than his feet keep up, and turned to his way before he
    // sets off along it: walked off at once, a foot was left half a metre behind his body)
    const behind = Math.max(this.error(this.feet[0], 1, 0), this.error(this.feet[1], -1, 0));
    const offWay = d > 0.3 ? Math.abs(wrap(Math.atan2(dx, dz) - this.yaw)) : 0;
    const keepUp = clamp(1 - (behind - 0.22) / 0.15, 0.15, 1) * clamp(1 - (offWay - 0.5) / 1.0, 0.15, 1);
    const want = d > 0.004 ? Math.min(GAIT.speed * keepUp, Math.sqrt(2 * GAIT.accel * 0.7 * d)) : 0;
    let ax = (d > 0.004 ? (dx / d) * want : 0) - this.vx, az = (d > 0.004 ? (dz / d) * want : 0) - this.vz;
    const a = Math.hypot(ax, az), most = GAIT.accel * dt;
    if (a > most) { ax *= most / a; az *= most / a; }
    this.vx += ax; this.vz += az;
    this.x += this.vx * dt; this.z += this.vz * dt;
    if (d < 0.004 && this.speed < 0.02) { this.x = g.x; this.z = g.z; this.vx = this.vz = 0; }
    // (he faces the way he walks, turning to his goal's facing as he comes to it; he sidesteps a short way)
    const travel = Math.atan2(dx, dz), k = smooth(clamp((d - 0.3) / 0.4, 0, 1));
    const face = g.yaw + wrap(travel - g.yaw) * k;
    const turn = clamp(wrap(face - this.yaw) * 4, -GAIT.turn, GAIT.turn);
    this.yaw = wrap(this.yaw + turn * dt);
    // --- the feet ---
    const moving = this.speed > 0.05 || Math.abs(turn) > 0.15;
    this.still = moving ? 0 : this.still + dt;
    this.bob = 0; this.sway = 0;
    for (const [i, f] of this.feet.entries()) {
      f.down += dt;
      const st = f.step;
      if (!st) continue;
      st.k = Math.min(1, st.k + dt / st.dur);
      // (heel to toe: the heel peels up off the toes, the foot swings through and its toes come up, the heel lands
      // and the foot rolls flat; a short step, a shuffle, rolls less)
      const swing = clamp((st.k - ROLL.off) / (ROLL.land - ROLL.off), 0, 1), e = smooth(swing);
      const roll = clamp(st.len / 0.3, 0.15, 1);
      const base = { x: st.fx + (st.tx - st.fx) * e, z: st.fz + (st.tz - st.fz) * e };
      f.yaw = st.fyaw + wrap(st.tyaw - st.fyaw) * e;
      if (st.k < ROLL.off) f.pitch = FOOT.push * roll * smooth(st.k / ROLL.off);
      else if (st.k < ROLL.land) f.pitch = roll * (FOOT.push + (-FOOT.strike - FOOT.push) * e);
      else f.pitch = -FOOT.strike * roll * (1 - smooth((st.k - ROLL.land) / (1 - ROLL.land)));
      rolled(f.pitch, _roll);
      const high = GAIT.lift * clamp(st.len / 0.22, 0.35, 1);
      f.x = base.x + Math.sin(f.yaw) * _roll.along;
      f.z = base.z + Math.cos(f.yaw) * _roll.along;
      f.lift = high * Math.sin(Math.PI * swing) + _roll.up;
      // (the hips rise over the standing foot as the other passes it, and shift over it)
      this.bob = 0.014 * Math.sin(Math.PI * st.k) * clamp(st.len / 0.3, 0.2, 1);
      this.sway = (i === 0 ? -1 : 1) * 0.026 * Math.sin(Math.PI * st.k) * clamp(st.len / 0.25, 0.3, 1);
      if (st.k >= 1) { f.step = null; f.lift = 0; f.pitch = 0; f.down = 0; this.last = i; }
    }
    if (this.stepping) return;
    // (a foot left too far from where it should stand steps there: the one further off, or the one that didn't step
    // last when both are about as far)
    const errs = this.feet.map((f, i) => this.error(f, i === 0 ? 1 : -1, GAIT.lead));
    let pick = errs[0] > errs[1] ? 0 : 1;
    if (errs[1 - pick] > errs[pick] * 0.7 && pick === this.last) pick = 1 - pick;
    const other = this.feet[1 - pick], err = errs[pick];
    const turning = Math.abs(wrap(this.feet[pick].yaw - this.yaw)) > STEP_AT.turn;
    const due = moving ? err > STEP_AT.moving || turning : (err > STEP_AT.still && this.still > 0.15) || turning;
    if (!due || other.down < 0.04) return;
    const s = pick === 0 ? 1 : -1, f = this.feet[pick];
    const dur = (moving ? GAIT.step : GAIT.step * 0.85) * (err > 0.25 ? 0.8 : 1);
    const yawAt = wrap(this.yaw + turn * dur);
    const [tx, tz] = this.ideal(s, this.x + this.vx * dur, this.z + this.vz * dur, yawAt, this.vx, this.vz, GAIT.lead * 0.5);
    const len = Math.hypot(tx - f.x, tz - f.z);
    f.step = { fx: f.x, fz: f.z, fyaw: f.yaw, tx, tz, tyaw: yawAt, k: 0, dur, len };
  }
}

/** A frame's time and its doing, as the tasks read and write them. */
interface Me { dt: number; d: Doing }
type Act = Generator<void, void, void>;

/** How a thing is held: from a hand's turn and where the thing then is (his root's frame), its grip in the hand's frame. */
export function gripOf(fingers: THREE.Vector3, palm: THREE.Vector3, thingAt: THREE.Vector3, thingTurn: THREE.Quaternion): Thing['grip'] {
  const qh = handTurn(fingers, palm, new THREE.Quaternion()), inv = qh.clone().invert();
  return { pos: thingAt.clone().applyQuaternion(inv), turn: inv.multiply(thingTurn) };
}

/**
 * Odo's day: his walker, the task under way, and this frame's doing. `update` steps it; merchant.ts poses him from
 * `doing` and the walker, and moves the things in his hands.
 */
export class OdoLife {
  readonly walker: Walker;
  readonly doing: Doing;
  /** the task under way (or 'serve'), for the lab */
  now: OdoTask | 'serve' | 'tidy' = 'write';
  /** where the pen's nib is in his writing hand's frame, as merchant.ts holds it (a tripod grip): the hand is placed
   *  so the nib is on the page */
  penNib = new THREE.Vector3(0, -0.12, -0.03);
  /** where a pinched coin is in his right hand's frame (merchant.ts's coin grip) */
  coinPinch = new THREE.Vector3(0, -0.13, -0.02);
  /** set by the lab: the next task he takes up */
  asked: OdoTask | null = null;
  /** whether a customer is being served, and whether he's glancing at one now */
  serving = false;
  glancing = 0;
  private act: Act | null = null;
  private readonly me: Me;
  private readonly rng: () => number;
  private lastT = -Infinity;
  private stocked = false;
  private lastTask: OdoTask | null = null;
  private nextGlance = 4;
  private glanceAt = new THREE.Vector3();
  private customersBefore = 0;
  private farSince = 0;
  /** when he goes to a customer who called him (his clock), or -1 */
  private callAt = -1;
  private clock = 0;

  constructor(readonly shop: OdoShop, seed = 5) {
    this.walker = new Walker(shop.desk);
    const arm = (): ArmGoal => ({ w: 0, at: new THREE.Vector3(), turn: new THREE.Quaternion(), curl: 0.15, drum: 0, spread: 0.15 });
    this.doing = { L: arm(), R: arm(), onCounter: false, bend: 0, crouch: 0, twist: 0, look: V(0, 1.4, 2), nod: 0, coin: false, quill: false, pinch: false, dusting: null };
    this.me = { dt: 0, d: this.doing };
    this.rng = mulberry(seed);
  }

  // --- where things are, his root's frame ---

  /** a point of the shop's frame in his root's */
  toMe(p: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    const w = this.walker, c = Math.cos(w.yaw), s = Math.sin(w.yaw), x = p.x - w.x, z = p.z - w.z;
    return out.set(x * c - z * s, p.y, x * s + z * c);
  }
  /** a point of his root's frame in the shop's */
  toShop(p: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    const w = this.walker, c = Math.cos(w.yaw), s = Math.sin(w.yaw);
    return out.set(p.x * c + p.z * s + w.x, p.y, -p.x * s + p.z * c + w.z);
  }
  /** his facing as a turn, and a turn of the shop's frame in his root's */
  private yawTurn(out = new THREE.Quaternion()): THREE.Quaternion { return out.setFromAxisAngle(UP, this.walker.yaw); }
  turnToMe(q: THREE.Quaternion, out = new THREE.Quaternion()): THREE.Quaternion { return this.yawTurn(out).invert().multiply(q); }
  turnToShop(q: THREE.Quaternion, out = new THREE.Quaternion()): THREE.Quaternion { return this.yawTurn(out).multiply(q); }

  /** an arm set to hold `thing` at `pos` turned `turn` (his root's frame) */
  private hold(arm: ArmGoal, thing: Thing, pos: THREE.Vector3, turn: THREE.Quaternion, w = 1): void {
    arm.turn.copy(turn).multiply(_q.copy(thing.grip.turn).invert());
    arm.at.copy(thing.grip.pos).applyQuaternion(arm.turn).negate().add(pos);
    arm.w = w;
    arm.curl = thing.curl;
  }
  /** an arm reaching for `thing` where it lies, by `w` */
  private reachFor(arm: ArmGoal, thing: Thing, w: number): void {
    this.hold(arm, thing, this.toMe(thing.at.pos, _p), this.turnToMe(thing.at.turn, _q2), w);
    arm.curl = 0.15 + (thing.curl - 0.15) * clamp((w - 0.85) / 0.15, 0, 1);
  }
  private aim(arm: ArmGoal, at: THREE.Vector3, fingers: THREE.Vector3, palm: THREE.Vector3, w = 1, curl = 0.2): void {
    arm.at.copy(at); handTurn(fingers, palm, arm.turn); arm.w = w; arm.curl = curl;
  }
  private take(thing: Thing, hand: 'L' | 'R'): void { thing.held = hand; }
  private put(thing: Thing, pos: THREE.Vector3, turn: THREE.Quaternion): void {
    thing.held = null;
    thing.at.pos.copy(pos); thing.at.turn.copy(turn);
  }
  /** the things he handles */
  get things(): Thing[] { return [...this.shop.stock.jars, this.shop.dust.duster, this.shop.blade.dagger]; }

  // --- a frame ---

  update(dt: number, scene: OdoScene): void {
    this.clock += dt;
    // (a room shown again, after it stood unseen: he's been at work meanwhile)
    if (scene.t - this.lastT > 0.75) this.arrive();
    this.lastT = scene.t;
    this.step(dt, scene);
  }

  /** The player walked in (or the shop was first shown): his things where they belong, and some way into a task. */
  private arrive(): void {
    this.arrivals++;
    this.act?.return();
    this.act = null;
    for (const t of this.things) {
      t.held = null;
      t.at.pos.copy(t.home.pos); t.at.turn.copy(t.home.turn);
    }
    this.stocked = false;
    this.serving = false;
    this.customersBefore = 0;
    this.callAt = -1;
    this.walker.place(this.shop.desk);
    // (some way into what he was doing, run quickly with nobody in the shop)
    const quiet: OdoScene = { customers: [], trading: false, t: 0 };
    const ahead = 4 + this.rng() * 12, frame = 1 / 30;
    for (let t = 0; t < ahead; t += frame) this.step(frame, quiet);
    this.settled = true;
  }
  /** set by `arrive`: the things snap into their places this frame (merchant.ts) */
  settled = true;
  /** how many times the shop was come into (the lab skips the frame he's stood in his place) */
  arrivals = 0;

  private step(dt: number, scene: OdoScene): void {
    const me = this.me, d = this.doing, w = this.walker;
    me.dt = dt;
    resetDoing(d);
    // --- whether a customer wants him at his desk ---
    const front = this.shop.counter.front;
    const off = (c: THREE.Vector3) => Math.hypot(c.x - front.x, c.z - front.z);
    const atCounter = scene.trading || scene.customers.some((c) => off(c) < SERVE.near);
    const cameIn = scene.customers.length > this.customersBefore;
    this.customersBefore = scene.customers.length;
    // (called, he finishes the moment of his task a little longer, his eyes on them, before he comes: from play, "he
    // goes to the table too quick. A bit longer, not by much")
    if (!this.serving && this.callAt < 0 && (atCounter || cameIn)) {
      this.callAt = this.clock + SERVE.finish;
      this.glancing = SERVE.finish;
    }
    if (!this.serving && this.callAt >= 0 && this.clock >= this.callAt) {
      this.callAt = -1;
      this.serving = true;
      this.act?.return();
      this.act = this.serve();
      this.now = 'serve';
    }
    // (back to work once every customer has stood well off the counter for a while: by distance and by time)
    const far = !scene.trading && scene.customers.every((c) => off(c) > SERVE.far);
    this.farSince = far ? this.farSince + dt : 0;
    this.scene = scene;
    if (!this.act) this.act = this.next();
    if (this.act.next().done) {
      this.act = this.next();
      this.act.next();
    }
    w.update(dt);
    // --- a glance at a customer now and then, from whatever he's doing ---
    const nearest = this.nearest(scene);
    if (nearest && !this.serving && this.callAt < 0) {
      this.nextGlance -= dt;
      if (this.nextGlance <= 0 && this.glancing <= 0) { this.glancing = 1.6 + this.rng() * 0.8; this.nextGlance = 7 + this.rng() * 7; }
    }
    if (this.glancing > 0 && nearest) {
      this.glancing -= dt;
      this.toMe(this.glanceAt.copy(nearest).setY(1.55), d.look);
    } else this.glancing = Math.max(0, this.glancing - dt);
  }
  private scene: OdoScene = { customers: [], trading: false, t: 0 };

  private nearest(scene: OdoScene): THREE.Vector3 | null {
    let best: THREE.Vector3 | null = null, bd = Infinity;
    for (const c of scene.customers) {
      const dd = Math.hypot(c.x - this.walker.x, c.z - this.walker.z);
      if (dd < bd) { bd = dd; best = c; }
    }
    return best;
  }

  /** the next task: anything left out of place put back first, then one he hasn't just done */
  private next(): Act {
    this.serving = false;
    if (this.things.some((t) => this.outOfPlace(t))) {
      this.now = 'tidy';
      return this.tidy();
    }
    let task = this.asked;
    this.asked = null;
    if (!task) {
      const open = TASKS.filter((t) => t !== this.lastTask && !(t === 'stock' && this.stocked));
      task = open[Math.floor(this.rng() * open.length)];
    }
    this.lastTask = task;
    this.now = task;
    return this[task]();
  }

  /** the lab: `task` taken up now, whatever he's doing (customers aside) */
  force(task: OdoTask): void {
    this.act?.return();
    this.asked = task;
    this.serving = false;
    this.callAt = -1;
    this.now = 'tidy';
    this.act = this.setDown();
  }

  // --- the motions tasks are made of ---

  /** `secs` long, `each` given how far through (0 to 1) every frame */
  private *over(secs: number, each: (k: number) => void): Act {
    let t = 0;
    for (;;) {
      const k = Math.min(1, t / secs);
      each(k);
      if (k >= 1) return;
      yield;
      t += this.me.dt;
    }
  }
  /** walked to `spot`, `carry` posing what he carries on the way: along the middle of the way behind the counter
   *  (`OdoShop.aisle`) when it's more than a step along it, stepping back to it first and in from it at the end.
   *  Walked straight along by the counter, his swinging arm went through its edge, from play. */
  private *walk(spot: Spot, carry?: () => void): Act {
    const w = this.walker, aisle = this.shop.aisle;
    if (Math.abs(spot.x - w.x) > 0.6) {
      const way = spot.x > w.x ? Math.PI / 2 : -Math.PI / 2;
      if (Math.abs(w.z - aisle) > 0.05) yield* this.walkTo({ x: w.x, z: aisle, yaw: way }, true, carry);
      yield* this.walkTo({ x: spot.x, z: aisle, yaw: way }, true, carry);
    }
    yield* this.walkTo(spot, false, carry);
  }
  /** walked to `goal`: on as soon as he's near it (`passing`), or till he stands on it settled */
  private *walkTo(goal: Spot, passing: boolean, carry?: () => void): Act {
    this.walker.goal = { ...goal };
    for (;;) {
      this.ahead();
      carry?.();
      const near = Math.hypot(goal.x - this.walker.x, goal.z - this.walker.z) < 0.12;
      if (passing ? near : this.walker.arrived) return;
      yield;
    }
  }
  /** looking ahead as he walks */
  private ahead(): void { this.doing.look.set(0, 1.3, 2.2); }

  /** a jar carried before him in his left hand, upright */
  private carryJar(jar: Thing): void {
    this.hold(this.doing.L, jar, _p.set(0.24, 0.92, 0.38), _q.identity());
    this.doing.twist = 0;
  }

  // --- the tasks ---

  /** Jars from the crate onto the shelf: each taken, carried round and set in its place, set straight; a step back to
   *  look at the shelf. */
  private *stock(): Act {
    const { stand, jars, slots } = this.shop.stock, d = this.doing;
    yield* this.walk(stand);
    for (let n = 0; n < 2; n++) {
      const jar = jars[n], slot = slots[n];
      // (he turns to the crate at his side, leans and reaches into it)
      yield* this.over(1.0, (k) => {
        const e = smooth(k);
        d.twist = 0.5 * e; d.bend = 0.35 * e; d.crouch = 0.05 * e;
        this.reachFor(d.L, jar, e);
        this.toMe(jar.at.pos, d.look).y += 0.1;
        d.R.w = 0;
      });
      this.take(jar, 'L');
      // (lifted out, turned to the shelf, set on it)
      const from = this.toMe(jar.at.pos).add(V(0, 0.02, 0)), to = this.toMe(slot);
      yield* this.over(1.3, (k) => {
        const e = smooth(k), up = Math.sin(Math.PI * k) * 0.14;
        d.twist = 0.5 * (1 - e); d.bend = 0.35 * (1 - e) + 0.12 * e; d.crouch = 0.05 * (1 - e);
        this.hold(d.L, jar, _p.lerpVectors(from, to, e).add(_p2.set(0, up + 0.012 * (1 - e), 0)), _q.identity());
        d.look.copy(_p).add(_p2.set(0, 0.05, 0));
        // (his right hand comes up to steady himself on the shelf's edge)
        this.aim(d.R, _p3.set(-0.24, 1.2, 0.52), V(0.1, -0.2, 1), V(0, -1, 0.2), 0.6 * e);
      });
      this.put(jar, slot, this.turnToShop(_q.identity()));
      // (let go, set it straight with a nudge of his fingers, and back)
      yield* this.over(0.9, (k) => {
        const e = 1 - smooth(clamp((k - 0.5) / 0.5, 0, 1));
        d.bend = 0.12 * e;
        const nudge = Math.sin(Math.PI * clamp(k / 0.5, 0, 1));
        this.aim(d.L, this.toMe(slot, _p).add(_p2.set(0.02, 0.1 - 0.02 * nudge, -0.07 + 0.015 * nudge)), V(-0.1, -0.5, 1), V(0, -0.6, 0.6), e, 0.3);
        this.aim(d.R, _p3.set(-0.24, 1.2, 0.52), V(0.1, -0.2, 1), V(0, -1, 0.2), 0.6 * e);
        this.toMe(slot, d.look).y += 0.08;
      });
    }
    this.stocked = true;
    // (a step back, a look along the shelf)
    const back: Spot = { x: stand.x - Math.sin(stand.yaw) * 0.25, z: stand.z - Math.cos(stand.yaw) * 0.25, yaw: stand.yaw };
    yield* this.walk(back);
    yield* this.over(1.6, (k) => {
      this.toMe(slots[0], d.look).add(_p.set(0.25 * Math.sin(k * Math.PI * 2), 0.1, 0));
      d.L.w = 0.35 * Math.sin(Math.PI * k);
      this.aim(d.L, _p.set(0.12, 0.98, 0.12), V(0, -0.4, 1), V(-1, 0, 0), d.L.w, 0.4);
      d.L.at.y += 0.03;
    });
  }

  /** The duster from its pot, the shelves dusted row by row as he works along them, the duster put back. He stands back
   *  from the shelf and reaches into it at near his arm's length on his own right side, sweeping along the row from
   *  his right to before him: never across his face or through himself (swept from his middle out to his left, his
   *  arm crossed his face and went into his body, from play). */
  private *dust(): Act {
    const { duster, take, spots, front, rows } = this.shop.dust, d = this.doing;
    yield* this.walk(take);
    yield* this.over(0.9, (k) => {
      this.reachFor(d.R, duster, smooth(k));
      this.toMe(duster.at.pos, d.look).y += 0.15;
      d.bend = 0.12 * smooth(k);
    });
    this.take(duster, 'R');
    const carry = () => this.hold(d.R, duster, _p.set(-0.25, 1.08, 0.33), _q.setFromAxisAngle(X, 0.25));
    yield* this.over(0.5, (k) => {
      const e = smooth(k), from = this.toMe(duster.home.pos);
      this.hold(d.R, duster, _p.lerpVectors(from.add(V(0, 0.18, 0)), V(-0.25, 1.08, 0.33), e), _q.setFromAxisAngle(X, 0.25 * e));
    });
    for (const spot of spots) {
      yield* this.walk(spot, carry);
      // (a sweep along each row, top to bottom, the feathers brushed to and fro over what stands on it)
      for (const [r, high] of rows.entries()) {
        yield* this.over(1.5, (k) => {
          const into = span(k, 0, 1, 0.18), stroke = 0.5 + 0.5 * Math.sin(k * Math.PI * 2 * 2.5);
          // (his hand out before his right shoulder, the duster up and on into the row's front)
          const ahead = this.toMe(_p3.set(this.walker.x, high, front), _p3).z;
          const hand = _p4.set(-0.34 + 0.26 * stroke, clamp(high - 0.36, 0.95, 1.5), Math.min(0.34, ahead - 0.1));
          const tip = _p3.set(hand.x + 0.03, high, ahead + 0.12);
          const axis = _p5.subVectors(tip, hand).normalize();
          // (held along the way from his hand to the feathers: the sweep's pose, eased into from the carry and out)
          this.hold(d.R, duster, hand, _q2.setFromUnitVectors(Y, axis), 1);
          const sweepAt = _p6.copy(d.R.at), sweepTurn = _q3.copy(d.R.turn);
          carry();
          d.R.at.lerp(sweepAt, into);
          d.R.turn.slerp(sweepTurn, into);
          d.bend = 0.04 + 0.06 * r; d.twist = -0.08 * (stroke - 0.5) * into;
          d.crouch = r === rows.length - 1 ? 0.1 * into : 0;
          d.look.copy(tip);
          d.dusting = into > 0.5 ? this.toShop(tip, _p7) : null;
        });
      }
    }
    yield* this.walk(take, carry);
    yield* this.over(0.9, (k) => {
      const e = 1 - smooth(k);
      this.reachFor(d.R, duster, 1);
      const there = _p6.copy(d.R.at), turn = _q3.copy(d.R.turn);
      carry();
      d.R.at.lerp(there, smooth(clamp(k / 0.6, 0, 1)));
      d.R.turn.slerp(turn, smooth(clamp(k / 0.6, 0, 1)));
      d.R.w = k < 0.6 ? 1 : e * 2.5;
      d.bend = 0.12 * Math.sin(Math.PI * k);
      this.toMe(duster.home.pos, d.look).y += 0.15;
      if (k >= 0.6 && duster.held) this.put(duster, duster.home.pos, duster.home.turn);
    });
  }

  /** The dagger picked up from the counter and looked over as a merchant looks over a blade: his fist round its hilt,
   *  palm down, the blade lying across before his chest; turned to the light by rolling his forearm, his other hand's
   *  fingertips under its flat feeling along it toward the point; a nod; put back. (Held blade up between his two
   *  hands it read as praying, the blade past his face: from play, "not how you hold a dagger".) */
  private *inspect(): Act {
    const { dagger, stand } = this.shop.blade, d = this.doing;
    yield* this.walk(stand);
    yield* this.over(1.0, (k) => {
      const e = smooth(k);
      this.reachFor(d.R, dagger, e);
      d.bend = 0.2 * e;
      this.toMe(dagger.at.pos, d.look);
    });
    this.take(dagger, 'R');
    // (palm down, fingers ahead and a little in: the blade out of his thumb's side across to his left, its flat up)
    const fingers = V(0.15, -0.1, 1).normalize();
    const flat = handTurn(fingers, V(0, -1, 0.05), new THREE.Quaternion());
    const before = V(-0.08, 1.2, 0.36), roll = new THREE.Quaternion();
    const lifted = this.toMe(dagger.home.pos).add(V(0, 0.04, -0.03));
    /** the blade's way and a point along it from his fist (his root's frame) */
    const along = (out: THREE.Vector3, from: number) =>
      out.set(1, 0, 0).applyQuaternion(d.R.turn).multiplyScalar(from).add(d.R.at);
    yield* this.over(0.9, (k) => {
      const e = smooth(k);
      d.R.at.lerpVectors(lifted, before, e).addScaledVector(Y, 0.05 * Math.sin(Math.PI * k));
      d.R.turn.copy(flat); d.R.w = 1; d.R.curl = 1.3;
      d.bend = 0.2 * (1 - e) + 0.08 * e;
      along(d.look, 0.18);
    });
    // (turned to and fro to the light, the flat tipped up toward his eye and back; his left hand comes under it)
    yield* this.over(5.2, (k) => {
      const tip = 0.55 * (0.5 - 0.5 * Math.cos(k * Math.PI * 2 * 1.5));
      d.R.turn.copy(flat).premultiply(roll.setFromAxisAngle(fingers, -tip));
      d.R.at.copy(before).addScaledVector(Y, 0.04 * span(k, 0.2, 0.8, 0.2));
      d.R.w = 1; d.R.curl = 1.3;
      d.bend = 0.08;
      along(d.look, 0.16);
      // (his left hand cradling the blade's outer half from beneath, its fingers along the blade toward the guard and
      // its palm turned with the flat, sliding out toward the point: laid across the blade, the fingers were cut by it
      // as it tilted to the light, from the lab)
      const out = 0.2 + 0.06 * smooth(clamp((k - 0.3) / 0.5, 0, 1));
      const blade = _p3.set(1, 0, 0).applyQuaternion(d.R.turn);
      const palm = _p4.set(0, 1, 0).applyAxisAngle(fingers, -tip);
      const under = along(_p, out).addScaledVector(palm, -0.065);
      const leftFingers = _p2.copy(blade).negate();
      this.aim(d.L, under.addScaledVector(blade, 0.1), leftFingers, palm, span(k, 0.08, 1, 0.15), 0);
      d.nod = span(k, 0.82, 1, 0.08);
    });
    yield* this.over(1.0, (k) => {
      const e = smooth(k);
      d.R.at.lerpVectors(before, lifted, e).addScaledVector(Y, 0.05 * Math.sin(Math.PI * k));
      d.R.turn.copy(flat); d.R.w = 1; d.R.curl = 1.3;
      d.bend = 0.08 + 0.12 * e;
      this.toMe(dagger.home.pos, d.look);
    });
    this.put(dagger, dagger.home.pos, dagger.home.turn);
    yield* this.over(0.7, (k) => {
      this.reachFor(d.R, dagger, 1 - smooth(k));
      d.bend = 0.2 * (1 - smooth(k));
      this.toMe(dagger.at.pos, d.look);
    });
  }

  /** A coin pinched off the stack on the scale's pan, lifted to his eye and turned in his fingers to catch the light,
   *  set back on the pan with his fingertips (at his desk). His hand is placed by where the coin is wanted, from where
   *  it sits in his pinch (`coinPinch`). */
  private *weigh(): Act {
    const { desk, pan } = this.shop, d = this.doing;
    yield* this.walk(desk);
    // (palm down over the pan, fingers toward it; at his eye, the hand up on its side, fingers up and in, the coin
    // between him and the candle's light)
    const down = handTurn(V(0.15, -0.75, 0.6), V(0, -1, 0.1), new THREE.Quaternion());
    const fingersUp = V(0.25, 0.85, 0.35).normalize();
    const up = handTurn(fingersUp, V(0.75, -0.1, -0.65), new THREE.Quaternion());
    const eye = V(-0.05, 1.5, 0.32), roll = new THREE.Quaternion();
    yield* this.over(8, (k) => {
      d.onCounter = true;
      const reach = span(k, 0, 1, 0.12), lift = span(k, 0.2, 0.86, 0.13);
      const turnIt = 0.55 * Math.sin(clamp((k - 0.36) / 0.38, 0, 1) * Math.PI * 2) * lift;
      const onPan = this.toMe(pan, _p).add(_p2.set(0, 0.002, 0));
      const coinAt = _p3.lerpVectors(onPan, eye, lift);
      coinAt.y += 0.04 * Math.sin(Math.PI * lift) * (1 - lift);
      d.R.turn.copy(down).slerp(_q.copy(up).premultiply(roll.setFromAxisAngle(fingersUp, turnIt)), lift);
      d.R.at.copy(this.coinPinch).applyQuaternion(d.R.turn).negate().add(coinAt);
      d.R.w = reach;
      d.pinch = true;
      d.coin = k > 0.14 && k < 0.9;
      d.bend = 0.1 * reach * (1 - lift); d.twist = -0.18 * reach * (1 - lift);
      d.look.copy(coinAt);
    });
  }

  /** A line written in his ledger with his quill, a pause to read it back (at his desk). The pen is held as a pen is
   *  (merchant.ts's tripod grip) and his hand placed so its nib is on the page: the nib runs along the line in the
   *  small loops of a hand writing, lifted between words. */
  private *write(): Act {
    const { desk, ledger } = this.shop, d = this.doing;
    yield* this.walk(desk);
    // (his left hand rolled onto its little finger's side, its fingers toward the page and his right, the pen sloping
    // back over the web of his hand)
    const writing = handTurn(V(-0.3, -0.55, 0.78), V(-0.5, -0.85, 0.15), new THREE.Quaternion());
    yield* this.over(9, (k) => {
      d.onCounter = true;
      const write = span(k, 0, 1, 0.13), line = along(k, 0.1, 0.85);
      const words = Math.max(0, Math.sin(this.clock * 2.6)) ** 6;
      const nib = this.toMe(ledger, _p).add(_p2.set(
        -0.07 + 0.14 * line + 0.004 * Math.sin(this.clock * 21),
        0.0015 + 0.008 * words + 0.012 * (1 - write),
        0.003 * Math.sin(this.clock * 13 + 1.3),
      ));
      d.L.turn.copy(writing);
      d.L.at.copy(this.penNib).applyQuaternion(writing).negate().add(nib);
      d.L.at.y += 0.05 * Math.sin(Math.PI * Math.min(1, write)) * (1 - write);
      d.L.w = write;
      d.quill = write > 0.05;
      d.bend = 0.1 * write; d.twist = 0.12 * write;
      d.look.copy(nib);
    });
  }

  /** Whatever is out of place (put down when a customer called him) taken back where it belongs. */
  private *tidy(): Act {
    const d = this.doing;
    for (const thing of this.things) {
      if (thing.held || thing.at.pos.distanceTo(thing.home.pos) < 0.02) continue;
      if (!this.outOfPlace(thing)) continue;
      const hand: 'L' | 'R' = thing === this.shop.stock.jars[0] || thing === this.shop.stock.jars[1] || thing === this.shop.stock.jars[2] ? 'L' : 'R';
      const arm = hand === 'L' ? d.L : d.R;
      // (stood beside it, so it's on the side of the hand that takes it: stood square before it, his left hand reached
      // across his belly to it, from the lab)
      yield* this.walk(this.counterSpot(thing.at.pos.x - (hand === 'L' ? 0.2 : -0.2)));
      yield* this.over(0.8, (k) => { this.reachFor(arm, thing, smooth(k)); d.bend = 0.18 * smooth(k); this.toMe(thing.at.pos, d.look); });
      this.take(thing, hand);
      const home = this.homeSpot(thing);
      const s = hand === 'L' ? 1 : -1;
      const carry = () => this.hold(arm, thing, _p.set(0.24 * s, 0.92, 0.38), thing === this.shop.dust.duster ? _q.setFromAxisAngle(X, 0.25) : thing === this.shop.blade.dagger ? this.turnToMe(thing.home.turn, _q) : _q.identity());
      yield* this.over(0.5, () => carry());
      yield* this.walk(home, carry);
      yield* this.over(0.9, (k) => {
        const there = this.toMe(thing.home.pos, _p6), turn = this.turnToMe(thing.home.turn, _q3);
        const held = _p5.set(0.24 * s, 0.92, 0.38);
        this.hold(arm, thing, held.lerp(there.add(_p4.set(0, 0.02 * (1 - k), 0)), smooth(clamp(k / 0.65, 0, 1))), turn);
        d.bend = 0.2 * Math.sin(Math.PI * k);
        this.toMe(thing.home.pos, d.look);
        if (k >= 0.65 && thing.held) this.put(thing, thing.home.pos, thing.home.turn);
        if (!thing.held) arm.w = 1 - smooth(clamp((k - 0.65) / 0.35, 0, 1));
      });
    }
  }

  /** whether `thing` lies where it doesn't belong: not in a hand, away from its home, and not a jar (a jar is home on
   *  its crate or stocked on the shelf; one on the shelf taken for out of place had him reach back to the shelf from
   *  the counter, his forearm through his belly, from the lab) */
  private outOfPlace(thing: Thing): boolean {
    return !thing.held && !this.shop.stock.jars.includes(thing) && thing.at.pos.distanceTo(thing.home.pos) > 0.02;
  }

  /** where he stands at the counter to reach something at x on it */
  private counterSpot(x: number): Spot {
    return { x: clamp(x, -1.9, 1.9), z: this.shop.desk.z, yaw: 0 };
  }
  /** where he stands to put `thing` back */
  private homeSpot(thing: Thing): Spot {
    if (this.shop.stock.jars.includes(thing)) return this.shop.stock.stand;
    if (thing === this.shop.dust.duster) return this.shop.dust.take;
    return this.shop.blade.stand;
  }

  /** Whatever he holds set down on the counter where he stands (the dagger back where it lay): what's done first when
   *  anything breaks off a task. */
  private *setDown(): Act {
    const d = this.doing;
    const held = this.things.find((t) => t.held);
    if (!held) return;
    const hand = held.held!, arm = hand === 'L' ? d.L : d.R, s = hand === 'L' ? 1 : -1;
    // (the dagger back where it lay, and the duster in its pot: laid on the counter, the duster was taken up again
    // from under its handle, his wrist into the counter; anything else set down on the counter where he is)
    // (a jar likewise back on its crate, beside where he stocks: set on the counter's end, it was taken up again from a
    // corner his arm couldn't reach cleanly, his forearm across his belly, from the lab)
    const isDagger = held === this.shop.blade.dagger, isDuster = held === this.shop.dust.duster, home = true;
    const spot = isDagger ? this.shop.blade.stand : isDuster ? this.shop.dust.take : this.shop.stock.stand;
    // (carried there as it's carried: a jar at his left side, the duster up before his right, the dagger at his right
    // side, its blade along before him. Carried as his hand happened to hold it when called, mid-reach, his wrist
    // turned and his forearm went into his belly as he walked; the dagger, held across him, came to his left hand)
    const heldNow = isDagger ? V(-0.22, 1.02, 0.36) : isDuster ? V(-0.25, 1.08, 0.33) : V(0.24, 0.92, 0.38);
    const turnNow = isDagger ? new THREE.Quaternion().setFromUnitVectors(Y, V(0.15, -0.35, 1).normalize())
      : isDuster ? new THREE.Quaternion().setFromAxisAngle(X, 0.25) : new THREE.Quaternion();
    yield* this.walk(spot, () => this.hold(arm, held, heldNow, turnNow));
    const on = home ? held.home.pos.clone() : V(this.walker.x + 0.16 * s, this.shop.counter.top + 0.014, this.shop.counter.near + 0.14);
    // (laid with its length toward the hand that takes it up again: the duster laid with its handle to his left, his
    // right hand reached across his chest to it, from the lab)
    const toward = new THREE.Quaternion().setFromAxisAngle(UP, s < 0 ? Math.PI : 0);
    const laid = home ? held.home.turn.clone() : this.turnToShop(toward.multiply(held.laid), new THREE.Quaternion());
    yield* this.over(0.9, (k) => {
      const there = this.toMe(on, _p6), turn = this.turnToMe(laid, _q3);
      this.hold(arm, held, _p5.copy(heldNow).lerp(there, smooth(clamp(k / 0.6, 0, 1))), _q4.copy(turnNow).slerp(turn, smooth(clamp(k / 0.6, 0, 1))));
      d.bend = 0.15 * Math.sin(Math.PI * k);
      this.toMe(on, d.look);
      if (k >= 0.6 && held.held) this.put(held, on, laid);
      if (!held.held) arm.w = 1 - smooth(clamp((k - 0.6) / 0.4, 0, 1));
    });
  }

  /** Serving: what he holds set down on the counter, to his desk, a nod and a wave to the customer, and then attentive
   *  at his desk while anyone stands at the counter or a trade is open. */
  private *serve(): Act {
    const d = this.doing;
    yield* this.setDown();
    yield* this.walk(this.shop.desk);
    // (a nod and a raised hand for whoever came in)
    yield* this.over(1.6, (k) => {
      d.onCounter = true;
      const c = this.nearest(this.scene);
      if (c) this.toMe(_p.copy(c).setY(1.55), d.look); else d.look.set(0, 1.5, 3);
      d.nod = span(k, 0, 0.5, 0.2);
      // (his right hand raised from the elbow, the elbow kept by his side, palm out to them, and waved twice from the
      // wrist: swung from the shoulder, the whole arm went to and fro as a signal)
      const raised = span(k, 0.08, 0.95, 0.22);
      const wag = 0.2 * raised * Math.sin(clamp((k - 0.22) / 0.6, 0, 1) * Math.PI * 4);
      const fingers = _p2.set(-0.12, 1, 0.1).applyAxisAngle(Z, wag);
      this.aim(d.R, _p.set(-0.25, 1.28, 0.22), fingers, _p3.set(-0.15, 0.05, 1), raised, 0.06);
      d.R.spread = 0.32;
    });
    // (at his desk, his hands on the counter, his eyes on the nearest customer; back to work once none stands at the
    // counter for a while and no trade is open)
    let here = 0;
    for (;;) {
      // (one way of waiting after another, each a few seconds: his hands resting on the counter, leaning on it,
      // his thumbs in his belt, the ledger squared up; his eyes on the customer, now and then down at the counter.
      // Drumming his fingers read as impatience: from play, "it does not look good")
      const pose = this.rng(), last = 3.5 + this.rng() * 3;
      const way: Waiting = pose < 0.35 ? 'rest' : pose < 0.6 ? 'lean' : pose < 0.85 ? 'belt' : 'square';
      this.waiting = way;
      for (let t = 0; t < last; t += this.me.dt) {
        here += this.me.dt;
        this.waitAs(way, t / last);
        if (here > 4 && this.farSince > SERVE.after && !this.scene.trading) return;
        yield;
      }
    }
  }

  /** a frame of waiting at his desk, `way`, `k` of the way through it */
  private waitAs(way: Waiting, k: number): void {
    const d = this.doing, c = this.nearest(this.scene), counter = this.shop.counter;
    d.onCounter = way === 'rest' || way === 'square';
    if (c) this.toMe(_p.copy(c).setY(1.55), d.look); else d.look.set(0, 1.4, 2);
    // (a look down at the counter now and then, and at the ledger while a trade is open)
    const down = span(k, 0.55, 0.72, 0.05) * (this.scene.trading ? 1 : 0.6);
    d.look.lerp(this.toMe(this.shop.ledger, _p2), down);
    const into = span(k, 0, 1, 0.12);
    if (way === 'lean') {
      // (both hands on the counter, wider and further on, his weight forward on them)
      const front = this.toMe(_p3.set(this.walker.x, counter.top + 0.035, counter.near + 0.2)).z;
      for (const [arm, s] of [[d.L, 1], [d.R, -1]] as const) {
        this.aim(arm, _p4.set(s * 0.3, counter.top + 0.04, front), V(-0.4 * s, -0.05, 1), V(0, -1, 0.05), into, 0.2);
      }
      d.bend = 0.2 * into;
    } else if (way === 'belt') {
      // (his thumbs hooked in his belt, his hands hanging from it, standing easy)
      for (const [arm, s] of [[d.L, 1], [d.R, -1]] as const) {
        this.aim(arm, _p4.set(s * 0.14, 1.0, 0.25), V(-0.15 * s, -1, 0.15), V(-0.2 * s, 0, -1), into, 0.35);
      }
      d.bend = -0.02 * into;
    } else if (way === 'square') {
      // (the ledger squared up between his hands, nudged once, and let be)
      const book = this.toMe(this.shop.ledger, _p3);
      const nudge = Math.sin(Math.PI * clamp((k - 0.25) / 0.3, 0, 1)) * 0.012;
      for (const [arm, s] of [[d.L, 1], [d.R, -1]] as const) {
        this.aim(arm, _p4.set(book.x + s * 0.2, counter.top + 0.05, book.z - 0.02 + nudge), V(-0.8 * s, -0.2, 0.5), V(0.5 * s, -0.5, 0), into, 0.25);
      }
      d.bend = 0.08 * into;
      d.look.lerp(book, span(k, 0.1, 0.6, 0.1));
    }
  }
  /** how he's waiting now (the lab reads it) */
  waiting: Waiting = 'rest';

  /** where a held thing is now and its turn, as its hand last put it (the shop's frame): the pose layer keeps these */
  handGuess(thing: Thing): THREE.Vector3 { return thing.obj.parent ? thing.obj.getWorldPosition(new THREE.Vector3()).applyMatrix4(_m.copy(this.shopWorld).invert()) : thing.at.pos.clone(); }
  handTurnGuess(thing: Thing): THREE.Quaternion {
    const q = thing.obj.getWorldQuaternion(new THREE.Quaternion());
    return _q5.setFromRotationMatrix(this.shopWorld).invert().multiply(q);
  }
  /** the shop group's world matrix (merchant.ts keeps it) */
  shopWorld = new THREE.Matrix4();
}

/** the doing's defaults each frame: arms at rest, standing straight, looking ahead */
function resetDoing(d: Doing): void {
  for (const a of [d.L, d.R]) { a.w = 0; a.curl = 0.15; a.drum = 0; a.spread = 0.15; }
  d.onCounter = false; d.bend = 0; d.crouch = 0; d.twist = 0; d.nod = 0; d.coin = false; d.quill = false; d.pinch = false; d.dusting = null;
  d.look.set(0, 1.35, 2.2);
}

const UP = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0), Y = UP, Z = new THREE.Vector3(0, 0, 1);
const _p = new THREE.Vector3(), _p2 = new THREE.Vector3(), _p3 = new THREE.Vector3(), _p4 = new THREE.Vector3();
const _p5 = new THREE.Vector3(), _p6 = new THREE.Vector3(), _p7 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _q4 = new THREE.Quaternion();
const _q5 = new THREE.Quaternion(), _m = new THREE.Matrix4();
void damp;
