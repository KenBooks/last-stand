// `npm run lab -- roomwarm`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { picturePairs, asText, problemsIn, textWithMoments } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab roomwarm`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'a warm-up of each kind (a battleground, the hall, the room itself) drawn in the village\'s stead with the '
    + 'hero in Odo\'s shop: after each, the shop alone drawn, the village hidden (`--canary` shows the village under '
    + 'it)',
  help: "a warm-up of each kind drawn behind the lobby with the hero in a house's room (Odo's shop): a "
    + "battleground, the hall of heroes and the room itself, each in the village's stead; after each, the village "
    + 'hidden under the room, the room shown and no other place drawn with it',
  options: {
    canary: { kind: 'switch', help: 'show the village under the room after the first, which must be caught' },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('roomwarm', { canary: Boolean(options.canary) });
  },
  // (its moments written: the shop before and after the warm-ups behind it)
  finish(results, options, session) {
    return textWithMoments(results, session.outFor('roomwarm'), session.browser);
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
