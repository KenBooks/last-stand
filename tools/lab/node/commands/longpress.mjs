// `npm run lab -- longpress`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { fixtureFrom, asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab longpress`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'a finger held on every touch control (the skill buttons, the move stick, Bag, Map, Use, the view, full '
    + 'screen and pause), in the village\'s training yard and in a run: no long press may be left to the browser, '
    + 'whose own menu opened over the game, and nothing of a control may be draggable, call out or have text to '
    + 'select (run it with --class for each hero)',
  help: 'every touch control shown, in the village\'s training yard and in a run, held down by a finger as a touch '
    + 'screen sends it, long enough for a long press: each `contextmenu` it fires must be prevented (left, the '
    + 'browser opens its own menu over the game: Back, Forward, Reload, Download, Print, Share), and no part of a '
    + 'control may be draggable, show a callout or have text to select; the skill buttons are the hero\'s '
    + '(--class warrior, mage, ranger)',
  options: {
    canary: {
      kind: 'switch',
      help: 'plant faults the checks must catch: the first skill button\'s text made selectable (its long press '
        + 'then left to the browser) and the second made draggable',
    },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('longPress', { fixture: fixtureFrom(options), canary: Boolean(options.canary) });
  },
  textOf: asText,
  problemsOf: problemsIn,
};
