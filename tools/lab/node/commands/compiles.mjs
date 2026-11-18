// `npm run lab -- compiles`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { asText, problemsIn } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab compiles`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'whether the boot\'s warm-up compiled what a fight draws (a prop of every kind broken, the first wave '
    + 'fought and a Brute\'s and a Hulk\'s throws in each biome, and again by a hero built afresh: every program '
    + 'compiled meanwhile, and the draw that first used it; the point lights each pass is lit by, against the '
    + 'boot\'s; `--switch` picks another class on the hero selection screen first, each hero shown in the hall of '
    + 'heroes, whose room and skills are warmed with the heroes)',
  help: 'whether the boot\'s warm-up compiled what a fight draws: in each biome a prop of every kind it has broken '
    + 'in turn, its rubble, debris and smoke drawn as they fly and settle, then its first wave fought, and the '
    + 'first biome\'s again by a hero built afresh (a class switch\'s); every program compiled meanwhile is a '
    + 'problem, said as the game\'s performance report says it, and so is a pass lit by another count of point '
    + 'lights than the boot\'s (the scene\'s, and through the eyes the arms\')',
  options: {
    biomes: {
      kind: 'list',
      usage: 'a,b',
      choices: ['crypt', 'forest'],
      default: 'crypt,forest',
      help: 'the biomes: crypt, forest',
    },
    view: SETUP_OPTIONS.view,
    gear: SETUP_OPTIONS.gear,
    weapon: SETUP_OPTIONS.weapon,
    canary: {
      kind: 'switch',
      help: 'draw a material of a kind nothing else is before the hero: its program must come out as compiled; '
        + 'and put a point light in the scene: the count must find it',
    },
    switch: {
      kind: 'choice',
      usage: 'ranger|warrior|mage',
      choices: ['ranger', 'warrior', 'mage'],
      help: 'switch the hero to this class in the lobby first, as a player picks it (its button clicked, the '
        + 'switch waiting for the heroes\' warm-up), then fight as him: what a class switch compiles',
    },
    ...COMMON_OPTIONS,
  },
  countsCompiles: true,
  each(side, options) {
    const command = {
      biomes: options.biomes,
      view: options.view ?? 'top',
      gear: options.gear,
      weapon: options.weapon,
      canary: Boolean(options.canary),
      switchTo: options.switch,
    };
    return side.command('compiles', command);
  },
  textOf: asText,
  problemsOf: problemsIn,
};
