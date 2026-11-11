// Keep loading stalls apart from the rolling play history: a later report must not lose the freeze before reveal.
import type { LongFrameRow } from './traceFormat';

export interface TimedLongFrame { t: number; row: LongFrameRow }

/** Preserve the useful script label without origins, local paths, query parameters or fragments. */
export function longFrameLabel(invoker: string, name: string, url: string): string {
  const leaf = (value: string): string => value.split(/[\\/]/).at(-1)?.split(/[?#]/)[0] ?? '';
  const called = invoker.includes('://') || invoker.includes('\\') ? leaf(invoker) : invoker;
  return [called, name, leaf(url)].filter(Boolean).join(' ');
}

/** Keep the worst frames within the play window, so many small hitches cannot evict a multi-second freeze. */
export function keepPlayStall(rows: TimedLongFrame[], entry: TimedLongFrame, from: number, most: number): void {
  for (let index = rows.length - 1; index >= 0; index--) if (rows[index].t < from) rows.splice(index, 1);
  if (entry.t < from) return;
  rows.push(entry);
  if (rows.length <= most) return;
  let shortest = 0;
  for (let index = 1; index < rows.length; index++) {
    if (rows[index].row[1] < rows[shortest].row[1]) shortest = index;
  }
  rows.splice(shortest, 1);
}

/** The worst loading frames, capped independently of the normal minute of play. Times are from navigation. */
export function keepBootStall(rows: LongFrameRow[], row: LongFrameRow): void {
  rows.push(row);
  rows.sort((a, b) => b[1] - a[1]);
  rows.length = Math.min(rows.length, 8);
}

/** A compact trace field using only the recorder's existing timings and script label. */
export function bootStallSummary(rows: readonly LongFrameRow[]): string {
  return rows.map(([at, duration, before, callbacks, layout, scripts, longest, by]) =>
    `${duration} ms at ${Math.round(at)} ms: before render ${before}, callbacks ${callbacks}, layout ${layout}, `
    + `scripts ${scripts}, longest ${longest}${by ? ` (${by})` : ''}`).join(' | ');
}
