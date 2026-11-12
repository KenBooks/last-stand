// `lab village`'s hall's front wall: its blocks of walling (the wings either side of the door, the one over it) laid as
// one wall, their courses on one grid of the world. Each face's map read at each of its corners against the corner's
// place along the face and up it: the part of a tile it's off (the same everywhere when the blocks' courses meet), its
// spread between the blocks (from play, "misaligned texture": each block's own ran from its corner, and the one over
// the door met the wings a part course off). `canary` moves one block's map a third of a tile.
import * as THREE from 'three';
import { G } from '../../../src/state';
import type { LightsChecked } from './villageLights';

/** the most a tile's part the blocks' maps may be off one another (a course 0.5 m tall: 1%, 5 mm) */
const MOST_OFF = 0.01;
/** the walls' tiles a metre (`walling`'s texel) */
const TEXEL = 0.5;
/** how far the canary moves a block's map (of a tile) */
const CANARY_SHIFT = 1 / 3;

/** How far apart `a` and `b` are round a tile (0 to 0.5). */
function roundApart(a: number, b: number): number {
  const apart = Math.abs(a - b) % 1;
  return Math.min(apart, 1 - apart);
}

/** The front wall's walling: its meshes drawn in the material most of it is (the largest's). */
function wallingOf(front: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  front.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  const size = (m: THREE.Mesh): number => new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3()).lengthSq();
  const largest = meshes.reduce((a, b) => (size(a) >= size(b) ? a : b));
  return meshes.filter((m) => m.material === largest.material);
}

/** Each front face's corners (facing along z): the map's part of a tile against the corner's place, along x and up. */
function offsetsOf(mesh: THREE.Mesh, shift: number): { u: number; v: number }[] {
  const g = mesh.geometry, at = g.attributes.position, uv = g.attributes.uv, n = g.attributes.normal;
  const world = new THREE.Vector3();
  const offsets: { u: number; v: number }[] = [];
  for (let i = 0; i < uv.count; i++) {
    if (Math.abs(n.getZ(i)) < 0.5) continue;
    world.fromBufferAttribute(at, i).applyMatrix4(mesh.matrixWorld);
    offsets.push({ u: uv.getX(i) + shift - world.x * TEXEL, v: uv.getY(i) - world.y * TEXEL });
  }
  return offsets;
}

/** The front wall's blocks' courses against each other. */
export function wallingAligned(canary: boolean): LightsChecked {
  const front = G.arena.village.hallCutaway[1];
  front.updateMatrixWorld(true);
  const meshes = wallingOf(front);
  const offsets = meshes.flatMap((m, i) => offsetsOf(m, canary && i === 0 ? CANARY_SHIFT : 0));
  const first = offsets[0];
  let most = 0;
  for (const o of offsets) most = Math.max(most, roundApart(o.u, first.u), roundApart(o.v, first.v));
  const apart = (most * 100).toFixed(1);
  const line = `hall's front wall: ${meshes.length} blocks of walling, their courses apart at most ${apart}% of a tile`
    + ` (at most ${MOST_OFF * 100}%)`;
  const off = most > MOST_OFF;
  if (meshes.length < 3) {
    return { lines: [line], problems: [`${line}: not the wall's blocks`], caught: null, moments: [] };
  }
  if (canary) return { lines: [line], problems: [], caught: off, moments: [] };
  return { lines: [line], problems: off ? [`${line}: misaligned`] : [], caught: null, moments: [] };
}
