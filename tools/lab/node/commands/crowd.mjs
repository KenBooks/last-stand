// `npm run lab -- crowd`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { labError } from '../errors.mjs';
import { fixtureFrom, asText, problemsIn } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab crowd`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'a crowd of foes killed at once and what the frame costs as they fall (each frame timed by the browser\'s '
    + 'clock with the game drawn, the bodies\' part apart, at each CPU slowdown, as a low-end device\'s, and frame '
    + 'rate)',
  help: 'a crowd of foes killed at once and what the frame costs as their bodies fall: the crowd timed standing and '
    + 'then every frame until its bodies are gone, by the browser\'s own clock with the game drawn, the bodies\' '
    + 'part apart, at each CPU slowdown (as a low-end device\'s) and frame rate; the bodies\' part past its budget '
    + 'with the CPU slowest at 60 a second, or a canary unseen, are problems (--class warrior)',
  options: {
    count: { kind: 'number', usage: 'n', help: 'how many foes (by default the most a wave keeps alive, 38)' },
    throttles: {
      kind: 'list',
      usage: 'a,b',
      help: 'the CPU\'s slowdowns, a round each (1,4,6 by default: as it is, a mid-range phone\'s, a low-end one\'s)',
    },
    rates: { kind: 'list', usage: 'a,b', help: 'the frame rates, a round each at every slowdown (60,30 by default)' },
    skill: {
      kind: 'text',
      usage: 'name',
      help: 'the crowd killed by a cast of this skill (its key, behaviour or name), not by a blow each',
    },
    canary: {
      kind: 'switch',
      help: 'plant a cost the measure must see: the first round again, each body made 0.1 ms slower a frame',
    },
    ...SETUP_OPTIONS,
    ...COMMON_OPTIONS,
  },
  check(options) {
    if (options.count !== undefined && !(options.count >= 1)) throw labError('crowd --count: at least 1');
    for (const rate of options.throttles ?? []) {
      if (!(Number(rate) >= 1)) throw labError(`crowd --throttles: ${rate} is no slowdown (1 or more)`);
    }
    for (const rate of options.rates ?? []) {
      if (!(Number(rate) > 0)) throw labError(`crowd --rates: ${rate} is no frame rate`);
    }
  },
  each(side, options) {
    const command = {
      fixture: fixtureFrom(options),
      count: options.count === undefined ? undefined : Math.round(options.count),
      throttles: options.throttles?.map(Number),
      rates: options.rates?.map(Number),
      skill: options.skill,
      canary: Boolean(options.canary),
    };
    return side.command('crowd', command);
  },
  textOf: asText,
  problemsOf: problemsIn,
};
