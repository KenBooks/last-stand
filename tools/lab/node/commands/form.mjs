// `npm run lab -- form`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { tunesFrom, picturePairs, asText, problemsIn, textWithSheetsByGroup } from '../commandKit.mjs';
import { WEAPON_STYLES, SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab form`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the run judged against a runner\'s (published runners\' cadence, time on the ground, joint curves over '
    + 'the stride, lean, bounce and arm swing, at a man\'s size, with each way the hero holds his weapons: stick '
    + 'figures of his stride over a runner\'s, and the hero pictured from both sides, in the game\'s views and his '
    + 'arms close up, at eight points of it; the set-up\'s `--gear` holds them any way his class can)',
  help: 'the hero\'s run judged against a runner\'s, with each way he holds his weapons: the stride\'s timing, '
    + 'each joint\'s curve over it, stick figures over a runner\'s and the hero pictured at eight points of it: '
    + 'tools/lab/out/form/<way>.png',
  options: {
    gear: {
      kind: 'list',
      usage: 'a,b',
      choices: WEAPON_STYLES,
      help: `the ways of holding the weapons (the class's all by default): ${WEAPON_STYLES.join(', ')}`,
    },
    canary: {
      kind: 'switch',
      help: 'plant a fault the measure must catch: the left knee straight through its stance',
    },
    frames: { kind: 'switch', help: 'list each leg\'s cycles and the curves bin by bin' },
    pictures: {
      kind: 'switch',
      help: 'picture the run: stick figures, and the hero run again for him (=false: the numbers alone)',
    },
    tune: SETUP_OPTIONS.tune,
    ...COMMON_OPTIONS,
  },
  keepsPage: true,
  each(side, options) {
    const listed = { canary: Boolean(options.canary), frames: Boolean(options.frames) };
    const tune = options.tune === undefined ? undefined : tunesFrom(options.tune);
    return side.command('form', { gear: options.gear, ...listed, pictures: options.pictures !== false, tune });
  },
  finish(results, options, session) {
    return textWithSheetsByGroup(results, session.outFor('form'), session.browser);
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
