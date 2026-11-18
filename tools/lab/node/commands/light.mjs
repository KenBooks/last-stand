// `npm run lab -- light`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { labError } from '../errors.mjs';
import { lightScenarios, picturePairs, asText, problemsIn, textWithPictureFiles } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** The quality levels and Resolutions `light` draws each frame at again (`--levels`, `--resolutions`): every level at
 *  every Resolution, the first the one the rest are held to; none where neither is given. */
function lightSettings(options) {
  if (!options.levels && !options.resolutions) return [];
  const levels = options.levels ?? ['high'];
  const resolutions = (options.resolutions ?? ['1']).map(Number);
  return levels.flatMap((level) => resolutions.map((resolution) => ({ level, resolution })));
}

/** `lab light`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the frame\'s light as the player sees it (the hero standing in each biome, view and facing, the frame '
    + 'drawn and read back from the canvas: its light as a share of the screen\'s white, by thirds, its brightest '
    + 'pixels, near white and past it; `--hdr` draws each again in HDR and checks it against the SDR frame; '
    + '`--levels`, `--resolutions` draw each again at every quality level and Resolution, none brighter than the '
    + 'first; `--at`, `--zoom` by what can be too bright)',
  help: 'the frame\'s light as the player sees it: the hero standing in each biome, view and facing, the frame '
    + 'drawn and read back from the canvas, its light as a share of the screen\'s white (mean, by thirds, its '
    + 'brightest pixels, near white and past it): tools/lab/out/light',
  options: {
    biomes: {
      kind: 'list',
      usage: 'a,b',
      choices: ['crypt', 'forest'],
      default: 'crypt,forest',
      help: 'the biomes: crypt, forest',
    },
    views: {
      kind: 'list',
      usage: 'a,b',
      choices: ['top', 'third', 'first'],
      default: 'top,third,first',
      help: 'the views: top, third, first',
    },
    facings: {
      kind: 'list',
      usage: 'a,b',
      default: '0,90,180,270',
      help: 'the ways the hero faces in the close views, degrees (0 is +z; the top view is measured at the first)',
    },
    pictures: { kind: 'switch', help: 'picture each frame too (=false: the numbers alone)' },
    at: { kind: 'pair', usage: 'x,z', help: 'where the hero stands (-6.5,3.5: by a standing stone\'s rune)' },
    zoom: { kind: 'number', usage: 'n', help: 'the top-down view\'s zoom (0.4: zoomed in; the game\'s own if none)' },
    levels: {
      kind: 'list',
      usage: 'a,b',
      choices: ['high', 'medium', 'low', 'verylow'],
      help: 'each frame drawn again at these quality levels, set as the pause menu sets them, and held to the '
        + 'first\'s light: one brighter is a problem (high,medium,low,verylow)',
    },
    resolutions: {
      kind: 'list',
      usage: 'a,b',
      help: 'and at these Resolutions, shares of the screen each way, at every level (1,0.5,0.25)',
    },
    walk: {
      kind: 'number',
      usage: 'frames',
      help: 'at each level, the hero walked this many frames too, each drawn: how much the light of the frame '
        + 'changes from a frame to the next, held to the first level (90: a glow that flickers as the view moves)',
    },
    hdr: {
      kind: 'switch',
      help: 'each frame drawn again in HDR (on any display) and checked against the SDR one: under the knee as an '
        + 'SDR screen shows it at the paper white, nothing past the peak, the canvas shown the frame drawn, its alpha 1',
    },
    paper: { kind: 'number', usage: 'n', help: 'with --hdr, the paper white: a share of the screen\'s white (1)' },
    peak: { kind: 'number', usage: 'n', help: 'with --hdr, the brightest highlight: a share of its white (3)' },
    canary: {
      kind: 'switch',
      help: 'plant faults the measures must catch: the first frame at twice the exposure (and in HDR at 1.2 times '
        + 'the paper white)',
    },
    ...COMMON_OPTIONS,
  },
  check(options) {
    const wrong = options.facings.find((facing) => !Number.isFinite(Number(facing)));
    if (wrong !== undefined) throw labError(`light --facings: ${wrong} is not a number of degrees`);
    const share = (options.resolutions ?? []).find((value) => !(Number(value) > 0 && Number(value) <= 1));
    if (share !== undefined) throw labError(`light --resolutions: ${share} is not a share of the screen (0.25 to 1)`);
  },
  async each(side, options) {
    // (a frame at a time, each on its own: its pictures sent back with it)
    const reports = [];
    for (const scenario of lightScenarios(options)) {
      const canary = Boolean(options.canary) && reports.length === 0;
      const hdr = options.hdr ? { paper: options.paper ?? 1, peak: options.peak ?? 3 } : undefined;
      const settings = lightSettings(options);
      const walk = options.walk ?? 0;
      const command = { scenario, pictures: options.pictures !== false, canary, hdr, settings, walk };
      reports.push(await side.command('light', command));
    }
    return {
      text: reports.map((report) => report.text).join('\n'),
      problems: reports.flatMap((report) => report.problems),
      moments: reports.flatMap((report) => report.moments),
    };
  },
  finish(results, options, session) {
    return textWithPictureFiles(results, session.outFor('light'));
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
