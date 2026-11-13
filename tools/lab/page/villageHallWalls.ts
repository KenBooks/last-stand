// `lab village`'s hall of heroes from above, wall by wall, each from play, each stand after the owner's picture:
//
// `hallWallsOneByOne`: a wall thins while it hides him or the floor near him, all of it, and no other does, its
// window's linings with it: "here we should not try to make transparent the side which doesn't help see the hero",
// "this wall should be transparent but the one 90 degree to it should not", "here both should be transparent, but
// only 1 is", "and here, should be transparent too", "this is good, but weird geometry on left". Places on each wall
// are read drawn as the game thins and with nothing thinned. `--canary`: every wall thinned at each stand, as it was.
//
// `roomColumnsStay`: in the doorway the room's columns he sees over the wall stay: "when entering hall, pillars inside
// disappear". A shaft shows if the frame changes with the columns hidden. `--canary`: they're hidden.
//
// `doorConeFromStair` ("when player is down even one stair, then in top down he cannot see into the hall, even tho he
// clearly can in 3rd person view"): from a step down the stair and on down it, the floor past the door shows as at it.
// `--canary`: the cone held shut.
//
// `heroesSeenFromAbove`: from above the plinths' heroes stand while he can see a plinth: "pedestals are empty from this
// position, they should display heroes if character can see them from their cone of view". `--canary`: read as none.
//
// `objectsWalkedShort`: a clicked object is walked to by the shortest way into its reach: "when I click on campfire,
// hero moves in from the left side, it should be the shortest path". `--canary`: the shortest way read as half as long.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { HALL, TERRACE, VILLAGE_OBJECTS, type VillageObject } from '../../../src/data/village';
import { goTo, holdHallWallsAllThin, holdHeroLightOff, holdSeenFloorWalls, seenFloorHidden,
  spotToUse } from '../../../src/game/village';
import { holdHour } from '../../../src/game/clock';
import { heroesStanding } from '../../../src/game/hall';
import { isWarm } from '../../../src/game/warm';
import { CAMERA } from '../../../src/data/balance';
import { setZoom } from '../../../src/core/renderer';
import { hideHallColumns, wholeShare } from '../../../src/core/seeThrough';
import { holdDoorWedgeOff, seenShareAt } from '../../../src/core/sight';
import { groundHeight } from '../../../src/world/ground';
import { walkLength } from '../../../src/world/walkPath';
import { drawFrame } from './light';
import {
  floorMark, fromAboveAtNoon, inFrame, LEAST_SHOWN, LOOKING_IN, shownMarks, standFacing,
} from './villageHallOpens';
import { hisPixels, shownOf } from './villageHeroInView';
import type { LightsChecked } from './villageLights';
import { placesThinned } from './villageSeenPast';

/** the terrace's floor, the hall's middle (x), how thick its walls are, and the top of its walls */
const FLOOR = TERRACE.high;
const MIDDLE = TERRACE.x;
const THICK = HALL.half - HALL.inHalf;
const WALL_TOP = FLOOR + HALL.wallHigh;
/** how far apart a wall's places are read (m), from how high and up to how high over the floor */
const PLACE_STRIDE = 1;
const PLACE_FROM = 0.8;
const PLACE_TO = 6;
/** how much a place must differ to read thinned (of full light): a dark wall over a dark floor changes little, and one
 *  drawn whole by a level at most */
const READS_THINNED = 0.006;
/** the least share of a wall's places in the frame that must read thinned, the most where it must stay whole */
const LEAST_THINNED = 0.75;
const MOST_STAY_THINNED = 0.2;
/** the least of a wall's places that must be read for it to count */
const LEAST_READ = 4;
/** the least of him shown where a wall stands before him */
const LEAST_OF_HIM = 0.4;

/** The hall's four walls. */
type WallName = 'front' | 'back' | 'east' | 'west';

/** A wall as a rectangle on the floor: which way it runs, its outer and inner faces, and how far along it's read. */
interface WallFace {
  name: WallName;
  acrossX: boolean;
  outer: number;
  inner: number;
  from: number;
  to: number;
}

/** The hall's walls (a front wall's places are read beside its door, its lintel and frame being another stone). */
const FACES: WallFace[] = [
  { name: 'front', acrossX: true, outer: HALL.door, inner: HALL.inFront, from: MIDDLE - 5.4, to: MIDDLE + 5.4 },
  { name: 'back', acrossX: true, outer: HALL.wall - THICK, inner: HALL.wall, from: MIDDLE - 5.4, to: MIDDLE + 5.4 },
  { name: 'east', acrossX: false, outer: MIDDLE + HALL.half, inner: MIDDLE + HALL.inHalf, from: -32.4, to: -15.9 },
  { name: 'west', acrossX: false, outer: MIDDLE - HALL.half, inner: MIDDLE - HALL.inHalf, from: -32.4, to: -15.9 },
];

/** How far along `face`'s plane a point lies out from the room, its plane's own coordinate. */
const offPlane = (face: WallFace, point: THREE.Vector3): number => (face.acrossX ? point.z : point.x);

/** The camera's side of `face`: its outer plane if it stands past that, else its inner. */
function planeSeen(face: WallFace): number {
  const eye = offPlane(face, G.camera.position);
  const outward = Math.sign(face.outer - face.inner);
  return (eye - face.outer) * outward > 0 ? face.outer : face.inner;
}

/** Whether the sight from the camera to `point` passes under the portico's beam's depth, at its height: the beam stands
 *  whole over what's past it. */
function passesBeam(point: THREE.Vector3): boolean {
  const eye = G.camera.position;
  const beam = new THREE.Box3(
    new THREE.Vector3(MIDDLE - HALL.half, FLOOR + HALL.beamFoot, HALL.beamZ - HALL.beamDeep / 2),
    new THREE.Vector3(MIDDLE + HALL.half, FLOOR + HALL.wallHigh, HALL.beamZ + HALL.beamDeep / 2),
  );
  const way = point.clone().sub(eye);
  const away = way.length();
  const met = new THREE.Ray(eye.clone(), way.divideScalar(away)).intersectBox(beam, new THREE.Vector3());
  return met !== null && met.distanceTo(eye) < away;
}

/** Whether the sight from the camera to `point` passes through `face` before it gets there. */
function passesThrough(face: WallFace, point: THREE.Vector3): boolean {
  const eye = G.camera.position;
  const plane = planeSeen(face);
  const denominator = offPlane(face, point) - offPlane(face, eye);
  if (Math.abs(denominator) < 1e-3) return false;
  const along = (plane - offPlane(face, eye)) / denominator;
  if (along <= 0.01 || along >= 0.99) return false;
  const height = eye.y + (point.y - eye.y) * along;
  const across = face.acrossX ? eye.x + (point.x - eye.x) * along : eye.z + (point.z - eye.z) * along;
  return height < WALL_TOP && across > face.from - 1 && across < face.to + 1;
}

/** `face`'s places as the camera sees them, those it sees over or past every other wall alone. */
function placesOf(face: WallFace): THREE.Vector3[] {
  const plane = planeSeen(face);
  const places: THREE.Vector3[] = [];
  for (let along = face.from; along <= face.to; along += PLACE_STRIDE) {
    if (face.acrossX && Math.abs(along - MIDDLE) < HALL.doorHalf + 0.5) continue;
    for (let up = PLACE_FROM; up <= PLACE_TO; up += PLACE_STRIDE) {
      const place = face.acrossX
        ? new THREE.Vector3(along, FLOOR + up, plane)
        : new THREE.Vector3(plane, FLOOR + up, along);
      if (passesBeam(place)) continue;
      if (!FACES.some((other) => other !== face && passesThrough(other, place))) places.push(place);
    }
  }
  return places;
}

/** A stand after one of the owner's pictures: where he stands, how the camera's turned, what must thin, what not. */
interface WallStand {
  name: string;
  x: number;
  z: number;
  facing: number;
  thins: WallName[];
  stays: WallName[];
  /** whether the portico's beam must thin there (or stay, false); not read if not given */
  beamThins?: boolean;
}

/** The stands, each after a picture of the owner's. */
const WALL_STANDS: WallStand[] = [
  {
    name: 'a stride in from the door, the camera past it: the side walls stay',
    x: MIDDLE + 1,
    z: HALL.inFront - 2,
    facing: Math.PI,
    thins: ['front'],
    stays: ['east', 'west', 'back'],
  },
  {
    // (it hides the floor he sees along its foot: from above he sees what he'd see through his eyes, the owner's goal)
    name: 'on the floor, the camera over the west wall, which hides the floor he sees beside it: it thins',
    x: MIDDLE + 0.5,
    z: -22,
    facing: Math.PI - 0.4,
    thins: ['west'],
    stays: ['east', 'back'],
  },
  {
    name: 'on the floor, the camera over the east wall, which hides the floor he sees beside it: it thins',
    x: MIDDLE - 0.5,
    z: -22,
    facing: Math.PI + 0.4,
    thins: ['east'],
    stays: ['west', 'back'],
  },
  {
    // (the front wall thins where it hides the floor he sees, as his sight's cone opens it from inside: from play,
    // "this should be semi transparent, right? visibility cone and all")
    name: 'on the floor, the camera past the east wall: the west wall stays',
    x: MIDDLE + 3,
    z: -21,
    facing: -Math.PI / 2,
    thins: ['east'],
    stays: ['west'],
  },
  {
    name: 'by the corner, the camera past both: both thin',
    x: MIDDLE + 4.2,
    z: HALL.door - 2.4,
    facing: Math.PI * 1.25,
    thins: ['east', 'front'],
    stays: ['west'],
  },
  {
    name: 'on the dais, the camera past the back wall: it thins',
    x: MIDDLE,
    z: HALL.plinthZ + 1.4,
    facing: 0,
    thins: ['back'],
    stays: [],
  },
  {
    name: 'under the portico\'s beam, the camera along it: he shows through it',
    x: MIDDLE + 1.2,
    z: HALL.beamZ,
    facing: -Math.PI / 2,
    thins: [],
    stays: [],
  },
  {
    // (and the beam past him, over the square he sees: from play, "also this top concrete bar should be thinned too")
    // (and the side walls, over the terrace he sees past the hall's front corners: "the wall on left should thin,
    // otherwise I cannot see ground under it")
    name: 'on the portico, the camera over the room: every wall before the ground he sees thins',
    x: MIDDLE + 1.5,
    z: HALL.door + 1.5,
    facing: 0,
    thins: ['front', 'east', 'west'],
    stays: [],
    beamThins: true,
  },
  {
    // (the front wall past him hides the portico he sees through the door: all of it thins, not a cone of his sight
    // cut across it, from play, "didnt we agree to thin whole wall? but mark unseen regions with fog of war ?")
    // (and the west wall under the camera, for the floor he sees along its foot)
    name: 'a stride in from the door, the camera over the west wall, turned to the door: the front wall thins whole',
    x: MIDDLE + 0.5,
    z: HALL.inFront - 1.2,
    facing: 0.7,
    thins: ['front', 'west'],
    stays: ['east'],
  },
  {
    name: 'a stride in from the door, the camera over the east wall, turned to the door: the front wall thins whole',
    x: MIDDLE - 0.5,
    z: HALL.inFront - 1.2,
    facing: -0.7,
    thins: ['front', 'east'],
    stays: ['west'],
  },
  {
    name: 'on the square aside of the stair, seeing nothing of the room: the hall past him stays whole',
    x: MIDDLE + 9,
    z: TERRACE.stairFoot + 3,
    facing: Math.PI,
    thins: [],
    stays: ['front', 'east', 'west'],
    beamThins: false,
  },
];

/** What a wall read: how many of its places in the frame read thinned. */
interface WallRead {
  name: WallName;
  thinned: number;
  read: number;
}

/** Each wall of `names` read in the frame drawn now. */
function readWalls(lab: Lab, names: WallName[]): WallRead[] {
  const faces = FACES.filter((face) => names.includes(face.name));
  const placesEach = faces.map(placesOf);
  const shares = placesThinned(lab, placesEach.flat());
  let at = 0;
  return faces.map((face, index) => {
    const ofWall = shares.slice(at, at + placesEach[index].length).filter((share) => share !== null) as number[];
    at += placesEach[index].length;
    return { name: face.name, thinned: ofWall.filter((share) => share > READS_THINNED).length, read: ofWall.length };
  });
}

/** What's wrong with what a stand read, and how much of him shows there. */
function standProblems(stand: WallStand, reads: WallRead[], him: number): string[] {
  const problems: string[] = [];
  for (const read of reads) {
    const say = `${stand.name}: ${read.name} wall ${read.thinned} of ${read.read} places thinned`;
    if (read.read < LEAST_READ && stand.thins.includes(read.name)) problems.push(`${say}: too few in the frame`);
    const share = read.read > 0 ? read.thinned / read.read : 0;
    if (stand.thins.includes(read.name) && share < LEAST_THINNED) problems.push(`${say}: it should thin`);
    if (stand.stays.includes(read.name) && share > MOST_STAY_THINNED) problems.push(`${say}: it should stay whole`);
  }
  const beam = wholeShare('hallBeam') > 0;
  if (stand.beamThins !== undefined && beam !== stand.beamThins) {
    problems.push(`${stand.name}: the portico's beam ${beam ? 'thins' : 'stays whole'}`);
  }
  if (him < LEAST_OF_HIM) problems.push(`${stand.name}: ${(him * 100).toFixed(0)}% of him shows`);
  return problems;
}

/** the zoom of the owner's pictures, further out than the lobby's own, and the frames the camera takes to get there */
const OWNERS_ZOOM = 0.8;
/** how far down the stair past the terrace's front he stands (m: a step, then on down it), and how far in from the
 *  door the floor's marked from there, those in the frame read: past what the doorway itself shows from there, under
 *  the wall over it (marked in the doorway, 1.5 to 3.5 m in, the floor showed with the cone shut) */
const STAIR_DOWN = [0.3, 1.5, 2.9];
const STAIR_FLOOR_IN = [3.5, 4, 4.5, 5, 5.5, 6.5];
/** the room's floor beside the door, either side past the lines from him through its jambs (m aside, m in), and the
 *  most of it seen (from play, "new thinning ignores line of sight": from the stair the whole room was seen) */
const BESIDE_ACROSS = 4.5;
const BESIDE_IN = 0.5;
const MOST_BESIDE = 0.25;
const ZOOM_FRAMES = 120;

/** `read` from above at noon, the camera as far out as the owner's pictures have it, put back after it. */
async function fromAboveAsPictured<T>(lab: Lab, read: () => Promise<T>, zoom = OWNERS_ZOOM): Promise<T> {
  return fromAboveAtNoon(lab, async () => {
    setZoom(zoom);
    await lab.step(ZOOM_FRAMES);
    try {
      return await read();
    } finally {
      setZoom(CAMERA.lobbyZoom);
      await lab.step(ZOOM_FRAMES);
    }
  });
}

/** On the stair below the terrace, looking in, the floor he sees through the door shown through the wall over it, from
 *  each stand. */
export async function doorConeFromStair(lab: Lab, canary: boolean): Promise<LightsChecked> {
  return fromAboveAsPictured(lab, async () => {
    holdSeenFloorWalls(canary);
    holdDoorWedgeOff(canary);
    const lines: string[] = [];
    let wrong = false;
    const moments = [];
    for (const down of STAIR_DOWN) {
      await standFacing(lab, TERRACE.x, TERRACE.front + down, LOOKING_IN);
      const marks = STAIR_FLOOR_IN.map((inside) => floorMark(TERRACE.x, HALL.inFront - inside))
        .filter((mark) => inFrame(mark.position) || (G.scene.remove(mark), false));
      if (!marks.length) throw new Error(`lab: village: no mark past the hall's door is in the frame, ${down} m down`);
      const shown = shownMarks(lab, marks);
      if (!canary) moments.push(await lab.screen(`${down} m down the stair: what he sees through the door`, []));
      for (const mark of marks) G.scene.remove(mark);
      const beside = seenBesideDoor();
      lines.push(`${down} m down the hall's stair, the floor past its door shown: ${(shown * 100).toFixed(0)}% `
        + `(at least ${LEAST_SHOWN * 100}%), the wall thinned ${wholeShare('hallFront').toFixed(2)}; beside the door past his `
        + `line of sight seen ${(beside * 100).toFixed(0)}% (at most ${MOST_BESIDE * 100}%)`);
      wrong ||= shown < LEAST_SHOWN || beside > MOST_BESIDE;
    }
    holdSeenFloorWalls(false);
    holdDoorWedgeOff(false);
    if (canary) return { lines, problems: [], caught: wrong, moments: [] };
    return { lines, problems: wrong ? lines : [], caught: null, moments };
  });
}

/** How much of the room's floor beside the door, either side past his line of sight through it, he sees: the most of
 *  the two. */
function seenBesideDoor(): number {
  const z = HALL.inFront - BESIDE_IN;
  return Math.max(seenShareAt(MIDDLE - BESIDE_ACROSS, z), seenShareAt(MIDDLE + BESIDE_ACROSS, z));
}

/** A wall thins while it stands between the camera and him, and no other. */
export async function hallWallsOneByOne(lab: Lab, canary: boolean): Promise<LightsChecked> {
  return fromAboveAsPictured(lab, async () => {
    holdHallWallsAllThin(canary);
    const lines: string[] = [];
    const problems: string[] = [];
    const moments: Pictured[] = [];
    try {
      for (const stand of WALL_STANDS) {
        await standFacing(lab, stand.x, stand.z, stand.facing);
        const pixels = hisPixels(lab);
        const him = pixels.length > 0 ? shownOf(lab, pixels) : 0;
        const reads = readWalls(lab, [...stand.thins, ...stand.stays]);
        const said = reads.map((read) => `${read.name} ${read.thinned}/${read.read}`).join(', ');
        lines.push(`${stand.name}: thinned ${said}, of him ${(him * 100).toFixed(0)}%`);
        lines.push(`  places hiding floor he sees: ${seenFloorHidden()}`);
        problems.push(...standProblems(stand, reads, him));
        if (!canary) moments.push(await lab.screen(stand.name, []));
      }
    } finally {
      holdHallWallsAllThin(false);
    }
    if (canary) return { lines, problems: [], caught: problems.length > 0, moments: [] };
    return { lines, problems, caught: null, moments };
  });
}

/** how far out the camera stands in the doorway's reads: nearer, as in the picture, a shaft shows just over the wall */
const DOORWAY_ZOOM = 0.62;
/** the hour his light in the hall is read at, where he stands, and the least mean light of his pixels (of full) */
const NIGHT = 0;
const IN_THE_HALL: [number, number, number][] = [
  [1, -22, Math.PI], [3, -21, -Math.PI / 2], [0, -19, 0], [4.2, HALL.door - 2.4, Math.PI * 1.25],
];
const LEAST_HIS_LIGHT = 0.1;
/** how bright a pixel counts as burned (its channels' mean: a warm light burns yellow, its blue far under its red), and
 *  the most of the frame that may be: a column a stride from him burned */
const BURNED = 0.6;
// (0.15% of that frame burns with his light off: the lit edge of the stair and a torch)
const MOST_BURNED = 0.003;

/** The share of the frame drawn now near white. */
function burnedShare(lab: Lab): number {
  const { pixels } = drawFrame(lab);
  let burned = 0;
  for (let at = 0; at < pixels.length; at += 4) {
    if ((pixels[at] + pixels[at + 1] + pixels[at + 2]) / 3 > BURNED) burned++;
  }
  return burned / (pixels.length / 4);
}

/** The mean light of the pixels he covers in the frame drawn now. */
function hisLight(lab: Lab): number {
  const pixels = hisPixels(lab);
  if (pixels.length === 0) throw new Error('lab: village: the hero isn\'t in the frame in the hall');
  const canvas = drawFrame(lab);
  let sum = 0;
  for (const at of pixels) sum += (canvas.pixels[at] + canvas.pixels[at + 1] + canvas.pixels[at + 2]) / 3;
  return sum / pixels.length;
}

/** By night on the hall's dark floor he stands lit: "a dark figure", a review. */
export async function heroLitInHall(lab: Lab, canary: boolean): Promise<LightsChecked> {
  return fromAboveAsPictured(lab, async () => {
    holdHour(NIGHT);
    holdHeroLightOff(canary);
    const lines: string[] = [];
    const problems: string[] = [];
    try {
      for (const [across, z, facing] of IN_THE_HALL) {
        await standFacing(lab, MIDDLE + across, z, facing);
        const light = hisLight(lab);
        const burned = burnedShare(lab);
        const line = `in the hall at ${across},${z} by night, his mean light ${light.toFixed(3)}, `
          + `${(burned * 100).toFixed(2)}% of the frame burned`;
        lines.push(line);
        if (light < LEAST_HIS_LIGHT) problems.push(`${line} (at least ${LEAST_HIS_LIGHT})`);
        if (burned > MOST_BURNED) problems.push(`${line} (at most ${MOST_BURNED * 100}%)`);
      }
    } finally {
      holdHeroLightOff(false);
      holdHour(null);
    }
    if (canary) return { lines, problems: [], caught: problems.length > 0, moments: [] };
    return { lines, problems, caught: null, moments: [] };
  });
}

/** where he stands in and at the doorway (m, from the door's outer face), how the camera's turned, and how high a shaft
 *  is read (m over the floor) */
const IN_DOORWAY = [0.4, -0.4, HALL.inFront - HALL.door, HALL.inFront - HALL.door - 0.15, -1];
const DOORWAY_TURNS = [Math.PI, Math.PI - 0.5, Math.PI + 0.5, Math.PI - 1, Math.PI + 1];
const SHAFT_UP = [3, 3.5, 4, 4.5, 5, 5.3];
/** the least share of them that must show: some lie under what doesn't go with them (a capital, a torch) */
const LEAST_SHAFTS = 0.7;
/** how much a shaft's place must change with the columns hidden to count as shown (of full light) */
const SHAFT_SHOWS = 0.02;
/** how far over the front wall's top a sight must pass to reach a shaft unhidden (m) */
const OVER_TOP = 0.2;

/** the portico's columns (m aside of the hall's middle, z), which stand before what's read and go with what's hidden,
 *  and how near one a sight may pass on the floor (m) */
const PORTICO_X = [3.3, 5.6];
const PORTICO_Z = -13.4;
const CLEAR_OF_PORTICO = 0.8;

/** Whether the sight from the camera to `point` passes a portico column, on the floor. */
function passesPortico(point: THREE.Vector3): boolean {
  const eye = G.camera.position;
  const along = (PORTICO_Z - eye.z) / (point.z - eye.z);
  if (along <= 0 || along >= 1) return false;
  const across = eye.x + (point.x - eye.x) * along - MIDDLE;
  return PORTICO_X.some((column) => Math.abs(Math.abs(across) - column) < CLEAR_OF_PORTICO);
}

/** Whether the sight from the camera to `point` passes over the hall's front wall, or never meets it. */
function seenOverFront(point: THREE.Vector3): boolean {
  const eye = G.camera.position;
  if (passesPortico(point)) return false;
  if (eye.z <= HALL.door) return true;
  const along = (HALL.door - eye.z) / (point.z - eye.z);
  return eye.y + (point.y - eye.y) * along > WALL_TOP + OVER_TOP;
}

/** The pixel `point` falls on, or null off the frame. */
function pixelAt(point: THREE.Vector3, width: number, height: number): number | null {
  const place = point.clone().project(G.camera);
  const column = Math.floor(((place.x + 1) / 2) * width);
  const row = Math.floor(((place.y + 1) / 2) * height);
  if (column < 0 || column >= width || row < 0 || row >= height) return null;
  return (row * width + column) * 4;
}

/** Of the room's shafts seen over the front wall, how many show (the frame changes with them hidden) and how many there
 *  are in the frame. */
function shaftsShown(lab: Lab, hidden: boolean): { shown: number; read: number; missed: string[] } {
  if (hidden) hideHallColumns(true);
  const canvas = drawFrame(lab);
  const asItIs = canvas.pixels.slice();
  hideHallColumns(true);
  const without = drawFrame(lab).pixels;
  hideHallColumns(false);
  let shown = 0;
  let read = 0;
  const missed: string[] = [];
  for (const z of HALL.columnZ) {
    for (const side of [-1, 1]) {
      for (const up of SHAFT_UP) {
        const point = new THREE.Vector3(MIDDLE + side * HALL.columnX, FLOOR + up, z);
        const pixel = pixelAt(point, canvas.width, canvas.height);
        if (pixel === null || !seenOverFront(point)) continue;
        read++;
        let differs = 0;
        for (let part = 0; part < 3; part++) differs += Math.abs(asItIs[pixel + part] - without[pixel + part]);
        if (differs / 3 > SHAFT_SHOWS) shown++;
        else missed.push(`${side > 0 ? 'east' : 'west'} ${z} ${up}`);
      }
    }
  }
  return { shown, read, missed };
}

/** In the doorway, the room's columns seen over the wall stay. */
export async function roomColumnsStay(lab: Lab, canary: boolean): Promise<LightsChecked> {
  return fromAboveAsPictured(lab, async () => {
    const lines: string[] = [];
    const problems: string[] = [];
    const moments: Pictured[] = [];
    let readAll = 0;
    let missedAll = 0;
    for (const off of IN_DOORWAY) {
      for (const facing of DOORWAY_TURNS) {
        await standFacing(lab, MIDDLE, HALL.door + off, facing);
        const { shown, read, missed } = shaftsShown(lab, canary);
        readAll += read;
        missedAll += read - shown;
        const name = `${off.toFixed(1)} m out of the door, turned ${facing.toFixed(2)}`;
        const eye = G.camera.position;
        const from = `the camera at ${eye.x.toFixed(1)},${eye.y.toFixed(1)},${eye.z.toFixed(1)}`;
        lines.push(`${name}, ${from}: ${shown} of ${read} shafts' places seen over the wall show`);
        if (shown < read * LEAST_SHAFTS) {
          problems.push(`${name}: ${read - shown} of ${read} shafts' places gone: ${missed.join(', ')}`);
        }
      }
    }
    for (const facing of [Math.PI, Math.PI + 0.5, Math.PI + 1]) {
      await standFacing(lab, MIDDLE, HALL.door + IN_DOORWAY[1], facing);
      const name = `in the doorway, turned ${facing.toFixed(2)}: the room's columns`;
      if (!canary) moments.push(await lab.screen(name, []));
    }
    if (readAll === 0) problems.push('no shaft read over the front wall: move the stands');
    if (canary) return { lines, problems: [], caught: missedAll > readAll * (1 - LEAST_SHAFTS), moments: [] };
    return { lines, problems, caught: null, moments };
  }, DOORWAY_ZOOM);
}

/** the frames given for the heroes to warm */
const WARM_FRAMES = 3000;

/** How many heroes stand on the dais with him at (x, z), the camera turned to `facing`. */
async function standingFrom(lab: Lab, x: number, z: number, facing: number): Promise<number> {
  await standFacing(lab, x, z, facing);
  await lab.until(() => isWarm('heroes'), WARM_FRAMES, 'village: the heroes warming as he nears them');
  await lab.step(30);
  return heroesStanding().length;
}

/** From above, the plinths' heroes stand while he can see a plinth, and not where he can't. */
export async function heroesSeenFromAbove(lab: Lab, canary: boolean): Promise<LightsChecked> {
  return fromAboveAtNoon(lab, async () => {
    const before = await standingFrom(lab, MIDDLE, HALL.door + 1.5, Math.PI);
    const aside = await standingFrom(lab, MIDDLE + 1.2, HALL.door + 0.8, -Math.PI / 2);
    const moments = canary ? [] : [await lab.screen('at the door from above, turned aside: the plinths', [])];
    const blind = await standingFrom(lab, MIDDLE + HALL.half + 1.2, HALL.door + 2, 0);
    const seen = canary ? 0 : Math.min(before, aside);
    const line = `from above, ${before} heroes stand with the door before him, ${aside} turned aside by it, `
      + `${blind} with no plinth in his sight`;
    const wrong = seen === 0 || blind > 0;
    if (canary) return { lines: [line], problems: [], caught: wrong, moments: [] };
    return { lines: [line], problems: wrong ? [line] : [], caught: null, moments };
  });
}

/** how far from an object he starts (m), the ways round it, the frames a walk is given, and how much further than the
 *  shortest way into its reach it may take (a share, and m for his starting and his body's corners) */
const WALK_FROM = 9;
const WALK_STARTS = 8;
const WALK_FRAMES = 1500;
const MOST_LONGER = 1.2;
const LONGER_BY = 0.8;
/** the points round an object's reach the shortest way is looked for at */
const REACH_POINTS = 32;

/** The floor's height at (x, z) is the object's, and a body stands there: a place it may be used from. */
function usableFrom(object: VillageObject, x: number, z: number): boolean {
  const atObject = groundHeight(object.at[0], object.at[1]);
  if (Math.abs(groundHeight(x, z) - atObject) > 0.5) return false;
  const kept = { x, z };
  G.arena.wall.keepIn(kept, G.player.radius);
  return Math.hypot(kept.x - x, kept.z - z) < 0.01;
}

/** The shortest way from (x, z) into the reach of `object`. */
function shortestInto(object: VillageObject, x: number, z: number, radius: number): number {
  let best = Infinity;
  for (let round = 0; round < REACH_POINTS; round++) {
    const way = (round / REACH_POINTS) * Math.PI * 2;
    const toX = object.at[0] + Math.sin(way) * (object.reach - 0.05);
    const toZ = object.at[1] + Math.cos(way) * (object.reach - 0.05);
    if (!usableFrom(object, toX, toZ)) continue;
    best = Math.min(best, walkLength(x, z, toX, toZ, radius));
  }
  return best;
}

/** Walked from `start` to where a click on `object` sends him, not using it (the campfire's dialog asks the relay,
 *  which answers no page of the lab's): how far he went. */
async function walkedTo(lab: Lab, object: VillageObject, start: [number, number]): Promise<number> {
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(start[0], groundHeight(start[0], start[1]), start[1]), 0);
  await lab.step(3);
  const [spotX, spotZ] = spotToUse(object);
  goTo(spotX, spotZ);
  let walked = 0;
  let last = G.player.pos.clone();
  await lab.step(WALK_FRAMES, undefined, () => {
    walked += G.player.pos.distanceTo(last);
    last = G.player.pos.clone();
  });
  return walked;
}

/** A clicked object is walked to by the shortest way into its reach. */
export async function objectsWalkedShort(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const lines: string[] = [];
  const problems: string[] = [];
  let readAll = 0;
  for (const object of VILLAGE_OBJECTS.filter((one) => one.id === 'campfire' || one.id === 'notice')) {
    for (let round = 0; round < WALK_STARTS; round++) {
      const way = (round / WALK_STARTS) * Math.PI * 2;
      const start: [number, number] = [
        object.at[0] + Math.sin(way) * WALK_FROM,
        object.at[1] + Math.cos(way) * WALK_FROM,
      ];
      if (!usableFrom(object, start[0], start[1])) continue;
      const shortest = shortestInto(object, start[0], start[1], G.player.radius);
      if (!Number.isFinite(shortest)) continue;
      const walked = await walkedTo(lab, object, start);
      readAll++;
      const most = (canary ? shortest / 2 : shortest) * MOST_LONGER + LONGER_BY;
      const name = `${object.id} from ${start[0].toFixed(1)},${start[1].toFixed(1)}`;
      lines.push(`${name}: walked ${walked.toFixed(1)} m, the shortest ${shortest.toFixed(1)} m`);
      if (walked > most) problems.push(`${name}: walked ${walked.toFixed(1)} m, the shortest ${shortest.toFixed(1)} m`);
    }
  }
  if (readAll === 0) throw new Error('lab: village: no walk to an object started');
  if (canary) return { lines, problems: [], caught: problems.length > 0, moments: [] };
  return { lines, problems, caught: null, moments: [] };
}
