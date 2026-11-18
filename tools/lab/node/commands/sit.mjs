// `npm run lab -- sit`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { fixtureFrom, picturePairs, asText, problemsIn, textWithMoments } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab sit`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'an idle hero\'s sit on every seat (logs, stones, columns, by fires, the village\'s bench and campfire, '
    + 'the tavern\'s stools and bench, the library\'s armchair): E on the seat pointed at, walked to, sat on its top, '
    + 'every joint within its range, up first when asked to act; --poses a sheet from round him (in full in '
    + '`commands/sit.md`)',
  help: 'an idle hero\'s sit on a log or a stone: walked to from 3 m off, sat on his side of it, his hips on its '
    + 'top, his feet down or hanging as its height has them, every joint within its range, glancing round; then '
    + 'asked to act, a tap and a key held: up first each time, a tap left undone, a held key done once he\'s up',
  options: {
    seats: {
      kind: 'list',
      usage: 'a,b',
      help: 'the seats tried: log, stone, column, fire, brazier, the village\'s bench and campfire, and in its '
        + 'houses the tavern\'s stool and tavernbench and the library\'s armchair (all by default)',
    },
    poses: {
      kind: 'switch',
      help: 'no measures: the warrior sat, each way of holding his gear on each seat, numbered pictures from three '
        + 'sides',
    },
    round: {
      kind: 'switch',
      help: 'no pictures: E pressed from 12 ways round every seat of each kind, from near and far, and why he did '
        + 'not sit',
    },
    frames: { kind: 'switch', help: 'list every frame his skirts jerked as he sat (their first 40)' },
    trace: {
      kind: 'text',
      usage: 'piece',
      help: 'list a carried piece frame by frame (shield, Greatsword...): how far it went and turned, held or not',
    },
    canary: { kind: 'switch', help: 'plant a fault the measure must catch: his body raised off the seat as he sits' },
    ...SETUP_OPTIONS,
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    const command = {
      fixture: fixtureFrom(options),
      seats: options.seats,
      frames: Boolean(options.frames),
      round: Boolean(options.round),
      trace: options.trace,
      canary: Boolean(options.canary),
      poses: Boolean(options.poses),
    };
    return side.picturedCommand('sit', command);
  },
  finish(results, options, session) {
    return textWithMoments(results, session.outFor('sit'), session.browser);
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
