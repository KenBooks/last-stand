// `npm run lab -- music`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab music`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'each biome\'s music as the player hears it (its lobby, a run\'s countdowns, fights and wins, a hidden tab '
    + 'and the bank back: which track plays, how it fades, where it comes in, what reaches WebAudio)',
  help: 'each biome\'s music played through as the player hears it: its lobby, a run\'s countdown, the first '
    + 'wave\'s fight and its win, the next wave, the tab hidden and shown again mid-fight, and the bank back to the '
    + 'lobby, every frame judged by what the game sends to WebAudio and what each track\'s output carries: a track '
    + 'rising where another is wanted, a level cut rather than faded, a fresh track not from its top, a track back '
    + 'elsewhere than where it was left (the lobby\'s between waves, the battle\'s from wave to wave), a loop off '
    + 'its track\'s, a battle track not decoded '
    + 'within the countdown, a silent track kept decoded and one unheard where it\'s wanted (or heard where it '
    + 'isn\'t) are problems',
  options: {
    biomes: {
      kind: 'list',
      usage: 'a,b',
      choices: ['crypt', 'forest'],
      default: 'forest,crypt',
      help: 'the biomes, in turn: crypt, forest',
    },
    canary: {
      kind: 'switch',
      help: 'plant faults the judge must catch, in a round played again: the biome\'s battle track played as '
        + 'another\'s, the lobby\'s fade in cut to a twentieth of a second, every fresh track started 5 s in, '
        + 'every track coming back started from its top',
    },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('music', { biomes: options.biomes, canary: Boolean(options.canary) });
  },
  textOf: asText,
  problemsOf: problemsIn,
};
