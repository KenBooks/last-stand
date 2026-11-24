// `npm run lab -- twins`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { fixtureFrom, picturePairs, asText, problemsIn, textWithPictureFiles } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab twins`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the Ossuary Twins (the Crypt\'s 15th wave and every 20th after sending them, the Colossus on its other '
    + 'boss waves, both risen within their chain\'s reach; one life between them, the chain snapping past its reach, '
    + 'the collapse at half, a mend a stun breaks; their belt skulls: each throws its four at most, its rope showing '
    + 'what\'s left, the cooldown held, the bomb bursting where marked after its fuse and throwing a hero about 4 m '
    + 'onto clear floor, the cloud hurting only inside it and gone on time, the survivor taking the fallen\'s; no '
    + 'program compiled in their fight; `--parts pictures,look,beltPictures` for the eye, each twin\'s triangles held '
    + 'to 45k)',
  help: 'the Ossuary Twins: each battleground\'s boss waves set off, the bosses the run sends, its banner and the '
    + 'Continue button\'s name (the Twins on the Crypt\'s 15th and every 20th after, the Colossus on its other boss '
    + 'waves), and the 15th let come, both risen within their chain\'s reach (waves); one life between them, the '
    + 'chain snapping past its reach, the collapse at half, a mend that a stun breaks (fight); their belt skulls '
    + 'through a fight: four each at most, the rope against the belt, the cooldown, one out at a time, no two warned '
    + 'hits inside their beat (belt); a bomb beside a hero, by the wall and stepped out of (bomb); a cloud at a hero\'s '
    + 'edge and on him (poison); the survivor\'s belt (inherit); their fight\'s effects drawn, no program compiled '
    + '(compiles); the frame with the skulls out against none, in turns, by the browser\'s clock and the GPU\'s (cost)',
  options: {
    parts: {
      kind: 'list',
      usage: 'a,b',
      choices: ['waves', 'fight', 'belt', 'bomb', 'poison', 'inherit', 'compiles', 'cost', 'pictures', 'look', 'beltPictures'],
      help: 'the parts (all but the pictures by default): waves, fight, belt, bomb, poison, inherit, compiles, cost, '
        + 'pictures (the pair in each of their moments, a sheet for the eye), look (each twin alone from four sides '
        + 'and its skull close up, its triangles held to 45k), beltPictures (the belts, a throw from the side, the '
        + 'bomb\'s blast, the cloud, the survivor\'s two belts)',
    },
    canary: {
      kind: 'switch',
      help: 'plant a fault each part must catch: no special boss wave, Twins that share nothing, a chain that never '
        + 'snaps, no collapse at half, a mend that mends nothing, a belt of six with a 2 s cooldown and no beat, a bomb '
        + 'launching 12 m on a 0.2 s fuse, a cloud past its ring, a survivor showing one belt, a program compiled in '
        + 'the fight',
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
    return side.command('twins', command);
  },
  finish(results, options, session) {
    return textWithPictureFiles(results, session.outFor('twins'));
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
