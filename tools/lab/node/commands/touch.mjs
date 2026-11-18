// `npm run lab -- touch`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { fixtureFrom, asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab touch`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the touch controls\' move stick pushed by a finger, its touches sent as a touch screen\'s (slid out '
    + 'through the stick\'s travel, to its edge and far past it, half the window across: the stick\'s push, the knob '
    + 'against the finger and the hero\'s speed, a push further out never giving less)',
  help: 'the touch controls\' move stick pushed by a finger, sent as a touch screen\'s: slid out to its edge and '
    + 'far past it, half the window across, and what each push gave (the stick\'s push, the knob, the hero\'s '
    + 'speed); a push further out may never give less',
  options: {
    canary: {
      kind: 'switch',
      help: 'plant a fault the measure must catch: the furthest push\'s finger slid back near the middle',
    },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('touch', { fixture: fixtureFrom(options), canary: Boolean(options.canary) });
  },
  textOf: asText,
  problemsOf: problemsIn,
};
