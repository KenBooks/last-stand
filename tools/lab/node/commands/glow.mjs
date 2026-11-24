// `npm run lab -- glow`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { fixtureFrom, asText, problemsIn, textWithPictureFiles } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab glow`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'each worn item\'s glow in its rarity\'s colour (the hero in a player\'s colour, green by default, each '
    + 'slot given the rarity alone, drawn close up from the front and back with its glow and without at the same '
    + 'moment: the share it lit, its brightest and median light, how much of it in one light (flat), its hue against '
    + 'the rarity\'s, none on a Magic item, its pixels over 4 s: how much they change a tenth of a second (slow, not '
    + 'still), and the step as its cycle starts over against those beside it (a join); no program compiled)',
  help: 'each worn item\'s glow in its rarity\'s colour (#404), the hero in a player\'s colour wearing every item '
    + 'his class shows: each slot given the rarity alone and drawn close up with its glow and without, at the same '
    + 'moment. A glow unseen, adding more than 0.25 of white, in one light over half of it (flat), leaning off the '
    + 'rarity\'s hue, on a Magic item, its pixels changing over 50% or under 5% in a tenth of a second (not slow, '
    + 'still), the step as its cycle starts over standing out from those beside it (a join), and a program '
    + 'compiled are problems: tools/lab/out/glow '
    + '(front and back, no glow and the rarity)',
  options: {
    colour: {
      kind: 'choice',
      choices: ['green', 'red', 'blue', 'gold', 'purple', 'white'],
      usage: 'id',
      help: 'the player\'s colour he\'s dyed in (green by default: green on a Rare item\'s green)',
    },
    rarity: {
      kind: 'choice',
      choices: ['rare', 'epic', 'legendary', 'ascendant', 'ultimate'],
      usage: 'rare|epic|legendary|ascendant|ultimate',
      help: 'the rarity each item is given (rare by default)',
    },
    pictures: {
      kind: 'switch',
      help: 'picture him close up without the glow and with it (=false: the numbers alone)',
    },
    canary: {
      kind: 'switch',
      help: 'plant the faults the measures must catch: the glow ten times as strong, none, and its loop judged '
        + 'half a second past a cycle',
    },
    tune: SETUP_OPTIONS.tune,
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    const command = {
      colour: options.colour ?? 'green',
      rarity: options.rarity ?? 'rare',
      pictures: options.pictures !== false,
      canary: Boolean(options.canary),
      tune: fixtureFrom(options).tune,
    };
    return side.command('glow', command);
  },
  finish(results, options, session) {
    return textWithPictureFiles(results, session.outFor('glow'));
  },
  textOf: asText,
  problemsOf: problemsIn,
};
