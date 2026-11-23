// `npm run lab -- bosswave`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab bosswave`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'bosses loaded at their wave (game/bossReady.ts): booted cold, none loaded; Continue into the Crypt\'s '
    + 'waves 5 and 15 shows the bar readying the Colossus and the Ossuary Twins, who rise warm, nothing compiled late '
    + '(`--canary` spawns the Twins unwarmed in wave 14).',
  help: 'bosses loaded at their wave (game/bossReady.ts): booted cold, no boss\'s code is loaded; a run in '
    + 'the Crypt (its portal used in the village) cleared at wave 4 and 14, Continue shows the fight\'s bar readying '
    + 'the Colossus and the Ossuary Twins, the wave begins with them loaded and warm, and they rise with no program '
    + 'compiled late',
  options: {
    canary: { kind: 'switch', help: 'load the Twins and spawn one unwarmed in wave 14, which must be found' },
    ...COMMON_OPTIONS,
  },
  // (cold: the lab's own boot readies every boss)
  check(options) {
    options.cold = true;
  },
  each: (side, options) => side.command('bossWave', { canary: Boolean(options.canary) }),
  textOf: asText,
  problemsOf: problemsIn,
};
