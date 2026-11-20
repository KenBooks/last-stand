// What stands outside the hall of heroes, culled by its doorway while the camera is inside it. Its walls and roof hide
// the village from within but for what the doorway shows, and three culls by the camera's view alone: looking out of
// the hall at the square, the fountain, the yard's dummies and the village's objects were drawn behind its walls,
// 555 draws and the render 11.9 ms of a frame's CPU (from play, a perf report "looking at plaza from hall"). Each
// part the village's group holds that lies wholly outside the hall, and each foe (the yard's dummies), is left out of
// the frame's draw unless its bounds meet the cone from the camera through the doorway; the shadow maps still draw
// it (shown again round their draw), so its shadow seen through the doorway stays. The meadow's tiles are culled by
// it as they're listed (`hiddenByHallDoor`).
//
// From outside it's the other way round: with the camera before the hall's front, its walls and roof whole and
// nothing thinning, what stands wholly inside its walls (its room's loose parts and what's merged of them, the heroes
// on its dais) is seen through the doorway alone (its windows are too high, their panes show nothing), and is left
// out of the frame unless it meets the cone from the camera through the doorway: facing the hall from the square, the
// room and the heroes were 128 of the frame's 429 draws, all drawn whatever the doorway showed of them.
import * as THREE from 'three';
import { blendedSolid, fadedWhole } from '../core/seeThrough';
import { HALL, TERRACE } from '../data/village';
import { aroundShadows, hideCellsWhere, isDrawingStill } from './culling';
import { G } from '../state';

/** how far past the doorway's own edges the cone reaches (m): the camera's matrices stand as the frame's, and a
 *  part's bounds are its box's sphere, so this is only for what moves in it (a dummy struck, the fountain's foam) */
const DOOR_MARGIN = 0.3;
/** a foe's sphere round its feet: how high its middle is, and its radius (m) */
const FOE_ROUND = { up: 1, radius: 1.5 };

/** the hall's box, walls and roof with it: a part meeting it is never culled (what's merged spans the village) */
const hallBox = new THREE.Box3(
  new THREE.Vector3(TERRACE.x - HALL.half, -1, HALL.wall - 1),
  new THREE.Vector3(TERRACE.x + HALL.half, 12, HALL.door + 0.5),
);
/** the hall's inside, between its walls' inner faces from its floor up: what lies wholly in it is seen from outside
 *  through the doorway alone */
const insideBox = new THREE.Box3(
  new THREE.Vector3(TERRACE.x - HALL.inHalf - 0.05, TERRACE.high - 0.3, HALL.wall - 0.05),
  new THREE.Vector3(TERRACE.x + HALL.inHalf + 0.05, 12, HALL.inFront + 0.05),
);
/** the cone's four sides through the doorway's edges, each facing in */
const sides = Array.from({ length: 4 }, () => new THREE.Plane());
/** the parts left out of this frame's draw */
const hidden: THREE.Object3D[] = [];
/** whether this frame is drawn looking out through the doorway (its cone set) */
let coneSet = false;

/** How the cull runs: by the doorway, not at all, or leaving out all it may whether the doorway shows it or not (the
 *  lab's: `lab village` reads a frame with it and without, and plants the last as its canary). */
export type HallCull = 'door' | 'off' | 'all';
let mode: HallCull = 'door';
/** The cull run as `how` says from now on (the lab). */
export function setHallCull(how: HallCull): void {
  mode = how;
}

const _box = new THREE.Box3(), _eye = new THREE.Vector3(), _middle = new THREE.Vector3();
const _corners = Array.from({ length: 4 }, () => new THREE.Vector3());
const _foe = new THREE.Sphere();

/** Whether `object` itself must always be drawn: a light (hidden, the frame's lights would change and every lit
 *  program with them), or a mesh whose bounds aren't where it draws (instanced, or unculled: the meadow's tiles). */
function keptAlways(object: THREE.Object3D): boolean {
  const mesh = object as THREE.Mesh;
  if ((object as THREE.Light).isLight || (object as THREE.InstancedMesh).isInstancedMesh) return true;
  return mesh.isMesh === true && !mesh.frustumCulled;
}

/** Whether anything under `part`, itself with it, must always be drawn. */
function holdsKept(part: THREE.Object3D): boolean {
  let kept = false;
  part.traverse((object) => {
    if (keptAlways(object)) kept = true;
  });
  return kept;
}

/** How `part` is culled: by its sphere, not at all (meeting the hall's box, empty, or kept always), or part by part
 *  under it (it holds what's kept always beside what isn't: a brazier's light, a cottage's lit lamp). */
type Culled = THREE.Sphere | 'never' | 'children';
const culled = new WeakMap<THREE.Object3D, Culled>();

/** How `part` is culled, made as it's first read (what the village builds stands still). */
function cullOf(part: THREE.Object3D): Culled {
  let how = culled.get(part);
  if (how !== undefined) return how;
  how = 'never';
  if (keptAlways(part)) how = 'never';
  else if (holdsKept(part)) how = 'children';
  else {
    _box.setFromObject(part, true);
    if (!_box.isEmpty() && !_box.intersectsBox(hallBox)) how = _box.getBoundingSphere(new THREE.Sphere());
  }
  culled.set(part, how);
  return how;
}

/** Whether the eye at `eye` stands inside the hall's walls, under its roof. */
const eyeInside = (eye: THREE.Vector3): boolean =>
  (Math.abs(eye.x - TERRACE.x) < HALL.inHalf && eye.z > HALL.wall && eye.z < HALL.inFront) || inDoorway(eye);

/** how far inside the door's face the eye must be for the cone through it to be taken (m): on its face, the cone's
 *  sides are planes through the eye and the doorway's own edges, and say nothing */
const DOORWAY_SPARE = 0.05;
/** Whether the eye stands in the doorway's opening, through the front wall's thickness: walked in, the camera trails
 *  him 4.5 m and stood there for his first steps, and with nothing culled the grass, the trees and the village behind
 *  the hall's walls were drawn and lit unseen (the meadow 35 ms of the 4080's 63 at 20.7 Mpx, from a perf report
 *  "village needs to be 144 fps"). From there too the village is seen through the door alone. */
const inDoorway = (eye: THREE.Vector3): boolean =>
  Math.abs(eye.x - TERRACE.x) < HALL.doorHalf && eye.y < TERRACE.high + HALL.doorHigh
  && eye.z >= HALL.inFront && eye.z < HALL.door - DOORWAY_SPARE;

/** The cone's sides set from `eye` through the doorway's edges, each facing the doorway's middle (`inward`: the
 *  eye outside, the cone opening into the hall). */
function coneFrom(eye: THREE.Vector3, inward = false): void {
  const x0 = TERRACE.x - HALL.doorHalf - DOOR_MARGIN, x1 = TERRACE.x + HALL.doorHalf + DOOR_MARGIN;
  const y0 = TERRACE.high - DOOR_MARGIN, y1 = TERRACE.high + HALL.doorHigh + DOOR_MARGIN;
  // (round the doorway: bottom left, top left, top right, bottom right)
  _corners[0].set(x0, y0, HALL.door);
  _corners[1].set(x0, y1, HALL.door);
  _corners[2].set(x1, y1, HALL.door);
  _corners[3].set(x1, y0, HALL.door);
  _middle.set(TERRACE.x, TERRACE.high + HALL.doorHigh / 2, HALL.door + (inward ? -1 : 1));
  for (let k = 0; k < 4; k++) {
    const side = sides[k].setFromCoplanarPoints(eye, _corners[k], _corners[(k + 1) % 4]);
    if (side.distanceToPoint(_middle) < 0) side.negate();
  }
}

/** Whether `sphere` meets the cone through the doorway. */
const seenThroughDoor = (sphere: THREE.Sphere): boolean =>
  mode !== 'all' && sides.every((side) => side.distanceToPoint(sphere.center) >= -sphere.radius);

const _boxRound = new THREE.Sphere();
/** Whether the grass `box` bounds is out of this frame's sight, its doorway showing none of it (the meadow's tiles,
 *  culled as each is listed: `meadow.ts`). A tile meeting the hall's box is culled as any other: no grass grows in
 *  the hall, so what of it the doorway doesn't show is behind the walls (kept as the merged parts are, the tiles
 *  along its walls were a fifth of the grass of a frame looking in from the doorway, all of it unseen). */
export function hiddenByHallDoor(box: THREE.Box3): boolean {
  return coneSet && !seenThroughDoor(box.getBoundingSphere(_boxRound));
}

/** Whether a cell of an instanced mesh outside the hall (`sphere`, in the world) is out of this frame's sight, its
 *  doorway showing none of it (`culling.ts`'s cells: the trees round the village, instanced, were never culled by the
 *  doorway, and their leaves cut out behind the hall's walls were 3.8 ms of the 4080's scene pass at 20.7 Mpx). */
function cellHiddenByDoor(sphere: THREE.Sphere): boolean {
  return coneSet && !hallBox.intersectsSphere(sphere) && !seenThroughDoor(sphere);
}

/** Whether the frame drawn by `camera` looks out of the hall through its doorway alone: the game's camera inside it,
 *  its roof and front wall drawn (from above, or over the shoulder from before the wall, they're cut away). */
function lookingOut(camera: THREE.Camera, village: THREE.Object3D, cutaway: readonly THREE.Object3D[]): boolean {
  if (mode === 'off' || camera !== G.camera || !village.visible || isDrawingStill()) return false;
  // (cut away, thinned to a ghost: what's beyond it shows)
  if (!cutaway.every((part) => part.visible) || fadedWhole('hallFront') || fadedWhole('hallRoof')) return false;
  return eyeInside(camera.getWorldPosition(_eye));
}

/** Whether the frame drawn by `camera` looks into the hall through its doorway alone: the game's camera before its
 *  front, its walls and roof drawn whole and nothing that blends thinning (a wall thinned, a hole round him, shows
 *  what's past it). */
function lookingIn(camera: THREE.Camera, village: THREE.Object3D, cutaway: readonly THREE.Object3D[]): boolean {
  if (mode === 'off' || camera !== G.camera || !village.visible || isDrawingStill()) return false;
  if (!cutaway.every((part) => part.visible) || !blendedSolid()) return false;
  const eye = camera.getWorldPosition(_eye);
  return eye.z > HALL.door + DOORWAY_SPARE && !eyeInside(eye);
}

/** What lies wholly inside the hall's walls, each with its sphere: the village's parts (a part holding a light never,
 *  as hidden the frame's lights would change), found as first needed (what the village builds stands still). */
let inside: { part: THREE.Object3D; round: THREE.Sphere }[] | null = null;

/** The village's parts wholly inside the hall's walls, down to its groups' groups. */
function insideOf(village: THREE.Object3D): { part: THREE.Object3D; round: THREE.Sphere }[] {
  const found: { part: THREE.Object3D; round: THREE.Sphere }[] = [];
  const visit = (group: THREE.Object3D, deep: number): void => {
    for (const part of group.children) {
      if (keptAlways(part)) continue;
      _box.setFromObject(part, true);
      if (_box.isEmpty()) continue;
      if (insideBox.containsBox(_box) && !holdsKept(part)) {
        found.push({ part, round: _box.getBoundingSphere(new THREE.Sphere()) });
      } else if (deep < 2 && !(part as THREE.Mesh).isMesh && _box.intersectsBox(insideBox)) visit(part, deep + 1);
    }
  };
  visit(village, 0);
  return found;
}

/** Leaves out of the frame's draw what stands inside the hall and isn't seen through its doorway: the village's parts
 *  there, and what stands on its floor of the scene's own (the heroes on its dais, a sphere round each one's feet). */
function hideInside(scene: THREE.Scene, village: THREE.Object3D): void {
  inside ??= insideOf(village);
  for (const { part, round } of inside) {
    if (!part.visible || seenThroughDoor(round)) continue;
    part.visible = false;
    hidden.push(part);
  }
  for (const part of scene.children) {
    if (!part.visible || part === village || keptAlways(part)) continue;
    const at = part.position;
    if (!insideBox.containsPoint(at)) continue;
    _foe.center.copy(at).y += FOE_ROUND.up;
    _foe.radius = FOE_ROUND.radius;
    if (seenThroughDoor(_foe)) continue;
    part.visible = false;
    hidden.push(part);
  }
}

/** `parts` left out of the frame's draw where they stand outside the hall and aren't seen through its doorway. */
function hideParts(parts: readonly THREE.Object3D[]): void {
  for (const part of parts) {
    if (!part.visible) continue;
    const how = cullOf(part);
    if (how === 'children') hideParts(part.children);
    if (how === 'never' || how === 'children' || seenThroughDoor(how)) continue;
    part.visible = false;
    hidden.push(part);
  }
}

/** Leaves out of the frame's draw what stands outside the hall and isn't seen through its doorway. */
function hideOutside(village: THREE.Object3D): void {
  hideParts(village.children);
  for (const foe of G.enemies) {
    if (!foe.obj.visible) continue;
    _foe.center.copy(foe.obj.position).y += FOE_ROUND.up;
    _foe.radius = FOE_ROUND.radius;
    if (seenThroughDoor(_foe)) continue;
    foe.obj.visible = false;
    hidden.push(foe.obj);
  }
}

/** What was left out shown again (`on`), or hidden again. */
function showHidden(on: boolean): void {
  for (const part of hidden) part.visible = on;
}

/** Culls `village`'s parts and the foes outside the hall of heroes by its doorway as `scene` is drawn from inside it
 *  (`cutaway`: its roof and front wall, cut away when the camera isn't under them). */
export function cullOutsideHall(scene: THREE.Scene, village: THREE.Object3D, cutaway: readonly THREE.Object3D[]): void {
  hideCellsWhere(cellHiddenByDoor);
  const before = scene.onBeforeRender;
  scene.onBeforeRender = (...args) => {
    // (the cone set before the cells are culled, `cullWhileDrawn`'s, which runs in `before`)
    const camera = args[2];
    if (lookingOut(camera, village, cutaway)) {
      coneFrom(_eye);
      coneSet = true;
      hideOutside(village);
    } else if (lookingIn(camera, village, cutaway)) {
      // (the cone isn't set for the cells and the meadow: they're outside, before the hall)
      coneFrom(_eye, true);
      hideInside(scene, village);
    }
    before.apply(scene, args);
  };
  const after = scene.onAfterRender;
  scene.onAfterRender = (...args) => {
    after.apply(scene, args);
    showHidden(true);
    hidden.length = 0;
    coneSet = false;
  };
  // (their shadows drawn as ever: the shadow maps are drawn after the frame's list is made)
  aroundShadows(() => {
    showHidden(true);
    return () => showHidden(false);
  });
}
