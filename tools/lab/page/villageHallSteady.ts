// `lab village`'s hall of heroes' walls steady as the view moves: the hero in the hall at midnight over the shoulder,
// turned to its long wall, the frame drawn and drawn again with the camera moved half a millimetre aside; what of it
// jumps by more than a few levels is edges alone (from play, "this wall in hall of heroes is z-fighting / flickering",
// "actually all walls do": its inner walls stand on the lamp list's shelter's edge, and read on them each pixel's side
// flipped, the walls between the torches' light and the street lamps'). `canary` reads each surface's side on it again,
// as it was, and the walls must flicker again.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { holdHour } from '../../../src/game/clock';
import { groundHeight } from '../../../src/world/ground';
import { faceCamera, viewMode } from '../../../src/core/renderer';
import { readShelterOnSurface } from '../../../src/core/lamps';
import { COTTAGES, HALL, TERRACE } from '../../../src/data/village';
import { seenThroughFromAbove } from '../../../src/core/seeThrough';
import { holdDoorLineAtOnce, villageReport } from '../../../src/game/village';
import { aimSight } from '../../../src/core/sight';
import { COTTAGE } from '../../../src/world/villagePlan';
import { hallSills } from '../../../src/world/village';
import { drawFrame, type Canvas } from './light';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** the size of the canary's sheet of floor (m), how far apart the hall's floor is read (m), how far over it a ray
 *  starts (m), and how near two surfaces lie to count as in one plane, where they flicker (m) */
const SHEET = 12;
const FLOOR_STEP = 1.5;
const OVER_FLOOR = 3;
const SAME_PLANE = 0.001;
/** how alike the ways two faces look must be for them to lie in one plane (a cosine) */
const SAME_FACING = 0.999;
/** how far beside a ray the rays that confirm it are sent (m) */
const BESIDE = 0.002;

/** how far in from the door he stands (m), the frames he's given, how far the camera moves aside between the frames
 *  (m), how far a channel jumps to count, and the most of the frame that may jump (5% did) */
const IN_FROM = 7;
const SETTLE = 40;
const NUDGE = 0.0005;
const JUMP = 8 / 255;
const MOST_JUMPED = 0.015;

/** The share of the pixels whose light jumped by more than `JUMP` between `a` and `b`. */
function jumpedShare(a: Canvas, b: Canvas): number {
  let jumped = 0;
  for (let at = 0; at < a.pixels.length; at += 4) {
    const red = Math.abs(a.pixels[at] - b.pixels[at]);
    const green = Math.abs(a.pixels[at + 1] - b.pixels[at + 1]);
    const blue = Math.abs(a.pixels[at + 2] - b.pixels[at + 2]);
    if (Math.max(red, green, blue) > JUMP) jumped++;
  }
  return jumped / (a.pixels.length / 4);
}

/** The frame drawn, and drawn again with the camera moved `NUDGE` aside; the share of it that jumped. */
function jumpedAsTheViewMoves(lab: Lab): number {
  const before = drawFrame(lab);
  G.camera.position.x += NUDGE;
  G.camera.updateMatrixWorld();
  try {
    return jumpedShare(before, drawFrame(lab));
  } finally {
    G.camera.position.x -= NUDGE;
    G.camera.updateMatrixWorld();
  }
}

/** A sheet in the hall's floor's own plane, of another colour and turned so its pixels can't agree with the floor's: a
 *  surface left in that plane, as the terrace's paving was. */
function coplanarSheet(): THREE.Mesh {
  const sheet = new THREE.Mesh(
    new THREE.PlaneGeometry(SHEET, SHEET).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xff00ff }),
  );
  sheet.position.set(TERRACE.x, TERRACE.high + 0.005, HALL.door - SHEET / 2);
  G.scene.add(sheet);
  return sheet;
}

/** Every mesh drawn in the scene but what moves on its bones or stands in many places, whose faces a ray can't read. */
function stillMeshes(): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  G.scene.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    const manyPlaces = (mesh as THREE.SkinnedMesh).isSkinnedMesh || (mesh as THREE.InstancedMesh).isInstancedMesh;
    if (mesh.isMesh && !manyPlaces) meshes.push(mesh);
  });
  return meshes;
}

/** The places over the hall's floor, from its door to its dais, with a second surface in the top one's plane. */
function placesInOnePlane(): string[] {
  const down = new THREE.Vector3(0, -1, 0);
  const meshes = stillMeshes();
  const places: string[] = [];
  for (let z = HALL.door - FLOOR_STEP / 2; z > HALL.daisZ; z -= FLOOR_STEP) {
    for (let x = TERRACE.x - HALL.inHalf + FLOOR_STEP / 2; x < TERRACE.x + HALL.inHalf; x += FLOOR_STEP) {
      const from = new THREE.Vector3(x, TERRACE.high + OVER_FLOOR, z);
      const hits = new THREE.Raycaster(from, down, 0, OVER_FLOOR + 1).intersectObjects(meshes, false);
      const floor = hits.findIndex((hit) => Math.abs(hit.point.y - TERRACE.high) < 0.1);
      const next = floor < 0 ? undefined : hits[floor + 1];
      if (next && hits[floor].distance + SAME_PLANE > next.distance) places.push(`${x.toFixed(1)},${z.toFixed(1)}`);
    }
  }
  return places;
}

/** No surface lies in the plane of the hall's floor (from play, "this floor is now flickering": run on to the door,
 *  it lay in the plane of the terrace's paving under it, each with stones of its own; moving the camera a hair
 *  showed nothing, as it takes a turn of the view to flip them, so this reads the surfaces themselves). `canary`
 *  plants a sheet in that plane. */
export async function hallFloorSteady(lab: Lab, canary: boolean): Promise<LightsChecked> {
  await viewBy(lab, viewMode());
  const sheet = canary ? coplanarSheet() : null;
  try {
    G.scene.updateMatrixWorld(true);
    const places = placesInOnePlane();
    const line = `over the hall's floor, ${places.length} places with a second surface in its plane`
      + (places.length ? ` (${places.slice(0, 4).join(' ')})` : '');
    if (canary) return { lines: [line], problems: [], caught: places.length > 0, moments: [] };
    const problems = places.length ? [`${line}: the floor flickers`] : [];
    return { lines: [line], problems, caught: null, moments: [] };
  } finally {
    if (sheet) G.scene.remove(sheet);
  }
}

/** how far apart rays are sent at the hall from each side and from above (m; not round, for none to run along a seam
 *  or a triangle's diagonal), how far off they start, how high its top is, and how many places are said */
const SIDE_STEP = 0.37;
/** the heights rays are sent at besides (m over its floor): the beam's band under the eaves, thinner than a step */
const THIN_BANDS = [6.4, 6.42, 6.45];
const RAY_OFF = 14;
const HALL_TOP = 11;
const PLACES_SAID = 14;

/** A ray at the hall: from where, which way. */
type HallRay = [THREE.Vector3, THREE.Vector3];

/** A building's box to send rays at: its least and most x and z, its floor and its top, and bands thinner than a
 *  step. */
interface Building {
  west: number;
  east: number;
  back: number;
  front: number;
  floor: number;
  top: number;
  bands: number[];
}

/** The hall of heroes and each cottage, each with room round it. */
function buildings(): Building[] {
  const hall = {
    west: TERRACE.x - HALL.half - 1,
    east: TERRACE.x + HALL.half + 1,
    back: HALL.wall - 1,
    front: HALL.door + 4,
    floor: TERRACE.high,
    top: HALL_TOP,
    bands: THIN_BANDS,
  };
  const cottages = COTTAGES.map((cottage) => {
    const reach = Math.hypot(COTTAGE.w, COTTAGE.d) / 2 * cottage.size + 1;
    return {
      west: cottage.x - reach,
      east: cottage.x + reach,
      back: cottage.z - reach,
      front: cottage.z + reach,
      floor: 0,
      top: COTTAGE.h + COTTAGE.rise + 1.5,
      bands: [],
    };
  });
  return [hall, ...cottages];
}

/** Rays at a building from over it and from its four sides, its portico's and its roof's faces among them. */
function raysAt(building: Building): HallRay[] {
  const { west, east, back, front, floor, top, bands } = building;
  const rays: HallRay[] = [];
  for (let x = west + 0.013; x < east; x += SIDE_STEP) {
    for (let z = back + 0.017; z < front; z += SIDE_STEP) {
      rays.push([new THREE.Vector3(x, top + RAY_OFF, z), new THREE.Vector3(0, -1, 0)]);
    }
    for (let y = floor + 0.011; y < top; y += SIDE_STEP) {
      rays.push([new THREE.Vector3(x, y, front + RAY_OFF), new THREE.Vector3(0, 0, -1)]);
      rays.push([new THREE.Vector3(x, y, back - RAY_OFF), new THREE.Vector3(0, 0, 1)]);
    }
    for (const up of bands) {
      rays.push([new THREE.Vector3(x, floor + up, front + RAY_OFF), new THREE.Vector3(0, 0, -1)]);
      rays.push([new THREE.Vector3(x, floor + up, back - RAY_OFF), new THREE.Vector3(0, 0, 1)]);
    }
  }
  for (let z = back + 0.017; z < front; z += SIDE_STEP) {
    for (let y = floor + 0.011; y < top; y += SIDE_STEP) {
      rays.push([new THREE.Vector3(west - RAY_OFF, y, z), new THREE.Vector3(1, 0, 0)]);
      rays.push([new THREE.Vector3(east + RAY_OFF, y, z), new THREE.Vector3(-1, 0, 0)]);
    }
  }
  return rays;
}

/** Which way a face a ray met looks, in the world. */
function worldFacing(hit: THREE.Intersection): THREE.Vector3 {
  if (!hit.face) throw new Error('lab: village: a ray met no face');
  return hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
}

/** A face's triangle's sides (m): what it's part of, as a merged mesh has no other name for it. */
function faceSize(hit: THREE.Intersection): string {
  const { face } = hit;
  const position = (hit.object as THREE.Mesh).geometry.getAttribute('position');
  if (!face || !position) throw new Error('lab: village: a ray met no face');
  const corners = [face.a, face.b, face.c].map((corner) => new THREE.Vector3().fromBufferAttribute(position, corner));
  const sides = corners.map((corner, i) => corner.distanceTo(corners[(i + 1) % 3])).sort((a, b) => a - b);
  return `${sides[0].toFixed(2)}x${sides[1].toFixed(2)}`;
}

/** Whether a ray goes on, to the eye, past a face it met: a roof or a wall the hall thins is seen through from
 *  above. */
function seenPast(hit: THREE.Intersection): boolean {
  const { material } = hit.object as THREE.Mesh;
  return !Array.isArray(material) && seenThroughFromAbove(material);
}

/** Where a ray meets two faces in one plane first, as far as it's seen through: the plane, and the place in it. Read
 *  only at its first face, the ceiling's top and the portico's beam's, in one plane under the roof's ghost, went
 *  unseen,
 *  from play, "this surface still flickers". */
function firstInOnePlane(ray: HallRay, meshes: THREE.Mesh[]): { plane: string; at: THREE.Vector3 } | null {
  const hits = new THREE.Raycaster(ray[0], ray[1], 0, RAY_OFF * 3).intersectObjects(meshes, false);
  for (let at = 0; at + 1 < hits.length; at++) {
    const first = hits[at];
    const next = hits[at + 1];
    // (two faces of one turned box meet at its corner, and a ray clipping it meets both: nothing to fight there)
    if (next.distance - first.distance <= SAME_PLANE && worldFacing(first).dot(worldFacing(next)) >= SAME_FACING) {
      const axis = ray[1].x !== 0 ? 'x' : ray[1].y !== 0 ? 'y' : 'z';
      const faces = `${faceSize(first)} & ${faceSize(next)}`;
      return { plane: `${axis}=${first.point[axis].toFixed(2)} (${faces})`, at: first.point };
    }
    if (!seenPast(first)) return null;
  }
  return null;
}

/** Whether rays a hair to each side meet two faces in one plane as well: one that lands on the seam between two stones
 *  or on a triangle's diagonal meets both, with nothing to fight, and the rays beside it meet one. */
function stillTwoBeside(ray: HallRay, meshes: THREE.Mesh[]): boolean {
  const across = Math.abs(ray[1].y) > 0.5 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const along = new THREE.Vector3().crossVectors(ray[1], across);
  for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const from = ray[0].clone().addScaledVector(across, a * BESIDE).addScaledVector(along, b * BESIDE);
    if (!firstInOnePlane([from, ray[1]], meshes)) return false;
  }
  return true;
}

/** The planes `places` lie in, each with how many and the box they fill. */
function planesSaid(places: { plane: string; at: THREE.Vector3 }[]): string {
  const planes = new Map<string, { count: number; box: THREE.Box3 }>();
  for (const { plane, at } of places) {
    const read = planes.get(plane) ?? { count: 0, box: new THREE.Box3() };
    read.count++;
    read.box.expandByPoint(at);
    planes.set(plane, read);
  }
  const edge = (at: THREE.Vector3): string => `${at.x.toFixed(1)},${at.y.toFixed(1)},${at.z.toFixed(1)}`;
  return [...planes].sort((a, b) => b[1].count - a[1].count).slice(0, PLACES_SAID)
    .map(([plane, read]) => `${plane} ${read.count}x ${edge(read.box.min)}..${edge(read.box.max)}`).join('; ');
}

/** A sheet in the plane of the portico's beam's face. */
function beamFaceSheet(): THREE.Mesh {
  const ray = new THREE.Raycaster(new THREE.Vector3(TERRACE.x, TERRACE.high + 0.72 + 5.2 + 0.2, HALL.door + 8),
    new THREE.Vector3(0, 0, -1));
  const face = ray.intersectObjects(stillMeshes(), false)[0];
  if (!face) throw new Error('lab: village: no beam before the hall');
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), new THREE.MeshBasicMaterial({ color: 0xff00ff }));
  sheet.position.set(face.point.x, face.point.y, face.point.z - 0.0002);
  G.scene.add(sheet);
  return sheet;
}

/** No two of the hall's outer faces lie in one plane (from play, "still flickering": the portico's beam and the ceiling
 *  over it shared a front face, and its gable and its walls shared others: from above, as the view moved, one showed
 *  through the other in stripes). `canary` plants a sheet in the beam's face. */
export async function hallFacesSteady(lab: Lab, canary: boolean): Promise<LightsChecked> {
  await viewBy(lab, viewMode());
  G.scene.updateMatrixWorld(true);
  const sheet = canary ? beamFaceSheet() : null;
  try {
    G.scene.updateMatrixWorld(true);
    const meshes = stillMeshes();
    const rays = buildings().flatMap(raysAt);
    const places: { plane: string; at: THREE.Vector3 }[] = [];
    for (const ray of rays) {
      const place = firstInOnePlane(ray, meshes);
      if (place && stillTwoBeside(ray, meshes)) places.push(place);
    }
    const line = `at the hall and the cottages, of ${rays.length} rays, ${places.length} met two faces in one plane`
      + (places.length ? `: ${planesSaid(places)}` : '');
    if (canary) return { lines: [line], problems: [], caught: places.length > 0, moments: [] };
    return { lines: [line], problems: places.length ? [line] : [], caught: null, moments: [] };
  } finally {
    if (sheet) G.scene.remove(sheet);
  }
}

/** the shares across and along a sill it's read at, off the panes in its middle; how far over it a ray starts (m); the
 *  canary's sheet's size, and how far it lies under where a sill's top is (m) */
const SILL_ACROSS = [-0.35, 0.35];
const SILL_ALONG = [-0.3, 0, 0.3];
const OVER_SILL = 0.5;
const SILL_SHEET = 0.4;
const SHEET_UNDER = 0.0002;

/** The places on the hall's windows' sills with a second surface in the top one's plane. */
function sillsInOnePlane(): string[] {
  const down = new THREE.Vector3(0, -1, 0);
  const meshes = stillMeshes();
  const places: string[] = [];
  for (const sill of hallSills()) {
    for (const across of SILL_ACROSS) {
      for (const along of SILL_ALONG) {
        const from = new THREE.Vector3(sill.x + across * sill.deep, sill.y + OVER_SILL, sill.z + along * sill.wide);
        const hits = new THREE.Raycaster(from, down, 0, OVER_SILL * 2).intersectObjects(meshes, false);
        if (!hits.length) throw new Error(`lab: village: no sill under ${from.x.toFixed(1)}, ${from.z.toFixed(1)}`);
        const next = hits[1];
        if (next && hits[0].distance + SAME_PLANE > next.distance) {
          places.push(`${from.x.toFixed(1)},${from.z.toFixed(1)}`);
        }
      }
    }
  }
  return places;
}

/** No surface lies in the plane of a window's sill (from play, seen from above in the hall: "bottom / sill of
 *  windows are flickering, probably z fighting": the sill's top and the wall's course under it were at one height).
 *  `canary` plants a sheet in the first sill's plane. */
export async function hallSillsSteady(lab: Lab, canary: boolean): Promise<LightsChecked> {
  await viewBy(lab, viewMode());
  const [sill] = hallSills();
  let sheet: THREE.Mesh | null = null;
  if (canary) {
    sheet = new THREE.Mesh(
      new THREE.PlaneGeometry(SILL_SHEET, SILL_SHEET).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xff00ff }),
    );
    const top = new THREE.Raycaster(new THREE.Vector3(sill.x, sill.y + OVER_SILL, sill.z), new THREE.Vector3(0, -1, 0));
    const met = top.intersectObjects(stillMeshes(), false)[0];
    sheet.position.set(sill.x + SILL_ACROSS[1] * sill.deep, met.point.y - SHEET_UNDER, sill.z);
    G.scene.add(sheet);
  }
  try {
    G.scene.updateMatrixWorld(true);
    const places = sillsInOnePlane();
    const line = `on the hall's ${hallSills().length} window sills, ${places.length} places with a second surface in `
      + `their plane${places.length ? ` (${places.slice(0, 3).join(' ')})` : ''}`;
    if (canary) return { lines: [line], problems: [], caught: places.length > 0, moments: [] };
    return { lines: [line], problems: places.length ? [`${line}: the sills flicker`] : [], caught: null, moments: [] };
  } finally {
    if (sheet) G.scene.remove(sheet);
  }
}

/** The hall's walls at midnight as the view moves a hair. */
export async function hallWallsSteady(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const kept = viewMode();
  holdHour(0);
  try {
    const at = new THREE.Vector3(TERRACE.x, 0, HALL.door - IN_FROM);
    at.y = groundHeight(at.x, at.z);
    await viewBy(lab, 'third');
    G.player.walkTo = null;
    // (turned to the long wall on his left, its windows and torches before him)
    G.player.place(at, Math.PI / 2);
    faceCamera(Math.PI / 2);
    await lab.step(SETTLE);
    if (canary) readShelterOnSurface(true);
    const jumped = jumpedAsTheViewMoves(lab);
    const line = `hall's walls as the view moves ${NUDGE * 1000} mm: ${(jumped * 100).toFixed(2)}% of the frame jumped `
      + `(at most ${MOST_JUMPED * 100}%)`;
    const flickered = jumped > MOST_JUMPED;
    if (canary) return { lines: [line], problems: [], caught: flickered, moments: [] };
    const problems = flickered ? [`${line}: the walls flicker`] : [];
    return { lines: [line], problems, caught: null, moments: [] };
  } finally {
    if (canary) readShelterOnSurface(false);
    holdHour(null);
    await viewBy(lab, kept);
  }
}

/** how far either side of the door's line he steps (m), the frames he stands on each side, how many times he steps
 *  across, the frames he's given first, and the most of the frame that may jump between two frames */
const ACROSS_LINE = 0.04;
const FRAMES_A_SIDE = 4;
const CROSSINGS = 8;
// (4 s: what thins fades over about a second, and still fading from where he stood before, a wall crossed the
// share its depth is let go at mid-read, 4.6% of the frame in one frame)
const LINE_SETTLE = 240;
const MOST_LINE_JUMP = 0.02;

/** The hero stood just in or out of the door's line (`inside`), the camera kept where it is. */
function standAtLine(inside: boolean, camera: THREE.Matrix4): void {
  const at = new THREE.Vector3(TERRACE.x, 0, HALL.door + (inside ? -ACROSS_LINE : ACROSS_LINE));
  at.y = groundHeight(at.x, at.z);
  G.player.walkTo = null;
  G.player.place(at, Math.PI);
  holdCamera(camera);
}

/** The camera put back where `camera` had it: what moves the frame is then the door's line alone. */
function holdCamera(camera: THREE.Matrix4): void {
  camera.decompose(G.camera.position, G.camera.quaternion, G.camera.scale);
  G.camera.updateMatrixWorld(true);
  // (the fog told too: it places each pixel by the camera, and left at the game's, it read the frame 0.3 m off)
  aimSight(G.camera);
}

/** The worst jump between two frames: its share of the frame, where its pixels lie (shares of the frame, from its
 *  top left), and the step it came at. */
interface Jump { share: number; box: string; step: number; thinned: string }

/** What the hall thins now, as the game's own report has it: each wall's share, the beam's, the roof's and the
 *  columns'. */
function thinnedNow(): string {
  const { walls, beam, roof, columns } = villageReport() as {
    walls: Record<string, number>; beam: number; roof: number; columns: { whole: number; sight: number };
  };
  const said = Object.entries(walls).map(([kind, share]) => `${kind} ${share}`).join(', ');
  return `${said}, beam ${beam}, roof ${roof}, columns ${columns.whole} and ${columns.sight}`;
}

/** Where the pixels that jumped between `a` and `b` lie, as shares of the frame from its top left. */
function jumpedBox(a: Canvas, b: Canvas): string {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (let at = 0; at < a.pixels.length; at += 4) {
    const red = Math.abs(a.pixels[at] - b.pixels[at]);
    const green = Math.abs(a.pixels[at + 1] - b.pixels[at + 1]);
    const blue = Math.abs(a.pixels[at + 2] - b.pixels[at + 2]);
    if (Math.max(red, green, blue) <= JUMP) continue;
    const pixel = at / 4;
    const x = pixel % a.width;
    // (read back from the bottom row up)
    const y = a.height - 1 - Math.floor(pixel / a.width);
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }
  if (left > right) return 'none';
  const share = (n: number, of: number): string => (n / of).toFixed(2);
  return `${share(left, a.width)},${share(top, a.height)} to ${share(right, a.width)},${share(bottom, a.height)}`;
}

/** The worst jump between two frames as he stepped to and fro across the door's line. */
async function mostJumpedAcrossLine(lab: Lab): Promise<Jump> {
  const camera = G.camera.matrixWorld.clone();
  let before = drawFrame(lab);
  let most: Jump = { share: 0, box: 'none', step: 0, thinned: '' };
  for (let step = 0; step < CROSSINGS * FRAMES_A_SIDE; step++) {
    standAtLine(Math.floor(step / FRAMES_A_SIDE) % 2 === 0, camera);
    await lab.step(1);
    holdCamera(camera);
    const now = drawFrame(lab);
    const share = jumpedShare(before, now);
    if (share > most.share) most = { share, box: jumpedBox(before, now), step, thinned: thinnedNow() };
    before = now;
  }
  return most;
}

/**
 * The hall's columns steady as he steps to and fro across its door's line, at midnight from above, the hero hidden and
 * the camera held (from play, "moving back and forth here flickers the columns": in the hall and on its portico flipped
 * at a stroke there, and the room's columns with them, from thinned to kept in a frame). `canary` flips them at once
 * again, which must jump.
 */
export async function doorLineSteady(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const kept = viewMode();
  holdHour(0);
  holdDoorLineAtOnce(canary);
  try {
    await viewBy(lab, 'top');
    const camera = new THREE.Matrix4();
    standAtLine(false, camera.copy(G.camera.matrixWorld));
    faceCamera(Math.PI);
    await lab.step(LINE_SETTLE);
    G.player.obj.visible = false;
    const most = await mostJumpedAcrossLine(lab);
    G.player.obj.visible = true;
    const share = (most.share * 100).toFixed(2);
    const line = `stepping across the hall's door's line, ${CROSSINGS} times: at most ${share}% `
      + `of the frame jumped between two frames (at most ${MOST_LINE_JUMP * 100}%), at step ${most.step}, `
      + `within ${most.box} of the frame (thinned then: ${most.thinned})`;
    const flickered = most.share > MOST_LINE_JUMP;
    if (canary) return { lines: [line], problems: [], caught: flickered, moments: [] };
    const problems = flickered ? [`${line}: the columns flicker`] : [];
    return { lines: [line], problems, caught: null, moments: [] };
  } finally {
    G.player.obj.visible = true;
    holdDoorLineAtOnce(false);
    holdHour(null);
    await viewBy(lab, kept);
  }
}
