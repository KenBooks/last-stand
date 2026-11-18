// `npm run lab -- talk`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { picturePairs, asText, problemsIn, textWithMoments } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab talk`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'a whole conversation with the library\'s Brother Hollis as a player has it: in full in '
    + '[`commands/talk.md`](commands/talk.md).',
  help: "a whole conversation with the library's Brother Hollis as a player has it: a first meeting's lines one at a "
    + 'time by the game\'s clock (each its time to read, a nod to each, his face up to the hero), every way to pick '
    + '(a key, the arrows and Enter, the mouse, a tap, Leave), the talk remembered in the profile across a visit '
    + 'after, the card and replies within the window, and the frame\'s cost with the card up',
  options: {
    canary: { kind: 'switch', help: 'show every line at once and push Leave off the window, each of which must be found' },
    ...COMMON_OPTIONS,
  },
  each: (side, options) => side.command('talk', { canary: Boolean(options.canary) }),
  // (its moments written: the card at a first meeting, a choice lit, the rumour, a visit after, his take on the hero)
  finish: (results, options, session) => textWithMoments(results, session.outFor('talk'), session.browser),
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
