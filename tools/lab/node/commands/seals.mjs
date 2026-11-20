// `npm run lab -- seals`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab seals`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'what the village\'s walls cost to seal (the rays out from each room\'s middle the boot casts: 2 to 5 s of '
    + 'a village boot at 4x CPU), each sealed again on the browser\'s clock, and what each bounds as a digest, the '
    + 'same before and after (`--ab`: the same as main\'s)',
  help: 'the village\'s wall and each house\'s room\'s sealed again (src/world/wall.ts `seal`), each timed by the '
    + 'browser\'s own clock, and what each bounds, slice by slice, as a digest read before and after, which must agree',
  options: {
    canary: {
      kind: 'switch',
      help: 'a box stood a metre from the first room\'s middle before its seal: its bounds must change',
    },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('seals', { canary: Boolean(options.canary) });
  },
  textOf: asText,
  problemsOf: problemsIn,
};
