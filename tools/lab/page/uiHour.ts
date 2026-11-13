// `lab ui`'s time of day: the pause menu's slider for the hour the village is lit for (`src/game/clock.ts`), shown in
// the village alone. In the lobby's pause menu it must show within the window, hold the hour it's moved to and say
// it, and its first step must give the clock back (Auto); in a run's it mustn't show (a biome keeps its own light).
// `canary` leaves the hour held as the slider goes back to Auto, which must be caught.
import { G } from '../../../src/state';
import { heldHour, holdHour } from '../../../src/game/clock';
import { pauseTab, showPause } from '../../../src/ui/menus';

/** What a state's check found: its lines and its problems. */
export interface HourFound { lines: string[]; problems: string[] }

/** the canary's problem as the check names it, and what it plants */
export const HOUR_CANARY = { name: 'Auto left the hour held', what: 'the hour left held at Auto' };

/** the hour the slider is moved to, and its first step, Auto */
const TRIED = 21.5;
const AUTO = -0.5;

/** The slider moved to `value` as a player's drag leaves it: its value set and its input heard. */
function slideTo(value: number): void {
  const slider = document.querySelector<HTMLInputElement>('#opt-hour');
  if (!slider) throw new Error('lab: ui: the pause menu has no time of day slider');
  slider.value = String(value);
  slider.dispatchEvent(new Event('input', { bubbles: true }));
}

/** What the slider's value says now. */
const shownValue = (): string => document.querySelector('#opt-hour-value')?.textContent ?? '';

/** Whether the time of day's row is shown, and its box within the window. */
function rowShown(): { shown: boolean; within: boolean } {
  const row = document.querySelector<HTMLElement>('.hour-row');
  if (!row || row.classList.contains('hidden') || !row.offsetParent) return { shown: false, within: true };
  const box = row.getBoundingClientRect();
  const inside = box.left >= -0.5 && box.top >= -0.5;
  const within = inside && box.right <= innerWidth + 0.5 && box.bottom <= innerHeight + 0.5;
  return { shown: true, within };
}

/** The lobby's pause menu opened in the village, on its Settings tab (the time of day's). */
export function openPauseLobby(): void {
  if (G.arena.place !== 'village') throw new Error('lab: ui: the lobby is not in the village');
  showPause(true);
  pauseTab('settings');
}

/** The lobby's pause menu put away, the clock followed again. */
export function closePauseLobby(): void {
  holdHour(null);
  showPause(false);
}

/** The slider in the lobby's pause menu: shown, holding the hour it's moved to, and Auto giving the clock back. */
export function hourShown(canary: boolean): HourFound {
  const problems: string[] = [];
  const row = rowShown();
  if (!row.shown) problems.push('pauseLobby: the time of day is not shown in the village');
  if (!row.within) problems.push('pauseLobby: the time of day reaches out of the window');
  slideTo(TRIED);
  const held = heldHour();
  const heldSays = shownValue();
  if (held !== TRIED) problems.push(`pauseLobby: the slider at ${TRIED} held the hour at ${held}`);
  if (heldSays !== '21:30') problems.push(`pauseLobby: the slider at ${TRIED} says "${heldSays}"`);
  slideTo(AUTO);
  if (canary) holdHour(TRIED);
  const after = heldHour();
  const autoSays = shownValue();
  if (after !== null) problems.push(`pauseLobby: ${HOUR_CANARY.name} at ${after}`);
  if (!autoSays.startsWith('Auto')) problems.push(`pauseLobby: the slider at Auto says "${autoSays}"`);
  holdHour(null);
  const lines = [`  time of day: shown ${row.shown}, at ${TRIED} held ${held} ("${heldSays}"), at Auto held ${after}`];
  return { lines, problems };
}

/** The run's pause menu: no time of day in it. */
export function hourHiddenInRun(): HourFound {
  const { shown } = rowShown();
  const problems = shown ? ['pause: the time of day is shown in a run'] : [];
  return { lines: [`  time of day: shown ${shown} in a run`], problems };
}
