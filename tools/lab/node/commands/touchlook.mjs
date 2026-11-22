// `npm run lab -- touchlook`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { fixtureFrom, asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab touchlook`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'a finger dragged over the world in the close views, sent as a touch screen\'s: in third person and '
    + 'through the eyes a touch put down on the right of the screen and slid sideways must turn the camera, and the '
    + 'line says what lay under the finger (from play on a phone, #812: the right finger couldn\'t turn it)',
  help: 'a finger dragged over the world in third person and through the eyes: how far the camera turned, and '
    + 'what lay under the finger',
  options: {
    canary: {
      kind: 'switch',
      help: 'plant a fault the measure must catch: a finger that never moves',
    },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('touchLook', { fixture: fixtureFrom(options), canary: Boolean(options.canary) });
  },
  textOf: asText,
  problemsOf: problemsIn,
};
