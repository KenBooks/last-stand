// `npm run lab -- pace`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { fixtureFrom, asText, problemsIn } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab pace`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the hero walking on a 60 Hz screen whose browser times its frames on a 145 Hz screen\'s ticks, and moved '
    + 'from a 144 Hz screen to it (a shown frame\'s step within 6% of the steady pace, the game\'s time keeping the '
    + 'frames\' clock; `--canary` steps the frames as they come, #552)',
  help: "the hero walking on a 60 Hz screen whose browser times its frames on a 145 Hz screen's ticks (13.8 and "
    + "20.7 ms in turn, each shown for 16.7), and moved from a 144 Hz screen to it: a shown frame's step must stray "
    + "from the steady pace by at most 6%, and the game's time keep the frames' clock (#552)",
  options: {
    scenarios: {
      kind: 'list',
      usage: 'a,b',
      choices: ['even', 'ticked', 'moved'],
      default: 'even,ticked,moved',
      help: 'an even 60, a 60 Hz screen timed on 145 Hz ticks, the window moved from a 144 Hz screen to it',
    },
    canary: {
      kind: 'switch',
      help: "the ticked screen's frames stepped as they come, as before #552: the judder must be found",
    },
    at: SETUP_OPTIONS.at,
    facing: SETUP_OPTIONS.facing,
    view: SETUP_OPTIONS.view,
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    const command = {
      fixture: fixtureFrom(options),
      scenarios: options.scenarios,
      canary: Boolean(options.canary),
    };
    return side.command('pace', command);
  },
  textOf: asText,
  problemsOf: problemsIn,
};
