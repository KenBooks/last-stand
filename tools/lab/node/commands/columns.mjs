// `npm run lab -- columns`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab columns`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the crypt\'s broken columns roll after roll (no open edge in a mesh, no cliff across a break\'s face)',
  help: 'the crypt\'s broken columns roll after roll: each mesh welded, an edge one triangle uses above the '
    + 'shaft\'s foot is a hole; the break\'s face inside the flutes no steeper than 75 degrees',
  options: {
    seeds: { kind: 'list', usage: 'a,b', help: 'the runs\' seeds the columns are rolled from (1 to 12)' },
    canary: { kind: 'switch', help: 'a triangle taken out of the first column\'s break: it must be found' },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('columns', { seeds: options.seeds?.map(Number), canary: Boolean(options.canary) });
  },
  textOf: asText,
  problemsOf: problemsIn,
};
