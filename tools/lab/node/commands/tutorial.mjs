// `npm run lab -- tutorial`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { picturePairs, asText, problemsIn, textWithMoments } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab tutorial`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the village\'s tutorial walked as a player walks it, from the notice board, with keys and mouse or by a '
    + 'finger (`--touch`): each step done the way its words say, the tracker read and pictured as it asks for each '
    + '(in full: `commands/tutorial.md`)',
  help: 'the village\'s tutorial walked as a player walks it, from the notice board: each step done the way its '
    + 'words say (the bag, an item thrown and picked up, the stash, the yard, a dummy struck, three skills, the '
    + 'hero\'s defence against the sparring shade, the draught, and on through the village\'s places), the tracker '
    + 'read and pictured as it asks for each, within the window and over no other part of the HUD; a step not ticked '
    + 'by doing it, health lost to the shade, a program compiled on the way, more than the board\'s one way in and '
    + 'progress the cookie doesn\'t keep are problems',
  options: {
    touch: { kind: 'switch', help: 'walked by a finger, on the touch controls (with a phone\'s --screen)' },
    canary: { kind: 'switch', help: 'plant a tracker as tall as two windows and an emptied cookie, each to be found' },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('tutorial', { touch: Boolean(options.touch), canary: Boolean(options.canary) });
  },
  // (its moments written: the board, the tracker as it asks for each step, the guard broken, the end)
  finish(results, options, session) {
    return textWithMoments(results, session.outFor('tutorial'), session.browser);
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
