// `npm run lab -- eval`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { asText } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab eval`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  help: 'an expression evaluated in the page, with `lab` in scope: npm run lab -- eval "lab.player.nocked"',
  argument: 'expression',
  options: { ...COMMON_OPTIONS },
  each(side, options) {
    return side.evaluate(options._.join(' '));
  },
  textOf: asText,
};
