// A fire's flames as the see-through hole round the line to the hero reaches them (core/seeThrough.ts). The hole
// ends in a plane across the view, short of the hero; the flames, a box marched in its shader, faded each pixel by
// its own place on the box's faces, so where that plane crossed the box the fire was cut in two (the owner: "a plane
// that cuts the fire in two parts.. it will cut in different parts depending on angle"). They fade as one now, by
// the fade along the view through their middle. Read: the flames alone drawn with the hole's end across the box's
// near faces, short of every point their fade is taken at (so faded not at all now, and on the near side alone
// before), and without the hole, and each pixel's light kept between the two, in linear light; the share of the
// flames' pixels whose kept light is off the median's is the split. The canary plants a split in the reading
// itself: half the frame's flames dimmed, which must be caught.

/** a flame's pixel: lit past this many levels (of 255) over the empty frame on its brightest channel, unfaded */
const FLAME_LEAST = 30;
/** a pixel is off the fade's median past this much of its light kept */
const OFF_MEDIAN = 0.2;
/** the share of the flames' pixels off the median at most */
const OFF_MOST = 0.05;
/** fewer flame pixels than this say nothing */
const FLAMES_LEAST = 400;
/** the canary's dimming of the frame's left half */
const CANARY_DIM = 0.3;

/** The three frames the reading compares: the flames alone faded, unfaded, and none of it drawn. */
export interface FadeFrames {
  faded: ImageData;
  unfaded: ImageData;
  empty: ImageData;
}

/** The flames' pixels, the median of their light kept, and the share of them off it. */
export interface FadeReading {
  flames: number;
  median: number;
  off: number;
}

/** A level (of 255) as linear light. */
const linear = (level: number): number => (level / 255) ** 2.2;

/** The brightest channel of pixel `i` (its first channel's index) of `image` over `empty`'s, in levels. */
function lightOver(image: ImageData, empty: ImageData, i: number): number {
  const steps = [0, 1, 2].map((c) => image.data[i + c] - empty.data[i + c]);
  return Math.max(0, ...steps);
}

/** The same in linear light. */
function linearOver(image: ImageData, empty: ImageData, i: number): number {
  const steps = [0, 1, 2].map((c) => linear(image.data[i + c]) - linear(empty.data[i + c]));
  return Math.max(0, ...steps);
}

/** Whether pixel `i` lies in the left half of an image `width` wide. */
const onTheLeft = (i: number, width: number): boolean => (i / 4) % width < width / 2;

/** Each flame pixel's light kept from `unfaded` to `faded` (the canary's planted split dimming the left half). */
function keptShares(frames: FadeFrames, canary: boolean): number[] {
  const { faded, unfaded, empty } = frames;
  const kept: number[] = [];
  for (let i = 0; i < unfaded.data.length; i += 4) {
    const whole = lightOver(unfaded, empty, i);
    if (whole <= FLAME_LEAST) continue;
    const dim = canary && onTheLeft(i, unfaded.width) ? CANARY_DIM : 1;
    kept.push(Math.min(linearOver(faded, empty, i) * dim / linearOver(unfaded, empty, i), 1.5));
  }
  return kept;
}

/** The middle of `values` (sorted in place). */
function medianOf(values: number[]): number {
  values.sort((a, b) => a - b);
  return values.length ? values[Math.floor(values.length / 2)] : 0;
}

/** The fade read from `frames`. */
export function readFade(frames: FadeFrames, canary: boolean): FadeReading {
  const kept = keptShares(frames, canary);
  const median = medianOf(kept);
  const off = kept.filter((share) => Math.abs(share - median) > OFF_MEDIAN).length;
  return { flames: kept.length, median, off: kept.length ? off / kept.length : 0 };
}

/** The reading as a line, and its problems (the canary's: it must find the split it planted). */
export function fadeFound(reading: FadeReading, canary: boolean): { line: string; problems: string[] } {
  const offShare = `${(reading.off * 100).toFixed(1)}%`;
  const line = `  the see-through hole's end across it: its flames keep ${reading.median.toFixed(2)} of their light, `
    + `${offShare} of their ${reading.flames} pixels off that by over ${OFF_MEDIAN}`;
  if (reading.flames < FLAMES_LEAST) return { line, problems: [`the flames drew only ${reading.flames} pixels`] };
  const split = reading.off > OFF_MOST;
  if (canary) return { line, problems: split ? [] : ['canary: the flames dimmed on one side went unseen'] };
  const problems = split ? [`the see-through hole cuts the flames in two (${offShare} of them apart)`] : [];
  return { line, problems };
}
