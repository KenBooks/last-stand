// `npm run lab -- bowprop`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { fixtureFrom, asText, problemsIn, textWithSheetEach } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab bowprop`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the ranger drawing at a prop he stands against, his bow\'s end in it (each biome, each kind of prop, 0.25 '
    + 'and 0.5 m off it: the nocked arrow, the bow\'s tip and the hero must not turn back frame after frame; the '
    + 'point the pose aims from within 5 cm of the arrow drawn level; the aim preview stopped by the prop, never '
    + 'through it; `--canary` aims the pose from the arrow as posed, #317)',
  help: 'the ranger drawing at a prop he stands against, his bow\'s end in it (#317): in each biome against one prop '
    + 'of each kind, 0.25 and 0.5 m off it, the shot held on a point on the prop from above, the mouse over it; '
    + 'the nocked arrow, the bow\'s tip and the hero each turning back on their last frame\'s move more than 3 times over the hold '
    + 'flicker, and are problems; first, the point the pose aims from held within 5 cm of the arrow drawn level '
    + '(--class ranger; pictures in tools/lab/out/bowprop)',
  options: {
    biomes: {
      kind: 'list',
      usage: 'a,b',
      choices: ['crypt', 'forest'],
      default: 'crypt,forest',
      help: 'the biomes: crypt, forest',
    },
    pictures: {
      kind: 'switch',
      help: 'picture four frames running round the arrow\'s largest move in each biome\'s first stand (played '
        + 'again), the whole body from his right and from above behind',
    },
    canary: {
      kind: 'switch',
      help: 'aim the pose from the arrow as posed again (as before #317), which the stands must find flickering',
    },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    const command = {
      fixture: fixtureFrom(options),
      biomes: options.biomes,
      pictures: Boolean(options.pictures),
      canary: Boolean(options.canary),
    };
    return side.command('bowprop', command);
  },
  finish(results, options, session) {
    return textWithSheetEach(results, session.outFor('bowprop'), session.browser);
  },
  textOf: asText,
  problemsOf: problemsIn,
};
