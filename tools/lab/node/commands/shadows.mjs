// `npm run lab -- shadows`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab shadows`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the hero\'s shadow cast as one against his pieces cast alone (each weapon style, armoured and bare, each '
    + 'view: the frame drawn both ways, pixels apart past a texel\'s rounding; `--cost` the shadow map\'s draw)',
  help: 'the hero\'s shadow cast as one against his pieces cast each on its own: in each way he holds his '
    + 'weapons, in all his armour and in none, and in each view, the frame drawn both ways and compared pixel by '
    + 'pixel (more than 2 levels apart is a difference)',
  options: {
    views: {
      kind: 'list',
      usage: 'a,b',
      choices: ['top', 'third', 'first'],
      default: 'top,third,first',
      help: 'the views: top, third, first',
    },
    canary: { kind: 'switch', help: 'his pieces\' shadow moved 30 cm in the first case: it must be seen' },
    cost: {
      kind: 'switch',
      help: 'time the shadow map\'s draw a frame instead, cast as one and each piece alone in turns on one page',
    },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    const command = { views: options.views, canary: Boolean(options.canary), cost: Boolean(options.cost) };
    return side.command('shadows', command);
  },
  textOf: asText,
  problemsOf: problemsIn,
};
