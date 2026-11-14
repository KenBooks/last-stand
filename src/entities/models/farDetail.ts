// A hero seen from afar drawn from fewer triangles. On High he is about 140k, made for the views that stand beside him;
// from above, or across the hall on his plinth, a triangle of his is a fraction of a pixel, and the frame drew every
// one (from play, in the hall, three heroes in view: "1.3m not expected either"). Past `FAR.out` from the camera each
// of his meshes draws a geometry of the same vertices under an index of fewer triangles (`farIndex`, three's
// meshoptimizer: no vertex moved, so his colours, normals and skin are as they were), and its own again within
// `FAR.back`. A swap of geometry: no program, no material. WebGL's alone (on WebGPU he's merged as he's built,
// `drawAsOne.ts`). `?farDetail=0` draws every triangle at any distance, for A/B.
import * as THREE from 'three';
import { farIndex, shadowDetailVersion, tickDetail } from './shadowDetail';
import { WEBGPU } from '../../core/webgpu';

/** how far from the camera he goes coarse, and how near he comes back whole (m): apart, so he never flips on a line.
 *  The close views stand 3 to 5 m off him; the view from above 18 and more. */
export const FAR = { out: 11, back: 9 };

/** whether heroes go coarse at all (`?farDetail=0`: never; a harness's hold) */
export const farDetailOn = { on: typeof location === 'undefined' || !/[?&]farDetail=0/.test(location.search) };

/** One hero's far detail: told how far the camera is each frame. */
export interface FarDetail {
  /** whether he's drawn coarse now */
  readonly far: boolean;
  /** the meshes that have a coarse geometry */
  readonly meshes: number;
  update(distance: number): void;
  dispose(): void;
}

/** each geometry's coarse one, made once: a shared geometry (a head's) is every hero's */
const coarseOf = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();

/** `geometry`'s vertices under fewer triangles, or null where it has none to spare. */
function coarseGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry | null {
  const known = coarseOf.get(geometry);
  if (known) return known;
  // (none yet where its index is still being made: asked again once `shadowDetailVersion` has moved on)
  const index = farIndex(geometry);
  if (!index) return null;
  const coarse = new THREE.BufferGeometry();
  for (const name of Object.keys(geometry.attributes)) coarse.setAttribute(name, geometry.attributes[name]);
  coarse.setIndex(new THREE.BufferAttribute(index, 1));
  coarse.boundingSphere = geometry.boundingSphere;
  coarse.boundingBox = geometry.boundingBox;
  // (kept with the geometry it's of: let go by nothing, as a shared geometry is)
  coarse.userData.shared = true;
  coarseOf.set(geometry, coarse);
  return coarse;
}

/** Whether `mesh` can draw from fewer triangles: one material that tests no alpha (a card cut by its picture has no
 *  triangles to spare), no morphs, and drawn by the frame (not a shadow's own caster). */
function goesCoarse(mesh: THREE.Mesh): boolean {
  if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || mesh.morphTargetInfluences?.length) return false;
  if (Array.isArray(mesh.material) || mesh.material.alphaTest > 0) return false;
  return !mesh.userData.shadowTwin && mesh.name !== 'shadow cast as one';
}

/** `root`'s meshes (a hero's model) drawn coarse from afar. */
export function farDetail(root: THREE.Object3D): FarDetail {
  /** each mesh that goes coarse, with its own geometry and its coarse one */
  let pairs: [THREE.Mesh, THREE.BufferGeometry, THREE.BufferGeometry][] = [];
  let found = -1;
  let far = false;

  const show = (coarse: boolean): void => {
    for (const [mesh, whole, fewer] of pairs) mesh.geometry = coarse ? fewer : whole;
    far = coarse;
  };

  /** The meshes found again (the simplifier has loaded, a harness's hold): each whole meanwhile. */
  const find = (): void => {
    show(false);
    pairs = [];
    found = shadowDetailVersion();
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!goesCoarse(mesh)) return;
      const fewer = coarseGeometry(mesh.geometry);
      if (fewer) pairs.push([mesh, mesh.geometry, fewer]);
    });
  };

  return {
    get far() { return far; },
    get meshes() { return pairs.length; },
    update(distance) {
      if (WEBGPU) return;
      // (a frame's turn at the geometries still to be simplified, his and his shadow's)
      tickDetail();
      if (found !== shadowDetailVersion()) find();
      const coarse = farDetailOn.on && distance > (far ? FAR.back : FAR.out);
      if (coarse !== far) show(coarse);
    },
    dispose() {
      show(false);
      pairs = [];
    },
  };
}
