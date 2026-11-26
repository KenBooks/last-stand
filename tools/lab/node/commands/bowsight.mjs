// A drawn arrow's sight and the places the released arrow hits in the yard.
import { asText, picturePairs, problemsIn, textWithPictureFiles } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** Check the ranger's visible sight endpoint against actual dummy impacts. */
export default {
  summary: 'Nockshot aimed at a yard dummy’s sack and exposed post; its sight ends at the arrow’s contact',
  help: 'aim with the cursor at the yard dummy’s sack and post, then compare the sight dot with the arrow that hits',
  options: {
    ...COMMON_OPTIONS,
    class: { ...COMMON_OPTIONS.class, default: 'ranger' },
    canary: { kind: 'switch', help: 'pull the sight back half an arrow and require it to miss contact' },
    pictures: { kind: 'switch', help: 'picture where the sight reaches the dummy' },
  },
  each: (side, options) => side.command('bowSight', {
    pictures: Boolean(options.pictures),
    canary: Boolean(options.canary),
  }),
  finish: (results, _options, session) => textWithPictureFiles(results, session.outFor('bowsight')),
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
