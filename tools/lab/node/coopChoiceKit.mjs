// What `lab coop --scenarios banks`'s rounds share (node/coopBanks.mjs, node/coopBankRaces.mjs): the run begun and
// cleared to the choice, keys pressed together, a page's Continue button and its word on the choice waited for,
// and every game sent back to the lobby.
import { waitFor } from './coopEnd.mjs';

/** the frames a step waits for what it plays (the run's end takes the 2.5 s it's said in) */
export const STEP_FRAMES = 600;
/** Every page in `group` holds `key` for a turn of frames (every page stepped), then lets it go. */
export async function pressTogether(pair, call, group, key) {
  for (const index of group) await call(pair.pages[index], 'coopHold', { frame: { keys: [key] } });
  await pair.run(pair.turnFrames);
  for (const index of group) await call(pair.pages[index], 'coopHold', { frame: null });
}

/** A run of the round's own begun from the lobby, held in its countdown. Returns a problem, or null. */
export async function beginRun(pair, call) {
  const [host, ...guests] = pair.pages;
  await call(host, 'coopHoldRun');
  for (const guest of guests) await call(guest, 'coopJoinAfresh');
  await call(host, 'coopStart');
  const started = await waitFor(pair, (states) => states.every((state) => state.mode === 'run'), STEP_FRAMES);
  return started.met ? null : 'the run never started on every game';
}

/** The host's wave cleared to the choice on every game. Returns a problem, or null. */
export async function toTheChoice(pair, call, what) {
  for (const page of pair.pages) await call(page, 'coopClearWave');
  const cleared = await waitFor(pair, (states) => states.every((state) => state.phase === 'cleared'), STEP_FRAMES);
  return cleared.met ? null : `${what}: the wave never came to the choice on every game`;
}

/**
 * Steps every page a turn at a time until `done` holds of `page`'s Continue button as drawn, at most `limit` frames.
 * Returns the button as last drawn and whether it came.
 */
export async function untilButton(pair, call, page, done, limit) {
  let shown = await call(page, 'coopContinueShown');
  for (let frames = 0; !done(shown) && frames < limit; frames += pair.turnFrames) {
    await pair.run(pair.turnFrames);
    shown = await call(page, 'coopContinueShown');
  }
  return { shown, met: done(shown) };
}

/** Every game sent back to the lobby as players would (a game still in the run leaves it), its summary closed. */
export async function leaveForLobby(pair, call) {
  for (let tries = 0; tries < 3; tries++) {
    const states = await pair.run(pair.turnFrames);
    for (const [index, state] of states.entries()) {
      if (state.summary) await call(pair.pages[index], 'coopSummaryDone');
      else if (state.mode === 'run' && !state.out) await call(pair.pages[index], 'coopLeaveRun');
    }
    const home = await waitFor(pair, (all) => all.every((state) => state.mode === 'menu'), STEP_FRAMES);
    if (home.met) break;
  }
  const settled = await pair.run(pair.turnFrames);
  for (const [index, state] of settled.entries()) {
    if (state.summary) await call(pair.pages[index], 'coopSummaryDone');
  }
  await pair.run(pair.turnFrames);
}


/** Every page's word on the choice (page/coopBanks.ts `coopBanksSeen`), the host's first. */
export async function seenAll(pair, call) {
  return Promise.all(pair.pages.map((page) => call(page, 'coopBanksSeen')));
}

/**
 * Steps every page a turn at a time until `done` holds of every page's word on the choice, at most `limit` frames.
 * Returns the words as last read and whether it came.
 */
export async function untilSeen(pair, call, done, limit) {
  let seen = await seenAll(pair, call);
  for (let frames = 0; !done(seen) && frames < limit; frames += pair.turnFrames) {
    await pair.run(pair.turnFrames);
    seen = await seenAll(pair, call);
  }
  return { seen, met: done(seen) };
}
