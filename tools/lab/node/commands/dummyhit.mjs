// A blow from every side of the village's training dummy.
import { asText, picturePairs, problemsIn, textWithPictureFiles } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** Measure the dummy's drawn reaction to melee, projectile or area attacks. */
export default {
  summary: 'the village dummy hit from four sides with a warrior swing, ranger arrow or mage area attack',
  help: 'strike a village dummy from four sides and check the head tips away then springs back',
  options: {
    ...COMMON_OPTIONS,
    class: { ...COMMON_OPTIONS.class, default: 'warrior' },
    canary: { kind: 'switch', help: 'make every impact use the same direction and require its detection' },
    pictures: { kind: 'switch', help: 'picture the dummy from above during the two opposing side hits' },
  },
  each: (side, options) => side.command('dummyHit', {
    canary: Boolean(options.canary),
    pictures: Boolean(options.pictures),
  }),
  finish: (results, _options, session) => textWithPictureFiles(results, session.outFor('dummyhit')),
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
