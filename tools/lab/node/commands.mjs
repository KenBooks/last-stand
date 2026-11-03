// The lab's commands as the session runs them (tools/lab): each one's work on a side, how the sides' results are
// put together and compared, and the problems a result reports. Their options are read and checked by options.mjs.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { runCoop } from './coop.mjs';
import { labError } from './errors.mjs';
import { UI_STATES, WEAPON_STYLES } from './options.mjs';
import { REPO } from './paths.mjs';
import { probeFiles } from './probeFiles.mjs';
import { pictureUrl } from './pictureFile.mjs';
import { writeSheet, writeStack } from './sheetImage.mjs';
import { compare, marksOf, readReference, screenFor, writeMatch } from './match.mjs';

/** the waves `spawns` sets off in each biome unless `--waves` says */
const SPAWN_WAVES = 32;
/** the sets `gear` rolls for each class at each tier unless `--sets` says */
const GEAR_SETS = 400;
/** the rarities loot rolls (src/data/items.ts `RARITIES`) */
const RARITIES = ['common', 'magic', 'rare', 'epic', 'legendary'];

/** A `gear` tier from its option (`epic@30`: a rarity at an item level), checked. */
function gearTier(text) {
  const [rarity, level] = text.split('@');
  const ilvl = Number(level);
  if (!RARITIES.includes(rarity) || !(ilvl >= 1)) {
    throw labError(`gear --tiers: ${text} is not a rarity at an item level (${RARITIES.join(', ')}; epic@30)`);
  }
  return { rarity, ilvl: Math.round(ilvl) };
}

/** The set-up a command asks for (page/lab.ts `Fixture`), from its options. */
export function fixtureFrom(options) {
  const fixture = {};
  if (options.view !== undefined) fixture.view = options.view;
  if (options.at !== undefined) fixture.at = options.at;
  if (options.facing !== undefined) fixture.facing = options.facing;
  if (options.nocked !== undefined) fixture.nocked = options.nocked;
  if (options.gear !== undefined) fixture.gear = options.gear;
  if (options.weapon !== undefined) fixture.weapon = options.weapon;
  if (options.wear !== undefined) fixture.wear = options.wear.filter((part) => part !== 'none');
  if (options.tune !== undefined) fixture.tune = tunesFrom(options.tune);
  return fixture;
}

/** the moment of a strike `match` pictures unless `--share` says (a share of its cast) */
const MATCH_SHARE = 0.5;

/** The moment `match` pictures the hero in (page/sheet.ts's states): standing at rest, or `--skill` at `--share` of
 *  its cast. */
function matchedMoment(options) {
  if (!options.skill) return { states: ['stand'] };
  return { states: ['cast'], skill: options.skill, shares: [options.share ?? MATCH_SHARE] };
}

/** `--tune`'s text as the values it sets, by their paths: `a.b=1,2;c.d=3` sets a.b to [1, 2] and c.d to [3], and
 *  `a.b[0,2]=5` the first and third of a.b's numbers to 5 (the page sets those after the whole lists). */
function tunesFrom(text) {
  const tunes = {};
  for (const part of text.split(';').filter(Boolean)) {
    const [path, values] = part.split('=');
    const numbers = (values ?? '').split(',').map(Number);
    const some = /^[^[]+\[\d+(,\d+)*\]$/.test(path);
    const bad = !path.includes('.') || !values || numbers.some((n) => !Number.isFinite(n));
    if (bad || (path.includes('[') && (!some || numbers.length !== 1))) {
      throw new Error(`lab: --tune: ${part} isn't name.field=numbers (or name.field[i,j]=number)`);
    }
    tunes[path] = numbers;
  }
  return tunes;
}

/** the quality levels `--quality` names (src/data/quality.ts) */
const QUALITY_LEVELS = ['high', 'medium', 'low'];

/** `--quality`'s text as a level and the most pixels the scene renders: `low@518400`, or `low` (no budget: none). */
export function qualityOf(text, option = '--quality') {
  const [level, pixels] = text.split('@');
  const most = pixels === undefined ? undefined : Number(pixels);
  if (!QUALITY_LEVELS.includes(level) || (most !== undefined && !(most > 0))) {
    throw labError(`${option}: ${text} isn't a level (${QUALITY_LEVELS.join(', ')}) and its pixels (low@518400)`);
  }
  return { level, pixels: most };
}

/**
 * The frames `light` measures (page/light.ts `LightScenario`): each biome in each view, the close views at each of
 * the facings, the top view at the first.
 */
function lightScenarios(options) {
  const scenarios = [];
  for (const biome of options.biomes) {
    for (const view of options.views) {
      const facings = view === 'top' ? options.facings.slice(0, 1) : options.facings;
      for (const facing of facings) scenarios.push({ biome, view, facing: Number(facing) });
    }
  }
  return scenarios;
}

/** the strikes `trail` casts unless `--strikes` says: every one of the warrior's, Rending Cleave each way he holds his
 *  weapons, each other by a way it's swung (Thunder Crescent's two-hander, Twin Fangs' two blades); Bull Rush strikes
 *  with the body, its weapons unswung */
const TRAIL_STRIKES = [
  'cleave@oneHanded', 'cleave@shield', 'cleave@twoHanded', 'cleave@dual', 'powerStrike@twoHanded',
  'crescent@twoHanded', 'tempest@shield', 'twinFangs@dual',
];

/** A strike as `trail --strikes` writes it (`cleave@twoHanded`): its skill, and the way the weapons are held for it. */
function strikeFrom(written) {
  const [skill, style] = written.split('@');
  return style === undefined ? { skill } : { skill, style };
}

/** The casts `cast` measures (page/cast.ts `CastOptions`, its canary aside): the skill in each biome and view. */
function castScenarios(options) {
  const scenarios = [];
  for (const biome of options.biomes) {
    for (const view of options.views) {
      scenarios.push({
        skill: options._[0],
        biome,
        view,
        facing: options.facing ?? 0,
        at: options.at,
        foes: options.foes ?? 4,
        times: options.times.map(Number),
        pictures: options.pictures !== false,
        what: options.what?.map(Number),
        gear: options.gear,
        weapon: options.weapon,
        tune: fixtureFrom(options).tune,
      });
    }
  }
  return scenarios;
}

/** A sheet's notes as text: how it was set up, then each moment's notes. */
function sheetNotes(sheet) {
  const moments = sheet.moments.map((moment) => {
    const lines = moment.notes.map((note) => `    ${note}`);
    return `  ${moment.label}\n${lines.join('\n')}`;
  });
  return `set up as ${JSON.stringify(sheet.setup)}\n${moments.join('\n')}`;
}

/**
 * The pictures two sheets (or two reports with moments) took of the same moment from the same view, paired, each
 * pair named for the verdict.
 */
function picturePairs(before, after) {
  const pairs = [];
  for (const moment of after?.moments ?? []) {
    const other = (before?.moments ?? []).find((candidate) => candidate.label === moment.label);
    if (!other) continue;
    for (const tile of moment.tiles) {
      const match = other.tiles.find((candidate) => candidate.view === tile.view);
      if (match) pairs.push({ name: `${moment.label} / ${tile.view}`, before: match.png, after: tile.png });
    }
  }
  return pairs;
}

/** Whether a result is a report (page/lab.ts `Report`): its text and the problems it found. */
function isReport(result) {
  return typeof result?.text === 'string' && Array.isArray(result?.problems);
}

/** A probe's or an expression's result as text: as it is, a report's text, or JSON. */
function asText(result) {
  if (typeof result === 'string') return result;
  if (isReport(result)) return result.text;
  return JSON.stringify(result, null, 2) ?? String(result);
}

/** The problems a result reports: a report's, none otherwise. */
function problemsIn(result) {
  return isReport(result) ? result.problems : [];
}

/**
 * Writes the moments the sides' results pictured (a report's `moments`) as one sheet in `dir`; returns its path, or
 * null when none pictured any.
 */
async function writeMoments(results, dir, browser, name = 'sheet.png') {
  const runs = results
    .filter(([, result]) => result?.moments?.length)
    .map(([side, result]) => [side.name, { moments: result.moments }]);
  if (runs.length === 0) return null;
  mkdirSync(dir, { recursive: true });
  const image = join(dir, name);
  const views = Math.max(...runs.flatMap(([, { moments }]) => moments.map((moment) => moment.tiles.length)));
  await writeSheet(browser, runs, views, image);
  return image;
}

/**
 * Each side's text under its name, and a sheet for each of each side's moments, written in `dir`: `film-1.png` on for
 * this tree's, `film-main-1.png` on for the other side's (a turn's `filePrefix` after `film-`). For films: two sides'
 * in one sheet, or eight scenarios' of one side, were a page too big for the browser, which closed.
 */
async function textWithSheetEach(results, dir, browser) {
  const text = results.map(([side, result]) => `${side.name}\n${asText(result)}`).join('\n\n');
  const images = [];
  for (const [side, result] of results) {
    const prefix = `film-${side.filePrefix}`;
    const moments = result?.moments ?? [];
    for (const [index, moment] of moments.entries()) {
      const one = [side, { ...result, moments: [moment] }];
      const image = await writeMoments([one], dir, browser, `${prefix}${index + 1}.png`);
      if (image) images.push(relative(REPO, image));
    }
  }
  return images.length ? `${text}\n\npictures: ${images.join(', ')}` : text;
}

/** A moment's group, for a sheet of its own: its label up to its colon (`holding shield: from his left`). */
const groupOf = (moment) => moment.label.split(':')[0];

/** A group's name as a file name: lowercase words joined by dashes. */
const fileNameOf = (group) => group.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Each side's text under its name, and a sheet for each group of each side's moments (`groupOf`), written in `dir`:
 * `<group>.png` for this tree's, `main-<group>.png` for the other side's (a turn's `filePrefix` first). A run of the
 * warrior's four ways of holding his weapons in one sheet was a page too big for the browser, which closed.
 */
async function textWithSheetsByGroup(results, dir, browser) {
  const text = results.map(([side, result]) => `${side.name}\n${asText(result)}`).join('\n\n');
  const images = [];
  for (const [side, result] of results) {
    const prefix = side.filePrefix;
    const groups = [...new Set((result?.moments ?? []).map(groupOf))];
    for (const group of groups) {
      const moments = result.moments.filter((moment) => groupOf(moment) === group);
      const name = `${prefix}${fileNameOf(group)}.png`;
      const image = await writeMoments([[side, { ...result, moments }]], dir, browser, name);
      if (image) images.push(relative(REPO, image));
    }
  }
  return images.length ? `${text}\n\npictures: ${images.join(', ')}` : text;
}

/**
 * Each side's text under its name, and each picture of its moments as a PNG of its own at its full size, written in
 * `dir` (emptied first) as `<filePrefix><moment>.png` (`-<view>` after a moment pictured from more than one view):
 * a 4K screen's pictures put on one sheet were a page too big for the browser, which closed.
 */
function textWithPictureFiles(results, dir) {
  const text = results.map(([side, result]) => `${side.name}\n${asText(result)}`).join('\n\n');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const written = [];
  for (const [side, result] of results) {
    for (const moment of result?.moments ?? []) {
      for (const tile of moment.tiles) {
        const view = moment.tiles.length > 1 ? `-${tile.view}` : '';
        const name = `${side.filePrefix}${fileNameOf(moment.label)}${view}.png`;
        const base64 = tile.png.slice(tile.png.indexOf(',') + 1);
        writeFileSync(join(dir, name), Buffer.from(base64, 'base64'));
        written.push(name);
      }
    }
  }
  return written.length ? `${text}\n\n${pictureList(written, dir)}` : text;
}

/** the most picture files a run's text names one by one */
const PICTURES_NAMED = 24;

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

/** Where `written` went, each named, or past `PICTURES_NAMED` how many and the first and last (lab neck wrote 216). */
function pictureList(written, dir) {
  const where = relative(REPO, dir);
  if (written.length <= PICTURES_NAMED) return `pictures in ${where}: ${written.join(', ')}`;
  return `${written.length} pictures in ${where}: ${written[0]} to ${written[written.length - 1]}`;
}

/**
 * In an A/B, each moment both sides pictured whose label passes `wanted`, the other side's above this tree's in one
 * picture at their own sizes (`writeStack`), written in `dir` as `<label>--ab.png`; the files written.
 */
async function writeStacks(results, dir, browser, wanted) {
  if (results.length < 2) return [];
  const written = [];
  const [first, ...others] = results;
  for (const moment of first[1]?.moments ?? []) {
    if (!wanted(moment.label)) continue;
    const momentOf = (result) => result?.moments?.find((m) => m.label === moment.label);
    const sides = [first, ...others].map(([side, result]) => [side, momentOf(result)]);
    if (sides.some(([, found]) => !found || found.tiles.length !== 1)) continue;
    const pictures = sides.map(([side, found]) => ({ caption: side.name, ...found.tiles[0] }));
    const name = `${fileNameOf(moment.label)}--ab.png`;
    await writeStack(browser, pictures, join(dir, name));
    written.push(name);
  }
  return written;
}

/**
 * Each side's text under its name, and a sheet of each side's moments, written in `dir`: `sheet.png` for this tree's,
 * `main-sheet.png` for the other side's (a turn's `filePrefix` first). The ranger's range, two sides of 1329 x 8446 px
 * side by side in one sheet, was a page too big for the browser, which closed, and its A/B never ran to the end.
 */
async function textWithSheetPerSide(results, dir, browser) {
  const text = results.map(([side, result]) => `${side.name}\n${asText(result)}`).join('\n\n');
  const images = [];
  for (const [side, result] of results) {
    const image = await writeMoments([[side, result]], dir, browser, `${side.filePrefix}sheet.png`);
    if (image) images.push(relative(REPO, image));
  }
  return images.length ? `${text}\n\npictures: ${images.join(', ')}` : text;
}

/** Each side's text under its name, and the sheet of the moments they pictured, written in `dir` (when any did). */
async function textWithMoments(results, dir, browser) {
  const text = results.map(([side, result]) => `${side.name}\n${asText(result)}`).join('\n\n');
  const image = await writeMoments(results, dir, browser);
  return image ? `${text}\n\npictures: ${relative(REPO, image)}` : text;
}

/** A probe module's path relative to the repo, with forward slashes; throws unless it's a file under the repo. */
function probePath(file) {
  const path = relative(REPO, resolve(REPO, file));
  if (path.startsWith('..') || isAbsolute(path)) throw labError(`probe: ${file} is not under the repo`);
  if (!existsSync(join(REPO, path))) throw labError(`probe: there is no ${file}`);
  return path.split('\\').join('/');
}

/**
 * The commands, by name:
 * - `check(options)`, when there is one, throws at what's wrong with them before anything boots;
 * - `each(side, options, session)` runs it on one side (its page booted) and returns its result;
 * - `finish(results, options, session)`, when there is one, puts the sides' results together as text (else each
 *   side's text is shown under its name): `results` pairs each turn (`session.turnsFor`: its `name`, and the
 *   `filePrefix` its files' names start with) with its result;
 * - `textOf(result)` is the result as text, which an A/B compares line by line;
 * - `problemsOf(result)` the problems it found, which fail the command;
 * - `countsOf(result)`, when there is one, what it counted by name, which a check adds up over a hero's jobs;
 * - `pictures(before, after)` pairs the pictures an A/B compares, for a command that takes them;
 * - `countsCompiles`, for a command that counts the shaders compiled after loading: a check runs it on a kept page
 *   only while the page has compiled nothing since it loaded (side.mjs `ready`);
 * - `keepsPage` (true, `'own'`, or either by the options), for a command a check may run on a page jobs before it
 *   ran on (`pageKind`), each of its set-ups in a check building the hero afresh from the boot's storage in a run of
 *   its own (`afresh`): one whose results were shown to be the same there as on a page booted for each job, with
 *   `lab check --reuse=false` and `--like`. True: a page any such command ran on; `'own'`: one its own jobs alone ran
 *   on (on a page kept from the gait's and the eyes' jobs, Twin Fangs' blows dealt 10 to 40 more; a cast after
 *   other casts, once the biomes' emitters started again at each set-up, src/world/runPhase.ts). `log` runs on pages
 *   of its own: it lists the game's clock, which runs on through its cases there (each set-up afresh starts it again),
 *   and its cases follow on from each other.
 */
export const COMMANDS = {
  sheet: {
    each(side, options) {
      return side.command('sheet', {
        states: options.states,
        views: options.views,
        fixture: fixtureFrom(options),
        focus: options.focus,
        look: options.look,
        skill: options.skill,
        shares: options.shares?.map(Number),
      });
    },
    async finish(results, options, session) {
      const runs = results.map(([side, sheet]) => [side.name, sheet]);
      const dir = session.outFor(join('sheets', options.tag));
      mkdirSync(dir, { recursive: true });
      const image = join(dir, 'sheet.png');
      await writeSheet(session.browser, runs, options.views.length, image);
      const notes = runs.map(([name, sheet]) => `${name}, ${sheetNotes(sheet)}`);
      writeFileSync(join(dir, 'notes.txt'), notes.join('\n\n'));
      return `${notes.join('\n\n')}\n\nsheet: ${relative(REPO, image)}`;
    },
    textOf: sheetNotes,
    pictures: picturePairs,
  },

  carry: {
    keepsPage: true,
    each(side, options) {
      const canary = Boolean(options.canary);
      return side.command('carry', { fixture: fixtureFrom(options), canary, frames: Boolean(options.frames) });
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  gait: {
    keepsPage: true,
    each(side, options) {
      return side.command('gait', {
        scenarios: options.scenarios,
        frames: Boolean(options.frames),
        trace: Boolean(options.trace),
        span: options.span,
        films: options.films !== false,
        offsets: (options.offsets ?? [0]).map(Number),
      });
    },
    check(options) {
      const wrong = (options.offsets ?? []).find((offset) => !Number.isInteger(Number(offset)) || Number(offset) < 0);
      if (wrong !== undefined) throw labError(`gait --offsets: ${wrong} is not a whole number of frames`);
    },
    finish(results, options, session) {
      return textWithSheetEach(results, session.outFor('gait'), session.browser);
    },
    textOf: asText,
    problemsOf: problemsIn,
    countsOf: (result) => result.counts,
    // (an A/B compares the reports, not the films: two sides' 48 frames each, loaded to compare, took the browser down)
  },

  coop: {
    each(side, options) {
      const { scenarios, ping, jitter } = options;
      return runCoop(side, { scenarios, ping, jitter, pictures: Boolean(options.pictures) });
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  form: {
    keepsPage: true,
    each(side, options) {
      const listed = { canary: Boolean(options.canary), frames: Boolean(options.frames) };
      return side.command('form', { gear: options.gear, ...listed, pictures: options.pictures !== false });
    },
    finish(results, options, session) {
      return textWithSheetsByGroup(results, session.outFor('form'), session.browser);
    },
    textOf: asText,
    problemsOf: problemsIn,
    pictures: picturePairs,
  },

  stops: {
    keepsPage: true,
    each(side, options) {
      const listed = { frames: Boolean(options.frames), trace: Boolean(options.trace) };
      return side.command('stops', { scenarios: options.scenarios, only: options.only, ...listed });
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  range: {
    keepsPage: true,
    each(side, options) {
      return side.command('range', {
        scenarios: options.scenarios,
        canary: Boolean(options.canary),
        frames: Boolean(options.frames),
        trace: Boolean(options.trace),
        span: options.span,
        skill: options.skill,
        foe: options.foe,
        foeAt: options.ahead,
        biome: options.biome,
        at: options.at,
        facing: options.facing,
        gear: options.gear,
        weapon: options.weapon,
        tune: fixtureFrom(options).tune,
      });
    },
    finish(results, options, session) {
      return textWithSheetPerSide(results, session.outFor('range'), session.browser);
    },
    textOf: asText,
    problemsOf: problemsIn,
    pictures: picturePairs,
  },

  feet: {
    keepsPage: true,
    each(side, options) {
      return side.command('feet', {
        scenarios: options.scenarios,
        canary: Boolean(options.canary),
        frames: Boolean(options.frames),
        trace: Boolean(options.trace),
      });
    },
    finish(results, options, session) {
      return textWithMoments(results, session.outFor('feet'), session.browser);
    },
    textOf: asText,
    problemsOf: problemsIn,
    pictures: picturePairs,
  },

  ui: {
    async each(side, options) {
      // (a state at a time, in the order they run: a 4K screen's ten pictures sent back at once closed the browser)
      const states = UI_STATES.filter((state) => (options.states ?? UI_STATES).includes(state));
      const reports = [];
      for (const state of states) {
        const command = { state, hdr: Boolean(options.hdr), canary: Boolean(options.canary) };
        reports.push(await side.command('ui', command));
      }
      return {
        text: reports.map((report) => report.text).join('\n'),
        problems: reports.flatMap((report) => report.problems),
        moments: reports.flatMap((report) => report.moments),
      };
    },
    finish(results, options, session) {
      return textWithPictureFiles(results, session.outFor('ui'));
    },
    textOf: asText,
    problemsOf: problemsIn,
    pictures: picturePairs,
  },

  wind: {
    each(side, options) {
      const command = { resize: options.resize ?? [], canary: Boolean(options.canary) };
      return side.command('wind', command);
    },
    finish(results, options, session) {
      return textWithPictureFiles(results, session.outFor('wind'));
    },
    textOf: asText,
    problemsOf: problemsIn,
    pictures: picturePairs,
  },

  light: {
    check(options) {
      const wrong = options.facings.find((facing) => !Number.isFinite(Number(facing)));
      if (wrong !== undefined) throw labError(`light --facings: ${wrong} is not a number of degrees`);
    },
    async each(side, options) {
      // (a frame at a time, each on its own: its pictures sent back with it)
      const reports = [];
      for (const scenario of lightScenarios(options)) {
        const canary = Boolean(options.canary) && reports.length === 0;
        const hdr = options.hdr ? { paper: options.paper ?? 1, peak: options.peak ?? 3 } : undefined;
        const command = { scenario, pictures: options.pictures !== false, canary, hdr };
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
  },

  fire: {
    check(options) {
      if (!(options.seconds > 0)) throw labError(`fire --seconds: ${options.seconds} is not a length of time`);
    },
    async each(side, options) {
      // (a biome at a time, each on its own: its pictures sent back with it)
      const reports = [];
      for (const biome of options.biomes) {
        const command = {
          biome,
          seconds: options.seconds,
          cost: Boolean(options.cost),
          canary: Boolean(options.canary),
        };
        reports.push(await side.command('fire', command));
      }
      return {
        text: reports.map((report) => report.text).join('\n'),
        problems: reports.flatMap((report) => report.problems),
        moments: reports.flatMap((report) => report.moments),
      };
    },
    finish(results, options, session) {
      return textWithPictureFiles(results, session.outFor('fire'));
    },
    textOf: asText,
    problemsOf: problemsIn,
    pictures: picturePairs,
  },

  cast: {
    countsCompiles: true,
    keepsPage: 'own',
    check(options) {
      const wrong = options.times.find((time) => !(Number(time) >= 0));
      if (wrong !== undefined) throw labError(`cast --times: ${wrong} is not a number of seconds`);
      const what = options.what?.map(Number);
      if (what && (what.length !== 3 || what.some((value) => !(value >= 0)))) {
        throw labError(`cast --what: ${options.what.join(',')} is not a moment and a point (s,x,y)`);
      }
    },
    async each(side, options) {
      // (a biome and view at a time, each on its own: its pictures sent back with it)
      const reports = [];
      for (const scenario of castScenarios(options)) {
        const canary = Boolean(options.canary) && reports.length === 0;
        reports.push(await side.command('cast', { ...scenario, canary }));
      }
      return {
        text: reports.map((report) => report.text).join('\n'),
        problems: reports.flatMap((report) => report.problems),
        moments: reports.flatMap((report) => report.moments),
      };
    },
    finish(results, options, session) {
      return textWithPictureFiles(results, session.outFor(join('cast', options._[0])));
    },
    textOf: asText,
    problemsOf: problemsIn,
    pictures: picturePairs,
  },

  perf: {
    check(options) {
      if (options.foes !== undefined && !(options.foes >= 0)) throw labError('perf --foes: 0 or more');
      if (options.apart !== undefined && !(options.apart > 0)) throw labError('perf --apart: more than 0 s');
      if (options.after !== undefined && !(options.after > 0)) throw labError('perf --after: more than 0 s');
      if (options.throttle !== undefined && !(options.throttle >= 1)) throw labError('perf --throttle: 1 or more');
      if (options.quality !== undefined) qualityOf(options.quality);
    },
    each(side, options) {
      const command = {
        casts: options._[0].split(','),
        biome: options.biome ?? 'forest',
        view: options.view ?? 'top',
        facing: options.facing ?? 0,
        at: options.at,
        gear: options.gear,
        foes: options.foes === undefined ? 10 : Math.round(options.foes),
        apart: options.apart ?? 1,
        after: options.after ?? 4,
        quality: options.quality === undefined ? undefined : qualityOf(options.quality),
        throttle: options.throttle ?? 1,
        frames: Boolean(options.frames),
        canary: Boolean(options.canary),
      };
      return side.command('perf', command);
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  health: {
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
  },

  envcost: {
    check(options) {
      if (!(options.rounds >= 1)) throw labError(`envcost --rounds: ${options.rounds} is not a count of rounds`);
    },
    async each(side, options) {
      const reports = [];
      for (const biome of options.biomes) {
        for (const view of options.views) {
          const command = { biome, view, rounds: options.rounds, canary: Boolean(options.canary) };
          reports.push(await side.command('envCost', command));
        }
      }
      return {
        text: reports.map((report) => report.text).join('\n'),
        problems: reports.flatMap((report) => report.problems),
      };
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  haze: {
    check(options) {
      const wrong = options.facings.find((facing) => !Number.isFinite(Number(facing)));
      if (wrong !== undefined) throw labError(`haze --facings: ${wrong} is not a number of degrees`);
    },
    each(side, options) {
      const command = {
        biome: options.biome ?? 'forest',
        part: options.part ?? 'weapons',
        view: options.view ?? 'first',
        facings: options.facings.map(Number),
        gear: options.gear,
        weapon: options.weapon,
        at: options.at,
        pictures: options.pictures !== false,
        canary: Boolean(options.canary),
      };
      return side.command('haze', command);
    },
    finish(results, options, session) {
      return textWithPictureFiles(results, session.outFor('haze'));
    },
    textOf: asText,
    problemsOf: problemsIn,
    pictures: picturePairs,
  },

  draw: {
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
  },

  blink: {
    each(side, options) {
      const command = {
        fixture: fixtureFrom(options),
        pictures: options.pictures !== false,
        canary: Boolean(options.canary),
      };
      return side.command('blink', command);
    },
    finish(results, options, session) {
      return textWithPictureFiles(results, session.outFor('blink'));
    },
    textOf: asText,
    problemsOf: problemsIn,
    pictures: picturePairs,
  },

  death: {
    countsCompiles: true,
    each(side, options) {
      const command = {
        fixture: fixtureFrom(options),
        skills: options.skills ?? [],
        pictures: options.pictures !== false,
        canary: Boolean(options.canary),
        trace: Boolean(options.trace),
      };
      return side.command('death', command);
    },
    finish(results, options, session) {
      return textWithPictureFiles(results, session.outFor('death'));
    },
    textOf: asText,
    problemsOf: problemsIn,
    pictures: picturePairs,
  },

  hits: {
    keepsPage: 'own',
    check(options) {
      if (options.apart !== undefined && !(options.apart > 0)) throw labError('hits --apart: more than 0 s');
    },
    each(side, options) {
      const command = {
        fixture: fixtureFrom(options),
        skills: options._[0].split(','),
        apart: options.apart,
        than: options.than,
        canary: Boolean(options.canary),
      };
      return side.command('hits', command);
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  log: {
    each(side, options) {
      const command = {
        fixture: fixtureFrom(options),
        skills: options.skills ?? [],
        canary: Boolean(options.canary),
      };
      return side.command('log', command);
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  tooltips: {
    each(side, options) {
      const command = {
        fixture: fixtureFrom(options),
        skills: options.skills ?? [],
        canary: Boolean(options.canary),
      };
      return side.command('tooltips', command);
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  spin: {
    each(side, options) {
      const command = {
        fixture: fixtureFrom(options),
        views: options.views,
        canary: Boolean(options.canary),
      };
      return side.command('spin', command);
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  cursor: {
    each(side, options) {
      const command = {
        fixture: fixtureFrom(options),
        views: options.views,
        canary: Boolean(options.canary),
      };
      return side.command('cursor', command);
    },
    finish(results, options, session) {
      return textWithPictureFiles(results, session.outFor('cursor'));
    },
    textOf: asText,
    problemsOf: problemsIn,
    pictures: picturePairs,
  },

  throws: {
    each(side, options) {
      const command = {
        fixture: fixtureFrom(options),
        canary: Boolean(options.canary),
        trace: Boolean(options.trace),
      };
      return side.command('throws', command);
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  evade: {
    check(options) {
      if (options.tries !== undefined && !(options.tries >= 3)) throw labError('evade --tries: at least 3');
    },
    each(side, options) {
      const command = {
        fixture: fixtureFrom(options),
        skills: options.skills ?? [],
        tries: Math.round(options.tries ?? 30),
        canary: Boolean(options.canary),
        trace: Boolean(options.trace),
      };
      return side.command('evade', command);
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  rush: {
    keepsPage: true,
    each(side, options) {
      const command = {
        fixture: fixtureFrom(options),
        pictures: options.pictures !== false,
        canary: Boolean(options.canary),
        scenarios: options.scenarios,
        dummies: Boolean(options.dummies),
      };
      return side.command('rush', command);
    },
    finish(results, options, session) {
      return textWithPictureFiles(results, session.outFor('rush'));
    },
    textOf: asText,
    problemsOf: problemsIn,
    pictures: picturePairs,
  },

  held: {
    countsCompiles: true,
    each(side, options) {
      const command = {
        fixture: fixtureFrom(options),
        pictures: options.pictures !== false,
        canary: Boolean(options.canary),
      };
      return side.command('held', command);
    },
    finish(results, options, session) {
      return textWithPictureFiles(results, session.outFor('held'));
    },
    textOf: asText,
    problemsOf: problemsIn,
    pictures: picturePairs,
  },

  gear: {
    check(options) {
      for (const tier of options.tiers) gearTier(tier);
      if (options.sets !== undefined && !(options.sets >= 1)) throw labError('gear --sets: at least 1');
    },
    each(side, options) {
      const command = {
        tiers: options.tiers.map(gearTier),
        sets: Math.round(options.sets ?? GEAR_SETS),
        canary: Boolean(options.canary),
      };
      return side.command('gear', command);
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  crowd: {
    check(options) {
      if (options.count !== undefined && !(options.count >= 1)) throw labError('crowd --count: at least 1');
      for (const rate of options.throttles ?? []) {
        if (!(Number(rate) >= 1)) throw labError(`crowd --throttles: ${rate} is no slowdown (1 or more)`);
      }
      for (const rate of options.rates ?? []) {
        if (!(Number(rate) > 0)) throw labError(`crowd --rates: ${rate} is no frame rate`);
      }
    },
    each(side, options) {
      const command = {
        fixture: fixtureFrom(options),
        count: options.count === undefined ? undefined : Math.round(options.count),
        throttles: options.throttles?.map(Number),
        rates: options.rates?.map(Number),
        skill: options.skill,
        canary: Boolean(options.canary),
      };
      return side.command('crowd', command);
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  compiles: {
    countsCompiles: true,
    each(side, options) {
      const command = {
        biomes: options.biomes,
        view: options.view ?? 'top',
        gear: options.gear,
        weapon: options.weapon,
        canary: Boolean(options.canary),
        switchTo: options.switch,
      };
      return side.command('compiles', command);
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  programs: {
    each(side, options) {
      return side.command('programs', { canary: Boolean(options.canary), cost: Boolean(options.cost) });
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  maps: {
    check(options) {
      if (options.runs !== undefined && !(options.runs >= 1)) throw labError('maps --runs: at least 1');
    },
    each(side, options) {
      const command = {
        maps: options.maps,
        runs: options.runs ?? 1,
        pictures: Boolean(options.pictures),
        canary: Boolean(options.canary),
      };
      return side.command('maps', command);
    },
    finish(results, options, session) {
      return textWithSheetsByGroup(results, session.outFor('maps'), session.browser);
    },
    textOf: asText,
    problemsOf: problemsIn,
    pictures: picturePairs,
  },

  tiles: {
    each(side, options) {
      const command = {
        biomes: options.biomes,
        maps: options.maps,
        pictures: Boolean(options.pictures),
        canary: Boolean(options.canary),
      };
      return side.command('tiles', command);
    },
    finish(results, options, session) {
      return textWithSheetsByGroup(results, session.outFor('tiles'), session.browser);
    },
    textOf: asText,
    problemsOf: problemsIn,
    pictures: picturePairs,
  },

  winding: {
    each(side, options) {
      const command = {
        models: options.models,
        biomes: options.biomes,
        canary: Boolean(options.canary),
      };
      return side.command('winding', command);
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  wall: {
    check(options) {
      if (options.angles !== undefined && !(options.angles >= 1)) throw labError('wall --angles: at least 1');
    },
    each(side, options) {
      const command = {
        biomes: options.biomes,
        angles: Math.round(options.angles ?? 48),
        canary: Boolean(options.canary),
      };
      return side.command('wall', command);
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  rim: {
    each(side, options) {
      return side.command('rim', { biomes: options.biomes, canary: Boolean(options.canary) });
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  beyond: {
    check(options) {
      if (options.angles !== undefined && !(options.angles >= 1)) throw labError('beyond --angles: at least 1');
    },
    each(side, options) {
      const command = {
        biomes: options.biomes,
        angles: Math.round(options.angles ?? 8),
        canary: Boolean(options.canary),
      };
      return side.command('beyond', command);
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  trees: {
    each(side, options) {
      return side.command('trees', { biomes: options.biomes, canary: Boolean(options.canary) });
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  columns: {
    each(side, options) {
      return side.command('columns', { seeds: options.seeds?.map(Number), canary: Boolean(options.canary) });
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  shadows: {
    each(side, options) {
      const command = { views: options.views, canary: Boolean(options.canary), cost: Boolean(options.cost) };
      return side.command('shadows', command);
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  draws: {
    check(options) {
      if (options.count !== undefined && !(options.count >= 0)) throw labError('draws --count: 0 or more');
      if (options.rows !== undefined && !(options.rows >= 1)) throw labError('draws --rows: at least 1');
    },
    each(side, options) {
      const command = {
        fixture: fixtureFrom(options),
        count: options.count === undefined ? undefined : Math.round(options.count),
        rows: options.rows === undefined ? undefined : Math.round(options.rows),
        biome: options.biome,
        canary: Boolean(options.canary),
      };
      return side.command('draws', command);
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  weapons: {
    each(side, options) {
      const command = {
        fixture: fixtureFrom(options),
        weapons: options.weapons,
        canary: Boolean(options.canary),
      };
      return side.command('weapons', command);
    },
    finish(results, options, session) {
      return textWithMoments(results, session.outFor('weapons'), session.browser);
    },
    textOf: asText,
    problemsOf: problemsIn,
    pictures: picturePairs,
  },

  hands: {
    each(side, options) {
      const command = {
        fixture: fixtureFrom(options),
        poses: options.poses,
        views: options.views,
        look: options.look,
        glove: options.glove,
        canary: Boolean(options.canary),
      };
      return side.command('hands', command);
    },
    finish(results, options, session) {
      return textWithMoments(results, session.outFor('hands'), session.browser);
    },
    textOf: asText,
    problemsOf: problemsIn,
    pictures: picturePairs,
  },

  neck: {
    each(side, options) {
      const command = {
        classes: options.classes,
        dresses: options.dresses,
        poses: options.poses,
        look: options.look ?? 'lit',
        canary: Boolean(options.canary),
      };
      return side.command('neck', command);
    },
    finish(results, options, session) {
      // (a file a picture: a sheet of them all, 90 close-ups, was more than the browser would lay out)
      return textWithPictureFiles(results, session.outFor('neck'));
    },
    textOf: asText,
    problemsOf: problemsIn,
    pictures: picturePairs,
  },

  hood: {
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
  },

  turnaround: {
    check(options) {
      if (options.panels !== undefined && options.ref === undefined) throw labError('turnaround --panels: with --ref');
      if (options.ref !== undefined && options.panels === undefined) throw labError('turnaround --ref: with --panels');
      if (options.panels !== undefined) panelsOf(options.panels);
    },
    each(side, options) {
      const reference = options.ref === undefined
        ? undefined
        : { url: pictureUrl(options.ref, 'turnaround --ref'), panels: panelsOf(options.panels) };
      const command = { fixture: fixtureFrom(options), reference, canary: Boolean(options.canary) };
      return side.command('turnaround', command);
    },
    finish(results, options, session) {
      return textWithMoments(results, session.outFor('turnaround'), session.browser);
    },
    textOf: asText,
    problemsOf: problemsIn,
    pictures: picturePairs,
  },

  eyes: {
    // (a two-hander's too, since each set-up starts a run of its own: a page kept from the jobs before had turned its
    // forearm past its range on 9 frames more of a cleave with pauses; but his Steel Tempest on a page of its own: on
    // a kept one, the left wrist at the spin's fastest read a degree to five otherwise, not found yet)
    keepsPage: (options) => options.gear !== 'twoHanded' || options._?.[0] !== 'tempest',
    check(options) {
      if (options.times !== undefined && !(options.times >= 1)) throw labError('eyes --times: at least 1');
      if (options.every !== undefined && !(options.every >= 1)) throw labError('eyes --every: at least 1');
      if (options.cast !== undefined && !(options.cast >= 1 && options.cast <= (options.times ?? 1))) {
        throw labError('eyes --cast: one of the casts, 1 to --times');
      }
      if (options.apart !== undefined && !(options.apart >= 0)) throw labError('eyes --apart: seconds, 0 or more');
    },
    each(side, options) {
      const command = {
        fixture: fixtureFrom(options),
        skill: options._[0],
        times: Math.round(options.times ?? 1),
        apart: options.apart ?? null,
        every: Math.round(options.every ?? 2),
        cast: options.cast === undefined ? null : Math.round(options.cast),
        close: options.close ?? [],
        film: options.film !== false,
        frames: Boolean(options.frames),
        span: options.span ?? null,
        canary: Boolean(options.canary),
      };
      return side.command('eyes', command);
    },
    async finish(results, options, session) {
      const dir = session.outFor(join('eyes', options._[0]));
      const text = textWithPictureFiles(results, dir);
      // (in an A/B, each strike's strip of frames, the other side's above this tree's)
      const stacked = await writeStacks(results, dir, session.browser, (label) => label.endsWith(': the strike'));
      return stacked.length ? `${text}\nside by side: ${stacked.join(', ')}` : text;
    },
    textOf: asText,
    problemsOf: problemsIn,
    pictures: picturePairs,
  },

  match: {
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
  },

  shots: {
    check(options) {
      if (options.shots !== undefined && !(options.shots >= 1)) throw labError('shots --shots: at least 1');
    },
    each(side, options) {
      const command = {
        fixture: fixtureFrom(options),
        views: options.views,
        shots: Math.round(options.shots ?? 12),
        canary: Boolean(options.canary),
      };
      return side.command('shots', command);
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  hall: {
    each(side, options) {
      const command = {
        gear: options.gear,
        weapon: options.weapon,
        frames: Boolean(options.frames),
        canary: Boolean(options.canary),
        glow: Boolean(options.glow),
        pictures: options.pictures !== false,
      };
      return side.command('hall', command);
    },
    finish(results, options, session) {
      return textWithPictureFiles(results, session.outFor('hall'));
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  glance: {
    each(side, options) {
      const command = {
        seconds: options.seconds,
        canary: Boolean(options.canary),
      };
      return side.command('glance', command);
    },
    finish(results, options, session) {
      return textWithMoments(results, session.outFor('glance'), session.browser);
    },
    textOf: asText,
    problemsOf: problemsIn,
    pictures: picturePairs,
  },

  poses: {
    each(side, options) {
      return side.command('poses', { fixture: fixtureFrom(options), canary: Boolean(options.canary) });
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  coat: {
    each(side, options) {
      const command = {
        gear: options.gear,
        weapon: options.weapon,
        seconds: options.seconds,
        frames: Boolean(options.frames),
        rates: options.rates?.map(Number),
        canary: Boolean(options.canary),
      };
      return side.command('coat', command);
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  touch: {
    each(side, options) {
      return side.command('touch', { fixture: fixtureFrom(options), canary: Boolean(options.canary) });
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  tap: {
    each(side, options) {
      return side.command('tap', { fixture: fixtureFrom(options), canary: Boolean(options.canary) });
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  practice: {
    each(side, options) {
      return side.command('practice', { canary: Boolean(options.canary) });
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  trail: {
    check(options) {
      for (const strike of options.strikes ?? TRAIL_STRIKES) {
        const style = strike.split('@')[1];
        if (style !== undefined && !WEAPON_STYLES.includes(style)) {
          throw labError(`trail --strikes: ${strike}: the styles are ${WEAPON_STYLES.join(', ')}`);
        }
      }
    },
    each(side, options) {
      const command = {
        fixture: fixtureFrom(options),
        strikes: (options.strikes ?? TRAIL_STRIKES).map(strikeFrom),
        biome: options.biome ?? 'crypt',
        views: options.views,
        pictures: options.pictures !== false,
        frames: Boolean(options.frames),
        canary: Boolean(options.canary),
      };
      return side.command('trail', command);
    },
    finish(results, options, session) {
      return textWithPictureFiles(results, session.outFor('trail'));
    },
    textOf: asText,
    problemsOf: problemsIn,
    pictures: picturePairs,
  },

  spawns: {
    check(options) {
      if (options.waves !== undefined && !(options.waves >= 1)) throw labError('spawns --waves: at least 1');
    },
    each(side, options) {
      const command = {
        fixture: fixtureFrom(options),
        biomes: options.biomes,
        waves: Math.round(options.waves ?? SPAWN_WAVES),
        canary: Boolean(options.canary),
      };
      return side.command('spawns', command);
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  music: {
    each(side, options) {
      return side.command('music', { biomes: options.biomes, canary: Boolean(options.canary) });
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  probe: {
    check(options) {
      probePath(options._[0]);
    },
    async each(side, options) {
      const path = probePath(options._[0]);
      if (!side.isRepo) {
        for (const file of probeFiles(REPO, path)) {
          mkdirSync(dirname(join(side.root, file)), { recursive: true });
          cpSync(join(REPO, file), join(side.root, file));
        }
      }
      const fixture = options.setup === false ? null : fixtureFrom(options);
      return side.probe(path, options, fixture);
    },
    finish(results, options, session) {
      const name = basename(options._[0]).replace(/\.[^.]+$/, '');
      return textWithMoments(results, session.outFor(join('probes', name)), session.browser);
    },
    textOf: asText,
    problemsOf: problemsIn,
    pictures: picturePairs,
  },

  swing: {
    keepsPage: true,
    check(options) {
      if (options.grip?.length !== options.way?.length) throw labError('swing: --grip with a --way for each');
    },
    each(side, options) {
      const command = {
        fixture: { view: 'first', ...fixtureFrom(options) },
        swing: options._[0],
        at: options.grip ?? null,
        dir: options.way ?? null,
        key: options.key ?? null,
        left: Boolean(options.left),
        turn: options.turn ?? 0,
        trunk: options.trunk ?? null,
        canary: Boolean(options.canary),
      };
      return side.command('swing', command);
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  eval: {
    each(side, options) {
      return side.evaluate(options._.join(' '));
    },
    textOf: asText,
  },
};

/**
 * The pages a check may run `command` with `options` on, as its `keepsPage` says: `'shared'`, a page any command
 * that shares pages ran on; the command's name, a page its own jobs alone ran on; or null, a page booted for it.
 */
export function pageKind(command, options) {
  const keeps = COMMANDS[command]?.keepsPage;
  const says = typeof keeps === 'function' ? keeps(options) : keeps;
  if (says === 'own') return command;
  return says ? 'shared' : null;
}
