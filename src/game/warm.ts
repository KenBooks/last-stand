// Whether the programs something needs are warm. The lobby shows once its own are compiled (game/warmup.ts
// warmLobby); the rest in two needs (warmTheRest): the fight's (the foes, the other biomes), compiled behind the lobby
// where they come from a cache, and the heroes' (the other classes'), compiled when something needs them. Until then
// what needs them waits, pressed early, and goes ahead once they're warm, the fight's loading bar shown meanwhile
// (ui/readying.ts), saying what it readies: Start and a biome pick need the fight's; a class pick the heroes'; a save
// slot pick and a co-op room, both (a partner's hero is any class, and a guest's run starts with the host's).

import { G } from '../state';

/** what's warmed after the lobby shows: the fight's programs, the other heroes' */
export type Need = 'fight' | 'heroes';
const NEEDS: Need[] = ['fight', 'heroes'];

/** One need's state: warm, wanted now, how far its warm-up has got (0 to 1), and the acts waiting for it. */
interface NeedState {
  warm: boolean;
  resolveWarm: () => void;
  warmed: Promise<void>;
  resolveWanted: () => void;
  wanted: Promise<void>;
  share: number;
  waiting: number;
}

function needState(): NeedState {
  const state = { warm: false, share: 0, waiting: 0 } as NeedState;
  state.warmed = new Promise<void>((resolve) => { state.resolveWarm = resolve; });
  state.wanted = new Promise<void>((resolve) => { state.resolveWanted = resolve; });
  return state;
}

const needs: Record<Need, NeedState> = { fight: needState(), heroes: needState() };
const listeners: (() => void)[] = [];

/** What a press waiting for its needs readies, as the fight's loading bar says it (`Readying the heroes`, ui/readying.ts
 *  `READYING`): a text, or one made from what was pressed. */
export type ReadyingLabel<A extends unknown[]> = string | ((...args: A) => string);
/** the presses waiting, each its label, the latest asked last */
const waitingFor: { press: object; label: string }[] = [];
const changed = (): void => { for (const fn of listeners) fn(); };

/** resolved once `need` is warm */
export const warmed = (need: Need): Promise<void> => needs[need].warmed;
/** resolved once something waits for `need` (`whenWarm`), or `hurry` is called: compiled at once then */
export const wanted = (need: Need): Promise<void> => needs[need].wanted;
/** Whether `need` is warm already (a first visit's heroes, warmed with the lobby). */
export const isWarm = (need: Need): boolean => needs[need].warm;
export const isAllWarm = (): boolean => NEEDS.every((need) => needs[need].warm);
/** whether something pressed is waiting (the lobby shows the fight's loading bar) */
export const isReadying = (): boolean => NEEDS.some((need) => needs[need].waiting > 0);
/** how far the warm-ups waited for have got, 0 to 1: their mean */
export function readyingShare(): number {
  const waited = NEEDS.filter((need) => needs[need].waiting > 0);
  return waited.length ? waited.reduce((sum, need) => sum + needs[need].share, 0) / waited.length : 0;
}
/** what the latest press still waiting readies (its `whenWarm` label), '' with none */
export const readyingLabel = (): string => waitingFor[waitingFor.length - 1]?.label ?? '';
/** `fn` called as something starts or stops waiting, and as a warm-up waited for gets further */
export function onReadying(fn: () => void): void { listeners.push(fn); }

/** the warm-ups running after the lobby shows (game/warmup.ts `inTurn`) */
let running = 0;
/** whether a warm-up is running: its frames aren't the device's measure (core/quality.ts's Auto leaves them out) */
export const isWarming = (): boolean => running > 0;
export function warmingRuns(on: boolean): void { running += on ? 1 : -1; }

/** Every need wanted now (the lab's boot, which then waits for them). */
export function hurry(): void { for (const need of NEEDS) needs[need].resolveWanted(); }
/** `need` wanted now, nothing waiting on it (a first visit's hero selection, warmed under the loading screen). */
export function want(need: Need): void { needs[need].resolveWanted(); }

/** `need`'s warm-up has got `share` of the way. */
export function warming(need: Need, share: number): void {
  needs[need].share = share;
  if (needs[need].waiting > 0) changed();
}

export function markWarm(need: Need): void {
  needs[need].warm = true;
  needs[need].resolveWarm();
  changed();
}

/** how far each other class's hero is warmed, by his model (0 to 1; 1 warm): the hall of heroes shows him once he is,
 *  and his tab's bar till then (from play, "we can only load currently selected/default hero... and then load the two
 *  others, show some loading bars on those heroes") */
const heroShares = new Map<string, number>();
/** How far the hero of `model` is warmed (0 to 1): the lobby's own and every hero once the heroes are, 1. */
export const heroShare = (model: string): number =>
  (needs.heroes.warm || model === G.player?.cls.model ? 1 : heroShares.get(model) ?? 0);
/** The hero of `model` warmed `share` of the way. */
export function heroWarming(model: string, share: number): void {
  heroShares.set(model, share);
  changed();
}

/** The lab's: `need` cold again till `markWarm` (tools/lab `ui --states readyingHeroes`), so a press that needs it waits
 *  under the fight's loading bar as a first visit's does (the lab's boot warms every need at once). */
export function chill(need: Need): void {
  needs[need] = needState();
  if (need === 'heroes') heroShares.clear();
}

/**
 * `act`, done at once if what it needs (`of`) is warm, else as soon as it is: pressed again meanwhile, its last
 * asking alone. Meanwhile the fight's loading bar says what it readies (`label`, of what was asked last).
 */
export function whenWarm<A extends unknown[]>(
  of: Need[], act: (...args: A) => void, label: ReadyingLabel<A>,
): (...args: A) => void {
  let asked: A | null = null;
  const press = {};
  return (...args: A) => {
    const cold = of.filter((need) => !needs[need].warm);
    if (!cold.length) { act(...args); return; }
    const first = asked === null;
    asked = args;
    // (pressed again meanwhile: the latest press, saying what this asking readies)
    const at = waitingFor.findIndex((waiting) => waiting.press === press);
    if (at >= 0) waitingFor.splice(at, 1);
    waitingFor.push({ press, label: typeof label === 'string' ? label : label(...args) });
    if (!first) { changed(); return; }
    for (const need of cold) {
      needs[need].waiting++;
      needs[need].resolveWanted();
    }
    changed();
    void Promise.all(cold.map((need) => needs[need].warmed)).then(() => {
      const last = asked!;
      asked = null;
      waitingFor.splice(waitingFor.findIndex((waiting) => waiting.press === press), 1);
      for (const need of cold) needs[need].waiting--;
      act(...last);
      changed();
    });
  };
}
