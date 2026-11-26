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
    + 'player\'s view, and a camera placed, drawn beside his frame, which must not change) answered and checked '
    + 'against the page\'s own state, '
    + 'a thing made in the scene (`join make`) and seen drawn in a picture of its spot, made again in its place, '
    + 'sent again as its file is saved, and unmade, a stroke the owner draws on the screen read by `look` and seen '
    + 'in a picture, cleared, the game\'s chat both ways (#923: a line said by the keyboard and one by touch heard '
    + 'by the agent, `join hear` ending with one, its answer `join say` shown under its name, one past the chat\'s '
    + 'limit refused), kicked by the badge with the chat shut, the used code refused, and an agent sent '
    + 'away as a co-op room opens, where none is offered; pictures in `out/invite` (`--canary` draws the player\'s '
    + 'frame from the agent\'s camera, builds the made thing hidden, types a chat line with the box shut, shows the '
    + 'agent\'s answer as the game\'s own word and starts the relay leaving a used code good, '
    + 'each of which it must catch, and passing an '
    + 'unaccepted agent\'s messages on, which the page alone must then hold)',
  help: 'the agent invited into a game end to end against a relay of the lab\'s own: invite, the question, a second '
    + 'agent refused, let in, look, set, eval, picture, make, draw, chat both ways, kick, the used code refused, co-op '
    + 'sending the agent away; '
    + 'pictures in out/invite',
  options: {
    canary: {
      kind: 'switch',
      help: 'the made thing built hidden, a chat line typed with the box shut, the agent\'s answer shown as the '
        + 'game\'s word, and the relay leaving a used code good',
    },
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
