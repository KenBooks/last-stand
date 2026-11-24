// `npm run lab -- shadows`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab shadows`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the hero\'s shadow cast from fewer triangles against every triangle (each weapon style, armoured and '
    + 'bare, each view: the frame drawn both ways, pixels apart past a texel\'s edge; `--cost` the frame on the '
    + 'engine\'s GPU clock)',
  help: 'the hero\'s shadow cast from fewer triangles (the engine\'s caster geometry) against every triangle: in each '
    + 'way he holds his weapons, in all his armour and in none, and in each view, the frame drawn both ways and '
    + 'compared pixel by pixel, the pieces cast from fewer counted',
  options: {
    views: {
      kind: 'list',
      usage: 'a,b',
      choices: ['top', 'third', 'first'],
      default: 'top,third,first',
      help: 'the views: top, third, first',
    },
    canary: { kind: 'switch', help: 'his shadow taken away in the first case: it must be seen' },
    cost: {
      kind: 'switch',
      help: 'time the frame on the engine\'s GPU clock instead: every triangle cast against fewer, and his '
        + 'shadow against none, in turns on one page',
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
