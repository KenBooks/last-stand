// `lab lobbystart`'s sums of the lobby's frames (page/lobbyStart.ts): each frame's own work, the queue's building in
// it and the warm-ups' slices after it, read over the lobby's first seconds and after. Pure: unit-tested in
// test/lobbyFrames.test.ts.

/** A slice of a warm-up's work behind the lobby (game/warmup.ts `WorkSlice`). */
export interface Slice {
  need: string;
  part: string;
  ms: number;
}

/**
 * One frame read (ms): the game's frame less the queue's building, the building, the time the page took to come back
 * once let go after it (`between`: whatever ran then, the warm-ups' slices among it), and those slices, which name what
 * ran (a slice runs from one of a warm-up's waits to its next, an await of a worker's reply in it too, so it may be
 * longer than what held the page).
 */
export interface FrameRead {
  frame: number;
  building: number;
  between: number;
  slices: Slice[];
}

/** The frame that held the most work behind the lobby: its index, that work, and what it was. */
export interface Longest {
  at: number;
  behind: number;
  what: string;
}

/** the slowest slices said */
const SLOWEST_SAID = 8;

/** `values`' `share` quantile (0 to 1), or 0 for none. */
export function quantile(values: number[], share: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))];
}

/** The work behind the lobby in `read`: the queue's building and what held the page after the frame (ms). */
export const behindOf = (read: FrameRead): number => read.building + read.between;

/** What `read`'s work behind the lobby was, its largest first. */
function whatOf(read: FrameRead): string {
  const parts = read.slices.map((s) => ({ name: `${s.need} ${s.part}`, ms: s.ms }));
  if (read.building) parts.push({ name: 'the queue\'s building', ms: read.building });
  return parts.sort((a, b) => b.ms - a.ms).map((p) => `${p.name} ${p.ms.toFixed(1)}`).join(', ') || 'nothing';
}

/** The `frames` of a stretch said: their own work's median, 90th and most, and the work behind them's. */
function stretchLine(name: string, frames: FrameRead[]): string {
  const own = frames.map((read) => read.frame);
  const behind = frames.map(behindOf);
  const at = (values: number[]): string =>
    `${quantile(values, 0.5).toFixed(1)} / ${quantile(values, 0.9).toFixed(1)} / ${Math.max(0, ...values).toFixed(1)}`;
  return `${name} (${frames.length} frames): the frame ${at(own)} ms, behind it ${at(behind)} ms (median / 90th / most)`;
}

/** The lobby's frames read one by one, summed as `lab lobbystart` says them. */
export class FrameWork {
  readonly reads: FrameRead[] = [];
  readonly slices: Slice[] = [];
  longest: Longest = { at: -1, behind: 0, what: 'nothing' };

  /** the frames of the lobby's first stretch, and of its first two */
  private readonly first: number;
  private readonly early: number;

  /** `first` frames make the lobby's first stretch, `early` its first two. */
  constructor(first: number, early: number) {
    this.first = first;
    this.early = early;
  }

  get frames(): number {
    return this.reads.length;
  }

  add(read: FrameRead): void {
    const behind = behindOf(read);
    if (behind > this.longest.behind) this.longest = { at: this.reads.length, behind, what: whatOf(read) };
    this.reads.push(read);
    this.slices.push(...read.slices);
  }

  /** Each warm-up's slices: how many, their sum and the longest, by need. */
  byNeed(): string[] {
    const needs = [...new Set(this.slices.map((s) => s.need))];
    return needs.map((need) => {
      const mine = this.slices.filter((s) => s.need === need);
      const sum = mine.reduce((total, s) => total + s.ms, 0);
      const most = Math.max(...mine.map((s) => s.ms));
      return `${need}: ${mine.length} slices, ${sum.toFixed(0)} ms in all, the longest ${most.toFixed(1)} ms`;
    });
  }

  /** The lines said: the frames, each stretch, each warm-up, the longest frame behind the lobby against `most`. */
  lines(most: number): string[] {
    const stretches = [
      stretchLine('its first 2 s', this.reads.slice(0, this.first)),
      stretchLine('2 to 10 s', this.reads.slice(this.first, this.early)),
      stretchLine('after', this.reads.slice(this.early)),
    ].filter((line) => !line.includes('(0 frames)'));
    const longest = `the most work behind the lobby a frame: ${this.longest.behind.toFixed(1)} ms (at most ${most}), `
      + `frame ${this.longest.at}: ${this.longest.what}`;
    return [`${this.frames} frames until nothing was left to do behind the lobby`, ...stretches, ...this.byNeed(), longest];
  }
}

/** The slowest of `slices`, said. */
export function slowestSlices(slices: Slice[]): string {
  const slowest = [...slices].sort((a, b) => b.ms - a.ms).slice(0, SLOWEST_SAID);
  return slowest.map((s) => `${s.need} ${s.part} ${s.ms.toFixed(1)}`).join(', ') || 'none';
}
