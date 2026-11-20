// A chart over time laid out: where each point or bar goes, the y axis's ticks and the x axis's labels. Pure, spec'd.

export type ChartKind = 'line' | 'bars';

/** A point of a chart over time: its start (ms), its value, and what the tooltip says of both. */
export interface TimePoint {
  at: number;
  value: number;
  when: string;
  text: string;
}


/** The plot's left margin (the y ticks' room) and bottom margin (the x labels'), in px. */
export const PAD_LEFT = 34;
export const PAD_BOTTOM = 18;
/** the gap between bars, in px */
const BAR_GAP = 2;
/** at most this many x labels */
const MOST_LABELS = 6;

/** A point placed: its centre on x, its top on y, its bar's left and width. */
export interface Placed {
  x: number;
  y: number;
  left: number;
  width: number;
}

/** A chart laid out at `width` x `height`. */
export interface Geometry {
  placed: Placed[];
  /** the line's path (a line chart of two points or more) */
  line: string;
  /** the plot's floor on y */
  base: number;
  ticksY: { y: number; text: string }[];
  ticksX: { x: number; text: string; anchor: 'start' | 'middle' | 'end' }[];
}

/** The smallest of 1, 2, 2.5, 5 times a power of ten at or over `n` (at least 1): the y axis's top. */
export function niceTop(n: number): number {
  if (n <= 1) return 1;
  const power = 10 ** Math.floor(Math.log10(n));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * power >= n) ?? 10;
  return step * power;
}

const tickText = (n: number): string => (Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1));

/** Where each point goes, and the axes, for `points` (oldest first) drawn as `kind`. */
export function layOut(points: TimePoint[], kind: ChartKind, width: number, height: number): Geometry {
  const base = height - PAD_BOTTOM;
  const plot = Math.max(1, width - PAD_LEFT);
  const top = niceTop(Math.max(0, ...points.map((p) => p.value)));
  const yOf = (value: number) => base - (value / top) * (base - 4);
  const band = plot / Math.max(1, points.length);
  const xOf = (i: number) =>
    kind === 'bars' ? PAD_LEFT + band * (i + 0.5) : PAD_LEFT + (points.length > 1 ? (plot * i) / (points.length - 1) : plot / 2);
  const placed = points.map((point, i) => {
    const width = Math.max(1, band - BAR_GAP);
    return { x: xOf(i), y: yOf(point.value), left: xOf(i) - width / 2, width };
  });
  const line = kind === 'line' && placed.length > 1
    ? placed.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('')
    : '';
  const ticksY = [0, top / 2, top].map((value) => ({ y: yOf(value), text: tickText(value) }));
  return { placed, line, base, ticksY, ticksX: labels(points, placed, plot) };
}

/**
 * A few x labels a whole number of points apart, counted back from the newest (always labelled), so no two crowd
 * each other; a label at either end of the plot held inside it.
 */
function labels(points: TimePoint[], placed: Placed[], plot: number): Geometry['ticksX'] {
  if (!points.length) return [];
  const last = points.length - 1;
  const count = Math.min(MOST_LABELS, points.length, Math.max(2, Math.floor(plot / 90)));
  const step = Math.max(1, Math.ceil(last / Math.max(1, count - 1)));
  const shown: number[] = [];
  for (let i = last; i >= 0; i -= step) shown.unshift(i);
  return shown.map((i) => ({
    x: placed[i].x,
    text: points[i].when.replace(/ \(peak of the hour\)$/, ''),
    anchor: i === 0 && last > 0 ? 'start' : i === last && last > 0 ? 'end' : 'middle',
  }));
}

/** The index of the point nearest `x` (px in the chart), or -1 for none. */
export function nearest(geometry: Geometry, x: number): number {
  let best = -1;
  let bestDistance = Infinity;
  geometry.placed.forEach((p, i) => {
    const distance = Math.abs(p.x - x);
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  });
  return best;
}
