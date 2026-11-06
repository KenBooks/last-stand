// When the game runs slowly enough to ask the player for a trace (src/perf/AGENTS.md), in any scene: the boot, the
// hero selection screen, the lobby, a fight, a loading bar's wait. Over the last stretch of play (a paused game, a
// hidden tab, a warm-up, a loading bar and the first seconds after a scene starts left out) its 1% low under 30
// frames a second, or more than a fifth of the display's frames missed with the mean under 50; over every frame shown,
// stalls (one of a second, or three of a quarter); a boot or a loading bar's wait that took too long. Pure, so the
// lab's tests run it on frames of their own (tools/lab/test/trace.test.mjs).
import { STATE } from './traceFormat.ts';

/** the stretch judged (ms of play), the least of it that must be play (ms), and how far back it may reach (ms) */
export const JUDGED_MS = 20_000;
export const PLAY_LEAST_MS = 15_000;
export const REACH_MS = 30_000;
/** a 1% low under this is slow (frames a second) */
export const LOW_FPS = 30;
/** how far under `LOW_FPS` a 1% low may read and not be under it (frames a second): a frame of whole refreshes comes
 *  out a float's hair either side */
const LOW_SLACK = 0.05;
/** missed frames over this share, with a mean under `MEAN_FPS`, are slow */
export const MISSED_SHARE = 0.2;
export const MEAN_FPS = 50;
/** a frame in any of these states isn't play, for the frame rate: a stall is one wherever it is but a hidden tab */
export const NOT_PLAY = STATE.paused | STATE.warming | STATE.hidden | STATE.menu | STATE.settling | STATE.readying;
/** a frame this long is a stall (ms), one this long a big one; longer than `STALL_MOST` it was the machine (asleep) */
export const STALL_MS = 250;
export const BIG_STALL_MS = 1000;
export const STALL_MOST = 5000;
/** stalls in the stretch that are slow: this many, or one big */
export const STALLS = 3;
/** a boot whose own work (its time less the download's) took longer than this is slow (ms) */
export const BOOT_WORK_MS = 15_000;
/** a loading bar up longer than this is slow (ms) */
export const READYING_MS = 8_000;

/** What the stretch judged showed. */
export interface Verdict {
  slow: boolean;
  /** why, in a word: 'low' (the 1% low), 'missed' (frames missed), 'stalls', '' */
  why: string;
  /** play judged (ms), frames a second at the mean and the 1% low, the share of the display's frames missed */
  playMs: number;
  meanFps: number;
  lowFps: number;
  missed: number;
  /** stalls among the frames shown, and the longest (ms) */
  stalls: number;
  longest: number;
  refreshHz: number;
}

/** The frames a ring holds, oldest at `start`: each frame's interval (ms) and state's bits. */
export interface Frames { interval: ArrayLike<number>; state: ArrayLike<number>; start: number; count: number; size: number }

/**
 * The last `JUDGED_MS` of play among the last `REACH_MS` of frames, judged against a display of `refreshMs` a frame.
 * The frame rate isn't judged with less than `PLAY_LEAST_MS` of play; stalls are, over every frame shown.
 */
export function judge(frames: Frames, refreshMs: number): Verdict {
  const refreshHz = 1000 / refreshMs;
  const played: number[] = [];
  let playMs = 0, reached = 0, stalls = 0, big = 0, longest = 0;
  for (let k = frames.count - 1; k >= 0 && reached < REACH_MS; k--) {
    const i = (frames.start + k) % frames.size;
    const interval = frames.interval[i], state = frames.state[i];
    if (!(interval > 0)) continue;
    reached += interval;
    if (state & STATE.hidden) continue;
    if (interval >= STALL_MS && interval <= STALL_MOST) {
      stalls++;
      if (interval >= BIG_STALL_MS) big++;
      longest = Math.max(longest, interval);
    }
    if (state & NOT_PLAY || playMs >= JUDGED_MS || interval > STALL_MOST) continue;
    played.push(interval);
    playMs += interval;
  }
  const stalled = stalls >= STALLS || big > 0;
  if (playMs < PLAY_LEAST_MS) {
    return { slow: stalled, why: stalled ? 'stalls' : '', playMs, meanFps: NaN, lowFps: NaN, missed: NaN, stalls, longest, refreshHz };
  }
  const sorted = [...played].sort((a, b) => a - b);
  const p99 = sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * 0.99))];
  let due = 0;
  for (const interval of played) due += Math.max(1, Math.round(interval / refreshMs));
  const meanFps = (played.length * 1000) / playMs;
  // (the 1% low with the display's jitter taken off, never added: a steady 60 on a 120 Hz screen drops a frame now
  // and then, four of its refreshes, 33.4 ms by the jitter, and read raw that's 29.9 a second, "slow": trace R2XY-H2DW)
  const lowFps = 1000 / Math.min(p99, Math.max(1, Math.round(p99 / refreshMs)) * refreshMs);
  const missed = 1 - played.length / due;
  const why = lowFps < LOW_FPS - LOW_SLACK ? 'low' : missed > MISSED_SHARE && meanFps < MEAN_FPS ? 'missed' : stalled ? 'stalls' : '';
  return { slow: why !== '', why, playMs, meanFps, lowFps, missed, stalls, longest, refreshHz };
}

/** The display's frame (ms) by the fastest second seen: its frames' 10th percentile, kept as the least so far
 *  (a slow game never shows the display's own rate; at most 360 Hz, at least 30). */
export function refreshOf(secondIntervals: number[], sofar: number): number {
  if (secondIntervals.length < 20) return sofar;
  const sorted = [...secondIntervals].sort((a, b) => a - b);
  const fast = sorted[Math.floor(sorted.length * 0.1)];
  return Math.min(sofar, Math.max(1000 / 360, Math.min(1000 / 30, fast)));
}

/** Whether a boot was slow: `bootMs` from the page's start to the game shown, `downloadMs` of it the download's. */
export const slowBoot = (bootMs: number, downloadMs: number): boolean => bootMs - downloadMs > BOOT_WORK_MS;

/** Whether a loading bar's wait was slow (ms). */
export const slowReadying = (ms: number): boolean => ms > READYING_MS;
