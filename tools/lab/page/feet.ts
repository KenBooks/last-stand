// tools/lab feet: the hero's feet against the ground they stand on, round the dais's edges and on level ground.
//
// Standing at full draw round the edges (on the dais, on its step and on the floor below, aimed out, along the edge and
// back in), each foot through the hold: the frames it moved (a foot that keeps stepping), its sole in a step's riser
// (over a higher level than the foot stands on) and its dip under its own level. Walking across the edges, strafing up
// and down the steps with a shot held drawn and aimed to the side, and the same on level ground, each stance of each
// foot: the frames the leg IK found it out of the leg's reach (a run of them is a foot stuck on the ground, peeling up
// onto its toes as the body goes on), how often its pitch turned back and forth (a wobble), how far it slid, and the
// sole in the ground; each ankle's fastest move a frame; the breaks in the left, right rhythm (the same foot leaving
// the ground twice running) and the frames with both feet off it. The worst stance of each walk is pictured.
//
// The leg IK's own state is read (`LegIK.feet`: a foot's state, its reach flag, its pitch, its spot and level), the
// soles from the ankles' joints and the IK's own foot shape (`footShape`).
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { ARENA } from '../../../src/data/balance';
import { groundHeight } from '../../../src/world/ground';
import type { FootShape, LegIK } from '../../../src/entities/models/ik';
import { shapesOf, SOLE_STEP, solePoints } from './soles';

const SIDE_NAMES = ['L', 'R'] as const;
type SideName = (typeof SIDE_NAMES)[number];
type LegFoot = LegIK['feet'][number];

/** the scenarios, by name */
export const FEET_SCENARIOS = ['edge', 'level', 'strafe', 'cross', 'run'] as const;
export type FeetScenario = (typeof FEET_SCENARIOS)[number];

export interface FeetOptions {
  /** the scenarios to run (all by default) */
  scenarios?: FeetScenario[];
  /** plant faults the measures must catch: a planted ankle slid, one sunk */
  canary?: boolean;
  /** list every stance and every standing case flagged */
  frames?: boolean;
  /** each frame of each walk, foot by foot */
  trace?: boolean;
}

/** where the dais's step ends, out from the middle (`world/ground.ts`) */
const STEP_OUT = ARENA.daisHalf + 0.7;

/** standing round the edges: how far inside the dais's edge (m; under 0 on its step, past -0.7 on the floor below) */
const EDGE_INSIDE = [0.2, 0.05, -0.1, -0.35, -0.65];
/** and the aim's bearing from straight out over the edge (deg), and how far out past the step (m) */
const EDGE_BEARINGS = [-150, -90, -30, 30, 90, 150];
const EDGE_AIM_OUT = 3;
/** frames held drawn before the hold is measured (the fetch, the draw and its settling), and frames measured */
const DRAW_FRAMES = 150;
const HOLD_FRAMES = 120;
/** an ankle moving this far in a frame is moving (m) */
const MOVING = 0.004;

/** A walk: where it starts, the keys held a leg at a time, and the point a held shot is aimed at (none: no shot). */
interface Walk {
  name: string;
  scenario: FeetScenario;
  start: [number, number];
  /** each leg's keys (a: -x, d: +x in the top-down view) */
  legs: string[];
  legFrames: number;
  aim: [number, number] | null;
}

/** where the walks round the steps start: out on the floor, past the step */
const OUTSIDE = STEP_OUT + 1.1;
const IN_AND_OUT = ['a', 'd', 'a', 'd', 'a', 'd'];

const WALKS: Walk[] = [
  {
    name: 'level ground, strafing drawn',
    scenario: 'level',
    start: [14, 17],
    legs: IN_AND_OUT,
    legFrames: 60,
    aim: [14, 40],
  },
  {
    name: 'the steps, strafing drawn, aimed along +z',
    scenario: 'strafe',
    start: [OUTSIDE, 0.3],
    legs: IN_AND_OUT,
    legFrames: 60,
    aim: [OUTSIDE, 25],
  },
  {
    name: 'the steps, strafing drawn, aimed along -z',
    scenario: 'strafe',
    start: [OUTSIDE, 0.3],
    legs: IN_AND_OUT,
    legFrames: 60,
    aim: [OUTSIDE, -25],
  },
  {
    name: 'the steps, walking across',
    scenario: 'cross',
    start: [OUTSIDE, 0.3],
    legs: IN_AND_OUT,
    legFrames: 40,
    aim: null,
  },
  {
    name: 'level ground, running reversals',
    scenario: 'run',
    start: [14, 17],
    legs: IN_AND_OUT,
    legFrames: 40,
    aim: null,
  },
];

/** a sole's point this far under the ground is in it (m: a planted sole's own line dips about a centimetre) */
const IN_GROUND = 0.015;
/** what's flagged: a sole this long in a riser or the ground (m), a dip this deep (m), a run out of reach this long
 *  (frames), this many turns of a planted foot's pitch, a slide this far (m) */
const FLAG_LENGTH = 0.02;
const FLAG_DIP = 0.015;
const FLAG_OUT = 3;
const FLAG_TURNS = 2;
const FLAG_SLIDE = 0.03;
/** a stance that slid this far is a bad one (m), counted apart */
const FLAG_SLIDE_BAD = 0.1;
/** a frame's slip at least this share of which its spot moved by was the IK's own doing */
const SPOT_SHARE = 0.5;
/** a planted foot's pitch changing less than this a frame isn't turning (rad) */
const PITCH_STILL = 0.01;
/** a sole's points within this much of its lowest over the ground are on it (m) */
const CONTACT = 0.01;

/** with --canary: the frame of the first walk whose planted ankle is slid, and of the first standing hold whose
 *  planted ankle is sunk, for the measure alone, and how far (m) */
const CANARY_FRAME = 100;
const CANARY_SLIDE = 0.06;
const CANARY_SINK = 0.05;

/** A sole against the ground this frame (m). */
interface Sole {
  /** its length over a higher level than the foot stands on, under that level's ground */
  riser: number;
  /** how far it dips under its own level's ground */
  dip: number;
  /** its length more than `IN_GROUND` under the ground where it is, whatever level */
  inGround: number;
  /** how far its deepest point is under the ground where it is (m) */
  deepest: number;
}

/** The sole of `ankle`'s foot (`shape`) on `level` against the ground under each of its points. */
function soleAgainst(ankle: THREE.Object3D, shape: FootShape, level: number): Sole {
  const scale = ankle.getWorldScale(new THREE.Vector3()).x;
  const sole: Sole = { riser: 0, dip: 0, inGround: 0, deepest: 0 };
  const point = new THREE.Vector3();
  for (let along = -shape.heel; along <= shape.toe; along += SOLE_STEP / scale) {
    ankle.localToWorld(point.set(0, -shape.sole, along));
    const ground = groundHeight(point.x, point.z);
    const under = ground - point.y;
    if (under > IN_GROUND) sole.inGround += SOLE_STEP;
    sole.deepest = Math.max(sole.deepest, under);
    if (ground > level + 1e-3 && under > 0) sole.riser += SOLE_STEP;
    else sole.dip = Math.max(sole.dip, under);
  }
  return sole;
}

/** How far a planted sole slipped since `last` (its points a frame before, m): the least any of its points on the
 *  ground moved. Rolling over its heel or toes, or turning on its ball, one point stays where it is; sliding, none
 *  does. (By its ankle's move, a foot turning on its ball read as 7 cm of slide.) */
export function slipOf(points: THREE.Vector3[], last: THREE.Vector3[]): number {
  if (last.length !== points.length) return 0;
  const heights = points.map((point) => point.y - groundHeight(point.x, point.z));
  const lowest = Math.min(...heights);
  let least = Infinity;
  points.forEach((point, index) => {
    if (heights[index] > lowest + CONTACT) return;
    least = Math.min(least, Math.hypot(point.x - last[index].x, point.z - last[index].z));
  });
  return least;
}

/** Moves `joint` by `offset` in the world, its matrices with it; returns the undo. */
function shiftInWorld(joint: THREE.Object3D, offset: THREE.Vector3): () => void {
  const parent = joint.parent!;
  const local = offset.clone().applyQuaternion(parent.getWorldQuaternion(new THREE.Quaternion()).invert());
  local.divideScalar(parent.getWorldScale(new THREE.Vector3()).x);
  joint.position.add(local);
  joint.updateMatrixWorld(true);
  return () => {
    joint.position.sub(local);
    joint.updateMatrixWorld(true);
  };
}

/** The legs the leg IK runs, and each foot's shape and ankle. */
interface Legs {
  ik: LegIK;
  ankles: THREE.Object3D[];
  shapes: FootShape[];
}

function legsOf(lab: Lab): Legs {
  const ik = lab.model.root.userData.legs as LegIK | undefined;
  if (!ik) throw new Error(`lab: feet: the ${lab.player.cls.id} has no leg IK`);
  const ankles = [lab.joints.ankleL, lab.joints.ankleR];
  return { ik, ankles, shapes: shapesOf(lab, ik, ankles) };
}

/** The set-up every case starts from: an arrow on the string for a bow's hero. */
function fixtureAt(lab: Lab, at: [number, number], facing: number) {
  return { at, facing, nocked: Boolean(lab.player.cls.quiver) };
}

// --- standing round the edges ------------------------------------------------------------------------------------

/** One standing case: where, and each foot through the hold. */
interface EdgeCase {
  inside: number;
  bearing: number;
  moving: number[];
  riser: number[];
  dip: number[];
}

interface Canary {
  /** what was planted, and what the measure made of it (m) */
  planted: number;
  measured: number;
}

async function standAtEdge(lab: Lab, inside: number, bearing: number, sink: boolean): Promise<[EdgeCase, Canary?]> {
  const x = ARENA.daisHalf - inside;
  const angle = Math.PI / 2 + bearing * Math.PI / 180;
  const aimX = STEP_OUT + EDGE_AIM_OUT * Math.sin(angle);
  const aimZ = EDGE_AIM_OUT * Math.cos(angle);
  await lab.setup(fixtureAt(lab, [x, 0], Math.atan2(aimX - x, aimZ)));
  const aim = new THREE.Vector3(aimX, groundHeight(aimX, aimZ), aimZ);
  // (a drawn shot held at full draw; a hero whose attack isn't drawn stands, aimed: held down, the warrior's swung blow
  // after blow, each stepping in, and read as a foot moving in 9 cases of 30)
  const drawn = Boolean(lab.player.skillAt('mouse0')?.def.draw);
  const frame = () => ({ m0: drawn, aim });
  await lab.step(DRAW_FRAMES, frame);
  const legs = legsOf(lab);
  const last = legs.ankles.map((ankle) => ankle.getWorldPosition(new THREE.Vector3()));
  const result: EdgeCase = { inside, bearing, moving: [0, 0], riser: [0, 0], dip: [0, 0] };
  let canary: Canary | undefined;
  await lab.step(HOLD_FRAMES, frame, (f) => {
    const planted = sink && f === HOLD_FRAMES / 2;
    const undo = planted ? shiftInWorld(legs.ankles[0], new THREE.Vector3(0, -CANARY_SINK, 0)) : null;
    legs.ankles.forEach((ankle, side) => {
      const now = ankle.getWorldPosition(new THREE.Vector3());
      const sole = soleAgainst(ankle, legs.shapes[side], legs.ik.feet[side].P.y);
      if (planted && side === 0) {
        canary = { planted: CANARY_SINK, measured: sole.dip };
        return;
      }
      if (now.distanceTo(last[side]) > MOVING) result.moving[side]++;
      last[side].copy(now);
      result.riser[side] = Math.max(result.riser[side], sole.riser);
      result.dip[side] = Math.max(result.dip[side], sole.dip);
    });
    undo?.();
  });
  return [result, canary];
}

const cm = (metres: number) => (metres * 100).toFixed(1);

function flagged(edge: EdgeCase): boolean {
  const moved = Math.max(...edge.moving) > 0;
  return moved || Math.max(...edge.riser) >= FLAG_LENGTH || Math.max(...edge.dip) >= FLAG_DIP;
}

function describeEdgeCase(edge: EdgeCase): string {
  const feet = SIDE_NAMES.map((name, side) => {
    const moved = `moved on ${edge.moving[side]} frames`;
    return `${name} ${moved}, ${cm(edge.riser[side])} cm in a riser, dips ${cm(edge.dip[side])}`;
  });
  return `  ${edge.inside} m inside, aimed ${edge.bearing}°: ${feet.join('; ')}`;
}

function describeEdge(cases: EdgeCase[], listed: boolean): string[] {
  const stepping = cases.filter((edge) => Math.max(...edge.moving) > 0).length;
  const inRiser = cases.filter((edge) => Math.max(...edge.riser) >= FLAG_LENGTH).length;
  const riserMost = Math.max(...cases.flatMap((edge) => edge.riser));
  const dipMost = Math.max(...cases.flatMap((edge) => edge.dip));
  const lines = [
    `edge, standing at full draw or aimed (${cases.length} spots and aims round the dais's edge, `
    + `${HOLD_FRAMES} frames each):`,
    `  a foot moving in the hold in ${stepping}; a sole in a riser in ${inRiser} (most ${cm(riserMost)} cm); `
    + `deepest dip under a foot's own level ${cm(dipMost)} cm`,
  ];
  if (listed) lines.push(...cases.filter(flagged).map(describeEdgeCase));
  return lines;
}

// --- walking -----------------------------------------------------------------------------------------------------

/** One stance of a foot on a walk, as it went. */
interface Stance {
  foot: SideName;
  /** the frame it began, and how long it lasted (frames) */
  start: number;
  frames: number;
  /** the frames the leg IK found it out of the leg's reach, and the longest run of them */
  outOfReach: number;
  longestOut: number;
  /** times its pitch turned the other way */
  turns: number;
  /** how far it slid, m: each frame's slip of its sole (`slipOf`) added up */
  slide: number;
  /** that slide by its cause (m): the IK moving the foot's spot, the leg short of it, anything else */
  slideBy: Record<SlipCause, number>;
  /** its worst frame's slip (m), the frame, and the foot's flags then */
  worstSlip: number;
  worstAt: number;
  worstFlags: string;
}

/** Why a planted sole slipped in a frame: the leg IK moved its spot, turning it on its ball (`turn`) or skidding it on
 *  with the body (`skid`, a dragged leg held from galloping), the leg fell short of a spot that stood (`short`: out
 *  of reach or dragged), or none of them (`other`: a roll, a level). */
type SlipCause = 'turn' | 'skid' | 'short' | 'other';
const SLIP_CAUSES: SlipCause[] = ['turn', 'skid', 'short', 'other'];
/** a planted foot turning more than this a frame turned on its ball (rad) */
const TURN_STILL = 0.003;

/** The cause of a frame's `slip` (m), its spot having moved `spotMove` (m) and turned `turned` (rad). */
function causeOf(slip: number, spotMove: number, turned: number, foot: LegFoot): SlipCause {
  if (spotMove >= SPOT_SHARE * slip) return turned > TURN_STILL ? 'turn' : 'skid';
  return foot.over || foot.dragged ? 'short' : 'other';
}

/** How far a heading turned from `from` to `to` (rad, the shorter way). */
const turnFrom = (from: number, to: number) => Math.abs(Math.atan2(Math.sin(to - from), Math.cos(to - from)));

/** A planted foot's flags, for its worst slip. */
function flagsOf(foot: LegFoot): string {
  const flags = [foot.over && 'out of reach', foot.dragged && 'dragged', foot.pastRange && 'past a range',
    foot.split && 'kept split', foot.own && 'held by the pose'];
  return flags.filter(Boolean).join(', ') || 'none';
}

/** A foot followed frame by frame on a walk: its stance as it goes, and what the next frame compares with. */
class FootWatch {
  stance: Stance | null = null;
  private lastPitch = 0;
  private lastTurn = 0;
  private outRun = 0;
  /** the sole's points last frame, while planted */
  private lastSole: THREE.Vector3[] = [];
  /** its spot and heading last frame, while planted */
  private lastSpot: THREE.Vector3 | null = null;
  private lastYaw = 0;

  constructor(private readonly name: SideName) {}

  /** Takes this frame of the foot (its `sole`'s points) in; returns the stance it ended, if it left the ground. */
  observe(frame: number, foot: LegFoot, sole: THREE.Vector3[]): Stance | null {
    if (foot.state !== 'plant') {
      const ended = this.stance;
      this.stance = null;
      this.lastSole = [];
      this.lastSpot = null;
      return ended;
    }
    if (!this.stance) this.begin(frame);
    const stance = this.stance!;
    stance.frames++;
    this.outRun = foot.over ? this.outRun + 1 : 0;
    if (foot.over) stance.outOfReach++;
    stance.longestOut = Math.max(stance.longestOut, this.outRun);
    const change = foot.pitch - this.lastPitch;
    if (Math.abs(change) > PITCH_STILL) {
      if (this.lastTurn && Math.sign(change) !== this.lastTurn) stance.turns++;
      this.lastTurn = Math.sign(change);
    }
    this.lastPitch = foot.pitch;
    this.addSlip(frame, foot, this.slipOf(sole));
    this.lastSole = sole.map((point) => point.clone());
    this.lastSpot = foot.P.clone();
    this.lastYaw = foot.yaw;
    return null;
  }

  /** How far the planted sole slipped since last frame, m (0 as it lands). */
  slipOf(sole: THREE.Vector3[]): number {
    return slipOf(sole, this.lastSole);
  }

  /** Adds this frame's `slip` (m) to the stance, by its cause. */
  private addSlip(frame: number, foot: LegFoot, slip: number): void {
    const stance = this.stance!;
    const spotMove = this.lastSpot ? Math.hypot(foot.P.x - this.lastSpot.x, foot.P.z - this.lastSpot.z) : 0;
    stance.slide += slip;
    const turned = this.lastSpot ? turnFrom(this.lastYaw, foot.yaw) : 0;
    stance.slideBy[causeOf(slip, spotMove, turned, foot)] += slip;
    if (slip <= stance.worstSlip) return;
    stance.worstSlip = slip;
    stance.worstAt = frame;
    stance.worstFlags = flagsOf(foot);
  }

  private begin(frame: number): void {
    this.stance = {
      foot: this.name, start: frame, frames: 0, outOfReach: 0, longestOut: 0, turns: 0, slide: 0,
      slideBy: { turn: 0, skid: 0, short: 0, other: 0 }, worstSlip: 0, worstAt: frame, worstFlags: '',
    };
    this.lastTurn = 0;
    this.outRun = 0;
  }
}

/** How bad a stance is, for picturing its worst moment: a run out of reach, and each turn as three frames of it. */
const badness = (stance: Stance) => stance.longestOut + stance.turns * 3;
/** a stance is pictured once it is at least this bad */
const PICTURE_FROM = 4;

/** Frames running with one foot's sole in the ground, and the foot's state on the first of them. */
interface InGroundRun {
  foot: SideName;
  state: LegFoot['state'];
  start: number;
  frames: number;
  /** the most of the sole in the ground, and how deep its deepest point went (m) */
  length: number;
  deepest: number;
}

interface WalkResult {
  walk: Walk;
  stances: Stance[];
  /** with --frames: each foot's runs of frames with its sole in the ground */
  inGroundRuns: InGroundRun[];
  /** frames a sole was in the ground, the most of it (m), and each ankle's fastest move a frame (m) */
  inGroundFrames: number;
  inGroundMost: number;
  fastest: number;
  /** where the fastest ankle move was: the frame, the foot and its state */
  fastestAt: string;
  /** the same foot leaving the ground twice running, and frames with both feet off it */
  breaks: number;
  /** with --frames: where each break was, the frame and the foot */
  breakFrames: string[];
  bothUp: number;
  moment: Pictured | null;
  trace: string[];
}

async function walkAcross(lab: Lab, walk: Walk, options: FeetOptions, slide: boolean): Promise<[WalkResult, Canary?]> {
  const facing = walk.aim ? Math.atan2(walk.aim[0] - walk.start[0], walk.aim[1] - walk.start[1]) : 0;
  await lab.setup(fixtureAt(lab, walk.start, facing));
  const legs = legsOf(lab);
  const watches = SIDE_NAMES.map((name) => new FootWatch(name));
  const last = legs.ankles.map((ankle) => ankle.getWorldPosition(new THREE.Vector3()));
  const result: WalkResult = {
    walk,
    stances: [],
    inGroundRuns: [],
    inGroundFrames: 0,
    inGroundMost: 0,
    fastest: 0,
    fastestAt: '',
    breaks: 0,
    breakFrames: [],
    bothUp: 0,
    moment: null,
    trace: [],
  };
  const aim = walk.aim ? new THREE.Vector3(walk.aim[0], 0, walk.aim[1]) : undefined;
  if (options.trace) result.trace.push(describeShapes(legs));
  let worst = PICTURE_FROM - 1;
  let canary: Canary | undefined;
  let frame = 0;
  const wasPlanted = legs.ik.feet.map((foot) => foot.state === 'plant');
  let lastToLeave = -1;
  const inGroundNow: (InGroundRun | null)[] = [null, null];
  const measure = () => {
    const plantedSide = legs.ik.feet.findIndex((foot) => foot.state === 'plant');
    const planted = slide && frame === CANARY_FRAME && plantedSide >= 0;
    const undo = planted ? shiftInWorld(legs.ankles[plantedSide], new THREE.Vector3(CANARY_SLIDE, 0, 0)) : null;
    let inGround = 0;
    legs.ankles.forEach((ankle, side) => {
      const now = ankle.getWorldPosition(new THREE.Vector3());
      const points = solePoints(ankle, legs.shapes[side]);
      if (planted && side === plantedSide) {
        canary = { planted: CANARY_SLIDE, measured: watches[side].slipOf(points) };
        return;
      }
      const foot = legs.ik.feet[side];
      const moved = now.distanceTo(last[side]);
      if (moved > result.fastest) {
        result.fastest = moved;
        result.fastestAt = `frame ${frame} ${SIDE_NAMES[side]}, ${foot.state}`;
      }
      last[side].copy(now);
      const sole = soleAgainst(ankle, legs.shapes[side], foot.P.y);
      inGround = Math.max(inGround, sole.inGround);
      inGroundNow[side] = followInGround(inGroundNow[side], sole, SIDE_NAMES[side], foot.state, frame, result);
      const ended = watches[side].observe(frame, foot, points);
      if (ended) result.stances.push(ended);
      const running = watches[side].stance;
      if (running && badness(running) > worst) {
        worst = badness(running);
        result.moment = pictureStance(lab, walk, frame, running);
      }
    });
    undo?.();
    legs.ik.feet.forEach((foot, side) => {
      const planted = foot.state === 'plant';
      if (wasPlanted[side] && !planted) {
        if (side === lastToLeave) {
          result.breaks++;
          result.breakFrames.push(`  frame ${frame} ${SIDE_NAMES[side]}: left the ground twice running`);
        }
        lastToLeave = side;
      }
      wasPlanted[side] = planted;
    });
    if (!wasPlanted[0] && !wasPlanted[1]) result.bothUp++;
    if (options.trace) result.trace.push(traceLine(lab, frame, legs));
    if (inGround >= FLAG_LENGTH) result.inGroundFrames++;
    result.inGroundMost = Math.max(result.inGroundMost, inGround);
    frame++;
  };
  for (const keys of walk.legs) {
    await lab.step(walk.legFrames, () => ({ keys: [keys], m0: Boolean(aim), aim }), measure);
  }
  return [result, canary];
}

/** A stance at this frame pictured whole, as the player sees it and from the front and the side (framed on a knee,
 *  the legs' reach and the stance's width didn't show). */
function pictureStance(lab: Lab, walk: Walk, frame: number, stance: Stance): Pictured {
  const note = `${stance.foot} foot planted ${stance.frames} frames, ${stance.longestOut} running out of reach, `
    + `${stance.turns} turns`;
  return lab.picture(`${walk.name}, worst`, ['third', 'front', 'left'], [`frame ${frame}`, note]);
}

const fixed = (value: number, digits = 2) => value.toFixed(digits);

/** A foot this frame, for a trace: its state, reach flag, pitch and place against its window, its spot and level, the
 *  ankle, the way the foot points (degrees, as the leg IK's yaw) and how far it is tipped toe down (rad), how deep its sole is in the ground, and how far the
 *  leg IK raises it over a step and moves its landing off a riser (cm). */
function traceFoot(name: SideName, foot: LegFoot, ankle: THREE.Object3D, shape: FootShape): string {
  const at = ankle.getWorldPosition(new THREE.Vector3());
  const ahead = new THREE.Vector3(0, 0, 1).transformDirection(ankle.matrixWorld);
  const heading = Math.atan2(ahead.x, ahead.z) * 180 / Math.PI;
  const sunk = soleAgainst(ankle, shape, foot.P.y).deepest;
  const doing = `${foot.state.padEnd(5)} out ${foot.over ? 1 : 0} pitch ${fixed(foot.pitch)} window ${fixed(foot.window)}`;
  const where = `on ${fixed(foot.P.y)} at ${fixed(foot.P.x)},${fixed(foot.P.z)}`;
  const tipped = Math.asin(Math.max(-1, Math.min(1, -ahead.y)));
  const pointing = `heading ${heading.toFixed(0)} tipped ${fixed(tipped)} sunk ${cm(Math.max(0, sunk))} clear ${cm(foot.clear)} `
    + `shift ${cm(foot.landShift)} target ${fixed(foot.pos.x)},${fixed(foot.pos.y, 3)},${fixed(foot.pos.z)}`
    + ` landing ${fixed(foot.B.x)},${fixed(foot.B.z)}`;
  return `${name} ${doing} ${where} ankle ${fixed(at.x)},${fixed(at.y, 3)},${fixed(at.z)} ${pointing}`;
}

/** Each foot's sole as the leg IK measured it, for a trace: back to its heel, on to its toes and down to the sole from
 *  the ankle (cm, at the hero's scale). */
function describeShapes(legs: Legs): string {
  const feet = legs.shapes.map((shape, side) => {
    const scale = legs.ankles[side].getWorldScale(new THREE.Vector3()).x;
    return `${SIDE_NAMES[side]} heel ${cm(shape.heel * scale)} toe ${cm(shape.toe * scale)} sole ${cm(shape.sole * scale)}`;
  });
  return `  feet: ${feet.join(', ')}`;
}

/** This frame of a walk, for a trace: where the body is, how fast it goes and how high its hips are, and each foot. */
function traceLine(lab: Lab, frame: number, legs: Legs): string {
  const body = lab.player.pos;
  const hips = lab.joints.hips.getWorldPosition(new THREE.Vector3());
  const speed = Math.hypot(lab.player.vel.x, lab.player.vel.z);
  const gait = legs.ik.walking ? 'moving' : 'standing';
  const drop = legs.ik.pelvisDrop;
  const pelvis = (legs.ik.pelvisYaw * 180 / Math.PI).toFixed(0);
  const dropped = `dropped ${cm(drop.dropped)} of ${cm(drop.wanted)} pelvis ${pelvis}`;
  const bodyAt = `body ${fixed(body.x)},${fixed(body.z)} going ${fixed(speed)} (${gait}) hips ${fixed(hips.y, 3)} ${dropped}`;
  const feet = legs.ik.feet.map((foot, side) => {
    return traceFoot(SIDE_NAMES[side], foot, legs.ankles[side], legs.shapes[side]);
  });
  return `  ${String(frame).padStart(3)} ${bodyAt} | ${feet.join(' | ')}`;
}

/** The run of frames with a foot's sole in the ground carried on into this frame, a new one begun, or ended (kept in
 *  `result` once it ends). Returns the run going on. */
function followInGround(
  run: InGroundRun | null, sole: Sole, foot: SideName, state: LegFoot['state'], frame: number, result: WalkResult,
): InGroundRun | null {
  if (sole.inGround < FLAG_LENGTH) return null;
  if (!run) {
    run = { foot, state, start: frame, frames: 0, length: 0, deepest: 0 };
    result.inGroundRuns.push(run);
  }
  run.frames++;
  run.length = Math.max(run.length, sole.inGround);
  run.deepest = Math.max(run.deepest, sole.deepest);
  return run;
}

function describeInGround(run: InGroundRun): string {
  return `  frame ${run.start} ${run.foot} (${run.state}): a sole in the ground ${run.frames} frames, `
    + `${cm(run.length)} cm of it, ${cm(run.deepest)} cm deep`;
}

function describeStance(stance: Stance): string {
  return `  frame ${stance.start} ${stance.foot}: planted ${stance.frames} frames, out of reach ${stance.outOfReach} `
    + `(${stance.longestOut} running), ${stance.turns} turns, slid ${cm(stance.slide)} cm `
    + `(${slideCauses(stance.slideBy)}; the most a frame ${cm(stance.worstSlip)} cm at ${stance.worstAt}, `
    + `${stance.worstFlags})`;
}

/** A slide by its causes, in cm. */
function slideCauses(by: Record<SlipCause, number>): string {
  const names: Record<SlipCause, string> = {
    turn: 'turned on its ball', skid: 'skidded', short: 'short of its spot', other: 'else',
  };
  return SLIP_CAUSES.map((cause) => `${names[cause]} ${cm(by[cause])}`).join(', ');
}

function stanceFlagged(stance: Stance): boolean {
  return stance.longestOut >= FLAG_OUT || stance.turns >= FLAG_TURNS || stance.slide >= FLAG_SLIDE;
}

function describeWalk(result: WalkResult, listed: boolean): string[] {
  // (not the set-up's own stances, standing as the walk began)
  const stances = result.stances.filter((stance) => stance.start > 0);
  const stuck = stances.filter((stance) => stance.longestOut >= FLAG_OUT);
  const wobbly = stances.filter((stance) => stance.turns >= FLAG_TURNS);
  const longestOut = Math.max(0, ...stances.map((stance) => stance.longestOut));
  const mostTurns = Math.max(0, ...stances.map((stance) => stance.turns));
  const mostSlide = Math.max(0, ...stances.map((stance) => stance.slide));
  const slid = stances.filter((stance) => stance.slide >= FLAG_SLIDE);
  const slidBad = stances.filter((stance) => stance.slide >= FLAG_SLIDE_BAD);
  const slideBy: Record<SlipCause, number> = { turn: 0, skid: 0, short: 0, other: 0 };
  for (const stance of stances) {
    for (const cause of SLIP_CAUSES) slideBy[cause] += stance.slideBy[cause];
  }
  const lines = [
    `${result.walk.name}: ${stances.length} stances`,
    `  out of reach ${FLAG_OUT} frames running or more in ${stuck.length} (most ${longestOut}); `
    + `turning back and forth ${FLAG_TURNS} times or more in ${wobbly.length} (most ${mostTurns}); `
    + `slid at most ${cm(mostSlide)} cm`,
    `  slid ${cm(FLAG_SLIDE)} cm or more in ${slid.length} stances (${cm(FLAG_SLIDE_BAD)} cm or more in `
    + `${slidBad.length}); all its slides: ${slideCauses(slideBy)}`,
    `  a sole in the ground on ${result.inGroundFrames} frames (most ${cm(result.inGroundMost)} cm); `
    + `fastest ankle ${cm(result.fastest)} cm a frame (${result.fastestAt})`,
    `  the same foot leaving twice running ${result.breaks} times; both feet off the ground on ${result.bothUp} frames`,
  ];
  if (listed) lines.push(...stances.filter(stanceFlagged).map(describeStance));
  if (listed) lines.push(...result.inGroundRuns.map(describeInGround), ...result.breakFrames);
  return [...lines, ...result.trace];
}

// --- the command -------------------------------------------------------------------------------------------------

/** What the feet measure found: its text, its pictured moments, and the canaries' readings. */
export interface FeetReport {
  lines: string[];
  moments: Pictured[];
  canaries: { name: string; canary: Canary | undefined }[];
}

/** Runs the scenarios asked for. */
export async function feet(lab: Lab, options: FeetOptions): Promise<FeetReport> {
  const scenarios = options.scenarios?.length ? options.scenarios : [...FEET_SCENARIOS];
  const report: FeetReport = { lines: [], moments: [], canaries: [] };
  if (scenarios.includes('edge')) {
    const cases: EdgeCase[] = [];
    for (const inside of EDGE_INSIDE) {
      for (const bearing of EDGE_BEARINGS) {
        const sink = Boolean(options.canary) && cases.length === 0;
        const [edge, canary] = await standAtEdge(lab, inside, bearing, sink);
        cases.push(edge);
        if (sink) report.canaries.push({ name: 'a planted ankle sunk', canary });
      }
    }
    report.lines.push(...describeEdge(cases, Boolean(options.frames)));
  }
  let slid = false;
  for (const walk of WALKS.filter((candidate) => scenarios.includes(candidate.scenario))) {
    const slide = Boolean(options.canary) && !slid;
    const [result, canary] = await walkAcross(lab, walk, options, slide);
    if (slide) report.canaries.push({ name: 'a planted ankle slid', canary });
    slid = true;
    report.lines.push(...describeWalk(result, Boolean(options.frames)));
    if (result.moment) report.moments.push(result.moment);
  }
  for (const { name, canary } of report.canaries) {
    const reading = canary ? `${cm(canary.measured)} cm of ${cm(canary.planted)}` : 'never planted';
    report.lines.push(`canary, ${name}: measured ${reading}`);
  }
  return report;
}

/** The canaries the measure missed: each must read at least half what was planted. */
export function missedCanaries(report: FeetReport): string[] {
  return report.canaries
    .filter(({ canary }) => !canary || canary.measured < canary.planted / 2)
    .map(({ name }) => `the canary (${name}) was missed`);
}
