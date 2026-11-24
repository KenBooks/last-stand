// `npm run lab -- passes`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { DEVICES } from '../devices.mjs';
import { labError } from '../errors.mjs';
import { playAsDevice, qualityOf, picturePairs, asText, problemsIn, textWithPictureFiles } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab passes`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'each of the frame\'s passes timed by the engine within one frame (its breakdown, the profile\'s '
    + '"the frame by its parts": the shadows, the depth drawn first, the scene a pass for each kind of its draws by '
    + 'one shader, the bloom, the grade...; `--features` the lit shading\'s parts taken out of the whole frame in '
    + 'turns; `--paused` the game paused as its menu pauses it; `--village` stood in the lobby\'s village; the frame '
    + 'pictured for `--ab`)',
  help: 'what each of the frame\'s passes takes of the GPU, as the engine times them within one frame: every pass, '
    + 'and the scene a pass for each run of its draws of one kind by one shader, the rows adding up to the frame '
    + 'broken down, beside the frame as it is',
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
    frames: { kind: 'number', usage: 'n', help: 'the frames the frame as it is is timed over (30 by default)' },
    features: {
      kind: 'switch',
      help: 'each part of the lit shading (the point lights, the sun\'s shadow, the lamps\' shadows, the fog, '
        + 'the maps...) taken out of the whole frame in turns, by the engine\'s own switches',
    },
    paused: {
      kind: 'switch',
      help: 'the game paused as its pause menu pauses it (no update, the same scene drawn): what a game that '
        + 'updates adds to the GPU',
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
    canary: {
      kind: 'switch',
      help: 'the bloom taken out and the frame broken down again: its passes must fall to half their time or less',
    },
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
      paused: Boolean(options.paused),
      village: Boolean(options.village),
      hour: options.hour,
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
