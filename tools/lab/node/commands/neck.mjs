// `npm run lab -- neck`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { picturePairs, asText, problemsIn, textWithPictureFiles } from '../commandKit.mjs';
import { LOOK_OPTION, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab neck`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'each hero\'s neck, bare, dressed and in his hat, at rest and looking aside (ledges, the head\'s skin\'s '
    + 'seam on the neck, girth, skin through the clothes, the ground seen through round the collar; pictured from six '
    + 'sides)',
  help: 'each hero\'s neck as it\'s sculpted, bare, in his chest item and under his hat or helm, at rest and '
    + 'looking aside: read up lines all round it from the clothes to the head (the ridges and shelves round it, the '
    + 'step and colour where the head\'s own skin takes over from the neck\'s, its girth against a man\'s, skin '
    + 'through the clothes) and pictured close in a lit studio from behind, the sides, the front and from above '
    + 'behind: tools/lab/out/neck/sheet.png',
  options: {
    classes: {
      kind: 'list',
      usage: 'a,b',
      choices: ['warrior', 'mage', 'ranger'],
      default: 'warrior,mage,ranger',
      help: 'the heroes',
    },
    dresses: {
      kind: 'list',
      usage: 'a,b',
      choices: ['bare', 'chest', 'hat'],
      default: 'bare,chest,hat',
      help: 'what he wears: nothing over his clothes, his chest item, that and his hat or helm',
    },
    poses: {
      kind: 'list',
      usage: 'a,b',
      choices: ['rest', 'aside'],
      default: 'rest,aside',
      help: 'his head straight, or turned aside and bowed a little as he looks at a foe',
    },
    look: LOOK_OPTION,
    canary: {
      kind: 'switch',
      help: 'plant the faults the measures must catch: a ridge round the neck, and the neck\'s skin paler and wider '
        + 'where the head\'s takes over',
    },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    const command = {
      classes: options.classes,
      dresses: options.dresses,
      poses: options.poses,
      look: options.look ?? 'lit',
      canary: Boolean(options.canary),
    };
    return side.command('neck', command);
  },
  finish(results, options, session) {
    // (a file a picture: a sheet of them all, 90 close-ups, was more than the browser would lay out)
    return textWithPictureFiles(results, session.outFor('neck'));
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
