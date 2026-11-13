// `lab village`'s hero and the place round him behind what stands free, and what's built staying whole. From play, each
// a scenario here: behind the stair's cheek, behind the fountain and behind a lamp post, "character and context around
// character needs to be visible even if the character is behind props"; at a cottage's corner and by the hall's walls,
// "I should not able to see through walls like this".
//
// `heroBehindProps` reads how much of him shows: where he alone is drawn (all the village hidden) against the frame
// with him and without him. The prop must have hidden him with its hole shut (the state checked), must show him with it
// open, and must open round him; the stair's cheek hides him under his waist alone, and must open nothing ("lets make
// exception for thinning, and dont thin if obstacle is below waist"). `--canary`: with the hole shut, too little of him
// must show in every scenario.
//
// `wallsStayWhole` draws the frame with the hole and without, at spots round a cottage's corners and along the hall's
// walls over the shoulder, and reads whether the near plane cuts a wall. `--canary`: what's built thinned as it was,
// the near plane left at 0.5 m.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { faceCamera, farNearAtWalls, setZoom, viewMode, type ViewMode } from '../../../src/core/renderer';
import {
  fadeWhole, holdBuiltWhole, holdHoleOpening, holdPropHole, thinBuiltOverShoulder,
} from '../../../src/core/seeThrough';
import { holdHour } from '../../../src/game/clock';
import { COTTAGES, HALL, TERRACE } from '../../../src/data/village';
import { FOUNTAIN } from '../../../src/world/fountain';
import { groundHeight } from '../../../src/world/ground';
import * as world_ from '../../../src/world/village';
import { CAMERA } from '../../../src/data/balance';
import { COTTAGE } from '../../../src/world/villagePlan';
import { wallHit } from '../../../src/world/wall';
import { drawFrame, type Canvas } from './light';
import { timeCalls } from './timing';
import { changedShare, viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

type Moment = LightsChecked['moments'][number];

/** A prop he stands behind: a point of it, the way from it to him, how far along (m), how far aside of that (m, as the
 *  camera stands aside over his shoulder), and the view. */
interface BehindProp {
  name: string;
  x: number;
  z: number;
  way: number;
  off: number;
  aside: number;
  view: ViewMode;
  /** the least of the frame outside him the hole opens: a post is thin, a basin wide */
  leastRound: number;
  /** it hides him under his waist alone, so nothing opens (from play, "dont thin if obstacle is below waist") */
  underWaist?: boolean;
}

/** the frames he's given to settle, and the hour */
const SETTLE = 90;
const HOUR = 12;
/** how much a pixel's channel must move to be his (he's dark against dark stone, and bloom moves a little) */
const HIS = 10 / 255;
/** the least of him shown with the hole open, the most with it shut (else nothing hid him) */
const LEAST_SEEN = 0.65;
const MOST_SHUT = 0.8;
/** the most of the frame a hole may change where what stands before him hides him under his waist alone */
const MOST_UNDER_WAIST = 0.0005;
/** the village's lamps, and the portico's columns where this commit has them (an A/B's other side may not) */
const { LAMPS } = world_;
const PORTICO_COLUMNS = (world_ as { PORTICO_COLUMNS?: readonly THREE.Box3[] }).PORTICO_COLUMNS;
/** what of the frame the hole may change round his box, the post's and the cheek's */
const SCENARIOS: readonly BehindProp[] = [
  {
    name: "the stair's cheek",
    x: TERRACE.x + TERRACE.stairHalf + 0.36,
    z: (TERRACE.front + TERRACE.stairFoot) / 2,
    way: Math.PI / 2,
    off: 0.8,
    aside: 0,
    view: 'top',
    leastRound: 0,
    underWaist: true,
  },
  { name: 'the fountain', x: 0, z: 0, way: 0.6, off: FOUNTAIN.r + 0.5, aside: -0.32, view: 'third', leastRound: 0.02 },
  {
    name: 'a lamp post',
    x: TERRACE.x + LAMPS.x,
    z: LAMPS.z,
    way: 0.4,
    off: 0.6,
    aside: -0.07,
    view: 'third',
    leastRound: 0.001,
  },
  ...porticoScenario(),
];

/**
 * From play, the portico's columns stood solid over him from the square and the stair, capital and all: they thin whole
 * with the hall alone, and the hall's own thinning saw none of them, "why this not becoming transparent ?". Behind the
 * nearer the stair's on the east, from above alone: over the shoulder there the camera comes in to 3 m, and his pixels
 * read with the village hidden took the frame's adaptation round him too, 39% of him read shown with no column at all.
 */
function porticoScenario(): BehindProp[] {
  if (!PORTICO_COLUMNS) return [];
  const middle = PORTICO_COLUMNS[2].getCenter(new THREE.Vector3());
  return [{
    name: 'a column of the portico',
    x: middle.x,
    z: middle.z,
    way: 0,
    off: 2.2,
    aside: 0,
    view: 'top',
    leastRound: 0.005,
  }];
}

/** The hero stood `off` m along `way` from (x, z), the camera behind him, across the prop, let settle. */
async function standBehind(lab: Lab, prop: BehindProp): Promise<void> {
  const x = prop.x + Math.sin(prop.way) * prop.off - Math.cos(prop.way) * prop.aside;
  const z = prop.z + Math.cos(prop.way) * prop.off + Math.sin(prop.way) * prop.aside;
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), prop.way);
  // (at the lobby's zoom: a check before it left the camera further out, and the column hid less of him)
  setZoom(CAMERA.lobbyZoom);
  faceCamera(prop.way);
  await lab.step(SETTLE);
}

/** The frame with him and without him, as they stand. */
function withAndWithoutHim(lab: Lab): { him: Canvas; none: Canvas } {
  const him = drawFrame(lab);
  G.player.obj.visible = false;
  const none = drawFrame(lab);
  G.player.obj.visible = true;
  return { him, none };
}

/** Whether a pixel differs between two frames, as his. */
function differs(a: Canvas, b: Canvas, at: number): boolean {
  return Math.abs(a.pixels[at] - b.pixels[at]) > HIS
    || Math.abs(a.pixels[at + 1] - b.pixels[at + 1]) > HIS
    || Math.abs(a.pixels[at + 2] - b.pixels[at + 2]) > HIS;
}

/** The pixels he covers, read with the village hidden (no prop before him, no shadow of his on it). */
export function hisPixels(lab: Lab): number[] {
  const village = G.arena.groupOf('village');
  village.visible = false;
  const { him, none } = withAndWithoutHim(lab);
  village.visible = true;
  const pixels: number[] = [];
  for (let at = 0; at < him.pixels.length; at += 4) {
    if (differs(him, none, at)) pixels.push(at);
  }
  return pixels;
}

/** The share of `pixels` where he shows in the frame as it stands. */
export function shownOf(lab: Lab, pixels: number[]): number {
  const { him, none } = withAndWithoutHim(lab);
  return pixels.filter((at) => differs(him, none, at)).length / Math.max(pixels.length, 1);
}

/** What a scenario read. */
interface BehindRead {
  seen: number;
  seenShut: number;
  opened: number;
  line: string;
}

/** A prop's scenario read: him shut away, shown, and what of the frame the hole opens. */
async function readBehind(lab: Lab, prop: BehindProp): Promise<BehindRead> {
  await viewBy(lab, prop.view);
  await standBehind(lab, prop);
  const pixels = hisPixels(lab);
  if (pixels.length < 100) throw new Error(`lab: village: the hero isn't in the frame behind ${prop.name}`);
  const seen = shownOf(lab, pixels);
  const open = drawFrame(lab);
  holdPropHole(true);
  // (the hall's columns thin whole, by a share of their own: shut, as the hole is)
  fadeWhole('hallColumn', 0);
  const seenShut = shownOf(lab, pixels);
  const shut = drawFrame(lab);
  holdPropHole(false);
  await lab.step(1);
  const opened = changedShare(open, shut);
  const bound = prop.underWaist
    ? `at most ${(MOST_UNDER_WAIST * 100).toFixed(2)}%: under his waist alone`
    : `at least ${(prop.leastRound * 100).toFixed(1)}%`;
  const line = `behind ${prop.name}, ${prop.view}: ${(seen * 100).toFixed(0)}% of him shows `
    + `(${(seenShut * 100).toFixed(0)}% with no hole), the hole opens ${(opened * 100).toFixed(2)}% of the frame `
    + `(${bound})`;
  return { seen, seenShut, opened, line };
}

/** Whether a read shows him and the place round him, behind what did hide him. */
function readFails(read: BehindRead, prop: BehindProp): string | null {
  if (read.seenShut > MOST_SHUT) return `${read.line}: nothing hides him, so nothing is measured`;
  if (prop.underWaist) {
    return read.opened > MOST_UNDER_WAIST ? `${read.line}: it thinned, hiding him under his waist alone` : null;
  }
  if (read.seen < LEAST_SEEN) return `${read.line}: he doesn't show`;
  if (read.opened < prop.leastRound) return `${read.line}: the place round him doesn't show`;
  return null;
}

/** He and the place round him show behind each prop of the play reports. */
export async function heroBehindProps(lab: Lab, canary: boolean): Promise<LightsChecked> {
  holdHour(HOUR);
  const kept = viewMode();
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Moment[] = [];
  let caught = 0;
  try {
    for (const prop of SCENARIOS) {
      const read = await readBehind(lab, prop);
      lines.push(read.line);
      const failed = readFails(read, prop);
      if (failed) problems.push(failed);
      // (the canary: what the hole shut leaves of him must fail, or the scenario never hid him)
      if (read.seenShut < MOST_SHUT) caught++;
      if (!canary) moments.push(await lab.screen(`behind ${prop.name}`, [read.line]));
    }
    if (canary) return { lines, problems: [], caught: caught === SCENARIOS.length, moments: [] };
    return { lines, problems, caught: null, moments };
  } finally {
    holdHoleOpening(null);
    holdPropHole(false);
    holdHour(null);
    await viewBy(lab, kept);
  }
}

/** how far from a corner he stands, each way along the wall and out from it (m) */
const CORNER_ALONG = [-0.4, 0.6];
const CORNER_OUT = [0.35, 0.8];
/** which way he's turned at a spot, from along the wall */
const TURNS = [0, Math.PI, Math.PI / 2, -Math.PI / 2];
/** the most of the frame the hole may change where only what's built stands, and how many pictures */
const MOST_CHANGED = 0.002;
const MOST_PICTURES = 4;
/** the frames the casts are timed over, and the most they may take of one (ms): a 144 Hz frame has 6.9 */
const TIMED = 120;
const MOST_CASTS = 0.5;
/** the points round the near plane a wall may not cut, in the frame's own -1 to 1 */
const NEAR_POINTS: readonly (readonly [number, number])[] = [
  [-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0], [-1, 0], [1, 0], [0, 1], [0, -1],
];

/** A spot by what's built. */
interface WallSpot { name: string; x: number; z: number; facing: number }

/** Spots round cottage 0's corners, his side to the wall or past its corner. */
function cottageSpots(): WallSpot[] {
  const cottage = COTTAGES[0];
  const spots: WallSpot[] = [];
  const across = new THREE.Vector2(Math.cos(cottage.facing), -Math.sin(cottage.facing));
  const along = new THREE.Vector2(Math.sin(cottage.facing), Math.cos(cottage.facing));
  const halfW = (COTTAGE.w / 2) * cottage.size;
  const halfD = (COTTAGE.d / 2) * cottage.size;
  for (const sideW of [-1, 1]) {
    for (const sideD of [-1, 1]) {
      for (const by of CORNER_ALONG) {
        for (const out of CORNER_OUT) {
          const x = cottage.x + across.x * sideW * (halfW + out) + along.x * sideD * (halfD + by);
          const z = cottage.z + across.y * sideW * (halfW + out) + along.y * sideD * (halfD + by);
          const facing = cottage.facing + (sideD > 0 ? Math.PI : 0);
          spots.push({ name: `cottage ${sideW},${sideD} ${by},${out}`, x, z, facing });
        }
      }
    }
  }
  return spots;
}

/** Spots along the hall's side walls and at its door, in and out. */
function hallSpots(): WallSpot[] {
  const spots: WallSpot[] = [];
  const midZ = (HALL.inFront + HALL.daisZ) / 2;
  for (const side of [-1, 1]) {
    const inside = TERRACE.x + side * (HALL.inHalf - 0.4);
    spots.push({ name: `hall's wall inside ${side}`, x: inside, z: midZ, facing: 0 });
    spots.push({ name: `hall's door jamb ${side}`, x: TERRACE.x + side * 0.9, z: HALL.inFront - 0.2, facing: 0 });
    const before = TERRACE.x + side * (HALL.inHalf - 1);
    spots.push({ name: `hall's front ${side}`, x: before, z: HALL.door + 0.6, facing: 0 });
  }
  return spots;
}

/** Whether the near plane cuts a wall, by the lines from the camera to points round it. */
function nearCutsWall(): boolean {
  const hit = wallHit();
  const camera = G.camera;
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const point = new THREE.Vector3();
  return NEAR_POINTS.some(([x, y]) => {
    point.set(x, y, -1).unproject(camera);
    return G.arena.wall.cast(camera.position, point, hit);
  });
}

/** What the spots read: the most the hole changed of the frame and where, and where the near plane cut a wall. */
async function readWallSpots(lab: Lab, spots: WallSpot[], pictures: boolean): Promise<{
  most: number; where: string; cut: string[]; moments: Moment[];
}> {
  let most = 0;
  let where = '';
  const cut: string[] = [];
  const moments: Moment[] = [];
  for (const spot of spots) {
    for (const turn of TURNS) {
      G.player.walkTo = null;
      G.player.place(new THREE.Vector3(spot.x, groundHeight(spot.x, spot.z), spot.z), spot.facing + turn);
      faceCamera(spot.facing + turn);
      await lab.step(30);
      const label = `${spot.name}, turned ${turn.toFixed(1)}`;
      if (nearCutsWall()) cut.push(label);
      const open = drawFrame(lab);
      const built = holdBuiltWhole(true, 0);
      const shut = drawFrame(lab);
      holdBuiltWhole(false, built);
      const changed = changedShare(open, shut);
      if (changed > most) {
        most = changed;
        where = label;
      }
      if (pictures && moments.length < MOST_PICTURES && turn === TURNS[0]) moments.push(await lab.screen(label, []));
    }
  }
  return { most, where, cut, moments };
}

/** What the wall's casts take of a frame by the wall (ms: the camera's and the hole's, read over `TIMED` frames). */
async function castsAFrame(lab: Lab): Promise<number> {
  const timing = timeCalls(G.arena.wall, 'cast');
  await lab.step(TIMED);
  return timing.stop().total / TIMED;
}

/** What's built stays whole over the shoulder, and the near plane cuts none of it. */
export async function wallsStayWhole(lab: Lab, canary: boolean): Promise<LightsChecked> {
  holdHour(HOUR);
  const kept = viewMode();
  try {
    await viewBy(lab, 'third');
    const spots = [...cottageSpots(), ...hallSpots()];
    thinBuiltOverShoulder(canary);
    farNearAtWalls(canary);
    const { most, where, cut, moments } = await readWallSpots(lab, spots, !canary);
    const casts = await castsAFrame(lab);
    const said = cut.slice(0, 4).join('; ');
    const line = `by what's built at ${spots.length * TURNS.length} spots over the shoulder: the hole changes at most `
      + `${(most * 100).toFixed(2)}% of the frame (${where}; at most ${MOST_CHANGED * 100}%), `
      + `the near plane cuts a wall at ${cut.length}${cut.length ? ` (${said})` : ''}`;
    const timed = `the wall's casts take ${casts.toFixed(3)} ms of a frame (at most ${MOST_CASTS})`;
    const failed = most > MOST_CHANGED || cut.length > 0 || casts > MOST_CASTS;
    if (canary) return { lines: [line], problems: [], caught: most > MOST_CHANGED && cut.length > 0, moments: [] };
    return { lines: [line, timed], problems: failed ? [line, timed] : [], caught: null, moments };
  } finally {
    thinBuiltOverShoulder(false);
    farNearAtWalls(false);
    holdHour(null);
    await viewBy(lab, kept);
  }
}
