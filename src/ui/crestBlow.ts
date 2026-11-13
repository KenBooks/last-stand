// The lobby's crest blown away (ui/logoWind.ts): the logo over the village stays a few seconds, then the wind takes
// its letters as sand, its tagline fading with them, and leaves the town to look at. It comes back each time the lobby
// does (from a run, the hero selection screen). With reduced motion, Low quality or the wind switched off, it fades.
// Its context is made ahead (at the boot, and as it's put back for the next time) and it blows once that has linked:
// made as it blew, a first visit's blow came in the fight's warm-up after Start and its reads waited behind its
// compiles, the page held 840 ms (`npm run stalls -- --scenario boot`, from Start).
import { logoWindOff, prepareBlow, windAhead, windLinked, type WindContext } from './logoWind';

/** how long the crest stays over the village before the wind takes it (s) */
const STAYS = 8;

let crest: HTMLElement, art: HTMLElement;
/** how long the village has been shown with the crest up, and where the crest stands */
let shownFor = 0, state: 'up' | 'blowing' | 'gone' = 'up';
/** the next blow's context, made ahead (none where it fades) */
let wind: WindContext | null = null;

const plainBlow = (): boolean => logoWindOff() || matchMedia('(prefers-reduced-motion: reduce)').matches;
/** The next blow's context made, where it will blow. */
function windForNext(): void {
  if (!wind && !plainBlow()) wind = windAhead();
}

/** The crest found. */
export function initCrestBlow(): void {
  crest = document.querySelector<HTMLElement>('.menu-crest')!;
  art = crest.querySelector<HTMLElement>('.logo .logo-art')!;
  windForNext();
}

/** Its frame: counting while the village is `showing`, the crest blown away once it has stayed, or at once when
 *  `aside` (the village's map open: the crest stood over its title); put back up as the lobby goes (`showing` false),
 *  for the next time it shows. */
export function updateCrestBlow(dt: number, showing: boolean, aside = false): void {
  if (!showing) {
    if (state !== 'up') putBack();
    shownFor = 0;
    return;
  }
  if (state !== 'up') return;
  shownFor += dt;
  // (its context not linked yet, it waits; the map opened, it goes at once, faded if its context hasn't linked)
  const ready = !wind || windLinked(wind);
  if (aside || (shownFor >= STAYS && ready)) void blowAway(!ready);
}

/** The crest blown away on the context made for it (`fade`: faded, as its context hasn't linked yet). */
async function blowAway(fade: boolean): Promise<void> {
  state = 'blowing';
  crest.classList.add('blowing');
  showLetters();
  const own = fade ? null : wind;
  if (own) wind = null;
  const blow = plainBlow() || !own ? null : await prepareBlow(art, null, own);
  if (state !== 'blowing') {
    blow?.cancel();
    return;
  }
  if (!blow) {
    gone();
    return;
  }
  blow.start(() => undefined, gone);
}

function gone(): void {
  if (state !== 'blowing') return;
  state = 'gone';
  crest.classList.add('blown');
}

/** The letters as themselves: the loading screen's exit may have left their picture in their place. */
function showLetters(): void {
  art.querySelectorAll('canvas').forEach((c) => c.remove());
  art.querySelectorAll<SVGSVGElement>('svg').forEach((s) => { s.style.visibility = ''; });
}

/** The crest whole again, nothing of the wind's left on it. */
function putBack(): void {
  state = 'up';
  windForNext();
  crest.classList.remove('blowing', 'blown');
  art.querySelectorAll<SVGSVGElement>('svg').forEach((s) => s.getAnimations().forEach((a) => a.cancel()));
}
