// His legs through his skirts as he sits (tools/lab `sit`): every triangle of each skirt (its corners, its edges'
// middles and its middle) read against the thighs and shins, capsules at their drawn radii, as `armsInLegs.ts`
// reads the arms. A point of the cloth inside a leg is where the leg shows through it. From play: "knees clipping
// through robe when sitting near fire"; the skirts' wander and jerks were read, never what they cover. The canary
// reads a point at the left knee's joint, which must read deep in the leg.
import * as THREE from 'three';
import type { Joints } from '../../../src/entities/models/rig';
import { capsuleDepth } from './bodyDepth';
import { legsOf, type LegPart } from './armsInLegs';
import type { Followed } from './coat';

/** a cloth point this far inside a leg's capsule is the leg through the cloth (m): the drape stands off its collider */
export const THROUGH_FROM = 0.015;
/** the canary's point at the knee's joint must read at least this deep (m) */
const CANARY_DEEP = 0.04;

/** The deepest a leg went through a skirt on a frame: the skirt, the leg's part, how deep (m). */
export interface LegThrough {
  skirt: string;
  leg: string;
  depth: number;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _p = new THREE.Vector3();

/** The deepest point of any skirt (the hood left out) inside a leg now, or none. */
export function legsThrough(joints: Joints, skirts: Followed[]): LegThrough | null {
  joints.root.updateMatrixWorld(true);
  const legs = legsOf(joints);
  let deepest: LegThrough | null = null;
  for (const skirt of skirts) {
    if (skirt.geometry.name === 'hood') continue;
    const found = deepestOf(skirt, legs);
    if (found && (!deepest || found.depth > deepest.depth)) deepest = found;
  }
  return deepest;
}

/** The canary: a point at the left knee's joint read against the legs. As words, `caught ...` or `missed ...`. */
export function legsThroughCanary(joints: Joints): string {
  joints.root.updateMatrixWorld(true);
  const knee = joints.kneeL.getWorldPosition(new THREE.Vector3());
  const depth = Math.max(...legsOf(joints).map((leg) => capsuleDepth(knee, leg.from, leg.to, leg.radius)));
  const read = `a cloth point at the left knee read ${(depth * 100).toFixed(1)} cm into the leg`;
  return `${depth >= CANARY_DEEP ? 'caught' : 'missed'}: ${read}`;
}

/** A skirt's deepest point in any leg: each triangle's corners, its edges' middles and its middle. */
function deepestOf(skirt: Followed, legs: LegPart[]): LegThrough | null {
  const at = skirt.geometry.attributes.position;
  const index = skirt.geometry.getIndex()!;
  const world = skirt.mesh.matrixWorld;
  let best: LegThrough | null = null;
  const read = (point: THREE.Vector3) => {
    for (const leg of legs) {
      const depth = capsuleDepth(point, leg.from, leg.to, leg.radius);
      if (!best || depth > best.depth) best = { skirt: skirt.name, leg: leg.name, depth };
    }
  };
  for (let i = 0; i < index.count; i += 3) {
    _a.fromBufferAttribute(at, index.getX(i)).applyMatrix4(world);
    _b.fromBufferAttribute(at, index.getX(i + 1)).applyMatrix4(world);
    _c.fromBufferAttribute(at, index.getX(i + 2)).applyMatrix4(world);
    read(_a);
    read(_p.copy(_a).add(_b).multiplyScalar(0.5));
    read(_p.copy(_b).add(_c).multiplyScalar(0.5));
    read(_p.copy(_c).add(_a).multiplyScalar(0.5));
    read(_p.copy(_a).add(_b).add(_c).divideScalar(3));
  }
  return best;
}
