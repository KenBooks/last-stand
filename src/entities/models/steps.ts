// A model built a piece at a time: its builder a generator that yields between its pieces, so a hero is built behind
// the live lobby a piece a frame (game/hall.ts) where built whole he held a frame up 100 to 170 ms.
import type { Model } from '../../types';
import { perfClock } from '../../core/perfClock.ts';

/** A model's build in pieces: each `next()` builds one, the last returns the model. */
export type ModelSteps = Generator<void, Model, undefined>;

/** The model `steps` build, built whole at once. */
export function built<T>(steps: Generator<void, T, undefined>): T {
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

/** How long a slice of a build goes on before it lets the page go (ms): a number, or read at each slice (a build
 *  behind the live lobby keeps to the lobby's budget while no loading bar is up: game/warmup.ts `behindSlice`). */
export type SliceMs = number | (() => number);

/** Finish a stepped build under a loading screen, yielding only at its existing safe boundaries after a time slice
 *  (by `perfClock`: a harness's clock, where the page's stands still, `lab lobbystart`). A step may yield a promise,
 *  waited for before the next (a worker's head the tavern's keeper is built on): spun round `while (!ready) yield;`
 *  instead, a slice never ended on the lab's clock, the page held in one task and the workers' reply never landed. */
export async function builtInSlices<T>(
  steps: Generator<void | PromiseLike<unknown>, T, undefined>, pause: () => Promise<void>, ms: SliceMs = 12,
  now = () => perfClock.now(),
): Promise<T> {
  let since = now();
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
    if (step.value) {
      await step.value;
      since = now();
      continue;
    }
    if (now() - since < (typeof ms === 'function' ? ms() : ms)) continue;
    await pause();
    since = now();
  }
}

/** A builder of one piece made a build in pieces (a model with no steps of its own). */
export function* inOneStep(build: () => Model): ModelSteps {
  return build();
}
