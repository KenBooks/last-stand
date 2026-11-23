// A village folk's feet, stepped heel to toe under a body that walks (Odo's walker, from feat/odo-life's odoLife.ts,
// which Kenneth accepted: "walking animation needs big improvement" of the tavern's keeper, who walked on the heroes'
// leg IK). Each foot stays where it was set down until it falls too far behind where it should stand, then steps
// there: the heel peels up off the toes, the foot swings through with its toes up, lands on its heel and rolls flat.
// So he never slides, and turns on the spot in small steps. The hips rise over the standing foot as the other passes
// it and shift over it (`bob`, `sway`). Either the walker moves the body itself towards a goal (`update`), or a brain
// moves it and the walker keeps the feet under it (`follow`, the keeper's). Every place is in the frame his root's
// parent has (the room's), x and z on the floor, yaw 0 facing +z.
import { clamp, smooth } from '../../util';

/** A place a body stands, facing `yaw`. */
export interface Spot { x: number; z: number; yaw: number }

/** How a body walks: how far apart its feet stand from its middle (m), how fast it walks (m/s), speeds up (m/s²) and
 *  turns (rad/s), a step's time (s) and its foot's lift (m), and how far ahead of the body (s of its speed) a foot is
 *  set down. */
export interface Gait { stance: number; speed: number; accel: number; turn: number; step: number; lift: number; lead: number }

/** a step's foot: how far its toes are ahead of the ankle and its heel behind (m), how high the ankle stands over the
 *  floor, the heel's lift as the toes push off and the toes' as the heel lands (rad) */
export interface FootSize { toe: number; heel: number; ankle: number; push: number; strike: number }

/** a step's parts (shares of it): the heel peeling up off the toes, the swing through, the heel down and the foot
 *  rolled flat onto the floor */
const ROLL = { off: 0.2, land: 0.85 };
/** how near a foot must stand to where it should before it's left there: walking, settling still, and turned off his
 *  facing (rad) */
const STEP_AT = { moving: 0.07, still: 0.035, turn: 0.28 };

/** One foot: where it stands (or, stepping, where it is now), its heading, how high it's lifted, its toes' pitch, the
 *  step under way, and how long since it last landed (s). */
export interface WalkerFoot {
  x: number; z: number; yaw: number; lift: number; pitch: number;
  step: { fx: number; fz: number; fyaw: number; tx: number; tz: number; tyaw: number; k: number; dur: number; len: number } | null;
  down: number;
}

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** A body's place and its feet, stepped to keep under it. */
export class Walker {
  x: number; z: number; yaw: number;
  vx = 0; vz = 0;
  goal: Spot;
  readonly feet: [WalkerFoot, WalkerFoot];
  /** the hips' bob and sway this frame, from the steps */
  bob = 0; sway = 0;
  /** how long it has stood still (s), and which foot stepped last */
  private still = 0;
  private last = 1;
  /** `follow`'s turn a second, smoothed */
  private turning = 0;

  constructor(at: Spot, private readonly gait: Gait, private readonly foot: FootSize) {
    this.x = at.x; this.z = at.z; this.yaw = at.yaw;
    this.goal = { ...at };
    const make = (s: number): WalkerFoot => {
      const [x, z] = this.ideal(s, at.x, at.z, at.yaw, 0, 0);
      return { x, z, yaw: at.yaw, lift: 0, pitch: 0, step: null, down: 1 };
    };
    this.feet = [make(1), make(-1)];
  }

  /** stood at `at` at once, its feet under it */
  place(at: Spot): void {
    this.x = at.x; this.z = at.z; this.yaw = at.yaw; this.vx = this.vz = 0; this.turning = 0;
    this.goal = { ...at };
    this.feet.forEach((f, i) => {
      [f.x, f.z] = this.ideal(i === 0 ? 1 : -1, at.x, at.z, at.yaw, 0, 0);
      f.yaw = at.yaw; f.lift = f.pitch = 0; f.step = null; f.down = 1;
    });
  }

  get speed(): number { return Math.hypot(this.vx, this.vz); }
  get stepping(): boolean { return !!(this.feet[0].step || this.feet[1].step); }

  /** where foot `s` (1 the left, -1 the right) would stand under a body at (x, z) facing yaw, moving (vx, vz) */
  private ideal(s: number, x: number, z: number, yaw: number, vx: number, vz: number, lead = this.gait.lead): [number, number] {
    const c = Math.cos(yaw), si = Math.sin(yaw), ox = s * this.gait.stance;
    return [x + ox * c + vx * lead, z - ox * si + vz * lead];
  }

  private error(f: WalkerFoot, s: number, lead: number): number {
    const [ix, iz] = this.ideal(s, this.x, this.z, this.yaw, this.vx, this.vz, lead);
    return Math.hypot(f.x - ix, f.z - iz) + 0.25 * Math.abs(wrap(f.yaw - this.yaw));
  }

  /** The body moved towards its goal a frame, and the feet stepped under it. */
  update(dt: number): void {
    if (dt <= 0) return;
    const gait = this.gait, g = this.goal, dx = g.x - this.x, dz = g.z - this.z, d = Math.hypot(dx, dz);
    // (toward its goal, slowing to stop on it; never faster than its feet keep up, and turned to its way before it
    // sets off along it: walked off at once, a foot was left half a metre behind the body)
    const behind = Math.max(this.error(this.feet[0], 1, 0), this.error(this.feet[1], -1, 0));
    const offWay = d > 0.3 ? Math.abs(wrap(Math.atan2(dx, dz) - this.yaw)) : 0;
    const keepUp = clamp(1 - (behind - 0.22) / 0.15, 0.15, 1) * clamp(1 - (offWay - 0.5) / 1.0, 0.15, 1);
    const want = d > 0.004 ? Math.min(gait.speed * keepUp, Math.sqrt(2 * gait.accel * 0.7 * d)) : 0;
    let ax = (d > 0.004 ? (dx / d) * want : 0) - this.vx, az = (d > 0.004 ? (dz / d) * want : 0) - this.vz;
    const a = Math.hypot(ax, az), most = gait.accel * dt;
    if (a > most) { ax *= most / a; az *= most / a; }
    this.vx += ax; this.vz += az;
    this.x += this.vx * dt; this.z += this.vz * dt;
    if (d < 0.004 && this.speed < 0.02) { this.x = g.x; this.z = g.z; this.vx = this.vz = 0; }
    // (it faces the way it walks, turning to its goal's facing as it comes to it; it sidesteps a short way)
    const travel = Math.atan2(dx, dz), k = smooth(clamp((d - 0.3) / 0.4, 0, 1));
    const face = g.yaw + wrap(travel - g.yaw) * k;
    const turn = clamp(wrap(face - this.yaw) * 4, -gait.turn, gait.turn);
    this.yaw = wrap(this.yaw + turn * dt);
    this.stepFeet(dt, turn);
  }

  /** The body put at (x, z) facing `yaw` by its brain this frame, and the feet stepped under it. */
  follow(x: number, z: number, yaw: number, dt: number): void {
    if (dt <= 0) return;
    const k = 1 - Math.exp(-12 * dt);
    this.vx += ((x - this.x) / dt - this.vx) * k;
    this.vz += ((z - this.z) / dt - this.vz) * k;
    this.turning += (wrap(yaw - this.yaw) / dt - this.turning) * k;
    this.x = x; this.z = z; this.yaw = yaw;
    this.goal = { x, z, yaw };
    this.stepFeet(dt, this.turning);
  }

  /** Each foot's step carried on, and a foot left too far from where it should stand stepped there. */
  private stepFeet(dt: number, turn: number): void {
    const gait = this.gait, foot = this.foot;
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
      const baseX = st.fx + (st.tx - st.fx) * e, baseZ = st.fz + (st.tz - st.fz) * e;
      f.yaw = st.fyaw + wrap(st.tyaw - st.fyaw) * e;
      if (st.k < ROLL.off) f.pitch = foot.push * roll * smooth(st.k / ROLL.off);
      else if (st.k < ROLL.land) f.pitch = roll * (foot.push + (-foot.strike - foot.push) * e);
      else f.pitch = -foot.strike * roll * (1 - smooth((st.k - ROLL.land) / (1 - ROLL.land)));
      const rolledBy = rolled(f.pitch, foot);
      const high = gait.lift * clamp(st.len / 0.22, 0.35, 1);
      f.x = baseX + Math.sin(f.yaw) * rolledBy.along;
      f.z = baseZ + Math.cos(f.yaw) * rolledBy.along;
      f.lift = high * Math.sin(Math.PI * swing) + rolledBy.up;
      // (the hips rise over the standing foot as the other passes it, and shift over it)
      this.bob = 0.014 * Math.sin(Math.PI * st.k) * clamp(st.len / 0.3, 0.2, 1);
      this.sway = (i === 0 ? -1 : 1) * 0.026 * Math.sin(Math.PI * st.k) * clamp(st.len / 0.25, 0.3, 1);
      if (st.k >= 1) { f.step = null; f.lift = 0; f.pitch = 0; f.down = 0; this.last = i; }
    }
    if (this.stepping) return;
    // (a foot left too far from where it should stand steps there: the one further off, or the one that didn't step
    // last when both are about as far)
    const errs = this.feet.map((f, i) => this.error(f, i === 0 ? 1 : -1, gait.lead));
    let pick = errs[0] > errs[1] ? 0 : 1;
    if (errs[1 - pick] > errs[pick] * 0.7 && pick === this.last) pick = 1 - pick;
    const other = this.feet[1 - pick], err = errs[pick];
    const turning = Math.abs(wrap(this.feet[pick].yaw - this.yaw)) > STEP_AT.turn;
    const due = moving ? err > STEP_AT.moving || turning : (err > STEP_AT.still && this.still > 0.15) || turning;
    if (!due || other.down < 0.04) return;
    const s = pick === 0 ? 1 : -1, f = this.feet[pick];
    // (quicker when turning round on the spot, so the feet keep up with the body)
    const dur = (moving ? gait.step : gait.step * 0.85) * (err > 0.25 ? 0.8 : 1) * (turning && this.speed < 0.2 ? 0.75 : 1);
    const yawAt = wrap(this.yaw + turn * dur);
    const [tx, tz] = this.ideal(s, this.x + this.vx * dur, this.z + this.vz * dur, yawAt, this.vx, this.vz, gait.lead * 0.5);
    const len = Math.hypot(tx - f.x, tz - f.z);
    f.step = { fx: f.x, fz: f.z, fyaw: f.yaw, tx, tz, tyaw: yawAt, k: 0, dur, len };
  }
}

/** How far the ankle moves (along the foot, up) as the foot turns `pitch` (+ heel up about its toes, - toes up about
 *  its heel): a foot rolls over its toes and its heel, never through the floor. */
function rolled(pitch: number, foot: FootSize): { along: number; up: number } {
  const { toe, heel, ankle } = foot;
  if (pitch >= 0) {
    return { along: toe * (1 - Math.cos(pitch)) + ankle * Math.sin(pitch), up: toe * Math.sin(pitch) + ankle * (Math.cos(pitch) - 1) };
  }
  const q = -pitch;
  return { along: heel * Math.cos(q) - ankle * Math.sin(q) - heel, up: heel * Math.sin(q) + ankle * (Math.cos(q) - 1) };
}
