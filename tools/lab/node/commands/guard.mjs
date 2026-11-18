// `npm run lab -- guard`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { picturePairs, asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab guard`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: '#399, attacks while blocking in third person and through the eyes, a damage control during the exposed '
    + 'swing, immediate return/release/failure cases, independent shield and attack touch fingers. `--canary` leaves '
    + 'a shield raised during a swing and must detect it.',
  help: 'attack while holding Raise Shield, exposed swing and immediate guard return, release/failure cases '
    + 'and two independent touch fingers; pictures in third person and through the eyes',
  options: {
    ...COMMON_OPTIONS,
    class: { ...COMMON_OPTIONS.class, default: 'warrior' },
    canary: { kind: 'switch', help: 'plant a shield that fails to lower for an attack and detect it' },
  },
  each(side, options) {
    return side.command('guard', { canary: Boolean(options.canary) });
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
