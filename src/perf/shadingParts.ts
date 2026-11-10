// The lit shading's features, each a part the profiler takes out and puts back (`profiler.ts`, after `frameParts`):
// the environment's lookups, the shadows the surfaces take, the fog and the surface maps (normal, roughness,
// metalness, occlusion). Each changes the lit pipelines, made once by its first frame and kept (`holdPipelines`).
// From the owner's phone on WebGPU: the lit shading was 41 ms of a 69 ms frame at Very low (trace 4NS4-8PG2), where
// this PC, drawing the phone's pixels, reads 1 to 4: what of it costs that much is measured on the phone itself.
// WebGL's programs would compile in the frames timed, every one in view each time: timed on WebGPU alone.
import * as THREE from 'three';
import { G } from '../state';
import { WEBGPU } from '../core/webgpu';
import type { ScenePart } from './sceneParts';

/** why these parts aren't timed on WebGL */
const WEBGL_COMPILES = 'timed on WebGPU alone: on WebGL each would compile every program in view, in the frames timed';

/** The scene as these parts change it: its environment as WebGPU holds it too (`oneEnvironment`). */
type Shaded = THREE.Scene & { environmentNode?: unknown };

/** The surface maps a lit material may sample, besides its colour. */
const SURFACE_MAPS = ['normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'] as const;
type SurfaceMap = (typeof SURFACE_MAPS)[number];
type Mapped = THREE.MeshStandardMaterial & Partial<Record<SurfaceMap, THREE.Texture | null>>;

/** Every mesh shown, by what `wanted` picks among them. */
function meshesShown(wanted: (mesh: THREE.Mesh) => boolean): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  G.scene.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && wanted(mesh)) found.push(mesh);
  });
  return found;
}

/** Whether a material is one of three's node materials, whose own nodes may read its maps by reference (the crowds'
 *  kits): a map taken off there was read as null, and the frame threw. */
const nodeMaterial = (material: THREE.Material): boolean =>
  Boolean((material as THREE.Material & { isNodeMaterial?: boolean }).isNodeMaterial);

/** The lit materials shown that sample a surface map, each once: a node material's left as it is (`nodeMaterial`). */
function mappedMaterials(): Mapped[] {
  const found = new Set<Mapped>();
  for (const mesh of meshesShown(() => true)) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials as Mapped[]) {
      const mapped = material.isMeshStandardMaterial && SURFACE_MAPS.some((map) => material[map]);
      if (mapped && !nodeMaterial(material)) found.add(material);
    }
  }
  return [...found];
}

/** A part that takes the scene's environment off (its lookups, every lit pixel's) or gives it back. */
function environmentPart(): ScenePart {
  const scene = G.scene as Shaded;
  const kept = { map: scene.environment, node: scene.environmentNode };
  return {
    name: 'the lit shading\'s environment',
    change: (on) => {
      scene.environment = on ? kept.map : null;
      scene.environmentNode = on ? kept.node : null;
    },
  };
}

/** A part that has the surfaces take no shadow (each lit pixel's look into the sun's map) or take them again. (Taken,
 *  not cast: a light's shadow taken off lets go of its map on WebGPU, and put back drew with it destroyed.) */
function shadowsTakenPart(): ScenePart {
  const takers = meshesShown((mesh) => mesh.receiveShadow);
  return {
    name: `the lit shading's shadows taken (${takers.length})`,
    change: (on) => {
      for (const mesh of takers) mesh.receiveShadow = on;
    },
  };
}

/** A part that takes the fog off or puts it back. */
function fogPart(): ScenePart {
  const fog = G.scene.fog;
  return {
    name: 'the lit shading\'s fog',
    change: (on) => {
      G.scene.fog = on ? fog : null;
    },
  };
}

/** A copy of `material` without its surface maps. */
function unmapped(material: Mapped): Mapped {
  const copy = material.clone() as Mapped;
  for (const map of SURFACE_MAPS) copy[map] = null;
  return copy;
}

/**
 * A part that takes the lit materials' surface maps off (normal, roughness, metalness, occlusion: each a lookup a
 * pixel, the normal's its own sums too) or gives them back: each mesh given a copy of its material without them. (A
 * map set to null on the material itself: WebGPU's node material, made from it once, read it by reference as null,
 * and the frame threw.)
 */
function surfaceMapsPart(): ScenePart {
  const materials = mappedMaterials();
  const copies = new Map(materials.map((material) => [material as THREE.Material, unmapped(material)]));
  const meshes = meshesShown((mesh) => !Array.isArray(mesh.material) && copies.has(mesh.material));
  const kept = meshes.map((mesh) => mesh.material as THREE.Material);
  return {
    name: `the lit shading's surface maps (${materials.length} materials)`,
    change: (on) => {
      meshes.forEach((mesh, index) => {
        mesh.material = on ? kept[index] : copies.get(kept[index])!;
      });
    },
  };
}

/** The lit shading's parts, each named as part of it; untimed on WebGL (`WEBGL_COMPILES`). */
export function shadingParts(): ScenePart[] {
  const parts = [environmentPart(), shadowsTakenPart(), fogPart(), surfaceMapsPart()];
  if (WEBGPU) return parts;
  return parts.map((part) => ({ ...part, untimed: WEBGL_COMPILES }));
}
