// `npm run lab -- draw`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { fixtureFrom, picturePairs, asText, problemsIn, textWithPictureFiles } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab draw`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'each drawn shot held at full draw as the player holds it (the glint round its arrowhead every frame in '
    + 'every view: none as it\'s drawn, held at full until it\'s loosed, the pixels it lights as the player sees it, '
    + 'and no blob of glare; the bow\'s light lit at full draw alone; the crosshair bold at full draw alone, its one '
    + 'beat into it about its middle, none with reduced motion)',
  help: 'every drawn shot of the hero\'s class (the ranger\'s) drawn to full and held there as the player holds it, '
    + 'in each view, the motes on its arrowhead read every frame: none as it\'s drawn, and held at full it glints '
    + 'until it\'s loosed, seen in the view (the frame drawn with the glint and without it, round the arrowhead, '
    + 'every 4 frames of the hold, pictured at its most glaring), and in the close views the crosshair bold held '
    + 'at full alone, swelling into it once about its middle (none with motion reduced); a glint before full '
    + 'draw, missing or gone at full, hardly seen or glaring in a blob, the crosshair bold before full, regular at '
    + 'full, beating other than once or moving off its middle, and one with nothing drawn are problems: '
    + 'tools/lab/out/draw (--class ranger)',
  options: {
    views: {
      kind: 'list',
      usage: 'a,b',
      choices: ['top', 'third', 'first'],
      default: 'top,third,first',
      help: 'the views: top, third, first',
    },
    pictures: {
      kind: 'switch',
      help: 'picture each shot held at full draw, the screen and its arrowhead close, and the crosshair as it\'s '
        + 'drawn, at its beat\'s height and bold (=false: the numbers alone)',
    },
    canary: {
      kind: 'switch',
      help: 'plant the faults the checks must catch: the glint and the crosshair\'s bold shown as the bow is '
        + 'drawn and taken away at full draw, the crosshair swelling about its corner, and its beat with motion '
        + 'reduced',
    },
    at: SETUP_OPTIONS.at,
    facing: SETUP_OPTIONS.facing,
    ...COMMON_OPTIONS,
  },
  countsCompiles: true,
  async each(side, options) {
    // (a view at a time, each set up in it: through the eyes the bow is posed for the view)
    const reports = [];
    for (const view of options.views) {
      const command = {
        fixture: { ...fixtureFrom(options), view },
        pictures: options.pictures !== false,
        canary: Boolean(options.canary),
      };
      reports.push(await side.command('draw', command));
    }
    return {
      text: reports.map((report) => report.text).join('\n'),
      problems: reports.flatMap((report) => report.problems),
      moments: reports.flatMap((report) => report.moments),
    };
  },
  finish(results, options, session) {
    return textWithPictureFiles(results, session.outFor('draw'));
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
