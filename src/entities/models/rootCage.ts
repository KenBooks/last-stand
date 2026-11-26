// The Rootmother's root cage and the great root she brings down on it (entities/rootCage.ts): meshes of their own,
// not her sculpt (she is at 44.7k of a boss's 45k triangles), in her own bark, hung under her model's root at no size
// till a cage places them in the world each frame. So they're warmed with her at her wave and nothing is made in the
// fight. A cage's root rises out of the earth along +y and arches over towards -x (the cage's middle, as placed); the
// great root stands along +y from its foot, to be laid over onto the cage.
import * as THREE from 'three';
import { ROOTMOTHER } from '../../data/foes/rootmother';
import { organic, taperTube } from './shapes';

const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
const C = ROOTMOTHER.cage;
/** the scale a pooled part is kept at while it's not shown (never 0: a zero scale's inverse is NaN, black lines) */
export const CAGE_NO_SIZE = 1e-4;
/** the great root's length from its foot (m): across the cage and past it, from `rise` m off its edge */
export const GREAT_LENGTH = C.rise + C.radius * 2 + 0.8;

/** A cage's root: from its foot thick in the earth, up and out a little, then arched over to its tip near the cage's
 *  top middle, gnarled, a rootlet or two off it. Made once. */
let rootGeo: THREE.BufferGeometry | null = null;
function cageRootGeo(): THREE.BufferGeometry {
  if (rootGeo) return rootGeo;
  const r = C.radius, h = C.rootH;
  const path = [V(0, -0.3, 0), V(0.08, h * 0.35, 0.03), V(-r * 0.15, h * 0.8, -0.04), V(-r * 0.6, h * 1.02, 0.02),
    V(-r * 0.92, h * 0.98, 0)];
  rootGeo = organic(taperTube(path, (t) => C.rootR * (1.05 - t * 0.75), 14, 7), 0.035, 5, 91);
  // (made once and shared by every build of her: a model's dispose keeps it, `disposeGeometries`)
  rootGeo.userData.shared = true;
  return rootGeo;
}

/** The great root: a thick trunk of a root, gnarled, tapering to a blunt end. Made once. */
let greatGeo: THREE.BufferGeometry | null = null;
function greatRootGeo(): THREE.BufferGeometry {
  if (greatGeo) return greatGeo;
  const L = GREAT_LENGTH;
  const path = [V(0, -0.4, 0), V(0.12, L * 0.3, 0.05), V(-0.08, L * 0.62, -0.04), V(0.05, L, 0.02)];
  greatGeo = organic(taperTube(path, (t) => 0.55 * (1 - t * 0.6), 18, 9), 0.08, 3, 92);
  greatGeo.userData.shared = true;
  return greatGeo;
}

/** Her cage's pool: `ROOTMOTHER.cage.roots` roots and the great root, each a mesh under `root` in `wood`, at no size. */
export interface CagePool { roots: THREE.Mesh[]; great: THREE.Mesh }

/** The pool hung under her model's `root`, in her bark (`wood`, her own material: no look of its own). */
export function hangCagePool(root: THREE.Object3D, wood: THREE.Material): CagePool {
  const roots = Array.from({ length: C.roots }, (_, i) => {
    const m = new THREE.Mesh(cageRootGeo(), wood);
    m.name = `cage root ${i}`;
    m.castShadow = true;
    m.scale.setScalar(CAGE_NO_SIZE);
    // (not her body: the lab's count of her triangles leaves it out, `userData.pooled`)
    m.userData.pooled = true;
    // (not her body to a shot or the aim either: an arrow at a root breaks the root, a prop, never wounds her)
    m.userData.noStick = true;
    root.add(m);
    return m;
  });
  const great = new THREE.Mesh(greatRootGeo(), wood);
  great.name = 'great root';
  great.castShadow = true;
  great.scale.setScalar(CAGE_NO_SIZE);
  great.userData.pooled = true;
  great.userData.noStick = true;
  root.add(great);
  return { roots, great };
}

const _local = new THREE.Vector3(), _rootTurn = new THREE.Quaternion();

/** Pooled part `m` placed in the world: at `at`, turned `turn`, scaled `scale` (its parent her root, which moves). */
export function placePooled(m: THREE.Object3D, at: THREE.Vector3, turn: THREE.Quaternion, scale: number): void {
  const root = m.parent!;
  root.updateWorldMatrix(true, false);
  m.position.copy(root.worldToLocal(_local.copy(at)));
  root.getWorldQuaternion(_rootTurn);
  m.quaternion.copy(_rootTurn.invert().multiply(turn));
  m.scale.setScalar(Math.max(CAGE_NO_SIZE, scale));
  // (its matrix made now, not at the next draw: an arrow meets a root by its mesh, `propSurface`, and a page that draws
  // nothing, a co-op lab page's, left it at its last draw's, the arrows passing through every root)
  m.updateMatrixWorld();
}

/** Pooled part `m` put away again (at no size, where it was). */
export function putAway(m: THREE.Object3D): void {
  m.scale.setScalar(CAGE_NO_SIZE);
}
