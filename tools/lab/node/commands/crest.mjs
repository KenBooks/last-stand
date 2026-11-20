// `npm run lab -- crest`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab crest`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the village\'s crest blown away: its first blow on the context the boot made at its start (made half way '
    + 'through the boot, it waited 3.7 s behind the lobby\'s compiles), a blow at High by the wind, one at Very low '
    + 'faded with no context made',
  help: 'the village\'s crest blown away as the lobby shows it (src/ui/crestBlow.ts): its first blow must be on the '
    + 'context the boot made at its start, a blow at High by the wind, and one at Very low faded, with no context '
    + 'waiting for it',
  options: {
    canary: {
      kind: 'switch',
      help: 'the level put at Very low for the High blow: its fade must be caught',
    },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('crest', { canary: Boolean(options.canary) });
  },
  textOf: asText,
  problemsOf: problemsIn,
};
