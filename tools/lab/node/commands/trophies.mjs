// `npm run lab -- trophies`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { picturePairs, asText, problemsIn, textWithMoments } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab trophies`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the house of records\' trophies (every boss a battleground brings with a trophy, a place and a model of '
    + 'its own; none beaten, an empty shield or stand at each place, a ray at it meeting the mount; all beaten, each '
    + 'trophy shown on its place; no pipeline made, every frame drawn; the room\'s draws and triangles; the back wall '
    + 'and the cabinet pictured over the shoulder and from above, each place close up from the front and '
    + 'three-quarters, beaten and not); `--canary` shows a trophy unbeaten and sets another off its place.',
  help: "the house of records' trophies: an empty shield or stand at each place with no boss beaten, each trophy on "
    + 'its place with all beaten, nothing compiled, the room counted and pictured',
  options: {
    canary: { kind: 'switch', help: 'show a trophy unbeaten and set another off its place, which must be caught' },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('trophies', { canary: Boolean(options.canary) });
  },
  // (its moments written: the room each way, and each place close up)
  finish(results, options, session) {
    return textWithMoments(results, session.outFor('trophies'), session.browser);
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
