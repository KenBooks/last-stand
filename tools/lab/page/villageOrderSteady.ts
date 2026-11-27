// `lab village --only blendedOrderSteady`: what blends is drawn in one order as the camera moves a little, wherever two
// records of it share pixels. The engine draws what blends the farthest first, each record by its own sphere
// (`blendedOrderKeys.ts`), and two records whose turns swap as the camera moves paint each other over and under by
// turns:
// the hall's columns, merged by material across the room, had all their plinths in one record and their shafts in
// another, and the plinths showed through the ghost of the column before him and then didn't (from play, "sometimes the
// stone at the foundation of the columns shows through... and then it doesn't, like a draw order issue"). Over the
// shoulder down the hall's aisle, beside each of its columns and on its portico, and from above over it, the camera is
// moved through small turns and zooms, and brought down as a boom drawn in brings it; at each step every record that
// blends is sorted as the engine sorts it. A pair whose order turns round between two steps while their boxes overlap
// on the screen is drawn with each hidden in turn (`blendedOverlap.ts`), and a flip where they share pixels. The hall's
// columns' parts must be drawn in their turns at every step (a plinth under its shaft). A pixel test first proves the
// pixels are read (the room's plinths through a ghost). The square, the cottages and every house's room were swept so
// once (#977), and nothing that blends there turned round. `--canary` gives the room's shafts their own sphere again.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { faceCamera, setZoom, viewMode } from '../../../src/core/renderer';
import type { ViewMode } from '../../../src/core/renderer';
import { holdHour } from '../../../src/game/clock';
import { RUST } from '../../../src/engine/index';
import { SEE_FLAGS } from '../../../src/engine/seeKinds';
import { lookOf } from '../../../src/engine/custom';
import type { Bridge } from '../../../src/engine/bridge';
import { inHallColumn } from '../../../src/core/seeThrough';
import { HALL, TERRACE } from '../../../src/data/village';
import { groundHeight } from '../../../src/world/ground';
import { viewBy } from './villageHallCull';
import { flipsBetween, sphereOfPositions, turnsBroken } from './blendedOrderKeys';
import * as villageBuild from '../../../src/world/village';
import { pixelsShared } from './blendedOverlap';
import type { Flip, ScreenRect, Sorted, Sphere, Stand } from './blendedOrderKeys';
import type { LightsChecked } from './villageLights';

/** A place he stands, the way he faces (rad), the view, and its name. */
interface Place { name: string; x: number; z: number; facing: number; view: ViewMode }

/** the hour (the play report's, midnight), and the frames each place and each small move are given to settle */
const HOUR = 0;
const SETTLE = 40;
const STEP_SETTLE = 6;
/** the small turns (rad) and the zooms the camera is moved through at each place, a path of small moves */
const TURNS = [-0.04, 0, 0.04];
const ZOOMS = [0.22, 0.45];
/** how far the camera is brought down at each (m), as a boom drawn in by a wall or a column brings it: the plinths'
 *  and the shafts' turns met with the eye a little over 3 m up, under the over-the-shoulder camera's own height */
const DROPS = [0, 0.6, 1.2];

/** A small move of the camera at a place: turned, zoomed, and brought down. */
interface Move { turn: number; zoom: number; drop: number }
/** the least overlap on the screen of two records' boxes that's looked into (px), and the least of their pixels shared
 *  in the frame as drawn that counts */
const LEAST_OVERLAP = 64;
const LEAST_SHARED = 32;
/** how many flips are named, and how many places with one pictured */
const NAMED = 12;
const PICTURES = 3;
/** a record's flags the engine draws apart from the rest of what blends: a layer, at a share of the pixels */
const DRAWN_APART = SEE_FLAGS.oneLayer | SEE_FLAGS.underLayers | SEE_FLAGS.gone | SEE_FLAGS.solid | SEE_FLAGS.cover;

/** Over the shoulder down the hall's aisle by each pair of columns, at the play report's stand, on the portico; from
 *  above over the hall and the square. */
function places(): Place[] {
  const found: Place[] = [{ name: 'the play report\'s', x: -1.6, z: -24, facing: -Math.PI / 2, view: 'third' }];
  for (const z of HALL.columnZ) {
    for (const facing of [Math.PI / 2, -Math.PI / 2, 0, Math.PI]) {
      found.push({ name: `aisle ${z}, facing ${facing.toFixed(2)}`, x: TERRACE.x, z, facing, view: 'third' });
    }
  }
  // (beside each of the room's columns, the camera behind him by the column: its boom drawn in, the eye low, where
  // the plinths' and the shafts' turns met, a little over 3 m up)
  for (const z of HALL.columnZ) {
    for (const side of [-1, 1]) {
      const x = TERRACE.x + side * (HALL.columnX - BESIDE);
      for (const facing of [-side * Math.PI / 2, Math.PI]) {
        found.push({ name: `beside ${x.toFixed(1)}, ${z}, facing ${facing.toFixed(2)}`, x, z, facing, view: 'third' });
      }
    }
  }
  const porticoZ = (HALL.door + TERRACE.front) / 2;
  for (const facing of [Math.PI / 2, -Math.PI / 2, 0]) {
    found.push({ name: `portico, facing ${facing.toFixed(2)}`, x: TERRACE.x + 2, z: porticoZ, facing, view: 'third' });
  }
  for (const z of [HALL.columnZ[0], porticoZ]) {
    found.push({ name: `from above at ${z}`, x: TERRACE.x + 1, z, facing: 0, view: 'top' });
  }
  return found;
}

/** how far in from a room column's middle toward the aisle he stands beside it (m) */
const BESIDE = 0.9;
/** each geometry's sphere as the engine makes it from its vertices, made once */
const spheres = new WeakMap<THREE.BufferGeometry, Sphere>();

/** `mesh`'s sphere in the world, as the engine moves it (`moved_sphere`: its radius by the matrix's largest scale). */
function worldSphere(mesh: THREE.Mesh): Sphere {
  let local = spheres.get(mesh.geometry);
  if (!local) {
    local = sphereOfPositions(mesh.geometry.attributes.position.array as ArrayLike<number>);
    spheres.set(mesh.geometry, local);
  }
  const middle = new THREE.Vector3(local.x, local.y, local.z).applyMatrix4(mesh.matrixWorld);
  const radius = local.radius * mesh.matrixWorld.getMaxScaleOnAxis();
  return { x: middle.x, y: middle.y, z: middle.z, radius };
}

/** Whether `object` and every parent of it are shown. */
function shown(object: THREE.Object3D): boolean {
  for (let at: THREE.Object3D | null = object; at; at = at.parent) if (!at.visible) return false;
  return true;
}

/** Where `mesh`'s box covers the screen (the whole screen where it reaches behind the camera). */
function rectOf(mesh: THREE.Mesh, camera: THREE.Camera, width: number, height: number): ScreenRect {
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox!;
  const rect = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  const corner = new THREE.Vector3();
  for (let k = 0; k < 8; k++) {
    corner.set(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z);
    corner.applyMatrix4(mesh.matrixWorld).project(camera);
    if (corner.z > 1 || corner.z < -1) return { left: 0, top: 0, right: width, bottom: height };
    const x = (corner.x + 1) / 2 * width;
    const y = (1 - corner.y) / 2 * height;
    rect.left = Math.min(rect.left, x);
    rect.right = Math.max(rect.right, x);
    rect.top = Math.min(rect.top, y);
    rect.bottom = Math.max(rect.bottom, y);
  }
  rect.left = Math.max(rect.left, 0);
  rect.top = Math.max(rect.top, 0);
  rect.right = Math.min(rect.right, width);
  rect.bottom = Math.min(rect.bottom, height);
  return rect;
}

/** `object`'s name, or its nearest named parent's with the steps up to it. */
function namedFrom(object: THREE.Object3D): string {
  let up = 0;
  for (let at: THREE.Object3D | null = object; at; at = at.parent, up++) {
    if (at.name) return up ? `${at.name} (${up} up)` : at.name;
  }
  return 'unnamed';
}

/** A record's name, the same at every step: its material's, its kind's, and where it stands. */
function nameOf(mesh: THREE.Mesh, sphere: Sphere): string {
  const material = mesh.material as THREE.Material & { seeThrough?: { kind?: string } };
  const what = material.name || material.type;
  const where = `${sphere.x.toFixed(1)}, ${sphere.y.toFixed(1)}, ${sphere.z.toFixed(1)}`;
  return `${namedFrom(mesh)} [${what}${inHallColumn(material) ? ', a room column' : ''}] at ${where} #${mesh.id}`;
}

/** A material's see-through flags as its records carry them: the bridge's own (`seenFlags`, on an older commit, an
 *  A/B's main, its see-through's part asked straight). */
function flagsOf(bridge: Bridge, material: THREE.Material): number {
  const asked = bridge as Bridge & { seenFlags?: (material: THREE.Material) => number };
  if (asked.seenFlags) return asked.seenFlags(material);
  // (an older bridge holds them all the same, on a part of its own it doesn't hand out)
  const held = bridge as unknown as { seeKinds: { flagsOf(material: THREE.Material): number } };
  return held.seeKinds.flagsOf(material);
}

/** The hall's columns' sets of parts in the turns they must be drawn in (none on a commit before them, an A/B's
 *  main). */
function columnSetsNow(): readonly (readonly THREE.Material[])[] {
  const asked = villageBuild as { columnTurns?: () => readonly (readonly THREE.Material[])[] };
  return asked.columnTurns?.() ?? [];
}

/** A material's set and turn among the hall's columns' (`columnSetsNow`), if it's one of them. */
function turnOf(sets: readonly (readonly THREE.Material[])[], material: THREE.Material): Sorted['turn'] {
  for (const [set, turns] of sets.entries()) {
    const at = turns.indexOf(material);
    if (at >= 0) return { set, at };
  }
  return undefined;
}

/** each record's mesh by its name, as `blendedNow` last met them */
const meshNamed = new Map<string, THREE.Mesh>();

/** Every record the engine draws among what blends now, in the order the walk meets them, as it sorts it. */
function blendedNow(): Sorted[] {
  const bridge = RUST.bridge;
  if (!bridge) throw new Error('the engine isn\'t drawing: no bridge to ask');
  const camera = G.camera;
  const frustum = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const size = G.renderer.getSize(new THREE.Vector2());
  const found: Sorted[] = [];
  meshNamed.clear();
  const sets = columnSetsNow();
  G.scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material) || mesh.userData.particles || !shown(mesh)) return;
    const material = mesh.material as THREE.Material;
    if (!material.visible || material.colorWrite === false || !mesh.layers.test(camera.layers)) return;
    // (a shader with no look of the engine's is never drawn by it: the ghosts' count, on a layer of its own)
    if ((material as THREE.ShaderMaterial).isShaderMaterial && !lookOf(material)) return;
    const flags = flagsOf(bridge, material);
    const blends = material.transparent || material.blending === THREE.AdditiveBlending;
    if (!blends || flags & DRAWN_APART || mesh.userData.lowRes || mesh.userData.fireFlames) return;
    // (a decal on what's opaque, drawn toward the eye off it: hidden by what stands before it whatever its turn, the
    // mage's forearms' ink on either arm)
    if (material.polygonOffset && material.polygonOffsetUnits < 0) return;
    const sphere = worldSphere(mesh);
    const ball = new THREE.Sphere(new THREE.Vector3(sphere.x, sphere.y, sphere.z), sphere.radius);
    if (mesh.frustumCulled && !frustum.intersectsSphere(ball)) return;
    const name = nameOf(mesh, sphere);
    meshNamed.set(name, mesh);
    found.push({
      name,
      thinned: (flags & SEE_FLAGS.thinned) !== 0,
      adds: material.blending === THREE.AdditiveBlending,
      sphere,
      rect: rectOf(mesh, camera, size.x, size.y),
      turn: turnOf(sets, material),
    });
  });
  return found;
}

/** The hero at `place`, the camera behind him (or over him), let settle. */
async function standAt(lab: Lab, place: Place): Promise<void> {
  await viewBy(lab, place.view);
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(place.x, groundHeight(place.x, place.z), place.z), place.facing);
  setZoom(ZOOMS[ZOOMS.length - 1]);
  faceCamera(place.facing);
  await lab.step(SETTLE);
}

/** The small moves at a place: through the turns at each drop at each zoom, back and forth, so each step changes one
 *  of them a little. */
function moves(): Move[] {
  const path: Move[] = [];
  let row = 0;
  ZOOMS.forEach((zoom, band) => {
    const drops = band % 2 ? [...DROPS].reverse() : DROPS;
    for (const drop of drops) {
      const turns = row++ % 2 ? [...TURNS].reverse() : TURNS;
      for (const turn of turns) path.push({ turn, zoom, drop });
    }
  });
  return path;
}

/** What one place read: the flips found as the camera moved there. */
interface PlaceRead { place: Place; flips: Flip[]; records: Set<string>; thinned: Set<string>; outOfTurn: number }

/** The flips at one place. */
async function readPlace(lab: Lab, place: Place): Promise<PlaceRead> {
  await standAt(lab, place);
  const stands: Stand[] = [];
  for (const move of moves()) {
    await moveTo(lab, place, move, STEP_SETTLE);
    G.camera.updateMatrixWorld();
    const eye = G.camera.position;
    stands.push({ eye: { x: eye.x, y: eye.y, z: eye.z }, records: blendedNow() });
  }
  const boxed: Flip[] = [];
  for (let at = 0; at + 1 < stands.length; at++) boxed.push(...flipsBetween(stands, at, LEAST_OVERLAP));
  const flips = await sharingPixels(lab, place, boxed);
  // (the steps at which a set of the columns' parts is drawn out of its turns: a plinth over its own shaft's foot)
  const outOfTurn = stands.filter((stand) => turnsBroken(stand).length > 0).length;
  const all = stands.flatMap((stand) => stand.records);
  const records = new Set(all.map((record) => record.name));
  const thinned = new Set(all.filter((record) => record.thinned).map((record) => record.name));
  return { place, flips, records, thinned, outOfTurn };
}

/** The camera moved at `place` by `move`, let settle `frames`, then brought down by its drop until the next frame
 *  (what's read and drawn before it is from there). */
async function moveTo(lab: Lab, place: Place, move: Move, frames: number): Promise<void> {
  setZoom(move.zoom);
  faceCamera(place.facing + move.turn);
  await lab.step(frames);
  G.camera.position.y -= move.drop;
  G.camera.updateMatrixWorld();
}

/** Of the flips found by their boxes, those whose two records share pixels in the frame as drawn, at either step of
 *  the move they turned round over. */
async function sharingPixels(lab: Lab, place: Place, boxed: Flip[]): Promise<Flip[]> {
  const kept: Flip[] = [];
  const path = moves();
  const judged = new Set<string>();
  for (const flip of boxed) {
    const first = meshNamed.get(flip.first);
    const second = meshNamed.get(flip.second);
    // (each pair once a place: at the first move it turned round over)
    const pair = `${flip.first} / ${flip.second}`;
    if (!first || !second || judged.has(pair)) continue;
    judged.add(pair);
    let shared = 0;
    for (const at of flip.stands) {
      await standAt(lab, place);
      await moveTo(lab, place, path[at], SETTLE);
      shared = Math.max(shared, await pixelsShared(lab, first, second));
    }
    if (shared >= LEAST_SHARED) kept.push(flip);
  }
  return kept;
}

/** The room's plinths' record and its shafts': by their materials where the game says the columns' turns, else (an
 *  older commit) by their triangles, the plinths the lower of the two records of 96 (the capitals the other). */
function plinthsAndShafts(meshes: THREE.Mesh[]): [THREE.Mesh | undefined, THREE.Mesh | undefined] {
  const turns = columnSetsNow()[0];
  if (turns) return [0, 1].map((at) => meshes.find((mesh) => mesh.material === turns[at])) as [THREE.Mesh, THREE.Mesh];
  const triangles = (mesh: THREE.Mesh): number => (mesh.geometry.index?.count ?? 0) / 3;
  const middleY = (mesh: THREE.Mesh): number => worldSphere(mesh).y;
  const blocks = meshes.filter((mesh) => triangles(mesh) === 96).sort((a, b) => middleY(a) - middleY(b));
  return [blocks[0], meshes.find((mesh) => triangles(mesh) === 576)];
}

/** The pixels the room's shafts and its plinths share where they first blend down the hall's aisle, the far plinths
 *  seen through the ghost of a near shaft (at the play report's stand main's near plane cut the column away, #948): it
 *  throws where none is found, as the pixel test that keeps a flip would keep none. */
async function pixelTestInAisle(lab: Lab): Promise<{ shared: number; where: string }> {
  const aisle = places().filter((place) => place.view === 'third' && place.name.startsWith('aisle'));
  for (const place of aisle) {
    await standAt(lab, place);
    for (const move of moves()) {
      await moveTo(lab, place, move, STEP_SETTLE);
      const columns = blendedNow().filter((record) => record.thinned && record.name.includes('a room column'));
      const [plinths, shafts] = plinthsAndShafts(columns.map((record) => meshNamed.get(record.name)!));
      if (!shafts || !plinths) continue;
      const shared = await pixelsShared(lab, shafts, plinths);
      if (shared > 0) {
        return { shared, where: `${place.name}, zoom ${move.zoom}, turned ${move.turn}, down ${move.drop}` };
      }
    }
  }
  throw new Error('the pixel test found no pixel the room’s shafts and plinths share anywhere down the aisle');
}

/** The room's shafts given their own sphere again, as merged (the canary): their padding's six vertices taken off a
 *  copy. Returns how to put them back. */
function shaftsApart(): () => void {
  const undo: (() => void)[] = [];
  G.scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material) || !inHallColumn(mesh.material)) return;
    if ((mesh.geometry.index?.count ?? 0) / 3 < 500) return;
    const kept = mesh.geometry;
    const copy = kept.clone();
    const count = copy.attributes.position.count - 6;
    for (const name of Object.keys(copy.attributes)) {
      const attribute = copy.attributes[name] as THREE.BufferAttribute;
      const size = attribute.itemSize;
      copy.setAttribute(name, new THREE.BufferAttribute(attribute.array.slice(0, count * size), size));
    }
    copy.setIndex(new THREE.BufferAttribute((copy.index!.array as Uint32Array).slice(0, copy.index!.count - 6), 1));
    mesh.geometry = copy;
    undo.push(() => { mesh.geometry = kept; });
  });
  return () => { for (const back of undo) back(); };
}

/** Each place's first flip pictured at the two steps it turned round between, as the player sees them. */
async function picture(lab: Lab, reads: PlaceRead[]): Promise<Pictured[]> {
  const moments: Pictured[] = [];
  const path = moves();
  for (const read of reads.slice(0, PICTURES)) {
    const flip = read.flips[0];
    for (const at of flip.stands) {
      await standAt(lab, read.place);
      await moveTo(lab, read.place, path[at], SETTLE);
      const move = path[at];
      const label = `blended order at ${read.place.name}, zoom ${move.zoom}, turned ${move.turn}, down ${move.drop}`;
      moments.push(await lab.screen(label, [`${flip.first} / ${flip.second}`]));
    }
  }
  return moments;
}

/** What blends is drawn in one order as the camera moves a little, wherever two records of it overlap. */
export async function blendedOrderSteady(lab: Lab, canary: boolean): Promise<LightsChecked> {
  holdHour(HOUR);
  const kept = viewMode();
  const putBack = canary ? shaftsApart() : () => {};
  try {
    const shared = await pixelTestInAisle(lab);
    const reads: PlaceRead[] = [];
    for (const place of places()) reads.push(await readPlace(lab, place));
    const flipped = reads.filter((read) => read.flips.length > 0);
    const pairs = new Map<string, { flip: Flip; places: string[] }>();
    for (const read of flipped) {
      for (const flip of read.flips) {
        const key = [flip.first, flip.second].sort().join(' / ');
        const pair = pairs.get(key) ?? { flip, places: [] };
        if (!pair.places.includes(read.place.name)) pair.places.push(read.place.name);
        pairs.set(key, pair);
      }
    }
    const records = new Set(reads.flatMap((read) => [...read.records]));
    const thinned = new Set(reads.flatMap((read) => [...read.thinned]));
    const line = `what blends, at ${reads.length} places each moved through ${moves().length} small steps (`
      + `${records.size} records sorted, ${thinned.size} of them thinned): ${pairs.size} pairs of records turned `
      + `their order round while overlapping, at ${flipped.length} places`;
    // (the state it reads must have happened: the room's columns thinned over the shoulder, as the report's were)
    const columnsThinned = [...thinned].some((name) => name.includes('a room column'));
    if (!columnsThinned) throw new Error('the room columns were never thinned: nothing like the report was read');
    const named = [...pairs.entries()].slice(0, NAMED)
      .map(([key, pair]) => `  ${key}: at ${pair.places.slice(0, 3).join('; ')}`);
    const outOfTurn = reads.filter((read) => read.outOfTurn > 0);
    const turnsLine = `the hall's columns' parts out of their turns (a plinth over its shaft's foot) at `
      + `${outOfTurn.length} places${outOfTurn.length ? `: ${outOfTurn.slice(0, 3).map((read) => read.place.name)
        .join('; ')}` : ''}`;
    const testLine = `the pixel test: ${shared.shared} pixels shared by the room's shafts and its plinths `
      + `(${shared.where})`;
    const lines = [line, ...named, turnsLine, testLine];
    const problems = [...(pairs.size ? [line] : []), ...(outOfTurn.length ? [turnsLine] : [])];
    if (canary) return { lines, problems: [], caught: problems.length > 0, moments: [] };
    const moments = await picture(lab, flipped);
    return { lines, problems, caught: null, moments };
  } finally {
    putBack();
    holdHour(null);
    await viewBy(lab, kept);
  }
}
