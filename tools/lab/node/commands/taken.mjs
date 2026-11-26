// `npm run lab -- taken`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { labError } from '../errors.mjs';
import { fixtureFrom, asText, problemsIn } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** the waves read unless `--waves` says: where the healing beam was found not to keep up (from play) */
const TAKEN_WAVES = [40];
/** the game's seconds read from the first blow unless `--seconds` says */
const TAKEN_SECONDS = 30;

/** `lab taken`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'what a wave\'s foes deal a second to one hero standing among them unfighting (each blow as it lands: '
    + 'what was sent, what reached his Health, the worst second, the foes standing), beside the healing beam\'s heal a '
    + 'second at 1000 and 6000 Health, no gear and +150% damage, unramped and at its most; `--canary` makes him '
    + 'untouchable',
  help: 'each wave (--waves, 40 by default) set off in each biome from a seed of its own and played at the game\'s '
    + 'pace, the hero standing at the arena\'s middle and kept up past any blow: every blow on him read as it lands '
    + '(what the foe sent, what reached his Health past his block, ward and armour), summed a second over --seconds '
    + '(30) of the game\'s time from the first blow, the worst second and the most foes standing; then Lifethread\'s '
    + 'heal a second at an early and a late hero\'s Health, at no gear and +150% all damage, unramped and at its most. '
    + 'A wave with no blow on him is a problem',
  options: {
    biomes: {
      kind: 'list',
      usage: 'a,b',
      choices: ['crypt', 'forest'],
      default: 'crypt,forest',
      help: 'the biomes: crypt, forest',
    },
    waves: {
      kind: 'list',
      usage: 'n,m',
      help: 'the waves read in each biome (40 by default)',
    },
    seconds: {
      kind: 'number',
      usage: 's',
      help: 'the game\'s seconds read from the first blow (30 by default)',
    },
    canary: {
      kind: 'switch',
      help: 'plant the fault the measure must catch: the hero untouchable, so no blow lands',
    },
    ...SETUP_OPTIONS,
    ...COMMON_OPTIONS,
  },
  check(options) {
    if (options.seconds !== undefined && !(options.seconds >= 1)) throw labError('taken --seconds: at least 1');
    const waves = (options.waves ?? []).map(Number);
    if (waves.some((wave) => !(wave >= 1))) throw labError('taken --waves: each a wave from 1');
  },
  each(side, options) {
    const command = {
      fixture: fixtureFrom(options),
      biomes: options.biomes,
      waves: options.waves ? options.waves.map(Number) : TAKEN_WAVES,
      seconds: options.seconds ?? TAKEN_SECONDS,
      canary: Boolean(options.canary),
    };
    return side.command('taken', command);
  },
  textOf: asText,
  problemsOf: problemsIn,
};
