// `npm run lab -- practice`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab practice`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'casting in the lobby and the runs it starts (each skill with a cooldown cast twice at once in the '
    + 'village\'s training yard, the inventory open, put away by I and opened again, on the square, and in runs '
    + 'started at the crypt\'s portal and begun in practice, a co-op guest\'s: free where the inventory shows, a '
    + 'run\'s costs and cooldowns elsewhere, none out of the yard)',
  help: 'each skill on a key with a cooldown cast, then cast again as soon as the hero is free, in the lobby as it '
    + 'shows, in practice (stowed, as Space and a phone\'s Practice stow it), shown again after it, with every '
    + 'panel folded (a screen that shows them side by side) and in runs started from the lobby and begun in '
    + 'practice (a co-op guest\'s, as its host starts): where the lobby shows, a cast not made again at once, and '
    + 'elsewhere one made again within its cooldown, a key showing no countdown and a cast spending no energy, '
    + 'are problems',
  options: {
    canary: {
      kind: 'switch',
      help: 'the run begun in practice played again with the lobby\'s free casting planted, which must be caught',
    },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('practice', { canary: Boolean(options.canary) });
  },
  textOf: asText,
  problemsOf: problemsIn,
};
