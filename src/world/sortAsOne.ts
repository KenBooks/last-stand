// Parts of a thing drawn blended in one order from wherever the camera stands. The engine draws what's thinned by
// blending the farthest first, each record by its own sphere (its farthest point: Bulwark's plan.rs), the sphere made
// from its vertices (`sphere_of` in its cull.rs). The hall's columns are merged by material across the room, every
// plinth one record and every shaft another, their keys half a metre apart, and as the camera moved they swapped:
// the plinths drawn after the shafts were painted over the ghost of the column before him, then under it again (from
// play, "sometimes the stone at the foundation of the columns shows through... and then it doesn't"; `lab village
// --only blendedOrderSteady`). Each record is given a sphere round the same middle, a box round all of them, by two
// triangles of no area at its corners, each a step larger than the next's: their keys keep the steps between them
// from wherever the camera stands, so they're drawn in the turns given. (Given the same box, their keys were equal and
// the engine drew them in its own turns, the shafts first: each plinth stood over the foot of its own shaft.)
import * as THREE from 'three';

/** how much larger each turn's box is than the next's, each way (m): far over the engine's rounding at a few tens of
 *  metres, and nothing to its culling */
const TURN_STEP = 0.01;

/** `meshes` drawn in the turns given (the first first) wherever the camera stands: each given a sphere round one middle
 *  for the engine's sort, the box round all of them grown by a step a turn, by two triangles of no area at its corners
 *  (nothing drawn). Each mesh's geometry is its own (a merge's). */
export function sortAsOne(meshes: readonly THREE.Mesh[]): void {
  const box = boxOf(meshes);
  meshes.forEach((mesh, turn) => padTo(mesh, box.clone().expandByScalar((meshes.length - 1 - turn) * TURN_STEP)));
}

/** The box round all of `meshes`. */
function boxOf(meshes: readonly THREE.Mesh[]): THREE.Box3 {
  const box = new THREE.Box3();
  for (const mesh of meshes) box.expandByObject(mesh);
  return box;
}

/** `mesh`'s geometry with a point at each of `box`'s two corners (in its own space): three vertices each, a triangle
 *  of no area, so a draw of all its vertices draws nothing more. */
function padTo(mesh: THREE.Mesh, box: THREE.Box3): void {
  const toLocal = mesh.matrixWorld.clone().invert();
  const corners = [box.min, box.max].map((corner) => corner.clone().applyMatrix4(toLocal));
  const geometry = mesh.geometry;
  const added = corners.length * 3;
  const count = geometry.attributes.position.count;
  for (const [name, attribute] of Object.entries(geometry.attributes) as [string, THREE.BufferAttribute][]) {
    const size = attribute.itemSize;
    const grown = new (attribute.array.constructor as Float32ArrayConstructor)((count + added) * size);
    grown.set(attribute.array);
    for (let k = 0; k < added; k++) {
      const at = (count + k) * size;
      if (name === 'position') corners[Math.floor(k / 3)].toArray(grown, at);
      else grown.set(attribute.array.subarray(0, size), at);
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(grown, size, attribute.normalized));
  }
  if (geometry.index) {
    const index = geometry.index;
    const grown = new Uint32Array(index.count + added);
    grown.set(index.array);
    for (let k = 0; k < added; k++) grown[index.count + k] = count + k;
    geometry.setIndex(new THREE.BufferAttribute(grown, 1));
  }
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
}
