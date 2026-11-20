// The frame callback's parts timed, and a slow frame's named in the performance trace's marks: the trace's update
// stages and its render say what our update and draws took, but a phone's lobby had frames whose callback ran 300 to
// 540 ms while those took 12 to 19 (traces 83ZZ-9EWC, HHKG-FKD9), and nothing said where the rest went.
import { perfClock } from '../ui/perfHud';
import { recorder } from './recorder';

/** a frame callback this long (ms) has its parts named in the marks */
const SLOW_FRAME_MS = 100;
/** the parts named: those this long (ms) */
const NAMED_MS = 5;

/** the most parts a frame keeps */
const PARTS_MOST = 32;
/** the parts timed this frame, in order */
const parts: { name: string; ms: number }[] = [];
let start = 0;
let last = 0;
/** the programs made so far (`noteSlowFramesWith`), as the frame began */
let programsAtStart = 0;
let programsNow: () => number = () => 0;
/** what was under way behind the page, said with a slow frame (`noteSlowFramesWith`) */
let underWay: () => string = () => '';

/**
 * A slow frame's mark says too how many programs it made (`programs`, a running count: each linked in its frame on a
 * phone's driver) and what was under way (`note`: the warm-ups not yet warm). A phone's slow frames were held in the
 * scene's draw, its JavaScript a few ms of each, while the lobby warmed behind it (trace 4WR3-NHN7: 174 to 232 ms);
 * set from main.ts, as the warm-ups' module would bring the game's in here.
 */
export function noteSlowFramesWith(programs: () => number, note: () => string): void {
  programsNow = programs;
  underWay = note;
}

/** The frame callback begins: its parts timed from here. */
export function framePartsBegin(): void {
  start = perfClock.now();
  last = start;
  parts.length = 0;
  programsAtStart = programsNow();
}

/** What ran since the last part (or the frame's beginning) was `name`. */
export function framePart(name: string): void {
  // (a render outside the frame's callback, the profiler's or a warm-up's, marks parts too: kept to a frame's few)
  if (parts.length >= PARTS_MOST) return;
  const now = perfClock.now();
  parts.push({ name, ms: now - last });
  last = now;
}

/** The frame callback ends (what ran since the last part is `the rest`): a slow one marked with its parts. */
export function framePartsEnd(): void {
  framePart('the rest');
  const total = last - start;
  if (total < SLOW_FRAME_MS) return;
  const named = parts.filter((part) => part.ms >= NAMED_MS).map((part) => `${part.name} ${Math.round(part.ms)}`);
  const made = programsNow() - programsAtStart;
  const note = underWay();
  const more = `${made > 0 ? `; ${made} programs made` : ''}${note ? `; ${note}` : ''}`;
  recorder.mark(`slow frame callback ${Math.round(total)} ms: ${named.join(', ') || 'no part over 5 ms'}${more}`);
}
