// `npm run lab -- resize`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab resize`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'what the window\'s change of size costs, as going full screen on a phone changes it (two steps and '
    + 'full): the event\'s work and the next frame\'s by the browser\'s clock, the drawing buffer and the render '
    + 'targets rebuilt',
  help: 'the window resized into full screen as the S25\'s was (trace 476Y-88D5: its resize handler 247 ms, '
    + '`fitViewport` in src/core/renderer.ts), each step timed and its rebuilds counted',
  options: {
    rounds: {
      kind: 'number',
      help: 'times the window goes into full screen (default 5)',
    },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('resize', { rounds: Number(options.rounds ?? 5) });
  },
  textOf: asText,
  problemsOf: problemsIn,
};
