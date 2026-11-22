// One grass for every view and zoom, as the Rust engine draws the meadow (from play: "we need to have a single grass
// formula, which we will adopt to various devices.... do not change grass depending on viewing angle"). A blade is
// its finest cell's, whatever ring draws it: where it roots, its height, lean and width never change. Each has a
// rank it keeps (0 to 1), and is shown while the share of the grass kept at its distance from the camera is over
// it: all of it within `reach`, less by the distance's power beyond, never under a least share. Zooming out or looking from above only takes
// blades away, one by one, and never changes those left. A blade's rank follows its cell's place in the coarser
// grids (one in four of a grid's cells is the next grid's too, the lowest ranks), so a ring whose cells are twice
// as wide holds every blade still shown where a quarter or fewer are kept, and draws no other. A device's level
// sets the reach and the least share alone.
import { tunable } from '../core/tuning';

/** how far from the camera all the grass is kept (m, at a level that doesn't spread it), the power of the distance
 *  the kept share falls by past it (by its square, a quarter is kept at twice the reach), and the least share kept
 *  however far (from play, of the grass from far above: "just thin the grass and show half the grass"; with none,
 *  a twentieth of the blades were left there, and the meadow read as a mown lawn; a quarter is the far ring's blades
 *  as they were counted, each half as wide) */
export const ONE_GRASS = tunable('oneGrass', { reach: 10, fall: 2, least: 0.25 });

/** the eye's distance the blades are drawn in four segments within (m), and how far the last ring goes on the
 *  ground (m) */
const NEAR = 9;
const FAR = 85;
/** how many rings there are: the first two the finest cells', then each of cells twice as wide as the last */
const RINGS = 5;

/** The distance from the camera past which `level`'s grid holds every blade kept (a quarter of them by level):
 *  none, where the least share kept is more than the grid holds. */
function fromLevel(level: number, reach: number, least: number): number {
  if (level > 0 && least > 0.25 ** level) return Infinity;
  return reach * 4 ** (level / ONE_GRASS.fall);
}

/**
 * Ring `k`'s band on the ground round the camera's foot (m, from and to), the camera `high` m over the ground and
 * the level's reach `reach` and least share `least`: the ring's band of distances from the camera, brought down to the ground. Empty
 * (`to` not past `from`) where the camera stands too high for the ring: from far above the finest rings draw
 * nothing.
 */
export function oneBand(k: number, high: number, reach: number, least: number): { from: number; to: number } {
  const edges = [0, Math.min(NEAR, fromLevel(1, reach, least))];
  for (let level = 1; level < RINGS; level++) edges.push(fromLevel(level, reach, least));
  const onGround = (far: number): number => Math.sqrt(Math.max(0, far * far - high * high));
  const from = onGround(edges[k]);
  const to = Math.min(FAR, onGround(edges[k + 1]));
  return { from, to };
}
