// `npm run lab -- auto`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab auto`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'Auto quality\'s walk down from High on a slow device (fed a GPU-bound device\'s frame times: each step, '
    + 'the time until it holds 50 fps, at most 20 s; a fast device with long hitches never stepped), and its boots '
    + 'from a level it settled on (the level above tried: kept on a fast device, left at once on a slow one, within '
    + '3.2 s on a phone just under the target there, and put off for 1, 2, 4, then 8 boots after each miss)',
  help: 'Auto quality\'s walk down from High on a slow device (src/core/quality.ts): Auto set as a player sets it, '
    + 'fed each frame\'s time as a GPU-bound device takes it (in proportion to the scene\'s pixels, at the '
    + 'level\'s cost: an integrated GPU\'s, 5 frames a second at High on a 2864x1536 canvas), each step listed and '
    + 'the time until the device holds 50 frames a second, at most 20 s (--screen 1432x768@2: the tester\'s)',
  options: {
    canary: { kind: 'switch', help: 'Auto\'s old pace too, a step a 4 s window and half the pixels: too slow' },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('auto', { canary: Boolean(options.canary) });
  },
  textOf: asText,
  problemsOf: problemsIn,
};
