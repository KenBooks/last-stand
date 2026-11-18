// `npm run lab -- turnaround`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { labError } from '../errors.mjs';
import { pictureUrl } from '../pictureFile.mjs';
import { fixtureFrom, picturePairs, asText, problemsIn, textWithMoments } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `turnaround --panels`: a panel a view, each four shares (left, top, right, bottom), or none for an empty one. */
function panelsOf(text) {
  return String(text).split(';').map((panel) => {
    if (panel.trim() === '') return null;
    const edges = panel.split(',').map(Number);
    const shares = edges.length === 4 && edges.every((edge) => edge >= 0 && edge <= 1);
    if (!shares || edges[0] >= edges[2] || edges[1] >= edges[3]) {
      throw labError(`turnaround --panels: each panel left,top,right,bottom in shares, not ${panel}`);
    }
    return edges;
  });
}

/** `lab turnaround`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the hero standing in a plain studio from a sheet\'s four sides and his head close, with a reference '
    + 'sheet\'s panels in a row under ours (`--ref`, `--panels`), and his triangles (`--parts`: by joint and material)',
  help: 'the hero standing in a plain, lit studio from the front, three-quarters to his right, his right side and '
    + 'his back, and his head close from the front and the side, with how many triangles he is drawn with; '
    + '--ref sets a reference sheet\'s panels in a row under ours: tools/lab/out/turnaround/sheet.png',
  options: {
    ref: { kind: 'text', usage: 'picture', help: 'a reference sheet (PNG, JPEG or WebP) whose panels --panels cuts' },
    panels: {
      kind: 'text',
      usage: 'l,t,r,b;...',
      help: 'the reference\'s panel for each view in order (front, quarter, right, back, face, profile), its '
        + 'edges as shares of the picture; an empty one leaves its place empty',
    },
    canary: { kind: 'switch', help: 'an empty studio pictured too: the measure of what\'s drawn must find nothing' },
    parts: { kind: 'switch', help: 'his triangles by part too: each shown mesh by the joint it hangs from and its material' },
    ...SETUP_OPTIONS,
    ...COMMON_OPTIONS,
  },
  check(options) {
    if (options.panels !== undefined && options.ref === undefined) throw labError('turnaround --panels: with --ref');
    if (options.ref !== undefined && options.panels === undefined) throw labError('turnaround --ref: with --panels');
    if (options.panels !== undefined) panelsOf(options.panels);
  },
  each(side, options) {
    const reference = options.ref === undefined
      ? undefined
      : { url: pictureUrl(options.ref, 'turnaround --ref'), panels: panelsOf(options.panels) };
    const command = { fixture: fixtureFrom(options), reference, canary: Boolean(options.canary), parts: Boolean(options.parts) };
    return side.command('turnaround', command);
  },
  finish(results, options, session) {
    return textWithMoments(results, session.outFor('turnaround'), session.browser);
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
