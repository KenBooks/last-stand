// The frame's time on the GPU by its parts, as the engine times them (Bulwark, gpu/parts.rs): every pass stamped at
// its start and its end and the scene drawn as a pass for each run of its draws of one kind by one shader, all in
// the one frame with nothing taken out, so the parts add up to the frame. The profile's other lines take a part out
// and put it back in turns: their parts overlap, and one of them named smoke and glows was the village's walls
// (last-stand#834). From the owner: "we need to know ALL our render breakdowns".
import { RUST } from '../engine';

/** how many frames broken down a reading is the median of, and the most of the browser's frames it waits for them */
const FRAMES = 24;
const MOST_WAITED = 600;
/** a row under this many ms isn't listed */
const LISTED_FROM = 0.05;
/** the engine's name for its pass that draws nothing */
const PASS_ALONE = 'a pass that draws nothing';

/** The frame's parts as read: each part's median time (ms) by its name, of it what each of the page's shaders
 *  took, and how many frames they're of. */
export interface GpuParts {
  parts: { name: string; ms: number }[];
  /** a part's time by a shader of the page's that drew in it (the ground's, the grass's...) */
  shaders: { part: string; shader: string; ms: number }[];
  frames: number;
  /** how many passes a frame broken down was drawn in */
  passes: number;
}

/** A row of the breakdown: a part, or a part's draws by one shader. The rows add up to the frame broken down. */
export interface PartRow { name: string; ms: number; share: number }

const medianOf = (values: number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

/**
 * The frame drawn broken down until `FRAMES` of them have been timed: `draw` once in each of the browser's frames
 * (`nextFrame`), the engine breaking down each whose times aren't on their way and drawing the others as they are
 * (the GPU kept drawing meanwhile). Nothing where the engine isn't drawing or the browser gives it no timestamps.
 */
export async function gpuParts(draw: () => void, nextFrame: () => Promise<void>,
  cancelled: () => boolean = () => false): Promise<GpuParts | undefined> {
  const bridge = RUST.bridge;
  const levels = bridge?.levels;
  if (!bridge || !levels || levels.gpuClock().reads === 0) return undefined;
  const names = levels.breakdownNames();
  const read: number[][] = names.map(() => []);
  /** each part's shaders' times, frame by frame, keyed by the part's place and the shader's id */
  const byShader = new Map<string, number[]>();
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
      for (const one of levels.breakdownByShader()) {
        const key = `${one.part} ${one.shader}`;
        byShader.set(key, [...(byShader.get(key) ?? []), one.ms]);
      }
    }
  } finally {
    levels.setBreakdown(false);
  }
  const frames = read[0].length;
  if (!frames) return undefined;
  const shaderNames = bridge.shaderNames();
  const shaders = [...byShader].map(([key, times]) => {
    const [part, shader] = key.split(' ').map(Number);
    // (a shader that drew in some of the frames alone: nothing in the others)
    const all = [...times, ...new Array<number>(Math.max(0, frames - times.length)).fill(0)];
    return { part: names[part], shader: shaderNames.get(shader) ?? `shader ${shader}`, ms: medianOf(all) };
  });
  return { parts: names.map((name, part) => ({ name, ms: medianOf(read[part]) })), shaders, frames, passes };
}

/** The breakdown's rows, the largest first: each part, and in place of a part the page's shaders drew in, a row for
 *  each of them and one for what's left of it (the engine's own shader). The pass that draws nothing isn't one. */
export function partRows(found: GpuParts): PartRow[] {
  const rows: { name: string; ms: number }[] = [];
  for (const part of found.parts.filter((one) => one.name !== PASS_ALONE)) {
    const own = found.shaders.filter((one) => one.part === part.name);
    const theirs = own.reduce((all, one) => all + one.ms, 0);
    for (const one of own) rows.push({ name: `${part.name}: ${one.shader}`, ms: one.ms });
    const left = part.ms - theirs;
    if (!own.length) rows.push(part);
    else if (left >= LISTED_FROM) rows.push({ name: `${part.name}: the engine's own shader`, ms: left });
  }
  const sum = rows.reduce((all, row) => all + row.ms, 0);
  const listed = rows.filter((row) => row.ms >= LISTED_FROM).sort((a, b) => b.ms - a.ms);
  return listed.map((row) => ({ ...row, share: sum > 0 ? (100 * row.ms) / sum : 0 }));
}

/** A reading as a report's lines: what the parts add up to against the frame as it is (`whole`, ms), then each row
 *  the largest first with its share of that sum, and what one pass costs by itself. */
export function gpuPartsLines(found: GpuParts, whole: number): string[] {
  const sum = found.parts.reduce((all, part) => all + part.ms, 0);
  const alone = found.parts.find((part) => part.name === PASS_ALONE)?.ms ?? 0;
  return [
    `the frame by its parts, each timed within the one frame (the median of ${found.frames} frames): they add up to `
      + `${sum.toFixed(1)} ms, the frame as it is ${whole.toFixed(1)} (broken down it is ${found.passes} passes, the `
      + `scene a pass for each run of its draws of one kind by one shader; a pass that draws nothing costs `
      + `${alone.toFixed(2)} ms here)`,
    ...partRows(found).map((row) => `  ${row.name}: ${row.ms.toFixed(2)} ms, ${row.share.toFixed(0)}%`),
  ];
}
