// `npm run lab -- draws`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { labError } from '../errors.mjs';
import { fixtureFrom, asText, problemsIn } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab draws`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'one frame\'s draw calls with the crowd standing, by what drew them (the geometries drawn most often, '
    + 'those that drew the most triangles, the triangles drawn outside the view of the pass that drew them, the draws '
    + 'that drew nothing, the scene\'s draws by their material\'s look, through the eyes what the arms\' own camera '
    + 'drew, the hero\'s arms and what they hold alone; the scene\'s objects whose matrices are made again each frame)',
  help: 'one frame\'s draw calls with the crowd of foes standing before the hero, by the geometry each drew, the '
    + 'most first: its draws in the scene, its shadow map and after it, the triangles, its material and what drew it '
    + '(a geometry drawn many times a frame is one an instanced mesh or a merge would draw once)',
  options: {
    count: {
      kind: 'number',
      usage: 'n',
      help: 'how many foes (by default the most a wave keeps alive, 38; 0: none)',
    },
    rows: { kind: 'number', usage: 'n', help: 'how many rows each list shows (16 by default)' },
    biome: {
      kind: 'choice',
      choices: ['crypt', 'forest'],
      usage: 'crypt|forest',
      help: 'the biome (as the page has it by default)',
    },
    hour: {
      kind: 'number',
      usage: 'h',
      help: 'with --village, the hour it\'s lit for (0 to 24: by night its lamps are lit, two casting shadows)',
    },
    village: {
      kind: 'switch',
      help: 'in the lobby\'s village instead (the run the set-up starts left, no foes; --at and --facing where the '
        + 'hero stands there, the square by default)',
    },
    moving: {
      kind: 'switch',
      help: 'with --village, the frame as one in which he moves: what moves drawn into the kept shadow maps',
    },
    canary: {
      kind: 'switch',
      help: 'stand seven boxes of one geometry before the hero, which must come out as seven draws of it, seven '
        + 'instanced boxes, four far behind the camera, which must come out as four outside the view, and an '
        + 'instanced mesh of none, which must come out as a draw of nothing',
    },
    ...SETUP_OPTIONS,
    ...COMMON_OPTIONS,
  },
  check(options) {
    if (options.count !== undefined && !(options.count >= 0)) throw labError('draws --count: 0 or more');
    if (options.rows !== undefined && !(options.rows >= 1)) throw labError('draws --rows: at least 1');
  },
  each(side, options) {
    const command = {
      fixture: fixtureFrom(options),
      count: options.count === undefined ? undefined : Math.round(options.count),
      rows: options.rows === undefined ? undefined : Math.round(options.rows),
      biome: options.biome,
      village: Boolean(options.village),
      hour: options.hour,
      moving: Boolean(options.moving),
      canary: Boolean(options.canary),
    };
    return side.command('draws', command);
  },
  textOf: asText,
  problemsOf: problemsIn,
};
