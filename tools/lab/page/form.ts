// `lab form`: the hero's run judged against a runner's (`runner.ts`), with each way he holds his weapons. He runs
// straight across open ground at full speed; each leg's frames are folded onto its own cycle, from its foot's
// touchdown to the next, the stance and the swing each stretched onto a runner's so the curves line up at the
// touchdown and the push off; and each joint's curve is set beside a runner's at that speed: the thighs, knees and
// ankles, the trunk's lean, the arms' swing and the elbows' bend, the stride's timing and the hips' bounce. A run is
// judged at a man's size: the hero's speed and lengths scaled by his legs against a man's (`MAN_LEG`). Each way is
// pictured at eight points of the stride: stick figures of his run over a runner's, the hero from the side, and the
// game's own views; measured first, then run again to picture the frames chosen.
import * as THREE from 'three';
import type { Lab, Pictured, Tile, ViewName } from './lab';
import type { LegIK } from '../../../src/entities/models/ik';
import { legLength } from '../../../src/entities/models/ik';
import type { WeaponStyle } from '../../../src/loot/loadout';
import type { Joints } from '../../../src/entities/models/rig';
import { armAt, MAN_LEG, runnerAt, type LegCurve, type RunnerForm } from './runner';
import { judgeTrunk, trunkLine, trunkSampleOf, type TrunkSample } from './trunkSwing';
import { setUpClear, straightCanary, straightLine, straightProblems } from './straightRun';

/** What `lab form` is asked: the ways of holding the weapons to run with (the class's all by default). */
export interface FormOptions {
  gear?: WeaponStyle[];
  /** plant a fault the measure must catch: the left knee held straight through its stance */
  canary?: boolean;
  /** list each cycle's touchdowns and push offs, and the curves bin by bin */
  frames?: boolean;
  /** picture the run (true by default): stick figures, and the hero run again to picture him; a check reads the
   *  numbers, and both sides' pictures to compare were more than the browser held, which closed */
  pictures?: boolean;
  /** tunable values set at each run's set-up, by their paths (`Fixture.tune`): a pose's amounts compared without
   *  editing the source */
  tune?: Record<string, number[]>;
}

/** What `lab form` found: its lines, its pictures, and what went wrong with a run itself. */
export interface FormReport {
  lines: string[];
  moments: Pictured[];
  problems: string[];
}

/** where the run starts and the way it goes: along z -8.5 past the dais's side (the floor's clearest lane: along z 14 a
 *  prop stood in it), or the nearest lane beside it clear of every prop (`setUpClear`); `d` with the top-down camera
 *  turned to the battleground's own (`YAW`), so +x, the way he faces (`WAY`): the boot's camera ran the warrior the
 *  other way, into the wall (`page/straightRun.ts`) */
const START: [number, number] = [-20.6, -8.5];
const KEYS = ['d'];
const YAW = 0;
const WAY = Math.PI / 2;
/** frames to get up to speed, then frames measured */
const SETTLE = 70;
const MEASURED = 160;
/** a run is held up when it covers less than this share of the hero's speed */
const HELD_UP = 0.9;
/** the points of the stride pictured (shares of the left leg's cycle, a runner's timeline) */
const PICTURED = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875];
/** the bins a cycle's curves are averaged in */
const BINS = 20;
/** how far a curve may lie from a runner's, bin by bin on average (deg), before it reads as unlike one */
const UNLIKE_RMS = 10;
const DEG = 180 / Math.PI;

/** A point of the body seen from the side: how far ahead of the hips and how high over the ground (m, a man's). */
type Side = [number, number];

/** The body's points the stick figures are drawn through. */
interface Stick {
  head: Side;
  neck: Side;
  hips: Side;
  shoulders: [Side, Side];
  elbows: [Side, Side];
  hands: [Side, Side];
  hipJoints: [Side, Side];
  knees: [Side, Side];
  ankles: [Side, Side];
  toes: [Side, Side];
}

/** One leg in a frame: its joints (deg) and whether its foot is down. */
interface LegFrame {
  thigh: number;
  knee: number;
  ankle: number;
  planted: boolean;
}

/** One arm in a frame: the upper arm's swing against the trunk and the elbow's bend (deg). */
interface ArmFrame {
  shoulder: number;
  elbow: number;
}

/** One frame of the run, as measured. */
interface FormFrame {
  /** the hips' height over the ground (m, a man's) */
  hips: number;
  legs: [LegFrame, LegFrame];
  arms: [ArmFrame, ArmFrame];
  /** the trunk's lean forward, and the head's tip forward from upright (deg) */
  lean: number;
  head: number;
  /** the pelvis's turn off the way the body faces, and the chest's on the pelvis (deg) */
  pelvis: number;
  chest: number;
  /** the trunk and the feet, for the trunk against the legs (`trunkSwing.ts`) */
  trunk: TrunkSample;
  /** the way he faces (rad, 0 along +z) */
  facing: number;
  stick: Stick;
}

/** A leg's cycle: the frames its foot landed, left and landed again (fractional: between two frames). */
interface Cycle {
  down: number;
  up: number;
  next: number;
}

/** The run measured: its frames, each leg's cycles, its speed (m/s, a man's) and the share of a man the hero is. */
interface Measured {
  /** where the run started (x, z) */
  from: [number, number];
  frames: FormFrame[];
  cycles: [Cycle[], Cycle[]];
  speed: number;
  toMan: number;
}

const SIDES = ['L', 'R'] as const;

/** The ways the class holds its weapons, or none when it has one way. */
export function stylesOf(lab: Lab): WeaponStyle[] {
  const cls = lab.player.cls;
  if (!cls.skills.some((skill) => skill.needs)) return [];
  const styles: WeaponStyle[] = ['oneHanded'];
  if (cls.bases?.offhand?.length) styles.push('shield');
  if (cls.twoHanded?.length) styles.push('twoHanded');
  if (cls.dualWield) styles.push('dual');
  return styles;
}

// --- measuring a frame -------------------------------------------------------------------------------------------

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _q = new THREE.Quaternion();

/** The view from the hero's side: the way he faces along the ground, and where the hips stand on it. */
interface SideView {
  forward: THREE.Vector3;
  origin: THREE.Vector3;
  ground: number;
  toMan: number;
}

const at = (joint: THREE.Object3D, out = new THREE.Vector3()): THREE.Vector3 => joint.getWorldPosition(out);

function sideOf(view: SideView, point: THREE.Vector3): Side {
  const ahead = _c.copy(point).sub(view.origin).dot(view.forward);
  return [ahead * view.toMan, (point.y - view.ground) * view.toMan];
}

/** A line's angle from straight down, forward positive (deg), seen from the side. */
function fromDown(view: SideView, from: THREE.Object3D, to: THREE.Object3D): number {
  const line = at(to, _a).sub(at(from, _b));
  return Math.atan2(line.dot(view.forward), -line.y) * DEG;
}

/** The angle at `middle` between its two neighbours, as a bend from straight (deg). */
function bendAt(from: THREE.Object3D, middle: THREE.Object3D, to: THREE.Object3D): number {
  const centre = at(middle, new THREE.Vector3());
  return 180 - at(from, _a).sub(centre).angleTo(at(to, _b).sub(centre)) * DEG;
}

/** The foot against square to its shin, toes up positive (deg). */
function ankleOf(knee: THREE.Object3D, ankle: THREE.Object3D): number {
  const shinDown = at(ankle, new THREE.Vector3()).sub(at(knee, _a)).normalize();
  const toes = _b.set(0, 0, 1).applyQuaternion(ankle.getWorldQuaternion(_q));
  return toes.angleTo(shinDown) * DEG - 90;
}

/** The upper arm's swing against the trunk, forward positive (deg): its line in the chest's frame, seen from the
 *  side. */
function armSwing(lab: Lab, shoulder: THREE.Object3D, elbow: THREE.Object3D): number {
  const arm = at(elbow, new THREE.Vector3()).sub(at(shoulder, _a));
  lab.joints.chest.getWorldQuaternion(_q);
  const forward = _b.set(0, 0, 1).applyQuaternion(_q);
  const down = _c.set(0, -1, 0).applyQuaternion(_q);
  return Math.atan2(arm.dot(forward), arm.dot(down)) * DEG;
}

/** A joint's turn about the vertical off the way the body faces (deg). */
function yawOf(joint: THREE.Object3D, facing: number): number {
  const forward = _a.set(0, 0, 1).applyQuaternion(joint.getWorldQuaternion(_q));
  const turn = Math.atan2(forward.x, forward.z) - facing;
  return Math.atan2(Math.sin(turn), Math.cos(turn)) * DEG;
}

/** A foot's toes, in the world: ahead of the ankle along the foot and down to the sole. */
function toesOf(lab: Lab, ankle: THREE.Object3D): THREE.Vector3 {
  return ankle.localToWorld(new THREE.Vector3(0, -0.06, 0.16));
}

function measureFrame(lab: Lab, legs: LegIK, toMan: number): FormFrame {
  const j = lab.joints;
  const facing = lab.player.facing;
  const forward = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
  const origin = at(j.hips, new THREE.Vector3());
  const view: SideView = { forward, origin, ground: lab.player.pos.y, toMan };
  const leg = (thigh: THREE.Object3D, knee: THREE.Object3D, ankle: THREE.Object3D, side: number): LegFrame => ({
    thigh: fromDown(view, thigh, knee),
    knee: bendAt(thigh, knee, ankle),
    ankle: ankleOf(knee, ankle),
    planted: legs.feet[side].state === 'plant',
  });
  const arm = (shoulder: THREE.Object3D, elbow: THREE.Object3D, hand: THREE.Object3D): ArmFrame => ({
    shoulder: armSwing(lab, shoulder, elbow),
    elbow: bendAt(shoulder, elbow, hand),
  });
  const neck = at(j.neck, new THREE.Vector3()).sub(origin);
  const headUp = new THREE.Vector3(0, 1, 0).applyQuaternion(j.head.getWorldQuaternion(_q));
  const pair = (left: THREE.Object3D, right: THREE.Object3D): [Side, Side] =>
    [sideOf(view, at(left, new THREE.Vector3())), sideOf(view, at(right, new THREE.Vector3()))];
  return {
    hips: (origin.y - view.ground) * toMan,
    legs: [leg(j.thighL, j.kneeL, j.ankleL, 0), leg(j.thighR, j.kneeR, j.ankleR, 1)],
    arms: [arm(j.shoulderL, j.elbowL, j.handL), arm(j.shoulderR, j.elbowR, j.handR)],
    lean: Math.atan2(neck.dot(forward), neck.y) * DEG,
    head: Math.atan2(headUp.dot(forward), headUp.y) * DEG,
    pelvis: yawOf(j.hips, facing),
    chest: yawOf(j.chest, facing) - yawOf(j.hips, facing),
    trunk: trunkSampleOf(j, [legs.feet[0].state === 'plant', legs.feet[1].state === 'plant']),
    facing,
    stick: {
      head: sideOf(view, j.head.localToWorld(new THREE.Vector3(0, 0.12, 0))),
      neck: sideOf(view, at(j.neck, new THREE.Vector3())),
      hips: sideOf(view, origin),
      shoulders: pair(j.shoulderL, j.shoulderR),
      elbows: pair(j.elbowL, j.elbowR),
      hands: pair(j.handL, j.handR),
      hipJoints: pair(j.thighL, j.thighR),
      knees: pair(j.kneeL, j.kneeR),
      ankles: pair(j.ankleL, j.ankleR),
      toes: [sideOf(view, toesOf(lab, j.ankleL)), sideOf(view, toesOf(lab, j.ankleR))],
    },
  };
}

// --- the run -------------------------------------------------------------------------------------------------------

/** The hero set up at the start holding his weapons `style`'s way (as he is, with none). */
async function setUp(
  lab: Lab, style: WeaponStyle | null, tune?: Record<string, number[]>,
): Promise<{ legs: LegIK; from: [number, number] }> {
  const nocked = Boolean(lab.player.cls.quiver);
  const fixture = { at: START, yaw: YAW, nocked, gear: style ?? undefined, tune };
  const from = await setUpClear(lab, fixture, WAY, (SETTLE + MEASURED) / 60);
  const legs = lab.model.root.userData.legs as LegIK | undefined;
  if (!legs) throw new Error(`lab: form: the ${lab.player.cls.id} has no leg IK`);
  return { legs, from };
}

/** Each leg's whole cycles in the frames: touchdown, push off, touchdown again (each between two frames). */
function cyclesOf(frames: FormFrame[], side: number): Cycle[] {
  const downs: number[] = [];
  const ups: number[] = [];
  for (let f = 1; f < frames.length; f++) {
    const was = frames[f - 1].legs[side].planted;
    const is = frames[f].legs[side].planted;
    if (is && !was) downs.push(f - 0.5);
    if (was && !is) ups.push(f - 0.5);
  }
  const cycles: Cycle[] = [];
  for (let i = 0; i + 1 < downs.length; i++) {
    const up = ups.find((frame) => frame > downs[i] && frame < downs[i + 1]);
    if (up !== undefined) cycles.push({ down: downs[i], up, next: downs[i + 1] });
  }
  return cycles;
}

/** A row of a style's pictures: its name, its views, the joint its close-ups are framed on, and at which of the
 *  pictured points of the stride (`PICTURED`'s indices) it is taken. */
interface PictureRow {
  name: string;
  views: ViewName[];
  focus?: keyof Joints;
  points: number[];
}

/** Runs the hero across, measuring each frame; with `pictured`, also pictures those frames into its rows' tiles. */
async function runAcross(
  lab: Lab, style: WeaponStyle | null, tune?: Record<string, number[]>, pictured?: Map<number, PictureRow[]>,
): Promise<{ measured: Measured; tiles: Map<string, Tile[]> }> {
  const { legs, from } = await setUp(lab, style, tune);
  const toMan = MAN_LEG / legLength(lab.model);
  await lab.step(SETTLE, () => ({ keys: KEYS }));
  const start = lab.player.pos.clone();
  const tiles = new Map<string, Tile[]>();
  const rows = await lab.step(MEASURED, () => ({ keys: KEYS }), (frame) => {
    for (const row of pictured?.get(frame) ?? []) {
      const taken = lab.picture('', row.views, [], { focus: row.focus }).tiles;
      tiles.set(row.name, [...(tiles.get(row.name) ?? []), ...taken]);
    }
    return measureFrame(lab, legs, toMan);
  });
  const speed = lab.player.pos.distanceTo(start) / (MEASURED / 60);
  const frames = rows as FormFrame[];
  const cycles: Measured['cycles'] = [cyclesOf(frames, 0), cyclesOf(frames, 1)];
  return { measured: { from, frames, cycles, speed: speed * toMan, toMan }, tiles };
}

// --- folding the cycles ------------------------------------------------------------------------------------------

/** Where a frame lies in a cycle on a runner's timeline: its stance stretched onto the runner's and its swing too. */
function shareIn(cycle: Cycle, frame: number, duty: number): number | null {
  if (frame < cycle.down || frame >= cycle.next) return null;
  if (frame < cycle.up) return (frame - cycle.down) / (cycle.up - cycle.down) * duty;
  return duty + (frame - cycle.up) / (cycle.next - cycle.up) * (1 - duty);
}

/** A curve folded over the cycles of one leg or both: its mean in each bin, NaN where no frame fell. */
function fold(measured: Measured, duty: number, sides: number[], value: (frame: FormFrame, side: number) => number):
  number[] {
  const sums = new Array<number>(BINS).fill(0);
  const counts = new Array<number>(BINS).fill(0);
  for (const side of sides) {
    for (const cycle of measured.cycles[side]) {
      for (let f = Math.ceil(cycle.down); f < cycle.next; f++) {
        const share = shareIn(cycle, f, duty);
        if (share === null) continue;
        const bin = Math.min(BINS - 1, Math.floor(share * BINS));
        sums[bin] += value(measured.frames[f], side);
        counts[bin]++;
      }
    }
  }
  return sums.map((sum, bin) => (counts[bin] ? sum / counts[bin] : NaN));
}

/** A curve of ours against a runner's, bin by bin: how far apart on average, and where most. */
interface Against {
  rms: number;
  worst: number;
  worstAt: number;
}

function against(ours: number[], runner: (u: number) => number): Against {
  let sum = 0;
  let count = 0;
  let worst = 0;
  let worstAt = 0;
  ours.forEach((value, bin) => {
    if (Number.isNaN(value)) return;
    const off = value - runner((bin + 0.5) / BINS);
    sum += off * off;
    count++;
    if (Math.abs(off) > Math.abs(worst)) {
      worst = off;
      worstAt = (bin + 0.5) / BINS;
    }
  });
  return { rms: count ? Math.sqrt(sum / count) : NaN, worst, worstAt };
}

/** A curve's value near `u` (the bin it falls in, or the nearest with frames). */
function near(curve: number[], u: number): number {
  const bin = Math.min(BINS - 1, Math.floor(((u % 1) + 1) % 1 * BINS));
  for (let reach = 0; reach < BINS; reach++) {
    for (const candidate of [bin - reach, bin + reach]) {
      const value = curve[(candidate + BINS) % BINS];
      if (!Number.isNaN(value)) return value;
    }
  }
  return NaN;
}

const finite = (values: number[]): number[] => values.filter((value) => !Number.isNaN(value));
const most = (values: number[]): number => Math.max(...finite(values));
const least = (values: number[]): number => Math.min(...finite(values));
const median = (values: number[]): number => {
  const sorted = finite(values).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : NaN;
};
const deg = (value: number): string => value.toFixed(0);

// --- judging -------------------------------------------------------------------------------------------------------

/** The stride's timing: steps a second, a step's length, a foot's time down, the share of its cycle, the flight. */
interface Timing {
  cadence: number;
  step: number;
  contact: number;
  duty: number;
  flight: number;
  bounce: number;
}

function timingOf(measured: Measured): Timing {
  const cycles = [...measured.cycles[0], ...measured.cycles[1]];
  const frames = measured.frames;
  const cycleFrames = median(cycles.map((cycle) => cycle.next - cycle.down));
  const downFrames = median(cycles.map((cycle) => cycle.up - cycle.down));
  const neither = frames.filter((frame) => !frame.legs[0].planted && !frame.legs[1].planted).length;
  const steps = cycles.length;
  const cadence = 2 * 60 / cycleFrames;
  // (the hips' rise and fall over each step: each cycle's half from a touchdown to the other foot's)
  const bounces = measured.cycles[0].map((cycle) => {
    const heights = frames.slice(Math.ceil(cycle.down), Math.floor(cycle.next)).map((frame) => frame.hips);
    return most(heights) - least(heights);
  });
  return {
    cadence,
    step: measured.speed / cadence,
    contact: downFrames / 60,
    duty: downFrames / cycleFrames,
    flight: steps ? neither / 60 / (frames.length / 60 * cadence) : NaN,
    bounce: median(bounces),
  };
}

/** A line saying ours against a runner's, and whether it is far from it. */
function compared(what: string, ours: number, runner: number, unit: string, digits: number): string {
  return `${what} ${ours.toFixed(digits)}${unit} (a runner's ${runner.toFixed(digits)}${unit})`;
}

/** What the run says of a leg curve: at touchdown, mid-stance, the push off and its most, and how far from a
 *  runner's. */
function legLine(name: LegCurve, curve: number[], runner: RunnerForm, unlike: string[]): string {
  const of = (u: number) => runner.leg(name, u);
  const duty = runner.duty;
  const fit = against(curve, of);
  let peak = 0;
  for (let i = 0; i < 100; i++) if (Math.abs(of(i / 100)) > Math.abs(of(peak))) peak = i / 100;
  const points = [
    ['touchdown', 0],
    ['mid-stance', duty / 2],
    ['push off', duty],
    ['the swing\'s most', peak],
  ] as const;
  const cells = points.map(([label, u]) => `${label} ${deg(near(curve, u))} (${deg(of(u))})`);
  if (fit.rms > UNLIKE_RMS) {
    const worst = `${deg(fit.worst)} at ${fit.worstAt.toFixed(2)}`;
    unlike.push(`the ${name}: ${deg(fit.rms)} deg off a runner's on average, ${worst}`);
  }
  return `  ${name.padEnd(5)} ${cells.join(', ')}; ${deg(least(curve))}..${deg(most(curve))}, ` +
    `off a runner's by ${deg(fit.rms)} on average (the most ${deg(fit.worst)} at ${fit.worstAt.toFixed(2)})`;
}

/** Each arm's swing and elbow over the stride, against a runner's free arm. */
function armLines(measured: Measured, runner: RunnerForm, unlike: string[]): string[] {
  const lines: string[] = [];
  for (const side of [0, 1]) {
    // (an arm swings against the other leg: folded on that leg's cycle)
    const other = [1 - side];
    const swing = fold(measured, runner.duty, other, (frame) => frame.arms[side].shoulder);
    const elbow = fold(measured, runner.duty, other, (frame) => frame.arms[side].elbow);
    const shoulderFit = against(swing, (u) => armAt(runner, u).shoulder);
    const elbowFit = against(elbow, (u) => armAt(runner, u).elbow);
    const arc = most(swing) - least(swing);
    const runnerArc = runner.armForward - runner.armBack;
    lines.push(`  arm ${SIDES[side]}: swings ${deg(least(swing))}..${deg(most(swing))} (a runner's ` +
      `${deg(runner.armBack)}..${deg(runner.armForward)}), off by ${deg(shoulderFit.rms)} on average; the elbow bent ` +
      `${deg(least(elbow))}..${deg(most(elbow))} (${deg(runner.elbowBack)}..${deg(runner.elbowFront)}), off by ` +
      `${deg(elbowFit.rms)}`);
    if (arc < runnerArc / 3) {
      unlike.push(`arm ${SIDES[side]} hardly swings: ${deg(arc)} deg (a runner's ${deg(runnerArc)})`);
    }
  }
  return lines;
}

/** The report's lines for one way of holding the weapons. */
function describe(what: string, measured: Measured, unlike: string[]): string[] {
  const runner = runnerAt(measured.speed);
  const timing = timingOf(measured);
  const frames = measured.frames;
  const lines = [
    `${what}: ${frames.length} frames at ${measured.speed.toFixed(2)} m/s as a man (the hero's legs ` +
      `${(MAN_LEG / measured.toMan).toFixed(2)} m against a man's ${MAN_LEG}); ` +
      `cycles L ${measured.cycles[0].length}, R ${measured.cycles[1].length}`,
    `  ${compared('steps a second', timing.cadence, runner.cadence, '', 2)}, ` +
      `${compared('a step', timing.step, runner.step, ' m', 2)}`,
    `  ${compared('a foot down', timing.contact, runner.contact, ' s', 3)}, ` +
      `${compared('its share of the cycle', timing.duty, runner.duty, '', 2)}, ` +
      `${compared('in the air a step', timing.flight, runner.flight, ' s', 3)}`,
    `  ${compared('the hips rise and fall', timing.bounce * 100, runner.bounce * 100, ' cm', 1)}`,
  ];
  if (Math.abs(timing.cadence / runner.cadence - 1) > 0.2) {
    unlike.push(`${timing.cadence.toFixed(1)} steps a second at this speed, a runner's ${runner.cadence.toFixed(1)}`);
  }
  if (timing.bounce < runner.bounce * 0.5 || timing.bounce > runner.bounce * 2) {
    const cm = (metres: number): string => (metres * 100).toFixed(1);
    unlike.push(`the hips rise and fall ${cm(timing.bounce)} cm, a runner's ${cm(runner.bounce)}`);
  }
  for (const name of ['thigh', 'knee', 'ankle'] as const) {
    const curve = fold(measured, runner.duty, [0, 1], (frame, side) => frame.legs[side][name]);
    lines.push(legLine(name, curve, runner, unlike));
  }
  const lean = median(frames.map((frame) => frame.lean));
  const head = median(frames.map((frame) => frame.head));
  const pelvis = frames.map((frame) => frame.pelvis);
  const chest = frames.map((frame) => frame.chest);
  const turns = `the pelvis turns ${deg(least(pelvis))}..${deg(most(pelvis))}, ` +
    `the chest on it ${deg(least(chest))}..${deg(most(chest))}`;
  lines.push(`  the trunk leans ${deg(lean)} (a runner's ${deg(runner.lean)}), the head tipped ${deg(head)} forward; ` +
    turns);
  if (Math.abs(lean - runner.lean) > 8) unlike.push(`the trunk leans ${deg(lean)} deg, a runner's ${deg(runner.lean)}`);
  if (Math.abs(head) > 12) unlike.push(`the head tipped ${deg(head)} deg off upright`);
  lines.push(...armLines(measured, runner, unlike));
  lines.push(`  ${trunkLine(judgeTrunk(frames.map((frame) => frame.trunk)), unlike)}`);
  return lines;
}

/** Each cycle's touchdown, push off and next touchdown, and each curve bin by bin, for `--frames`. */
function listed(measured: Measured): string[] {
  const runner = runnerAt(measured.speed);
  const lines = SIDES.map((name, side) => `  ${name} cycles: ` + measured.cycles[side]
    .map((cycle) => `${cycle.down}/${cycle.up}/${cycle.next}`).join(', '));
  for (const name of ['thigh', 'knee', 'ankle'] as const) {
    const curve = fold(measured, runner.duty, [0, 1], (frame, side) => frame.legs[side][name]);
    const cells = curve.map((value, bin) => `${deg(value)}/${deg(runner.leg(name, (bin + 0.5) / BINS))}`);
    lines.push(`  ${name} by bin (ours/a runner's): ${cells.join(' ')}`);
  }
  return lines;
}

// --- the canary ----------------------------------------------------------------------------------------------------

/** The canary: the left knee held straight through each stance, as measured; the knee's line must read as unlike. */
function plantCanary(measured: Measured): void {
  for (const frame of measured.frames) if (frame.legs[0].planted) frame.legs[0].knee = 0;
}

// --- pictures ------------------------------------------------------------------------------------------------------

/** The frames of the middle cycle of the left leg nearest each pictured point of the stride. */
function framesToPicture(measured: Measured, duty: number): number[] {
  const cycles = measured.cycles[0];
  const cycle = cycles[Math.floor(cycles.length / 2)];
  return PICTURED.map((u) => {
    let best = Math.ceil(cycle.down);
    for (let f = Math.ceil(cycle.down); f < cycle.next; f++) {
      const share = shareIn(cycle, f, duty) ?? 0;
      if (Math.abs(share - u) < Math.abs((shareIn(cycle, best, duty) ?? 0) - u)) best = f;
    }
    return best;
  });
}

/** The tile size of a stick figure (px) and its scale (px a metre of a man) */
const STICK_W = 360;
const STICK_H = 540;
const STICK_SCALE = 210;
/** a man's lengths for a runner's figure (m), as the hero's own scaled to a man: read from his first frame */
interface Lengths {
  thigh: number;
  shin: number;
  foot: number;
  trunk: number;
  shoulder: number;
  upper: number;
  fore: number;
  head: number;
}

const length = (a: Side, b: Side): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

function lengthsOf(stick: Stick): Lengths {
  return {
    thigh: length(stick.hipJoints[0], stick.knees[0]),
    shin: length(stick.knees[0], stick.ankles[0]),
    foot: length(stick.ankles[0], stick.toes[0]),
    trunk: length(stick.hips, stick.neck),
    shoulder: length(stick.hips, stick.shoulders[0]),
    upper: length(stick.shoulders[0], stick.elbows[0]),
    fore: length(stick.elbows[0], stick.hands[0]),
    head: length(stick.neck, stick.head),
  };
}

/** A point `len` from `from` at `angle` from straight down (deg, forward positive). */
const towards = (from: Side, angle: number, len: number): Side =>
  [from[0] + Math.sin(angle / DEG) * len, from[1] - Math.cos(angle / DEG) * len];

/** A runner's leg at `u` of its cycle from the hip: knee, ankle and toes. */
function runnerLeg(runner: RunnerForm, sizes: Lengths, hip: Side, u: number): [Side, Side, Side] {
  const thigh = runner.leg('thigh', u);
  const shin = thigh - runner.leg('knee', u);
  const knee = towards(hip, thigh, sizes.thigh);
  const ankle = towards(knee, shin, sizes.shin);
  return [knee, ankle, towards(ankle, shin + 90 + runner.leg('ankle', u), sizes.foot)];
}

/** The ankle's height over the sole of a flat foot (m, a man's) */
const SOLE = 0.07;

/** How high a runner's hips are at `u` of the left leg's cycle: the foot down on the ground, a fall between. */
function runnerHips(runner: RunnerForm, sizes: Lengths, u: number): number {
  const lowest = (side: number, share: number): number => {
    const [, ankle, toes] = runnerLeg(runner, sizes, [0, 0], share + side * 0.5);
    return Math.min(ankle[1] - SOLE, toes[1]);
  };
  const stanceHeight = (share: number): number | null => {
    for (const side of [0, 1]) {
      const own = ((share + side * 0.5) % 1 + 1) % 1;
      if (own < runner.duty) return -lowest(side, share);
    }
    return null;
  };
  const here = stanceHeight(u);
  if (here !== null) return here;
  // (in the air: from the push off to the next touchdown, falling as a body does)
  const step = 0.5;
  const left = ((u % step) - runner.duty + step) % step;
  const flight = step - runner.duty;
  const from = stanceHeight(u - left - 1e-3) ?? 0;
  const to = stanceHeight(u - left + flight + 1e-3) ?? from;
  const seconds = flight * 2 / runner.cadence;
  const t = left / flight * seconds;
  return from + (to - from) * left / flight + 9.81 / 2 * t * (seconds - t);
}

/** A runner's stick figure at `u` of the left leg's cycle, on the hero's lengths. */
function runnerStick(runner: RunnerForm, sizes: Lengths, u: number): Stick {
  const hips: Side = [0, runnerHips(runner, sizes, u)];
  const lean = runner.lean;
  const up = (len: number): Side => [hips[0] + Math.sin(lean / DEG) * len, hips[1] + Math.cos(lean / DEG) * len];
  const neck = up(sizes.trunk);
  const shoulder = up(sizes.shoulder);
  const legs = [0, 1].map((side) => runnerLeg(runner, sizes, hips, u + side * 0.5));
  const arms = [0, 1].map((side) => {
    const swing = armAt(runner, u + (1 - side) * 0.5);
    const elbow = towards(shoulder, swing.shoulder - lean, sizes.upper);
    return [elbow, towards(elbow, swing.shoulder - lean + swing.elbow, sizes.fore)] as [Side, Side];
  });
  return {
    head: [neck[0], neck[1] + sizes.head],
    neck,
    hips,
    shoulders: [shoulder, shoulder],
    elbows: [arms[0][0], arms[1][0]],
    hands: [arms[0][1], arms[1][1]],
    hipJoints: [hips, hips],
    knees: [legs[0][0], legs[1][0]],
    ankles: [legs[0][1], legs[1][1]],
    toes: [legs[0][2], legs[1][2]],
  };
}

const LEFT_COLOUR = '#5aa0ff';
const RIGHT_COLOUR = '#ff9a3c';
const RUNNER_COLOUR = 'rgba(200, 200, 200, 0.55)';

/** Draws a stick figure: each side's limbs in its colour (or all in one), the trunk and head between. */
function drawStick(context: CanvasRenderingContext2D, stick: Stick, colours: [string, string, string], width: number):
  void {
  const toPx = ([ahead, up]: Side): [number, number] => [
    STICK_W / 2 + ahead * STICK_SCALE,
    STICK_H - 40 - up * STICK_SCALE,
  ];
  const line = (points: Side[], colour: string): void => {
    context.strokeStyle = colour;
    context.lineWidth = width;
    context.beginPath();
    points.map(toPx).forEach(([x, y], i) => (i ? context.lineTo(x, y) : context.moveTo(x, y)));
    context.stroke();
  };
  // (the far side first: the right, seen from the left as the side views are)
  for (const side of [1, 0]) {
    const colour = colours[side];
    line([stick.hipJoints[side], stick.knees[side], stick.ankles[side], stick.toes[side]], colour);
    line([stick.shoulders[side], stick.elbows[side], stick.hands[side]], colour);
  }
  line([stick.hips, stick.neck, stick.head], colours[2]);
  const [hx, hy] = toPx(stick.head);
  context.beginPath();
  context.arc(hx, hy, 0.09 * STICK_SCALE, 0, Math.PI * 2);
  context.stroke();
}

/** A stick figure tile: ours at a frame over a runner's at the same point of the stride, the ground under them. */
function stickTile(ours: Stick, runner: Stick, label: string): Tile {
  const canvas = document.createElement('canvas');
  canvas.width = STICK_W;
  canvas.height = STICK_H;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#16181c';
  context.fillRect(0, 0, STICK_W, STICK_H);
  context.strokeStyle = '#555';
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(0, STICK_H - 40);
  context.lineTo(STICK_W, STICK_H - 40);
  context.stroke();
  drawStick(context, runner, [RUNNER_COLOUR, RUNNER_COLOUR, RUNNER_COLOUR], 9);
  drawStick(context, ours, [LEFT_COLOUR, RIGHT_COLOUR, '#f2f2f2'], 3);
  context.fillStyle = '#ddd';
  context.font = '15px sans-serif';
  context.fillText(label, 10, 22);
  return { view: 'left', png: canvas.toDataURL('image/png'), width: STICK_W, height: STICK_H };
}

/** What each pictured point of the stride is, by its share of the left leg's cycle. */
function pointName(u: number, duty: number): string {
  if (u === 0) return 'L touchdown';
  if (u < duty) return `L stance ${u.toFixed(2)}`;
  if (Math.abs(u - 0.5) < 1e-6) return 'R touchdown';
  return `${u.toFixed(3)} of L's cycle`;
}

/** The stick figures of the stride: ours over a runner's at each pictured point. */
function sticksMoment(what: string, measured: Measured, chosen: number[]): Pictured {
  const runner = runnerAt(measured.speed);
  const sizes = lengthsOf(measured.frames[0].stick);
  const tiles = chosen.map((frame, i) => {
    const ours = measured.frames[frame].stick;
    return stickTile(ours, runnerStick(runner, sizes, PICTURED[i]), pointName(PICTURED[i], runner.duty));
  });
  const notes = [
    `seen from his left, the way he runs to the right: the left limbs blue, the right orange; a runner's at ` +
      `${measured.speed.toFixed(1)} m/s grey, on his lengths`,
  ];
  return { label: `${what}: stick figures over a runner's`, tiles, notes };
}

// --- the command ---------------------------------------------------------------------------------------------------

/** the rows of pictures each style takes: from each side at every pictured point, and at three of them the game's
 *  views and the arms close up (what the hands hold, where) */
const EVERY_POINT = PICTURED.map((_, i) => i);
const THREE_POINTS = [0, 2, 5];
const PICTURE_ROWS: PictureRow[] = [
  { name: 'from his left', views: ['left'], points: EVERY_POINT },
  { name: 'from his right', views: ['right'], points: EVERY_POINT },
  { name: "the game's views", views: ['top', 'third', 'front', 'back'], points: THREE_POINTS },
  { name: 'his arms close up', views: ['front', 'right', 'left'], focus: 'chest', points: THREE_POINTS },
];

/** One way of holding the weapons, run, measured, judged and pictured. */
async function runStyle(lab: Lab, style: WeaponStyle | null, options: FormOptions, report: FormReport): Promise<void> {
  const what = style ? `holding ${style}` : `as he holds his ${lab.player.gear.weapon ?? 'weapon'}`;
  const { measured } = await runAcross(lab, style, options.tune);
  const wanted = lab.player.stats.moveSpeed * measured.toMan;
  if (measured.speed < wanted * HELD_UP) {
    const speeds = `${measured.speed.toFixed(2)} of ${wanted.toFixed(2)} m/s`;
    report.problems.push(`form: ${what}: the run was held up (${speeds})`);
  }
  const facings = measured.frames.map((frame) => frame.facing);
  report.problems.push(...straightProblems(`form: ${what}`, facings, WAY));
  if (measured.cycles[0].length < 3 || measured.cycles[1].length < 3) {
    report.problems.push(`form: ${what}: fewer than three whole cycles a leg`);
    return;
  }
  if (options.canary) plantCanary(measured);
  const unlike: string[] = [];
  report.lines.push(...describe(what, measured, unlike), `  ${straightLine(facings, WAY, measured.from)}`);
  if (options.frames) report.lines.push(...listed(measured));
  if (unlike.length) report.lines.push(`  unlike a runner: ${unlike.join('; ')}`);
  if (options.canary && !unlike.some((line) => line.startsWith('the knee'))) {
    report.problems.push(`form: ${what}: the canary (the left knee straight through its stance) was not caught`);
  }
  if (options.pictures === false) return;
  const chosen = framesToPicture(measured, runnerAt(measured.speed).duty);
  report.moments.push(sticksMoment(what, measured, chosen));
  const pictured = new Map<number, PictureRow[]>();
  chosen.forEach((frame, i) => pictured.set(frame, PICTURE_ROWS.filter((row) => row.points.includes(i))));
  const { tiles } = await runAcross(lab, style, options.tune, pictured);
  for (const row of PICTURE_ROWS) {
    report.moments.push({ label: `${what}: ${row.name}`, tiles: tiles.get(row.name) ?? [], notes: [] });
  }
}

/** Runs the ways asked for (the class's all, or the one way a class with one has), judging each against a runner. */
export async function form(lab: Lab, options: FormOptions): Promise<FormReport> {
  const report: FormReport = { lines: [], moments: [], problems: [] };
  const styles = stylesOf(lab);
  const asked = options.gear?.length ? options.gear : styles;
  for (const style of asked) {
    if (!styles.includes(style)) throw new Error(`lab: form: the ${lab.player.cls.id} doesn't hold weapons ${style}`);
  }
  for (const style of asked.length ? asked : [null]) await runStyle(lab, style, options, report);
  report.problems.push(...straightCanary().map((missed) => `form: the straight run's canary missed: ${missed}`));
  report.lines.push('a runner: about 3 steps a second at 5 to 7 m/s, each foot down 0.15 to 0.2 s, the knee bent ' +
    'about 20 degrees as it lands and as it pushes off, folded past 110 under the hips in the swing; the trunk ' +
    'leaning 9 to 12, the arms swinging from the shoulder with the elbows bent near a right angle');
  return report;
}
