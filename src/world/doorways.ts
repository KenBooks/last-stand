// What a doorway hides, for every building walked into whose walls and roof stand whole round it: each declares its
// doorway as data (`Doorway`, the hall of heroes' in `hallPortal.ts`), and one cull runs through all of them. With the
// camera inside one, what stands outside is drawn only where the doorway shows it: each of the village's parts lying
// wholly outside the building (a part holding a light or an unculled or instanced mesh gone into part by part), each
// foe (the yard's dummies), the meadow's tiles as they're listed (`hiddenByDoorway`) and the trees' cells
// (`hideCellsWhere`), each tested against the cone from the eye through the doorway; left out of the frame's draw,
// drawn into the shadow maps as ever (shown again round their draw), so a shadow seen through the doorway stays. From
// outside it's the other way round: with the camera before the doorway, the walls whole and nothing that blends
// thinning, what lies wholly inside (the village's parts, and what stands on the floor of the scene's own: the heroes
// on the hall's dais) is drawn only where it meets the cone from the camera through the doorway, opening inside.
//
// Before it was data, the hall's cull was code of its own (looking out of the hall at the square, 555 draws to 427;
// facing the hall from the square, its room and heroes 128 of 429 draws whatever the doorway showed of them): a new
// building walked into declares its doorway (`addDoorway`) and is culled with no code of its own, held to the frame
// drawn whole from every stand by `lab village --only sweepWithinBudgets` (`registerCull` below).
import * as THREE from 'three';
import { blendedSolid } from '../core/seeThrough';
import { aroundShadows, hideCellsWhere, isDrawingStill } from './culling';
import { registerCull } from './culls';
import { G } from '../state';

/**
 * A doorway into a building whose walls and roof hide what's beyond them but for what it shows. Its opening stands
 * upright, `half` either way of `sill` along the wall and `high` up from it, the wall's outer face through `sill`;
 * `out` points out of the building, level (a unit vector).
 */
export interface Doorway {
  /** its name, for the lab */
  name: string;
  /** the middle of the opening's foot, in the wall's outer face (m) */
  sill: THREE.Vector3;
  /** the way out through it, level and of unit length */
  out: THREE.Vector3;
  /** how far either side of its middle the opening reaches, and how high (m) */
  half: number;
  high: number;
  /** the wall's thickness at the doorway (m): an eye in the opening, through the wall, counts as inside */
  depth: number;
  /** the building whole, its walls and roof with it: a part meeting it is never culled from inside (what's merged
   *  spans the village) */
  box: THREE.Box3;
  /** between its walls' inner faces, as an eye inside it is told (its height not read) */
  room: THREE.Box3;
  /** what lies wholly in this is seen from outside through the doorway alone */
  inside: THREE.Box3;
  /** whether its walls and roof are drawn whole now (cut away over the hero, or thinned to a ghost, what's beyond them
   *  shows, and nothing may be culled by the doorway) */
  whole(): boolean;
  /** what its walls and roof stand as now, said for the lab where they aren't whole */
  wallsSaid?(): string;
  /** its other openings, each seen through as the doorway is (the hall's windows: from play, "make hall windows
   *  semi transparent, so they actually show what's outside behind them") */
  windows?: readonly Opening[];
}

/** An opening in a building's wall other than its doorway: the middle of its foot in the wall's outer face, the way
 *  out through it (level, of unit length), how far either side of its middle it reaches and how high (m). */
export interface Opening { sill: THREE.Vector3; out: THREE.Vector3; half: number; high: number }

/** how far past the doorway's own edges the cone reaches (m): the camera's matrices stand as the frame's, and a
 *  part's bounds are its box's sphere, so this is only for what moves in it (a dummy struck, the fountain's foam) */
const DOOR_MARGIN = 0.3;
/** a foe's sphere round its feet: how high its middle is, and its radius (m) */
const FOE_ROUND = { up: 1, radius: 1.5 };
/** how far from the door's face the eye must be for the cone through it to be taken (m): on its face, the cone's
 *  sides are planes through the eye and the doorway's own edges, and say nothing */
const DOORWAY_SPARE = 0.05;
/** how deep the village's groups are gone into for what lies wholly inside a building */
const INSIDE_DEPTH = 2;

/** How the cull runs: by the doorways, not at all, or leaving out all it may whether a doorway shows it or not (the
 *  lab's: `lab village` reads a frame with it and without, and plants the last as its canary). */
export type DoorCull = 'door' | 'off' | 'all';
let mode: DoorCull = 'door';
/** The cull run as `how` says from now on (the lab). */
export function setDoorCull(how: DoorCull): void {
  mode = how;
}
registerCull('what doorways hide', (off) => setDoorCull(off ? 'off' : 'door'));

/** How a part is culled: by its sphere, not at all (meeting the building's box, empty, or kept always), or part by
 *  part under it (it holds what's kept always beside what isn't: a brazier's light, a cottage's lit lamp). */
type Culled = THREE.Sphere | 'never' | 'children';

/** A doorway as the cull keeps it: how each part outside is culled, and what lies inside, found as first needed
 *  (what the village builds stands still). */
interface Kept {
  door: Doorway;
  culled: WeakMap<THREE.Object3D, Culled>;
  inside: { part: THREE.Object3D; round: THREE.Sphere }[] | null;
}
const doorways: Kept[] = [];

/** `door` culled from now on, as the frame is drawn from inside its building or before it. */
export function addDoorway(door: Doorway): void {
  doorways.push({ door, culled: new WeakMap(), inside: null });
}

/** a cone's four sides through an opening's edges, each facing in */
type Cone = THREE.Plane[];
/** the cones through each opening this frame is drawn by (the doorway's, and a window's where it has them), as many
 *  set as `conesSet` says */
const cones: Cone[] = [];
let conesSet = 0;
/** the parts left out of this frame's draw */
const hidden: THREE.Object3D[] = [];
/** the doorway this frame is drawn looking out through (its cone set), if one */
let lookingOutOf: Kept | null = null;

const _box = new THREE.Box3(), _eye = new THREE.Vector3(), _middle = new THREE.Vector3(), _across = new THREE.Vector3();
const _corners = Array.from({ length: 4 }, () => new THREE.Vector3());
const _foe = new THREE.Sphere();
const _fromSill = new THREE.Vector3();

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

/** How `part` is culled from inside `kept`'s building, made as it's first read. */
function cullOf(kept: Kept, part: THREE.Object3D): Culled {
  let how = kept.culled.get(part);
  if (how !== undefined) return how;
  how = 'never';
  if (keptAlways(part)) how = 'never';
  else if (holdsKept(part)) how = 'children';
  else {
    _box.setFromObject(part, true);
    if (!_box.isEmpty() && !_box.intersectsBox(kept.door.box)) how = _box.getBoundingSphere(new THREE.Sphere());
  }
  kept.culled.set(part, how);
  return how;
}

/** Where `eye` stands from `door`'s sill: along the wall (its `x`), up (its `y`) and out through the doorway (its
 *  `z`, negative inside). */
function fromSill(door: Opening, eye: THREE.Vector3): THREE.Vector3 {
  const offset = _fromSill.copy(eye).sub(door.sill);
  const along = offset.x * -door.out.z + offset.z * door.out.x;
  const out = offset.x * door.out.x + offset.z * door.out.z;
  return offset.set(along, offset.y, out);
}

/** Whether the eye stands in the doorway's opening, through the wall's thickness: walked in, the camera trails him
 *  4.5 m and stood there for his first steps, and with nothing culled the grass, the trees and the village behind the
 *  hall's walls were drawn and lit unseen (the meadow 35 ms of the 4080's 63 at 20.7 Mpx, from a perf report "village
 *  needs to be 144 fps"). From there too the village is seen through the door alone. */
function inDoorway(door: Doorway, eye: THREE.Vector3): boolean {
  const at = fromSill(door, eye);
  return Math.abs(at.x) < door.half && at.y < door.high && at.z >= -door.depth && at.z < -DOORWAY_SPARE;
}

/** Whether `eye` stands inside `door`'s walls, under its roof. */
function eyeInside(door: Doorway, eye: THREE.Vector3): boolean {
  const room = door.room;
  const inRoom = eye.x > room.min.x && eye.x < room.max.x && eye.z > room.min.z && eye.z < room.max.z;
  return inRoom || inDoorway(door, eye);
}

/** The next cone's sides set from `eye` through `door`'s edges, each facing the opening's middle (`inward`: the eye
 *  outside, the cone opening into the building). */
function coneFrom(door: Opening, eye: THREE.Vector3, inward = false): void {
  if (conesSet === cones.length) cones.push(Array.from({ length: 4 }, () => new THREE.Plane()));
  const sides = cones[conesSet++];
  const across = _across.set(-door.out.z, 0, door.out.x).multiplyScalar(door.half + DOOR_MARGIN);
  const low = door.sill.y - DOOR_MARGIN, top = door.sill.y + door.high + DOOR_MARGIN;
  // (round the doorway: bottom one side, top that side, top the other, bottom the other)
  _corners[0].copy(door.sill).sub(across).setY(low);
  _corners[1].copy(door.sill).sub(across).setY(top);
  _corners[2].copy(door.sill).add(across).setY(top);
  _corners[3].copy(door.sill).add(across).setY(low);
  _middle.copy(door.sill).addScaledVector(door.out, inward ? -1 : 1).setY(door.sill.y + door.high / 2);
  for (let k = 0; k < 4; k++) {
    const side = sides[k].setFromCoplanarPoints(eye, _corners[k], _corners[(k + 1) % 4]);
    if (side.distanceToPoint(_middle) < 0) side.negate();
  }
}

/** Whether `sphere` meets one of the cones through the building's openings. */
function seenThroughDoor(sphere: THREE.Sphere): boolean {
  if (mode === 'all') return false;
  for (let k = 0; k < conesSet; k++) {
    if (cones[k].every((side) => side.distanceToPoint(sphere.center) >= -sphere.radius)) return true;
  }
  return false;
}

/** The cones set from `eye` through `door`'s doorway and each window it sees out through (inside) or in through
 *  (outside, before it: `inward`). */
function conesFrom(door: Doorway, eye: THREE.Vector3, inward: boolean): void {
  conesSet = 0;
  coneFrom(door, eye, inward);
  for (const window of door.windows ?? []) {
    const out = fromSill(window, eye).z;
    if (inward ? out > DOORWAY_SPARE : out < -DOORWAY_SPARE) coneFrom(window, eye, inward);
  }
}

const _boxCorner = new THREE.Vector3();

/** Whether `box` meets one of the cones through the building's openings, each side tested by the box's corner
 *  furthest along it: a flat tile's sphere, some 6 m across, met a window's cone where the tile lay below it. */
function boxThroughDoor(box: THREE.Box3): boolean {
  if (mode === 'all') return false;
  for (let k = 0; k < conesSet; k++) {
    const inside = cones[k].every((side) => {
      _boxCorner.set(
        side.normal.x > 0 ? box.max.x : box.min.x,
        side.normal.y > 0 ? box.max.y : box.min.y,
        side.normal.z > 0 ? box.max.z : box.min.z,
      );
      return side.distanceToPoint(_boxCorner) >= 0;
    });
    if (inside) return true;
  }
  return false;
}

/** Whether the grass `box` bounds is out of this frame's sight, the doorway it's drawn looking out through showing
 *  none of it (the meadow's tiles, culled as each is listed: `meadow.ts`). A tile meeting the building's box is culled
 *  as any other: no grass grows in it, so what of it the doorway doesn't show is behind the walls (kept as the merged
 *  parts are, the tiles along the hall's walls were a fifth of the grass of a frame looking in from its doorway, all
 *  of it unseen). */
export function hiddenByDoorway(box: THREE.Box3): boolean {
  return lookingOutOf !== null && !boxThroughDoor(box);
}

/** Whether a cell of an instanced mesh outside the building (`sphere`, in the world) is out of this frame's sight,
 *  the doorway showing none of it (`culling.ts`'s cells: the trees round the village, instanced, were never culled by
 *  the hall's doorway, and their leaves cut out behind its walls were 3.8 ms of the 4080's scene pass at 20.7 Mpx). */
function cellHiddenByDoor(sphere: THREE.Sphere): boolean {
  return lookingOutOf !== null && !lookingOutOf.door.box.intersectsSphere(sphere) && !seenThroughDoor(sphere);
}

/** Whether the frame drawn by `camera` can be culled by a doorway at all: the game's camera, the village shown,
 *  the still shadows not being drawn, and the cull on. */
function cullable(camera: THREE.Camera, village: THREE.Object3D): boolean {
  return mode !== 'off' && camera === G.camera && village.visible && !isDrawingStill();
}

/** Why the frame `camera` draws now is or isn't culled by a doorway, each of the conditions it takes in turn (the lab
 *  says it where it read no draw culled: `lab village --only hallCulledByDoor`). */
export function doorwayReport(camera: THREE.Camera, village: THREE.Object3D): string {
  const eye = camera.getWorldPosition(new THREE.Vector3());
  const said = [`mode ${mode}`, `the game's camera ${camera === G.camera}`, `the village shown ${village.visible}`,
    `still shadows being drawn ${isDrawingStill()}`];
  for (const { door } of doorways) {
    const walls = door.wallsSaid ? ` (${door.wallsSaid()})` : '';
    said.push(`${door.name}: walls whole ${door.whole()}${walls}, the eye inside ${eyeInside(door, eye)}`);
  }
  return said.join(', ');
}

/** Whether the eye at `eye` looks out of `door`'s building through its doorway alone: inside it, its walls whole. */
const lookingOut = (door: Doorway, eye: THREE.Vector3): boolean => door.whole() && eyeInside(door, eye);

/** Whether the eye at `eye` looks into `door`'s building through its doorway alone: before it, its walls whole and
 *  nothing that blends thinning (a wall thinned, a hole round him, shows what's past it). */
function lookingIn(door: Doorway, eye: THREE.Vector3): boolean {
  if (!door.whole() || !blendedSolid()) return false;
  return fromSill(door, eye).z > DOORWAY_SPARE && !eyeInside(door, eye);
}

/** The village's parts wholly inside `door`'s building, down to its groups' groups, each with its sphere (a part
 *  holding a light never, as hidden the frame's lights would change). */
function insideOf(door: Doorway, village: THREE.Object3D): { part: THREE.Object3D; round: THREE.Sphere }[] {
  const found: { part: THREE.Object3D; round: THREE.Sphere }[] = [];
  const visit = (group: THREE.Object3D, deep: number): void => {
    for (const part of group.children) {
      if (keptAlways(part)) continue;
      _box.setFromObject(part, true);
      if (_box.isEmpty()) continue;
      if (door.inside.containsBox(_box) && !holdsKept(part)) {
        found.push({ part, round: _box.getBoundingSphere(new THREE.Sphere()) });
      } else if (deep < INSIDE_DEPTH && !(part as THREE.Mesh).isMesh && _box.intersectsBox(door.inside)) {
        visit(part, deep + 1);
      }
    }
  };
  visit(village, 0);
  return found;
}

/** `part` left out of this frame's draw. */
function hide(part: THREE.Object3D): void {
  part.visible = false;
  hidden.push(part);
}

/** Leaves out of the frame's draw what stands inside `kept`'s building and isn't seen through its doorway: the
 *  village's parts there, and what stands on its floor of the scene's own (a sphere round each one's feet). */
function hideInside(kept: Kept, scene: THREE.Scene, village: THREE.Object3D): void {
  kept.inside ??= insideOf(kept.door, village);
  for (const { part, round } of kept.inside) {
    if (part.visible && !seenThroughDoor(round)) hide(part);
  }
  for (const part of scene.children) {
    if (!part.visible || part === village || keptAlways(part)) continue;
    const at = part.position;
    if (!kept.door.inside.containsPoint(at)) continue;
    _foe.center.copy(at).y += FOE_ROUND.up;
    _foe.radius = FOE_ROUND.radius;
    if (!seenThroughDoor(_foe)) hide(part);
  }
}

/** `parts` left out of the frame's draw where they stand outside `kept`'s building and aren't seen through its
 *  doorway. */
function hideParts(kept: Kept, parts: readonly THREE.Object3D[]): void {
  for (const part of parts) {
    if (!part.visible) continue;
    const how = cullOf(kept, part);
    if (how === 'children') hideParts(kept, part.children);
    if (how === 'never' || how === 'children' || seenThroughDoor(how)) continue;
    hide(part);
  }
}

/** Leaves out of the frame's draw what stands outside `kept`'s building and isn't seen through its doorway. */
function hideOutside(kept: Kept, village: THREE.Object3D): void {
  hideParts(kept, village.children);
  for (const foe of G.enemies) {
    if (!foe.obj.visible) continue;
    _foe.center.copy(foe.obj.position).y += FOE_ROUND.up;
    _foe.radius = FOE_ROUND.radius;
    if (!seenThroughDoor(_foe)) hide(foe.obj);
  }
}

/** What was left out shown again (`on`), or hidden again. */
function showHidden(on: boolean): void {
  for (const part of hidden) part.visible = on;
}

/** The frame about to be drawn by `camera` culled by the first doorway it looks out of, else by the first it looks
 *  into. */
function cullFrame(camera: THREE.Camera, scene: THREE.Scene, village: THREE.Object3D): void {
  if (!cullable(camera, village)) return;
  const eye = camera.getWorldPosition(_eye);
  const out = doorways.find((kept) => lookingOut(kept.door, eye));
  if (out) {
    conesFrom(out.door, eye, false);
    lookingOutOf = out;
    hideOutside(out, village);
    return;
  }
  const into = doorways.find((kept) => lookingIn(kept.door, eye));
  if (!into) return;
  // (the cone isn't set for the cells and the meadow: they're outside, before the building)
  conesFrom(into.door, eye, true);
  hideInside(into, scene, village);
}

/** the scene and the village the doorways cull (`cullByDoorways`) */
let culled: { scene: THREE.Scene; village: THREE.Object3D } | null = null;

/**
 * The frame the Rust engine is about to draw by `camera` culled by the doorways, and what to call once it's drawn
 * (what was left out shown again). The engine runs none of what the game hangs on three's render of the scene
 * (`engine/index.ts`), and without this the heroes on the hall's dais and its room, behind its walls, were 133 of
 * a frame's 558 records from the square, and the whole village was written looking out of the hall. What's left
 * out casts no shadow in the engine's frame: its one walk makes the frame's list and the sun's.
 */
export function cullForEngine(camera: THREE.Camera): () => void {
  if (culled) cullFrame(camera, culled.scene, culled.village);
  return () => {
    showHidden(true);
    hidden.length = 0;
    lookingOutOf = null;
    conesSet = 0;
  };
}

/** Culls `village`'s parts, the foes and what stands in a building of the scene's own by every doorway added
 *  (`addDoorway`) as `scene` is drawn. */
export function cullByDoorways(scene: THREE.Scene, village: THREE.Object3D): void {
  hideCellsWhere(cellHiddenByDoor);
  culled = { scene, village };
  const before = scene.onBeforeRender;
  scene.onBeforeRender = (...args) => {
    // (the cone set before the cells are culled, `cullWhileDrawn`'s, which runs in `before`)
    cullFrame(args[2], scene, village);
    before.apply(scene, args);
  };
  const after = scene.onAfterRender;
  scene.onAfterRender = (...args) => {
    after.apply(scene, args);
    showHidden(true);
    hidden.length = 0;
    lookingOutOf = null;
    conesSet = 0;
  };
  // (their shadows drawn as ever: the shadow maps are drawn after the frame's list is made)
  aroundShadows(() => {
    showHidden(true);
    return () => showHidden(false);
  });
}
