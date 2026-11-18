// `npm run lab -- held`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { fixtureFrom, picturePairs, asText, problemsIn, textWithPictureFiles } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab held`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'every held skill\'s preview as the player holds it (ready, then through its cooldown and short of energy: '
    + 'its own look, red and counting down until a release would cast; Quarry Mark\'s outline round its foe in every '
    + 'view, its pixels near the foe and none away; Starfall\'s ring against its strikes, every foe inside it struck '
    + 'on every cast; every mark on the floor held across the dais\'s step, on each level and down its faces, none of '
    + 'it under the floor or standing off it; no shader compiled meanwhile)',
  help: 'every held skill of the hero\'s class held as the player holds it, over a training dummy ahead: ready, '
    + 'its preview in its own look with no countdown and a release casting; then held through its cooldown and '
    + 'short of energy, red and counting down until a release would cast; Quarry Mark\'s red outline round the foe '
    + 'it would mark, over the shoulder and through the eyes too, its pixels near the foe and none away from it. A '
    + 'preview missing, in the wrong look or off its countdown, a release casting when it mustn\'t or not when it '
    + 'must, and an outline off its foe are problems: tools/lab/out/held (--class ranger, mage)',
  options: {
    pictures: { kind: 'switch', help: 'picture each preview, ready and on its cooldown (=false: the numbers alone)' },
    canary: {
      kind: 'switch',
      help: 'plant faults the checks must catch: each preview read as ready with no countdown on its cooldown, '
        + 'Quarry Mark\'s outline drawn round the hero, and a shader compiled mid-game',
    },
    ...SETUP_OPTIONS,
    ...COMMON_OPTIONS,
  },
  countsCompiles: true,
  each(side, options) {
    const command = {
      fixture: fixtureFrom(options),
      pictures: options.pictures !== false,
      canary: Boolean(options.canary),
    };
    return side.command('held', command);
  },
  finish(results, options, session) {
    return textWithPictureFiles(results, session.outFor('held'));
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
