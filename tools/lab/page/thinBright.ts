// How much of a patch of the frame is far brighter than the patch itself: what a sliver too thin for its pixels
// leaves there, lit where what's round it is not (the polished iron of a door's straps and rivets: #912's
// "white lines" on a cottage's door, broken into dots as its width fell under a pixel). No imports: unit tested
// (test/thinBright.test.mjs).

/** the share of a patch's pixels, its brightest, whose mean says how bright its slivers are */
export const TOP_SHARE = 0.005;

/** A patch's brightness: its median, its brightest pixel, the share of its pixels standing out of it, and the mean
 *  of its brightest `TOP_SHARE` (a sliver under a pixel wide lights few pixels, each a little: their share stays
 *  small however bright the sliver, and one hot pixel says nothing; the brightest few together tell it). */
export interface StandsOut { median: number; most: number; share: number; top: number }

/**
 * Of `lights` (each pixel's light, a share of white), the share standing out: brighter than `times` the patch's
 * median and by at least `least` over it (the floor keeps a patch that is all near black from counting its own
 * noise).
 */
export function standsOut(lights: ArrayLike<number>, times: number, least: number): StandsOut {
  const count = lights.length;
  if (!count) return { median: 0, most: 0, share: 0, top: 0 };
  const sorted = Float32Array.from(lights).sort();
  const median = sorted[Math.floor(count / 2)];
  const over = Math.max(median * times, median + least);
  let out = 0;
  for (let i = 0; i < count; i++) {
    if (lights[i] > over) out++;
  }
  const brightest = Math.max(1, Math.round(count * TOP_SHARE));
  let sum = 0;
  for (let i = count - brightest; i < count; i++) sum += sorted[i];
  return { median, most: sorted[count - 1], share: out / count, top: sum / brightest };
}
