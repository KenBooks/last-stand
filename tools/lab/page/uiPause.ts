// `lab ui`'s pause menu (src/ui/menus.ts): opened on its Controls tab, as every time, and on its Settings tab. Each
// must fit the window without scrolling, the box inside the window and no page of it taller than its cell (the menu
// had the controls and the settings side by side, and grew past a short screen's height as settings were added). Both
// pages share one cell, so the box is the same size on either tab. Resume and Abandon stand either side of the title,
// each inside the box (on a tablet held upright Abandon ran past its edge). Its canary makes a settings row 600 px tall,
// which must make the box scroll. Abandon run acts only once held 2 s (`pauseAbandon`): clicked it says to hold and
// stays, held a second and let go it stays, held through it leaves the run; its canary makes the hold 0 ms, and the
// click must be caught abandoning.
import type { Lab } from './lab';
import { ABANDON_HOLD_MS, PAUSE_TAB_COOKIE, pauseTab, showPause, type PauseTab } from '../../../src/ui/menus';
import { audioContext, musicOutput, setVolumes } from '../../../src/core/audio';
import { readCookie, removeCookie, writeCookie } from '../../../src/core/cookies';

/** What a state found besides its boxes: lines for its report, and its problems. */
export interface PauseFound {
  lines: string[];
  problems: string[];
}

/** what the canary makes one settings row's height (css px) */
const CANARY_PX = 600;
/** the problem the canary must raise */
export const PAUSE_CANARY = { name: 'scrolls', what: 'a settings row 600 px tall' };
/** what must lie inside the box (shown ones: Abandon is hidden in the lobby) */
const INSIDE = ['#btn-resume', '#btn-abandon', '.pb-title', '.pb-tabs'];
/** a scroll this small (css px) is the box's rounding, not a scroll */
const ROUNDING_PX = 1;

let planted: HTMLElement | null = null;

/** The pause menu opened on `tab`; with the canary, a settings row made too tall to fit. */
export function openPause(tab: PauseTab, canary: boolean): void {
  showPause(true);
  pauseTab(tab);
  if (!canary) return;
  planted = document.querySelector<HTMLElement>('#pause .pb-opts .opt-row');
  if (planted) planted.style.minHeight = `${CANARY_PX}px`;
}

export function closePause(): void {
  if (planted) planted.style.minHeight = '';
  planted = null;
  showPause(false);
}

/** the parts a profile lists under its button (ui/profileTab.ts `PARTS_SHOWN`), as long as a phone's read */
const PROFILED_PARTS = [
  'what\'s cut out: leaves, grass: 12.4 ms (35%)',
  'half the scene\'s pixels: 9.8 ms (28%)',
  'what\'s blended: smoke, glows, effects: 4.1 ms (12%)',
  'the point lights where they reach: 2.2 ms (6%)',
  'the lit shading, against a plain colour: 1.9 ms (5%)',
];

/** The pause menu on its Performance tab as a profile leaves it, at its fullest: its note, the costliest parts and
 *  Send shown (what a phone found by a bonfire, written in). */
export function openPauseProfiled(canary: boolean): void {
  openPause('performance', canary);
  document.querySelector('.profile-note')!.textContent = 'The frame here: 35.2 ms (28 fps). Its costliest parts:';
  const list = document.querySelector<HTMLElement>('.profile-parts')!;
  const item = (text: string) => Object.assign(document.createElement('li'), { textContent: text });
  list.replaceChildren(...PROFILED_PARTS.map(item));
  list.classList.remove('hidden');
  document.querySelector('#btn-profile-send')!.classList.remove('hidden');
}

/** The profile's results put away again, and the menu closed. */
export function closePauseProfiled(): void {
  document.querySelector('.profile-parts')!.classList.add('hidden');
  document.querySelector('#btn-profile-send')!.classList.add('hidden');
  closePause();
}

/** the problem the profiling canary must raise: the pause menu left shown over the scene being timed */
export const PROFILING_CANARY = { name: 'shown while profiling', what: 'the pause menu left shown' };
/** the panels that must be hidden while the profiler times the scene */
const HIDDEN_WHILE_PROFILING = ['#pause', '#hud', '#diag', '#touch', '#menu'];

/** The profiler as it runs (ui/profileTab.ts `showRunning`): every panel hidden, its pane at the top part-way
 *  through, its longest part named; with the canary the pause menu left shown. */
export function openProfiling(canary: boolean): void {
  showPause(true);
  pauseTab('performance');
  document.body.classList.add('profiling');
  document.querySelector('#profiling')!.classList.remove('hidden');
  document.querySelector<HTMLElement>('#profiling .prof-fill')!.style.transform = 'scaleX(0.4)';
  document.querySelector('#profiling .prof-part')!.textContent = 'Timing what\'s blended: smoke, glows, effects';
  document.querySelector('#profiling .prof-left')!.textContent = '40%, about 9 s left';
  if (canary) document.querySelector<HTMLElement>('#pause')!.style.setProperty('visibility', 'visible', 'important');
}

export function closeProfiling(): void {
  document.querySelector<HTMLElement>('#pause')!.style.removeProperty('visibility');
  document.body.classList.remove('profiling');
  document.querySelector('#profiling')!.classList.add('hidden');
  showPause(false);
}

/** The pane inside the window, its lines on one line each and Cancel in it, every other panel hidden. */
export function profilingShown(): PauseFound {
  const pane = document.querySelector<HTMLElement>('#profiling');
  if (!pane?.checkVisibility()) return { lines: [], problems: ['profiling: no pane shown'] };
  const problems: string[] = [];
  const rect = pane.getBoundingClientRect();
  const outside = rect.top < 0 || rect.left < 0 || rect.bottom > innerHeight || rect.right > innerWidth;
  if (outside) problems.push('profiling: the pane reaches past the window');
  const cancel = pane.querySelector<HTMLElement>('#btn-profile-cancel')!.getBoundingClientRect();
  if (cancel.right > rect.right || cancel.bottom > rect.bottom) problems.push('profiling: Cancel runs past the pane');
  for (const selector of HIDDEN_WHILE_PROFILING) {
    const panel = document.querySelector<HTMLElement>(selector);
    if (!panel?.checkVisibility({ visibilityProperty: true })) continue;
    problems.push(`profiling: ${selector} ${PROFILING_CANARY.name}`);
  }
  const share = (100 * rect.height) / innerHeight;
  return { lines: [`  the pane: ${share.toFixed(1)}% of the window's height`], problems };
}

/** how long a hold that's let go early is held (ms): half of Abandon's */
const SHORT_HOLD_MS = 1000;
/** past Abandon's hold, what a full hold waits on top (ms), for its timer to fire */
const HOLD_SLACK_MS = 300;
/** the problem the abandon canary must raise */
export const ABANDON_CANARY = { name: 'a click abandoned', what: 'Abandon run acting on a click' };

const abandonButton = (): HTMLElement => document.querySelector<HTMLElement>('#btn-abandon')!;
/** whether the run was abandoned: Abandon closes the pause menu as it leaves the run */
const abandoned = (): boolean => document.querySelector('#pause')!.classList.contains('hidden');
const realWait = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

/** The pause menu opened over the run and Abandon run clicked, as a stray click: it must say to hold, and stay. With
 *  the canary, its hold made 0 ms, so the click acts. */
export async function openPauseAbandon(lab: Lab, canary: boolean): Promise<void> {
  showPause(true);
  if (canary) abandonButton().dataset.holdMs = '0';
  await lab.clickOn(abandonButton());
}

export function closePauseAbandon(): void {
  abandonButton().dataset.holdMs = String(ABANDON_HOLD_MS);
  showPause(false);
}

/** Abandon run held as a player holds it: clicked (as opened), held half its time and let go, then held through. */
export async function pauseAbandonChecked(lab: Lab): Promise<PauseFound> {
  const lines: string[] = [];
  const problems: string[] = [];
  const button = abandonButton();
  const hinting = () => button.classList.contains('hinting');
  if (abandoned()) {
    problems.push(`pauseAbandon: ${ABANDON_CANARY.name}`);
    return { lines: ['  a click: abandoned the run'], problems };
  }
  lines.push(`  a click: ${hinting() ? `stayed, saying "${button.dataset.hint}"` : 'stayed, saying nothing'}`);
  if (!hinting()) problems.push('pauseAbandon: a click said nothing about holding');
  const at = middleOf(button);
  await lab.mouseDown(at);
  const filling = button.classList.contains('holding');
  await realWait(SHORT_HOLD_MS);
  await lab.mouseUp(at);
  const early = abandoned() ? 'abandoned the run' : 'stayed';
  lines.push(`  held ${SHORT_HOLD_MS / 1000} s: ${early}, ${filling ? 'filling as held' : 'no fill'}`);
  if (abandoned()) problems.push(`pauseAbandon: held ${SHORT_HOLD_MS / 1000} s, it abandoned the run`);
  if (!filling) problems.push('pauseAbandon: held, no fill ran across it');
  if (!hinting()) problems.push('pauseAbandon: let go early, it said nothing about holding');
  await lab.mouseDown(at);
  await realWait(ABANDON_HOLD_MS + HOLD_SLACK_MS);
  const through = abandoned();
  await lab.mouseUp(at);
  lines.push(`  held ${ABANDON_HOLD_MS / 1000} s: ${through ? 'abandoned the run' : 'stayed'}`);
  if (!through) problems.push(`pauseAbandon: held ${ABANDON_HOLD_MS / 1000} s, it never abandoned the run`);
  return { lines, problems };
}

/** the problem the volume canary must raise */
export const VOLUME_CANARY = { name: 'unsaved', what: 'the music volume set but never saved' };
/** where along the Music slider the check clicks (a share of its width), and how near the volume must land to it */
const VOLUME_CLICK = 0.25;
const VOLUME_NEAR = 0.06;
/** how long the music's gain is given to ease to the volume, by the audio's own clock (s: its time constant is 0.03),
 *  and the most real time that may take (ms: a click resumes a suspended context, which takes a while to run; waited
 *  out in real time, the gain was read 20 to 80 ms into its ease) */
const VOLUME_EASE_S = 0.3;
const AUDIO_LIMIT_MS = 5000;
const AUDIO_POLL_MS = 20;
/** the volumes' cookie (src/core/audio.ts): master, music, effects */
const VOLUME_COOKIE = 'last-stand-volume';
let volumeCanary = false;

/** The pause menu opened on its Settings tab, to set the music's volume as a player does. With the canary, the
 *  setting is lost before it's read back, as if it were never saved. */
export function openPauseVolume(canary: boolean): void {
  openPause('settings', false);
  volumeCanary = canary;
}

/** Every volume back to full, the pause menu closed. */
export function closePauseVolume(): void {
  setVolumes({ master: 1, music: 1, effects: 1 });
  closePause();
}

/**
 * The Music slider clicked a quarter of the way along it, with the mouse as a player does (`pauseVolume`): its volume
 * must land there, the slider must say it, the setting must be saved (`last-stand-volume`) and the music's own gain
 * must ease to it, as its square (#408).
 */
export async function pauseVolumeChecked(lab: Lab): Promise<PauseFound> {
  const problems: string[] = [];
  const slider = document.querySelector<HTMLInputElement>('#opt-volume [data-volume="music"]');
  if (!slider?.checkVisibility()) return { lines: [], problems: ['pauseVolume: no Music slider shown'] };
  const box = slider.getBoundingClientRect();
  await lab.click({ x: box.left + box.width * VOLUME_CLICK, y: box.top + box.height / 2 });
  if (volumeCanary) writeCookie(VOLUME_COOKIE, '1,1,1');
  if (!(await audioRanFor(VOLUME_EASE_S))) problems.push('pauseVolume: the game\'s audio never ran after the click');
  const share = Number(slider.value);
  const shown = slider.nextElementSibling?.textContent ?? '';
  const saved = Number((readCookie(VOLUME_COOKIE) ?? '').split(',')[1]);
  const heard = (musicOutput() as GainNode | null)?.gain.value ?? Number.NaN;
  const lines = [
    `  the Music slider clicked ${VOLUME_CLICK * 100}% along: at ${share.toFixed(2)}, showing ${shown}, `
      + `saved ${saved}, the music's gain ${heard.toFixed(3)}`,
  ];
  if (Math.abs(share - VOLUME_CLICK) > VOLUME_NEAR) problems.push(`pauseVolume: the click set ${share}`);
  if (shown !== `${Math.round(share * 100)}%`) problems.push(`pauseVolume: the slider at ${share} shows ${shown}`);
  if (saved !== share) problems.push(`pauseVolume: the volume ${share} ${VOLUME_CANARY.name} (saved: ${saved})`);
  if (!(Math.abs(heard - share * share) < 0.01)) {
    problems.push(`pauseVolume: the music's gain is ${heard.toFixed(3)} at a volume of ${share}`);
  }
  return { lines, problems };
}

/** Waits until the game's audio has run `seconds` by its own clock (false: it hadn't within `AUDIO_LIMIT_MS`). */
async function audioRanFor(seconds: number): Promise<boolean> {
  const context = audioContext();
  if (!context) return false;
  const until = context.currentTime + seconds;
  for (let waited = 0; waited < AUDIO_LIMIT_MS; waited += AUDIO_POLL_MS) {
    if (context.currentTime >= until) return true;
    await realWait(AUDIO_POLL_MS);
  }
  return false;
}

function middleOf(element: Element): { x: number; y: number } {
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

const share = (part: number, whole: number): string => ((100 * part) / whole).toFixed(1);

/** The tab shown, the box's height as a share of the window's, and whether it scrolls or leaves the window. */
export function pauseShown(tab: PauseTab): PauseFound {
  const box = document.querySelector<HTMLElement>('#pause .pause-box');
  if (!box) return { lines: [], problems: [`pause, ${tab}: no pause menu`] };
  const problems: string[] = [];
  const active = document.querySelector<HTMLElement>('[data-pause-tab].active')?.dataset.pauseTab;
  if (active !== tab) problems.push(`pause, ${tab}: the ${active ?? 'no'} tab is shown`);
  const shown = document.querySelector<HTMLElement>(`[data-pause-page="${tab}"]`);
  if (!shown || shown.classList.contains('off')) problems.push(`pause, ${tab}: its page is hidden`);
  const scroll = box.scrollHeight - box.clientHeight;
  if (scroll > ROUNDING_PX) problems.push(`pause, ${tab}: the menu scrolls (${scroll} px more than it shows)`);
  const rect = box.getBoundingClientRect();
  const outside = rect.top < 0 || rect.left < 0 || rect.bottom > innerHeight || rect.right > innerWidth;
  if (outside) problems.push(`pause, ${tab}: the menu reaches past the window`);
  for (const selector of INSIDE) {
    const part = box.querySelector<HTMLElement>(selector);
    if (!part?.checkVisibility()) continue;
    const at = part.getBoundingClientRect();
    const past = at.left < rect.left || at.right > rect.right || at.top < rect.top || at.bottom > rect.bottom;
    if (past) problems.push(`pause, ${tab}: ${selector} reaches past the menu's edge`);
  }
  const lines = [
    `  ${tab} tab: the menu ${share(rect.height, innerHeight)}% of the window's height, `
      + `${share(rect.width, innerWidth)}% of its width, ${scroll > ROUNDING_PX ? 'scrolling' : 'no scrolling'}`,
  ];
  return { lines, problems };
}

/** the problem the kept tab's canary must raise */
export const TAB_CANARY = { name: 'opened on', what: 'the kept tab lost before the menu opened again' };

/**
 * The tab a player chose kept (`pauseTabKept`): the menu opened, Settings clicked with the mouse as a player does,
 * the menu closed and opened again; it must open on Settings, the cookie saying so (read again as the menu opens, so
 * a reload keeps it); then Controls clicked, and kept likewise. With the canary, the cookie is lost before it opens
 * again, which must be caught. The cookie is taken away after, as a first visit has none.
 */
export async function pauseTabKept(lab: Lab, canary: boolean): Promise<PauseFound> {
  const lines: string[] = [];
  const problems: string[] = [];
  try {
    for (const tab of ['settings', 'controls'] as const) {
      showPause(true);
      const button = document.querySelector<HTMLElement>(`[data-pause-tab="${tab}"]`);
      if (!button?.checkVisibility()) return { lines, problems: [`pauseTabKept: no ${tab} tab shown`] };
      await lab.click(middleOf(button));
      showPause(false);
      if (canary) removeCookie(PAUSE_TAB_COOKIE);
      showPause(true);
      const opened = document.querySelector<HTMLElement>('[data-pause-tab].active')?.dataset.pauseTab;
      const kept = readCookie(PAUSE_TAB_COOKIE);
      lines.push(`  ${tab} clicked, the menu closed and opened again: ${TAB_CANARY.name} ${opened}, kept ${kept}`);
      if (opened !== tab) problems.push(`pauseTabKept: ${tab} clicked, the menu ${TAB_CANARY.name} ${opened}`);
      if (kept !== tab) problems.push(`pauseTabKept: ${tab} clicked, the cookie kept ${kept}`);
      showPause(false);
    }
  } finally {
    removeCookie(PAUSE_TAB_COOKIE);
  }
  return { lines, problems };
}
