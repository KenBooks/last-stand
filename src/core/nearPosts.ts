// What stands free that the close views' near plane keeps off, as it keeps off the arena's wall (`nearClear` in
// core/renderer.ts): a place's columns, each a box round it. The camera over the shoulder may stand a hand from a
// column, which the wall's casts never meet, and the near plane at 0.5 m cut away all of it facing the camera but its
// two edges: in the hall of heroes a column between the camera and him was a thin pale sliver from top to bottom of the
// screen, its ghost cut away with it (#948, `lab village --only columnsNotCut`).
import * as THREE from 'three';

/** each place's posts, by its name (`G.arena.place`) */
const posts = new Map<string, readonly THREE.Box3[]>();

/** `place`'s posts the near plane keeps off: each a box round all of one, its foot to its top. */
export function keepNearOff(place: string, boxes: readonly THREE.Box3[]): void {
  posts.set(place, boxes);
}

/**
 * `camera` moved out level from each of `place`'s posts it stands within `room` m of, taken as the round post its box
 * is drawn round (its half width): the near plane comes no nearer than a hand (`BOOM_NEAR` in core/renderer.ts), and
 * a camera a few centimetres off a column still cut it.
 */
export function keepOffPosts(place: string | undefined, camera: THREE.Vector3, room: number): void {
  const boxes = place === undefined ? undefined : posts.get(place);
  for (const box of boxes ?? []) {
    if (camera.y < box.min.y || camera.y > box.max.y) continue;
    const x = (box.min.x + box.max.x) / 2;
    const z = (box.min.z + box.max.z) / 2;
    const least = (box.max.x - box.min.x) / 2 + room;
    const off = Math.hypot(camera.x - x, camera.z - z);
    if (off >= least) continue;
    // (straight out from its middle; from the middle itself, any way out)
    const toX = off > 1e-4 ? (camera.x - x) / off : 1;
    const toZ = off > 1e-4 ? (camera.z - z) / off : 0;
    camera.x = x + toX * least;
    camera.z = z + toZ * least;
  }
}

const _way = new THREE.Vector3();
const _hit = new THREE.Vector3();
const _ray = new THREE.Ray();

/**
 * The share of the way from `from` to `to` before it enters one of `place`'s posts, 1 where it enters none: 0 from
 * inside one.
 */
export function postsReach(place: string | undefined, from: THREE.Vector3, to: THREE.Vector3): number {
  const boxes = place === undefined ? undefined : posts.get(place);
  if (!boxes?.length) return 1;
  const length = _way.subVectors(to, from).length();
  if (length < 1e-6) return 1;
  _ray.set(from, _way.divideScalar(length));
  let reach = 1;
  for (const box of boxes) {
    if (box.containsPoint(from)) return 0;
    if (!_ray.intersectBox(box, _hit)) continue;
    reach = Math.min(reach, _hit.distanceTo(from) / length);
  }
  return reach;
}
