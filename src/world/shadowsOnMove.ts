// Low's village draws what moves into the kept shadow maps only on frames it has moved (from play, an S25 Edge's
// Profile at full res: the shadow maps 8 ms of an 80 ms frame). The sun's map and the lamps' are kept as drawn still
// (`moonShadow.ts`, `lampShadows.ts`), and each frame they're copied back and the heroes, the yard's dummies and the
// chest's lid drawn over them: a hero standing, little of it changes. So where no part drawn has moved or turned by a
// step (`STEP`: each mesh's matrix, a skinned one's bones) since the frame that last drew them, the maps are left as
// that draw left them, and a still draw (the sun a step on, a lamp's light handed on, the props) has the next frame's
// draw again. A body's sway at rest under a step stays out of its shadow until it moves: a step of a centimetre, and
// the ranger's bow, quiver and head took the maps drawn again on 92 to 100% of the frames he stood (`lab village
// --only shadowsOnMove`: 3 cm, 2 to 8%). A quality switch, live.
import * as THREE from 'three';
import { G } from '../state';
import { skipAfterShadows } from './culling';
import { shadowMovers } from './props';

/** how far a part drawn over the kept maps goes before they're drawn again (m) */
const STEP = 0.03;

/** whether the movers are drawn only when they move (Low) */
let onMoveOnly = false;
/** the lab's switch: as the level has it, drawn every frame as on High, or (a canary) never drawn but by a still
 *  draw */
export type ShadowsHeld = 'level' | 'every' | 'never';
let held: ShadowsHeld = 'level';
/** where what moves stood as it was last drawn, and whether the next frame's own draw must draw it whatever it reads */
let last: number[] = [];
let owed = true;
/** frames whose own draw drew the movers, and frames that let it go: the lab's count */
const counted = { drawn: 0, skipped: 0 };

/** how far along its up a part's turn is read (m): turned about 12 degrees, it moves a step. At 0.3 (6 degrees) the
 *  mage's idle (his head's glance, his free hand, the staff's bob) drew the maps again in 30% of the frames he stood */
const ARM = 0.15;

/** `matrix`'s place, and a point `ARM` along its up (its turn), onto `into`. */
function placeOf(matrix: THREE.Matrix4, into: number[]): void {
  const m = matrix.elements;
  for (let axis = 0; axis < 3; axis++) into.push(m[12 + axis], m[12 + axis] + m[4 + axis] * ARM);
}

/** Where each part drawn under `object` stands in the world, as the frame's matrices have it (a skinned part by its
 *  skeleton's bones: the rig's joints are plain objects, not three's bones), in steps, onto `into`; and how many of its
 *  parts show (gear put on or taken off, read as a place a step and more away). */
function placesOf(object: THREE.Object3D, into: number[]): void {
  let shown = 0;
  object.traverse((part) => {
    if (!part.visible) return;
    shown++;
    const skinned = part as THREE.SkinnedMesh;
    if (skinned.isSkinnedMesh) {
      for (const bone of skinned.skeleton.bones) placeOf(bone.matrixWorld, into);
    } else if ((part as THREE.Mesh).isMesh) {
      placeOf(part.matrixWorld, into);
    }
  });
  into.push(shown * STEP * 2);
}

/** Where everything drawn over the kept maps stands now. */
function moversNow(): number[] {
  const places: number[] = [];
  for (const player of G.players) placesOf(player.obj, places);
  for (const enemy of G.enemies) placesOf(enemy.obj, places);
  for (const mover of shadowMovers()) placesOf(mover, places);
  return places;
}

/** Whether every place in `a` is within a step of `b`'s (not rounded to steps: one sat on a step's edge, a jitter of
 *  a millimetre flipped it, and the maps were drawn again most frames he stood). */
const within = (a: number[], b: number[]): boolean =>
  a.length === b.length && a.every((value, i) => Math.abs(value - b[i]) < STEP);

/** Whether the frame's own draw may leave the maps as they stand: nothing moved since it last drew them. */
function leavesThem(camera: THREE.Camera, still: boolean): boolean {
  if (still) {
    owed = true;
    return false;
  }
  if (camera !== G.camera || !onMoveOnly || G.arena.place !== 'village') return false;
  const now = moversNow();
  const leave = held === 'never' || (held === 'level' && !owed && within(now, last));
  counted[leave ? 'skipped' : 'drawn']++;
  if (leave) return true;
  // (held to where they were last drawn, not the frame before: eased a few mm a frame, they'd drift on unseen)
  last = now;
  owed = false;
  return false;
}

skipAfterShadows(leavesThem);

/** Whether what moves is drawn into the kept shadows only on frames it moved (Low), from the next frame. */
export function setShadowsOnMove(on: boolean): void {
  onMoveOnly = on;
  // (the maps may be made again at another size)
  owed = true;
}

/** A lab's switch (`ShadowsHeld`), from the next frame. */
export function holdShadowsOnMove(how: ShadowsHeld): void {
  held = how;
  owed = true;
}

/** The lab's count of frames that drew the movers and that let it go, since `resetShadowsCount`. */
export const shadowsCount = (): Readonly<typeof counted> => ({ ...counted });
export function resetShadowsCount(): void {
  counted.drawn = 0;
  counted.skipped = 0;
}

/** each drawn part's place as `markMovers` read it, for the lab to tell what moved */
const marked = new Map<THREE.Object3D, number[]>();

/** Every drawn part over the kept maps, each with its place (a skinned one by its bones'). */
function eachPart(take: (part: THREE.Object3D, places: number[]) => void): void {
  const roots = [...G.players.map((player) => player.obj), ...G.enemies.map((enemy) => enemy.obj), ...shadowMovers()];
  for (const root of roots) {
    root.traverse((part) => {
      if (!part.visible || !(part as THREE.Mesh).isMesh) return;
      const places: number[] = [];
      const skinned = part as THREE.SkinnedMesh;
      if (skinned.isSkinnedMesh) for (const bone of skinned.skeleton.bones) placeOf(bone.matrixWorld, places);
      else placeOf(part.matrixWorld, places);
      take(part, places);
    });
  }
}

/** The lab's: each drawn part's place kept, for `moversMarkedMoved`. */
export function markMovers(): void {
  marked.clear();
  eachPart((part, places) => marked.set(part, places));
}

/** The lab's: the names of the parts moved by a step since `markMovers` (their parents' if they've none). */
export function moversMarkedMoved(): string[] {
  const moved: string[] = [];
  eachPart((part, places) => {
    const was = marked.get(part);
    if (was && within(was, places)) return;
    moved.push(part.name || `${namedAbove(part)}'s part (${materialName(part)}${castsOf(part)})`);
  });
  return moved;
}

/** The nearest name over `part`, for the lab. */
function namedAbove(part: THREE.Object3D): string {
  for (let up = part.parent; up; up = up.parent) if (up.name) return up.name;
  return '?';
}

/** `part`'s material's name or type, for the lab. */
function materialName(part: THREE.Object3D): string {
  const material = (part as THREE.Mesh).material as THREE.Material | undefined;
  return material ? material.name || material.type : 'no material';
}

/** Whether `part` casts, for the lab. */
const castsOf = (part: THREE.Object3D): string => (part.castShadow ? ', casting' : ', casting nothing')
  + `, ${(part as THREE.Mesh).geometry?.attributes.position?.count ?? 0} points`;
