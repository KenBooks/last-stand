// `npm run lab -- touchpad`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { fixtureFrom, picturePairs, asText, problemsIn, textWithPictureFiles } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab touchpad`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'where a finger put down starts the move stick (a grid over the screen in a run, each point touched and '
    + 'slid a little, buttons left alone, with the overlays down the left put away and shown: every point of the move '
    + 'area, the left half below the top quarter, must start it, no control there larger than a finger\'s button; a '
    + 'picture of each with the points marked; the performance overlay tapped copying a report, held still lifted, '
    + 'moved with the finger and kept inside the window, `--canary` pinning it to its corner)',
  help: 'where a finger put down starts the touch controls\' move stick: a grid of points over the screen '
    + 'in a run, each touched and slid a little (buttons left alone); every point of the move area (the left '
    + 'half below the top quarter) that isn\'t a button must start the stick',
  options: {
    canary: {
      kind: 'switch',
      help: 'plant a fault the measure must catch: a clear sheet over the move area\'s lower left',
    },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('touchpad', { fixture: fixtureFrom(options), canary: Boolean(options.canary) });
  },
  finish(results, options, session) {
    return textWithPictureFiles(results, session.outFor('touchpad'));
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
