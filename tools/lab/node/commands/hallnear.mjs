// `npm run lab -- hallnear`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab hallnear`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the other heroes\' warm-up as he nears the village\'s hall on a cold lobby (`--cold`, a new deploy\'s): '
    + 'with `--held` every frame held, as a phone\'s GPU holds them, it must give up and compile nothing after, the '
    + 'heroes not asked for; without, they must be warm before long, behind the lobby',
  help: 'the other heroes\' warm-up as he nears the village\'s hall (`approach` in src/game/warm.ts), run --cold: '
    + 'asked for at once there, a phone\'s square held frames of 280 to 320 ms (trace 476Y-88D5)',
  options: {
    held: {
      kind: 'switch',
      help: 'every frame counted as held (`WARM_BEHIND.heldMost` 0): the warm-up must give up',
    },
    canary: {
      kind: 'switch',
      help: 'the heroes asked for as he nears the hall, as the game did: must be caught',
    },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('hallNear', { held: Boolean(options.held), canary: Boolean(options.canary) });
  },
  textOf: asText,
  problemsOf: problemsIn,
};
