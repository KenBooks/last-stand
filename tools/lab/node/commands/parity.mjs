// `npm run lab -- parity`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { picturePairs, asText, problemsIn, textWithMoments } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab parity`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the same scenes pictured as the player sees them, to compare what two commits draw (`--ab`: '
    + 'each biome\'s arena, the village at noon and midnight from its places, from above and over the '
    + 'shoulder; the pictures are the page\'s own, as WebGPU\'s canvas can\'t be read back; what differs is the '
    + 'A/B\'s verdict and the pictures side by side)',
  help: 'the same scenes pictured as the player sees them, to compare what two commits draw (--ab): '
    + 'each biome\'s arena, then the village at noon and midnight from its places, from above and '
    + 'over the shoulder; the A/B\'s verdict and the pictures side by side say what differs (tools/lab/out/parity)',
  options: {
    scenes: {
      kind: 'list',
      usage: 'a,b',
      help: 'the scenes whose names have any of these in them (crypt, forest, square, hallDoor, hallInside, yard, '
        + 'campfire, cottage; every one by default)',
    },
    hours: { kind: 'list', usage: 'h,h', help: 'the hours the village is pictured at (12,0 by default)' },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('parity', { scenes: options.scenes, hours: options.hours?.map(Number) });
  },
  finish(results, options, session) {
    return textWithMoments(results, session.outFor('parity'), session.browser);
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
