// `npm run lab -- boss`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { fixtureFrom, asText, problemsIn, picturePairs, textWithPictureFiles } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab boss`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the bosses\' fights (`--parts`): each battleground\'s boss waves against its ladder and its exceptions, a '
    + 'boss standing its ground as the hero walks into it, the Ossuary Cantor\'s encounter (its guards\' tolls near, '
    + 'further off and at a raised shield, their swing, warded while a guard stands, no two bosses\' hits within its '
    + 'beat; its bars, its guards\' ghosts diving, its choir\'s ring and rising graves), no program compiled in it, and '
    + 'the time each boss takes (`--canary`)',
  help: 'the bosses\' fights: each battleground\'s boss waves set off, the boss the run sends against its ladder\'s '
    + 'rung and the banner\'s line (ladder); walked into, the Colossus gives way a hair (stand); the Ossuary Cantor\'s '
    + 'encounter, its parts in full in commands/boss.md (toll, swing, encounter, bars, dive, choir, graves, '
    + 'compiles); the basic attack held on a boss, and the time each boss takes at its wave (ttk)',
  options: {
    parts: {
      kind: 'list',
      usage: 'a,b',
      choices: [
        'ladder', 'stand', 'toll', 'swing', 'encounter', 'bars', 'dive', 'choir', 'graves', 'compiles', 'ttk',
        'encounterPictures', 'cantorLook', 'film', 'choirPictures', 'frames',
      ],
      help: 'the parts (all but the pictures and frames by default): ladder, stand, toll, swing, encounter, bars, '
        + 'dive, choir, graves, compiles, ttk; encounterPictures (the Cantor\'s encounter in each of its moments), '
        + 'cantorLook (the Cantor alone from every side and its skull close, its triangles held to 45k), film (a '
        + 'guard\'s toll and the guards as wave 10 sends them, as the game draws them from low at a hero\'s eye height), '
        + 'choirPictures (the ring, a stone, the arena late, the bars), frames (the frame\'s time through each of the '
        + 'Crypt\'s boss waves against the Colossus\'s, in turns in one page)',
    },
    canary: {
      kind: 'switch',
      help: 'plant a fault each part must catch: a rung slipped onto the Crypt\'s ladder, a boss that yields as a '
        + 'small foe does, a toll that stuns no one near, a shield that stops nothing, a swing four times as wide, a ward that '
        + 'wards nothing, guards that drift or rise at the gates, a program compiled, an attack that deals nothing',
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
