// What the lab's commands share on the Node side (tools/lab): the set-up from the options, a result as text and
// its problems, the sheets and pictures a command writes. Each command's own work is in node/commands/.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { DEVICES, screenPlaying } from './devices.mjs';
import { labError } from './errors.mjs';
import { REPO } from './paths.mjs';
import { writeSheet } from './sheetImage.mjs';

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
  if (options.rarity !== undefined) fixture.rarity = options.rarity;
  if (options.tune !== undefined) fixture.tune = tunesFrom(options.tune);
  return fixture;
}

/** `--tune`'s text as the values it sets, by their paths: `a.b=1,2;c.d=3` sets a.b to [1, 2] and c.d to [3], and
 *  `a.b[0,2]=5` the first and third of a.b's numbers to 5 (the page sets those after the whole lists). */
export function tunesFrom(text) {
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

/**
 * `--device`'s options filled in (`perf`): the screen its GPU is played on here, and its quality where it isn't
 * given. Its screen is the device's: it takes no `--screen`.
 */
export function playAsDevice(options) {
  if (options.screen || options.screens) throw labError('--device: the screen is the device\'s; no --screen');
  const device = DEVICES[options.device];
  options.screen = screenPlaying(device);
  options.quality ??= device.quality;
}

/** the quality levels `--quality` names (src/data/quality.ts) */
const QUALITY_LEVELS = ['high', 'medium', 'low', 'verylow'];

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
export function lightScenarios(options) {
  const scenarios = [];
  for (const biome of options.biomes) {
    for (const view of options.views) {
      const facings = view === 'top' ? options.facings.slice(0, 1) : options.facings;
      for (const facing of facings) {
        scenarios.push({ biome, view, facing: Number(facing), at: options.at, zoom: options.zoom });
      }
    }
  }
  return scenarios;
}

/** A sheet's notes as text: how it was set up, then each moment's notes. */
export function sheetNotes(sheet) {
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
export function picturePairs(before, after) {
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
export function asText(result) {
  if (typeof result === 'string') return result;
  if (isReport(result)) return result.text;
  return JSON.stringify(result, null, 2) ?? String(result);
}

/** The problems a result reports: a report's, none otherwise. */
export function problemsIn(result) {
  return isReport(result) ? result.problems : [];
}

/**
 * Writes the moments the sides' results pictured (a report's `moments`) as a sheet in `dir`; returns the images it
 * was written in (`writeSheet`'s parts), none when none pictured any.
 */
export async function writeMoments(results, dir, browser, name = 'sheet.png') {
  const runs = results
    .filter(([, result]) => result?.moments?.length)
    .map(([side, result]) => [side.name, { moments: result.moments }]);
  if (runs.length === 0) return [];
  mkdirSync(dir, { recursive: true });
  const views = Math.max(...runs.flatMap(([, { moments }]) => moments.map((moment) => moment.tiles.length)));
  return writeSheet(browser, runs, views, join(dir, name));
}

/**
 * Each side's text under its name, and a sheet for each of each side's moments, written in `dir`: `film-1.png` on for
 * this tree's, `film-main-1.png` on for the other side's (a turn's `filePrefix` after `film-`). For films: two sides'
 * in one sheet, or eight scenarios' of one side, were a page too big for the browser, which closed.
 */
export async function textWithSheetEach(results, dir, browser) {
  const text = results.map(([side, result]) => `${side.name}\n${asText(result)}`).join('\n\n');
  const images = [];
  for (const [side, result] of results) {
    const prefix = `film-${side.filePrefix}`;
    const moments = result?.moments ?? [];
    for (const [index, moment] of moments.entries()) {
      const one = [side, { ...result, moments: [moment] }];
      const written = await writeMoments([one], dir, browser, `${prefix}${index + 1}.png`);
      images.push(...written.map((image) => relative(REPO, image)));
    }
  }
  return images.length ? `${text}\n\npictures: ${images.join(', ')}` : text;
}

/** A moment's group, for a sheet of its own: its label up to its colon (`holding shield: from his left`). */
const groupOf = (moment) => moment.label.split(':')[0];

/** A group's name as a file name: lowercase words joined by dashes. */
export const fileNameOf = (group) => group.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Each side's text under its name, and a sheet for each group of each side's moments (`groupOf`), written in `dir`:
 * `<group>.png` for this tree's, `main-<group>.png` for the other side's (a turn's `filePrefix` first). A run of the
 * warrior's four ways of holding his weapons in one sheet was a page too big for the browser, which closed.
 */
export async function textWithSheetsByGroup(results, dir, browser) {
  const text = results.map(([side, result]) => `${side.name}\n${asText(result)}`).join('\n\n');
  const images = [];
  for (const [side, result] of results) {
    const prefix = side.filePrefix;
    const groups = [...new Set((result?.moments ?? []).map(groupOf))];
    for (const group of groups) {
      const moments = result.moments.filter((moment) => groupOf(moment) === group);
      const name = `${prefix}${fileNameOf(group)}.png`;
      const written = await writeMoments([[side, { ...result, moments }]], dir, browser, name);
      images.push(...written.map((image) => relative(REPO, image)));
    }
  }
  return images.length ? `${text}\n\npictures: ${images.join(', ')}` : text;
}

/**
 * Each side's text under its name, and each picture of its moments as a PNG of its own at its full size, written in
 * `dir` (emptied first) as `<filePrefix><moment>.png` (`-<view>` after a moment pictured from more than one view):
 * a 4K screen's pictures put on one sheet were a page too big for the browser, which closed.
 */
export function textWithPictureFiles(results, dir) {
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

/** Where `written` went, each named, or past `PICTURES_NAMED` how many and the first and last (lab neck wrote 216). */
function pictureList(written, dir) {
  const where = relative(REPO, dir);
  if (written.length <= PICTURES_NAMED) return `pictures in ${where}: ${written.join(', ')}`;
  return `${written.length} pictures in ${where}: ${written[0]} to ${written[written.length - 1]}`;
}

/** Each side's text under its name, and the sheet of the moments they pictured, written in `dir` (when any did). */
export async function textWithMoments(results, dir, browser) {
  const text = results.map(([side, result]) => `${side.name}\n${asText(result)}`).join('\n\n');
  const images = (await writeMoments(results, dir, browser)).map((image) => relative(REPO, image));
  return images.length ? `${text}\n\npictures: ${images.join(', ')}` : text;
}
