// What the scene holds handed to the engine ahead of its first frame: each mesh's geometry, its materials with
// their maps, and the pipeline each will draw with, so a place first shown, a warm-up's sample or a skill's
// effect first cast compiles nothing in the frame it's first drawn in.
import type * as THREE from 'three';
import { perfClock } from '../core/perfClock';
import type { SeeThrough } from '../core/seeThrough';
import type { Core } from './core';
import { lookOf } from './custom';
import type { Geometries } from './geometry';
import type { AnyMaterial, Materials } from './materials';
import { PIPELINES } from './pipelinesAside';

/** the frames `walk` rests after a walk of the whole scene before it looks again */
const AHEAD_REST = 600;

/** Whether `material`'s kind of see-through may be drawn as a layer of which the nearest alone is (`flagsOf` in
 *  seeKinds.ts: a roof's own layers, and a house's part under the houses' rule that isn't a column). */
function mayLayer(material: THREE.Material): boolean {
  const see = (material as THREE.Material & { seeThrough?: SeeThrough }).seeThrough;
  return !!see?.blended && (!!see.oneLayer || (!!see.cover && !see.reach));
}

/** Whether `material` is a column's under the houses' rule: thinned as one, drawn under the layers. */
function standsUnder(material: THREE.Material): boolean {
  const see = (material as THREE.Material & { seeThrough?: SeeThrough }).seeThrough;
  return !!see?.blended && !!see.cover && !!see.reach;
}

/** The rooms' own pipelines (a room's roof and walls drawn in two rounds while he stands in it): whether a walk
 *  of the whole scene has asked for them, and whether they've all compiled since. Till then a room is drawn as
 *  from outside it (`SeeKinds.write`): drawn in two rounds with its pipelines still compiling, the hall was
 *  left out of the frames he walked in on. */
export const ROOMS = { asked: false, ready: false };

export class Ahead {
  private stack: THREE.Object3D[] = [];
  private rest = 0;
  /** whether the loading screens were done with when this walk began (it asks for the rooms' pipelines then),
   *  and whether a walk has begun since they were */
  private late = false;
  private begunLate = false;

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
    const shown = !Number.isFinite(PIPELINES.waitLeft);
    // (the first walk after the loading screens begins at once, not after the rest of the last one's)
    if (shown && !this.begunLate && !this.stack.length) this.rest = 0;
    if (this.rest > 0) { this.rest--; return; }
    const stack = this.stack;
    if (!stack.length) {
      stack.push(scene);
      this.late = shown;
      this.begunLate ||= shown;
    }
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
    if (this.late) ROOMS.asked = true;
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
      if (!id) continue;
      this.core.engine.ready_material(id, skinned, counted);
      // (and its pipelines as a layer of which the nearest alone is drawn, a roof's or a wall's: made at its
      // first draw, they were first asked for in the boot's last step, which waited for them)
      // (and those of the two rounds every layer is drawn in while he stands in a room: once the loading screens
      // are done with, on a later walk, as nothing draws with them till he's in a room, and under the loading
      // screen they were 12 pipelines more for a phone's boot to wait for. Every layer's, not the room's own
      // alone: a cottage's in view from the hall made its own at that draw, and was left out of the frame)
      const apart = this.late;
      if (mayLayer(material)) this.core.engine.ready_material_layers(id, skinned, counted, apart);
      // (and a column's own depth, written before the layers' ghosts while a cover is opened whole: the
      // engine's `draw_under_depth`. With the rooms' own, after the lobby shows)
      else if (this.late && standsUnder(material)) this.core.engine.ready_material_layers(id, skinned, counted, false);
    }
  }
}
