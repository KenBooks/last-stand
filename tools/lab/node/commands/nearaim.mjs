// `npm run lab -- nearaim`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { fixtureFrom, asText, problemsIn } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab nearaim`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the hero\'s aim as a foe stands under the crosshair near him, in each close view (a training dummy under '
    + 'it from abreast of him to 7 m ahead: the aim\'s way from the hero within 10 degrees of the camera\'s at each, '
    + 'the dummy still the foe aimed at; `--canary` takes the aim\'s least distance off, #482)',
  help: 'the hero\'s aim as a foe stands under the crosshair near him, in each close view: a training dummy stood '
    + 'under it from abreast of him to 7 m ahead, the aim\'s way from the hero held within 10 degrees of the '
    + 'camera\'s at each, the dummy still the foe aimed at (a foe hugging him wheeled his aim 75 degrees, #482)',
  options: {
    views: {
      kind: 'list',
      usage: 'a,b',
      choices: ['third', 'first'],
      default: 'third,first',
      help: 'the close views: third, first',
    },
    canary: {
      kind: 'switch',
      help: 'take off the least distance the aim on a body keeps from the hero, which third person must show',
    },
    at: SETUP_OPTIONS.at,
    facing: SETUP_OPTIONS.facing,
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    const command = {
      fixture: fixtureFrom(options),
      views: options.views,
      canary: Boolean(options.canary),
    };
    return side.command('nearaim', command);
  },
  textOf: asText,
  problemsOf: problemsIn,
};
