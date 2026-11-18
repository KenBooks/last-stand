// `npm run lab -- photo`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { picturePairs, asText, problemsIn, textWithPictureFiles } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab photo`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'photo mode as a player uses it (the village, its pause menu\'s button, by touch, each house, both '
    + 'battlegrounds: opened by P, the page\'s UI and the world\'s overlays left out, the solo game still, the camera '
    + 'flown and turned, the look set with no program compiled, Hide hero, a photo saved at the canvas\'s pixels '
    + 'under a dated name, letterboxed, Esc putting all back; in a house the camera kept to its room and its walls '
    + 'cut away; never over a dialog; pictured with its panel, a shot set up, the camera low and far)',
  help: 'photo mode used as a player uses it, in the village (and from its pause menu), the Thornwood and the '
    + 'crypt: opened by P, the page\'s UI hidden but its panel, the world\'s overlays left out of the frame, the '
    + 'solo game held still, the camera flown by W and turned by a drag, the look set by a slider and a filter '
    + 'with no program compiled, the time of day settable in the village alone, Hide hero, a photo saved by Space '
    + 'under a dated name at the canvas\'s pixels (letterboxed: its bar black), Esc putting everything back; '
    + 'pictured with its panel and with a shot set up',
  options: {
    canary: { kind: 'switch', help: 'plant faults the checks must catch: the page\'s UI shown, the overlays drawn' },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('photo', { canary: Boolean(options.canary) });
  },
  finish(results, options, session) {
    return textWithPictureFiles(results, session.outFor('photo'));
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
