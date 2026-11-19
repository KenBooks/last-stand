// `npm run lab -- dev`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { picturePairs, asText, problemsIn, textWithPictureFiles } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab dev`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'developer controls, Hero/Dev tabs, five viewport layouts, frozen training start, refills and reset, and '
    + 'slow first-person entry (`--canary` plants a drained resource).',
  help: 'developer panel tabs, flight speed, frame inclusion, labels, opacity, five viewport layouts, frozen training starts, continuous refills, reset and slow first-person entry',
  options: {
    canary: { kind: 'switch', help: 'plant a drained resource and require its detection' },
    ...COMMON_OPTIONS,
  },
  // (its Hero and Dev tabs are the panels' lobby's, beside `.menu-left`'s fold, src/dev/panel.ts: booted in the
  // village, as the lab boots by default, it stopped at its first step, #661)
  check(options) { options.panels = true; },
  each(side, options) {
    return side.command('dev', { canary: Boolean(options.canary) });
  },
  finish(results, options, session) {
    return textWithPictureFiles(results, session.outFor('dev'));
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
