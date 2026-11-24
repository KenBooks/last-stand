// `lab ui`'s `waveAfterDuel` state (`../uiKit.ts` `Steps`, #855: "players sometimes see the wrong wave number (often
// wave 1)"): the run's wave badge written over as a duel writes its round there (`ui/duelHud.ts`: "1", straight into
// the element), and a frame later it must show the run's wave again. The HUD kept what it last wrote and skipped a
// write that looked the same, so a run after a duel at the wave it last showed kept the duel's last round. Its canary
// writes the round over the badge again after that frame, which must be found.
import { G } from '../../../../src/state';
import type { Steps } from '../uiKit';
import { plantsCaught } from '../uiKit';
import type { Found } from '../uiKit';

/** what a duel's first round writes into the badge */
const DUEL_ROUND = '1';
/** the wave the run is set to for the check: any but the duel's round */
const WAVE = 7;
/** frames the HUD is given to show the run's wave again */
const FRAMES = 2;
/** the canary's plant, named in the problem it must cause */
const PLANT = 'the duel\'s round written after the HUD';

const badge = (): HTMLElement => document.querySelector<HTMLElement>('#wavebadge .gem-num')!;

let wave = 0;

const STATE: Steps = {
  order: 325,
  inRun: true,
  async open(lab) {
    wave = G.run!.wave;
    G.run!.wave = WAVE;
    await lab.step(FRAMES);
    badge().textContent = DUEL_ROUND;
    await lab.step(FRAMES);
  },
  close() {
    G.run!.wave = wave;
  },
  check(canary): Found {
    if (canary) badge().textContent = DUEL_ROUND;
    const shown = badge().textContent ?? '';
    const lines = [`  the wave badge after a duel's round was written over it: ${shown} (the run's wave ${WAVE})`];
    const problems = shown === String(WAVE)
      ? []
      : [`waveAfterDuel: the badge shows ${shown}, not the run's wave ${WAVE}${canary ? ` (${PLANT})` : ''}`];
    return { lines, problems };
  },
  canary: (found, state) => plantsCaught(found, state, [{ name: PLANT, what: PLANT }]),
};
export default STATE;
