// `npm run lab -- pipelines`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** frames of the lobby drawn before what was drawn with is read */
const FRAMES = 120;

/** `lab pipelines`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the engine\'s scene pipelines the boot asks for, step by step and by kind (whole, after the depth, '
    + 'depth first, shadow, sprites), against those the lobby\'s frames then draw with: what the loading screen '
    + 'waits for that nothing draws',
  help: 'the engine\'s scene pipelines asked for under the loading screen (src/engine/pipelinesAside.ts), each '
    + 'boot step\'s by kind, and how many of them the lobby\'s frames draw with; the loading screen waits for every '
    + 'one (an Adreno 810 waited out its 12 s budget at "Warming the hearth", trace DMDE-1E1R). Run it with --cold '
    + 'and --boot verylow for a phone\'s boot',
  options: {
    frames: {
      kind: 'number',
      help: `frames of the lobby drawn before reading what was drawn with (${FRAMES})`,
    },
    canary: {
      kind: 'switch',
      help: 'what was drawn forgotten and no frame drawn: every pipeline must read as never drawn',
    },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('pipelines', { frames: options.frames ?? FRAMES, canary: Boolean(options.canary) });
  },
  textOf: asText,
  problemsOf: problemsIn,
};
