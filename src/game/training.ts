// The first visit's training (data/training.ts lists its steps): a new player's steps round the village before its
// portals open. Each is done as the player does it; it can be skipped (the tracker's button, or a portal's card warning
// that it isn't finished). Kept in a cookie: its steps done, or done or skipped. A player who already had a hero when
// this build first loaded is a returning one, and never meets it.
import { readCookie, writeCookie } from '../core/cookies';
import { emit, on } from '../events';
import { TRAINING, type TrainingStep } from '../data/training';
import { input } from '../core/input';

const COOKIE = 'last-stand-training';

/** where the training stands: under way, finished, or skipped */
let state: 'training' | 'done' | 'skipped' = 'done';
const done = new Set<TrainingStep>();

const isStep = (s: string): s is TrainingStep => TRAINING.some((t) => t.id === s);

/** The training as it was left (`firstVisit`: no hero chosen yet, so a new player). */
export function initTraining(firstVisit: boolean): void {
  const saved = readCookie(COOKIE);
  if (saved === 'done' || saved === 'skipped') state = saved;
  else if (saved === null && !firstVisit) state = 'done';
  else {
    state = 'training';
    for (const s of (saved ?? '').split(',')) if (isStep(s)) done.add(s);
    save();
  }
  on('dummyHit', () => completeStep('dummy'));
  // (the tracker, laid out under the loading screen, shows the state read)
  emit('trainingChanged');
}

/** Whether the training is under way: the portals warn and wait. */
export const trainingPending = (): boolean => state === 'training';

/** The steps a player with this input has to take. */
export const trainingSteps = (): typeof TRAINING => TRAINING.filter((t) => !(input.touchMode && t.mouseOnly));

/** Whether step `s` is done. */
export const stepDone = (s: TrainingStep): boolean => done.has(s);

/** Step `s` done (nothing if the training isn't under way, or it was done already). */
export function completeStep(s: TrainingStep): void {
  if (state !== 'training' || done.has(s)) return;
  done.add(s);
  if (trainingSteps().every((t) => done.has(t.id))) state = 'done';
  save();
  emit('trainingChanged');
}

/** The training skipped: the portals open. */
export function skipTraining(): void {
  if (state !== 'training') return;
  state = 'skipped';
  save();
  emit('trainingChanged');
}

/** The training begun afresh, as a new player's (a harness's look at it; the notice board offers the tutorial in its
 *  stead: two ways to start over read as one, "why do we need 2 ways to restart training?"). */
export function restartTraining(): void {
  state = 'training';
  done.clear();
  save();
  emit('trainingChanged');
}

function save(): void {
  writeCookie(COOKIE, state === 'training' ? [...done].join(',') : state);
}
