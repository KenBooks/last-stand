// A geometry's triangles under fewer (three's meshoptimizer: the vertices kept as they are, an index of fewer
// triangles over them), from its index and positions alone: made on the page or in a worker (`simplify.worker.ts`),
// the same either way. `shadowDetail.ts` says what for.

/** what to keep: the share of the triangles, how far from the surface a kept triangle may lie (m), and the same for the
 *  grid a piece falls back to */
export interface Detail {
  share: number;
  error: number;
  sloppy: number;
}

/** the most of its triangles a simplified piece may keep to be worth keeping */
const WORTH_UNDER = 0.8;

export type Simplifier = typeof import('three/addons/libs/meshopt_simplifier.module.js').MeshoptSimplifier;

/** `index`'s triangles over `positions` (three floats a vertex) simplified to `detail`, or null where they give up too
 *  few. */
export function simplifiedIndex(simplify: Simplifier, index: Uint32Array, positions: Float32Array,
  detail: Detail): Uint32Array | null {
  const count = index.length;
  const target = Math.max(3, Math.floor((count / 3) * detail.share) * 3);
  let [fewer] = simplify.simplify(index, positions, 3, target, detail.error, ['ErrorAbsolute']);
  // (a piece of faces that share no vertices, each its own normals', gives up few that way: by a grid of its points
  // then, which keeps its outline and its vertices' normals and nothing of its faces' edges)
  if (fewer.length > target * 1.6) {
    const scale = Math.max(simplify.getScale(positions, 3), 1e-6);
    const [sloppy] = simplify.simplifySloppy(index, positions, 3, null, target, detail.sloppy / scale);
    // (unless it gave up most of the piece: a thin one falls into a cell or two of the grid)
    if (sloppy.length >= target * 0.6) fewer = sloppy;
  }
  return fewer.length <= count * WORTH_UNDER ? fewer.slice() : null;
}
