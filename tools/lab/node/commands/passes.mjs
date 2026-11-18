// `npm run lab -- passes`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { DEVICES } from '../devices.mjs';
import { labError } from '../errors.mjs';
import { playAsDevice, qualityOf, picturePairs, asText, problemsIn, textWithPictureFiles } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab passes`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'each of the frame\'s renders on WebGPU timed by three\'s timestamps (the scene, its shadows, each post '
    + 'pass, by name and size; `--features` the environment, shadows, point lights and fog taken off the scene\'s '
    + 'pass in turns; the frame pictured, WebGL\'s too, for `--ab`)',
  help: 'what each of the frame\'s renders takes of the GPU on WebGPU (--renderer webgpu), by three\'s timestamps: '
    + 'the scene\'s pass, the shadow maps, each pass of the post chain and the canvas\'s, each named by what it '
    + 'draws and into what size',
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
    frames: { kind: 'number', usage: 'n', help: 'the frames timed (30 by default)' },
    features: {
      kind: 'switch',
      help: 'each feature of the lit shading (the environment, the shadows, the point lights, the fog) '
        + 'taken off the scene\'s pass in turns, drawn alone',
    },
    canary: { kind: 'switch', help: 'a render of its own, the scene again: found once a frame, with a time' },
    ...COMMON_OPTIONS,
  },
  check(options) {
    if (options.frames !== undefined && !(options.frames >= 1)) throw labError('passes --frames: 1 or more');
    if (options.device) playAsDevice(options);
  },
  async each(side, options) {
    const command = {
      biome: options.biome ?? 'forest',
      view: options.view ?? 'top',
      at: options.at,
      level: options.level ?? (options.device ? qualityOf(options.quality).level : undefined),
      frames: options.frames === undefined ? undefined : Math.round(options.frames),
      features: Boolean(options.features),
      canary: Boolean(options.canary),
    };
    return side.command('passesHere', command);
  },
  finish(results, options, session) {
    return textWithPictureFiles(results, session.outFor('passes'));
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
