// `npm run lab -- spin`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { fixtureFrom, asText, problemsIn } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab spin`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'mouse look turned one way for a long while in each close view, then the other, the browser\'s own jump '
    + 'under the lock sent mid-spin (no frame turning the view past three times the spin\'s steady turn, #318)',
  help: 'mouse look turned one way for a long while in each close view, then the other, the pointer locked as the '
    + 'player\'s click takes it: mid-spin the browser\'s own move under the lock (Chrome on Windows sends one now '
    + 'and then, half the window across, as it puts its hidden cursor back) must not turn the view: no frame may '
    + 'turn it past three times the spin\'s steady turn (#318)',
  options: {
    views: {
      kind: 'list',
      usage: 'a,b',
      choices: ['third', 'first'],
      default: 'third,first',
      help: 'the close views: third, first',
    },
    canary: {
      kind: 'switch',
      help: 'turn the view round by 180 degrees in a frame mid-spin, which must be found each way in each view',
    },
    at: SETUP_OPTIONS.at,
    facing: SETUP_OPTIONS.facing,
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    const command = {
      fixture: fixtureFrom(options),
      views: options.views,
      canary: Boolean(options.canary),
    };
    return side.command('spin', command);
  },
  textOf: asText,
  problemsOf: problemsIn,
};
