// `npm run lab -- spawns`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { labError } from '../errors.mjs';
import { fixtureFrom, asText, problemsIn } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** the waves `spawns` sets off in each biome unless `--waves` says */
const SPAWN_WAVES = 32;

/** `lab spawns`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the foes coming in (boss waves one after another, a seed each: the gate every foe came by, its spot '
    + 'against the props, the gates each group and wave left idle, when the boss came against the rest of its wave, '
    + 'and its walk to the hero from each gate)',
  help: 'waves set off one after another in each biome (boss waves, the 5th to the 20th), a seed each, the hero at '
    + 'the arena\'s middle: the gate every foe came in by and the spot it rose on against the props and the edge, '
    + 'how many gates each group came by and its packs, the waves leaving a gate idle, when the boss came against '
    + 'the first group reaching the hero, and from each gate the first boss\'s walk to him; then waves 1, 5 and 10 '
    + 'at the game\'s own pace, each foe taken out as it reaches him; a number of gates no group came by, a wave '
    + 'leaving a gate idle, a gate no boss came by, a foe risen in a prop, a boss early or late and one that never '
    + 'reached the hero are problems',
  options: {
    biomes: {
      kind: 'list',
      usage: 'a,b',
      choices: ['crypt', 'forest'],
      default: 'crypt,forest',
      help: 'the biomes: crypt, forest',
    },
    waves: {
      kind: 'number',
      usage: 'n',
      help: 'the waves in each biome (32 by default; the bosses\' gates are judged over 24 at least)',
    },
    canary: {
      kind: 'switch',
      help: 'plant faults the measures must catch, in the first biome: every foe read again moved onto one gate, '
        + 'the first half into a prop, and one more wave\'s boss frozen where it rose',
    },
    ...SETUP_OPTIONS,
    ...COMMON_OPTIONS,
  },
  check(options) {
    if (options.waves !== undefined && !(options.waves >= 1)) throw labError('spawns --waves: at least 1');
  },
  each(side, options) {
    const command = {
      fixture: fixtureFrom(options),
      biomes: options.biomes,
      waves: Math.round(options.waves ?? SPAWN_WAVES),
      canary: Boolean(options.canary),
    };
    return side.command('spawns', command);
  },
  textOf: asText,
  problemsOf: problemsIn,
};
