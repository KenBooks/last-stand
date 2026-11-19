// `npm run lab -- hood`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { labError } from '../errors.mjs';
import { REPO } from '../paths.mjs';
import { pictureUrl } from '../pictureFile.mjs';
import { fixtureFrom, picturePairs, asText, problemsIn, textWithMoments } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** the views `hood --ref`'s marks name, as page/hood.ts reads them */
const HOOD_VIEWS = ['front', 'left', 'back'];

/** the sizes a marks file may give (cm, the least and the most), as page/hood.ts reads them */
const HOOD_SIZES = ['brim', 'cheeks', 'clear', 'rise', 'fall'];

/**
 * `hood --ref`: a marks file's references, each view's picture (beside the file) as a data URL with where its eyes and
 * chin are (shares of it across and down): `{ "front": { "picture": "front.png", "eyes": [x, y], "chin": [x, y] } }`;
 * and the sizes the reference was made to, where it gives them (`"sizes": { "brim": [least, most] }`, cm).
 */
function hoodReferences(path) {
  const file = resolve(REPO, path);
  if (!existsSync(file)) throw labError(`hood --ref: no such marks file, ${path}`);
  const { sizes, ...marks } = JSON.parse(readFileSync(file, 'utf8'));
  const references = {};
  for (const [view, mark] of Object.entries(marks)) {
    if (!HOOD_VIEWS.includes(view)) throw labError(`hood --ref: a view of ${HOOD_VIEWS.join(', ')}, not ${view}`);
    const shares = (pair) => Array.isArray(pair) && pair.length === 2 && pair.every((n) => n >= 0 && n <= 1);
    if (!shares(mark.eyes) || !shares(mark.chin)) throw labError(`hood --ref: ${view}'s eyes and chin as [x, y] shares`);
    const picture = resolve(dirname(file), mark.picture);
    references[view] = { url: pictureUrl(picture, 'hood --ref'), eyes: mark.eyes, chin: mark.chin };
  }
  for (const [size, range] of Object.entries(sizes ?? {})) {
    if (!HOOD_SIZES.includes(size)) throw labError(`hood --ref: a size of ${HOOD_SIZES.join(', ')}, not ${size}`);
    const ordered = Array.isArray(range) && range.length === 2 && range.every(Number.isFinite) && range[0] <= range[1];
    if (!ordered) throw labError(`hood --ref: ${size} as [least, most] cm`);
  }
  return { references, sizes };
}

/** `lab hood`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the mage\'s hood against its reference (`--ref marks.json`): its outline from three sides over the '
    + 'reference\'s in the face\'s unit, the head under it in that unit (to lay the reference\'s outline out as a '
    + 'stand-off from the head), its rim, point and capelet against the reference\'s sizes (its marks\' `sizes`), its '
    + 'fullness behind the head at the chin and the nape, its opening round the face from the front and the side '
    + 'against the reference\'s piping (where the rim runs down to the throat, the face shown ahead of it), its '
    + 'seam\'s straightness, the capelet\'s lie and his body through the hood above it, standing and walking, its '
    + 'sway as he walks',
  help: 'the mage\'s hood against its reference: its outline from the front, his left and the back laid over the '
    + 'reference\'s in the face\'s unit (the eyes to the chin), how much they share and how wide and high each is; its '
    + 'rim, point and capelet against the sizes the reference was made to; how much it sways as he walks: '
    + 'tools/lab/out/hood/sheet.png',
  // (`check --every`'s command line: the mage's hood, worn)
  audit: ['--class', 'mage', '--wear', 'helm'],
  options: {
    ref: {
      kind: 'text',
      usage: 'marks.json',
      help: 'the reference: each view\'s picture beside the file, with where its eyes and chin are '
        + '({ "front": { "picture": "front.png", "eyes": [x, y], "chin": [x, y] }, "left": ..., "back": ... })',
    },
    canary: { kind: 'switch', help: 'the hood made narrower: its rim and its outline must read it so' },
    edges: { kind: 'switch', help: 'list each view\'s outline every 0.2 E down, ours beside the reference\'s' },
    rows: { kind: 'switch', help: 'list how far the capelet stands off him row by row, its front, shoulders, back' },
    ...SETUP_OPTIONS,
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    const { references: reference, sizes } = options.ref === undefined ? {} : hoodReferences(options.ref);
    const command = {
      fixture: fixtureFrom(options), reference, sizes, canary: Boolean(options.canary), edges: Boolean(options.edges),
      rows: Boolean(options.rows),
    };
    return side.command('hood', command);
  },
  finish(results, options, session) {
    return textWithMoments(results, session.outFor('hood'), session.browser);
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
