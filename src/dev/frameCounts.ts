// What the last frame drew, as the developer mode tells it (the panel's Draws and Tris, an agent's `look`): the
// engine's own counts. three's `renderer.info` counts the overlays' canvas alone now that the engine draws the scene:
// read from it, the panel said "Tris 0k" and an agent's look 0 triangles, with a count of three's renders since the
// page loaded for its draws.
import { G } from '../state';
import { RUST } from '../engine';
import { PIPELINES } from '../engine/pipelinesAside';

/** A frame's counts: its draws (the scene's and the shadow maps'), its triangles, the objects handed to the engine and
 *  how many of them it culled, and the pipelines made so far. */
export interface FrameCounts { draws: number; shadowDraws: number; triangles: number; objects: number; culled: number; pipelines: number }

/** The last frame's counts: the engine's, or three's own where no engine draws (none does before it has booted). */
export function frameCounts(): FrameCounts {
  const stats = RUST.bridge?.stats;
  if (!stats) {
    const info = G.renderer.info;
    return { draws: info.render.calls, shadowDraws: 0, triangles: info.render.triangles, objects: 0, culled: 0, pipelines: info.programs?.length ?? 0 };
  }
  return {
    draws: stats.draws + stats.shadowDraws, shadowDraws: stats.shadowDraws, triangles: stats.triangles,
    objects: stats.objects, culled: stats.culled, pipelines: PIPELINES.made,
  };
}
