// `npm run lab -- programs`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab programs`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the engine\'s scene pipelines and what sets them apart (by kind, by shader, by targets, depth, samples, '
    + 'culling; those never drawn; the fragment stages the browser compiles whole, held to a budget; the performance '
    + 'report\'s count of those first asked for in play against the engine\'s); `--cost`: each compiled again alone, '
    + 'its shaders salted so no cache answers, and timed (by kind, by shader, by samples, the longest), and again as '
    + 'the game asks, a module\'s pipelines sharing its compile; `--limits`: what the engine\'s device uses of '
    + 'WebGPU\'s limits against what every device gives',
  help: 'the engine\'s scene pipelines (its census of them, src/engine/pipelinesAside.ts): how many of each kind, '
    + 'and each field that sets them apart; those never drawn; those first asked for in play (`lab pipelines` says '
    + 'them step by step)',
  options: {
    canary: {
      kind: 'switch',
      help: 'hand the engine a box of a blending of its own, never shown (it must be listed never drawn), and show '
        + 'one of another (it must be listed drawn); a box of a look of its own (its compile must be counted); with '
        + '--limits, a texture past the defaults must be found',
    },
    limits: {
      kind: 'switch',
      help: 'what the engine\'s device uses of each of WebGPU\'s limits, held to what every device gives (the '
        + 'engine asks its adapter\'s own: past the defaults a phone\'s device refuses what a desktop draws)',
    },
    cost: {
      kind: 'switch',
      help: 'compile each pipeline again alone, its shaders salted so no cache answers, and time it: by kind, by '
        + 'shader, by samples, the longest (its canary: the cache)',
    },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    const asked = { canary: Boolean(options.canary), cost: Boolean(options.cost), limits: Boolean(options.limits) };
    return side.command('programs', asked);
  },
  textOf: asText,
  problemsOf: problemsIn,
};
