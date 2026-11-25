// The Rootmother's burrow (entities/rootBurrow.ts): the soil it heaves up, meshes of their own in her soil, not her
// sculpt (she is at 44.7k of a boss's 45k triangles), hung under her model's root at no size till her burrow places
// them in the world each frame, as her cage's are (models/rootCage.ts). So they're warmed with her at her wave and
// nothing is made in the fight. A mound where she went under (heaved up, then settling) and where she'll rise
// (bulging through the warning, then torn open by her rising and settling), and the ridge of soil travelling over
// her way under the floor: each a lump of earth, its foot in the floor, along +z for the ridge.
import * as THREE from 'three';
import { organic } from './shapes';
import { CAGE_NO_SIZE } from './rootCage';

/** A lump of heaped earth: a squashed, gnarled sphere, its middle at its foot (it's placed half in the floor). */
let moundGeo: THREE.BufferGeometry | null = null;
function earthLump(): THREE.BufferGeometry {
  if (moundGeo) return moundGeo;
  moundGeo = organic(new THREE.SphereGeometry(1, 16, 9), 0.28, 4, 131);
  // (made once and shared by every build of her: a model's dispose keeps it, `disposeGeometries`)
  moundGeo.userData.shared = true;
  return moundGeo;
}

/** Her burrow's pool: the mound where she sank, the one where she'll rise, and the travelling ridge, each at no size. */
export interface BurrowPool { sank: THREE.Mesh; rises: THREE.Mesh; ridge: THREE.Mesh }

/** The pool hung under her model's `root`, in her soil (`soil`, her own material: no look of its own). */
export function hangBurrowPool(root: THREE.Object3D, soil: THREE.Material): BurrowPool {
  const lump = (name: string): THREE.Mesh => {
    const m = new THREE.Mesh(earthLump(), soil);
    m.name = name;
    m.castShadow = true;
    m.scale.setScalar(CAGE_NO_SIZE);
    // (not her body: the lab's count of her triangles leaves it out, and no shot or aim meets it as hers)
    m.userData.pooled = true;
    m.userData.noStick = true;
    root.add(m);
    return m;
  };
  return { sank: lump('burrow mound sank'), rises: lump('burrow mound rises'), ridge: lump('burrow ridge') };
}

const _local = new THREE.Vector3(), _rootTurn = new THREE.Quaternion();

/** Pooled lump `m` placed in the world: its middle at `at`, turned `turn`, sized `size` (x, y, z radii in m). Its
 *  parent is her root, which moves and goes under the floor with her. */
export function placeLump(m: THREE.Object3D, at: THREE.Vector3, turn: THREE.Quaternion, size: THREE.Vector3): void {
  const root = m.parent!;
  root.updateWorldMatrix(true, false);
  m.position.copy(root.worldToLocal(_local.copy(at)));
  root.getWorldQuaternion(_rootTurn);
  m.quaternion.copy(_rootTurn.invert().multiply(turn));
  m.scale.set(Math.max(CAGE_NO_SIZE, size.x), Math.max(CAGE_NO_SIZE, size.y), Math.max(CAGE_NO_SIZE, size.z));
  m.updateMatrixWorld();
}
