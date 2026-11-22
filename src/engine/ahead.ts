// What the scene holds handed to the engine ahead of its first frame: each mesh's geometry, its materials with
// their maps, and the pipeline each will draw with, so a place first shown, a warm-up's sample or a skill's
// effect first cast compiles nothing in the frame it's first drawn in.
import type * as THREE from 'three';
import { perfClock } from '../core/perfClock';
import type { Core } from './core';
import { lookOf } from './custom';
import type { Geometries } from './geometry';
import type { AnyMaterial, Materials } from './materials';

/** the frames `walk` rests after a walk of the whole scene before it looks again */
const AHEAD_REST = 600;

export class Ahead {
  private stack: THREE.Object3D[] = [];
  private rest = 0;

  constructor(private core: Core, private geometries: Geometries, private materials: Materials) {}

  /**
   * What the scene holds that the engine hasn't met handed over ahead of its first frame, hidden or not, for up to
   * `budget` ms a call: each mesh's geometry, its materials with their maps, and the pipeline each will draw with.
   * A place first shown handed everything over in its first frame, and the browser compiled each pipeline as it was
   * first drawn with: the village's first frame after the hero was picked waited 1.3 s on the GPU with no script
   * running, and the loading screen 5.7 s (a report from play, Q8CV-74H0). Walks the whole scene a part a call, then
   * rests `AHEAD_REST` frames before looking again (the battlegrounds are built later, at Start).
   */
  walk(scene: THREE.Scene, budget: number): void {
    if (this.rest > 0) { this.rest--; return; }
    const stack = this.stack;
    if (!stack.length) stack.push(scene);
    const until = perfClock.now() + budget;
    let visited = 0;
    while (stack.length) {
      // (the clock read once every few objects: most are met already, and cost less than reading it)
      if (++visited % 16 === 0 && perfClock.now() >= until) return;
      const object = stack.pop()!;
      if ((object as THREE.Mesh).isMesh) this.prepareMesh(object as THREE.Mesh);
      const children = object.children;
      for (let i = 0; i < children.length; i++) stack.push(children[i]);
    }
    this.rest = AHEAD_REST;
  }

  /** `objects` and all under them handed over ahead with the pipelines they'll draw with, shown or not and in
   *  the scene or not: a warm-up's samples (core/shaders.ts), which the scene's walk never meets. A skill's
   *  effect first met as it was cast compiled its pipeline in that frame, 2 to 4 s from play. */
  prepare(objects: readonly THREE.Object3D[]): void {
    for (const object of objects) {
      object.traverse((part) => { if ((part as THREE.Mesh).isMesh) this.prepareMesh(part as THREE.Mesh); });
    }
  }

  /** A mesh's geometry, materials and pipelines made ready, as `addMesh` would meet them. */
  private prepareMesh(mesh: THREE.Mesh): void {
    if (mesh.userData.particles || mesh.name === 'dazed stars') return;
    const geometry = mesh.geometry;
    const single = Array.isArray(mesh.material) ? undefined : mesh.material;
    const look = single ? lookOf(single) : undefined;
    const counted = (geometry as THREE.InstancedBufferGeometry).isInstancedBufferGeometry;
    if (counted && !look) return;
    if (!this.geometries.geometryId(geometry, look?.position)) return;
    const skinned = !!(mesh as THREE.SkinnedMesh).isSkinnedMesh;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material) continue;
      const id = this.materials.materialId(material as AnyMaterial);
      if (id) this.core.engine.ready_material(id, skinned, counted);
    }
  }
}
