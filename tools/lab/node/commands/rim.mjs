// `npm run lab -- rim`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab rim`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the hero walked round the wall pressed into it, each way (a frame he moved further than a run takes him, '
    + 'thrown by the wall; a stop he can\'t walk back in from, stuck)',
  help: 'the hero walked round the wall pressed into it, each way: every frame he moved further than a run '
    + 'takes him (thrown by the wall), and every stop he can\'t walk back in from (stuck)',
  options: {
    biomes: {
      kind: 'list',
      usage: 'a,b',
      choices: ['crypt', 'forest'],
      default: 'crypt,forest',
      help: 'the biomes: crypt, forest',
    },
    canary: { kind: 'switch', help: 'a jump of 1 m planted and a stop held in place: both must be caught' },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('rim', { biomes: options.biomes, canary: Boolean(options.canary) });
  },
  textOf: asText,
  problemsOf: problemsIn,
};
