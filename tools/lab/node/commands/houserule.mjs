// `npm run lab -- houserule`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { picturePairs, asText, problemsIn, textWithPictureFiles } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab houserule`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'a house seen from above held to the three rules of what thins, as the Rust engine draws it, from a '
    + 'round of standing places at the hall of heroes and the cottages: ground he sees shows through what covers '
    + 'it, ground he does not see stays covered, and enough of the cover goes however many layers lie over it '
    + '(`--only terrace` the views so named)',
  help: 'a house from above: ground he sees shows, ground he does not stays covered',
  options: {
    only: { kind: 'text', usage: 'name', help: 'the views whose name holds this alone' },
    ...COMMON_OPTIONS,
  },
  async each(side, options) {
    return side.command('houseRuleHere', { only: options.only ?? '' });
  },
  finish(results, options, session) {
    return textWithPictureFiles(results, session.outFor('houserule'));
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
