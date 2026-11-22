// `npm run lab -- overui`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { fixtureFrom, asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS, SETUP_OPTIONS } from '../optionKit.mjs';

/** `lab overui`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the skill keys pressed in a fight with the pointer resting on the page\'s UI: each keyboard key a skill '
    + 'is on must cast it, the mouse\'s buttons must not (from play, #816: hovering the skill bar, the number keys '
    + 'did nothing)',
  help: 'each skill key pressed with the pointer over the page\'s UI: the keyboard\'s must cast, the mouse\'s not',
  options: {
    canary: {
      kind: 'switch',
      help: 'plant a fault the measure must catch: the hero unarmed, no key casting',
    },
    class: SETUP_OPTIONS.class,
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('keysOverUi', { fixture: fixtureFrom(options), canary: Boolean(options.canary) });
  },
  textOf: asText,
  problemsOf: problemsIn,
};
