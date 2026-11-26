// `npm run lab -- staffs`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { fixtureFrom, picturePairs, asText, problemsIn, textWithPictureFiles } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab staffs`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the mage\'s staffs by school (the lightning staff tapped and charged to full at foes held out from its '
    + 'strike: a tap the middle alone for its share of a full charge, a full charge out to its reach and no further, '
    + 'each landing once its arc has travelled, the daze by how near the middle and none on an elite; the fire '
    + 'staff\'s burn: its bites, their pace, alight only meanwhile; the healing beam: whom it lands on, its heal '
    + 'every frame, its ramp to ×2 and begun again on a switch, its chain through full healers, +10% each, and a '
    + 'beam carrying another\'s thicker with the count at his aim) and a held skill\'s charge mark at the aim (the cursor filling top-down, the ring round '
    + 'the crosshair in third person; `--class ranger` runs that part alone); `--canary` a tap as strong as a full '
    + 'charge, and the beam\'s ramp endless and its chain\'s bonus none',
  help: 'the mage\'s staffs by school: the lightning staff tapped and charged to full at dummies stood out from '
    + 'its strike (a tap the middle alone for its share of a full charge, a full charge out to its reach and no '
    + 'further, each landing once its arc has travelled, the daze by how near the middle and none on an elite), '
    + 'the fire staff\'s burn (its bites, their pace, alight only meanwhile), whom the healing beam lands on, '
    + 'its heal on himself every frame, its ramp, its chain and a carried beam\'s look, and a held skill\'s charge mark at the aim (the cursor filling top-down, '
    + 'the ring round the crosshair in third person; --class ranger runs this part alone): tools/lab/out/staffs '
    + '(--class mage)',
  options: {
    pictures: { kind: 'switch', help: 'picture the charge mark in each view (=false: the numbers alone)' },
    canary: {
      kind: 'switch',
      help: 'plant the fault the charge\'s checks must catch: a tap as strong and wide as a full charge',
    },
    ...SETUP_OPTIONS,
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    const command = {
      fixture: fixtureFrom(options),
      pictures: options.pictures !== false,
      canary: Boolean(options.canary),
    };
    return side.command('staffs', command);
  },
  finish(results, options, session) {
    return textWithPictureFiles(results, session.outFor('staffs'));
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
