// `npm run lab -- auto`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { autoTraces } from '../autoTraces.mjs';
import { asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab auto`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'Auto quality\'s walk down from High on a slow device (fed a GPU-bound device\'s frame times: each step, '
    + 'the time until it holds 50 fps, at most 20 s; a fast device with long hitches never stepped), and its boots '
    + 'from a level it settled on (the level above tried: kept on a fast device, left at once on a slow one, within '
    + '3.2 s on a phone just under the target there, and put off for 1, 2, 4, then 8 boots after each miss); the '
    + 'GPU\'s own time a frame (a CPU-bound strong GPU kept on High, a GPU-bound one stepped down, a hitch\'s step '
    + 'tried again); and a strong GPU\'s real boot and lobby walk played from its trace (the owner\'s 4070 Ti, '
    + 'P307-C0HE), ending on High',
  help: 'Auto quality\'s walk down from High on a slow device (src/core/quality.ts): Auto set as a player sets it, '
    + 'fed each frame\'s time as a GPU-bound device takes it (in proportion to the scene\'s pixels, at the '
    + 'level\'s cost: an integrated GPU\'s, 5 frames a second at High on a 2864x1536 canvas), each step listed and '
    + 'the time until the device holds 50 frames a second, at most 20 s (--screen 1432x768@2: the tester\'s); then '
    + 'the kept traces of strong GPUs (node/autoTraces/) played through Auto frame by frame',
  options: {
    canary: {
      kind: 'switch',
      help: 'Auto\'s old pace too, a step a 4 s window and half the pixels: too slow; and the traces as main judged '
        + 'them (every frame but a warm-up\'s, the GPU\'s time unread): settled under High',
    },
    trace: {
      kind: 'text',
      usage: 'code',
      help: 'a trace fetched before (npm run lab -- trace <code>) played with the kept ones',
    },
    keep: { kind: 'switch', help: 'with --trace, its frames kept in node/autoTraces/ to be played every run' },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    const traces = autoTraces(options.trace, Boolean(options.keep));
    return side.command('auto', { canary: Boolean(options.canary), traces });
  },
  textOf: asText,
  problemsOf: problemsIn,
};
