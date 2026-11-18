// `npm run lab -- feet`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { picturePairs, asText, problemsIn, textWithMoments } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab feet`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the feet against the ground round the dais\'s edges and on level ground (standing at full draw, walking '
    + 'across, strafing drawn, running reversals: out of reach, wobbling, sliding, in a riser, the rhythm)',
  help: 'the hero\'s feet against the ground round the dais\'s edges and on level ground: standing at full draw by '
    + 'the edges, walking across them and strafing up and down the steps with a shot drawn',
  options: {
    scenarios: {
      kind: 'list',
      usage: 'a,b',
      choices: ['edge', 'level', 'strafe', 'cross', 'run'],
      help: 'the scenarios (all by default): edge, level, strafe, cross, run',
    },
    canary: { kind: 'switch', help: 'plant faults the measures must catch: a planted ankle slid, one sunk' },
    frames: { kind: 'switch', help: 'list every stance and standing case flagged, and what was wrong with it' },
    trace: { kind: 'switch', help: 'each frame of each walk, foot by foot (pick one with --scenarios)' },
    ...COMMON_OPTIONS,
  },
  keepsPage: true,
  each(side, options) {
    return side.command('feet', {
      scenarios: options.scenarios,
      canary: Boolean(options.canary),
      frames: Boolean(options.frames),
      trace: Boolean(options.trace),
    });
  },
  finish(results, options, session) {
    return textWithMoments(results, session.outFor('feet'), session.browser);
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
