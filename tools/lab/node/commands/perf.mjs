// `npm run lab -- perf`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { DEVICES } from '../devices.mjs';
import { labError } from '../errors.mjs';
import { playAsDevice, qualityOf, asText, problemsIn } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab perf`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'skills cast in turn with the biome\'s foes coming, every frame timed as the game\'s performance report '
    + 'times it (the frame, the update by stage, the render, the GPU by pass, the draws, triangles and the '
    + 'particles\' fill), on a phone\'s screen, boot and CPU if asked, or as a slow device players reported '
    + '(`--device`: its frame rate there, its GPU played by this one drawing its screen at more pixels); `--village` '
    + 'the lobby\'s village standing and walking, `--fly` the dev tool\'s free camera flown over it (round it high '
    + 'and low and across it, twice: where each leg\'s dearest frames were)',
  help: 'skills cast in turn as the player casts them, the biome\'s foes coming at the hero, and every frame timed '
    + 'as the game\'s performance report times it, by the browser\'s clock with the game drawn and waited out on '
    + 'the GPU: the frame, the update by stage, the render, the GPU by pass (where the browser times it), the '
    + 'draws, triangles and particles, standing before the first press and from each press on; a cast never made, '
    + 'a shader compiled as it\'s timed and a canary unseen are problems (a phone\'s: --screen 832x384@3.75 '
    + '--quality low@518400 --throttle 4; --class mage)',
  argument: 'skills',
  mayOmit: true,
  options: {
    biome: {
      kind: 'choice',
      choices: ['crypt', 'forest'],
      usage: 'crypt|forest',
      help: 'the biome (forest by default)',
    },
    village: {
      kind: 'switch',
      help: 'in the lobby\'s village instead, no skills: the hero standing on its square, then walking (--at, '
        + '--facing where he stands)',
    },
    parts: {
      kind: 'switch',
      help: 'after the phases, the biggest draws timed on the GPU, each drawn and hidden in turns',
    },
    spin: {
      kind: 'switch',
      help: 'with --village, the view turned right round on the spot three times, each turn a phase',
    },
    fly: {
      kind: 'switch',
      help: 'with --village, the dev tool\'s free camera flown over it: round it high, round it low and '
        + 'across it, each a phase, with where its dearest frames were',
    },
    hour: {
      kind: 'number',
      usage: 'h',
      help: 'with --village, the hour it\'s lit for (0 to 24: by night its lamps are lit)',
    },
    facing: { kind: 'number', usage: 'degrees', help: 'the way the hero faces and casts (0, +z, by default)' },
    at: SETUP_OPTIONS.at,
    view: SETUP_OPTIONS.view,
    gear: SETUP_OPTIONS.gear,
    foes: {
      kind: 'number',
      usage: 'n',
      help: 'how many of the biome\'s commonest foes come at him (10 by default; 0: none)',
    },
    apart: { kind: 'number', usage: 's', help: 'from one press to the next (1 s by default)' },
    after: { kind: 'number', usage: 's', help: 'from the last press to the end (4 s by default)' },
    quality: {
      kind: 'text',
      usage: 'level[@pixels]',
      help: 'the quality level (high, medium, low) and the most pixels the scene renders, as Auto settles on them '
        + '(low@518400: a phone\'s, Auto at its lowest; as the page has it by default), put to use before the '
        + 'set-up, the hero built at its detail',
    },
    throttle: { kind: 'number', usage: 'n', help: 'the CPU this many times slower (1 by default; 4: a phone\'s)' },
    device: {
      kind: 'choice',
      choices: Object.keys(DEVICES),
      usage: Object.keys(DEVICES).join('|'),
      help: 'played as a device players reported a slow game on (lab/node/devices.mjs): its screen, CPU and '
        + 'quality, and its GPU played by this one drawing its screen at more pixels; each phase says the frame '
        + 'and frames a second it would have there',
    },
    frames: { kind: 'switch', help: 'list every frame: its time, the page\'s work by stage, what it drew' },
    lobby: {
      kind: 'switch',
      help: 'cast in the lobby, the run abandoned for it (its camera lower and nearer than a run\'s; no foes come)',
    },
    canary: {
      kind: 'switch',
      help: 'plant costs the measure must see: the hero\'s update 2 ms slower, the scene drawn twice',
    },
    ...COMMON_OPTIONS,
  },
  check(options) {
    if (options.foes !== undefined && !(options.foes >= 0)) throw labError('perf --foes: 0 or more');
    if (options.apart !== undefined && !(options.apart > 0)) throw labError('perf --apart: more than 0 s');
    if (options.after !== undefined && !(options.after > 0)) throw labError('perf --after: more than 0 s');
    if (options.throttle !== undefined && !(options.throttle >= 1)) throw labError('perf --throttle: 1 or more');
    if (options.quality !== undefined) qualityOf(options.quality);
    if (options.device) playAsDevice(options);
    if (!options.village && options._.length === 0) throw labError('perf needs its skills (or --village)');
    if (options.spin && !options.village) throw labError('perf --spin: with --village');
    if (options.fly && !options.village) throw labError('perf --fly: with --village');
    if (options.fly && options.spin) throw labError('perf --fly: without --spin');
  },
  each(side, options) {
    const device = options.device ? DEVICES[options.device] : undefined;
    const command = {
      device: device && {
        name: options.device,
        what: device.what,
        gpu: device.gpu,
        screen: device.screen,
        pageWork: device.pageWork,
      },
      casts: options._[0]?.split(',') ?? [],
      biome: options.biome ?? 'forest',
      view: options.view ?? 'top',
      facing: options.facing ?? 0,
      at: options.at,
      gear: options.gear,
      foes: options.foes === undefined ? 10 : Math.round(options.foes),
      apart: options.apart ?? 1,
      after: options.after ?? 4,
      quality: options.quality === undefined ? undefined : qualityOf(options.quality),
      throttle: options.throttle ?? 1,
      frames: Boolean(options.frames),
      lobby: Boolean(options.lobby),
      canary: Boolean(options.canary),
      village: Boolean(options.village),
      parts: Boolean(options.parts),
      hour: options.hour,
      spin: Boolean(options.spin),
      fly: Boolean(options.fly),
    };
    return side.command('perf', command);
  },
  textOf: asText,
  problemsOf: problemsIn,
};
