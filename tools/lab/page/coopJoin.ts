// A co-op guest's joining bar and the host's word of who it waits for (#561: party members "may see none while
// waiting for the battle to begin"). The guest's bar (`#readying.join`, ui/readying.ts `showJoining`) must show from
// the host's start till its run has begun, on top of whatever it has open, and be drawn in the frame before its run
// begins, its fight warm or not; the host's countdown line names the guest it waits for, and the guest's party frame
// there says how far along it is (`Readying 50%`, from the guest's `rdy` reports). Read by node/coop.mjs.

import { G } from '../../../src/state';
import type { Lab } from './lab';

/** What a game shows of a guest joining a run, this frame. */
export interface JoinState {
  /** the joining bar shown here, what it says, how far it's filled (0 to 1), and whether it's what lies at the middle
   *  of the screen (over the hall, the save slots, the dialogs) */
  shown: boolean;
  label: string;
  share: number;
  onTop: boolean;
  /** the run's objective line (the held countdown's "Waiting for Guest…"), '' out of a run */
  line: string;
  /** each party frame's state line, by the name it shows ("Readying 50%") */
  cards: Record<string, string>;
}

/** What a game saw of its joining bar since `coopJoinAfresh`: the frames it showed in, and whether it showed in the
 *  frame drawn just before the run began here (null: no run began). */
export interface JoinSeen { frames: number; asRunBegan: boolean | null }

const bar = (): HTMLElement | null => document.getElementById('readying');
const shownNow = (): boolean => {
  const el = bar();
  return !!el && el.classList.contains('on') && el.classList.contains('join') && getComputedStyle(el).display !== 'none';
};

let seen: JoinSeen = { frames: 0, asRunBegan: null };
let lastMode = '';
let lastShown = false;

/** Every frame the lab steps (page/coop.ts `coopFrames`): the joining bar counted, and read as the run begins. */
export function watchJoin(): void {
  const shown = shownNow();
  if (shown) seen.frames++;
  if (G.mode === 'run' && lastMode === 'menu' && seen.asRunBegan === null) seen.asRunBegan = lastShown || shown;
  lastMode = G.mode;
  lastShown = shown;
}

/** Counting the joining bar afresh (before the host's start). */
export function coopJoinAfresh(): void {
  seen = { frames: 0, asRunBegan: null };
  lastMode = G.mode;
  lastShown = shownNow();
}

export const coopJoinSeen = (): JoinSeen => ({ ...seen });

export function joinNow(): JoinState {
  const el = bar();
  const shown = shownNow();
  const middle = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
  const cards: Record<string, string> = {};
  for (const frame of document.querySelectorAll('#party > *')) {
    const name = frame.querySelector('.pf-name')?.textContent ?? '';
    if (name) cards[name] = frame.querySelector('.pf-state')?.textContent ?? '';
  }
  return {
    shown,
    label: el?.querySelector('.rd-sub')?.textContent ?? '',
    share: Number(el?.style.getPropertyValue('--p') || 0),
    onTop: shown && !!el && !!middle && el.contains(middle),
    line: G.mode === 'run' ? document.querySelector('.obj-line .obj-text')?.textContent ?? '' : '',
    cards,
  };
}

/** The guest's fight's warm-up `share` of the way (its bar fills, and its reports tell the host). */
export async function coopReadyingShare(_lab: Lab, { share }: { share: number }): Promise<void> {
  const warm = await import('../../../src/game/warm');
  warm.warming('fight', share);
}

/** The canary: the guest's joining bar taken off the screen every frame, which must be caught. */
export function coopHideJoining(lab: Lab): void {
  if (!lab.beforeFrame.includes(hide)) lab.beforeFrame.push(hide);
}
/** The canary's hook taken off again. */
export function coopShowJoining(lab: Lab): void {
  const at = lab.beforeFrame.indexOf(hide);
  if (at >= 0) lab.beforeFrame.splice(at, 1);
}
function hide(): void { bar()?.classList.remove('on', 'join'); }
