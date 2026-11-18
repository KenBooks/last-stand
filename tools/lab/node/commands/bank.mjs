// `npm run lab -- bank`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { picturePairs, asText, problemsIn, textWithMoments } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab bank`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'a bank on Random in the panels\' lobby (#558): the wave in the save under the battleground rolled, '
    + 'offered as the starting wave (and read back from the save), Random rolling only where it is unlocked; the '
    + 'choice taught for the first three banks and compact after, its count kept in storage (#347; `--canary` takes '
    + 'the bank\'s record out of the save and the count out of storage).',
  help: 'a bank on Random in the panels\' lobby (#558): a hero with nothing banked enters, clears two waves and '
    + 'banks; the wave in the save under the battleground rolled, offered as the starting wave (and once read back '
    + 'from the save), Random rolling only where it is unlocked, the other battleground still at its first wave',
  options: {
    canary: { kind: 'switch', help: 'take the bank\'s record out of the save and verify it is found' },
    ...COMMON_OPTIONS,
  },
  // (Random is the panels' lobby's: the page boots it, whatever was asked)
  check(options) { options.panels = true; },
  each: (side, options) => side.command('bank', { canary: Boolean(options.canary) }),
  // (its moment written: the lobby after the bank, the starting wave it offers)
  finish: (results, options, session) => textWithMoments(results, session.outFor('bank'), session.browser),
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
