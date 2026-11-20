// `npm run lab -- behind`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { asText, problemsIn } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab behind`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the heroes built behind the lobby a piece a frame (the hall\'s heroes and the spares let go and built '
    + 'again: each frame\'s building by the browser\'s clock, at most 30 ms, the slowest pieces named; then the hall '
    + 'opened and another hero chosen, building none; and none of the guide\'s pictures made with it never opened)',
  help: 'the heroes built behind the lobby a piece a frame: the hall\'s heroes and the spares let go and built '
    + 'again, each frame\'s building timed by the browser\'s clock (at most 30 ms, the slowest pieces named), then the hall '
    + 'opened and another hero chosen, building none; and none of the guide\'s pictures made with the guide never '
    + 'opened',
  options: {
    canary: { kind: 'switch', help: 'plant faults the measure must catch: all built in one frame, spares let go, the '
        + 'guide\'s pictures started unopened' },
    ...SETUP_OPTIONS,
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('behind', { canary: Boolean(options.canary) });
  },
  textOf: asText,
  problemsOf: problemsIn,
};
