// `npm run lab -- pottery`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { picturePairs, asText, problemsIn, textWithMoments } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab pottery`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the tavern\'s shelf pottery alone, the hero put straight into the room (no door, no village): each '
    + 'plate, jug, stack of bowls and pair of beakers standing on its shelf\'s board and clear of the next along it, '
    + 'a pair of plates\' front one clear of the back one, the slipware plain on Very low, what the pottery adds to '
    + 'the room\'s frame (3 draws and 20 thousand triangles at most), pictured close up and as the player stands in '
    + 'the room; `--canary` lifts a thing off its board, slides the next into it and pushes a pair\'s plates together',
  help: 'the tavern\'s shelf pottery alone: each thing on its shelf and clear of the next, what it costs the '
    + 'room\'s frame, pictured close up and in the room',
  options: {
    canary: {
      kind: 'switch',
      help: 'lift a thing off its board, slide the next into it and push a pair\'s front plate into the back one, '
        + 'each of which must be found',
    },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('pottery', { canary: Boolean(options.canary) });
  },
  // (its moments written: the shelves close, the wall and the room)
  finish(results, options, session) {
    return textWithMoments(results, session.outFor('pottery'), session.browser);
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
