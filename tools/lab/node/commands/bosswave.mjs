// `npm run lab -- bosswave`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';
import { labError } from '../errors.mjs';

/** `lab bosswave`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'bosses loaded at their wave (game/bossReady.ts): booted cold, none loaded; Continue into the Crypt\'s '
    + 'waves 5, 10 and 15 shows the bar readying the Colossus, the Ossuary Cantor and its guards and the Ossuary '
    + 'Twins, who rise warm, nothing compiled late. `--biome forest` checks the Thornwood ladder, '
    + '`--wave 15` isolates its Stag of Ash or the Crypt\'s Twins, and `--canary` plants an early load and a late pipeline.',
  help: 'bosses loaded at their wave (game/bossReady.ts): booted cold, no boss\'s code is loaded; a run in '
    + 'the Crypt (its portal used in the village) cleared at wave 4, 9 and 14, Continue shows the fight\'s bar '
    + 'readying the Colossus, the Ossuary Cantor and its two Bell-Wardens and the Ossuary Twins, the wave begins '
    + 'with them loaded and warm, and they rise with no program compiled late. Select the Thornwood with '
    + '--biome forest, or one of either biome\'s three waves with --wave.',
  options: {
    biome: { kind: 'choice', usage: 'crypt|forest', choices: ['crypt', 'forest'], help: 'the battleground (crypt by default)' },
    wave: { kind: 'number', usage: '5|10|15', help: 'only the selected boss wave (all three by default)' },
    canary: { kind: 'switch', help: 'load the last selected boss early and draw a new pipeline after Continue' },
    ...COMMON_OPTIONS,
  },
  // (cold: the lab's own boot readies every boss)
  check(options) {
    if (options.wave !== undefined && ![5, 10, 15].includes(options.wave)) {
      throw labError('bosswave: --wave must be 5, 10 or 15');
    }
    options.cold = true;
  },
  each: (side, options) => side.command('bossWave', {
    biome: options.biome ?? 'crypt', wave: options.wave, canary: Boolean(options.canary),
  }),
  textOf: asText,
  problemsOf: problemsIn,
};
