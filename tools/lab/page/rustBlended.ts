// `lab rust --blended`: what the profiler takes out as "what's blended: smoke, glows, effects" (the shown meshes
// with a see-through material that aren't cut out, flames or particles), by kind: how many, how the engine draws
// each (solid with what's opaque, or blended), how many are in view, and how much of the screen their triangles cover,
// summed, each cut to the screen (2.0: twice the screen's pixels shaded; an instanced mesh's by its box). A phone's profile had 237 of them at 41% of its
// frame (TPRV-JMH7) with nothing saying what they were: counted before anything is built for them.
import * as THREE from 'three';
import type { SeeThrough } from '../../../src/core/seeThrough';
import { RUST } from '../../../src/engine';
import { trianglesCover } from './screenCover';

/** how many kinds are listed */
const LISTED = 24;

/** A kind of blended mesh, as the count has it. */
interface Kind {
  meshes: number;
  inView: number;
  /** the screen covered by the triangles of those in view, summed (1: the whole screen once) */
  cover: number;
  triangles: number;
}

/** Whether the profiler counts `mesh` as blended (`blended` in src/perf/sceneParts.ts). */
function countedBlended(mesh: THREE.Mesh): boolean {
  if (!mesh.isMesh || mesh.userData.fireFlames || mesh.userData.particles) return false;
  const materials = [mesh.material].flat();
  if (materials.some((material) => material.alphaTest > 0)) return false;
  return materials.some((material) => material.transparent);
}

/** How the engine draws a see-through material: with what's opaque, added, or blended (and whether it writes depth). */
function drawnAs(material: THREE.Material): string {
  if (RUST.bridge?.drawnSolid(material)) return 'solid';
  if (material.blending === THREE.AdditiveBlending) return 'added';
  return material.depthWrite ? 'blended' : 'blended, no depth';
}

/** A mesh's name for the count: its own, else the first named thing above it. */
function nameOf(mesh: THREE.Object3D): string {
  for (let above: THREE.Object3D | null = mesh; above; above = above.parent) {
    if (above.name) return above === mesh ? above.name : `in ${above.name}`;
  }
  return '?';
}

const box = new THREE.Box3();
const corner = new THREE.Vector3();
const sphere = new THREE.Sphere();

/** The share of the screen the box of `mesh` covers as `camera` sees it (0 behind it; its instances' box too). */
function coverOf(mesh: THREE.Mesh, camera: THREE.Camera): number {
  const instanced = mesh as THREE.InstancedMesh;
  if (instanced.isInstancedMesh) {
    if (!instanced.boundingBox) instanced.computeBoundingBox();
    box.copy(instanced.boundingBox!);
  } else {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    box.copy(mesh.geometry.boundingBox!);
  }
  if (box.isEmpty()) return 0;
  let [left, right, low, high] = [Infinity, -Infinity, Infinity, -Infinity];
  for (let at = 0; at < 8; at++) {
    corner.set(at & 1 ? box.max.x : box.min.x, at & 2 ? box.max.y : box.min.y, at & 4 ? box.max.z : box.min.z);
    corner.applyMatrix4(mesh.matrixWorld).project(camera);
    // (a corner behind the camera: the box taken as reaching the screen's edges)
    if (corner.z > 1 || corner.z < -1) return 1;
    left = Math.min(left, corner.x);
    right = Math.max(right, corner.x);
    low = Math.min(low, corner.y);
    high = Math.max(high, corner.y);
  }
  const wide = Math.max(0, Math.min(right, 1) - Math.max(left, -1));
  const tall = Math.max(0, Math.min(high, 1) - Math.max(low, -1));
  return (wide * tall) / 4;
}

/** Whether the sphere of `mesh` is in the camera's view. */
function inView(mesh: THREE.Mesh, frustum: THREE.Frustum): boolean {
  if (!mesh.frustumCulled) return true;
  if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
  sphere.copy(mesh.geometry.boundingSphere!).applyMatrix4(mesh.matrixWorld);
  return frustum.intersectsSphere(sphere);
}

/** The triangles `mesh` draws (its instances' too). */
function trianglesOf(mesh: THREE.Mesh): number {
  const geometry = mesh.geometry;
  const one = (geometry.index ? geometry.index.count : geometry.attributes.position?.count ?? 0) / 3;
  return one * ((mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).count : 1);
}

/** The lines of `lab rust --blended`: the blended meshes shown, by how they're drawn and what they are. */
export function blendedSaid(scene: THREE.Scene, camera: THREE.Camera): string[] {
  const frustum = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const kinds = new Map<string, Kind>();
  const byDraw = new Map<string, Kind>();
  const add = (into: Map<string, Kind>, key: string, mesh: THREE.Mesh, seen: boolean): void => {
    const kind = into.get(key) ?? { meshes: 0, inView: 0, cover: 0, triangles: 0 };
    kind.meshes++;
    if (seen) {
      kind.inView++;
      const both = [mesh.material].flat().some((material) => material.side === THREE.DoubleSide);
      kind.cover += trianglesCover(mesh, camera, both) ?? coverOf(mesh, camera);
      kind.triangles += trianglesOf(mesh);
    }
    into.set(key, kind);
  };
  scene.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (!countedBlended(mesh) || !mesh.layers.test(camera.layers)) return;
    const seen = inView(mesh, frustum);
    const drawn = [...new Set([mesh.material].flat().filter((material) => material.transparent).map(drawnAs))].join('+');
    add(byDraw, drawn, mesh, seen);
    const materials = [...new Set([mesh.material].flat().map((material) => material.name || material.type))];
    const sees = [mesh.material].flat().map((material) => (material as { seeThrough?: SeeThrough }).seeThrough);
    const thinned = sees.filter((see) => see).map((see) => `thinned whole by ${see!.whole.value.toFixed(2)}`);
    const said = [...materials.slice(0, 3), ...new Set(thinned)].join(', ');
    add(kinds, `${drawn}: ${nameOf(mesh)} (${said})`, mesh, seen);
  });
  const line = ([key, kind]: [string, Kind]): string =>
    `    ${kind.meshes} x ${key}: ${kind.inView} in view, their triangles ${kind.cover.toFixed(2)} of the screen, `
    + `${Math.round(kind.triangles)} triangles`;
  const byCover = (a: [string, Kind], b: [string, Kind]): number => b[1].cover - a[1].cover || b[1].meshes - a[1].meshes;
  const all = [...byDraw.values()].reduce((sum, kind) => sum + kind.meshes, 0);
  return [
    `  what the profiler takes out as blended: ${all} shown meshes, by how the engine draws them:`,
    ...[...byDraw].sort(byCover).map(line),
    `  and by what they are, the ${LISTED} that cover most:`,
    ...[...kinds].sort(byCover).slice(0, LISTED).map(line),
  ];
}
