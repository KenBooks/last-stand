// `npm run lab -- guide`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { asText, picturePairs, problemsIn, textWithPictureFiles } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab guide`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the guide\'s first opening by G and a walk through every page (each frame and the page\'s long tasks by '
    + 'the browser\'s clock, at most 100 ms; the game\'s renderer links nothing), with none made before and the '
    + 'lobby\'s own building held: each page\'s own picture drawn within 150 ms of its opening or of its compile\'s '
    + 'end, every one within 20 s of G, and a spinner in every place still waiting (`--canary=stall` makes every '
    + 'picture again at once, `--canary=slow` makes them behind the lobby alone)',
  help: 'the guide\'s first opening by G and a walk through every section and entry, each frame and the page\'s long '
    + 'tasks timed by the browser\'s clock (at most 100 ms), none of its pictures made before and the lobby\'s own '
    + 'building held: each page\'s picture drawn within 150 ms of its opening or its compile\'s end, every one within '
    + '20 s, a spinner in each place waiting; the game\'s renderer links no program for it',
  options: {
    canary: {
      kind: 'choice',
      choices: ['stall', 'slow'],
      usage: 'stall|slow',
      help: 'plant a fault the measure must catch: every picture made at once as it opens (stall), or made behind the '
        + 'lobby alone, not while it\'s open (slow)',
    },
    show: {
      kind: 'list',
      usage: 'id,id',
      help: 'entries to picture as the player sees them once the walk is done, their page and then its attacks, by '
        + 'id (rootmother,seedpod,stag)',
    },
    ...SETUP_OPTIONS,
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('guide', { canary: options.canary, ...(options.show ? { show: options.show } : {}) });
  },
  finish(results, options, session) {
    return textWithPictureFiles(results, session.outFor('guide'));
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
