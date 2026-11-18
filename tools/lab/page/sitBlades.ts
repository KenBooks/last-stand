// A hero's two weapons through each other as he sits (tools/lab `sit`). From play, of two swords crossed on his lap on a
// column, "this is messed up": the blades passed through each other where they crossed. `BladesApart` reads each
// frame the line down the middle of each hand's blade (its largest shown mesh, along its longest side), and how near
// the two come.

import * as THREE from 'three';
import type { Lab } from './lab';
import { segmentDistance } from './geometry';

/** how near two weapons' middle lines may come (m): a blade's half thickness each and a little air */
const APART_MOST = 0.02;
/** how long a blade must be to be a weapon's (m), not a hand's or a strap's */
const WEAPON_FROM = 0.3;

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _middle = new THREE.Vector3();

/** A weapon's blade: its mesh, and the ends of its middle line in the mesh's own space. */
interface Line {
  mesh: THREE.Mesh;
  ends: Ends;
}

/** The two lines' ends in the world. */
type Ends = [THREE.Vector3, THREE.Vector3];

/** Whether two lines this near are through each other. */
export function through(distance: number): boolean {
  return distance < APART_MOST;
}

/** The canary: two lines crossing at a point read as through each other; a hand's width apart, they don't. */
export function bladesCanary(): boolean {
  const flat: Ends = [new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 0, 0)];
  const across: Ends = [new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, 1)];
  const above: Ends = [new THREE.Vector3(0, 0.1, -1), new THREE.Vector3(0, 0.1, 1)];
  const crossing = segmentDistance(flat[0], flat[1], across[0], across[1]);
  const apart = segmentDistance(flat[0], flat[1], above[0], above[1]);
  return through(crossing) && !through(apart);
}

/** Two weapons' frames through each other, the deepest and where. */
export class BladesApart {
  private lines: [Line, Line] | null | undefined;
  private frames = 0;
  private nearest = Infinity;
  private at = '';
  /** the nearest the two came, through or not, and where */
  private closest = Infinity;
  private closestAt = '';

  /** Notes this frame, if he holds a weapon in each hand. */
  observe(lab: Lab, frame: string): void {
    this.lines ??= linesOf(lab);
    if (!this.lines) return;
    lab.model.root.updateMatrixWorld(true);
    const [right, left] = this.lines.map(endsOf);
    const distance = segmentDistance(right[0], right[1], left[0], left[1]);
    if (distance < this.closest) {
      this.closest = distance;
      this.closestAt = frame;
    }
    if (!through(distance)) return;
    this.frames++;
    if (distance >= this.nearest) return;
    this.nearest = distance;
    this.at = frame;
  }

  /** What was read, as a line of the report: the nearest the two weapons came, or none if he held one. */
  summary(name: string): string {
    if (!this.lines) return '';
    const [right, left] = this.lines.map((line) => (lengthOf(line) * 100).toFixed(0));
    const closest = (this.closest * 100).toFixed(1);
    return `  by the ${name}, his two weapons (${right} and ${left} cm) at their nearest ${closest} cm apart `
      + `(${this.closestAt})`;
  }

  /** The frames through each other as words, or none if they never were. */
  describe(name: string): string {
    if (this.frames === 0) return '';
    const nearest = (this.nearest * 100).toFixed(1);
    return `sit: by the ${name}, his two weapons through each other on ${this.frames} frames, their middles ${nearest} cm `
      + `apart (${this.at})`;
  }
}

/** The blade in each hand, or null unless he holds one in each. */
function linesOf(lab: Lab): [Line, Line] | null {
  lab.model.root.updateMatrixWorld(true);
  const right = bladeOf(lab.joints.handR);
  const left = bladeOf(lab.joints.handL);
  return right && left ? [right, left] : null;
}

/** The largest mesh shown under `hand` that's no skin (the hand's own), along its longest side, or null if it's short. */
function bladeOf(hand: THREE.Object3D): Line | null {
  let best: Line | null = null;
  let longest = 0;
  hand.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh || !mesh.geometry) return;
    const line = lineAlong(mesh);
    const length = lengthOf(line);
    if (length <= longest) return;
    longest = length;
    best = line;
  });
  return longest >= WEAPON_FROM ? best : null;
}

/** A mesh's middle line along its box's longest side, in its own space. */
function lineAlong(mesh: THREE.Mesh): Line {
  mesh.geometry.computeBoundingBox();
  _box.copy(mesh.geometry.boundingBox!);
  _box.getSize(_size);
  _box.getCenter(_middle);
  const axis = _size.x >= _size.y && _size.x >= _size.z ? 'x' : _size.y >= _size.z ? 'y' : 'z';
  const from = _middle.clone();
  const to = _middle.clone();
  from[axis] = _box.min[axis];
  to[axis] = _box.max[axis];
  return { mesh, ends: [from, to] };
}

/** A line's length as drawn now (m). */
function lengthOf(line: Line): number {
  const [from, to] = endsOf(line);
  return from.distanceTo(to);
}

/** A line's two ends in the world now. */
function endsOf(line: Line): Ends {
  return [line.mesh.localToWorld(line.ends[0].clone()), line.mesh.localToWorld(line.ends[1].clone())];
}
