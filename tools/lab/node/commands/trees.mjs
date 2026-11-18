// `npm run lab -- trees`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab trees`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the trees in the play area as the ranger\'s arrows meet them (every tree inside the wall a wooden prop, '
    + 'an arrow shot at each one\'s trunk standing in it; then another biome shown, and no arrow left)',
  help: 'the trees in the play area as the ranger\'s arrows meet them: in each biome every tree inside the wall a '
    + 'wooden prop and an arrow shot at its trunk standing in it; then another biome shown, and no arrow left '
    + '(--class ranger)',
  options: {
    biomes: {
      kind: 'list',
      usage: 'a,b',
      choices: ['crypt', 'forest'],
      default: 'crypt,forest',
      help: 'the biomes: crypt, forest',
    },
    canary: {
      kind: 'switch',
      help: 'the first tree made stone and an arrow stuck again after the switch: both must be found',
    },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('trees', { biomes: options.biomes, canary: Boolean(options.canary) });
  },
  textOf: asText,
  problemsOf: problemsIn,
};
