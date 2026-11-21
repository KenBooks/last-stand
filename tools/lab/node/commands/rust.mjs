// `npm run lab -- rust`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { labError } from '../errors.mjs';
import { picturePairs, asText, problemsIn, textWithPictureFiles, tunesFrom } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab rust`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the Rust engine\'s frame (`src/engine`, Bulwark) beside three\'s WebGPU frame of the same scene on '
    + 'the same page: both pictured, each one\'s render timed by the browser\'s clock and the GPU\'s timestamps, '
    + 'their draw calls and triangles, what the engine couldn\'t draw by its kind, and the engine\'s boot '
    + '(`--village`, `--foes n`)',
  help: 'the Rust engine against three\'s WebGPU renderer, where the hero stands: pictures, frame times, draws, boot',
  options: {
    biome: {
      kind: 'choice',
      choices: ['crypt', 'forest'],
      usage: 'crypt|forest',
      help: 'the biome (forest by default)',
    },
    view: SETUP_OPTIONS.view,
    at: SETUP_OPTIONS.at,
    frames: { kind: 'number', usage: 'n', help: 'the frames timed a side (60 by default)' },
    foes: { kind: 'number', usage: 'n', help: 'foes stood before the hero (none by default; not in the village)' },
    hour: { kind: 'number', usage: 'h', help: 'with --village, the hour it\'s lit for' },
    village: { kind: 'switch', help: 'in the lobby\'s village instead' },
    census: { kind: 'switch', help: 'the shown meshes\' materials by kind, and what each asks beyond the engine' },
    three: { kind: 'switch', help: 'the baseline: three.js\'s WebGPU renderer instead, on a page of its own' },
    tune: SETUP_OPTIONS.tune,
    ...COMMON_OPTIONS,
  },
  check(options) {
    if (options.frames !== undefined && !(options.frames >= 1)) throw labError('rust --frames: 1 or more');
    // (the engine's page, or with --three a page of three's WebGPU renderer, the same stand timed the same way)
    options.renderer = options.three ? 'webgpu' : 'rust';
  },
  async each(side, options) {
    const command = {
      biome: options.biome ?? 'forest',
      view: options.view ?? 'top',
      at: options.at,
      frames: Math.round(options.frames ?? 60),
      foes: Math.round(options.foes ?? 0),
      village: Boolean(options.village),
      hour: options.hour,
      census: Boolean(options.census),
      three: Boolean(options.three),
      tune: options.tune === undefined ? {} : tunesFrom(options.tune),
    };
    return side.command('rustHere', command);
  },
  finish(results, options, session) {
    return textWithPictureFiles(results, session.outFor('rust'));
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
