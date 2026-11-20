// `lab lobbystart`: a return's lobby from its reveal, frame by frame, as the player meets it (from play, "it's slow
// for the first 20 sec of the village... should start above 100 FPS", trace Z7FP-MNKT; and "we should not wait for
// users to report slowness"). Opened again as a return (node/commands/lobbystart.mjs `asReturn`), the warm-ups the
// game runs behind the lobby (game/warmup.ts `warmTheRest`: the fight's, the other heroes', the rooms') are still to
// come, and the queue behind it
// (game/behind.ts) still holds the heroes it builds. Each frame is stepped and drawn, then the browser let go for the
// warm-ups' slice of it (a step of theirs waits for a frame and then a task), and timed by the browser's own clock:
// the game's frame, the queue's building in it, and each warm-up's slices (`behindWork`). The work behind the lobby
// a frame must stay within its budget. Between frames the page's time passes as a player's does (`LabClock.flow`),
// and the game's slices are timed by the browser's clock (`perfClock`): on the lab's clock, standing still, a slice
// never ended, and a hero's whole build read as one task. `canary` lifts the lobby's budget for what's built behind it,
// so each hero is built whole there again, as his part's build did before the heroes were built in slices.
import type { Lab, Report } from './lab';
import { G } from '../../../src/state';
import { isWarm, type Need } from '../../../src/game/warm';
import * as warmup from '../../../src/game/warmup';
import { BEHIND, behindFrame, buildingBehind } from '../../../src/game/behind';
import { behindWork, type WorkSlice } from '../../../src/game/warmup';
import { perfClock } from '../../../src/ui/perfHud';
import { FrameWork, slowestSlices, type FrameRead } from './lobbyFrames';
import { detailOnPage } from './lab';

/** Options of `lab lobbystart`. */
export interface LobbyStartOptions {
  /** the lobby's budget for what's built behind it lifted, each hero built whole there: it must be caught */
  canary: boolean;
  /** every frame counted as held past what warming behind the lobby may hold: each warm-up must give up at once */
  held: boolean;
}

/** the warm-ups that run behind the lobby, in the order the game runs them */
const NEEDS: Need[] = ['fight', 'heroes', 'rooms'];
/** the most work behind the lobby a frame may hold (ms). The aim is 12, the queue's 2 ms and a piece over it (a
 *  hero's pieces take up to 10 ms here, `lab behind`), as a 144 Hz screen's frame is 6.9 ms and the lobby's own 4 to
 *  5; each warm-up's tasks are 10 ms at most now, and a frame reads up to 20 where two run between it and the next.
 *  Built whole, as before, a hero held a frame 130 to 350 ms, and drawn in one render a part 20 to 40 ms. */
const MOST_MS = 25;
/** the frames the lobby may take to warm everything behind it (60 s of the lab's frames) */
const MOST_FRAMES = 3600;
/** the canary's budget behind the lobby (ms): more than any hero's build takes */
const CANARY_SLICE_MS = 10_000;
/** the most the browser is let go after a frame for the warm-ups' steps to resume (ms): a step's own fallback timer
 *  resumes it after 100 ms (game/warmup.ts `FRAME_MOST_MS`) */
const MOST_WAIT_MS = 500;
/** the frames of the lobby's first seconds, read apart from the rest (2 s, 10 s) */
const FIRST = 120;
const EARLY = 600;

/** The browser's own clock (the page's `performance.now` is the lab's, which stands still within a frame). */
const realNow = (): number => window.__labClock.realNow();

/** How warming behind the lobby is given up (game/warmup.ts `WARM_BEHIND`), where the tree has it: an A/B's other
 *  commit may give a need up alone, between its parts, which `--held` shows. */
const warmBehind = (warmup as { WARM_BEHIND?: { heldMost: number; givenUp: Set<Need> } }).WARM_BEHIND
  ?? { heldMost: 120, givenUp: new Set<Need>() };

/** The needs still to warm behind the lobby: not warm, and not given up there (they wait for what needs them). */
const toWarm = (): Need[] => NEEDS.filter((need) => !isWarm(need) && !warmBehind.givenUp.has(need));

/** Whether anything is still to be done behind the lobby. */
const working = (): boolean => toWarm().length > 0 || buildingBehind();

/** A channel whose messages let the browser go for a task at a time: a timer's, nested as these are, waits 4 ms at
 *  the least, which would read as work. */
const channel = new MessageChannel();

/** Resolves after the browser has run the tasks queued before one message of `channel`'s. */
const nextMessage = (): Promise<void> => new Promise((resolve) => {
  channel.port1.onmessage = () => resolve();
  channel.port2.postMessage(0);
});

/** the longest a message's round trip takes with nothing else to run (ms): one longer ran a task of the page's */
const IDLE_TICK_MS = 0.5;

/** One message's round trip (ms): what other tasks the browser ran before it. */
async function tick(): Promise<number> {
  const start = realNow();
  await nextMessage();
  return realNow() - start;
}

/** The browser let go until every warm-up step `due` after a frame has resumed and run its slice (a step waits for a
 *  frame and then a timer), `MOST_WAIT_MS` at most: what held the page meanwhile, the round trips that ran a task (a
 *  slice awaiting a worker's reply leaves the page free, as the game's frames go on meanwhile). The page's time
 *  passes meanwhile, as a player's does (`LabClock.flow`): its slices end by it. */
async function untilResumed(due: number): Promise<number> {
  const start = realNow();
  let held = 0;
  const busy = (ms: number): void => {
    if (ms > IDLE_TICK_MS) held += ms;
  };
  window.__labClock.flow(true);
  try {
    while (behindWork.resumed < due && realNow() - start < MOST_WAIT_MS) busy(await tick());
    // (each slice runs in its timer's task, so it's done by the next task: one more for the last)
    busy(await tick());
  } finally {
    window.__labClock.flow(false);
  }
  return held;
}

/** One frame stepped and drawn, then the browser let go for what waits on it: what each part of it took. */
async function oneFrame(lab: Lab): Promise<FrameRead> {
  const start = realNow();
  await lab.step(1);
  const frame = realNow() - start;
  const between = await untilResumed(behindWork.resumed + behindWork.waiting);
  const slices: WorkSlice[] = behindWork.slices.splice(0);
  return { frame: frame - behindFrame.ms, building: behindFrame.ms, between, slices };
}

/** The lobby's frames from its reveal until nothing is left to do behind it. */
async function framesFromReveal(lab: Lab): Promise<FrameWork> {
  const work = new FrameWork(FIRST, EARLY);
  while (working() && work.frames < MOST_FRAMES) work.add(await oneFrame(lab));
  return work;
}

/** The measure with everything it changes put back: drawing on, the warm-ups' slices kept, the queue's clock the
 *  browser's, and the canary's budget. */
async function measured(lab: Lab, canary: boolean, held: boolean): Promise<FrameWork> {
  const drawing = lab.drawing;
  const clock = perfClock.now;
  const budget = BEHIND.ms;
  const heldMost = warmBehind.heldMost;
  if (held) warmBehind.heldMost = 0;
  lab.drawing = true;
  // (the heroes' fewer triangles made in the game's worker, as a player's page makes them)
  detailOnPage(false);
  behindWork.on = true;
  behindWork.slices.length = 0;
  perfClock.now = realNow;
  if (canary) BEHIND.ms = CANARY_SLICE_MS;
  try {
    return await framesFromReveal(lab);
  } finally {
    lab.drawing = drawing;
    detailOnPage(true);
    behindWork.on = false;
    perfClock.now = clock;
    BEHIND.ms = budget;
    warmBehind.heldMost = heldMost;
  }
}

/** the most slices a warm-up may run behind the lobby with every frame counted as held (`--held`): its first step
 *  waits for a frame and gives up after it, a part's build ahead of it taking a step or two of its own */
const HELD_SLICES_MOST = 3;

/**
 * `--held`'s verdict: every warm-up that was to run behind the lobby given up there (`cold`), each within its first
 * few slices. Given up a need at a time between parts, as the game did before trace 5NBG-PJD9, the fight's part ran
 * on and the heroes' and the rooms' began afresh after it.
 */
function heldChecked(work: FrameWork, cold: Need[], givenUp: Need[], problems: string[]): void {
  const kept = cold.filter((need) => !givenUp.includes(need));
  if (kept.length) problems.push(`--held: warmed behind the lobby all the same: ${kept.join(', ')}`);
  for (const need of cold) {
    const slices = work.slices.filter((slice) => slice.need === need).length;
    if (slices > HELD_SLICES_MOST) {
      problems.push(`--held: ${need} ran ${slices} slices behind the lobby after a frame was held (at most `
        + `${HELD_SLICES_MOST})`);
    }
  }
}

export async function lobbyStart(lab: Lab, options: LobbyStartOptions): Promise<Report> {
  if (G.mode !== 'menu') throw new Error('lab: lobbystart: the fresh page must begin in the lobby');
  const cold = NEEDS.filter((need) => !isWarm(need));
  if (!cold.length) throw new Error('lab: lobbystart: nothing is left to warm behind the lobby (it opens as a return)');
  const work = await measured(lab, options.canary, options.held);
  const lines = [`opened again: ${cold.join(', ')} to warm behind the lobby`, ...work.lines(MOST_MS)];
  lines.push(`the slowest slices: ${slowestSlices(work.slices)}`);
  const problems: string[] = [];
  const givenUp = NEEDS.filter((need) => warmBehind.givenUp.has(need));
  lines.push(`given up behind the lobby (left for what needs them): ${givenUp.join(', ') || 'none'}`);
  if (working()) problems.push(`still working behind the lobby after ${work.frames} frames: ${toWarm().join(', ') || 'the queue'}`);
  if (options.held) heldChecked(work, cold, givenUp, problems);
  if (!work.slices.length && !options.held) problems.push('no warm-up ran behind the lobby: nothing was measured');
  const over = work.longest.behind > MOST_MS;
  if (options.canary) {
    lines.push(`canary (each hero built whole behind the lobby): ${over ? 'caught' : 'missed'}`);
    if (!over) problems.push('canary: the heroes built whole behind the lobby went unseen');
  } else if (over) {
    problems.push(`a frame held ${work.longest.behind.toFixed(1)} ms of work behind the lobby (at most ${MOST_MS})`);
  }
  return { text: lines.join('\n'), problems };
}
