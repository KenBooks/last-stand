// `lab village`'s hero chosen in the hall of heroes (from play, "choose hero in hall freezes for like 10sec"): the hall
// opened from the lobby at midnight, another hero in focus and chosen by Enter, the frames from it back in the
// village drawn, each waited for on the GPU and timed by the browser's own clock, with the programs compiled meanwhile.
// `canary` plants a stall in one frame.
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { Player } from '../../../src/entities/player';
import * as hall from '../../../src/game/hall';
import { holdHour } from '../../../src/game/clock';
import { openHall, toLobby } from './hallMoves';
import type { LightsChecked } from './villageLights';

/** the frames timed from the press, and the frame the canary stalls */
const FRAMES = 90;
const CANARY_FRAME = 5;
/** how long the canary's frame stalls, and the longest a frame may take (ms) */
const CANARY_STALL = 800;
const MOST_MS = 500;
/** the frames the hall is left to settle before he's chosen */
const SETTLE = 120;
/** the most frames the heroes built behind the lobby may take */
const BUILT_FRAMES = 600;

/** The browser's own clock (the page's `performance.now` is the lab's). */
function realNow(): number {
  const clock = (window as unknown as { __labClock: { realNow: () => number } }).__labClock;
  return clock.realNow();
}

/** The page held up for `ms`. */
function stall(ms: number): void {
  const until = realNow() + ms;
  while (realNow() < until);
}

/** The frame's draws waited for: a stall in the GPU's process shows here, where the page's own work ends sooner. */
function waitForTheGpu(): void {
  const gl = G.renderer.getContext();
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
}

/** The time of each frame from `press` on (ms), and the programs they compiled. */
async function framesFrom(lab: Lab, canary: boolean): Promise<{ times: number[]; compiled: number }> {
  const before = G.renderer.info.programs?.length ?? 0;
  const times: number[] = [];
  let started = realNow();
  lab.drawing = true;
  try {
    await lab.step(FRAMES, (frame) => ({ keys: frame === 0 ? ['enter'] : [] }), (frame) => {
      if (canary && frame === CANARY_FRAME) stall(CANARY_STALL);
      waitForTheGpu();
      times.push(realNow() - started);
      started = realNow();
    });
  } finally {
    lab.drawing = false;
  }
  return { times, compiled: (G.renderer.info.programs?.length ?? 0) - before };
}

/** The hall's screen opened and another hero chosen on it, the first time of each, builds no hero: built then, each
 *  held the frame 110 to 290 ms (from play, "choosing here freezes for 0.5-1sec ... first time only"). `canary` lets
 *  the heroes built ahead for the choice go. */
export async function heroesBuiltAhead(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const was = G.player.cls.id;
  await toLobby(lab);
  // (the lobby as a player has it, not paused: the heroes are built behind it, `buildBehind`, by its module as an
  // A/B's other commit may not have it, where they were built before the lobby showed)
  if (G.paused) await lab.step(1, () => ({ keys: ['escape'] }));
  await lab.step(SETTLE);
  if (G.paused) throw new Error('lab: village: the lobby stayed paused');
  const building = (hall as { buildingBehind?: () => boolean }).buildingBehind;
  if (building) await lab.until(() => !building(), BUILT_FRAMES, 'village: the heroes built behind the lobby');
  if (canary) (hall as { dropSpareHeroes?: () => void }).dropSpareHeroes?.();
  const before = Player.built;
  await openHall(lab);
  await lab.step(SETTLE);
  const opening = Player.built - before;
  // (it opens on the hero he stood looking at, in the hall itself: stepped along until it's another's)
  while (document.querySelector('#heroes .hs-choose')?.textContent?.startsWith('Stay')) {
    await lab.step(1, () => ({ keys: ['arrowright'] }));
    await lab.step(SETTLE);
  }
  const chose = Player.built;
  // (the choice's frame and the next: after it the old class's spare is built behind the lobby, a piece a frame)
  await lab.step(2, (frame) => ({ keys: frame === 0 ? ['enter'] : [] }));
  const choosing = Player.built - chose;
  await lab.step(SETTLE);
  if (hall.hallOpen()) throw new Error('lab: village: Enter never chose a hero');
  if (G.player.cls.id === was) throw new Error('lab: village: the hero chosen was the one he was');
  const line = `the hall's first opening built ${opening} heroes, the first ${G.player.cls.id} chosen ${choosing}`;
  const built = opening + choosing > 0;
  if (canary) return { lines: [line], problems: [], caught: built, moments: [] };
  return { lines: [line], problems: built ? [line] : [], caught: null, moments: [] };
}

/** Choosing another hero holds no frame up past `MOST_MS`. */
export async function heroChosenQuick(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const was = G.player.cls.id;
  await toLobby(lab);
  holdHour(0);
  await lab.step(SETTLE);
  await openHall(lab);
  await lab.step(SETTLE);
  await lab.step(1, () => ({ keys: ['arrowright'] }));
  await lab.step(SETTLE);
  const { times, compiled } = await framesFrom(lab, canary);
  holdHour(null);
  if (hall.hallOpen()) throw new Error('lab: village: Enter never chose a hero');
  if (G.player.cls.id === was) throw new Error('lab: village: the hero chosen was the one he was');
  const longest = Math.max(...times);
  const at = times.indexOf(longest);
  const line = `the ${G.player.cls.id} chosen in the hall: the longest frame ${longest.toFixed(0)} ms (frame ${at} of `
    + `${FRAMES}, at most ${MOST_MS}), ${compiled} programs compiled; the first six `
    + times.slice(0, 6).map((ms) => ms.toFixed(0)).join(', ');
  const slow = longest > MOST_MS;
  if (canary) return { lines: [line], problems: [], caught: slow, moments: [] };
  return { lines: [line], problems: slow ? [line] : [], caught: null, moments: [] };
}
