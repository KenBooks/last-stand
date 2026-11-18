// `npm run lab -- winding`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab winding`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'which way every model\'s, the library\'s scholar\'s and biome\'s faces point (each mesh split into its '
    + 'parts, each judged by its signed volume: a part wound inside out on a one-sided material shows its inside)',
  help: 'which way the game\'s faces point: every model built afresh and every biome\'s props, each mesh split '
    + 'into its parts and each judged by its signed volume (out, in, or open); a part wound inside out on a '
    + 'one-sided material shows its inside',
  options: {
    models: { kind: 'list', usage: 'a,b', help: 'the models, by their id (`husk`, `ranger`; every one by default)' },
    biomes: {
      kind: 'list',
      usage: 'a,b',
      choices: ['crypt', 'forest'],
      default: 'crypt,forest',
      help: 'the biomes: crypt, forest',
    },
    canary: { kind: 'switch', help: 'a box wound inside out, drawn one sided, planted in the first biome' },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    const command = {
      models: options.models,
      biomes: options.biomes,
      canary: Boolean(options.canary),
    };
    return side.command('winding', command);
  },
  textOf: asText,
  problemsOf: problemsIn,
};
