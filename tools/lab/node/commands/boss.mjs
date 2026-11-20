// `npm run lab -- boss`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { fixtureFrom, picturePairs, asText, problemsIn, textWithPictureFiles } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab boss`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the bosses\' fights (each battleground\'s ladder sending the right boss on each boss wave, its banner and '
    + 'Continue name; the Bell-Warden\'s phases at their shares; its toll stunning a hero near, not one far off or '
    + 'behind a raised shield; its chains dropping the bell for its double-damage window and whole after; a boss walked '
    + 'into giving way a hair; its bell swinging as a pendulum about the yoke, no jolt, no spin, its frame turned slowly '
    + '(`swing`); its ghosts seizing a hero near and dropping him for damage, not one far off; no program compiled in '
    + 'its fight; each hero\'s time to kill the Colossus at wave 5 and the Bell-Warden at 10; `--canary`)',
  help: 'the bosses\' fights: each battleground\'s boss waves set off, the boss the run sends against its ladder\'s '
    + 'rung and the banner\'s line (ladder); the Bell-Warden\'s life taken over and under each phase\'s share '
    + '(phases); its toll at the hero near it (stunned for its time, after its warning), far off (faded) and with a '
    + 'shield raised (--class warrior --gear shield) (toll); each chain struck from its side, all four dropping the '
    + 'bell for its window and whole again after (chains); walked into, it gives way a hair (stand); its ghosts '
    + 'seizing a hero near and dropping him, not one far off (grab); its bell through a toll and a walk, swinging '
    + 'about the yoke alone with no jolt and its body turned slowly (swing); its fight\'s effects drawn, no program '
    + 'compiled (compiles); the basic attack held on a boss, and the time each boss takes at its wave (ttk)',
  options: {
    parts: {
      kind: 'list',
      usage: 'a,b',
      choices: ['ladder', 'phases', 'toll', 'chains', 'stand', 'grab', 'swing', 'compiles', 'ttk', 'pictures'],
      help: 'the parts (all but pictures by default): ladder, phases, toll, chains, stand, grab, swing, compiles, ttk, '
        + 'pictures (the Bell-Warden in each of its moments, a sheet for the eye)',
    },
    canary: {
      kind: 'switch',
      help: 'plant a fault each part must catch: the Crypt\'s ladder turned round, a phase\'s share moved, a toll '
        + 'that stuns no one near, a shield that stops nothing, chains that take no harm, a boss that yields as a '
        + 'small foe does, ghosts that seize no one, a bell swung as a catapult and let spin, a program compiled, an '
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
