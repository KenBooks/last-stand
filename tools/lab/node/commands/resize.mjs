// `npm run lab -- resize`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab resize`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'what the window\'s change of size costs, as going full screen on a phone changes it (two steps and '
    + 'full, with a screen-sized touch canvas): zero drawing-buffer reallocations into full screen, rotation, pixel '
    + 'parity, blood mask and photo crop (`--canary` sizes the canvas to the window on every resize)',
  help: 'the window resized into full screen as the S25\'s was (trace 476Y-88D5: its resize handler 247 ms, '
    + '`fitViewport` in src/core/renderer.ts), checking zero drawing-buffer reallocations on touch, pixel parity, '
    + 'blood mask, photo crop and rotation',
  options: {
    rounds: {
      kind: 'number',
      help: 'times the window goes into full screen (default 5)',
    },
    canary: {
      kind: 'switch',
      help: 'size the canvas to the window on every resize (before #787), which must be caught',
    },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('resize', { rounds: Number(options.rounds ?? 5), canary: Boolean(options.canary) });
  },
  textOf: asText,
  problemsOf: problemsIn,
};
