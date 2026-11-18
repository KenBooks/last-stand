// `npm run lab -- health`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { labError } from '../errors.mjs';
import { lightScenarios, picturePairs, asText, problemsIn, textWithPictureFiles } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab health`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the low-Health look (the hero\'s Health held at shares of his most in each biome, view and facing: the '
    + 'colour drained, the blood\'s cover and how far in it reaches, nothing in the view\'s middle, more of both as '
    + 'the Health falls, none above where it starts)',
  help: 'the screen as the hero\'s Health runs low: standing in each biome and view, his Health held at shares of '
    + 'his most, and at each the frame drawn with the low-health look and without it at the same moment: the colour '
    + 'it drains, the blood\'s cover of the screen and of its middle, and how far in it reaches; a frame changed '
    + 'above where the look starts, blood in the middle of the view, a lower Health draining or covering less and '
    + 'a look too faint with nothing left are problems: tools/lab/out/health',
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
      usage: 'deg',
      default: '0',
      help: 'the way the hero faces, degrees (0 is +z; the first alone)',
    },
    shares: {
      kind: 'list',
      usage: 'a,b',
      default: '1,0.6,0.5,0.4,0.25,0.1,0',
      help: 'the shares of his most Health he is held at, in turn',
    },
    pictures: {
      kind: 'switch',
      help: 'picture the frames under the share the look starts at (=false: numbers alone)',
    },
    canary: {
      kind: 'switch',
      help: 'plant faults the checks must catch, in the first scenario: the look drawn with Health whole, and its '
        + 'blood driven into the middle of the view',
    },
    ...COMMON_OPTIONS,
  },
  check(options) {
    const wrong = options.shares.find((share) => !(Number(share) >= 0 && Number(share) <= 1));
    if (wrong !== undefined) throw labError(`health --shares: ${wrong} is not a share from 0 to 1`);
  },
  async each(side, options) {
    // (a frame at a time, each on its own: its pictures sent back with it)
    const reports = [];
    for (const scenario of lightScenarios({ ...options, facings: options.facings.slice(0, 1) })) {
      const canary = Boolean(options.canary) && reports.length === 0;
      const shares = options.shares.map(Number);
      reports.push(await side.command('health', { scenario, shares, pictures: options.pictures !== false, canary }));
    }
    return {
      text: reports.map((report) => report.text).join('\n'),
      problems: reports.flatMap((report) => report.problems),
      moments: reports.flatMap((report) => report.moments),
    };
  },
  finish(results, options, session) {
    return textWithPictureFiles(results, session.outFor('health'));
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
