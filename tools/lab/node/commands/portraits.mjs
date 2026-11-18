// `npm run lab -- portraits`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { picturePairs, asText, problemsIn, textWithMoments } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab portraits`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'optional portrait requests and the real co-op picker; no downloads before use, current class only, '
    + 'selection, peer picture rendering and clearing, a class\'s default picture shown with none chosen, no two '
    + 'classes\' alike (run it with `--panels`: the village\'s lobby hides the party cards it pictures). `--canary` '
    + 'requests another class and must detect it.',
  help: 'optional portrait picker: no image downloads at boot, current class only on open, selection and None',
  options: {
    canary: { kind: 'switch', help: 'request another class portrait and verify the download audit detects it' },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('portraits', { canary: Boolean(options.canary) });
  },
  finish(results, options, session) {
    return textWithMoments(results, session.outFor('portraits'), session.browser);
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
