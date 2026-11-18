// `npm run lab -- wall`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { labError } from '../errors.mjs';
import { asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab wall`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'how near the hero walks up to the wall (at angles round the ring he walks straight out until it stops '
    + 'him; the gap between his body and the nearest surface drawn)',
  help: 'how near the hero walks up to the wall: in each biome, at angles round the ring, he walks straight out '
    + 'until it stops him, and rays across his way read the gap between his body and the nearest surface drawn '
    + '(more than 20 cm is air between them; below -5 cm his body is in it)',
  options: {
    biomes: {
      kind: 'list',
      usage: 'a,b',
      choices: ['crypt', 'forest'],
      default: 'crypt,forest',
      help: 'the biomes: crypt, forest',
    },
    angles: { kind: 'number', usage: 'n', help: 'the angles round the ring he walks out at (48 by default)' },
    canary: { kind: 'switch', help: 'the first angle\'s gap read a metre short of where he stopped: it must be seen' },
    ...COMMON_OPTIONS,
  },
  check(options) {
    if (options.angles !== undefined && !(options.angles >= 1)) throw labError('wall --angles: at least 1');
  },
  each(side, options) {
    const command = {
      biomes: options.biomes,
      angles: Math.round(options.angles ?? 48),
      canary: Boolean(options.canary),
    };
    return side.command('wall', command);
  },
  textOf: asText,
  problemsOf: problemsIn,
};
