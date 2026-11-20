// `npm run lab -- odo`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { picturePairs, asText, problemsIn, textWithMoments } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab odo`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: "Odo's day in his shop (the hero walking in on him dusting: the duster set down, his desk reached and the "
    + 'hero greeted, looked at; back to work with the hero by the door; each task pictured at its heart, stocking, '
    + 'dusting, the dagger looked over, a coin weighed, the ledger; a glance; close-ups of his face and ears, his '
    + 'elbow, each thing in his hand, the showpieces and the display table; his standing feet never sliding, each ankle '
    + "where it's put, his arms off the counter and out of his body, the quill and the blade out of his hands, no "
    + 'program compiled, the frame\'s draws and triangles; in full in `commands/odo.md`); `--canary` drags his standing '
    + 'feet under him.',
  help: "Odo's day in his shop: the hero walks in on him dusting (the duster set down, his desk reached, the "
    + 'hero greeted and looked at), back to work with the hero by the door, each task pictured at its heart '
    + '(stocking, dusting, the dagger looked over, a coin weighed, the ledger), a glance at the hero; his standing '
    + 'feet never sliding, each ankle where it is put, his arms clear of the counter and himself, what he holds clear '
    + 'of his hands, no program compiled, his update timed',
  options: {
    canary: { kind: 'switch', help: 'drag his standing feet along under him, which must be caught' },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('odo', { canary: Boolean(options.canary) });
  },
  // (its moments written: each task, the close-ups, the greeting)
  finish(results, options, session) {
    return textWithMoments(results, session.outFor('odo'), session.browser);
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
