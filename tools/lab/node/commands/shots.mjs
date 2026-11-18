// `npm run lab -- shots`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { labError } from '../errors.mjs';
import { fixtureFrom, asText, problemsIn } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab shots`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the bow\'s shots at a boss with its foes packed round it (each biome and view, the bow drawn to full over '
    + 'points across them and loosed, its flight followed frame by frame: the first foe drawn along it struck, none '
    + 'if none, and one aimed inside a foe reaching it unless another is in the way)',
  help: 'the hero\'s basic attack (the ranger\'s bow drawn to full) loosed at points over each biome\'s boss '
    + 'with its summons and the biome\'s foes packed round it, in each view, the crosshair turned onto each point in '
    + 'the close views, its flight followed frame by frame: every shot must strike the first foe drawn along its '
    + 'flight (none if none), and one aimed inside a foe reach it unless another is in the way; a basic attack '
    + 'that doesn\'t fly at the point (the mage\'s seeking bolt) is said so, and a canary missed is a problem '
    + '(--class ranger)',
  options: {
    views: {
      kind: 'list',
      usage: 'a,b',
      choices: ['top', 'third', 'first'],
      default: 'top,third,first',
      help: 'the views: top, third, first',
    },
    shots: { kind: 'number', usage: 'n', help: 'shots in each view, half over the boss (12 by default)' },
    canary: {
      kind: 'switch',
      help: 'the first shot\'s foe made invulnerable: the shot, taking nothing, must be found missed',
    },
    ...SETUP_OPTIONS,
    ...COMMON_OPTIONS,
  },
  check(options) {
    if (options.shots !== undefined && !(options.shots >= 1)) throw labError('shots --shots: at least 1');
  },
  each(side, options) {
    const command = {
      fixture: fixtureFrom(options),
      views: options.views,
      shots: Math.round(options.shots ?? 12),
      canary: Boolean(options.canary),
    };
    return side.command('shots', command);
  },
  textOf: asText,
  problemsOf: problemsIn,
};
