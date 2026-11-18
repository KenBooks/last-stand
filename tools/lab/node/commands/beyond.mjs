// `npm run lab -- beyond`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { labError } from '../errors.mjs';
import { asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab beyond`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the ranger\'s arrows loosed over the wall at the ground and the trees beyond it, over the shoulder; each '
    + 'arrow left standing must have a surface drawn at its point',
  help: 'the ranger\'s arrows loosed over the wall: in each biome, at angles round the ring, his basic attack drawn '
    + 'to full at the ground past the wall and the nearest tree that way; each arrow left standing must have a '
    + 'surface drawn at its point (one in the air is a problem; --class ranger)',
  options: {
    biomes: {
      kind: 'list',
      usage: 'a,b',
      choices: ['crypt', 'forest'],
      default: 'crypt,forest',
      help: 'the biomes: crypt, forest',
    },
    angles: { kind: 'number', usage: 'n', help: 'the angles round the ring he shoots out at (8 by default)' },
    canary: { kind: 'switch', help: 'an arrow planted standing in the air past the wall: it must be found' },
    ...COMMON_OPTIONS,
  },
  check(options) {
    if (options.angles !== undefined && !(options.angles >= 1)) throw labError('beyond --angles: at least 1');
  },
  each(side, options) {
    const command = {
      biomes: options.biomes,
      angles: Math.round(options.angles ?? 8),
      canary: Boolean(options.canary),
    };
    return side.command('beyond', command);
  },
  textOf: asText,
  problemsOf: problemsIn,
};
