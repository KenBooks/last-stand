// `npm run lab -- boss`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { fixtureFrom, asText, problemsIn, picturePairs, textWithPictureFiles } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab boss`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the bosses\' fights (`--parts`): each battleground\'s boss waves against its ladder and its exceptions, the '
    + 'Bell-Warden\'s phases, its toll near, far and at a raised shield, its chains dropping the bell, it standing its '
    + 'ground, its ghosts seizing a hero, no program compiled in its fight, and the time each boss takes (`--canary`)',
  help: 'the bosses\' fights: each battleground\'s boss waves set off, the boss the run sends against its ladder\'s '
    + 'rung and the banner\'s line (ladder); the Bell-Warden\'s life taken over and under each phase\'s share '
    + '(phases); its toll at the hero near it (stunned for its time, after its warning), far off (faded) and with a '
    + 'shield raised (--class warrior --gear shield) (toll); each chain struck from its side, all four dropping the '
    + 'bell for its window and whole again after (chains); walked into, it gives way a hair (stand); its ghosts seizing a hero near and dropping him, not one far off (grab); its fight\'s effects drawn, no program compiled '
    + '(compiles); the basic attack held on a boss, and the time each boss takes at its wave (ttk)',
  options: {
    parts: {
      kind: 'list',
      usage: 'a,b',
      choices: ['ladder', 'phases', 'toll', 'chains', 'stand', 'grab', 'swing', 'compiles', 'ttk', 'pictures'],
      help: 'the parts (all but pictures by default): ladder, phases, toll, chains, stand, grab, compiles, ttk, pictures (the '
        + 'Bell-Warden in each of its moments, a sheet for the eye)',
    },
    canary: {
      kind: 'switch',
      help: 'plant a fault each part must catch: the Crypt\'s ladder turned round, a phase\'s share moved, a toll '
        + 'that stuns no one near, a shield that stops nothing, chains that take no harm, a program compiled, an '
        + 'attack that deals nothing',
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
  finish(results, options, session) {
    return textWithPictureFiles(results, session.outFor('boss'));
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
