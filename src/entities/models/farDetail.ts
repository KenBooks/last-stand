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

/** how many of a hair card's steps along it are drawn as one from afar */
const RIBBON_RUN = 3;
/** the most of its triangles a geometry of cards may keep for its fewer to be worth a geometry */
const RIBBONS_UNDER = 0.8;

/**
 * A geometry of cards cut by their picture (the hair: `hairCard` in `head.ts`, a ribbon of two vertices a step along
 * its lock) under fewer triangles: each `RIBBON_RUN` steps of a ribbon drawn as one, from its first row to its last.
 * A simplifier can't tell what of a card its picture leaves, so `farIndex` isn't asked; a ribbon keeps its width, its
 * ends and its picture's place along it (the rows kept have their own uv), and loses only some of its bend. The
 * warrior's hair is 53k triangles, more than the rest of him from afar. Null where few of its triangles are
 * ribbons'.
 */
function ribbonIndex(geometry: THREE.BufferGeometry): Uint32Array | null {
  const own = geometry.index;
  if (!own) return null;
  const count = own.count;
  // (a ribbon's step from row `a`: the triangles a, a+1, a+3 and a, a+3, a+2; the step after it starts at a+2)
  const stepAt = (i: number): number => {
    if (i + 6 > count) return -1;
    const a = own.getX(i);
    const first = own.getX(i + 1) === a + 1 && own.getX(i + 2) === a + 3;
    const second = own.getX(i + 3) === a && own.getX(i + 4) === a + 3 && own.getX(i + 5) === a + 2;
    return first && second ? a : -1;
  };
  const fewer: number[] = [];
  for (let i = 0; i < count;) {
    const a = stepAt(i);
    if (a < 0) {
      fewer.push(own.getX(i), own.getX(i + 1), own.getX(i + 2));
      i += 3;
      continue;
    }
    let run = 1;
    while (run < RIBBON_RUN && stepAt(i + run * 6) === a + run * 2) run++;
    const b = a + run * 2;
    fewer.push(a, a + 1, b + 1, a, b + 1, b);
    i += run * 6;
  }
  return fewer.length <= count * RIBBONS_UNDER ? Uint32Array.from(fewer) : null;
}

/** `geometry`'s vertices under fewer triangles, or null where it has none to spare; `cards`: cut by a picture. */
function coarseGeometry(geometry: THREE.BufferGeometry, cards: boolean): THREE.BufferGeometry | null {
  const known = coarseOf.get(geometry);
  if (known) return known;
  // (none yet where its index is still being made: asked again once `shadowDetailVersion` has moved on)
  const index = cards ? ribbonIndex(geometry) : farIndex(geometry);
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

/** Whether `mesh` can draw from fewer triangles: one material, no morphs, and drawn by the frame (not a shadow's own
 *  caster). */
function goesCoarse(mesh: THREE.Mesh): boolean {
  if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || mesh.morphTargetInfluences?.length) return false;
  if (Array.isArray(mesh.material)) return false;
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
      const cards = (mesh.material as THREE.Material).alphaTest > 0;
      const fewer = coarseGeometry(mesh.geometry, cards);
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
