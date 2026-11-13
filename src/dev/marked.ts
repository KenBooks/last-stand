// The developer mode's Trees, Leaves and Grass checkboxes: what a builder marked as one of them, in every biome and the
// village at once, drawn or not, to see the fight plainly and what each costs (the panel's Profile this spot times
// them). Trees: the Thornwood's ring of trees and its giants, its young oaks in the clearing, the crypt's dead trees
// beyond the wall and the small ones on its floor with their roots (`asTree` in `world/props.ts`). Leaves: every mesh
// drawn in a leaves' material, the trees' leaf cards, the ferns, the fallen leaves, the ivy (`asLeaves`). Grass: the
// Thornwood's tufts, the crypt's weeds, the village's meadow (`asGrass`). Only what's drawn changes: a tree taken out
// still stands where it stood for bodies, arrows and the foes' paths, and a young tree's dark patch on the floor
// (`contactShadows`) stays to say where.
import * as THREE from 'three';
import { G } from '../state';
import { HIDDEN_LAYER } from '../core/layers';
import { materialsOf } from '../perf/sceneParts';

/** What a checkbox takes out: a mark a builder set. */
export type Mark = 'tree' | 'leaves' | 'grass';

/** the marks taken out now */
const hidden = new Set<Mark>();
/** each object taken out, and the layers it had: given back as the last mark on it is put back */
const layersBefore = new Map<THREE.Object3D, number>();

/** Whether `object` bears `mark` (leaves by their material: a tree's leaf cards are merged and culled anew). */
function bears(object: THREE.Object3D, mark: Mark): boolean {
  if (mark !== 'leaves') return Boolean(object.userData[mark]);
  const mesh = object as THREE.Mesh;
  return Boolean(mesh.isMesh) && materialsOf(mesh).some((material) => material.userData.leaves);
}

/** Whether what bears `mark` is drawn. */
export const markedShown = (mark: Mark): boolean => !hidden.has(mark);

/**
 * What bears `mark` drawn (`on`) or not, everywhere at once, so it holds as the biome changes and as a run starts. By
 * its layer, which no camera draws: the same programs and the same lights either way, and the shadow maps' draws leave
 * it out with the frame's (a culled mesh's `visible` is the culling's own, set again as its cells come into view, and
 * a shadow copy's the shadow map's). The still shadows, drawn only when what stands changes, are drawn again here.
 */
export function setMarkedShown(mark: Mark, on: boolean): void {
  if (on === markedShown(mark)) return;
  if (on) hidden.delete(mark);
  else hidden.add(mark);
  G.scene.traverse((object) => {
    if (!bears(object, mark)) return;
    if (!on) {
      if (!layersBefore.has(object)) layersBefore.set(object, object.layers.mask);
      object.layers.set(HIDDEN_LAYER);
      return;
    }
    // (a tree's leaves bear two marks: back only once neither is taken out)
    if ([...hidden].some((other) => bears(object, other))) return;
    object.layers.mask = layersBefore.get(object) ?? object.layers.mask;
    layersBefore.delete(object);
  });
  G.arena.stillShadowsChanged();
}
