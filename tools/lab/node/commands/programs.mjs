// `npm run lab -- programs`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab programs`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the programs the boot compiled, from the game\'s dev-only ledger (how many each loading step made, behind '
    + 'the lobby too, by the warm-ups\' compile or by a draw; each kind with the fields of its key that set its '
    + 'programs apart; those never drawn; those made after the reveal); `--cost`: each compiled again alone, salted '
    + 'so no cache answers, and timed (by kind, by what uses them, each step\'s by what uses them, by its point '
    + 'lights, the longest, a plain lit material by part)',
  help: 'the programs the boot compiled (the game\'s ledger of them, dev builds alone): how many each loading '
    + 'step made, by the warm-ups\' compile or by a draw; each kind with the fields of its key that set its '
    + 'programs apart; those never drawn; those made after the reveal',
  options: {
    canary: {
      kind: 'switch',
      help: 'warm a box of a kind nothing else is (it must be listed compiled and drawn) and one on a layer no '
        + 'camera sees (it must be listed never drawn)',
    },
    limits: {
      kind: 'switch',
      help: 'each program held to the least a phone gives: its uniform vectors by the stage that reads them, its '
        + 'attributes, its samplers (a program too big for a phone compiles and draws on a desktop, and draws '
        + 'nothing there)',
    },
    cost: {
      kind: 'switch',
      help: 'compile each program again alone, salted so no cache answers, and time it: by kind, by what uses '
        + 'them, by the point lights they\'re lit by, the longest (a minute or more; its canary: the cache)',
    },
    of: {
      kind: 'text',
      usage: 'user',
      help: 'with --cost, every program a user uses listed alone, the longest first, with its kind and what '
        + 'it was made for (a scene\'s top-level object, as "by what uses them" names it: village, forest)',
    },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    const asked = { canary: Boolean(options.canary), cost: Boolean(options.cost), limits: Boolean(options.limits),
      of: options.of ?? '' };
    return side.command('programs', asked);
  },
  textOf: asText,
  problemsOf: problemsIn,
};
