// Plate shelves on a room's wall, filled with the pottery of `pottery.ts` (#733): plates stood on edge behind rails,
// pitchers and tall jugs, bowls stacked, beakers in pairs, a mix as a shelf filled over time is. Every pot is in one
// group kept apart (`POTTERY`, merged within itself: a draw for the clay and one for the pewter, as merged with the room
// they were), each thing on a shelf a group of its own (`pot <kind>`), and each shelf's boards one (`plate shelf`), so
// `lab pottery` finds them by name, counts what they cost and reads each thing against its board.
import * as THREE from 'three';
import { beaker, bowl, charger, facing, pitcher, slipPlate, tallJug } from './potForms';
import { clayMaterial } from './pottery';
import { slipwareMaterial } from './slipware';
import { box, keepApart, type Mats } from './rooms';

/** the name of the group that holds a room's pottery */
export const POTTERY = 'pottery';
/** the name of a shelf's boards' group */
export const PLATE_SHELF = 'plate shelf';

// (one set over every shelf: the merge then draws every clay pot together, and every pewter one)
const CLAY = clayMaterial();
// (a soft metal's sheen: at 0.7 metal and 0.45 rough it read as grey card, at 0.85 near black, with little bright
// round it to give back)
const PEWTER = new THREE.MeshStandardMaterial({ color: 0xaaa79e, metalness: 0.6, roughness: 0.35 });
const CHARGER = charger();

/** What stands on a plate shelf, with the room along it each takes (m). */
export type ShelfThing = 'plate' | 'plates' | 'pitcher' | 'tallJug' | 'bowls' | 'beakers';
const ROOM_FOR: Readonly<Record<ShelfThing, number>> = {
  plate: 0.29, plates: 0.39, pitcher: 0.21, tallJug: 0.17, bowls: 0.21, beakers: 0.17,
};
/** how often each is chosen: a shelf mostly plates, some leant on each other, a jug or two, bowls stacked, cups */
const CHANCES: readonly (readonly [ShelfThing, number])[] = [
  ['plate', 0.28], ['plates', 0.22], ['pitcher', 0.16], ['tallJug', 0.1], ['bowls', 0.14], ['beakers', 0.1],
];
/** what fills a shelf's end, the smallest first */
const SMALLEST: readonly ShelfThing[] = ['beakers', 'tallJug', 'bowls'];
/** the gap between two things along a shelf (m) */
const GAP = 0.008;

/** A room's pottery group on a wall (its frame): kept apart once its shelves are filled (`keepPotteryApart`). */
export function potteryOn(wall: THREE.Object3D): THREE.Group {
  const pottery = new THREE.Group();
  pottery.name = POTTERY;
  wall.add(pottery);
  return pottery;
}

/** The filled pottery kept apart from the room's merge and merged within itself: `keepApart` marks the meshes there
 *  as it's called, so it's called once they're all in (called first, they were merged with the room's). */
export function keepPotteryApart(pottery: THREE.Object3D): void {
  keepApart(pottery, true);
}

function pickThing(rng: () => number, last: ShelfThing | null): ShelfThing {
  for (let tries = 0; ; tries++) {
    let roll = rng();
    let thing: ShelfThing = 'plate';
    for (const [kind, chance] of CHANCES) {
      thing = kind;
      roll -= chance;
      if (roll < 0) break;
    }
    // (two of a kind side by side only by a second throw's choice: a shelf filled over time is a mix)
    if (thing !== last || tries > 0) return thing;
  }
}

/** A pot in its thing's group, in the clay or pewter, casting its shadow. */
function pot(thing: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  thing.add(mesh);
  return mesh;
}

/** the lowest a mesh's vertices stand along `axis` in its frame, as it's turned and placed now */
function lowest(mesh: THREE.Mesh, axis: 'y' | 'z'): number {
  return -furthest(mesh, axis, -1);
}

/** the furthest a mesh's vertices stand along `axis` (times `sign`) in its frame, as it's turned and placed now */
function furthest(mesh: THREE.Mesh, axis: 'y' | 'z', sign: 1 | -1): number {
  mesh.updateMatrix();
  const position = mesh.geometry.attributes.position, point = new THREE.Vector3();
  let most = -Infinity;
  for (let k = 0; k < position.count; k++) {
    most = Math.max(most, sign * point.fromBufferAttribute(position, k).applyMatrix4(mesh.matrix)[axis]);
  }
  return most;
}

/** A plate (slipware or pewter) stood on edge, leant back `lean` against what's behind it at `behind` (m out from the
 *  wall), turned a little about its own middle as it was put back, its foot on the board. */
function leantPlate(thing: THREE.Object3D, at: number, top: number, behind: number, lean: number,
  rng: () => number, size = 1): THREE.Mesh {
  const pewter = rng() < 0.35;
  const plate = pot(thing, pewter ? CHARGER : slipPlate(rng), pewter ? PEWTER : slipwareMaterial());
  plate.scale.setScalar(size);
  // (boxed round its vertices as the room's merge keeps its parts in dev builds: `lab pottery` reads a pair by them)
  plate.userData.preciseBox = true;
  plate.rotation.x = Math.PI / 2 - lean;
  plate.rotation.z = (rng() - 0.5) * 0.3;
  plate.position.set(at, top + 0.145, 0.1);
  plate.position.z += behind - lowest(plate, 'z');
  plate.position.y += top - lowest(plate, 'y');
  return plate;
}

/** A jug, bowls stacked, beakers, or plates leant on the wall (one or two, the front one on the back one), centred
 *  `at` along a shelf whose top is `top`. */
function shelfThing(thing: THREE.Object3D, kind: ShelfThing, at: number, top: number, rng: () => number): void {
  if (kind === 'plate' || kind === 'plates') {
    // (leant back a quarter of a radian: at 0.15 it stood bolt upright as seen from the room)
    // (two: the back one to one side, the front one 7 to 10 cm to the other, each its own disc; near centred on
    // each other, from play, they read as "one plate inside another")
    const apart = kind === 'plates' ? (0.07 + rng() * 0.03) * (rng() < 0.5 ? -1 : 1) : 0;
    const back = leantPlate(thing, at - apart / 2, top, 0.004, 0.25, rng);
    if (kind === 'plates') {
      // (the second smaller, leant as the first is and resting on its rim: its back clear of the first's front. Put
      // 3 cm off the first's back, as a plate is 6 deep foot to rim, the first's rim cut through its well, #987)
      leantPlate(thing, at + apart / 2, top, furthest(back, 'z', 1) + 0.002, 0.25, rng, 0.9);
    }
  } else if (kind === 'pitcher' || kind === 'tallJug') {
    const jug = pot(thing, kind === 'pitcher' ? pitcher(rng) : tallJug(rng), CLAY);
    jug.rotation.y = facing(rng);
    jug.position.set(at, top, 0.11);
    jug.position.y += top - lowest(jug, 'y');
  } else if (kind === 'bowls') {
    // (two or three nested, each a little off the one under it)
    for (let k = 0, count = 2 + Math.floor(rng() * 2); k < count; k++) {
      const one = pot(thing, bowl(rng, k < count - 1), CLAY);
      one.rotation.y = rng() * Math.PI * 2;
      one.position.set(at + (rng() - 0.5) * 0.008, top, 0.115 + (rng() - 0.5) * 0.008);
      one.position.y += top + k * 0.014 - lowest(one, 'y');
    }
  } else {
    for (const [dx, dz] of [[-0.042, 0.08], [0.042, 0.15]] as const) {
      const cup = pot(thing, beaker(rng), CLAY);
      cup.rotation.y = rng() * Math.PI * 2;
      cup.position.set(at + dx, top, dz);
      cup.position.y += top - lowest(cup, 'y');
    }
  }
}

/**
 * A shelf on a wall (its frame) at (x, y), `w` long, its boards on the wall and its pottery in `pottery` (both in the
 * wall's frame): plates leant on the wall, jugs, bowls and cups, behind a rail.
 */
export function plateShelf(wall: THREE.Object3D, pottery: THREE.Object3D, M: Mats, x: number, y: number, w: number,
  rng: () => number): void {
  const shelf = new THREE.Group();
  shelf.name = PLATE_SHELF;
  wall.add(shelf);
  box(shelf, w, 0.04, 0.24, x, y, 0.12, M.oak);
  for (const sx of [-1, 1]) box(shelf, 0.04, 0.16, 0.2, x + sx * (w / 2 - 0.1), y - 0.16, 0.1, M.timber);
  // (the rail along its front edge, which keeps what stands on it from sliding off: a block under each plate read as
  // a stand)
  box(shelf, w, 0.028, 0.014, x, y + 0.04, 0.226, M.oak);
  const top = y + 0.04, end = x + w / 2 - 0.05;
  let last: ShelfThing | null = null;
  for (let at = x - w / 2 + 0.05; ;) {
    // (where the thing chosen doesn't fit, the smallest that does fills the shelf's end: left, a shelf of plates
    // ended a third of a metre bare)
    const chosen = pickThing(rng, last);
    const kind = at + ROOM_FOR[chosen] <= end ? chosen : SMALLEST.find((small) => at + ROOM_FOR[small] <= end);
    if (!kind) break;
    const room = ROOM_FOR[kind];
    const thing = new THREE.Group();
    thing.name = `pot ${kind}`;
    pottery.add(thing);
    shelfThing(thing, kind, at + room / 2, top, rng);
    at += room + GAP;
    last = kind;
  }
}
