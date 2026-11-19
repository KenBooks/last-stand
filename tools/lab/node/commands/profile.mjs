// `npm run lab -- profile`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { DEVICES } from '../devices.mjs';
import { labError } from '../errors.mjs';
import { playAsDevice, qualityOf, asText, problemsIn } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab profile`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the game\'s own profiler, the pause menu\'s Profile this spot, run where the hero stands (`--biome`, '
    + '`--view`, `--at`, `--level`, `--device`, `--renderer webgpu|meshlets`): each part of the frame taken out in '
    + 'turns by the browser\'s clock, as a player\'s device times itself (`--village` stood in the lobby\'s '
    + 'village), the programs it compiled (over 8 fails; '
    + 'WebGPU\'s pipelines, over 24), a run cancelled midway, and its result sent and read back as `lab trace` '
    + 'reports it; `--canary` the frame drawn twice',
  help: 'the game\'s own profiler (the pause menu\'s Profile this spot) where the hero stands: each part of the '
    + 'frame taken out and put back in turns (the pixels, the lights, the shadows, what\'s cut out and blended, '
    + 'the particles, the flames, the hero), each frame waited out on the GPU and timed by the browser\'s clock',
  options: {
    biome: {
      kind: 'choice',
      choices: ['crypt', 'forest'],
      usage: 'crypt|forest',
      help: 'the biome (forest by default)',
    },
    view: SETUP_OPTIONS.view,
    at: SETUP_OPTIONS.at,
    level: {
      kind: 'choice',
      usage: 'level',
      choices: ['high', 'medium', 'low', 'verylow'],
      help: 'the quality level put to use first (as the page has it by default; a --device\'s own with one)',
    },
    device: {
      kind: 'choice',
      choices: Object.keys(DEVICES),
      usage: Object.keys(DEVICES).join('|'),
      help: 'played as a device players reported a slow game on (lab/node/devices.mjs): its screen and quality, '
        + 'its GPU played by this one drawing its screen at more pixels',
    },
    rounds: { kind: 'number', usage: 'n', help: 'the rounds of turns a part (the game\'s own, 3, by default)' },
    arrows: {
      kind: 'number',
      usage: 'n',
      help: 'n spent arrows stood in the ground round him first: what they cost, its part '
        + '"the spent arrows"',
    },
    hour: {
      kind: 'number',
      usage: 'h',
      help: 'with --village, the hour it\'s lit for (0 to 24: by night its lamps are lit; the page\'s own when not '
        + 'given, so two sides of an --ab may stand under another sun)',
    },
    village: {
      kind: 'switch',
      help: 'in the lobby\'s village instead (the run the set-up starts left, no foes; --at where the hero stands '
        + 'there, the square by default), as `draws --village` stands him',
    },
    canary: { kind: 'switch', help: 'a part of its own, the frame drawn twice: it must read 1.6 times once' },
    ...COMMON_OPTIONS,
  },
  check(options) {
    if (options.rounds !== undefined && !(options.rounds >= 1)) throw labError('profile --rounds: 1 or more');
    if (options.device) playAsDevice(options);
  },
  async each(side, options) {
    // (its result sent as the Performance tab's Send sends it, to a traces service of the lab's own, and read back)
    const { checkProfileSent, startTracesService } = await import('../tracesService.mjs');
    const service = await startTracesService(new URL(side.url).origin);
    try {
      const command = {
        biome: options.biome ?? 'forest',
        view: options.view ?? 'top',
        at: options.at,
        level: options.level ?? (options.device ? qualityOf(options.quality).level : undefined),
        rounds: options.rounds === undefined ? undefined : Math.round(options.rounds),
        canary: Boolean(options.canary),
        send: service.url,
        arrows: options.arrows === undefined ? undefined : Math.round(options.arrows),
        village: Boolean(options.village),
        hour: options.hour,
      };
      const result = await checkProfileSent(await side.command('profileHere', command), service);
      // (booted on WebGPU, it must have profiled there: a boot that fell back to WebGL would pass for one)
      const onWebGPU = (options.renderer ?? 'webgl') !== 'webgl';
      if (!onWebGPU || /, on WebGPU/.test(result.text)) return result;
      return { ...result, problems: [...result.problems, `booted on ${options.renderer}, profiled on WebGL`] };
    } finally {
      await service.close();
    }
  },
  textOf: asText,
  problemsOf: problemsIn,
};
