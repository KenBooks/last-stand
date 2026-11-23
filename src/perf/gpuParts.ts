// The frame's time on the GPU by its parts, as the engine times them (Bulwark, gpu/parts.rs): every pass stamped at
// its start and its end and the scene drawn as a pass for each kind of its draws, all in the one frame with nothing
// taken out, so the parts add up to the frame. The profile's other lines take a part out and put it back in turns:
// their parts overlap, and one of them named smoke and glows was the village's walls (last-stand#834). From the
// owner: "we need to know ALL our render breakdowns".
import { RUST } from '../engine';

/** how many frames broken down a reading is the median of, and the most of the browser's frames it waits for them */
const FRAMES = 24;
const MOST_WAITED = 600;
/** a part under this many ms isn't listed */
const LISTED_FROM = 0.05;
/** the engine's name for its pass that draws nothing */
const PASS_ALONE = 'a pass that draws nothing';

/** The frame's parts as read: each part's median time (ms) by its name, and how many frames they're of. */
export interface GpuParts {
  parts: { name: string; ms: number }[];
  frames: number;
  /** how many passes a frame broken down was drawn in */
  passes: number;
}

const medianOf = (values: number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

/**
 * The frame drawn broken down until `FRAMES` of them have been timed: `draw` once in each of the browser's frames
 * (`nextFrame`), the engine breaking down each whose times aren't on their way and drawing the others as they are
 * (the GPU kept drawing meanwhile). Nothing where the engine isn't drawing or the browser gives it no timestamps.
 */
export async function gpuParts(draw: () => void, nextFrame: () => Promise<void>,
  cancelled: () => boolean = () => false): Promise<GpuParts | undefined> {
  const levels = RUST.bridge?.levels;
  if (!levels || levels.gpuClock().reads === 0) return undefined;
  const names = levels.breakdownNames();
  const read: number[][] = names.map(() => []);
  let passes = 0;
  levels.setBreakdown(true);
  try {
    let reads = levels.breakdown().reads;
    for (let waited = 0; waited < MOST_WAITED && read[0].length < FRAMES && !cancelled(); waited++) {
      await nextFrame();
      draw();
      const now = levels.breakdown();
      if (now.reads === reads) continue;
      reads = now.reads;
      passes = now.passes;
      now.ms.forEach((ms, part) => read[part].push(ms));
    }
  } finally {
    levels.setBreakdown(false);
  }
  if (!read[0].length) return undefined;
  return { parts: names.map((name, part) => ({ name, ms: medianOf(read[part]) })), frames: read[0].length, passes };
}

/** A reading as a report's lines: what the parts add up to against the frame as it is (`whole`, ms), then each part
 *  the largest first with its share of that sum, and what one pass costs by itself. */
export function gpuPartsLines(found: GpuParts, whole: number): string[] {
  const sum = found.parts.reduce((all, part) => all + part.ms, 0);
  const alone = found.parts.find((part) => part.name === PASS_ALONE)?.ms ?? 0;
  const listed = found.parts.filter((part) => part.ms >= LISTED_FROM && part.name !== PASS_ALONE);
  listed.sort((a, b) => b.ms - a.ms);
  const share = (ms: number): string => (sum > 0 ? ((100 * ms) / sum).toFixed(0) : '0');
  return [
    `the frame by its parts, each timed within the one frame (the median of ${found.frames} frames): they add up to `
      + `${sum.toFixed(1)} ms, the frame as it is ${whole.toFixed(1)} (broken down it is ${found.passes} passes, the `
      + `scene a pass for each run of its draws of one kind; a pass that draws nothing costs ${alone.toFixed(2)} ms here)`,
    ...listed.map((part) => `  ${part.name}: ${part.ms.toFixed(2)} ms, ${share(part.ms)}%`),
  ];
}
