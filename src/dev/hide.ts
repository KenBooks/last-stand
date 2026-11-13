// What the developer panel's frame parts take out of what's drawn and put back: by each object's layer, never its
// `visible`, which the world sets again as it likes (a culled mesh's at each frame as its cells come into view, a
// shadow copy's at the shadow map's draw, the village's meadow at every frame by where the camera stands), so a part
// taken out by it came back at once in the village. `HIDDEN_LAYER` is no camera's: the frame and every shadow map
// leave it out, with the same programs and lights. Trees and Grass are what the builders marked (`asTree`, `asGrass`
// in `world/props.ts`), in every place at once, so they hold as the place changes and a run starts.
import * as THREE from 'three';
import { G } from '../state';
import { HIDDEN_LAYER } from '../core/layers';

/** each object taken out, its layers as they were and how many parts took it (a hero's blended hair is the hero's too) */
const out = new Map<THREE.Object3D, { mask: number; by: number }>();

/** `objects` and everything under them taken out of what's drawn (`on` false), or put back as they were. */
export function drawObjects(objects: readonly THREE.Object3D[], on: boolean): void {
  for (const object of objects) {
    object.traverse((part) => {
      const was = out.get(part);
      if (!on) {
        if (was) was.by++;
        else { out.set(part, { mask: part.layers.mask, by: 1 }); part.layers.set(HIDDEN_LAYER); }
      } else if (was && --was.by === 0) {
        part.layers.mask = was.mask;
        out.delete(part);
      }
    });
  }
  // (the braziers', bonfires' and the village's still shadows, drawn only when what stands changes)
  G.arena.stillShadowsChanged();
}

/** whether an object is taken out (a harness's check) */
export const drawnNot = (object: THREE.Object3D): boolean => out.has(object);

/** Every object in every place that `marked` picks, hidden or not (a culled cell, a place not shown). */
export function markedObjects(marked: (object: THREE.Object3D) => boolean): THREE.Object3D[] {
  const found: THREE.Object3D[] = [];
  G.scene.traverse((object) => { if (marked(object)) found.push(object); });
  return found;
}

/** the trees' parts: trunks, branches, leaves, roots */
export const isTree = (object: THREE.Object3D): boolean => object.userData.tree === true;
/** the ground's: grass, foliage, clutter */
export const isGrass = (object: THREE.Object3D): boolean => object.userData.grass === true;
