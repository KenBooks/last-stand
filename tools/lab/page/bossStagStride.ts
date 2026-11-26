// The Stag of Ash's hooves on the earth (tools/lab `boss`, parts `stagStride` and `stagStridePictures`;
// models/stag.ts). Victor's bar for the bosses is whether it could be so in life ("would not be possible irl"): a hoof
// on the earth stays where it was set down while the body goes over it, in a charge's gallop as in a walk.
//
// Each frame is read as it's drawn: each hoof's sole (the point under its joint that meets the floor, the model's
// `stride.hooves`) in the world, on the floor or lifted off it, and the stag's speed.
//
// - `stagStride`: a charge along an open lane (its gallop at the run's speed), and a walk after a hero who steps
//   off at a slant as it nears him, a little slower than it walks, so it walks after him and turns. In each: a hoof
//   on the floor may move `SLIDE` m at most over its stay
//   there; it must take `STEPS` steps at least (a hoof lifted off the floor and set down); in the walk `BEARING`
//   hooves at least are on the floor every frame it moves (a walk has no moment in the air; a gallop has, its leap,
//   counted and said). Its soles' depth under the floor as they stand is said (a hoof sunk into the earth). `--canary`
//   carries its hooves with its body, never planted (`stride.carried`, its old stride on its own clock): the slides
//   must be caught.
// - `stagStridePictures` (asked for alone): its charge from its side every few frames through a stride and more, and
//   as the player sees it; its walk from its side.
import * as THREE from 'three';
import type { Clip, Lab, Pictured } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import { G } from '../../../src/state';
import { RUNS } from '../../../src/entities/stag';
import { groundHeight, groundUnder } from '../../../src/world/ground';
import { fixed, standIn, type BossOptions } from './boss';
import { openLane, sideLane } from './bossStag';
import { endSideView, holdSideView, sideClip, sideView } from './bossSideView';

/** frames a second on the lab's clock */
const FPS = 60;
/** the most frames it takes to rise, and the frames a charge and a walk are followed */
const RISE_FRAMES = 200;
const CHARGE_FRAMES = 6 * FPS;
const WALK_FRAMES = 7 * FPS;
/** a hoof's sole within this of the floor under it stands on it (m), and how far round the sole's middle it meets the
 *  floor (m: a hoof's, so one overhanging the dais's step stands on its top) */
const ON_FLOOR = 0.1;
/** how many frames before its fewest hooves on the floor are kept to say */
const BEFORE = 24;
const HOOF_FOOT = 0.14;
/** the most a hoof on the floor may move over its stay there (m) */
const SLIDE = 0.03;
/** the fewest steps each case must take (hooves lifted and set down), and the fewest hooves on the floor in a frame
 *  of its walk */
const STEPS = 8;
const BEARING = 2;
/** how fast the hero backs off in the walk (m/s: under the stag's walk, so it comes on), how far aside of straight
 *  back (rad), from when the stag is this near him (m) */
const BACKING = 3;
const SLANT = 0.9;
const BACK_FROM = 9;
/** its speed under which it stands (m/s) */
const STANDS = 0.05;

/** The model's hold on its stride (models/stag.ts `stride`). */
interface Stride {
  hooves: { joint: THREE.Object3D; foot: THREE.Vector3 }[];
  carried: boolean;
  /** each leg's quick steps so far, its planted hoof out of its reach */
  stretched?: number[];
}

/** Each hoof's state as the model holds it (`stride.hoofs`): `down`, or its step's share, `q` before a quick one. */
function hoofStates(stride: Stride): string {
  const hoofs = (stride as Stride & { hoofs?: { step: number; timed: boolean; stretch?: number; ankle?: number }[] })
    .hoofs ?? [];
  // (each with its leg's reach as a share of its length and its ankle before or behind its hip, m)
  const reach = (h: { stretch?: number; ankle?: number }): string => {
    const ankle = h.ankle ?? 0;
    return `[${(h.stretch ?? 0).toFixed(2)}${ankle >= 0 ? '+' : ''}${ankle.toFixed(2)}]`;
  };
  return hoofs.map((h) => (h.step < 0 ? 'down' : `${h.timed ? 'q' : ''}${h.step.toFixed(2)}`) + reach(h)).join(' ');
}

/** The quick steps its legs have taken so far. */
const quickSteps = (stride: Stride | undefined): number => (stride?.stretched ?? []).reduce((sum, n) => sum + n, 0);

/** One case's hooves, read frame by frame. */
interface StrideReading {
  /** what was followed (`charge`, `walk`) */
  what: string;
  /** how far it went (m), its fastest (m/s), and the frames it moved */
  went: number;
  fastest: number;
  moving: number;
  /** steps taken (a hoof lifted and set down) */
  steps: number;
  /** the most a hoof on the floor moved over one stay there (m), which hoof, and the frames of that stay */
  slide: number;
  slideHoof: number;
  slideFrom: number;
  slideTo: number;
  /** that stay frame by frame: each frame's move (mm) and the sole's height over the floor (mm) */
  slideFrames: string[];
  /** the fewest hooves on the floor in a frame it moved, and the frames none was (its leaps) */
  bearing: number;
  /** the frame of the fewest, and each hoof's state then (`down`, or its step's share, `q` a quick one) */
  bearingAt: number;
  bearingHow: string;
  /** the frames before the fewest, each its hooves' states, its speed (m/s) and its turn (rad/s) */
  bearingBefore: string[];
  airborne: number;
  /** the deepest a sole stood under the floor (m) */
  sunk: number;
  /** the quick steps it took, a planted hoof out of its leg's reach */
  quick: number;
}

/** The hero set up on a lane facing the stag, and the stag risen at its end, dazed until a case lets it. */
async function onLane(lab: Lab, options: BossOptions, sides: boolean): Promise<Enemy> {
  await standIn(lab, options.fixture, 'forest');
  const lane = sides ? sideLane() : openLane();
  await lab.setup({ ...options.fixture, at: [lane.hero.x, lane.hero.z], facing: Math.atan2(-lane.way.x, -lane.way.z) });
  const boss = lab.spawnFoe('stag', lane.stag.clone());
  lab.letWavesCome();
  await lab.until(() => boss.spawning <= 0, RISE_FRAMES, 'the Stag of Ash never rose');
  boss.facing = boss.targetFacing = Math.atan2(lane.way.x, lane.way.z);
  boss.dazed = 1e4;
  const stride = boss.model.root.userData.stride as Stride | undefined;
  if (stride) stride.carried = options.canary;
  return boss;
}

/** A reading begun for `what`. */
function reading(what: string): StrideReading {
  return {
    what, went: 0, fastest: 0, moving: 0, steps: 0,
    slide: 0, slideHoof: -1, slideFrom: -1, slideTo: -1, slideFrames: [],
    bearing: Infinity, bearingAt: -1, bearingHow: '', bearingBefore: [], airborne: 0, sunk: 0, quick: 0,
  };
}

/** Reads a stag's hooves frame after frame into a reading. */
class HoofReader {
  private readonly was: THREE.Vector3[];
  private readonly onFloor: boolean[];
  private readonly stay: number[];
  private readonly stayFrom: number[];
  private readonly stayFrames: string[][];
  private last: THREE.Vector3;
  private readonly now = new THREE.Vector3();
  private doing = '';
  /** the frames before this one, as `bearingBefore` keeps them */
  private readonly recent: string[] = [];
  private facing = NaN;
  private lastAction = '';
  private lastEnded = -1;

  constructor(private readonly boss: Enemy, private readonly stride: Stride, readonly result: StrideReading) {
    const count = stride.hooves.length;
    this.was = Array.from({ length: count }, () => new THREE.Vector3());
    this.onFloor = new Array<boolean>(count).fill(false);
    this.stay = new Array<number>(count).fill(0);
    this.stayFrom = new Array<number>(count).fill(-1);
    this.stayFrames = Array.from({ length: count }, () => []);
    this.last = boss.pos.clone();
  }

  /** This frame read (`frame` its number): its hooves as drawn. */
  read(frame: number): void {
    const r = this.result, boss = this.boss;
    const moved = Math.hypot(boss.pos.x - this.last.x, boss.pos.z - this.last.z);
    this.last = boss.pos.clone();
    const speed = moved * FPS, moving = speed > STANDS;
    r.went += moved;
    r.fastest = Math.max(r.fastest, speed);
    if (moving) r.moving++;
    let bearing = 0;
    // (the body's height over the floor under its middle: a hoof sunk with it when it rises out of the earth)
    const body = Math.round((boss.obj.position.y - groundHeight(boss.pos.x, boss.pos.z)) * 1000);
    this.stride.hooves.forEach((hoof, i) => {
      hoof.joint.updateWorldMatrix(true, false);
      hoof.joint.localToWorld(this.now.copy(hoof.foot));
      // (on the highest floor under its footprint: a hoof on the dais's step overhangs its edge)
      const over = this.now.y - groundUnder(this.now.x, this.now.z, HOOF_FOOT);
      const on = over < ON_FLOOR;
      if (on) {
        bearing++;
        r.sunk = Math.max(r.sunk, -over);
      }
      if (on && this.onFloor[i]) {
        const move = Math.hypot(this.now.x - this.was[i].x, this.now.z - this.was[i].z);
        this.stay[i] += move;
        const rise = Math.round((groundHeight(this.now.x, this.now.z) - groundHeight(boss.pos.x, boss.pos.z)) * 1000);
        this.stayFrames[i].push(`${(move * 1000).toFixed(0)}@${(over * 1000).toFixed(0)}^${body}~${rise}`);
        if (this.stay[i] > r.slide) {
          r.slide = this.stay[i];
          r.slideHoof = i;
          r.slideFrom = this.stayFrom[i];
          r.slideTo = frame;
          r.slideFrames = [...this.stayFrames[i]];
        }
      } else {
        this.stay[i] = 0;
        this.stayFrom[i] = frame;
        this.stayFrames[i] = [];
      }
      if (!on && this.onFloor[i] && moving) r.steps++;
      this.onFloor[i] = on;
      this.was[i].copy(this.now);
    });
    // (the frames before, for the fewest's: each its hooves, its speed and its turn)
    const turned = boss.facing - this.facing;
    const turn = Number.isFinite(this.facing) ? Math.atan2(Math.sin(turned), Math.cos(turned)) * FPS : 0;
    this.facing = boss.facing;
    this.recent.push(`${frame}: ${hoofStates(this.stride)} ${speed.toFixed(1)}m/s ${turn.toFixed(1)}rad/s`);
    if (this.recent.length > BEFORE) this.recent.shift();
    // (what it last did, and when that ended: an attack's pose leaves its hooves where it put them)
    const doing = this.boss.action?.name ?? '';
    if (this.doing && doing !== this.doing) {
      this.lastAction = this.doing;
      this.lastEnded = frame;
    }
    this.doing = doing;
    if (moving) {
      if (bearing < r.bearing) {
        r.bearingAt = frame;
        r.bearingBefore = [...this.recent];
        // (and what it was doing then: an attack's pose moves its body over its hooves)
        r.bearingHow = `${hoofStates(this.stride)}, ${this.boss.action?.name ?? 'walking'}`
          + (this.lastAction ? `, its ${this.lastAction} ended frame ${this.lastEnded}` : '');
      }
      r.bearing = Math.min(r.bearing, bearing);
      if (bearing === 0) r.airborne++;
    }
  }
}

/** A charge along an open lane, read while it runs; `each` called every frame (a picture's turn). */
async function chargeRead(lab: Lab, options: BossOptions, sides: boolean,
  each?: (frame: number, boss: Enemy) => Promise<void>): Promise<StrideReading | null> {
  const boss = await onLane(lab, options, sides);
  const stride = boss.model.root.userData.stride as Stride | undefined;
  const result = reading('charge');
  const reader = stride ? new HoofReader(boss, stride, result) : null;
  boss.dazed = 0;
  boss.cd = 0;
  boss.brain.chargeT = 0;
  let ran = false;
  const quick = quickSteps(stride);
  for (let frame = 0; frame < CHARGE_FRAMES; frame++) {
    await lab.step(1, () => ({}), () => {
      // (one charge followed: after it, nothing more from it)
      if (ran && !RUNS.has(boss)) boss.brain.chargeT = 99;
      boss.cd = Math.max(boss.cd, ran ? 99 : 0);
    });
    if (each) await each(frame, boss);
    if (RUNS.has(boss)) {
      ran = true;
      reader?.read(frame);
    } else if (ran) break;
  }
  if (!ran) throw new Error('lab: the stag never charged');
  result.quick = quickSteps(stride) - quick;
  return reader ? result : null;
}

/** A walk after the hero, who backs off at a slant as it nears him (its charges held off), read throughout;
 *  `each` called every frame. */
async function walkRead(lab: Lab, options: BossOptions,
  each?: (frame: number, boss: Enemy) => Promise<void>, timed?: (ms: number) => void,
  sides = false): Promise<StrideReading | null> {
  const boss = await onLane(lab, options, sides);
  const stride = boss.model.root.userData.stride as Stride | undefined;
  const result = reading('walk');
  const reader = stride ? new HoofReader(boss, stride, result) : null;
  const hero = G.player;
  const back = boss.facing + SLANT;
  const off = new THREE.Vector3(Math.sin(back), 0, Math.cos(back));
  const quick = quickSteps(stride);
  boss.dazed = 0;
  for (let frame = 0; frame < WALK_FRAMES; frame++) {
    const start = realNow();
    await lab.step(1, () => ({}), () => {
      boss.brain.chargeT = 99;
      // (backing off at a slant as it nears: it turns after him as it walks)
      if (Math.hypot(hero.pos.x - boss.pos.x, hero.pos.z - boss.pos.z) < BACK_FROM) {
        hero.place(hero.pos.clone().addScaledVector(off, BACKING / FPS), hero.facing);
      }
    });
    timed?.(realNow() - start);
    if (each) await each(frame, boss);
    reader?.read(frame);
  }
  result.quick = quickSteps(stride) - quick;
  return reader ? result : null;
}

/** A case's lines and problems. */
function judge(r: StrideReading, lines: string[], problems: string[]): void {
  const part = `stagStride: ${r.what}`;
  lines.push(`${part}: went ${fixed(r.went)} m at up to ${fixed(r.fastest, 1)} m/s in ${r.steps} steps (hooves lifted `
    + `and set down), ${r.moving} frames moving`);
  lines.push(`${part}: a hoof on the floor moved at most ${fixed(r.slide, 3)} m over its stay (hoof ${r.slideHoof}, `
    + `frames ${r.slideFrom} to ${r.slideTo}), at most ${SLIDE}`);
  const fewest = r.bearingAt < 0 ? '' : ` (frame ${r.bearingAt}: ${r.bearingHow})`;
  lines.push(`${part}: ${r.bearing === Infinity ? 'no' : r.bearing} hooves on the floor at the fewest${fewest}, ${r.airborne} `
    + `frames with none (its leaps); its soles ${fixed(r.sunk)} m under the floor at the deepest; ${r.quick} quick `
    + 'steps (a planted hoof out of its leg\'s reach)');
  if (r.what === 'walk' && r.bearing < BEARING) {
    lines.push(`${part}: the frames before its fewest (each hoof, its speed, its turn): ${r.bearingBefore.join(' | ')}`);
  }
  if (r.slideFrames.length) {
    lines.push(`${part}: that stay frame by frame (mm moved @ mm over the floor ^ mm the body over its floor ~ mm the floor under it over the body's): ${r.slideFrames.join(' ')}`);
  }
  if (r.slide > SLIDE) problems.push(`${part}: a planted hoof slid ${fixed(r.slide, 3)} m, over ${SLIDE}`);
  if (r.steps < STEPS) problems.push(`${part}: ${r.steps} steps, under ${STEPS}`);
  if (r.what === 'walk' && r.bearing < BEARING) {
    problems.push(`${part}: ${r.bearing} hooves on the floor in a frame of its walk, under ${BEARING}`);
  }
}

/** `stagStride`: its hooves through a charge and a walk, read as drawn. */
export async function stagStride(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  const cases = [await chargeRead(lab, options, false), await walkRead(lab, options)];
  if (cases.some((c) => !c)) {
    lines.push('stagStride: its model shows no hooves (models/stag.ts `stride`)');
    problems.push('stagStride: its model shows no hooves');
    return;
  }
  for (const c of cases) judge(c!, lines, problems);
}

/** frames a turn of the cost's lasts, and how many turns each way */
const COST_TURN = 30;
const COST_TURNS = 4;

/** The browser's own clock (the page's `performance.now` is the lab's, which stands still within a frame). */
function realNow(): number {
  return (window as unknown as { __labClock: { realNow: () => number } }).__labClock.realNow();
}

/** Times (ms) sorted, their median and 90th percentile. */
function spread(times: number[]): { median: number; p90: number } {
  const sorted = [...times].sort((a, b) => a - b);
  return { median: sorted[Math.floor(sorted.length / 2)], p90: sorted[Math.floor(sorted.length * 0.9)] };
}

/** Times' mean (ms): the model's update is under the browser's clock's step (0.1 ms), read over many frames. */
function mean(times: number[]): number {
  return times.reduce((sum, t) => sum + t, 0) / Math.max(1, times.length);
}

/** One way of posing its legs' times: its model's update and the whole frame, a frame each. */
interface CostSide { model: number[]; frame: number[] }

/** `stagStrideCost` (asked for alone): what its planted hooves cost the frame against the old pose on its own clock
 *  (`stride.carried`) and against the stag not drawn at all (its body hidden, its stride still solved), in turns of
 *  `COST_TURN` frames within one page through a walk after the hero, drawn as the game draws: its model's update (the
 *  legs' solve in it) and the whole frame, each by the browser's own clock. */
export async function stagStrideCost(lab: Lab, options: BossOptions, lines: string[]): Promise<void> {
  const planted: CostSide = { model: [], frame: [] };
  const carried: CostSide = { model: [], frame: [] };
  const hidden: CostSide = { model: [], frame: [] };
  const ways = [planted, carried, hidden];
  let shown: Enemy | null = null;
  let model: { animate: (st: never) => void } | null = null;
  let spent = 0;
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    await walkRead(lab, { ...options, canary: false }, async (frame, boss) => {
      const stride = boss.model.root.userData.stride as Stride;
      if (!model) {
        model = boss.model as unknown as { animate: (st: never) => void };
        const own = model.animate.bind(model);
        model.animate = (st: never) => {
          const start = realNow();
          own(st);
          spent += realNow() - start;
        };
      }
      shown = boss;
      const turn = Math.floor(frame / COST_TURN);
      if (turn >= COST_TURNS * ways.length) {
        boss.obj.visible = true;
        return;
      }
      // (the frame just stepped was posed the way this turn set; its first frame is the switch's, left out)
      if (frame % COST_TURN > 0) {
        const side = ways[turn % ways.length];
        side.model.push(spent);
        side.frame.push(lastFrame);
      }
      const next = ways[Math.floor((frame + 1) / COST_TURN) % ways.length];
      stride.carried = next === carried;
      boss.obj.visible = next !== hidden;
      spent = 0;
    }, (ms) => { lastFrame = ms; });
  } finally {
    lab.drawing = drawing;
    if (shown) (shown as Enemy).obj.visible = true;
  }
  const say = (name: string, side: CostSide): string => {
    const f = spread(side.frame);
    return `${name}: its model ${fixed(mean(side.model), 3)} ms a frame on average, the frame `
      + `${fixed(f.median)} ms (${fixed(f.p90)}), over ${side.frame.length} frames`;
  };
  lines.push(`stagStrideCost: in turns of ${COST_TURN} frames through its walk, drawn, by the browser's clock`);
  lines.push(`stagStrideCost: ${say('planted hooves (its stride)', planted)}`);
  lines.push(`stagStrideCost: ${say('the old pose (carried)', carried)}`);
  lines.push(`stagStrideCost: ${say('its stride, the stag not drawn', hidden)}`);
  const extra = mean(planted.model) - mean(carried.model);
  lines.push(`stagStrideCost: its stride costs its model ${fixed(extra, 3)} ms a frame more`);
}
/** the last frame's time (ms) as `walkRead` stepped it, for the cost */
let lastFrame = 0;

/** frames into the charge the side pictures start, how many, and the frames between them */
const CHARGE_FROM = 20;
const CHARGE_SHOTS = 10;
const CHARGE_EVERY = 3;
/** frames into the walk its side pictures start, how many, and the frames between them */
const WALK_FROM = 90;
const WALK_SHOTS = 8;
const WALK_EVERY = 8;
/** how far round its middle and how high its pictures take in (m): its length and its antlers */
const ITS_REACH = 3.5;
/** its body's half width (m): the line from the side camera is tested to this short of its path */
const ITS_BODY = 1.5;
const ITS_HIGH = 7.2;
/** the charge's strip: how far on from where its run begins it starts (m), the stretch of its run it frames (m), and
 *  how far to its side the camera stands (m) */
const CHARGE_LEAD = 2;
const CHARGE_SPAN = 9;
const CHARGE_SIDE = 11;
/** the walk's strip: the stretch of its walk it frames (m) and how far to its side the camera stands (m) */
const WALK_SPAN = 3.5;
const WALK_SIDE = 10;


/** `stagStridePictures`: its charge through a stride and more and its walk from its side at a man's eye, the camera
 *  held still beside its path and one crop kept a strip, so a planted hoof stays on the same pixels while the body
 *  goes over it (`bossSideView.ts`: the engine's frame, as three's close-ups can't draw the engine's look); and its
 *  charge as the player sees it. */
export async function stagStridePictures(lab: Lab, options: BossOptions, lines: string[]): Promise<Pictured[]> {
  const moments: Pictured[] = [];
  try {
    let first = -1, chargeClip: Clip | null = null, way: THREE.Vector3 | null = null, from: THREE.Vector3 | null = null;
    await chargeRead(lab, { ...options, canary: false }, true, async (frame, boss) => {
      if (first < 0 && RUNS.has(boss)) {
        first = frame;
        moments.push(await lab.screen('charge (the game\'s view)', ['its charge as the player sees it']));
        way = new THREE.Vector3(Math.sin(boss.facing), 0, Math.cos(boss.facing));
        from = boss.pos.clone().addScaledVector(way, CHARGE_LEAD);
        holdSideView(sideView(from.clone().addScaledVector(way, CHARGE_SPAN / 2), way, CHARGE_SIDE, ITS_BODY));
      }
      if (first < 0 || !way || !from) return;
      const shot = (frame - first - CHARGE_FROM) / CHARGE_EVERY;
      if (Number.isInteger(shot) && shot >= 0 && shot < CHARGE_SHOTS) {
        chargeClip ??= sideClip(from, way, CHARGE_SPAN, ITS_REACH, ITS_HIGH);
        const note = `its charge from its side at a man's eye, ${frame - first} frames into its run`;
        moments.push(await lab.screen(`charge ${shot + 1}`, [note], chargeClip));
      }
    });
    endSideView();
    let walkClip: Clip | null = null, walkWay: THREE.Vector3 | null = null, walkFrom: THREE.Vector3 | null = null;
    await walkRead(lab, { ...options, canary: false }, async (frame, boss) => {
      if (frame === WALK_FROM - 1) {
        walkWay = new THREE.Vector3(Math.sin(boss.facing), 0, Math.cos(boss.facing));
        walkFrom = boss.pos.clone();
        holdSideView(sideView(walkFrom.clone().addScaledVector(walkWay, WALK_SPAN / 2), walkWay, WALK_SIDE, ITS_BODY));
      }
      const shot = (frame - WALK_FROM) / WALK_EVERY;
      if (walkWay && walkFrom && Number.isInteger(shot) && shot >= 0 && shot < WALK_SHOTS) {
        walkClip ??= sideClip(walkFrom, walkWay, WALK_SPAN, ITS_REACH, ITS_HIGH);
        const note = `its walk from its side at a man's eye, ${frame} frames on`;
        moments.push(await lab.screen(`stag walk ${shot + 1}`, [note], walkClip));
      }
    }, undefined, true);
  } finally {
    endSideView();
  }
  lines.push(`stagStridePictures: ${moments.length} moments`);
  return moments;
}
