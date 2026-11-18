// `npm run lab -- heropick`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { picturePairs, asText, problemsIn, textWithMoments } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab heropick`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'a first visit\'s hero picked on the hero selection screen, by a finger\'s tap and by the mouse (each '
    + 'landing in the lobby, no run started or waiting for the warm-up, the click after the press reaching nothing '
    + 'past the screen; `--screen 640x360@3` puts Enter the Arena under the hero, `--canary` lets the tap\'s click '
    + 'through; `--quick` the mage picked at once on a slowed CPU, the others still warming, the view changed '
    + 'meanwhile: every hero drawn where he stands, none on the fountain)',
  help: 'a first visit\'s hero picked on the hero selection screen (booted as --first, the mage in focus): a '
    + 'finger\'s tap on him, then the screen opened again as a first visit\'s and the mouse\'s click; each must '
    + 'land in the lobby with no run started, the browser\'s click after the press reaching nothing of the lobby',
  options: {
    canary: {
      kind: 'switch',
      help: 'plant a fault the measure must catch: the click after a choosing tap let through to the lobby',
    },
    quick: {
      kind: 'switch',
      help: 'the mage picked at once, the other heroes still warming behind the screen, the CPU slowed, then '
        + 'followed till their warm-up is done: no hero may stand in the scene that no one plays or shows',
    },
    ...COMMON_OPTIONS,
  },
  check(options) {
    // (a first visit's boot alone opens on the hero selection screen, its hero the mage)
    options.first = true;
    options.class ??= 'mage';
  },
  each(side, options) {
    return side.command('heropick', { canary: Boolean(options.canary), quick: Boolean(options.quick) });
  },
  // (--quick's moment written: the screen as the other heroes first stand on the village's hall's dais)
  finish: (results, options, session) => textWithMoments(results, session.outFor('heropick'), session.browser),
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
