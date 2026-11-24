// tools/lab match --fit: a rest through the eyes fitted to a reference's screenshot. The tunable values named (a
// rest's place on the screen and its way, say) are searched (Nelder-Mead) for the frame whose weapon, as framed
// (inFrame.ts), comes nearest the reference's marks: where it comes in, where it ends or leaves the frame, how wide
// it is, the part of the frame it covers, the outlines of the weapon and the fist. Placed by hand, a rest's six
// numbers took dozens of rounds of a command a weapon, and a change of 3% across moved its tip 8% down the frame's
// edge.
import type { Lab, Fixture } from './lab';
import { framed, type Box, type Framed, type Place } from './inFrame';

/** What a reference marks of its weapon, as the frame measure reads the hero's (match.mjs `readReference`), as
 *  far as a fit is to come near it (`--fit-to`): its line, its width, the part of the frame it covers. */
export interface Marks {
  in?: Place;
  tip?: Place;
  wide?: number;
  box?: Box;
  /** the outlines of the weapon and the fist on the grid the frame is read on (match.mjs `rasterOf`: '1' where a
   *  cell is within one, row by row) */
  outline?: { weapon: string; fist: string };
}

export interface FitOptions {
  fixture: Fixture;
  marks: Marks;
  /** the tunable values searched, each by its path (`warriorEyes.oneOn`) */
  fields: string[];
  /** fit to the hero's own frame at the values he starts with, from values moved off them: the fit must find its
   *  way back */
  canary?: boolean;
}

export interface Fit {
  /** the values found, by their paths, as `--tune` takes them */
  tune: Record<string, number[]>;
  /** how far off the marks the frame was at the start and at the values found (`missOf`) */
  from: number;
  miss: number;
  tries: number;
  /** the tries that saw no weapon in the frame, or saw one no ray met */
  unseen: number;
}

/** frames run for a rest to settle after its values change (the arm's fit starts from the last frame's elbow) */
const SETTLE = 8;
/** the most tries a fit makes, the rounds it starts afresh from the best so far, and the spread of misses over its
 *  points it stops a round at */
const TRIES = 1200;
const ROUNDS = 4;
const SPREAD = 0.0005;
/** how far a round's first points reach from its start along each value */
const REACH = 0.08;
/** what a frame missing its weapon misses by */
const UNSEEN = 10;
/** a width's weight against a place's: a weapon is a few hundredths of the frame wide, a place moves across all of
 *  it */
const WIDTH_WEIGHT = 3;
/** an outline's weight against a place's: the overlap is a share of the whole outline */
const OUTLINE_WEIGHT = 1;
/** what each cell of the frame's grid shows for each part outlined (inFrame.ts `SHOWS`) */
const SHOWS = { weapon: '1', fist: '2' } as const;
/** how far the canary moves the values off where they start */
const CANARY_OFF = 0.1;
/** the miss the canary's fit must come back within */
const CANARY_MISS = 0.02;

const distance = (a: Place, b: Place) => Math.hypot(a.x - b.x, a.y - b.y);

/** How much of the cells showing `shows` in `cells` overlap the raster `theirs`: the cells both show over the
 *  cells either does (1 when neither shows any; match.mjs reads it the same way, outline.mjs `coverage`). */
function overlapOf(cells: string, shows: string, theirs: string): number {
  if (cells.length !== theirs.length) throw new Error('lab: match --fit: an outline drawn on another grid');
  let both = 0;
  let either = 0;
  for (let k = 0; k < cells.length; k++) {
    const ours = cells[k] === shows;
    const marked = theirs[k] === '1';
    if (ours && marked) both++;
    if (ours || marked) either++;
  }
  return either ? both / either : 1;
}

/** How far a frame's weapon is from the marks: the places' distances (shares of the frame), the width's and the
 *  box's edges' differences. */
export function missOf(seen: Framed, marks: Marks): number {
  let miss = 0;
  if (marks.in) miss += distance(seen.from, marks.in);
  if (marks.tip) miss += distance(seen.far, marks.tip);
  if (marks.wide !== undefined) miss += WIDTH_WEIGHT * Math.abs(seen.wide - marks.wide);
  if (marks.box) {
    for (const edge of ['left', 'top', 'right', 'bottom'] as const) miss += Math.abs(seen.box[edge] - marks.box[edge]);
  }
  if (marks.outline) {
    for (const part of ['weapon', 'fist'] as const) {
      miss += OUTLINE_WEIGHT * (1 - overlapOf(seen.cells, SHOWS[part], marks.outline[part]));
    }
  }
  return miss;
}

/** The values `fields` hold now, end to end, and how many of them each holds. */
function valuesOf(fields: string[]): { values: number[]; sizes: number[] } {
  if (!window.__tuned) throw new Error('lab: match --fit: this game can\'t read its tunable values');
  const each = fields.map((path) => window.__tuned!(path));
  return { values: each.flat(), sizes: each.map((value) => value.length) };
}

/** `values`, end to end, as each of `fields`' own. */
function tuneOf(fields: string[], sizes: number[], values: number[]): Record<string, number[]> {
  const tune: Record<string, number[]> = {};
  let at = 0;
  fields.forEach((path, i) => {
    tune[path] = values.slice(at, at + sizes[i]);
    at += sizes[i];
  });
  return tune;
}

/** The weapon as framed once the rest has settled at `tune`, if it's seen. */
async function frameAt(lab: Lab, tune: Record<string, number[]>): Promise<Framed | null> {
  for (const path of Object.keys(tune)) window.__tune!(path, tune[path]);
  await lab.step(SETTLE);
  lab.model.root.updateMatrixWorld(true);
  try {
    return await framed(lab);
  } catch {
    // (a sliver of the weapon in the frame that no ray met: a try, not a measure)
    return null;
  }
}

/** One round of Nelder-Mead's search for the least of `miss` from `start`, within `tries`. */
async function round(miss: (x: number[]) => Promise<number>, start: number[], tries: number): Promise<number[]> {
  const n = start.length;
  const points = [start, ...start.map((_, i) => start.map((v, j) => (i === j ? v + REACH : v)))];
  const misses: number[] = [];
  for (const point of points) misses.push(await miss(point));
  let used = points.length;
  const order = () => {
    const ranks = points.map((_, i) => i).sort((a, b) => misses[a] - misses[b]);
    const sorted = ranks.map((i) => [points[i], misses[i]] as const);
    sorted.forEach(([point, value], i) => {
      points[i] = point;
      misses[i] = value;
    });
  };
  const toward = (from: number[], to: number[], k: number) => from.map((v, i) => v + (to[i] - v) * k);
  while (used < tries) {
    order();
    if (misses[n] - misses[0] < SPREAD) break;
    const middle = start.map((_, i) => points.slice(0, n).reduce((sum, point) => sum + point[i], 0) / n);
    const worst = points[n];
    const reflected = toward(worst, middle, 2);
    const reflectedMiss = await miss(reflected);
    used++;
    if (reflectedMiss < misses[0]) {
      const expanded = toward(worst, middle, 3);
      const expandedMiss = await miss(expanded);
      used++;
      const better = expandedMiss < reflectedMiss;
      points[n] = better ? expanded : reflected;
      misses[n] = better ? expandedMiss : reflectedMiss;
      continue;
    }
    if (reflectedMiss < misses[n - 1]) {
      points[n] = reflected;
      misses[n] = reflectedMiss;
      continue;
    }
    const contracted = toward(worst, middle, 0.5);
    const contractedMiss = await miss(contracted);
    used++;
    if (contractedMiss < misses[n]) {
      points[n] = contracted;
      misses[n] = contractedMiss;
      continue;
    }
    for (let i = 1; i <= n; i++) {
      points[i] = toward(points[0], points[i], 0.5);
      misses[i] = await miss(points[i]);
      used++;
    }
  }
  order();
  return points[0];
}

/**
 * The values of `fields` whose rest frames the weapon nearest `marks`, searched from the game's own (or the fixture's
 * `--tune`) in rounds started afresh from the best so far. With `canary`, the marks are the hero's own frame at the
 * start and the search starts off them: a fit that doesn't come back is an error.
 */
export async function fitRest(lab: Lab, options: FitOptions): Promise<Fit> {
  await lab.setup(options.fixture);
  const { values: start, sizes } = valuesOf(options.fields);
  const tuneAt = (values: number[]) => tuneOf(options.fields, sizes, values);
  let marks = options.marks;
  let from = start;
  if (options.canary) {
    const own = await frameAt(lab, tuneAt(start));
    if (!own) throw new Error('lab: match --fit --canary: no weapon in the frame at the start');
    const ownPart = (part: keyof typeof SHOWS) => [...own.cells].map((cell) => (cell === SHOWS[part] ? '1' : '0'));
    const outline = { weapon: ownPart('weapon').join(''), fist: ownPart('fist').join('') };
    marks = { in: own.from, tip: own.far, wide: own.wide, box: own.box, outline };
    from = start.map((value) => value + CANARY_OFF);
  }
  let tries = 0;
  let unseen = 0;
  const miss = async (values: number[]) => {
    tries++;
    const seen = await frameAt(lab, tuneAt(values));
    if (!seen) unseen++;
    return seen ? missOf(seen, marks) : UNSEEN;
  };
  const fromMiss = await miss(from);
  let best = from;
  for (let r = 0; r < ROUNDS && tries < TRIES; r++) best = await round(miss, best, TRIES - tries);
  // (as `--tune` will be given them: the frame pictured after is the one measured)
  best = best.map((value) => Math.round(value * 1000) / 1000);
  const bestMiss = await miss(best);
  if (options.canary && bestMiss > CANARY_MISS) {
    const back = `from ${fromMiss.toFixed(3)} only to ${bestMiss.toFixed(3)} in ${tries} tries`;
    throw new Error(`lab: match --fit --canary: moved off its own frame, the fit came back ${back}`);
  }
  return { tune: tuneAt(best), from: fromMiss, miss: bestMiss, tries, unseen };
}
