// `npm run lab -- boss`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { fixtureFrom, asText, problemsIn } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab boss`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the bosses\' fights (`--parts`): each battleground\'s boss waves against its ladder and its exceptions, a '
    + 'boss standing its ground as the hero walks into it, and the time each boss takes (`--canary`)',
  help: 'the bosses\' fights: each battleground\'s boss waves set off, the boss the run sends against its ladder\'s '
    + 'rung and the banner\'s line (ladder); walked into, the Colossus gives way a hair (stand); the basic attack held '
    + 'on a boss, and the time each boss takes at its wave (ttk)',
  options: {
    parts: {
      kind: 'list',
      usage: 'a,b',
      choices: ['ladder', 'stand', 'ttk'],
      help: 'the parts (all by default): ladder, stand, ttk',
    },
    canary: {
      kind: 'switch',
      help: 'plant a fault each part must catch: a rung slipped onto the Crypt\'s ladder, a boss that yields as a '
        + 'small foe does, an attack that deals nothing',
    },
    ...SETUP_OPTIONS,
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    const command = {
      fixture: fixtureFrom(options),
      canary: Boolean(options.canary),
      ...(options.parts ? { parts: options.parts } : {}),
    };
    return side.command('boss', command);
  },
  textOf: asText,
  problemsOf: problemsIn,
};
