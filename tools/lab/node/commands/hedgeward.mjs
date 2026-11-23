// `npm run lab -- hedgeward`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { fixtureFrom, asText, problemsIn, picturePairs, textWithPictureFiles } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab hedgeward`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the ranger\'s wall (`--class ranger`), an ordinary breakable prop: placed where aimed, square across his '
    + 'line to it; a boss\'s bolts flying over it or wearing it; a melee foe going round it with a way open, and '
    + 'breaking through only when walled in; his arrows breaking it, every arrow wearing it as the cursor finds it '
    + 'from near and far (`played`); a slam wearing it, a Brute walking through it; '
    + 'standing 30 s on, gone at none of its life, four standing at once; his own arrow over it at a foe beyond '
    + '(`--canary`, `--pictures`)',
  help: 'the ranger\'s Hedgeward held and let go as the player does (--class ranger), a case each: raised where it '
    + 'was aimed, square across his line to the aim, its front away from him; a boss\'s bolts fired at him through '
    + 'it stopped by it, each taking its damage off its life, none reaching him; a melee foe beyond it going round '
    + 'it, never striking him through it, and breaking through only when walled in; his own arrows breaking it; '
    + 'his arrows from 3, 6 and 10 m and aside, at least and full draw, low, half way and high on it, each wearing '
    + 'it (played); '
    + 'gone at its time, and at once at none of its life; his own arrow flying over it at a foe beyond',
  options: {
    canary: {
      kind: 'switch',
      help: 'plant the faults the checks must catch: the wall\'s top under the bolts, the wall forgotten by the '
        + 'foes (its body still standing), its body made a prop\'s, which stops an arrow; and play `played` twice, '
        + 'the wall met as drawn alone and the props met by an arrow\'s middle after its flight',
    },
    pictures: {
      kind: 'switch',
      help: 'picture the wall alone from round it (front, three-quarter, side, back, above, plan), and in the '
        + 'forest and the crypt from the top-down and over-the-shoulder views: its preview held, standing, and a '
        + 'boss\'s bolt striking it with its bar (into out/hedgeward)',
    },
    cases: {
      kind: 'list',
      usage: 'a,b',
      choices: ['placed', 'bolts', 'round', 'arrows', 'played', 'walled', 'slammed', 'trampled', 'stays', 'arrow',
        'reach'],
      help: 'the cases run (all by default): placed, bolts, round, arrows, played, walled, slammed, trampled, stays, '
        + 'arrow, reach',
    },
    ...SETUP_OPTIONS,
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    const command = {
      fixture: fixtureFrom(options),
      canary: Boolean(options.canary),
      pictures: Boolean(options.pictures),
      cases: options.cases ?? null,
    };
    return side.command('hedgeward', command);
  },
  finish(results, options, session) {
    return textWithPictureFiles(results, session.outFor('hedgeward'));
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
