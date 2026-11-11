// What's built behind the live lobby a piece a frame (from play: "keep loading the game in the background, as long as
// it does not slow down the player, so avoid all the loading bars later"): builds in pieces (a hero's,
// `Player.inSteps`, models/steps.ts), queued by what will want them (game/warmup.ts, game/hall.ts) and stepped by the
// lobby's frame (`buildBehind`), as many pieces as fit `BEHIND` of it. One wanted before it's built is finished at once
// (`finishNow`), as it was built before. `lab behind` times each frame's building.
import { perfClock } from '../ui/perfHud';
import { atHeroDetail, heroDetail } from '../entities/models/armor';
import { headsReady, preloadHeads } from '../entities/models/head';
import { builtInSlices } from '../entities/models/steps';

/** A build in pieces: `steps` builds a piece a `next()`, `done` takes what the last returns. */
interface Job {
  key: string;
  steps: Generator<void, unknown, undefined>;
  done: (built: unknown) => void;
  piece: number;
  detail: number;
}

/** the builds queued, the first's pieces built first */
const jobs: Job[] = [];
/** how long the pieces built behind the lobby may take of a frame (ms), and the most built in one: a hero built whole
 *  held a frame up 100 to 170 ms on the owner's PC; his pieces take 1 to 10 */
export const BEHIND = { ms: 2, most: 6 };
/** the last frame's building: its time (ms), its pieces, the longest piece's time and which it was, by `perfClock`
 *  (a harness's: `lab behind`) */
export const behindFrame = { ms: 0, pieces: 0, longest: 0, slowest: '' };
/** what the building took past `BEHIND.ms` (ms), paid back a frame's `BEHIND.ms` at a time before more is built: a
 *  piece of 10 to 17 ms built every frame held a return's lobby at 58 frames a second for its first 2.5 s, against
 *  main's 129 (`npm run stalls -- --scenario boot`) */
let owed = 0;

/** `steps` queued as `key` (once: a key queued already is left as it is), `done` given what it builds. */
export function buildLater<T>(key: string, steps: Generator<void, T, undefined>, done: (built: T) => void): void {
  if (queued(key)) return;
  const detail = heroDetail();
  jobs.push({ key, steps: atHeroDetail(steps, detail), detail, done: done as (built: unknown) => void, piece: 0 });
}

/** Whether `key` is queued and not yet built. */
export const queued = (key: string): boolean => jobs.some((job) => job.key === key);
/** Whether anything is building behind the lobby. */
export const buildingBehind = (): boolean => jobs.length > 0;

/** `key`'s build finished now, all its pieces left at once: it's wanted. False if it isn't queued. */
export function finishNow(key: string): boolean {
  const i = jobs.findIndex((job) => job.key === key);
  if (i < 0) return false;
  const [job] = jobs.splice(i, 1);
  for (;;) {
    const next = job.steps.next();
    if (next.done) {
      job.done(next.value);
      return true;
    }
  }
}

/** A wanted queued build finished without holding input up, after its head workers have returned. */
export async function finishInSlices(key: string, pause: () => Promise<void>): Promise<void> {
  const i = jobs.findIndex((job) => job.key === key);
  if (i < 0) return;
  const [job] = jobs.splice(i, 1);
  await preloadHeads(job.detail);
  job.done(await builtInSlices(job.steps, pause));
}

/** The queued builds' next pieces, as many as fit `BEHIND`: called each frame the lobby shows. */
export function buildBehind(): void {
  Object.assign(behindFrame, { ms: 0, pieces: 0, longest: 0, slowest: '' });
  if (owed > 0) {
    owed = Math.max(0, owed - BEHIND.ms);
    return;
  }
  const start = perfClock.now();
  while (jobs.length && behindFrame.pieces < BEHIND.most) {
    const at = perfClock.now();
    if (behindFrame.pieces && at - start >= BEHIND.ms) break;
    const job = jobs[0];
    // A quality change can request heads the boot's workers never made. A generator's first head piece
    // otherwise sculpts them synchronously, far beyond the frame budget (and queues keyboard events).
    if (!headsReady(job.detail)) { void preloadHeads(job.detail); break; }
    const next = job.steps.next();
    if (next.done) {
      jobs.shift();
      job.done(next.value);
    }
    behindFrame.pieces++;
    const took = perfClock.now() - at;
    if (took > behindFrame.longest) {
      behindFrame.longest = took;
      behindFrame.slowest = `${job.key}'s piece ${job.piece}`;
    }
    job.piece++;
  }
  behindFrame.ms = perfClock.now() - start;
  owed = Math.max(0, behindFrame.ms - BEHIND.ms);
}
