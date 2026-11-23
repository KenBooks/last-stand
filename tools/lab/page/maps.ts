// `lab maps`: the game's procedural maps (`PRELOAD` in src/core/pbr.ts), each made on the page as a worker makes it,
// timed by the browser's own clock, and a digest of its pixels (and of a face's grid, which its head is built on). A
// first visit makes every one before the lobby shows what it needs (30 s of the workers' CPU, the forest floor alone
// 5 s), so a map made faster must keep every pixel: with `--ab`, each digest matches main's, and the times are side
// by side. Each map a surface repeats must tile: its seams (page/mapSeams.ts) fail the command. Its means (the
// albedo's brightness, the roughness) show a new look's drift from main's, and `--pictures` shows each as a surface
// takes it (page/mapPictures.ts). `--canary` changes a byte of the first map's pixels after it's made (its digest
// must change) and plants a seam in a copy of it (it must be found).
import type { Lab, Pictured, Report } from './lab';
import * as pbr from '../../../src/core/pbr';
import { PRELOAD, RECIPES, recipeKey, type PBRData, type RecipeName } from '../../../src/core/pbr';
import { seamsOf, withRamp, type EdgeStep } from './mapSeams';

export interface MapsOptions {
  /** the recipes made, by name (every one `PRELOAD` lists by default) */
  maps?: string[];
  /** how many times each is made: its time is the fastest */
  runs: number;
  /** picture each map (page/mapPictures.ts) */
  pictures: boolean;
  canary: boolean;
}

/** One map made: its key, its size, its digest, its fastest time (ms), its seams (none read for a map not repeated)
 *  and its means. */
interface Made {
  key: string;
  size: string;
  digest: string;
  ms: number;
  seams: EdgeStep[];
  means: { albedo: number; rough: number };
}

/** the maps no surface repeats: a face is painted on its head's grid once */
const NOT_REPEATED: RecipeName[] = ['face'];

/** FNV-1a's offset and prime (32 bits) */
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** `bytes` folded into the digest `hash` (FNV-1a). */
function folded(hash: number, bytes: Uint8Array): number {
  let h = hash;
  for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], FNV_PRIME);
  return h >>> 0;
}

/** A typed array's bytes, as they lie in its buffer. */
function bytesOf(array: ArrayBufferView): Uint8Array {
  return new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
}

/** The digest of a map's pixels, and of its grid where it has one (a face's), as 8 hex digits. */
function digestOf(data: PBRData): string {
  const arrays: ArrayBufferView[] = [data.albedo, data.normal, data.rough];
  if (data.grid) arrays.push(data.grid.az, data.grid.el, data.grid.r, data.grid.p);
  const hash = arrays.reduce((h, array) => folded(h, bytesOf(array)), FNV_OFFSET);
  return hash.toString(16).padStart(8, '0');
}

/** A map's means, 0-1: its albedo's brightness (Rec. 709's weights on its sRGB) and its roughness (the green). */
function meansOf(data: PBRData): Made['means'] {
  let albedo = 0;
  let rough = 0;
  for (let k = 0; k < data.albedo.length; k += 4) {
    albedo += 0.2126 * data.albedo[k] + 0.7152 * data.albedo[k + 1] + 0.0722 * data.albedo[k + 2];
    rough += data.rough[k + 1];
  }
  const count = (data.albedo.length / 4) * 255;
  return { albedo: albedo / count, rough: rough / count };
}

/** The jobs `options.maps` names, in `PRELOAD`'s order (every one by default); an error for a name it lacks. */
function jobsOf(options: MapsOptions): (typeof PRELOAD)[number][] {
  if (!options.maps?.length) return PRELOAD;
  const known = new Set<string>(PRELOAD.map(([name]) => name));
  const unknown = options.maps.filter((name) => !known.has(name));
  if (unknown.length) throw new Error(`lab: maps: no map named ${unknown.join(', ')} (${[...known].join(', ')})`);
  return PRELOAD.filter(([name]) => options.maps!.includes(name));
}

/** `name(args)` made `runs` times: the last one's data and the fastest time (ms, the browser's own clock). */
function made(name: RecipeName, args: readonly unknown[], runs: number): { data: PBRData; ms: number } {
  const recipe = RECIPES[name] as (...a: unknown[]) => PBRData;
  let data: PBRData | null = null;
  let fastest = Infinity;
  for (let run = 0; run < runs; run++) {
    const start = window.__labClock.realNow();
    data = recipe(...args);
    fastest = Math.min(fastest, window.__labClock.realNow() - start);
  }
  return { data: data!, ms: fastest };
}

/** How many times the median step inside an edge's mean step is. */
const overMedian = (found: EdgeStep): number => found.step.across / Math.max(found.step.median, 1e-6);

/** Of `seams`, the edge's reads furthest over the lines' inside: the step over the median, and the jumps. */
function worstAcross(seams: EdgeStep[], edge: EdgeStep['edge']): { step: EdgeStep; jumps: EdgeStep } {
  const reads = seams.filter((found) => found.edge === edge);
  const worse = (more: (a: EdgeStep, b: EdgeStep) => boolean) => reads.reduce((w, read) => (more(read, w) ? read : w));
  return {
    step: worse((a, b) => overMedian(a) > overMedian(b)),
    jumps: worse((a, b) => a.jumps.across - a.jumps.most > b.jumps.across - b.jumps.most),
  };
}

/** A share as a percentage. */
const percent = (share: number): string => `${(share * 100).toFixed(1)}%`;

/** A map's seams as a line: each edge's worst step over the median inside, the share of it that jumps against the
 *  most of a line inside, and the seams found. */
function seamLine(result: Made): string {
  const edges = (['u', 'v'] as const).map((edge) => {
    const { step, jumps } = worstAcross(result.seams, edge);
    const jumped = `${percent(jumps.jumps.across)} jumps (${jumps.channel}, ${percent(jumps.jumps.most)} inside)`;
    return `${edge} ${overMedian(step).toFixed(2)}x (${step.channel}), ${jumped}`;
  });
  const found = result.seams.filter((read) => read.seam).map((read) => `${read.channel} across ${read.edge}`);
  return `  ${result.key}: ${edges.join('; ')}${found.length ? `: a seam, ${found.join(', ')}` : ''}`;
}

/** A seam found, as a problem: what it read on the edge against the lines inside. */
function seamProblem(key: string, found: EdgeStep): string {
  const { step, jumps } = found;
  const steps = `steps ${step.across.toFixed(1)} across the edge, ${overMedian(found).toFixed(1)}x the median inside`;
  const jumped = `${percent(jumps.across)} of it jumps (the most of a line inside ${percent(jumps.most)})`;
  return `maps: ${key} has a seam across ${found.edge}: its ${found.channel} ${steps}, ${jumped}`;
}

/** A map's means as a line. */
function meansLine({ key, means }: Made): string {
  return `  ${key}: albedo ${means.albedo.toFixed(3)}, rough ${means.rough.toFixed(3)}`;
}

/** The canary's two plants in the first map made: a changed byte its digest must show, and a seam (a ramp across
 *  u, in a copy) its seams must find. Its lines, and the problems where either went unseen. */
function canaryOf(key: string, data: PBRData, digest: string): { lines: string[]; problems: string[] } {
  const ramped = seamsOf(withRamp(data)).some((step) => step.edge === 'u' && step.seam);
  data.albedo[0] ^= 1;
  const changed = digestOf(data) !== digest;
  data.albedo[0] ^= 1;
  const lines = [
    `canary: a byte of ${key} changed ${changed ? 'caught' : 'went unseen'}`,
    `canary: a ramp across u planted in ${key} ${ramped ? 'found as a seam' : 'went unseen'}`,
  ];
  const problems: string[] = [];
  if (!changed) problems.push(`maps: the canary's changed byte in ${key} went unseen`);
  if (!ramped) problems.push(`maps: the canary's ramp in ${key} was found no seam`);
  return { lines, problems };
}

/** `lab maps`: each map made, its digest, seams, means and time, its pictures, and the canary's verdict. */
export async function maps(lab: Lab, options: MapsOptions): Promise<Report> {
  const runs = Math.max(1, Math.round(options.runs));
  const results: Made[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  const canaryLines: string[] = [];
  // (an A/B's other side may take no photos: its pbr.ts has no `photosFor`)
  const photosFor = (pbr as Partial<typeof pbr>).photosFor;
  for (const [name, args] of jobsOf(options)) {
    await photosFor?.(name);
    const { data, ms } = made(name, args, runs);
    const key = recipeKey(name, args);
    const digest = digestOf(data);
    const size = `${data.size}x${data.height ?? data.size}`;
    const seams = NOT_REPEATED.includes(name) ? [] : seamsOf(data);
    results.push({ key, size, digest, ms, seams, means: meansOf(data) });
    for (const step of seams.filter((found) => found.seam)) problems.push(seamProblem(key, step));
    if (options.pictures) {
      const { groupOf, picturesOf } = await import('./mapPictures');
      moments.push({ label: `${groupOf(name)}: ${key}`, tiles: await picturesOf(lab, name, data), notes: [size] });
    }
    if (!options.canary || canaryLines.length || !seams.length) continue;
    const canary = canaryOf(key, data, digest);
    canaryLines.push(...canary.lines);
    problems.push(...canary.problems);
  }
  const total = results.reduce((sum, result) => sum + result.ms, 0);
  const lines = [
    `maps: ${results.length} made, ${(total / 1000).toFixed(2)} s in all (each the fastest of ${runs})`,
    ...results.map((result) => `  ${result.key}: ${result.size}, pixels ${result.digest}`),
    'their seams (each edge\'s step over the median step inside, on its worse channel):',
    ...results.filter((result) => result.seams.length).map(seamLine),
    'their means (0-1):',
    ...results.map(meansLine),
    'their times, ms:',
    ...results.map((result) => `  ${result.key} ${Math.round(result.ms)}`),
    ...canaryLines,
  ];
  return { text: lines.join('\n'), problems, moments: moments.length ? moments : undefined };
}
