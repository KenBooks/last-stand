// What `lab tavern` reads of the keeper's walk each frame (page/tavern.ts's `Watch`), and of his ways about the room:
// his feet never across each other nor striking, his knees bent through his walk (in his stance and more in his swing),
// no stop on a way to turn and set off again, no whole-body turn left and right as he walks, the floor he walks clear
// of every stool and table, and a way planned from six places to each of the others keeping clear of them too. From
// Kenneth's round 3 of #704: "his leg is basically straight in the walking animation", "when he turns, his feet end up
// crossing each other... They just hit each other", "he does a bunch of these turns where he stops walking and looks
// left and right", "he walks through a bar chair".
import * as THREE from 'three';
import type { Keeper } from '../../../src/entities/models/keeper';
import type { TavernKeeper } from '../../../src/world/tavernKeeper';
import type { Point } from '../../../src/world/tavernNav';
import type { Seat } from '../../../src/world/seats';
import { BAR_STOOL_X, BAR_STOOLS, PLACES, TABLES } from '../../../src/data/tavern';

/** the least his ankles stand apart across his facing (m: a foot across the other is below 0) and the least they
 *  stand apart at all (m: closer, his boots strike) */
// (both feet planted, his footprints: a swinging foot passes the planted one close in every step, a hero's too, whose
// footprints `lab gait` holds 10 to 15 cm apart across the way, nearly in a line)
export const FEET_ACROSS_LEAST = 0.02, FEET_LEAST = 0.1;
/** the least his knees bend walking at his pace: the standing leg's on average, and the swinging leg's at its most
 *  (degrees: a walker's knee takes his weight a little bent and folds to clear the toes) */
export const STANCE_KNEE_LEAST = 7, SWING_KNEE_LEAST = 38;
/** how fast he walks to count as walking at pace, and as stopped (m/s), and how many frames stopped make a stop */
const AT_PACE = 0.7, STOPPED = 0.15, STOP_FRAMES = 6;
/** a turn this fast counts as turning (rad/s), and a turn one way then the other within this many frames, walking,
 *  is a whole-body turn left and right */
const TURNING = 1.0, ZIGZAG_WITHIN = 30;
/** how near any stool's or table's edge the middle of his body may come walking (m: his hips' half-width less a
 *  brush), and a planned way's middle */
export const WALKED_CLEAR = 0.13, PLANNED_CLEAR = 0.2;
/** the places a way is planned between: his places about the room */
const STARTS: readonly (keyof typeof PLACES)[] = ['tap', 'hearth', 'smallTable', 'longTable', 'broom', 'poker'];

/** A circle on the floor his body keeps off (room m). */
interface Circle { x: number; z: number; r: number; name: string }

/** The worst of something seen, and where. */
class Worst {
  value = -Infinity;
  at = '';
  see(value: number, at: () => string): void {
    if (value <= this.value) return;
    this.value = value;
    this.at = at();
  }
}

const _q = new THREE.Quaternion(), _roomQ = new THREE.Quaternion(), _fwd = new THREE.Vector3();
/** the way his pelvis faces on the floor (rad, the room's: 0 to +z) */
function pelvisHeading(keeper: Keeper, room: THREE.Object3D): number {
  room.getWorldQuaternion(_roomQ).invert();
  _fwd.set(0, 0, 1).applyQuaternion(keeper.joints.hips.getWorldQuaternion(_q)).applyQuaternion(_roomQ);
  return Math.atan2(_fwd.x, _fwd.z);
}

/** the mean of his feet's headings on the floor (rad, the room's: 0 to +z) */
export function feetHeading(keeper: Keeper, room: THREE.Object3D): number {
  room.getWorldQuaternion(_roomQ).invert();
  let sx = 0, sz = 0;
  for (const ankle of keeper.ankles) {
    _fwd.set(0, 0, 1).applyQuaternion(ankle.getWorldQuaternion(_q)).applyQuaternion(_roomQ);
    sx += _fwd.x;
    sz += _fwd.z;
  }
  return Math.atan2(sx, sz);
}

/** a hinge joint's bend (degrees), from its turn */
const bendOf = (joint: THREE.Object3D) => THREE.MathUtils.radToDeg(2 * Math.acos(Math.min(1, Math.abs(joint.quaternion.w))));

/** His walk frame by frame. */
export class GaitWatch {
  /** feet: the least apart across him (negative: crossed), and the least apart at all */
  readonly across = new Worst();
  readonly near = new Worst();
  /** this frame set a new worst crossing (the measure pictures it) */
  newWorst = false;
  /** knees walking at pace: the standing leg's bends, and the swinging leg's most */
  private stanceSum = 0;
  private stanceFrames = 0;
  readonly swing = new Worst();
  /** stops on a way: frames stopped since he was last at pace in this walk, and the stops counted */
  stops = 0;
  stopAt = '';
  private stoppedFor = 0;
  private wasAtPace = false;
  private walkWas = '';
  /** turns one way then the other walking: the last turn's sign and its frame */
  zigzags = 0;
  zigzagAt = '';
  private lastTurn = 0;
  private lastTurnFrame = -999;
  private frame = 0;
  private yawWas: number | null = null;
  private readonly rates: number[] = [];
  /** his body's middle against the stools and tables, walking */
  readonly walked = new Worst();
  private circles: Circle[] | null = null;
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly c = new THREE.Vector3();
  private readonly rootWas = new THREE.Vector3();

  forget(): void {
    this.yawWas = null;
    this.stoppedFor = 0;
    this.wasAtPace = false;
  }

  read(tv: TavernKeeper, keeper: Keeper, seats: readonly Seat[], doing: string): void {
    this.frame++;
    const room = keeper.root.parent!, yaw = keeper.root.rotation.y, speed = tv.body().speed;
    // --- his feet against each other, in the room's frame across his facing ---
    const feet: [THREE.Vector3, THREE.Vector3] = [this.a, this.b];
    keeper.feet(feet);
    room.worldToLocal(this.a);
    room.worldToLocal(this.b);
    // (across the way his pelvis faces: the heroes' gait turns a planted foot on its ball, so the feet's own headings
    // say nothing of which side of him each stands)
    // (and his footprints as the feet themselves point: turning on the spot his pelvis leads them, the feet pivoting
    // after it)
    // (moving, across the way he travels, as `lab gait` measures a hero's footprints: the heroes' gait turns his pelvis
    // towards his travel, and across a pelvis turned 20 degrees a 50 cm stride read as 17 cm sideways)
    const at = room.worldToLocal(keeper.root.getWorldPosition(this.c));
    const onWalk = /walk|way/.test(tv.doing().step);
    const travel = onWalk && Math.hypot(at.x - this.rootWas.x, at.z - this.rootWas.z) * 60 > 0.3
      ? Math.atan2(at.x - this.rootWas.x, at.z - this.rootWas.z) : null;
    this.rootWas.copy(at);
    const heading = travel ?? pelvisHeading(keeper, room);
    const across = (this.a.x - this.b.x) * Math.cos(heading) - (this.a.z - this.b.z) * Math.sin(heading);
    const bothDown = keeper.legs.feet.every((foot) => foot.state === 'plant');
    const apart = Math.hypot(this.a.x - this.b.x, this.a.z - this.b.z);
    // (standing and turning on the spot, where his feet crossed: a walking stride is nearly in a line, a hero's too, and
    // on a curve the line from one footprint to the next runs a few cm across his way, pictured as an ordinary stride)
    if (bothDown && travel === null) {
      const was = this.across.value;
      this.across.see(-across, () => `${doing}, his footprints ${(across * 100).toFixed(1)} cm apart across him`);
      this.newWorst = this.across.value > was && across < FEET_ACROSS_LEAST;
      this.near.see(-apart, () => `${doing}, his planted ankles ${(apart * 100).toFixed(1)} cm apart`);
    }
    // --- his knees at pace ---
    const knees = [bendOf(keeper.joints.kneeL), bendOf(keeper.joints.kneeR)];
    if (speed > AT_PACE) {
      this.stanceSum += Math.min(...knees);
      this.stanceFrames++;
      this.swing.see(Math.max(...knees), () => doing);
    }
    // --- stops on a way: at pace, stopped a while, still on the same walk ---
    const walking = /walk|way/.test(tv.doing().step);
    const walk = walking ? `${tv.doing().job}: ${tv.doing().step}` : '';
    if (walk !== this.walkWas) { this.wasAtPace = false; this.stoppedFor = 0; }
    this.walkWas = walk;
    if (walking) {
      if (speed > AT_PACE) {
        if (this.stoppedFor >= STOP_FRAMES && this.wasAtPace) { this.stops++; this.stopAt ||= doing; }
        this.wasAtPace = true;
        this.stoppedFor = 0;
      } else if (speed < STOPPED && this.wasAtPace) this.stoppedFor++;
    }
    // --- whole-body turns one way then the other, walking ---
    if (this.yawWas !== null) {
      const rate = Math.atan2(Math.sin(yaw - this.yawWas), Math.cos(yaw - this.yawWas)) * 60;
      this.rates.push(rate);
      if (this.rates.length > 30) this.rates.shift();
      // (while walking on: turned on the spot as he comes to his place, after curving in the other way, is his arrival)
      if (walking && speed > 0.3 && Math.abs(rate) > TURNING) {
        const sign = Math.sign(rate);
        if (this.lastTurn && sign !== this.lastTurn && this.frame - this.lastTurnFrame < ZIGZAG_WITHIN) { this.zigzags++; this.zigzagAt ||= `${doing} at ${keeper.root.position.x.toFixed(2)}, ${keeper.root.position.z.toFixed(2)}, speed ${speed.toFixed(2)}, its turns (rad/s) ${this.rates.map((r) => r.toFixed(1)).join(' ')}`; }
        if (sign !== this.lastTurn || this.frame - this.lastTurnFrame < ZIGZAG_WITHIN) this.lastTurnFrame = this.frame;
        this.lastTurn = sign;
      }
    }
    this.yawWas = yaw;
    // --- his middle against the stools and tables while he walks ---
    if (walking && speed > 0.1) {
      this.circles ??= furniture(seats);
      const at = room.worldToLocal(keeper.root.getWorldPosition(this.a));
      for (const c of this.circles) this.walked.see(-(Math.hypot(at.x - c.x, at.z - c.z) - c.r), () => `${doing}, his middle ${(Math.hypot(at.x - c.x, at.z - c.z) - c.r).toFixed(2)} m from ${c.name}'s edge at ${at.x.toFixed(2)}, ${at.z.toFixed(2)}`);
    }
  }

  stanceKnee(): number {
    return this.stanceFrames ? this.stanceSum / this.stanceFrames : 0;
  }

  problems(): string[] {
    const out: string[] = [];
    if (-this.across.value < FEET_ACROSS_LEAST) out.push(`his feet crossed: ${this.across.at}`);
    if (-this.near.value < FEET_LEAST) out.push(`his feet struck each other: ${this.near.at}`);
    if (this.stanceFrames && this.stanceKnee() < STANCE_KNEE_LEAST) out.push(`his standing knee was straight walking (${this.stanceKnee().toFixed(1)}° on average, at least ${STANCE_KNEE_LEAST})`);
    if (this.stanceFrames && this.swing.value < SWING_KNEE_LEAST) out.push(`his swinging knee hardly bent walking (${this.swing.value.toFixed(0)}° at most, at least ${SWING_KNEE_LEAST})`);
    if (!this.stanceFrames) out.push('he never walked at his pace');
    if (this.stops) out.push(`he stopped on his way ${this.stops} times (first: ${this.stopAt})`);
    if (this.zigzags) out.push(`he turned left and right walking ${this.zigzags} times (first: ${this.zigzagAt})`);
    if (-this.walked.value < WALKED_CLEAR) out.push(`he walked into the furniture: ${this.walked.at}`);
    return out;
  }

  said(): string {
    return `his walk: his feet at least ${(-this.across.value * 100).toFixed(1)} cm apart across him (${this.across.at}) and `
      + `${(-this.near.value * 100).toFixed(1)} cm apart at all; his knees walking ${this.stanceKnee().toFixed(1)}° standing on average, `
      + `${this.swing.value.toFixed(0)}° swinging at most; ${this.stops} stops and ${this.zigzags} left-right turns on his ways; `
      + `his middle at least ${(-this.walked.value).toFixed(2)} m from a stool's or table's edge (${this.walked.at})`;
  }
}

/** The ways planned from each of his places to each of the others: each found, and how near its middle comes to a
 *  stool's or a table's edge (sampled every 5 cm). */
export function plannedWays(tv: TavernKeeper, seats: readonly Seat[]): { lines: string[]; problems: string[] } {
  const circles = furniture(seats), lines: string[] = [], problems: string[] = [];
  let worst = Infinity, worstAt = '', ways = 0;
  for (const from of STARTS) {
    for (const to of STARTS) {
      if (from === to) continue;
      const a: Point = [PLACES[from].x, PLACES[from].z], way = tv.way(a, [PLACES[to].x, PLACES[to].z]);
      if (!way.length) { problems.push(`no way planned from ${from} to ${to}`); continue; }
      ways++;
      let prev = a;
      for (const p of way) {
        const d = Math.hypot(p[0] - prev[0], p[1] - prev[1]), n = Math.max(1, Math.ceil(d / 0.05));
        for (let k = 0; k <= n; k++) {
          const x = prev[0] + (p[0] - prev[0]) * k / n, z = prev[1] + (p[1] - prev[1]) * k / n;
          // (his own places' ends left out: he stands at a table to wipe it)
          if (Math.hypot(x - a[0], z - a[1]) < 0.3 || Math.hypot(x - PLACES[to].x, z - PLACES[to].z) < 0.3) continue;
          for (const c of circles) {
            const clear = Math.hypot(x - c.x, z - c.z) - c.r;
            if (clear < worst) { worst = clear; worstAt = `${from} to ${to}, ${c.name} at ${x.toFixed(2)}, ${z.toFixed(2)}`; }
          }
        }
        prev = p;
      }
    }
  }
  lines.push(`his ways planned: ${ways} of ${STARTS.length * (STARTS.length - 1)}, their middles at least ${worst.toFixed(2)} m from a stool's or table's edge (${worstAt})`);
  if (worst < PLANNED_CLEAR) problems.push(`a way planned passes ${worst.toFixed(2)} m from ${worstAt} (at least ${PLANNED_CLEAR})`);
  return { lines, problems };
}

/** the stools (the room's seats and the bar's) and the tables, as circles */
function furniture(seats: readonly Seat[]): Circle[] {
  const out: Circle[] = [];
  for (const seat of seats) for (const c of seat.circles) out.push({ x: c.x, z: c.z, r: c.r, name: `a seat at ${c.x.toFixed(1)}, ${c.z.toFixed(1)}` });
  for (const z of BAR_STOOLS) out.push({ x: BAR_STOOL_X, z, r: 0.17, name: `the bar stool at ${z}` });
  for (const [name, t] of Object.entries(TABLES)) out.push({ x: t.x, z: t.z, r: t.reach + 0.12, name: `the ${name}` });
  return out;
}
