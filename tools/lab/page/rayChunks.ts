// Meshes cut into chunks for rays (the village's checks that send thousands: `hallFacesSteady`, `roofShowsWhatHeSees`).
// three tests a ray against a mesh's bounding sphere and then against every triangle of it, and the village's still
// meshes are merged ones, thousands of triangles across the whole place: 27 thousand rays at the hall took 55 s, the
// rays under the cottages' roofs 73 s of a check's 78, nearly all of it in triangles nowhere near the ray. A chunk is
// a mesh of the same material and matrix over the same vertices, with the triangles of one cell of a grid and a
// bounding box and sphere of its own, so three's own test throws out the chunks a ray passes by, and what a ray
// meets is what it met in the whole mesh: the same faces, points and distances, by three's own triangle test.
import * as THREE from 'three';

/** a mesh with fewer triangles than this is left whole: a chunk's own tests would cost what they save */
const LEAST_TRIANGLES = 600;
/** how many cells a mesh's longest side is cut into; the others by the same cell */
const CELLS_ALONG = 12;

/** the chunks made of each mesh, kept while its geometry and material are the same */
const kept = new WeakMap<THREE.Mesh, { of: THREE.BufferGeometry; material: THREE.Material; chunks: THREE.Mesh[] }>();

/** Whether `mesh` is one a chunk can stand for: plain, of one material, its triangles its geometry's own. */
function plain(mesh: THREE.Mesh): boolean {
  const special = mesh as THREE.Mesh & { isInstancedMesh?: boolean; isSkinnedMesh?: boolean; isBatchedMesh?: boolean };
  if (special.isInstancedMesh || special.isSkinnedMesh || special.isBatchedMesh) return false;
  // (a mesh with a ray test of its own, one the game takes out of its picking among them: its test stays its own)
  if (mesh.raycast !== THREE.Mesh.prototype.raycast) return false;
  if (Array.isArray(mesh.material)) return false;
  const geometry = mesh.geometry;
  if (!geometry?.getAttribute('position') || geometry.morphAttributes.position?.length) return false;
  return true;
}

/** The corners of each triangle `geometry` draws, three a triangle, by its index or its vertices' order. */
function trianglesOf(geometry: THREE.BufferGeometry): Uint32Array {
  const index = geometry.getIndex();
  const count = index ? index.count : geometry.getAttribute('position').count;
  const from = Math.max(0, geometry.drawRange.start);
  const to = Math.min(count, from + geometry.drawRange.count);
  const corners = new Uint32Array(Math.max(0, Math.floor((to - from) / 3)) * 3);
  for (let at = 0; at < corners.length; at++) corners[at] = index ? index.getX(from + at) : from + at;
  return corners;
}

/** A chunk of `mesh`: its `corners` alone over its vertices, placed and drawn as it is, bounded by `box`. */
function chunkOf(mesh: THREE.Mesh, corners: number[], box: THREE.Box3): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(mesh.geometry.attributes)) geometry.setAttribute(name, attribute);
  geometry.setIndex(new THREE.BufferAttribute(Uint32Array.from(corners), 1));
  // (its own bounds: three's would be all the vertices', the whole mesh's again)
  geometry.boundingBox = box;
  geometry.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
  const chunk = new THREE.Mesh(geometry, mesh.material);
  chunk.matrixAutoUpdate = false;
  // (the mesh's own matrix, not a copy: it follows the mesh)
  chunk.matrixWorld = mesh.matrixWorld;
  chunk.layers.mask = mesh.layers.mask;
  chunk.userData.chunkOf = mesh;
  return chunk;
}

/** `mesh` cut into chunks by the cell each triangle's middle lies in. */
function cut(mesh: THREE.Mesh): THREE.Mesh[] {
  const position = mesh.geometry.getAttribute('position');
  const corners = trianglesOf(mesh.geometry);
  if (corners.length / 3 < LEAST_TRIANGLES) return [mesh];
  const whole = new THREE.Box3();
  const point = new THREE.Vector3();
  for (const corner of corners) whole.expandByPoint(point.fromBufferAttribute(position, corner));
  const size = whole.getSize(new THREE.Vector3());
  const cell = Math.max(size.x, size.y, size.z) / CELLS_ALONG || 1;
  const cells = new Map<string, { corners: number[]; box: THREE.Box3 }>();
  const middle = new THREE.Vector3();
  for (let at = 0; at < corners.length; at += 3) {
    const own = [corners[at], corners[at + 1], corners[at + 2]];
    middle.set(0, 0, 0);
    for (const corner of own) middle.add(point.fromBufferAttribute(position, corner));
    middle.divideScalar(3).sub(whole.min).divideScalar(cell).floor();
    const key = `${middle.x},${middle.y},${middle.z}`;
    const into = cells.get(key) ?? { corners: [], box: new THREE.Box3() };
    into.corners.push(...own);
    for (const corner of own) into.box.expandByPoint(point.fromBufferAttribute(position, corner));
    cells.set(key, into);
  }
  return [...cells.values()].map((each) => chunkOf(mesh, each.corners, each.box));
}

/**
 * `meshes` as chunks for rays: each plain mesh of many triangles cut by a grid, the rest as they are. A ray sent at
 * them (`Raycaster.intersectObjects(chunks, false)`) meets what it would in the meshes themselves; a hit's `object`
 * is the chunk, of the mesh's material, matrix and vertices (`userData.chunkOf` the mesh), which has no parent: see
 * to what the mesh's place in the scene says (whether it's shown) before cutting. Kept from call to call.
 */
export function rayChunks(meshes: THREE.Mesh[]): THREE.Mesh[] {
  return meshes.flatMap((mesh) => {
    if (!plain(mesh)) return [mesh];
    const before = kept.get(mesh);
    if (before && before.of === mesh.geometry && before.material === mesh.material) return before.chunks;
    const chunks = cut(mesh);
    kept.set(mesh, { of: mesh.geometry, material: mesh.material as THREE.Material, chunks });
    return chunks;
  });
}
