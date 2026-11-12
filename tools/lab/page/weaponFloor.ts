// The weapon in the hero's hand against the floor through a scenario (tools/lab `range`): the frames any part of it
// is under the floor, and the deepest. Every corner of its surface is read, so a blade is read within its width
// and an axe's or a maul's head whole (a part's box would not do: a weapon's pieces are merged into one mesh per
// material, whose box holds the head's breadth all down the haft). Thunder Crescent's blow, stopped by its tip,
// put an axe's or a maul's head into the floor to its middle.
import * as THREE from 'three';
import type { Lab } from './lab';
import { distinctCorners } from './corners';
import { groundHeight } from '../../../src/world/ground';
import * as collision from '../../../src/world/collision';
import { G } from '../../../src/state';

/** A prop's top over (x, z), where the commit measured has `propTopAt` (an A/B against one from before it: imported by
 *  name, the module failed to link there, and every `range --ab` with it) */
function propTop(x: number, z: number): number {
  const read = (collision as { propTopAt?: (x: number, z: number) => number }).propTopAt;
  return read ? read(x, z) : -Infinity;
}

/** a ray down through the wall starts this high (m): over the crypt's walls and the trunks beyond the ring */
const WALL_RAY_FROM = 60;
const _rayFrom = new THREE.Vector3();
const _rayTo = new THREE.Vector3();
const _wallHit = { point: new THREE.Vector3(), normal: new THREE.Vector3(), t: 0, stone: false, name: '' };

/** How far the point (x, y, z) is into the arena's wall (m; none, -Infinity), as the wall is drawn (`Wall.cast`):
 *  the less of how far under its top (a ray straight down to it) and how far past its face (a ray out from the middle
 *  at its height to it). Read by the lab itself, not the game's `wallTopAt`, so a commit with none reads a blow into
 *  the wall as into it too. Under its top alone, a weapon's pommel at rest a few centimetres into the crypt's wall's
 *  face read as 1.4 m in. */
function wallDepth(x: number, y: number, z: number): number {
  // (an older tree's hall of heroes stood in a room of its own, with no wall)
  if (!G.arena || (G.arena as { hallShown?: boolean }).hallShown) return -Infinity;
  const wall = G.arena.wall;
  _rayFrom.set(x, WALL_RAY_FROM, z);
  _rayTo.set(x, y, z);
  if (!wall.cast(_rayFrom, _rayTo, _wallHit)) return -Infinity;
  const under = _wallHit.point.y - y;
  const out = Math.hypot(x, z);
  // (from just inside the nearest of it, at the point's height, out to the point)
  const from = Math.max(0, wall.near - 1) / out;
  _rayFrom.set(x * from, y, z * from);
  if (!wall.cast(_rayFrom, _rayTo, _wallHit)) return under;
  return Math.min(under, out - Math.hypot(_wallHit.point.x, _wallHit.point.z));
}

/** under the floor by this much a part counts (m): a blow stopped on it rests its tip there */
const UNDER_FROM = 0.02;
/** the canary sinks the hero this far further than the weapon's lowest point is over the floor (m), and it must be
 *  found under the floor by at least `CANARY_CAUGHT` (sunk 2 m alone, a weapon raised overhead in a cast's charge,
 *  over 2 m up, was still over the floor, and the canary was missed on every commit) */
const CANARY_SINK = 2;
export const CANARY_CAUGHT = 0.5;
/** a blade met the floor with its flat or side past this far off the blow's line (degrees) */
export const EDGE_OFF_MOST = 30;
/** near the floor, for its blade's way to count: within this of it (m) */
const NEAR_FLOOR = 0.1;

/** A frame's deepest point of the weapon: how far under the floor (m), the frame, and how far along the weapon from
 *  the grip it is (m: less than 0, the pommel's side). */
interface Under {
  depth: number;
  at: string;
  along: number;
}

const _corner = new THREE.Vector3();
const _flat = new THREE.Vector3();
const _side = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _quarter = new THREE.Quaternion();
const _gripAt = new THREE.Vector3();
const _gripWay = new THREE.Vector3();

/** The frames the weapon was under the floor, and the deepest. */
export class WeaponFloor {
  private frames = 0;
  private deepest: Under | null = null;
  /** the weapon's lowest point at its nearest the floor (under it, or how far over it as a negative depth) */
  private nearest: Under | null = null;
  /** how far its blade was off the blow's line then (degrees: 0, its edge leading; 90, its flat) */
  private nearestTilt = 0;
  /** each frame it was under, as words */
  readonly listed: string[] = [];

  /** `scenario`: the scenario's name, as its listed frames say it */
  constructor(private readonly scenario: string) {}

  /** Notes how far under the floor the weapon is this frame (`frame`: the frame as the report names it). */
  observe(lab: Lab, frame: string): void {
    const under = deepestUnder(lab, frame);
    if (under && (!this.nearest || under.depth > this.nearest.depth)) {
      this.nearest = under;
      this.nearestTilt = bladeOffLine(lab);
    }
    if (!under || under.depth < UNDER_FROM) return;
    this.frames++;
    this.listed.push(`  ${this.scenario} frame ${frame}: the weapon ${describeUnder(under)}`);
    if (!this.deepest || under.depth > this.deepest.depth) this.deepest = under;
  }

  /** The frames under the floor as words, or none if it never was. */
  describe(): string {
    if (!this.deepest) return '';
    return `the weapon under the floor on ${this.frames} frames, the deepest ${describeUnder(this.deepest)}`;
  }

  /** Whether the blade met the floor flat or sideways (`EDGE_OFF_MOST` off the blow's line at its nearest): none
   *  held, or never near it, is no fault. */
  bladeAcross(): boolean {
    return this.nearest !== null && this.nearest.depth > -NEAR_FLOOR && this.nearestTilt > EDGE_OFF_MOST;
  }

  /** How near the floor the weapon's lowest point came, as words (a blow into the ground must reach it: Thunder
   *  Crescent's two-handed end, held where it was placed, stopped short of it unseen), or none if none was held. */
  describeNearest(): string {
    const nearest = this.nearest;
    if (!nearest) return '';
    const tilt = `its blade ${this.nearestTilt.toFixed(0)}° off the blow's line`;
    const over = { ...nearest, depth: -nearest.depth };
    const point = nearest.depth >= 0 ? describeUnder(nearest) : describeUnder(over, 'over it');
    return `the weapon nearest the floor ${point}, ${tilt}`;
  }
}

/** The canary: the hero sunk `CANARY_SINK` under the floor for one measure, and back. Returns how far under the
 *  weapon read (m; none held, 0). */
export function weaponCanary(lab: Lab): number {
  const root = lab.model.root;
  const over = Math.max(0, -(deepestUnder(lab, 'canary')?.depth ?? 0));
  root.position.y -= over + CANARY_SINK;
  const depth = deepestUnder(lab, 'canary')?.depth ?? 0;
  root.position.y += over + CANARY_SINK;
  root.updateMatrixWorld(true);
  return depth;
}

/** How far the blade in the main hand is off the line of a blow straight ahead of him (degrees): its flat's normal,
 *  the grip's own x (the warrior's `FLAT_IN_GRIP`), against his own side. An axe driven down before him bites edge
 *  first, its flat facing his sides (from play: "axe needs to strike with blade perpendicular to ground", "axe lands
 *  oddly on the ground, it should perpendicular", "nobody hits like this"). Read against level alone, a flat facing
 *  ahead of him with the haft near upright read as 1 to 6 degrees off: it met the floor and the dummy flat on. */
export function bladeOffLine(lab: Lab): number {
  const grip = lab.model.tip?.parent;
  if (!grip) return 0;
  grip.updateWorldMatrix(true, false);
  const normal = _flat.set(1, 0, 0).transformDirection(grip.matrixWorld);
  const side = _side.set(1, 0, 0).transformDirection(lab.model.root.matrixWorld);
  return THREE.MathUtils.radToDeg(Math.acos(Math.min(1, Math.abs(normal.dot(side)))));
}

/** The canary: the weapon turned a quarter round its grip, read, and turned back (degrees: must read past
 *  `EDGE_OFF_MOST` wherever the edge led). */
export function bladeCanary(lab: Lab): number {
  const grip = lab.model.tip?.parent;
  if (!grip) return 0;
  const was = grip.quaternion.clone();
  const read = bladeOffLine(lab);
  grip.quaternion.multiply(_quarter.setFromAxisAngle(_up, Math.PI / 2));
  const turned = bladeOffLine(lab);
  grip.quaternion.copy(was);
  grip.updateWorldMatrix(true, true);
  return Math.abs(turned - read);
}

/** A point under the floor as words: how deep, where along the weapon, and in which frame (`side`: over it, for a
 *  point over the floor by `depth`). */
function describeUnder(under: Under, side = 'under'): string {
  const along = under.along < 0 ? `${cm(-under.along)} behind the grip` : `${cm(under.along)} along it from the grip`;
  return `${cm(under.depth)} ${side} (frame ${under.at}, ${along})`;
}

const cm = (metres: number) => `${(metres * 100).toFixed(1)} cm`;

/** The weapon's point deepest under the floor this frame (none if he holds none): every corner of the surface of
 *  the parts shown in the main hand's grip. */
function deepestUnder(lab: Lab, at: string): Under | null {
  const grip = lab.model.tip?.parent;
  if (!grip) return null;
  grip.updateWorldMatrix(true, true);
  grip.getWorldPosition(_gripAt);
  _gripWay.set(0, 1, 0).transformDirection(grip.matrixWorld);
  let deepest: Under | null = null;
  grip.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const corners = mesh.geometry.attributes.position;
    for (const i of distinctCorners(corners)) {
      _corner.fromBufferAttribute(corners, i).applyMatrix4(mesh.matrixWorld);
      // (a prop's or the wall's top counts as floor: a blow into a pillar, a stone or the wall stops on it as on the
      // ground)
      const floor = Math.max(groundHeight(_corner.x, _corner.z), propTop(_corner.x, _corner.z));
      const depth = Math.max(floor - _corner.y, wallDepth(_corner.x, _corner.y, _corner.z));
      if (deepest && depth <= deepest.depth) continue;
      deepest = { depth, at, along: _corner.sub(_gripAt).dot(_gripWay) };
    }
  });
  return deepest;
}
