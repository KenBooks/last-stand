// `npm run lab -- match`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { mkdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { labError } from '../errors.mjs';
import { REPO } from '../paths.mjs';
import { compare, marksOf, readReference, screenFor, writeMatch } from '../match.mjs';
import { fixtureFrom, sheetNotes, picturePairs } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** the moment of a strike `match` pictures unless `--share` says (a share of its cast) */
const MATCH_SHARE = 0.5;

/** The moment `match` pictures the hero in (page/sheet.ts's states): standing at rest, or `--skill` at `--share` of
 *  its cast. */
function matchedMoment(options) {
  if (!options.skill) return { states: ['stand'] };
  return { states: ['cast'], skill: options.skill, shares: [options.share ?? MATCH_SHARE] };
}

/** `lab match`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the hero standing through the eyes beside a reference\'s screenshot, on a screen of its shape (the '
    + 'screenshot, his frame, the two blended, the points marked on it and his drawn on each, and how far his are off)',
  help: 'the hero through the eyes, standing or at a moment of a strike, beside a reference\'s screenshot or a '
    + 'frame of its clip (a game his first-person weapons are posed after), on a screen of its shape: the '
    + 'reference, his frame and the two blended, the points marked on it (<picture>.marks.json, a clip\'s frame\'s '
    + '<clip>@<ms>.marks.json: crop, points in and tip, wide, box, the weapon\'s and fist\'s outline) and his own '
    + 'drawn on each, how far his are off and how much of the outlines his frame covers: '
    + 'tools/lab/out/match/<picture>/match.png',
  argument: 'picture',
  options: {
    frame: {
      kind: 'number',
      usage: 's',
      help: 'with a clip (.mp4, .webm, .mkv, .mov), the moment of it matched (cut by ffmpeg into '
        + 'tools/lab/out/match/frames)',
    },
    skill: {
      kind: 'text',
      usage: 'name',
      help: 'a strike pictured rather than the rest: the skill (its key, its behaviour or its name) cast ahead',
    },
    share: {
      kind: 'number',
      usage: '0-1',
      help: 'with --skill, the moment of its cast pictured, a share of it (0.5 by default)',
    },
    fit: {
      kind: 'list',
      usage: 'name.field,...',
      help: 'tunable values searched for the rest that frames his weapon nearest the marks, then pictured, with '
        + 'the --tune that gives it (warriorEyes.oneOn,warriorEyes.oneDir)',
    },
    near: {
      kind: 'list',
      usage: 'a,b',
      choices: ['line', 'wide', 'box', 'outline'],
      default: 'outline',
      help: 'the marks --fit comes near: the weapon\'s line (in and tip), its width, the part of the frame it '
        + 'covers, the outlines of the weapon and the fist (by default: each number alone was matched with the '
        + 'head out of the frame)',
    },
    canary: {
      kind: 'switch',
      help: 'his points taken as the reference\'s moved 10% across: the comparison must find them so; with '
        + '--fit, fitted to his own frame from values moved off it: the fit must find its way back',
    },
    ...SETUP_OPTIONS,
    ...COMMON_OPTIONS,
  },
  check(options) {
    readReference(resolve(options._[0]), options.frame);
    if (options.screen || options.screens) throw labError('match: the screen is the reference\'s shape; no --screen');
    if (options.share !== undefined && !options.skill) throw labError('match --share: a moment of --skill\'s cast');
    if (options.share !== undefined && !(options.share >= 0 && options.share <= 1)) {
      throw labError('match --share: a share of the cast, 0 to 1');
    }
    if (options.fit && options.skill) throw labError('match --fit fits a rest: not with --skill');
  },
  async each(side, options) {
    const reference = readReference(resolve(options._[0]), options.frame);
    await side.showOn(screenFor(reference));
    const fixture = { ...fixtureFrom(options), view: 'first' };
    const fit = options.fit
      ? await side.command('fitRest', {
        fixture,
        marks: marksOf(reference, options.near),
        fields: options.fit,
        canary: Boolean(options.canary),
      })
      : undefined;
    const pictured = fit ? { ...fixture, tune: { ...fixture.tune, ...fit.tune } } : fixture;
    const sheet = await side.command('sheet', { ...matchedMoment(options), views: ['eyes'], fixture: pictured });
    return { ...sheet, fit: fit && { ...fit, to: options.near } };
  },
  async finish(results, options, session) {
    const reference = readReference(resolve(options._[0]), options.frame);
    const runs = results.map(([side, sheet]) => [side.name, sheet]);
    const { text, html } = compare(reference, runs, Boolean(options.canary));
    const dir = session.outFor(join('match', reference.name));
    mkdirSync(dir, { recursive: true });
    const image = join(dir, 'match.png');
    await writeMatch(session.browser, html, runs.length, image);
    return `${text}\n\nmatch: ${relative(REPO, image)}`;
  },
  textOf: sheetNotes,
  pictures: picturePairs,
};
