// `npm run lab -- invite`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab invite`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the agent invited into a game (#529, `lab join`\'s other end) end to end against a relay of the lab\'s '
    + 'own (server/relay on localhost; once: `npm ci --prefix server/relay`), every step of the game\'s the '
    + 'player\'s own clicks: Invite agent pressed in the developer panel and its code read off it, an agent joined '
    + 'with the code and held at the question (a step sent before the answer never runs), a second agent refused '
    + 'on the same code, let in by Let it in with the badge up, `look`, `set`, `eval` and `picture` (the '
    + 'player\'s view, and a camera placed and put back) answered and checked against the page\'s own state, '
    + 'kicked by the badge, the used code refused, and an agent sent away as a co-op room opens, where none is '
    + 'offered; pictures in `out/invite` (`--canary` starts the relay leaving a used code good, which it must catch, and '
    + 'passing an unaccepted agent\'s messages on, which the page alone must then hold)',
  help: 'the agent invited into a game end to end against a relay of the lab\'s own: invite, the question, a second '
    + 'agent refused, let in, look, set, eval, picture, kick, the used code refused, co-op sending the agent away; '
    + 'pictures in out/invite',
  options: {
    canary: { kind: 'switch', help: 'start the relay leaving a used code good: a second agent gets in' },
    ...COMMON_OPTIONS,
  },
  async each(side, options) {
    // (a relay of the lab's own, server/relay: its packages installed by npm ci --prefix server/relay)
    const { runInvite } = await import('../inviteCheck.mjs');
    return runInvite(side, { canary: Boolean(options.canary) });
  },
  textOf: asText,
  problemsOf: problemsIn,
};
