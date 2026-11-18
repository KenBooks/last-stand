// `npm run lab -- herolooks`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { picturePairs, asText, problemsIn, textWithMoments } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab herolooks`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'each class\'s looks (`data/heroLooks.ts`) made by the workers and a hero built in each (his head sculpted '
    + 'nowhere on the page, its face, hair and beard there, no program compiled as the game draws him), pictured in '
    + 'the studio, the hair colours on one hero of each, two colours compared on the hair\'s cards, the brows and the '
    + 'beard and not the cheeks, and a look picked kept (`--classes`, `--canary`)',
  help: 'each class\'s looks (data/heroLooks.ts) made by the workers and a hero built in each: his head sculpted '
    + 'nowhere on the page, its face, hair and beard there, no program compiled as the game draws him; each '
    + 'pictured in the studio (face, three-quarters, behind, his figure), the hair colours on one hero of each, '
    + 'two hair colours compared on the hair\'s cards, the brows and the beard (the cheeks left alone), and a '
    + 'look picked kept in the profile: tools/lab/out/herolooks/sheet.png',
  options: {
    classes: { kind: 'list', usage: 'a,b', help: 'the heroes (warrior, mage, ranger by default)' },
    canary: {
      kind: 'switch',
      help: 'plant the faults the measure must catch: a hair colour that leaves the face\'s paint and the cards\' '
        + 'colour alone, and a look not kept',
    },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('herolooks', { classes: options.classes, canary: Boolean(options.canary) });
  },
  finish(results, options, session) {
    return textWithMoments(results, session.outFor('herolooks'), session.browser);
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
