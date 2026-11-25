// `npm run lab -- boss`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { fixtureFrom, asText, problemsIn, picturePairs, textWithPictureFiles } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab boss`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the bosses\' fights (`--parts`): each battleground\'s boss waves against its ladder and its exceptions, a '
    + 'boss standing its ground as the hero walks into it, the Ossuary Cantor\'s encounter (its guards\' tolls near, '
    + 'further off and at a raised shield, their swing, warded while a guard stands, no two bosses\' hits within its '
    + 'beat; its bars, its guards\' ghosts diving, its choir\'s ring and rising graves), the Rootmother\'s phases, '
    + 'vines, pods, heart, burrow, thrown branches and root cage, no program compiled in either fight, and the time '
    + 'each boss takes (`--canary`)',
  help: 'the bosses\' fights: each battleground\'s boss waves set off, the boss the run sends against its ladder\'s '
    + 'rung and the banner\'s line (ladder); walked into, the Colossus gives way a hair (stand); the Ossuary Cantor\'s '
    + 'encounter, its parts in full in commands/boss.md (toll, swing, encounter, bars, dive, choir, graves); the '
    + 'Rootmother\'s phases, vines, pods, heart, burrow, thrown branches and root cage (rootPhases, vines, pods, '
    + 'heart, rootBurrow, branches, rootCage); both fights\' effects drawn, no program compiled (compiles); the '
    + 'basic attack held on a boss, and the time each boss takes at its wave (ttk)',
  options: {
    parts: {
      kind: 'list',
      usage: 'a,b',
      choices: [
        'ladder', 'stand', 'toll', 'swing', 'encounter', 'bars', 'dive', 'choir', 'graves', 'rootPhases', 'vines',
        'pods', 'heart', 'rootBurrow', 'branches', 'rootCage', 'compiles', 'ttk', 'threat', 'encounterPictures',
        'cantorLook', 'film', 'choirPictures', 'frames', 'rootPictures', 'rootLook', 'rootBurrowPictures',
        'branchPictures', 'rootCost', 'rootCagePictures',
      ],
      help: 'the parts (all but those asked for by name, by default): ladder, stand, toll, swing, encounter, '
        + 'bars, dive, choir, graves (the Ossuary Cantor\'s encounter), rootPhases, vines, pods, heart, '
        + 'rootBurrow (her burrow: never moving over the floor, wholly under before she moves, her rise warned at its '
        + 'spot, on a clear spot at its distance from the hero, struck-proof and striking nothing under), branches '
        + '(her thrown branches, each in its ring, a step aside or a shield its answer), rootCage (her root cage at '
        + 'a hero standing still: warned, dodged by walking out, holding him, a root broken his way out, each '
        + 'class\'s own way out before her blow, a shield\'s share of it, withered on time), compiles, ttk; by name: '
        + 'threat (what each boss lands on a hero standing still, her with and without her cage), rootPictures (the '
        + 'Rootmother\'s moments, a sheet for the eye), rootLook (her look, her triangles held to a budget), '
        + 'rootBurrowPictures (her burrow as the player sees it, her sink from her side), branchPictures (her '
        + 'branches from their side and as the player sees them), rootCost (her fight\'s cost to the frame, a root '
        + 'cage standing timed apart), rootCagePictures (her root cage: its warning, its roots bursting from the side, '
        + 'a root broken, her blow); encounterPictures (the Cantor\'s encounter in each of its moments), cantorLook '
        + '(the Cantor alone from every side and its skull close, its triangles held to 45k), film (a guard\'s toll '
        + 'and the guards as wave 10 sends them, as the game draws them from low at a hero\'s eye height), '
        + 'choirPictures (the ring, a stone, the arena late, the bars), frames (the frame\'s time through each of the '
        + 'Crypt\'s boss waves against the Colossus\'s, in turns in one page)',
    },
    canary: {
      kind: 'switch',
      help: 'plant a fault each part must catch: a rung slipped onto the Crypt\'s ladder, a boss that yields as a '
        + 'small foe does, a toll that stuns no one near, a shield that stops nothing, a swing four times as wide, a '
        + 'ward that wards nothing, guards that drift or rise at the gates, the Rootmother\'s second phase moved, a '
        + 'vine that reaches no one, pods that never hatch, a heart that never opens, her moving over the floor, her '
        + 'rise unwarned and her trunk on the hero, a branch\'s burst six metres wide, her root cage\'s roots too '
        + 'thin to hold him, a program compiled, her damage taken away, an attack that deals nothing',
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
