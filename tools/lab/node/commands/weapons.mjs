// `npm run lab -- weapons`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { fixtureFrom, picturePairs, asText, problemsIn, textWithMoments } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab weapons`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'each of the hero\'s weapons alone in a lit studio (face on, edge on, from behind, from three-quarters and '
    + 'its head close up, with its size and its triangles)',
  help: 'each of the hero\'s weapons alone in a plain, lit studio: face on, edge on, from behind, from '
    + 'three-quarters and its head close up, with its size and its triangles: tools/lab/out/weapons/sheet.png',
  options: {
    weapons: { kind: 'list', usage: 'a,b', help: 'the bases pictured (the class\'s weapons by default)' },
    canary: { kind: 'switch', help: 'an empty studio pictured too: the measure of what\'s drawn must find nothing' },
    ...SETUP_OPTIONS,
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    const command = {
      fixture: fixtureFrom(options),
      weapons: options.weapons,
      canary: Boolean(options.canary),
    };
    return side.command('weapons', command);
  },
  finish(results, options, session) {
    return textWithMoments(results, session.outFor('weapons'), session.browser);
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
