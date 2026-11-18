// `npm run lab -- hands`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { fixtureFrom, picturePairs, asText, problemsIn, textWithMoments } from '../commandKit.mjs';
import { LOOK_OPTION, SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab hands`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the hero\'s right hand alone in the studio, flat, open, relaxed, in a fist and round a handle, from each '
    + 'side and close up (its size against a man\'s, its triangles, where it was sculpted)',
  help: 'the hero\'s right hand alone in a plain, lit studio, laid flat, open, relaxed, strained, in a fist and closed '
    + 'round a handle, from the back, the palm, each side, the fingertips and three-quarters, with its size against '
    + 'a man\'s and its triangles: tools/lab/out/hands/sheet.png',
  options: {
    poses: {
      kind: 'list',
      usage: 'a,b',
      choices: ['flat', 'open', 'relaxed', 'strained', 'fist', 'clenched', 'handle'],
      help: 'the poses pictured (all by default)',
    },
    views: {
      kind: 'list',
      usage: 'a,b',
      choices: ['back', 'palm', 'thumb', 'little', 'tips', 'quarter', 'caster', 'cuffs', 'web', 'joints',
        'fingers', 'pads', 'thumbtip'],
      help: 'the views (all but the close-ups by default: cuffs, the glove\'s cuffs over the fingers; web, the '
        + 'thumb\'s web; joints, the fingers\' knuckles from the little finger\'s side; fingers and pads, the '
        + 'fingers as their owner sees them and from the palm\'s side; thumbtip, the thumb)',
    },
    look: LOOK_OPTION,
    glove: { kind: 'switch', help: 'the hand in its glove (=false: bare; as the hero\'s is by default)' },
    canary: {
      kind: 'switch',
      help: 'an empty studio pictured too, where nothing may be found drawn, and the hand built 10% larger, '
        + 'which must measure so. The warrior’s old handle-based fist must fail the clenched contact check',
    },
    ...SETUP_OPTIONS,
    ...COMMON_OPTIONS,
  },
  check(options) {
    if (options.poses?.length === 1 && options.poses[0] === 'clenched') options.class ??= 'warrior';
  },
  each(side, options) {
    const command = {
      fixture: fixtureFrom(options),
      poses: options.poses,
      views: options.views,
      look: options.look,
      glove: options.glove,
      canary: Boolean(options.canary),
    };
    return side.command('hands', command);
  },
  finish(results, options, session) {
    return textWithMoments(results, session.outFor('hands'), session.browser);
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
