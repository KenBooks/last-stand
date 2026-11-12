// Geometry detail for new heroes. Existing stepped builds keep their starting detail across Auto changes.
let detail = 1;
export function setHeroDetail(k: number): void { detail = k; }
export const heroDetail = (): number => detail;
/** the detail under which each piece's least (`lod`'s `min`) comes down with it: Low's. At Low most pieces were at
 *  their least already, so Very low's fifth of the detail drew as many triangles as Low's third (from play: "wayy
 *  too much detail" at Very low) */
const FLOORS_FROM = 0.35;
/** `n` scaled by the detail level, at least `min`; below `FLOORS_FROM` the least comes down too, by the detail's share
 *  of it, though never under 3 (a ring of 3 is still round enough from the game's cameras) where `min` was more */
export const lod = (n: number, min = 1): number => {
  const least = detail >= FLOORS_FROM ? min : Math.max(Math.min(min, 3), Math.round(min * (detail / FLOORS_FROM)));
  return Math.max(least, Math.round(n * detail));
};
/** whether the heroes are built at Low's detail or finer: below it (Very low), a piece too small for the game's
 *  cameras to make out is left off */
export const finest = (): boolean => detail >= FLOORS_FROM;

/** Restore the live preset before yielding: two builds can use different details in the same frame. */
export function* atHeroDetail<T>(steps: Generator<void, T, undefined>, at: number): Generator<void, T, undefined> {
  for (;;) {
    const previous = detail;
    let step: IteratorResult<void, T>;
    try { detail = at; step = steps.next(); }
    finally { detail = previous; }
    if (step.done) return step.value;
    yield;
  }
}
