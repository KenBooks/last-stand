// `npm run lab -- tap`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { fixtureFrom, asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab tap`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the touch buttons of every skill aimed by holding, the other thumb on the move stick (tapped standing, at '
    + 'once and walking: a movement skill the way he moves, any other at the nearest foe; dragged while the stick '
    + 'moves: the skill\'s own preview following the drag, cast where it last showed, the stick still walking him)',
  help: 'every skill of the hero\'s class aimed by holding, its touch button pressed by a finger, the other thumb '
    + 'on the move stick: tapped standing, at once and walking (a movement skill goes the way he moves, any other '
    + 'at the nearest foe), and dragged while the stick moves (its own preview follows the drag, and it is cast '
    + 'where the preview showed) (--class mage, ranger)',
  options: {
    canary: {
      kind: 'switch',
      help: 'plant faults the checks must catch: a movement skill tapped with the stick let go and the hero turned '
        + 'to the foe, another tapped with its foe carried off, each drag\'s last preview read a frame early, its '
        + 'cast held against the stop before\'s, the plain aim ring shown beside a preview',
    },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('tap', { fixture: fixtureFrom(options), canary: Boolean(options.canary) });
  },
  textOf: asText,
  problemsOf: problemsIn,
};
