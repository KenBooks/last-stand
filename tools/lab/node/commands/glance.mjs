// `npm run lab -- glance`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { picturePairs, asText, problemsIn, textWithMoments } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab glance`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the hero\'s casual look round as he stands idle (the head\'s turn from the chest and the eyes\' in their '
    + 'sockets, frame by frame: in the countdown, the lobby and the hall after his showcase; none walking, attacking '
    + 'or through the eyes; within a neck\'s range, its speed, a jerk, the eyes leading, never a loop; a strip of the '
    + 'first glance)',
  help: 'the hero\'s casual look round as he stands idle, read from the head\'s turn from the chest and the eyes\' '
    + 'in their sockets: in a run\'s countdown, walking and attacking from a glance, through the eyes, in the lobby '
    + 'and in the hall of heroes (within a neck\'s range, unhurried, no jerk, the eyes leading, never a loop)',
  options: {
    seconds: { kind: 'number', usage: 's', help: 'how long he stands in the countdown (40 by default)' },
    canary: {
      kind: 'switch',
      help: 'plant faults the measure must catch: the head kicked aside for a frame, glances let come as he walks',
    },
    ...SETUP_OPTIONS,
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    const command = {
      seconds: options.seconds,
      canary: Boolean(options.canary),
    };
    return side.command('glance', command);
  },
  finish(results, options, session) {
    return textWithMoments(results, session.outFor('glance'), session.browser);
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
