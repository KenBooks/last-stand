// tools/lab trail: the trail a swung weapon leaves (fx/swingTrail.ts), as the player sees it. Each of the hero's
// strikes is cast in each view, and every frame from the press until his weapons are still again is drawn twice, with
// the trail and without it (its meshes hidden), so the pixels it lit are told apart. They must lie where his weapons
// swept over the last `WINDOW` s: each frame every weapon in his hands is placed from its grip to its far end (read off
// its own meshes, not the trail's points) in his own frame, and the quads between its places are drawn on the screen as
// the camera that draws his arms sees them now, with a margin round them for the glow. The trail must be lit through
// every blow, its newest end on the blade, and nothing lit while the weapons are still.
import * as THREE from 'three';
import type { Fixture, Lab, Pictured, Report, Tile } from './lab';
import type { WeaponStyle } from '../../../src/loot/loadout';
import type { ViewMode } from '../../../src/core/renderer';
import type { BiomeId } from '../../../src/data/biomes';
import * as renderer from '../../../src/core/renderer';
import { G } from '../../../src/state';
import { bindKnown, holdFor, pressing, skillNamed, type BoundSkill } from './cast';
import { lookAlong } from './light';
import { armsLens } from './inFrame';
import { isWeapon } from './strike';
import { clipNear, curveAt, distanceToSegment, litBetween, type Lit, type Point } from './sweptArea';
import { webGpuPixels } from './pixels';

/** A strike: its skill (its key, its behaviour or its name) and the way the hero holds his weapons for it (as the
 *  fixture holds them when not given). */
export interface Strike {
  skill: string;
  style?: WeaponStyle;
}

export interface TrailOptions {
  fixture: Fixture;
  strikes: Strike[];
  biome: BiomeId;
  views: ViewMode[];
  /** the frame each strike lit most pictured, and its trail's pixels */
  pictures: boolean;
  /** every frame listed: the weapons' speed, the trail's pixels, its newest column against the weapon */
  frames: boolean;
  canary: boolean;
}

/** how far back the weapons' sweep is where the trail may be (s): its life, a tenth of a second, and a few frames */
const WINDOW = 0.15;
/** a pixel the trail lit: risen this much in some channel (as stored, 0 to 255) */
const LIT_RISE = 16;
/** the margin round where the weapons swept, a share of the screen's height: the glow round the trail's edge */
const MARGIN = 0.012;
/** where they swept is drawn at this share of the screen's pixels across and down, each gap between two frames cut
 *  into this many steps along the curve the weapon went */
const MASK_SCALE = 0.25;
const STEPS = 6;
/** the share of the trail's light (its pixels' rises) that may fall outside where the weapons swept: the glow of its
 *  bright edge spread past the margin (from the top-down view, where the trail is small, it was 29% of its pixels and
 *  few of its light) */
const OUTSIDE_MOST = 0.05;
/** a blow: a weapon's far end moving at least this fast in the hero's frame (m/s), and this share of the strike's
 *  fastest (as `eyes` finds one: a fast way back to rest after a cut, 12 m/s, is no blow); still: under this (m/s) for
 *  longer than the trail's window */
const BLOW_SPEED = 12;
const BLOW_SHARE = 0.4;
const STILL_SPEED = 3;
/** the least share of the screen's pixels a blow's trail lights over its frames, where its weapon is in the frame, and
 *  the fewest frames a blow judged lasts (a burst of two at a cut's start, the trail only begun, is listed) */
const BLOW_LEAST = 0.0002;
const BLOW_FRAMES = 3;
/** the furthest the trail's newest column may be from the weapon through a blow (m, in the hero's frame) */
const NEWEST_MOST = 0.03;
/** frames let pass after the set-up, and measured before the press; the most measured from it */
const SETTLE_FRAMES = 30;
const BEFORE_FRAMES = 6;
const MOST_FRAMES = 360;
/** once his action is over: the frames his weapons are still for the strike to be done, and the most looked at */
const REST_FRAMES = 12;
const AFTER_FRAMES = 120;
/** a channel's key held this long (s) */
const CHANNEL_HOLD = 1;
/** how far ahead of the hero the aim is (m) */
const AIM_AHEAD = 6;
const PICTURE_WIDTH = 640;
/** what the trail's meshes are named (fx/swingTrail.ts) */
const TRAIL_NAME = 'swing trail';

// --- the weapons in his hands, and where they swept

/** A weapon in the hero's hands: the grip it's held by and how far along it (its +Y) the weapon's meshes reach. */
interface Held {
  grip: THREE.Object3D;
  weapon: THREE.Object3D;
  far: number;
}

const farEnds = new WeakMap<THREE.Object3D, number>();

/** How far along `grip` (its +Y) `weapon`'s meshes reach. */
function farEndOf(grip: THREE.Object3D, weapon: THREE.Object3D): number {
  const known = farEnds.get(weapon);
  if (known !== undefined) return known;
  weapon.updateWorldMatrix(true, true);
  const toGrip = grip.matrixWorld.clone().invert();
  let far = 0;
  weapon.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const inGrip = toGrip.clone().multiply(mesh.matrixWorld);
    far = Math.max(far, mesh.geometry.boundingBox!.clone().applyMatrix4(inGrip).max.y);
  });
  farEnds.set(weapon, far);
  return far;
}

/** Every weapon in the hero's hands: a grip under a hand that holds one shown. */
function weaponsHeld(lab: Lab): Held[] {
  const held: Held[] = [];
  for (const hand of [lab.joints.handR, lab.joints.handL]) {
    hand.traverse((grip) => {
      const weapon = grip.children.find((child) => child.visible && isWeapon(child));
      if (weapon) held.push({ grip, weapon, far: farEndOf(grip, weapon) });
    });
  }
  return held;
}

/** A weapon's place in a frame, in the hero's own frame (his model's root's space): its grip and its far end. */
interface Place {
  near: THREE.Vector3;
  far: THREE.Vector3;
}

/** A frame's places of the weapons, by weapon, and when it was (s from the press). */
interface Placed {
  at: number;
  places: Map<THREE.Object3D, Place>;
}

/** Where each weapon in the hero's hands is now, in his own frame. */
function placesNow(lab: Lab): Map<THREE.Object3D, Place> {
  const root = lab.model.root;
  const places = new Map<THREE.Object3D, Place>();
  for (const { grip, weapon, far } of weaponsHeld(lab)) {
    const near = root.worldToLocal(grip.getWorldPosition(new THREE.Vector3()));
    const end = root.worldToLocal(grip.localToWorld(new THREE.Vector3(0, far, 0)));
    places.set(weapon, { near, far: end });
  }
  return places;
}

/** How fast each weapon's far end moved from `last` to `now` (m/s, in the hero's frame), by weapon. */
function speedsOf(now: Placed, last: Placed | undefined, scale: number): Map<THREE.Object3D, number> {
  const speeds = new Map<THREE.Object3D, number>();
  if (!last) return speeds;
  const dt = now.at - last.at;
  for (const [weapon, place] of now.places) {
    const before = last.places.get(weapon);
    if (before) speeds.set(weapon, place.far.distanceTo(before.far) * scale / dt);
  }
  return speeds;
}

/** The screen as the drawing buffer is: its size in pixels. */
interface Screen {
  width: number;
  height: number;
}

/** A point of the hero's frame in the camera's space, as `lens` is now. */
function inCamera(point: THREE.Vector3, root: THREE.Object3D, lens: THREE.Camera): Point {
  const seen = point.clone().applyMatrix4(root.matrixWorld).applyMatrix4(lens.matrixWorldInverse);
  return { x: seen.x, y: seen.y, z: seen.z };
}

/** A point of the camera's space on the screen (the drawing buffer's pixels, down from its top). */
function onScreen(point: Point, lens: THREE.PerspectiveCamera, screen: Screen): [number, number] {
  const ndc = new THREE.Vector3(point.x, point.y, point.z).applyMatrix4(lens.projectionMatrix);
  return [(ndc.x + 1) / 2 * screen.width, (1 - ndc.y) / 2 * screen.height];
}

/** `polygon` of the hero's frame on the screen, cut to what is ahead of `lens`: none if it's all behind. */
function drawnShape(polygon: THREE.Vector3[], root: THREE.Object3D, lens: THREE.PerspectiveCamera, screen: Screen):
  [number, number][] {
  const ahead = clipNear(polygon.map((point) => inCamera(point, root, lens)), lens.near);
  return ahead.map((point) => onScreen(point, lens, screen));
}

/** A weapon's places in the four frames round a gap (the frames before and after it standing in for those it lacks),
 *  if it was held in the two frames either side of it. */
function placesRound(placed: Placed[], i: number, weapon: THREE.Object3D): Place[] | null {
  const before = placed[i - 1]?.places.get(weapon);
  const after = placed[i]?.places.get(weapon);
  if (!before || !after) return null;
  return [placed[i - 2]?.places.get(weapon) ?? before, before, after, placed[i + 1]?.places.get(weapon) ?? after];
}

/** A weapon's place `u` of the way across a gap, along the curve through its places round it (`placesRound`). */
function placeAcross(round: Place[], u: number): Place {
  const near = curveAt(round[0].near, round[1].near, round[2].near, round[3].near, u);
  const far = curveAt(round[0].far, round[1].far, round[2].far, round[3].far, u);
  return { near: new THREE.Vector3(near.x, near.y, near.z), far: new THREE.Vector3(far.x, far.y, far.z) };
}

/**
 * Where the weapons swept over the frames of `placed` from `from` on, as the screen shows it now: each weapon's
 * place in each frame, and the triangles between its places across each gap from the frame before, along the curve
 * through its places round it, as a weapon swung round goes (`STEPS` a gap).
 */
function sweptShapes(placed: Placed[], from: number, root: THREE.Object3D, lens: THREE.PerspectiveCamera,
  screen: Screen): [number, number][][] {
  const shapes: [number, number][][] = [];
  for (let i = from; i < placed.length; i++) {
    for (const [weapon, place] of placed[i].places) {
      shapes.push(drawnShape([place.near, place.far], root, lens, screen));
      const round = i > from ? placesRound(placed, i, weapon) : null;
      if (!round) continue;
      let last = round[1];
      for (let step = 1; step <= STEPS; step++) {
        const next = placeAcross(round, step / STEPS);
        shapes.push(drawnShape([last.near, last.far, next.far], root, lens, screen));
        shapes.push(drawnShape([last.near, next.far, next.near], root, lens, screen));
        last = next;
      }
    }
  }
  return shapes.filter((shape) => shape.length >= 2);
}

/** Where the weapons swept on the screen, drawn at `MASK_SCALE` of its pixels with a margin round it. */
class SweptMask {
  private readonly canvas: OffscreenCanvas;
  private readonly context: OffscreenCanvasRenderingContext2D;
  private alpha = new Uint8ClampedArray(0);

  constructor(private readonly screen: Screen) {
    const width = Math.ceil(screen.width * MASK_SCALE);
    const height = Math.ceil(screen.height * MASK_SCALE);
    this.canvas = new OffscreenCanvas(width, height);
    this.context = this.canvas.getContext('2d', { willReadFrequently: true })!;
  }

  /** The mask made `shapes` (the screen's pixels), each filled and widened by the margin. */
  draw(shapes: [number, number][][]): void {
    const { context, canvas } = this;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#fff';
    context.strokeStyle = '#fff';
    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.lineWidth = 2 * MARGIN * this.screen.height * MASK_SCALE;
    for (const shape of shapes) {
      context.beginPath();
      for (const [x, y] of shape) context.lineTo(x * MASK_SCALE, y * MASK_SCALE);
      context.closePath();
      context.fill();
      context.stroke();
    }
    this.alpha = context.getImageData(0, 0, canvas.width, canvas.height).data;
  }

  /** Whether the screen's pixel (`x`, `y` down from its top) is in it. */
  has(x: number, y: number): boolean {
    const column = Math.min(this.canvas.width - 1, Math.floor(x * MASK_SCALE));
    const row = Math.min(this.canvas.height - 1, Math.floor(y * MASK_SCALE));
    return this.alpha[(row * this.canvas.width + column) * 4 + 3] > 0;
  }

  /** The mask as it is now, a copy (for the picture). */
  copy(): { alpha: Uint8ClampedArray; width: number } {
    return { alpha: this.alpha.slice(), width: this.canvas.width };
  }
}

// --- the trail's pixels

/** The trail's meshes in the scene (none in a game without one). */
function trailMeshes(): THREE.Object3D[] {
  return G.scene.children.filter((object) => object.name === TRAIL_NAME);
}

/** The frame drawn now as the player sees it, its pixels as stored (RGBA bytes, rows from the bottom). */
function drawnBytes(lab: Lab, screen: Screen): Uint8Array {
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    renderer.render();
  } finally {
    lab.drawing = drawing;
  }
  // (read off the engine's canvas in the task that drew it, rows from the top: turned to rows from the bottom)
  const frame = renderer.frameRect();
  const picture = webGpuPixels({ left: frame.left, top: frame.top, width: screen.width, height: screen.height });
  const row = screen.width * 4;
  const bytes = new Uint8Array(screen.width * screen.height * 4);
  for (let y = 0; y < screen.height; y++) {
    bytes.set(picture.data.subarray(y * row, (y + 1) * row), (screen.height - 1 - y) * row);
  }
  return bytes;
}

/** The game's renderer as far as it goes: `--ab` runs this on main's game, which can't leave its bloom out (its
 *  trail-less frames are the same with it). */
const holdBloom = (renderer as Partial<typeof renderer>).holdBloom;

/**
 * The frame drawn with the trail and without it, both without bloom: the pixels it lit, and the frame with it. None
 * while no trail is shown (the two would be the same frame). (With bloom, a glow round its newest end a hundred pixels
 * across from the top-down view, where the trail is a few wide, was read as trail away from where the blade went.)
 */
function trailDrawn(lab: Lab, screen: Screen): { lit: Lit; shown: Uint8Array } | null {
  const shownTrails = trailMeshes().filter((mesh) => mesh.visible);
  if (!shownTrails.length) return null;
  holdBloom?.(true);
  try {
    const shown = drawnBytes(lab, screen);
    for (const mesh of shownTrails) mesh.visible = false;
    try {
      return { lit: litBetween(shown, drawnBytes(lab, screen), LIT_RISE), shown };
    } finally {
      for (const mesh of shownTrails) mesh.visible = true;
    }
  } finally {
    holdBloom?.(false);
  }
}

/** A lit pixel's place on the screen (down from its top), from its place in the drawing buffer. */
function pixelAt(pixel: number, screen: Screen): [number, number] {
  return [pixel % screen.width, screen.height - 1 - Math.floor(pixel / screen.width)];
}

// --- a strike, frame by frame

/** A frame of a strike as the trail was seen. */
interface TrailFrame {
  /** s from the press */
  at: number;
  /** the pixels the trail lit, how many of them lay outside where the weapons swept over the last `WINDOW` s, and its
   *  light there and in all (its pixels' rises summed) */
  lit: number;
  outside: number;
  light: number;
  outsideLight: number;
  /** the most a pixel of it rose (as stored, 0 to 255) */
  rise: number;
  /** how far the nearest pixel it lit is from the blade of a weapon swung at a blow's speed now (px), if any is */
  head: number | null;
  /** how far the newest column of the trail's own geometry is from the nearest weapon as it is now (m, in the hero's
   *  frame: the further of its two ends), if one is shown */
  newest: number | null;
  /** the fastest a weapon's far end moved into this frame (m/s, in the hero's frame) */
  speed: number;
  /** whether a weapon's far end is in the frame, ahead of the camera */
  framed: boolean;
}

/** A strike as it was seen, frame by frame, and the frame its trail lit most. */
interface StrikeRun {
  name: string;
  frames: TrailFrame[];
  frameTime: number;
  screen: Screen;
  brightest: Brightest | null;
}

/** The frame a trail lit most, kept for its picture: drawn without bloom as it was measured, and as the player saw it
 *  (once it's the most so far). */
interface Brightest {
  frame: TrailFrame;
  shown: Uint8Array;
  seen?: Uint8Array;
  lit: number[];
  mask: { alpha: Uint8ClampedArray; width: number };
}

/** A fault planted for a canary: tunable values set for the run, a change made after each frame, and whether the
 *  run's frames caught it. */
interface Plant {
  name: string;
  view?: ViewMode;
  tune?: Record<string, number[]>;
  each?: () => void;
  caught: (run: StrikeRun) => boolean;
}

/** The strike's key, held a moment for a held skill, through `CHANNEL_HOLD` for a channel, else a frame (frames). */
function holdFrames(skill: BoundSkill, frameTime: number): number {
  const hold = skill.def.channel ? CHANNEL_HOLD : holdFor(skill.def);
  return Math.max(1, Math.round(hold / frameTime));
}

/** Whether the hero is acting: a cast, a dash or a channel. */
const acting = (lab: Lab): boolean => Boolean(lab.player.casting || lab.player.dash || lab.player.channel);

/** The way he holds his weapons and the strike's name as words. */
function strikeName(strike: Strike, skill: BoundSkill): string {
  return strike.style ? `${skill.def.name} (${strike.style})` : skill.def.name;
}

/** The hero set up in the view, the strike's skill on its key, ready to cast. */
async function setUp(lab: Lab, options: TrailOptions, strike: Strike, view: ViewMode, plant: Plant | null):
  Promise<BoundSkill> {
  if (G.arena.biome !== options.biome) G.arena.setBiome(options.biome);
  const gear = strike.style ?? options.fixture.gear;
  await lab.setup({ ...options.fixture, view, facing: 0, gear, tune: { ...options.fixture.tune, ...plant?.tune } });
  if (view !== 'top') await lookAlong(lab, 0);
  await lab.step(SETTLE_FRAMES);
  bindKnown(strike.skill);
  const skill = skillNamed(strike.skill);
  lab.player.cooldowns.clear();
  lab.player.energy = lab.player.stats.maxEnergy;
  return skill;
}

/** A frame seen, and what's kept of it for a picture if the trail lit any of it. */
interface FrameSeen {
  frame: TrailFrame;
  kept: Brightest | null;
}

/** This frame seen: the trail's pixels against where the weapons swept, and the blades' speeds. */
function seeFrame(lab: Lab, placed: Placed[], mask: SweptMask, screen: Screen): FrameSeen {
  const now = placed[placed.length - 1];
  const root = lab.model.root;
  const lens = armsLens();
  const speeds = speedsOf(now, placed[placed.length - 2], root.scale.x);
  const speed = Math.max(0, ...speeds.values());
  const framed = [...now.places.values()].some((place) => isFramed(place.far, root, lens));
  const newest = newestOff(now, root);
  const frame: TrailFrame = { at: now.at, lit: 0, outside: 0, light: 0, outsideLight: 0, rise: 0, head: null, newest,
    speed, framed };
  const drawn = trailDrawn(lab, screen);
  if (!drawn || !drawn.lit.pixels.length) return { frame, kept: null };
  const from = placed.findIndex((each) => each.at >= now.at - WINDOW);
  mask.draw(sweptShapes(placed, from, root, lens, screen));
  frame.lit = drawn.lit.pixels.length;
  frame.rise = drawn.lit.most;
  drawn.lit.pixels.forEach((pixel, i) => {
    const rise = drawn.lit.rises[i];
    frame.light += rise;
    const [x, y] = pixelAt(pixel, screen);
    if (mask.has(x, y)) return;
    frame.outside++;
    frame.outsideLight += rise;
  });
  // (the blades in the frame alone: one gone out of it at its far end, Thunder Crescent's through the eyes as it went
  // into the floor, left only the trail's older part in it, 54 px off)
  const blades = [...now.places].filter(([weapon, place]) => (speeds.get(weapon) ?? 0) >= BLOW_SPEED
    && isFramed(place.far, root, lens));
  frame.head = headOff(drawn.lit.pixels, blades.map(([, place]) => drawnShape([place.near, place.far], root, lens,
    screen)), screen);
  return { frame, kept: { frame, shown: drawn.shown, lit: drawn.lit.pixels, mask: mask.copy() } };
}

/** The newest column of each trail shown, as its geometry has it (the hero's frame): its two ends. */
function newestColumns(root: THREE.Object3D): THREE.Vector3[][] {
  const columns: THREE.Vector3[][] = [];
  for (const object of trailMeshes()) {
    const mesh = object as THREE.Mesh;
    if (!mesh.visible) continue;
    const position = mesh.geometry.getAttribute('position');
    const last = mesh.geometry.drawRange.count / 6;
    const end = (vertex: number) => root.worldToLocal(new THREE.Vector3().fromBufferAttribute(position, vertex)
      .applyMatrix4(mesh.matrixWorld));
    columns.push([end(last * 2), end(last * 2 + 1)]);
  }
  return columns;
}

/** How far the trails' newest columns are from the weapons as they are now (m, in the hero's frame): the worst
 *  column's, its further end from the weapon nearest it; none while no trail is shown. */
function newestOff(now: Placed, root: THREE.Object3D): number | null {
  const columns = newestColumns(root);
  if (!columns.length) return null;
  const blades = [...now.places.values()].map((place) => new THREE.Line3(place.near, place.far));
  const offBlade = (point: THREE.Vector3) => Math.min(...blades.map((blade) => blade.closestPointToPoint(point, true,
    new THREE.Vector3()).distanceTo(point)));
  const scale = root.scale.x;
  return Math.max(...columns.map((column) => Math.max(...column.map(offBlade)) * scale));
}

/** Whether a point of the hero's frame is in the frame `lens` draws, ahead of it. */
function isFramed(point: THREE.Vector3, root: THREE.Object3D, lens: THREE.PerspectiveCamera): boolean {
  const seen = point.clone().applyMatrix4(root.matrixWorld);
  if (lens.worldToLocal(seen.clone()).z >= 0) return false;
  const ndc = seen.project(lens);
  return Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1;
}

/** How far the lit pixel nearest any of `blades` (each a segment on the screen) is from it (px); none without one. */
function headOff(pixels: number[], blades: [number, number][][], screen: Screen): number | null {
  const segments = blades.filter((blade) => blade.length >= 2);
  if (!segments.length) return null;
  let nearest = Infinity;
  for (const pixel of pixels) {
    const [x, y] = pixelAt(pixel, screen);
    for (const blade of segments) {
      const [a, b] = [blade[0], blade[blade.length - 1]];
      nearest = Math.min(nearest, distanceToSegment(x, y, a[0], a[1], b[0], b[1]));
    }
  }
  return nearest;
}

/** The strike cast in `view` and followed frame by frame until the hero's weapons are still again. */
async function followStrike(lab: Lab, options: TrailOptions, strike: Strike, view: ViewMode, plant: Plant | null):
  Promise<StrikeRun> {
  const skill = await setUp(lab, options, strike, view, plant);
  const hero = lab.player;
  const way = new THREE.Vector3(Math.sin(hero.facing), 0, Math.cos(hero.facing));
  const aim = hero.pos.clone().addScaledVector(way, AIM_AHEAD);
  const frameTime = window.__labClock.frame / 1000;
  const held = holdFrames(skill, frameTime);
  const frame = renderer.frameRect();
  const screen = { width: frame.width, height: frame.height };
  const mask = new SweptMask(screen);
  const placed: Placed[] = [];
  const frames: TrailFrame[] = [];
  let brightest: Brightest | null = null;
  let cast = false;
  let still = 0;
  let after = 0;
  for (let f = -BEFORE_FRAMES; f < MOST_FRAMES; f++) {
    await lab.step(1, () => pressing(skill.key, aim, f >= 0 && f < held));
    plant?.each?.();
    placed.push({ at: f * frameTime, places: placesNow(lab) });
    const { frame, kept } = seeFrame(lab, placed, mask, screen);
    frames.push(frame);
    if (kept && kept.frame.lit > (brightest?.frame.lit ?? 0)) brightest = { ...kept, seen: drawnBytes(lab, screen) };
    cast ||= f >= 0 && acting(lab);
    if (!cast || acting(lab)) continue;
    still = frame.speed < STILL_SPEED ? still + 1 : 0;
    after++;
    if (still >= REST_FRAMES || after >= AFTER_FRAMES) break;
  }
  const name = `${options.biome} ${view}: ${strikeName(strike, skill)}`;
  if (!cast) throw new Error(`lab: trail: ${name} was never cast`);
  return { name, frames, frameTime, screen, brightest };
}

// --- what a strike's frames came to

/** The runs of frames whose weapons moved at a blow's speed: a blow each. */
function blowsOf(frames: TrailFrame[]): TrailFrame[][] {
  const fastest = Math.max(0, ...frames.map((frame) => frame.speed));
  const least = Math.max(BLOW_SPEED, BLOW_SHARE * fastest);
  const blows: TrailFrame[][] = [];
  let blow: TrailFrame[] = [];
  for (const frame of frames) {
    if (frame.speed >= least) {
      blow.push(frame);
      continue;
    }
    if (blow.length) blows.push(blow);
    blow = [];
  }
  if (blow.length) blows.push(blow);
  return blows;
}

/** The frames lit while the weapons had been still for longer than the trail's window (or before the press). */
function litStill(run: StrikeRun): TrailFrame[] {
  const lit: TrailFrame[] = [];
  let stillFor = 0;
  for (const frame of run.frames) {
    stillFor = frame.speed < STILL_SPEED ? stillFor + run.frameTime : 0;
    if (frame.lit && (frame.at < 0 || stillFor > WINDOW)) lit.push(frame);
  }
  return lit;
}

/** The blows in the frame whose trail lit too little of it. */
function unlitBlows(run: StrikeRun): TrailFrame[][] {
  const least = BLOW_LEAST * run.screen.width * run.screen.height;
  const judged = blowsOf(run.frames).filter((blow) => blow.length >= BLOW_FRAMES && blow.some((frame) => frame.framed));
  return judged.filter((blow) => blow.reduce((sum, frame) => sum + frame.lit, 0) < least);
}

/** The share of the trail's light outside where the weapons swept, over every frame. */
function outsideShare(run: StrikeRun): number {
  const light = run.frames.reduce((sum, frame) => sum + frame.light, 0);
  const outside = run.frames.reduce((sum, frame) => sum + frame.outsideLight, 0);
  return light ? outside / light : 0;
}

/** The frame whose trail's light fell outside where the weapons swept the most, if any did. */
function worstOutside(run: StrikeRun): TrailFrame | null {
  const outside = run.frames.filter((frame) => frame.outsideLight > 0);
  if (!outside.length) return null;
  return outside.reduce((worst, frame) => (frame.outsideLight > worst.outsideLight ? frame : worst));
}

/** The median of `values` (none of none). */
function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** How far the trail's newest end was from the blade through the blows (px): the median and the worst. */
function headsOf(run: StrikeRun): { median: number | null; worst: number | null } {
  const heads = run.frames.flatMap((frame) => (frame.head === null ? [] : [frame.head]));
  return { median: median(heads), worst: heads.length ? Math.max(...heads) : null };
}

const seconds = (at: number): string => `${at.toFixed(2)} s`;
const percent = (share: number, places = 1): string => `${(share * 100).toFixed(places)}%`;
const pixels = (value: number | null): string => (value === null ? 'none' : `${value.toFixed(0)} px`);
const metres = (value: number | null): string => (value === null ? 'none' : `${(value * 100).toFixed(1)} cm`);

/** The margin round where the weapons swept, in the screen's pixels. */
const marginOf = (screen: Screen): number => MARGIN * screen.height;

/** A strike's frames as lines, and its problems. */
function judged(run: StrikeRun, everyFrame: boolean): { lines: string[]; problems: string[] } {
  const { frames, screen } = run;
  const shown = frames.filter((frame) => frame.lit);
  const most = Math.max(0, ...frames.map((frame) => frame.lit));
  const rise = Math.max(0, ...frames.map((frame) => frame.rise));
  const outside = outsideShare(run);
  const heads = headsOf(run);
  const blows = blowsOf(frames);
  const newest = newestThrough(blows);
  const fastest = Math.max(0, ...frames.map((frame) => frame.speed));
  const lines = [
    `${run.name}: ${frames.length} frames, the trail lit on ${shown.length}`
      + (shown.length ? ` (${seconds(shown[0].at)} to ${seconds(shown[shown.length - 1].at)})` : ''),
    `  at most ${percent(most / (screen.width * screen.height), 2)} of the screen, its brightest pixel +${rise}; `
      + `${percent(outside)} of its light outside where the weapons swept over the last ${WINDOW} s`
      + outsideWords(worstOutside(run)),
    `  its newest end off the blade through the blows: ${pixels(heads.median)} (median), ${pixels(heads.worst)} at `
      + `worst (the margin ${pixels(marginOf(screen))})`,
    `  its geometry's newest column off the weapon through the blows: ${metres(newest)} at worst`,
    `  blows: ${blows.map((blow) => blowWords(blow)).join('; ') || 'none'} (the fastest ${fastest.toFixed(1)} m/s)`,
    ...(everyFrame ? frames.map(frameWords) : []),
  ];
  const problems: string[] = [];
  if (newest !== null && newest > NEWEST_MOST) {
    problems.push(`the trail's newest column ${metres(newest)} off the weapon through a blow (at most `
      + `${metres(NEWEST_MOST)})`);
  }
  if (outside > OUTSIDE_MOST) {
    problems.push(`${percent(outside)} of the trail's light outside where the weapons swept over the last `
      + `${WINDOW} s (at most ${percent(OUTSIDE_MOST)})`);
  }
  for (const blow of unlitBlows(run)) problems.push(`no trail through the blow at ${seconds(blow[0].at)}`);
  const margin = marginOf(screen);
  if (heads.median !== null && heads.median > margin) {
    problems.push(`its newest end ${pixels(heads.median)} off the blade (median; the margin ${pixels(margin)})`);
  }
  const still = litStill(run).slice(0, 4).map((frame) => seconds(frame.at));
  if (still.length) problems.push(`lit while the weapons were still, at ${still.join(', ')}`);
  return { lines, problems: problems.map((problem) => `${run.name}: ${problem}`) };
}

/** The furthest the trail's newest column was from the weapon over the blows' frames (m), none if never shown. */
function newestThrough(blows: TrailFrame[][]): number | null {
  const offs = blows.flat().flatMap((frame) => (frame.newest === null ? [] : [frame.newest]));
  return offs.length ? Math.max(...offs) : null;
}

/** A frame as words, for `--frames`. */
function frameWords(frame: TrailFrame): string {
  const framed = frame.framed ? '' : ', out of the frame';
  return `    ${seconds(frame.at)}: ${frame.speed.toFixed(1)} m/s${framed}; lit ${frame.lit} (${frame.outside} `
    + `outside), its newest column ${metres(frame.newest)} off the weapon, its pixels ${pixels(frame.head)} off `
    + 'the blade';
}

/** The frame whose trail's light fell outside the most, as words (none if none did). */
function outsideWords(worst: TrailFrame | null): string {
  if (!worst) return '';
  return ` (the most at ${seconds(worst.at)}: ${percent(worst.outsideLight / worst.light)} of its light, `
    + `${worst.outside} of ${worst.lit} pixels)`;
}

/** A blow as words: from when, how long, and the trail's pixels over it. */
function blowWords(blow: TrailFrame[]): string {
  const lit = blow.reduce((sum, frame) => sum + frame.lit, 0);
  const framed = blow.some((frame) => frame.framed) ? '' : ', out of the frame';
  return `${seconds(blow[0].at)} for ${blow.length} frames, ${lit} pixels lit${framed}`;
}

// --- its picture

/** The frame its trail lit most: as the player saw it, and the trail's pixels on it darkened (white where the weapons
 *  swept, red outside, where they swept tinted blue). */
function pictureOf(run: StrikeRun): Pictured | null {
  const kept = run.brightest;
  if (!kept) return null;
  const { width, height } = run.screen;
  const lit = new Uint8Array(width * height);
  for (const pixel of kept.lit) lit[pixel] = 1;
  const frame = kept.seen ?? kept.shown;
  const seen = tileOf('seen', run.screen, (pixel) => [frame[pixel * 4], frame[pixel * 4 + 1], frame[pixel * 4 + 2]]);
  const trail = tileOf('trail', run.screen, (pixel) => {
    const [x, y] = pixelAt(pixel, run.screen);
    const swept = kept.mask.alpha[(Math.floor(y * MASK_SCALE) * kept.mask.width + Math.floor(x * MASK_SCALE)) * 4 + 3];
    if (lit[pixel]) return swept ? [255, 255, 255] : [255, 40, 40];
    const grey = Math.round(kept.shown[pixel * 4 + 1] * 0.35);
    return swept ? [grey, grey, Math.min(255, grey + 70)] : [grey, grey, grey];
  });
  const close = closeUp(trail.full, kept.lit, run.screen);
  const note = `${seconds(kept.frame.at)} after the press: ${kept.frame.lit} pixels lit, ${kept.frame.outside} outside`;
  return { label: `${run.name}, the frame its trail lit most`, tiles: [seen.tile, trail.tile, close], notes: [note] };
}

/** The screen's pixels (rows from the bottom) coloured by `colour`, whole and as a tile `PICTURE_WIDTH` wide. */
function tileOf(view: string, screen: Screen, colour: (pixel: number) => number[]):
  { tile: Tile; full: OffscreenCanvas } {
  const { width, height } = screen;
  const image = new ImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [red, green, blue] = colour((height - 1 - y) * width + x);
      const at = (y * width + x) * 4;
      image.data[at] = red;
      image.data[at + 1] = green;
      image.data[at + 2] = blue;
      image.data[at + 3] = 255;
    }
  }
  const full = new OffscreenCanvas(width, height);
  full.getContext('2d')!.putImageData(image, 0, 0);
  return { tile: tileFrom(view, full, 0, 0, width, height), full };
}

/** The box of `full` from (`left`, `top`) `width` by `height` as a tile `PICTURE_WIDTH` wide. */
function tileFrom(view: string, full: OffscreenCanvas, left: number, top: number, width: number, height: number):
  Tile {
  const small = document.createElement('canvas');
  small.width = PICTURE_WIDTH;
  small.height = Math.round(height * PICTURE_WIDTH / width);
  const context = small.getContext('2d')!;
  context.imageSmoothingEnabled = false;
  context.drawImage(full, left, top, width, height, 0, 0, small.width, small.height);
  return { view, png: small.toDataURL('image/png'), width: small.width, height: small.height };
}

/** the close-up's box round the trail's pixels: this many of the margins wider each way, at least this share of the
 *  screen's height high */
const CLOSE_ROUND = 4;
const CLOSE_LEAST = 0.15;

/** `full` close up round the pixels `lit`: a box of the screen's shape round them, a margin's few more each way. */
function closeUp(full: OffscreenCanvas, lit: number[], screen: Screen): Tile {
  let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const pixel of lit) {
    const [x, y] = pixelAt(pixel, screen);
    [left, top, right, bottom] = [Math.min(left, x), Math.min(top, y), Math.max(right, x), Math.max(bottom, y)];
  }
  const round = CLOSE_ROUND * marginOf(screen);
  const aspect = screen.width / screen.height;
  const height = Math.max(CLOSE_LEAST * screen.height, bottom - top + 2 * round, (right - left + 2 * round) / aspect);
  const width = Math.min(screen.width, height * aspect);
  const middle = [(left + right) / 2, (top + bottom) / 2];
  const from = [middle[0] - width / 2, middle[1] - height / 2];
  const x = Math.round(Math.min(screen.width - width, Math.max(0, from[0])));
  const y = Math.round(Math.min(screen.height - height, Math.max(0, from[1])));
  return tileFrom('close', full, x, y, Math.round(width), Math.round(Math.min(screen.height, height)));
}

// --- the canaries

/** Whether this game has a trail to plant faults in (its tunable values). */
function hasTrail(): boolean {
  try {
    return Boolean(window.__tuned?.('swingTrail.life'));
  } catch {
    return false;
  }
}

/** The faults the checks must catch: a trail that lasts a second, one never lit, and one drawn through the eyes by the
 *  world's camera instead of the arms' own (where the weapon isn't seen). */
function plants(): Plant[] {
  const moved = (run: StrikeRun) => outsideShare(run) > OUTSIDE_MOST || litStill(run).length > 0;
  return [
    { name: 'the trail lasting a second', tune: { 'swingTrail.life': [1] }, caught: moved },
    { name: 'the trail never lit', tune: { 'swingTrail.glow': [0] }, caught: (run) => unlitBlows(run).length > 0 },
    {
      name: 'through the eyes, the trail drawn by the world\'s camera',
      view: 'first',
      each: () => trailMeshes().forEach((mesh) => mesh.layers.set(0)),
      caught: (run) => outsideShare(run) > OUTSIDE_MOST,
    },
  ];
}

/** Each fault planted in turn in the first strike (in its own view, or the first asked for), and whether it was
 *  caught. */
async function canaries(lab: Lab, options: TrailOptions): Promise<{ lines: string[]; missed: boolean }> {
  if (!hasTrail()) return { lines: ['canaries: this game has no swing trail to plant faults in'], missed: false };
  const lines: string[] = [];
  let missed = false;
  for (const plant of plants()) {
    const view = plant.view ?? options.views[0];
    if (!options.views.includes(view)) continue;
    const kept = Object.keys(plant.tune ?? {}).map((path) => [path, window.__tuned!(path)] as const);
    let run: StrikeRun;
    try {
      run = await followStrike(lab, options, options.strikes[0], view, plant);
    } finally {
      for (const [path, value] of kept) window.__tune!(path, value);
    }
    const caught = plant.caught(run);
    missed ||= !caught;
    lines.push(`canary, ${plant.name} (${run.name}): ${caught ? 'caught' : 'missed'}`);
  }
  return { lines, missed };
}

/** `lab trail`: each strike in each view, its trail's pixels against where the weapons swept. */
export async function trail(lab: Lab, options: TrailOptions): Promise<Report> {
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  for (const strike of options.strikes) {
    for (const view of options.views) {
      const run = await followStrike(lab, options, strike, view, null);
      const seen = judged(run, options.frames);
      lines.push(...seen.lines);
      problems.push(...seen.problems);
      const picture = options.pictures ? pictureOf(run) : null;
      if (picture) moments.push(picture);
    }
  }
  if (options.canary) {
    const planted = await canaries(lab, options);
    lines.push(...planted.lines);
    if (planted.missed) problems.push('the canary was missed');
  }
  return { text: lines.join('\n'), problems, moments };
}
