// `npm run lab -- maps`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { labError } from '../errors.mjs';
import { picturePairs, asText, problemsIn, textWithSheetsByGroup } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab maps`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the procedural maps a first visit\'s workers make, each timed alone with a digest of its pixels (a map '
    + 'made faster must keep every one: `--ab`), its seams (a repeated map must tile) and its means; `--pictures` '
    + 'shows each as a surface takes it',
  help: 'the procedural maps a first visit makes in its workers (src/core/pbr.ts PRELOAD), each made on the page '
    + 'and timed, and a digest of its pixels: a map made faster keeps every pixel (with --ab, each digest as '
    + 'main\'s, the times side by side); each repeated map\'s seams (a seam fails it) and its means',
  options: {
    maps: { kind: 'list', usage: 'a,b', help: 'the recipes made, by name (every one by default)' },
    runs: { kind: 'number', usage: 'n', help: 'how many times each is made, its time the fastest (1 by default)' },
    pictures: {
      kind: 'switch',
      help: 'each map\'s albedo and height laid twice each way, its corner at its own pixels and its material lit '
        + 'on a square and a ball, a sheet a group (metal, stone, wood...)',
    },
    canary: {
      kind: 'switch',
      help: 'a byte of the first map\'s pixels changed once it\'s made (its digest must change), and a ramp '
        + 'across u planted in a copy of it (a seam must be found)',
    },
    ...COMMON_OPTIONS,
  },
  check(options) {
    if (options.runs !== undefined && !(options.runs >= 1)) throw labError('maps --runs: at least 1');
  },
  each(side, options) {
    const command = {
      maps: options.maps,
      runs: options.runs ?? 1,
      pictures: Boolean(options.pictures),
      canary: Boolean(options.canary),
    };
    return side.command('maps', command);
  },
  finish(results, options, session) {
    return textWithSheetsByGroup(results, session.outFor('maps'), session.browser);
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
