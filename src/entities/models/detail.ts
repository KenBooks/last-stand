// Geometry detail for new heroes. Existing stepped builds keep their starting detail across Auto changes.
let detail = 1;
export function setHeroDetail(k: number): void { detail = k; }
export const heroDetail = (): number => detail;
export const lod = (n: number, min = 1): number => Math.max(min, Math.round(n * detail));

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
