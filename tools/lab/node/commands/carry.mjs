// `npm run lab -- carry`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { fixtureFrom, asText, problemsIn } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab carry`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'measures the carried bow',
  help: 'the ranger\'s carried bow against his body through a carry\'s round',
  options: {
    canary: { kind: 'switch', help: 'plant faults the measure must catch' },
    frames: { kind: 'switch', help: 'list every frame with a clip: its phase, what crossed what, how deep' },
    ...SETUP_OPTIONS,
    ...COMMON_OPTIONS,
  },
  keepsPage: true,
  each(side, options) {
    const canary = Boolean(options.canary);
    return side.command('carry', { fixture: fixtureFrom(options), canary, frames: Boolean(options.frames) });
  },
  textOf: asText,
  problemsOf: problemsIn,
};
