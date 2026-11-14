// `lab cursor`'s Esc: the pause menu opened and closed by Esc, pressed again and again and quickly, as each browser
// hands it over with the pointer locked for mouse look (#554: "pressing Esc to close the pause menu sometimes opens it
// again, or leaves it open"). The lab's browser plays the lock (`lab.pointerLock`), so the page plays each browser's
// part too:
// - `windowed`: Chrome in a window. Esc with the lock held lets it go and keeps the keydown; its keyup and its repeats
//   reach the page.
// - `keyboardLock`: Chrome in the page's full screen with Esc locked for the game. The keydown reaches the page and the
//   lock stays; the browser answers the game's own letting go of it a few frames late (`LATE`).
// - `both`: a browser that lets the lock go and hands the page the keydown as well.
// - `fullScreen`: the page's full screen without Esc locked. Esc lets the lock go and leaves full screen, the keydown
//   kept; full screen's change heard a frame later or past 300 ms (a window resized), as the game hears it.
// Each press must toggle the pause menu once, in a run in each view and in the lobby, and nothing may change it in the
// second after the last. `canary` reads Esc as the game did before (`readEscAsBefore`): the doubles must be caught.
import type { Lab } from './lab';
import type { ViewMode } from '../../../src/core/renderer';
import { viewMode } from '../../../src/core/renderer';
import { G } from '../../../src/state';
import { input, pointerLocked, readEscAsBefore } from '../../../src/core/input';
import { pressHeld } from './holdPress';

/** How a browser hands the page an Esc pressed with the pointer locked (see the header). */
type Browser = 'windowed' | 'keyboardLock' | 'both' | 'fullScreen';

/** One sequence of presses: how the browser hands them over, the frames between them, and what else it does. */
interface Sequence {
  browser: Browser;
  /** the presses, each tapped (held a frame) unless `held` */
  presses: number;
  /** frames between one press's keyup and the next's keydown */
  gap: number;
  /** frames a press is held (its keyboard repeating every `REPEAT_EVERY` from the second) */
  held: number;
  /** frames late the browser answers the game's own letting go of the lock (`keyboardLock`) */
  late: number;
  /** frames late full screen's change is heard (`fullScreen`) */
  fullScreenLate: number;
}

/** where the presses are made: a run's view, or the lobby's */
interface Place {
  name: string;
  view: ViewMode;
  lobby: boolean;
}

/** the frames given after each sequence for what follows from it (past the 400 ms before the lock is asked again) */
const SETTLE = 60;
/** the frames a tap is held */
const TAP = 1;
/** a held key's repeats, every this many frames */
const REPEAT_EVERY = 2;
/** the frames the browser answers the game's letting go of the lock late by */
const LATE = 3;
/** full screen's change heard a frame late, and past 300 ms late (a window resized) */
const FULL_SCREEN_SOON = 1;
const FULL_SCREEN_LATE = 30;
/** the frames a lock is given to be taken */
const LOCK_FRAMES = 6;
/** the most presses of V to reach a view */
const VIEW_PRESSES = 4;

const tap = (browser: Browser, presses: number, gap: number): Sequence => ({
  browser, presses, gap, held: TAP, late: 0, fullScreenLate: 0,
});

/** Every sequence played in a close view: each browser's quick taps, a held Esc, late answers. */
function sequences(): Sequence[] {
  const list: Sequence[] = [];
  for (const browser of ['windowed', 'keyboardLock', 'both'] as const) {
    for (const gap of [1, 2, 6, 30]) list.push(tap(browser, 2, gap));
    list.push(tap(browser, 3, 2));
    list.push({ ...tap(browser, 2, 30), held: 40 });
  }
  for (const gap of [1, 2, 6]) list.push({ ...tap('keyboardLock', 2, gap), late: LATE });
  for (const fullScreenLate of [FULL_SCREEN_SOON, FULL_SCREEN_LATE]) {
    list.push({ ...tap('fullScreen', 2, 40), fullScreenLate });
  }
  return list;
}

/** A sequence as a report names it. */
function nameOf(sequence: Sequence): string {
  const parts = [sequence.browser, `${sequence.presses} presses ${sequence.gap} frames apart`];
  if (sequence.held > TAP) parts.push(`each held ${sequence.held} frames, repeating`);
  if (sequence.late) parts.push(`the lock's answers ${sequence.late} frames late`);
  if (sequence.fullScreenLate) parts.push(`full screen's change ${sequence.fullScreenLate} frames late`);
  return parts.join(', ');
}

/**
 * Frames run as the page's keys have them (a frame's keys are all the game has down: what the browser's events left
 * down is kept), the lock's late answers given once `late` frames have passed, and full screen's change heard at
 * its frame.
 */
class Frames {
  private sinceHeld = 0;
  /** frames till full screen's change is heard (none: -1) */
  fullScreenIn = -1;

  constructor(private readonly lab: Lab, private readonly late: number) {
    if (late) lab.lockAnswersLate(true);
  }

  async run(count: number): Promise<void> {
    for (let frame = 0; frame < count; frame++) {
      await this.lab.step(1, () => ({ keys: [...input.down] }));
      this.answerLate();
      this.fullScreenLeft();
    }
  }

  /** The lock's held answers given once `late` frames have passed since the first was held. */
  private answerLate(): void {
    if (!this.late || !window.__labLock?.held) return;
    this.sinceHeld++;
    if (this.sinceHeld < this.late) return;
    this.sinceHeld = 0;
    this.lab.lockAnswersLate(false);
    this.lab.lockAnswersLate(true);
  }

  /** Full screen's change heard, the page out of full screen without having asked (as the lab never enters it). */
  private fullScreenLeft(): void {
    if (this.fullScreenIn < 0) return;
    if (this.fullScreenIn-- > 0) return;
    document.dispatchEvent(new Event('fullscreenchange'));
  }

  async end(): Promise<void> {
    if (this.late) this.lab.lockAnswersLate(false);
    await this.run(1);
  }
}

/** One press of Esc as `sequence.browser` hands it over, held `sequence.held` frames. */
async function press(lab: Lab, frames: Frames, sequence: Sequence, first: boolean): Promise<void> {
  const locked = pointerLocked();
  const fullScreen = sequence.browser === 'fullScreen' && first;
  if (locked && sequence.browser !== 'keyboardLock') lab.browserLetsGoOfLock();
  if (fullScreen) frames.fullScreenIn = sequence.fullScreenLate;
  const kept = fullScreen || (locked && (sequence.browser === 'windowed' || sequence.browser === 'fullScreen'));
  if (!kept) await lab.keyDown('Escape');
  for (let frame = 0; frame < sequence.held; frame++) {
    if (frame > 0 && frame % REPEAT_EVERY === 0) await lab.keyRepeat('Escape');
    await frames.run(1);
  }
  await lab.keyUp('Escape');
}

/** What a sequence came to: the pause menu after each press, and a second after the last. */
interface Played {
  after: boolean[];
  settled: boolean;
}

/** `sequence` played from the game running, the lock taken where the view takes it. */
async function play(lab: Lab, sequence: Sequence): Promise<Played> {
  const frames = new Frames(lab, sequence.late);
  const after: boolean[] = [];
  for (let count = 0; count < sequence.presses; count++) {
    await press(lab, frames, sequence, count === 0);
    await frames.run(sequence.gap);
    after.push(G.menuOpen);
  }
  await frames.run(SETTLE);
  await frames.end();
  return { after, settled: G.menuOpen };
}

const centre = () => ({ x: innerWidth / 2, y: innerHeight / 2 });

/** The game running at `place` with the menu shut, its lock taken in a close view, as at the start of a sequence. */
async function ready(lab: Lab, place: Place): Promise<void> {
  if (G.menuOpen) {
    document.getElementById('btn-resume')?.click();
    await lab.step(2);
  }
  if (G.menuOpen) throw new Error('lab: cursor: the pause menu wouldn\'t close for the next sequence');
  await lab.step(SETTLE, () => ({ keys: [] }));
  if (place.view === 'top') return;
  lab.pointerLock(true);
  if (!pointerLocked()) await lab.click(centre());
  await lab.until(pointerLocked, LOCK_FRAMES, `${place.name}: the click never took the pointer`);
}

/** Whether `played` toggled once a press, from shut, and stayed. */
function toggledOnce(played: Played): boolean {
  const right = played.after.every((open, index) => open === (index % 2 === 0));
  return right && played.settled === played.after[played.after.length - 1];
}

/** The menu's states as a line reads them. */
function statesOf(played: Played): string {
  const states = played.after.map((open) => (open ? 'open' : 'shut')).join(', ');
  return `${states}; a second later ${played.settled ? 'open' : 'shut'}`;
}

/** The lobby, left by the run as the pause menu's Abandon run leaves it, then `view` reached by V. */
async function toLobby(lab: Lab, view: ViewMode): Promise<void> {
  await lab.step(1, () => ({ keys: ['escape'] }));
  const abandon = document.getElementById('btn-abandon');
  if (!abandon) throw new Error('lab: cursor: no pause menu to leave the run by');
  await pressHeld(abandon);
  await lab.until(() => G.mode === 'menu', 600, 'the run never gave way to the lobby');
  await lab.step(SETTLE, () => ({ keys: [] }));
  for (let count = 0; count < VIEW_PRESSES && viewMode() !== view; count++) {
    await lab.step(1, () => ({ keys: ['v'] }));
    await lab.step(2, () => ({ keys: [] }));
  }
  if (viewMode() !== view) throw new Error(`lab: cursor: the lobby never took the ${view} view`);
}

/** The places played: a run's close views and its top-down view, then the lobby's close view. */
function placesFor(views: ViewMode[]): Place[] {
  const places: Place[] = views.map((view) => ({ name: `run, ${view}`, view, lobby: false }));
  places.push({ name: 'run, top', view: 'top', lobby: false });
  places.push({ name: 'lobby, third', view: 'third', lobby: true });
  return places;
}

/** What `escToggles` found. */
export interface EscFound {
  lines: string[];
  problems: string[];
}

/**
 * Every sequence at every place: a run's views each set up by `setUp`, then the lobby. Ends in the run's top-down
 * view's lobby, the lock let go.
 */
export async function escToggles(lab: Lab, views: ViewMode[], canary: boolean,
  setUp: (view: ViewMode) => Promise<void>): Promise<EscFound> {
  readEscAsBefore(canary);
  const lines: string[] = ['Esc and the pause menu'];
  const problems: string[] = [];
  try {
    for (const place of placesFor(views)) {
      if (place.lobby) await toLobby(lab, place.view);
      else await setUp(place.view);
      // (top-down, no lock to lose: each browser hands the keydown over alike)
      const played = place.view === 'top' ? sequences().filter((sequence) => sequence.browser === 'keyboardLock')
        : sequences();
      let fine = 0;
      for (const sequence of played) {
        await ready(lab, place);
        const result = await play(lab, sequence);
        if (toggledOnce(result)) {
          fine++;
          continue;
        }
        const problem = `${place.name}: ${nameOf(sequence)}: ${statesOf(result)}`;
        problems.push(problem);
      }
      lines.push(`  ${place.name}: ${fine} of ${played.length} sequences toggled once a press`);
    }
  } finally {
    readEscAsBefore(false);
    if (G.menuOpen) document.getElementById('btn-resume')?.click();
    lab.lockAnswersLate(false);
  }
  return { lines, problems };
}
