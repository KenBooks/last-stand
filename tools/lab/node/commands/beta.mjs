// `npm run lab -- beta`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/**
 * `runBeta` (beta.mjs), imported as the command runs: it loads the browser's side (side.mjs),
 * which the command line, reading every command, never needs.
 */
async function runBeta(...args) {
  const { runBeta: run } = await import('../beta.mjs');
  return run(...args);
}

/** `lab beta`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the village beta opted into and out of on a page of its own, by the browser\'s own clicks and loads (the '
    + 'pause menu\'s Beta tab saying what the page runs and offering Reload once switched, Reload loading the page '
    + 'with `?village=1`, the choice kept in its cookie, the notice shown as the game opens there, kept through the '
    + 'village\'s own frames and put away by a screen opened over it, the next visit without a parameter in the '
    + 'village too, its notice left alone gone by itself, the notice\'s Back to the old lobby and the visit after it; '
    + 'then a co-op room hosted by the command\'s page asked from the other lobby: refused, told which lobby the room '
    + 'is in, the switch offered in the dialog, clicked, the page loaded in the room\'s lobby as an invite to it and '
    + 'the room joined; `--panels` hosts the room in the lobby without the village; `--canary` keeps the notice by '
    + 'the pointer past its time, puts it away before it\'s read, loses the cookie before the next visit and forgets '
    + 'the lobby the room refused the game for)',
  help: 'the village beta opted into and out of, on a page of its own, by the browser\'s own clicks and loads: '
    + 'the pause menu\'s Beta tab and its Reload (the page loaded with ?village=1, the choice kept in its '
    + 'cookie), the notice as the game opens, the next visit with no parameter, the notice\'s Back to the old '
    + 'lobby; then a co-op room of this command\'s page asked from the other lobby: refused, told which lobby '
    + 'it is in, the switch offered, clicked (the page loaded in the room\'s lobby as an invite to it) and the '
    + 'room joined; --panels hosts the room in the lobby without the village',
  options: {
    ping: { kind: 'number', usage: 'ms', help: 'the link\'s least round trip (300 by default)' },
    jitter: { kind: 'number', usage: 'ms', help: 'how much later each way a message may come (60 by default)' },
    canary: {
      kind: 'switch',
      help: 'plant the faults it must catch: the notice put away before it\'s read, the cookie lost before the '
        + 'next visit, and the lobby the room refused the game for forgotten (no switch offered)',
    },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    const { ping, jitter } = options;
    return runBeta(side, { ping, jitter, canary: Boolean(options.canary) });
  },
  textOf: asText,
  problemsOf: problemsIn,
};
