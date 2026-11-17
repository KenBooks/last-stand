// `lab houses`' faces round a room's door: no two shown faces lie in one plane, from inside and from above, which
// flickered seen from inside (from play: the door's jambs stood half into the wall, their faces in the plaster's).
// Apart from the door's hold so it reads only what every commit with the houses has (`houses --ab`, a probe on main).
import * as THREE from 'three';
import { G } from '../../../src/state';
import { HOUSES, type RoomId } from '../../../src/data/houses';

/** how far apart two faces a ray meets may be and still lie in one plane (m), and how alike their facing */
const SAME_PLANE = 0.0005;
const SAME_FACING = 0.99;
/** the rays' spacing (m), and how far beside a ray those that confirm it are sent (m) */
const STEP = 0.021;
const BESIDE = 0.004;
/** the canary's sheet: where along the wall from the door's middle (m), how high, and its size */
const SHEET = { x: 0.64, y: 1.1, size: 0.1 };

/** A ray in the room's own frame: from, and the way it goes. */
type RoomRay = [THREE.Vector3, THREE.Vector3];

/** Rays at the front wall round room `id`'s door: from inside at its face, across its hole's reveal and up into its
 *  head, and from above down onto the wall's top (its ceiling cut away, as from above). */
function raysRoundDoor(id: RoomId): RoomRay[] {
  const [hx, hz] = HOUSES[id].half, high = HOUSES[id].high;
  const rays: RoomRay[] = [];
  for (let x = -1.3; x < 1.3; x += STEP) {
    for (let y = 0.013; y < high; y += STEP) rays.push([new THREE.Vector3(x, y, hz - 1), new THREE.Vector3(0, 0, 1)]);
  }
  for (let z = hz - 0.32; z < hz + 0.18; z += STEP / 3) {
    for (let y = 0.013; y < 2.5; y += STEP) {
      rays.push([new THREE.Vector3(0.01, y, z), new THREE.Vector3(1, 0, 0)]);
      rays.push([new THREE.Vector3(-0.01, y, z), new THREE.Vector3(-1, 0, 0)]);
    }
    for (let x = -0.9; x < 0.9; x += STEP) rays.push([new THREE.Vector3(x, 1.5, z), new THREE.Vector3(0, 1, 0)]);
  }
  for (let x = -hx - 0.3; x < hx + 0.3; x += STEP) {
    for (let z = hz - 0.4; z < hz + 0.32; z += STEP / 2) {
      rays.push([new THREE.Vector3(x, high + 0.5, z), new THREE.Vector3(0, -1, 0)]);
    }
  }
  return rays;
}

/** Whether `object` and all it hangs from are shown. */
function shown(object: THREE.Object3D | null): boolean {
  for (let at = object; at; at = at.parent) if (!at.visible) return false;
  return true;
}

/** Which way a face a ray met looks, in the world. */
function facing(hit: THREE.Intersection): THREE.Vector3 {
  if (!hit.face) throw new Error('lab: houses: a ray met no face');
  return hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
}

/** Where a ray meets two shown faces in one plane, before a solid face hides what's past it (null: nowhere). */
function inOnePlane(ray: RoomRay, meshes: THREE.Mesh[], frame: THREE.Object3D): THREE.Vector3 | null {
  const from = frame.localToWorld(ray[0].clone());
  const way = ray[1].clone().transformDirection(frame.matrixWorld);
  const hits = new THREE.Raycaster(from, way, 0, 4).intersectObjects(meshes, false);
  const first = hits[0], next = hits[1];
  if (!first || !next) return null;
  if (next.distance - first.distance > SAME_PLANE || facing(first).dot(facing(next)) < SAME_FACING) return null;
  return first.point;
}

/** Whether the rays a hair beside `ray` meet two faces in one plane too (a ray on a seam or a triangle's diagonal
 *  meets both with nothing to fight, and those beside it one). */
function besideToo(ray: RoomRay, meshes: THREE.Mesh[], frame: THREE.Object3D): boolean {
  const across = Math.abs(ray[1].y) > 0.5 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const along = new THREE.Vector3().crossVectors(ray[1], across);
  for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const from = ray[0].clone().addScaledVector(across, a * BESIDE).addScaledVector(along, b * BESIDE);
    if (!inOnePlane([from, ray[1]], meshes, frame)) return false;
  }
  return true;
}

/** A sheet laid in the plane of the door frame's face beside room `id`'s door (the canary's fault). */
function sheetInFrame(id: RoomId): THREE.Mesh {
  const [, hz] = HOUSES[id].half;
  const room = G.arena.rooms![id].group;
  const probe = new THREE.Raycaster(room.localToWorld(new THREE.Vector3(SHEET.x, SHEET.y, hz - 1)),
    new THREE.Vector3(0, 0, 1).transformDirection(room.matrixWorld));
  const meshes: THREE.Mesh[] = [];
  room.traverse((object) => { if ((object as THREE.Mesh).isMesh && shown(object)) meshes.push(object as THREE.Mesh); });
  const face = probe.intersectObjects(meshes, false)[0];
  if (!face) throw new Error('lab: houses: no door frame beside the door to lay the canary in');
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(SHEET.size, SHEET.size).rotateY(Math.PI),
    new THREE.MeshBasicMaterial({ color: 0xff00ff }));
  sheet.position.copy(face.point);
  room.attach(sheet);
  sheet.updateMatrixWorld(true);
  return sheet;
}

/** What the faces round a room's door said: a line, how many places two lie in one plane, and where the first is. */
export interface DoorFaces { line: string; places: number }

/** No two shown faces round room `id`'s door lie in one plane, from inside and from above (`canary`: a sheet laid in
 *  the frame's face, which must be found). The room is left as it was cut away. */
export function doorFacesSteady(id: RoomId, canary: boolean): DoorFaces {
  const room = G.arena.rooms![id];
  room.showAll();
  // (from high over the room's middle: its ceiling cut away as from above, the walls left)
  room.cutAway(room.group.localToWorld(new THREE.Vector3(0, 50, 0)));
  const sheet = canary ? sheetInFrame(id) : null;
  try {
    room.group.updateMatrixWorld(true);
    const meshes: THREE.Mesh[] = [];
    room.group.traverse((object) => {
      if ((object as THREE.Mesh).isMesh && shown(object)) meshes.push(object as THREE.Mesh);
    });
    const rays = raysRoundDoor(id);
    const places = rays.flatMap((ray) => {
      const at = inOnePlane(ray, meshes, room.group);
      return at && besideToo(ray, meshes, room.group) ? [at] : [];
    });
    const where = places[0] ? `, the first at ${places[0].toArray().map((v) => v.toFixed(3)).join(',')}` : '';
    return { line: `${id}: of ${rays.length} rays round its door, ${places.length} met two faces in one plane${where}`,
      places: places.length };
  } finally {
    sheet?.removeFromParent();
  }
}
