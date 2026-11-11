// A model built a piece at a time: its builder a generator that yields between its pieces, so a hero is built behind
// the live lobby a piece a frame (game/hall.ts) where built whole he held a frame up 100 to 170 ms.
import type { Model } from '../../types';

/** A model's build in pieces: each `next()` builds one, the last returns the model. */
export type ModelSteps = Generator<void, Model, undefined>;

/** The model `steps` build, built whole at once. */
export function built<T>(steps: Generator<void, T, undefined>): T {
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

/** Finish a stepped build under a loading screen, yielding only at its existing safe boundaries after a time slice. */
export async function builtInSlices<T>(
  steps: Generator<void, T, undefined>, pause: () => Promise<void>, ms = 12, now = () => performance.now(),
): Promise<T> {
  let since = now();
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
    if (now() - since < ms) continue;
    await pause();
    since = now();
  }
}

/** A builder of one piece made a build in pieces (a model with no steps of its own). */
export function* inOneStep(build: () => Model): ModelSteps {
  return build();
}
