// The developer mode's Trees switch: every tree of every biome drawn, or none (the Thornwood's ring of trees and its
// giants, its young oaks in the clearing, the crypt's dead trees beyond the wall and the small ones on its floor with
// their roots; each marked by its builder, `asTree` in `world/props.ts`), to see the fight plainly and what the trees
// cost. Only what's drawn changes: a tree taken out still stands where it stood for bodies, arrows and the foes'
// paths, and a young tree's dark patch on the floor (`contactShadows`) stays to say where.
import { G } from '../state';
import { HIDDEN_LAYER, WORLD_LAYER } from '../core/layers';

let shown = true;

/** Whether the trees are drawn. */
export const treesShown = (): boolean => shown;

/**
 * The trees drawn (`on`) or not, in every biome at once, so it holds as the biome changes and as a run starts. By
 * their layer, which no camera draws: the same programs and the same lights either way, and the shadow maps' draws
 * leave them out with the frame's (a culled mesh's `visible` is the culling's own, set again as its cells come into
 * view, and a shadow copy's the shadow map's). The braziers' and the bonfires' still shadows, drawn only when what
 * stands changes, are drawn again here.
 */
export function setTreesShown(on: boolean): void {
  if (on === shown) return;
  shown = on;
  G.scene.traverse((part) => {
    if (part.userData.tree) part.layers.set(on ? WORLD_LAYER : HIDDEN_LAYER);
  });
  G.arena.stillShadowsChanged();
}
