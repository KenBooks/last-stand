// `lab village`'s hall of heroes from above, wall by wall, each from play, each stand after the owner's picture:
//
// `roomColumnsStay`: in the doorway the room's columns he sees over the wall stay: "when entering hall, pillars inside
// disappear". A shaft shows if the frame changes with the columns hidden. `--canary`: they're hidden.
//
// `doorConeFromStair`: from a step down the stair and on down it, looking in, only the middle doorway bay opens
// (`doorFadeShare >= 0.5`) so the floor past the doorway shows as in 1st/3rd person while `hallFront`'s wings stay
// solid (`hallFront` 0.00) and the room's wings stay unseen behind the wall. `--canary`: holds the middle doorway bay
// shut (`holdDoorMiddleOff`) and drops his line-of-sight door wedge (`holdDoorWedgeOff`).
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
import { goTo, holdDoorMiddleOff, holdHeroLightOff, spotToUse } from '../../../src/game/village';
import { holdHour } from '../../../src/game/clock';
import { heroesStanding } from '../../../src/game/hall';
import { isWarm } from '../../../src/game/warm';
import { CAMERA } from '../../../src/data/balance';
import { setZoom } from '../../../src/core/renderer';
import { doorFadeShare, hideHallColumns, wholeShare } from '../../../src/core/seeThrough';
import { holdDoorWedgeOff, seenShareAt } from '../../../src/core/sight';
import { groundHeight } from '../../../src/world/ground';
import { walkLength } from '../../../src/world/walkPath';
import { drawFrame } from './light';
import {
  floorMark, fromAboveAtNoon, inFrame, LEAST_SHOWN, LOOKING_IN, shownMarks, standFacing,
} from './villageHallOpens';
import { hisPixels } from './villageHeroInView';
import type { LightsChecked } from './villageLights';

/** the terrace's floor, the hall's middle (x), and the top of its walls */
const FLOOR = TERRACE.high;
const MIDDLE = TERRACE.x;
const WALL_TOP = FLOOR + HALL.wallHigh;

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
const LEAST_STAIR_AISLE = 0.9;
const LEAST_DOOR_FADE = 0.5;
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

/** On the stair below the terrace, looking in, the doorway cone opens so the aisle shows while `hallFront`'s lower
 *  wings stay solid and doorway sight stays out of the wings beside the door. */
export async function doorConeFromStair(lab: Lab, canary: boolean): Promise<LightsChecked> {
  return fromAboveAsPictured(lab, async () => {
    holdDoorMiddleOff(canary);
    holdDoorWedgeOff(canary);
    const lines: string[] = [];
    let wrong = false;
    let doorCaught = false;
    let wedgeCaught = false;
    const moments = [];
    try {
      for (const down of STAIR_DOWN) {
        await standFacing(lab, TERRACE.x, TERRACE.front + down, LOOKING_IN);
        const marks = STAIR_FLOOR_IN.map((inside) => floorMark(TERRACE.x, HALL.inFront - inside))
          .filter((mark) => inFrame(mark.position) || (G.scene.remove(mark), false));
        if (!marks.length) throw new Error(`lab: village: no mark past the hall's door is in the frame, ${down} m down`);
        const shown = shownMarks(lab, marks);
        if (!canary) moments.push(await lab.screen(`${down} m down the stair: doorway bay open, wings solid`, []));
        for (const mark of marks) G.scene.remove(mark);
        const frontShare = wholeShare('hallFront');
        const doorShare = doorFadeShare();
        const aisleSeen = seenShareAt(TERRACE.x, HALL.inFront - 3.5);
        const beside = seenBesideDoor();
        lines.push(`${down} m down the hall's stair, hallFront ${frontShare.toFixed(2)} (expected 0), `
          + `doorMiddle ${doorShare.toFixed(2)}, floor past doorway shown: ${(shown * 100).toFixed(0)}% `
          + `(at least ${LEAST_SHOWN * 100}%), aisle seen ${(aisleSeen * 100).toFixed(0)}% `
          + `(at least ${LEAST_STAIR_AISLE * 100}%); beside the door past his line of sight seen `
          + `${(beside * 100).toFixed(0)}% (at most ${MOST_BESIDE * 100}%)`);
        if (shown < LEAST_SHOWN) doorCaught = true;
        if (beside > MOST_BESIDE) wedgeCaught = true;
        wrong ||= (!canary && (frontShare > 0 || doorShare < LEAST_DOOR_FADE)) || shown < LEAST_SHOWN
          || aisleSeen < LEAST_STAIR_AISLE || beside > MOST_BESIDE;
      }
    } finally {
      holdDoorMiddleOff(false);
      holdDoorWedgeOff(false);
    }
    if (canary) return { lines, problems: [], caught: doorCaught && wedgeCaught, moments: [] };
    return { lines, problems: wrong ? lines : [], caught: null, moments };
  });
}

/** How much of the room's floor beside the door, either side past his line of sight through it, he sees: the most of
 *  the two. */
function seenBesideDoor(): number {
  const z = HALL.inFront - BESIDE_IN;
  return Math.max(seenShareAt(MIDDLE - BESIDE_ACROSS, z), seenShareAt(MIDDLE + BESIDE_ACROSS, z));
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
  // (the front wall is 0.6 m thick from `HALL.door` to `HALL.inFront`, so a downward ray is lowest over `HALL.inFront`)
  const along = (HALL.inFront - eye.z) / (point.z - eye.z);
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
