// `npm run lab -- boss`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { fixtureFrom, asText, problemsIn, picturePairs, textWithPictureFiles } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab boss`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the bosses\' fights (`--parts`): each battleground\'s boss waves against its ladder and its exceptions, the '
    + 'Rootmother\'s phases, vines, pods and heart, the Bell-Warden\'s phases, its toll near, far and at a raised shield, its chains dropping the bell, it standing its '
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
      choices: [
        'ladder', 'phases', 'toll', 'chains', 'stand', 'grab', 'swing', 'rootPhases', 'vines', 'pods', 'heart',
        'stagCharge', 'stagCrash', 'stagPhase2', 'stagToss', 'stagClose', 'compiles', 'ttk', 'pictures',
        'rootPictures', 'rootLook', 'stagPictures', 'stagMoves',
      ],
      help: 'the parts (all but the pictures by default): ladder, phases, toll, chains, stand, grab, swing (the '
        + 'Bell-Warden), rootPhases, vines, pods, heart (the Rootmother), compiles, ttk, pictures (the '
        + 'Bell-Warden in each of its moments, a sheet for the eye), rootPictures (the Rootmother\'s), rootLook '
        + '(her look: from above, over the shoulder, close up, her triangles held to a budget), stagCharge, '
        + 'stagCrash, stagPhase2, stagToss, stagClose (the Stag of Ash: its toss, and never standing up '
        + 'close), stagPictures (the stag and each stage of its fight, its triangles held to a budget), '
        + 'stagMoves (its gallop through a stride from the side, and its toss step by step)',
    },
    canary: {
      kind: 'switch',
      help: 'plant a fault each part must catch: the ladders turned round, a phase\'s share moved, a toll '
        + 'that stuns no one near, a shield that stops nothing, chains that take no harm, the Rootmother\'s '
        + 'second phase moved, a vine that reaches no one, pods that never hatch, a heart that never opens, a '
        + 'program compiled, an attack that deals nothing, the stag\'s fire burning no one, its crash stunning '
        + 'nothing, its second phase moved, its toss carrying no one, a long stand between its attacks up close',
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
