// `npm run lab -- blink`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { fixtureFrom, picturePairs, asText, problemsIn, textWithPictureFiles } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab blink`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the mage\'s blink cast as the player casts it (open ground, past his reach, into a prop, past one, the '
    + 'arena\'s edge, onto the dais, his own feet: where it came out against its preview and his reach, the frames he '
    + 'was hidden and the blows that landed in them, the foes near and far it dazed and how they stood)',
  help: 'the mage\'s blink cast as the player casts it (the key held over the aim, let go): on open ground, past his '
    + 'reach, at a prop, past one, out at the arena\'s edge, up onto the dais and at his feet, where the preview '
    + 'showed against where he came out, a blow tried every frame, his body coming apart and whole again; then held '
    + 'through its cooldown and short of energy, the preview red and counting down until a release would cast; then '
    + 'foes near where he vanished and further off; a landing off its preview, past his reach or in a prop, a blow '
    + 'landed while he crossed, a preview green or off its countdown while a release would cast nothing, a near foe '
    + 'moving while dazed or never coming on again and a far one dazed or stopping are problems: tools/lab/out/blink '
    + '(--class mage)',
  // (`check --every`'s command line: the mage's blink)
  audit: ['--class', 'mage'],
  options: {
    pictures: { kind: 'switch', help: 'picture a blink\'s moments and the dazed foes (=false: the numbers alone)' },
    canary: {
      kind: 'switch',
      help: 'plant faults the checks must catch: the preview read a metre off, the guard taken off as he comes '
        + 'apart, the preview read green with no countdown on its cooldown, and a near foe\'s daze cleared at once',
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
    return side.command('blink', command);
  },
  finish(results, options, session) {
    return textWithPictureFiles(results, session.outFor('blink'));
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
