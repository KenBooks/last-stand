// Very low's foliage (`leanFoliage` in data/quality.ts): a third of the leaf cards, each a little wider, and the trees'
// bark of fewer rings and segments (`coarseBark` in ezTrees.ts). (No weeds, ferns or fallen leaves on the floor
// besides, the grass kept: the clutter's `setFloorPlants` in culling.ts.) Each mesh registered here has a
// coarse geometry swapped in for its own, made the first time the level asks for it, its material kept: a quality
// switches it live with no program made, on WebGL and WebGPU alike, and back again.
import * as THREE from 'three';
import { coarseBark, thinnedLeaves, type TreeKind } from './ezTrees';

/** the leaf cards kept at Very low and how much wider each (against the cards as drawn at every other level) */
const LEAN_LEAVES = { keep: 0.35, grow: 1.3, seed: 5 };

/** a set of meshes drawing one geometry (a mesh and its shadow caster: `cullInCells`), its own and its coarse one */
interface Lean { meshes: THREE.Mesh[]; full: THREE.BufferGeometry; make: () => THREE.BufferGeometry; coarse?: THREE.BufferGeometry }
const leans: Lean[] = [];
let lean = false;

function put(entry: Lean): void {
  const geometry = lean ? (entry.coarse ??= entry.make()) : entry.full;
  for (const mesh of entry.meshes) mesh.geometry = geometry;
}

/** `meshes` (all drawing one geometry) drawn with `make`'s geometry instead where the level's foliage is lean. */
function withLean(meshes: THREE.Mesh[], make: () => THREE.BufferGeometry): void {
  const entry: Lean = { meshes, full: meshes[0].geometry, make };
  leans.push(entry);
  if (lean) put(entry);
}

/** each geometry's lean leaves, made once (the forest's kinds' leaves are drawn by more than one mesh) */
const leanLeaves = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();

/** `meshes`' leaf cards (four corners and two triangles each: ez-tree's leaves, `canopyGeo`'s cards) thinned to
 *  Very low's share where the level's foliage is lean. */
export function leanLeafCards(meshes: THREE.Mesh[]): void {
  const full = meshes[0].geometry;
  withLean(meshes, () => {
    let thin = leanLeaves.get(full);
    if (!thin) leanLeaves.set(full, thin = thinnedLeaves(full, LEAN_LEAVES.keep, LEAN_LEAVES.grow, LEAN_LEAVES.seed));
    return thin;
  });
}

/** `meshes`' bark, `kind`'s, of fewer rings and segments where the level's foliage is lean (`coarseBark`). */
export function leanBark(meshes: THREE.Mesh[], kind: TreeKind): void {
  withLean(meshes, () => coarseBark(kind));
}

/** Whether the foliage is lean (Very low's), live: geometries swapped alone. */
export function setLeanFoliage(on: boolean): void {
  if (on === lean) return;
  lean = on;
  for (const entry of leans) put(entry);
}
