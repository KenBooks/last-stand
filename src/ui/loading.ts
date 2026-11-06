// Loading screen. The markup and styles are inline in index.html so it paints before the
// bundle has loaded; boot() reports its steps here and yields so each one gets painted.
import { TIPS } from '../data/tips';
import { dropWind, prepareBlow, logoWindOff, type LogoBlow } from './logoWind';
import { qualityLevel } from '../core/quality';
import { recorder } from '../perf/recorder';

const el = (): HTMLElement => document.getElementById('loading')!;
const sub = (): HTMLElement => el().querySelector<HTMLElement>('.ld-sub')!;

let tipTimer = 0, tipIndex = Math.floor(Math.random() * TIPS.length);
function showTip(): void {
  const t = el().querySelector<HTMLElement>('.ld-tip')!;
  t.innerHTML = `<b>TIP</b>${TIPS[tipIndex++ % TIPS.length]}`;
  t.classList.add('on');
}

/** Show a step, then wait until the browser has painted it: the work that follows blocks the main thread. */
export async function loadingStep(label: string, progress: number): Promise<void> {
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

// the logo's particle field gathers into the lobby's logo (a first visit's hero selection screen's, ui/heroSelect.ts,
// where it opens on that). A plain fade instead with reduced motion, on low
// graphics quality (picked, or where Auto settled last time), and on a device where the particles were too slow
// before
const plainExit = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches || qualityLevel() === 'low' || logoWindOff();
/** the logo's exit, made ready from when the lobby is laid out (`lobbyLaidOut`) */
let exit: Promise<LogoBlow | null> | null = null;
const blowFor = (l: HTMLElement): Promise<LogoBlow | null> => {
  const target = document.querySelector<HTMLElement>('#heroes:not(.hidden) .logo-art')
    ?? document.querySelector<HTMLElement>('#menu .logo-art');
  return prepareBlow(l.querySelector<HTMLElement>('.ld-logo')!, target);
};

/** Call once the lobby is laid out (its logo is where the particles gather): the logo's exit is made ready while
 *  the lobby's warm-up compiles (made as the loop started, it held the reveal up for 0.3 to 1.2 s). */
export function lobbyLaidOut(): void {
  if (!exit && !plainExit()) exit = blowFor(el());
}

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
