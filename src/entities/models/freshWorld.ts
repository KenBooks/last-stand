// World matrices made once a pass: three's `localToWorld` and `worldToLocal` make an object's whole chain up to the
// root again for every point they convert (`updateWorldMatrix(true, false)`), and `worldToLocal` inverts a matrix each
// time. A skirt's limbs placed so (`SkirtLimbs.place`, `armOffThigh` in armor.ts) were a third of the warrior's pose:
// his update 3.6 ms a frame on a laptop's CPU at Very low, the largest of its stages. Made once a pass, the numbers
// are the same to the bit (`tools/lab/test/freshWorld.test.mjs`): nothing moves within one.
import * as THREE from 'three';

/** the objects whose world matrix this pass has made */
const fresh = new Set<THREE.Object3D>();
/** the space's world matrix inverted, once a pass */
const local = new THREE.Matrix4();

/** A pass begun: every world matrix asked for from now on is made again, once (after anything has moved). */
export function freshPass(): void {
  fresh.clear();
}

/** `o`'s world matrix, made as three's `updateWorldMatrix(true, false)` makes it (its parents' first, each composed
 *  from its place and turn), once a pass. */
export function freshWorld(o: THREE.Object3D): THREE.Matrix4 {
  if (fresh.has(o)) return o.matrixWorld;
  if (o.parent) freshWorld(o.parent);
  o.updateWorldMatrix(false, false);
  fresh.add(o);
  return o.matrixWorld;
}

/** `space`'s world matrix inverted, made this pass: what `worldToLocal` applies. Valid until the next call. */
export function freshLocal(space: THREE.Object3D): THREE.Matrix4 {
  return local.copy(freshWorld(space)).invert();
}
