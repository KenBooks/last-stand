// `npm run lab -- death`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { fixtureFrom, picturePairs, asText, problemsIn, textWithPictureFiles } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab death`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'each skill\'s kills as they fall (foes stood dazed where it strikes, a hair from death and with little to '
    + 'spare: how hard each body was thrown and which way, how far it flew, when it lay still; its drawn pose against '
    + 'the floor, the props, the wall and its points)',
  help: 'each skill\'s kills as the player sees them fall: foes stood dazed where it strikes and cast at twice, each '
    + 'a hair from death and then holding just under what the first cast dealt it, every body followed as drawn '
    + 'until it has dissolved (how hard it was thrown and which way, how far it flew and how high, when it lay '
    + 'still); a body under the floor, in a prop or past the wall, posed off its points, gone back at the hero or '
    + 'against a swing, a storm\'s kill not going round it, the bodies killed with little to spare thrown as hard '
    + 'and a shader compiled meanwhile are problems: tools/lab/out/death (--class warrior)',
  options: {
    skills: {
      kind: 'list',
      usage: 'a,b',
      help: 'the skills, by key, behaviour or name (every one of the hero\'s that deals damage by default)',
    },
    pictures: {
      kind: 'switch',
      help: 'picture each skill\'s bodies as they fall and lie (=false: the numbers alone)',
    },
    canary: {
      kind: 'switch',
      help: 'plant faults the checks must catch: a body put under the floor for a frame, one thrown back at the '
        + 'hero, one struck off its middle turned the other way',
    },
    close: {
      kind: 'switch',
      help: 'picture each skill\'s body that lay deepest under the floor close up, framed on that part, at that '
        + 'frame (its pass cast again as it was): a change to how bodies lie, before and after with --ab',
    },
    trace: {
      kind: 'switch',
      help: 'list each frame of each body each skill throws hard: each point\'s height over the floor less its size, '
        + 'how far its drawn pose is off it and its point\'s own height (cm)',
    },
    ...SETUP_OPTIONS,
    ...COMMON_OPTIONS,
  },
  countsCompiles: true,
  each(side, options) {
    const command = {
      fixture: fixtureFrom(options),
      skills: options.skills ?? [],
      pictures: options.pictures !== false,
      canary: Boolean(options.canary),
      trace: Boolean(options.trace),
      close: Boolean(options.close),
    };
    return side.command('death', command);
  },
  finish(results, options, session) {
    return textWithPictureFiles(results, session.outFor('death'));
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
