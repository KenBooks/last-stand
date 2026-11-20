// `npm run lab -- twins`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { fixtureFrom, picturePairs, asText, problemsIn, textWithPictureFiles } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab twins`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the Ossuary Twins (the Crypt\'s 15th wave and every 20th after sending them, the ladder\'s rungs on its '
    + 'other boss waves, both risen within their chain\'s reach; one life between them, the chain snapping past its reach, '
    + 'the collapse at half, a mend a stun breaks; no program compiled in their fight; `--parts pictures,look` for '
    + 'the eye, each twin\'s triangles held to 45k)',
  help: 'the Ossuary Twins: each battleground\'s boss waves set off, the bosses the run sends, its banner and the '
    + 'Continue button\'s name (the Twins on the Crypt\'s 15th and every 20th after, the ladder\'s rungs on its other boss '
    + 'waves), and the 15th let come, both risen within their chain\'s reach (waves); one life between them, the '
    + 'chain snapping past its reach, the collapse at half, a mend that a stun breaks (fight); their fight\'s '
    + 'effects drawn, no program compiled (compiles)',
  options: {
    parts: {
      kind: 'list',
      usage: 'a,b',
      choices: ['waves', 'fight', 'compiles', 'pictures', 'look'],
      help: 'the parts (all but the pictures by default): waves, fight, compiles, pictures (the pair in each of '
        + 'their moments, a sheet for the eye), look (each twin alone from four sides and its skull close up, its '
        + 'triangles held to 45k)',
    },
    canary: {
      kind: 'switch',
      help: 'plant a fault each part must catch: no Twins on the Crypt\'s ladder, Twins that share nothing, a chain that never '
        + 'snaps, no collapse at half, a mend that mends nothing, a program compiled in the fight',
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
