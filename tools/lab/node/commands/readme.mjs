// `npm run lab -- readme`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { picturePairs, asText, problemsIn, textWithPictureFiles } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** the README's pictures `readme` takes, in the order it takes them (page/readmeShots.ts `SHOTS`) */
export const README_SHOTS = ['village', 'campfire', 'hall', 'stash', 'forest', 'crypt', 'choice', 'party', 'down'];

/** `lab readme`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the README\'s pictures, each a moment posed and pictured as the player sees it (the village, the party '
    + 'round its campfire, the hall of heroes, the stash, a fight in each battleground, the choice after a wave, a '
    + 'party of four in a fight and one of them down, a partner raising him; `--shots`, `--class`, `--after`: '
    + '`docs/screenshots/AGENTS.md`)',
  help: 'the README\'s pictures (docs/screenshots), each a moment of the game posed and pictured as the player '
    + 'sees it, its UI over the frame: the village, the party round its campfire, the hall of heroes, the stash, a '
    + 'fight in each battleground, the choice after a wave, a party of four in a fight and one of them down '
    + '(tools/lab/out/readme; --class the hero, --screen the picture\'s size)',
  options: {
    shots: { kind: 'list', usage: 'a,b', choices: README_SHOTS, help: 'the shots taken (every one by default)' },
    after: {
      kind: 'number',
      usage: 'frames',
      help: 'a fight pictured this many frames after its skill\'s press, in place of the shot\'s own',
    },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('readme', { shots: options.shots, after: options.after });
  },
  finish(results, options, session) {
    return textWithPictureFiles(results, session.outFor('readme'));
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
