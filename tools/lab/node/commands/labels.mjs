// `npm run lab -- labels`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { asText, problemsIn } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab labels`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'a world label a full atlas kept out (the atlas filled with name tags until one finds no slot, a few given '
    + 'back, too few to pack it again: the tag drawn within 3 frames)',
  help: 'a world label kept out by a full atlas: the atlas filled with name tags until a tag finds no slot, a few '
    + 'given back (too few to pack it again), and the tag drawn in one within 3 frames',
  options: {
    canary: { kind: 'switch', help: 'plant a fault the measure must catch: no slot given back' },
    ...SETUP_OPTIONS,
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('labels', { canary: Boolean(options.canary) });
  },
  textOf: asText,
  problemsOf: problemsIn,
};
