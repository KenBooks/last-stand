// `npm run lab -- hits`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { labError } from '../errors.mjs';
import { fixtureFrom, asText, problemsIn } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab hits`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'each skill\'s blows as they land on foes stood where it strikes (when each landed from the press, the '
    + 'gaps between them, the damage a second; held to `--apart` and to `--than`\'s pace)',
  help: 'each skill\'s blows as they land: foes stood dazed where it strikes (as death stands them), living past '
    + 'every blow, and it cast at them as the player casts it, every hit caught as it lands (a blow: the hits within '
    + 'a frame of each other); when each blow landed from the press, the gaps between them, when the hero was free '
    + 'again and the damage a second till then; striking nothing, a gap past --apart and blows no quicker than '
    + '--than\'s are problems (hits twinFangs --than cleave --apart 0.2 --class warrior --gear dual)',
  argument: 'skills',
  options: {
    apart: { kind: 'number', usage: 's', help: 'the most a skill\'s blows may be apart' },
    than: {
      kind: 'text',
      usage: 'skill',
      help: 'a skill held down for a row of its blows (the basic attack: cleave), whose pace each skill\'s blows '
        + 'must be quicker than',
    },
    canary: {
      kind: 'switch',
      help: 'plant the fault the checks must catch: a blow struck 1 s after each skill\'s first (with --apart or '
        + '--than), or else its foes kept from harm',
    },
    ...SETUP_OPTIONS,
    ...COMMON_OPTIONS,
  },
  keepsPage: 'own',
  check(options) {
    if (options.apart !== undefined && !(options.apart > 0)) throw labError('hits --apart: more than 0 s');
  },
  each(side, options) {
    const command = {
      fixture: fixtureFrom(options),
      skills: options._[0].split(','),
      apart: options.apart,
      than: options.than,
      canary: Boolean(options.canary),
    };
    return side.command('hits', command);
  },
  textOf: asText,
  problemsOf: problemsIn,
};
