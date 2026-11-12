// Loading screen. The markup and styles are inline in index.html so it paints before the
// bundle has loaded; boot() reports its steps here and yields so each one gets painted.
import { TIPS } from '../data/tips';
import { dropWind, prepareBlow, logoWindOff, type LogoBlow } from './logoWind';
import { qualityLevel } from '../core/quality';
import { recorder } from '../perf/recorder';
import { sfx } from '../core/audio';

const el = (): HTMLElement => document.getElementById('loading')!;
const sub = (): HTMLElement => el().querySelector<HTMLElement>('.ld-sub')!;

let tipTimer = 0, tipIndex = Math.floor(Math.random() * TIPS.length);
function showTip(): void {
  const t = el().querySelector<HTMLElement>('.ld-tip')!;
  t.innerHTML = `<b>TIP</b>${TIPS[tipIndex++ % TIPS.length]}`;
  t.classList.add('on');
}

/** each step the loading screen showed and when (the page's clock, ms), for the perf report's boot */
export const loadingSteps: { at: number; label: string }[] = [];

/** Show a step, then wait until the browser has painted it: the work that follows blocks the main thread. */
export async function loadingStep(label: string, progress: number): Promise<void> {
  loadingSteps.push({ at: performance.now(), label });
  if (!tipTimer) { showTip(); tipTimer = window.setInterval(showTip, 6000); }
  sub().textContent = label;
  recorder.bootStep(label);
  el().style.setProperty('--p', String(progress));
  await new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r)));
}

// the game runs behind the loading screen until this many frames in a row come in under
// SMOOTH_MS: the very first frames can still stall on work the driver or browser does on first
// use (on a first visit its shader cache is cold), and that should not be seen as a stutter
const SMOOTH_FRAMES = 8, SMOOTH_MS = 70, MAX_WAIT_MS = 4000;

// the logo's particle field gathers into the lobby's logo (a first visit opens on the hero selection screen, which
// has none: it blows away). A plain fade instead with reduced motion, on low
// graphics quality and under (picked, or where Auto settled last time), and on a device where the particles were too slow
// before
const plainExit = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches || (qualityLevel() === 'low' || qualityLevel() === 'verylow') || logoWindOff();
/** the logo's exit, made ready from when the lobby is laid out (`lobbyLaidOut`) */
let exit: Promise<LogoBlow | null> | null = null;
const blowFor = (l: HTMLElement): Promise<LogoBlow | null> => {
  // (the panels' lobby's hero selection screen has a logo of its own to gather into; the village's has none, and the
  // letters blow away)
  const onHeroes = document.querySelector('#heroes:not(.hidden)') !== null;
  const target = document.querySelector<HTMLElement>('#heroes:not(.hidden) .logo-art')
    ?? (onHeroes ? null : document.querySelector<HTMLElement>('#menu .logo-art'));
  return prepareBlow(l.querySelector<HTMLElement>('.ld-logo')!, target);
};

/** Call once the lobby is laid out (its logo is where the particles gather): the logo's exit is made ready while
 *  the lobby's warm-up compiles (made as the loop started, it held the reveal up for 0.3 to 1.2 s). */
export function lobbyLaidOut(): void {
  if (!exit && !plainExit()) exit = blowFor(el());
}

/** The loading screen seen through by a thousandth (`on`), or opaque again: Chrome rasters and draws nothing an
 *  opaque layer covers, so what the boot rehearses under it to build Chrome's programs (the lobby's panels, the
 *  chest's opening, the practice's bar, the tracker, Play together, How to play) is drawn while it's seen through.
 *  Under it opaque, the first walks still met them: the practice's bar 1.3 s, Play together 0.5 to 0.8 s, the
 *  tracker 0.6 s (`npm run stalls -- --scenario walks`). A thousandth of the lobby under it shows by no level of a
 *  colour's 255. */
export function seeThroughLoading(on: boolean): void { el().style.opacity = on ? '0.999' : ''; }

/** The loading screen's animations held still (`on`) or let go: moving, its smoke and embers redraw the whole
 *  screen every frame, where the chest's opening redraws its panels alone, and a return's first opening still
 *  built a compositor's program its rehearsal hadn't (`rehearseChest` in `menus.ts`). */
export function stillLoading(on: boolean): void { el().classList.toggle('still', on); }

/** the most the loading screen takes to leave after the reveal (ms): its logo's exit, or a fade whose end never came */
const LEFT_MOST_MS = 4000;
let resolveLeft = (): void => undefined;
/** resolved once the loading screen has left the page: the logo's exit done, and its particles' frames with it */
export const loadingLeft = new Promise<void>((resolve) => { resolveLeft = resolve; });

/** Call when the game loop starts; once the lobby renders smoothly, calls `onReveal` and leaves (`loadingLeft`). */
export function loadingDone(onReveal: () => void): void {
  const l = el();
  l.style.setProperty('--p', '1');
  const plain = plainExit();
  if (plain) dropWind();
  let blow: LogoBlow | null | undefined = plain ? null : undefined;
  let left = false;
  if (blow === undefined) {
    (exit ?? blowFor(l)).then((b) => { if (left) b?.cancel(); else blow = b; }, () => { blow = null; });
  }
  const start = performance.now();
  let last = start, smooth = 0;
  const reveal = (): void => { l.classList.add('done'); onReveal(); setTimeout(resolveLeft, LEFT_MOST_MS); };
  const leave = (): void => { l.remove(); resolveLeft(); };
  const tick = (now: number): void => {
    smooth = now - last < SMOOTH_MS ? smooth + 1 : 0;
    last = now;
    const waiting = smooth < SMOOTH_FRAMES || blow === undefined;
    if (waiting && now - start < MAX_WAIT_MS) { requestAnimationFrame(tick); return; }
    left = true;
    clearInterval(tipTimer);
    l.querySelector('.ld-tip')!.classList.remove('on');
    if (blow) {
      // the logo blows away over the loading backdrop first; the lobby shows a moment later
      l.classList.add('blowing');
      sfx.logoGust();
      blow.start(reveal, leave);
    } else {
      l.classList.add('plain');
      reveal();
      // (its own fade's end: its parts' transitions end too and bubble up to it, the bar's fill or the tip's fade,
      // and the first of them cut its 0.9 s short at 0.15 to 0.6 s)
      const faded = (event: TransitionEvent): void => {
        if (event.target !== l) return;
        l.removeEventListener('transitionend', faded);
        leave();
      };
      l.addEventListener('transitionend', faded);
    }
  };
  requestAnimationFrame(tick);
}

export function loadingFailed(err: unknown): void {
  clearInterval(tipTimer);
  el().classList.add('failed');
  const noWebgl = !document.createElement('canvas').getContext('webgl2');
  sub().textContent = noWebgl
    ? 'Your browser or device does not support WebGL 2, which Last Stand needs to run.'
    : `Something went wrong while loading: ${err instanceof Error ? err.message : String(err)}`;
}
