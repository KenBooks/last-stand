// What a hero carries against the seat he sits on (tools/lab `sit`): the frames any of it passes into the seat, and
// the deepest. A seat is read as solid from its top down to the floor (`seatTopAt`, its meshes met from above), and
// what's carried as points along its length (its box along its grip's way, the blade's or the haft's line). From
// play: the greatsword swept down through the log he sat on, and no measure said so (they read the weapon against his
// body and the floor alone).
import * as THREE from 'three';
import type { Lab } from './lab';
import { groundHeight } from '../../../src/world/ground';
import { seatTopAt, type Seat } from '../../../src/world/seats';

/** into the seat by this much a point counts (m): a blade laid on a log's bark */
export const SEAT_INTO_FROM = 0.02;
/** the points read along a piece's length */
const POINTS = 24;
/** the canary is caught when a piece moved into the seat reads at least this deep (m) */
export const SEAT_CANARY_CAUGHT = 0.05;

/** A piece's point deepest in the seat: how deep (m), the frame, and how far along it from its grip (m). */
interface IntoSeat {
  depth: number;
  at: string;
  along: number;
}

const _box = new THREE.Box3();
const _point = new THREE.Vector3();

/** The frames a carried piece was in the seat, and the deepest. */
export class WeaponSeat {
  private frames = 0;
  private deepest: IntoSeat | null = null;

  constructor(private readonly seat: Seat, private readonly pieceOf: (lab: Lab) => THREE.Object3D | null | undefined) {}

  /** Notes how far into the seat the piece is this frame (`frame`: the frame as the report names it). */
  observe(lab: Lab, frame: string): void {
    const piece = this.pieceOf(lab);
    if (!piece || this.seat.ground) return;
    const into = deepestIn(this.seat, piece, frame);
    if (!into || into.depth < SEAT_INTO_FROM) return;
    this.frames++;
    if (!this.deepest || into.depth > this.deepest.depth) this.deepest = into;
  }

  /** The frames in the seat as words, or none if it never was. */
  describe(): string {
    if (!this.deepest) return '';
    const { depth, at, along } = this.deepest;
    return `the weapon through the seat on ${this.frames} frames, the deepest ${cm(depth)} into it (${at}, `
      + `${cm(along)} along it from the grip)`;
  }

  /** how deep it was at its deepest (m) */
  get depth(): number {
    return this.deepest?.depth ?? 0;
  }
}

/** The canary: `piece` moved to `into` m under the seat's top at its middle for one read, and back. Returns how deep
 *  it read (m). */
export function seatCanary(seat: Seat, piece: THREE.Object3D, into: number): number {
  const was = piece.position.clone();
  const x = (seat.ax + seat.bx) / 2, z = (seat.az + seat.bz) / 2;
  const target = new THREE.Vector3(x, seatTopAt(seat, x, z) - into, z);
  piece.position.copy(piece.parent ? piece.parent.worldToLocal(target) : target);
  piece.updateWorldMatrix(true, true);
  const depth = deepestIn(seat, piece, 'canary')?.depth ?? 0;
  piece.position.copy(was);
  piece.updateWorldMatrix(true, true);
  return depth;
}

/** The piece's point deepest in the seat: `POINTS` along the middle of its box in its own frame, from end to end. */
function deepestIn(seat: Seat, piece: THREE.Object3D, at: string): IntoSeat | null {
  piece.updateWorldMatrix(true, true);
  const box = boxInFrame(piece);
  if (box.isEmpty()) return null;
  const midX = (box.min.x + box.max.x) / 2;
  const midZ = (box.min.z + box.max.z) / 2;
  let deepest: IntoSeat | null = null;
  for (let i = 0; i < POINTS; i++) {
    const y = box.min.y + (box.max.y - box.min.y) * (i / (POINTS - 1));
    _point.set(midX, y, midZ).applyMatrix4(piece.matrixWorld);
    const depth = depthIn(seat, _point);
    if (depth <= (deepest?.depth ?? 0)) continue;
    const along = y * new THREE.Vector3().setFromMatrixScale(piece.matrixWorld).y;
    deepest = { depth, at, along };
  }
  return deepest;
}

/** How far under the seat's top a point is (m), if it's over the floor; 0 outside it. */
function depthIn(seat: Seat, point: THREE.Vector3): number {
  if (point.y <= groundHeight(point.x, point.z)) return 0;
  const top = seatTopAt(seat, point.x, point.z);
  return Number.isFinite(top) ? Math.max(0, top - point.y) : 0;
}

/** The box round a piece's meshes, in the piece's own frame. */
function boxInFrame(piece: THREE.Object3D): THREE.Box3 {
  _box.makeEmpty();
  const toPiece = piece.matrixWorld.clone().invert();
  piece.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.computeBoundingBox();
    const local = mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld).applyMatrix4(toPiece);
    _box.union(local);
  });
  return _box;
}

const cm = (metres: number) => `${(metres * 100).toFixed(1)} cm`;
