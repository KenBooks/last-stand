// `npm run lab -- poses`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { fixtureFrom, asText, problemsIn } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab poses`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the hero\'s pose a move at a time as a digest to the last bit (every object\'s world matrix, every moving '
    + 'point of cloth: standing, walking, strafing attacking, stopped), and his `animate` timed each frame, his '
    + 'update, skirts and drape beside it: a change made to cost less keeps the pose when an A/B\'s digests agree; '
    + '`--lobby` in the lobby',
  help: 'the hero\'s pose a move at a time (standing, walking, strafing with the attack held, stopped) as a digest '
    + 'of every object\'s world matrix and every moving point of cloth to the last bit, and his animate timed '
    + 'each frame: a change made to cost less poses him exactly as before when an A/B\'s digests agree',
  options: {
    canary: { kind: 'switch', help: 'plant a fault the measure must catch: a number moved by its last bit' },
    lobby: { kind: 'switch', help: 'the moves made in the lobby, the run abandoned for it' },
    ...SETUP_OPTIONS,
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('poses', {
      fixture: fixtureFrom(options),
      canary: Boolean(options.canary),
      lobby: Boolean(options.lobby),
    });
  },
  textOf: asText,
  problemsOf: problemsIn,
};
