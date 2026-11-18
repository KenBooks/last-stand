// `npm run lab -- gait`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { labError } from '../errors.mjs';
import { tunesFrom, asText, problemsIn, textWithSheetEach } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab gait`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the walk judged as a person\'s, on level ground and the steps, drawn and not, tapping, turning and '
    + 'circling: each foot\'s time on the ground, the steps\' rate, length and width, hops and gallops, the hips, the '
    + 'hands\' swing, the jerks (in full in `commands/gait.md`)',
  help: 'the hero\'s walk judged as a person\'s, over level ground and the dais\'s steps, nothing drawn, drawn and '
    + 'changing direction: the time on each foot, both and neither, the steps, the hops, the hips\' rise and fall, '
    + 'the jerks, each filmed from the side',
  options: {
    scenarios: {
      kind: 'list',
      usage: 'a,b',
      choices: ['walk', 'run', 'drawn', 'taps', 'zigzag', 'circle', 'circleDrawn', 'stairs', 'stairsDrawn'],
      help: 'the scenarios (all by default): walk, run, drawn, taps, zigzag, circle, circleDrawn, stairs, '
        + 'stairsDrawn',
    },
    frames: { kind: 'switch', help: 'list every step (its foot, when it left and landed, how far) and the hops' },
    trace: {
      kind: 'switch',
      help: 'list every frame: the way the body faces and goes, the pelvis, the cycle, each foot',
    },
    span: { kind: 'pair', usage: 'from,to', help: 'with --trace, only the frames from the first to the second' },
    films: {
      kind: 'switch',
      help: 'film each scenario, run again for it (=false: the numbers alone, in half the time)',
    },
    offsets: {
      kind: 'list',
      usage: 'a,b',
      help: 'each scenario from these starts, a run each on one page: its first move so many frames longer '
        + '(its turns at other points of a stride; 0 alone by default)',
    },
    tune: SETUP_OPTIONS.tune,
    ...COMMON_OPTIONS,
  },
  keepsPage: true,
  each(side, options) {
    return side.command('gait', {
      scenarios: options.scenarios,
      frames: Boolean(options.frames),
      trace: Boolean(options.trace),
      span: options.span,
      films: options.films !== false,
      offsets: (options.offsets ?? [0]).map(Number),
      tune: options.tune === undefined ? undefined : tunesFrom(options.tune),
    });
  },
  check(options) {
    const wrong = (options.offsets ?? []).find((offset) => !Number.isInteger(Number(offset)) || Number(offset) < 0);
    if (wrong !== undefined) throw labError(`gait --offsets: ${wrong} is not a whole number of frames`);
  },
  finish(results, options, session) {
    return textWithSheetEach(results, session.outFor('gait'), session.browser);
  },
  textOf: asText,
  problemsOf: problemsIn,
  countsOf: (result) => result.counts,
  // (an A/B compares the reports, not the films: two sides' 48 frames each, loaded to compare, took the browser down)
};
