// `npm run lab -- coat`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { asText, problemsIn } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab coat`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the hero\'s skirts and hood as he stands at idle (every point of the cloth in its own space frame by '
    + 'frame: a move a frame changing by over 1 cm a jerk, with the hand nearest)',
  help: 'the hero\'s skirts (the ranger\'s coat, the mage\'s robe, the warrior\'s mail) and hood (the mage\'s) as he '
    + 'stands at idle in his head item and body armour, frame '
    + 'by frame: every point of the cloth in its own space, and each jerk (its move a frame changing by over 1 cm)',
  options: {
    seconds: { kind: 'number', usage: 's', help: 'how long he stands (5 by default)' },
    frames: { kind: 'switch', help: 'list the frames a point jerked, with where on the cloth' },
    rates: { kind: 'list', usage: 'a,b', help: 'the frame rates he stands at, once each (60,144 by default)' },
    canary: { kind: 'switch', help: 'plant a fault the measure must catch: a point kicked out for a frame' },
    ...SETUP_OPTIONS,
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    const command = {
      gear: options.gear,
      weapon: options.weapon,
      seconds: options.seconds,
      frames: Boolean(options.frames),
      rates: options.rates?.map(Number),
      canary: Boolean(options.canary),
    };
    return side.command('coat', command);
  },
  textOf: asText,
  problemsOf: problemsIn,
};
