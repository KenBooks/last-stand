// The training's tracker (game/training.ts): a small card in the lobby's corner listing the first visit's steps, each
// ticked as it's done, and a button to skip them; finished, it says the portals are open, and goes a moment later.
// It shows while the village takes the hero's input (no panel, map or screen over it).
import { on } from '../events';
import { skipTraining, stepDone, trainingPending, trainingSteps } from '../game/training';
import { sfx } from '../core/audio';
import { input } from '../core/input';

/** how long the tracker says the training is finished before it goes (s) */
const FINISHED_FOR = 5;

let root: HTMLElement, list: HTMLElement;
/** whether it's shown now, and how long it has left saying the training is finished */
let shown = false, finishing = 0;
/** whether the steps were last told for touch */
let touchSaid = false;

/** The tracker's markup filled in, following the training as it changes. */
export function initTrainingTracker(): void {
  root = document.querySelector<HTMLElement>('#training')!;
  list = root.querySelector<HTMLElement>('.tr-steps')!;
  root.querySelector<HTMLElement>('.tr-skip')!.addEventListener('click', () => {
    sfx.click();
    skipTraining();
  });
  render();
  // (shown under the loading screen, so its first raster builds Chrome's Skia programs there: shown first at the
  // reveal, a first visit's held Chrome's GPU process 0.3 to 0.4 s; the first frame after it hides it if it's done)
  root.classList.remove('hidden');
  shown = true;
  on('trainingChanged', () => {
    const wasPending = root.classList.contains('pending');
    render();
    if (wasPending && !trainingPending()) {
      finishing = FINISHED_FOR;
      sfx.click();
    }
  });
}

/** Its frame: shown while `visible` and the training is under way or just finished. */
export function updateTrainingTracker(dt: number, visible: boolean): void {
  if (finishing > 0) finishing = Math.max(0, finishing - dt);
  // (its keys said with a keyboard alone: told again as the player takes up the other)
  if (input.touchMode !== touchSaid) {
    touchSaid = input.touchMode;
    render();
  }
  const show = visible && (trainingPending() || finishing > 0);
  if (show === shown) return;
  shown = show;
  root.classList.toggle('hidden', !show);
}

function render(): void {
  const pending = trainingPending();
  root.classList.toggle('pending', pending);
  list.replaceChildren(...trainingSteps().map((t) => {
    const li = document.createElement('li');
    li.textContent = input.touchMode ? t.touchText ?? t.text : t.key ? `${t.text} (${t.key})` : t.text;
    li.classList.toggle('done', stepDone(t.id));
    return li;
  }));
}
