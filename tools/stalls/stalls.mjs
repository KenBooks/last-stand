// The stalls harness: the game played in the installed Chrome on this machine's GPU, its frames recorded and the
// browser traced, for the stalls the lab's Chromium never shows (Chrome on Windows holding up its GPU process, and
// the game's canvas with it, for seconds while Skia builds a program). See tools/stalls/README.md.
//
// npm run stalls -- [--url a,b] [--scenario fight|lobby|storm|hover|sweep|stow|heroes] [--seconds 45]
//   [--listed 300] [--variants base,cpuCanvas] [--rounds 3] [--view top] [--biome forest] [--hero warrior]
//   [--stash 40] [--item-ms 100] [--press-ms 200] [--scale 1.25] [--window 1536x695] [--perf] [--js] [--headed]
//   [--links] [--passes] [--paints] (--help: what each does)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { freshStorage, noCapture } from '../lab/node/browser.mjs';
import { nodeName } from '../lab/node/layers.mjs';
import { priorityNow } from '../lab/node/priority.mjs';
import { analyze } from './analyze.mjs';
import { slowCpu, startChrome } from './chrome.mjs';
import { measureWebgpuCache, WEBGPU_CACHE } from './webgpuCache.mjs';
import { AUTOPLAY, measureAutoplay } from './autoplay.mjs';
import { measureBoots } from './boot.mjs';
import { BOOT, readOptions, usage, VIEWS } from './options.mjs';
import {
  chooseIfAsked, equipmentShown, fightWarm, loaded, menuStowed, recordFromNow, seededProfile, seedStash, startRecording,
  stopRecording, useStyle,
} from './page.mjs';
import { bootRoundsText, bootText, measureText, roundsText, summaryText } from './report.mjs';
import { pickHero, SCENARIOS } from './scenarios.mjs';
import { serveTrees, THIS_TREE } from './serve.mjs';
import { sourcesOf } from './sourceMap.mjs';
import { startTrace, TraceLost } from './trace.mjs';
import { within } from './within.mjs';
import { liveCss, partsOf, VARIANTS } from './variants.mjs';

const REPO = resolve(import.meta.dirname, '../..');
const OUT = join(REPO, 'tools/stalls/out');
/** the page's mark on the trace, where its clock starts */
const MARK = 'stalls:start';
/** the settings every measure starts with, as the game keeps them: the battleground, the High preset (or Auto, settled
 *  where `auto` says a device's did), and the performance overlay shown or not */
function cookiesFor({ biome, perf, auto }) {
  const quality = auto
    ? { 'last-stand-quality': 'auto', 'last-stand-quality-auto': auto }
    : { 'last-stand-quality': 'high' };
  return { 'last-stand-biome': biome, ...quality, 'last-stand-perf-hud': perf ? '1' : '0' };
}
const LOAD_TIMEOUT_MS = 180_000;
/** how long a key is held, and the view given to settle after each press (ms) */
const KEY_HOLD_MS = 90;
const VIEW_SETTLE_MS = 1500;
/** how long a hero chosen in the lobby is given to be built, and an item moved to be saved (ms) */
const HERO_BUILT_MS = 1500;
const ITEM_MOVED_MS = 300;
/** how long a variant's styles put on a running page are given to take before its scenario plays (ms) */
const STYLE_SETTLE_MS = 500;
/** how long a page started again after another's turn is given to settle before it plays (ms) */
const THAW_SETTLE_MS = 1500;
/** how long a page is given to stop once asked (ms): its next frame's script */
const PAUSE_MS = 5000;

/** `browser`'s first context made ready for the game's pages: never taking the pointer, its storage fresh, the
 *  stash's seeded items kept, and `variant` (each of its parts) applied before the page's scripts. */
async function gameContext(browser, variant) {
  const context = browser.contexts()[0] ?? (await browser.newContext());
  await context.addInitScript(noCapture);
  await context.addInitScript(freshStorage);
  await context.addInitScript(seededProfile);
  for (const part of partsOf(variant)) await context.addInitScript(VARIANTS[part].script, VARIANTS[part].arg);
  return context;
}

/** Opens the game at `url` in `context` (`gameContext`), the settings `options` give set by cookie, and waits out
 *  the loading screen. */
async function openGame(context, url, options) {
  const cookies = Object.entries(cookiesFor(options)).map(([name, value]) => ({ name, value, url }));
  await context.addCookies(cookies);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await slowCpu(page, options.cpuSlowdown);
  await page.goto(url, { waitUntil: 'load' });
  await waitLoaded(page);
  return { page, errors };
}

/** Whether the page at `url` warms the fight behind its lobby on every visit: WebGPU's does, as the loading screen
 *  leaves (`warmTheRest` in `src/game/warmup.ts`). */
function warmsBehindTheLobby(url) {
  const renderer = new URL(url).searchParams.get('renderer') ?? '';
  return renderer.startsWith('webgpu');
}

/**
 * Waits out the loading screen and the lobby's panels (a first visit's hero chosen on the screen it opens on), and
 * where the fight warms behind the lobby (`warmsBehindTheLobby`), that warm-up: a WebGPU lobby's scenario read its
 * frames as the fight compiled under them, a median of 20.8 ms.
 */
async function waitLoaded(page) {
  await page.waitForFunction(loaded, null, { timeout: LOAD_TIMEOUT_MS, polling: 250 });
  await page.evaluate(chooseIfAsked);
  await page.waitForFunction(equipmentShown, null, { timeout: LOAD_TIMEOUT_MS, polling: 250 });
  if (warmsBehindTheLobby(page.url())) {
    await page.waitForFunction(fightWarm, null, { timeout: LOAD_TIMEOUT_MS, polling: 250 });
  }
}

/**
 * Fills the hero's stash with `count` items (`seedStash`) as a player's long kept one is: an item moved off him so
 * his profile is saved, copies of his own kept for the next load, and the page loaded again. Throws if it couldn't.
 */
async function fillStash(page, count) {
  await page.click('#equip .eslot:not(.empty)');
  await page.waitForTimeout(ITEM_MOVED_MS);
  const filled = await page.evaluate(seedStash, count);
  if (filled === 0) throw new Error('stalls: --stash: no profile saved once an item was moved off the hero');
  await page.reload({ waitUntil: 'load' });
  await waitLoaded(page);
}

/** Sets the lobby up as `options` say: the hero chosen, his stash filled, the view. */
async function setUpLobby(page, options) {
  if (options.hero) {
    await pickHero(page, options.hero);
    await page.waitForTimeout(HERO_BUILT_MS);
  }
  if (options.stash > 0) await fillStash(page, options.stash);
  await chooseView(page, options.view);
}

/** Puts the lobby in `view` as a player does: V pressed until it's there (a close view stows the panels), then
 *  Space to show them again. */
async function chooseView(page, view) {
  for (let press = 0; press < VIEWS.indexOf(view); press++) {
    await page.keyboard.press('v', { delay: KEY_HOLD_MS });
    await page.waitForTimeout(VIEW_SETTLE_MS);
  }
  if (await page.evaluate(menuStowed)) await page.keyboard.press('Space', { delay: KEY_HOLD_MS });
  await page.waitForTimeout(VIEW_SETTLE_MS);
}

/** The picture of what a measure's scenario left on screen: `out/end-<n>.png`, n its place in the command's
 *  measures (to see that it played what it meant to). */
const endPicture = (index) => join(OUT, `end-${index + 1}.png`);
/** A boot's pictures: its end (`endPicture`), and its exit's film, the film's flickers (`--film`: `out/film-<n>.png`
 *  and `out/flickers-<n>.png`), its frames cut to the lobby logo (`--film-logo`: `out/logo-<n>.png`) and the
 *  exit's draws as the window changed (`--resize`: `out/wind-<n>.json`) and what was read off the page (`--read`:
 *  `out/read-<n>.json`). */
const bootPictures = (index) => ({
  end: endPicture(index),
  film: join(OUT, `film-${index + 1}.png`),
  flickers: join(OUT, `flickers-${index + 1}.png`),
  logo: join(OUT, `logo-${index + 1}.png`),
  wind: join(OUT, `wind-${index + 1}.json`),
  read: join(OUT, `read-${index + 1}.json`),
});

/** A Chrome of its own for a measure, as `options` have its window. */
function chromeFor(options) {
  const { width, height } = options.window;
  const { headed, scale, gpuMemory } = options;
  return startChrome({ outDir: join(OUT, 'profiles'), headed, scale, width, height, gpuMemory });
}

/** `expression` read off `page` into the JSON file beside its end picture (`--read`): what it was read into. */
async function readOff(page, expression, picture) {
  const path = picture.replace(/end-(\d+)\.png$/, 'read-$1.json');
  // (a URL beside may not define it, as WebGL's page has no WebGPU records: said, not thrown, so the other runs go on)
  const read = await page.evaluate(expression).then((value) => ({ value }), (error) => ({ error }));
  if (read.error) return `${expression} not read: ${read.error.message.split('\n')[0]}`;
  writeFileSync(path, `${JSON.stringify(read.value, null, 1)}\n`);
  return `${expression} read into ${path}`;
}

/** The scenario played once on `page` (in `browser`) while traced: what it did, what the frames and the trace
 *  showed, and a picture of the screen at its end (`picture`). */
async function playTraced(browser, page, options, picture) {
  const { js, angle, dawn, passes, paints } = options;
  const trace = await startTrace(browser, { js, angle, dawn, passes, paints });
  await page.evaluate(startRecording, MARK);
  await page.evaluate(recordFromNow);
  const notes = await SCENARIOS[options.scenario](page, options.seconds * 1000, { ...options, picture });
  const record = await page.evaluate(stopRecording, MARK);
  const events = await trace.stop();
  const before = options.before ? await page.evaluate(options.before) : undefined;
  if (before !== undefined) notes.push(`--before gave ${JSON.stringify(before)}`);
  await page.screenshot({ path: picture });
  notes.push(`its end pictured in ${picture}`);
  if (options.read) notes.push(await readOff(page, options.read, picture));
  const painted = paints ? await paintedNames(page, events) : new Map();
  const findings = analyze(record, events, MARK, options.listed, options.sourceOf, painted, options.jsUnder);
  return { notes, findings };
}

/** The elements the page painted (`--paints`, `trace.mjs` `paintOf`), named as the lab's layers name them (their
 *  tag, then their id or classes), by their backend node ids, read off the page as it's left: an element taken
 *  off it since is `(gone)`. */
async function paintedNames(page, events) {
  const devtools = await page.context().newCDPSession(page);
  const nodes = new Set(events.filter((event) => event.ph === 'P' && event.node !== null).map((paint) => paint.node));
  const names = new Map();
  for (const node of nodes) {
    const described = await devtools.send('DOM.describeNode', { backendNodeId: node }).catch(() => null);
    names.set(node, described ? nodeName(described.node) : '(gone)');
  }
  await devtools.detach().catch(() => undefined);
  return names;
}

/** `playTraced`, played once more if Chrome lost its trace (`TraceLost`): a round's page is set up once, and the
 *  measure kept on it as the others are. */
async function playTracedOnce(browser, page, options, picture) {
  try {
    return await playTraced(browser, page, options, picture);
  } catch (error) {
    if (!(error instanceof TraceLost)) throw error;
    console.log(`stalls: ${error.message}: played again`);
    const played = await playTraced(browser, page, options, picture);
    return { ...played, notes: [...played.notes, 'played again: Chrome lost its first trace'] };
  }
}

/** The page's errors so far as a note, if it had any. */
const errorNotes = (errors) => (errors.length ? [`page errors: ${errors.slice(0, 3).join(' | ')}`] : []);

/**
 * Holds a game's page still while another plays: paused in the debugger at its next script, so it draws no frame
 * and its renderer does nothing in the other's measure (the report says what other renderers did). The page
 * lifecycle's frozen state (`Page.setWebLifecycleState`) kept drawing: 300 to 450 ms of the frozen page's work a
 * second, its game's frames, in the other's measure.
 */
async function freeze(game) {
  const paused = new Promise((resolve) => game.cdp.once('Debugger.paused', resolve));
  await game.cdp.send('Debugger.enable');
  await game.cdp.send('Debugger.pause');
  if (!(await within(paused, PAUSE_MS))) throw new Error(`stalls: ${game.url} never paused (in ${PAUSE_MS} ms)`);
}

/** Starts a paused game's page again, in front, its debugger off (nothing of it left in the measure), and gives it
 *  time to settle. Throws if it isn't shown. */
async function thaw(game) {
  await game.page.bringToFront();
  await game.cdp.send('Debugger.resume');
  await game.cdp.send('Debugger.disable');
  await game.page.waitForTimeout(THAW_SETTLE_MS);
  const shown = await game.page.evaluate(() => document.visibilityState);
  if (shown !== 'visible') throw new Error(`stalls: ${game.url} is ${shown} once started again, not visible`);
}

/** One measure: a fresh Chrome on `url` with `variant`, the scenario played, its frames and trace analyzed, and a
 *  picture of the screen at its end (`picture`). */
async function measure(url, variant, options, picture) {
  const chrome = await chromeFor(options);
  try {
    const context = await gameContext(chrome.browser, variant);
    const { page, errors } = await openGame(context, url, options);
    await setUpLobby(page, options);
    const { notes, findings } = await playTraced(chrome.browser, page, options, picture);
    return { name: `${options.nameOf(url)} ${variant}`, notes: [...notes, ...errorNotes(errors)], findings };
  } finally {
    await chrome.close();
  }
}

/** Opens the game at `url` in `context` for rounds and sets its lobby up, then holds it still till its turn. */
async function openForRounds(context, url, options) {
  const { page, errors } = await openGame(context, url, options);
  await setUpLobby(page, options);
  const game = { url, page, errors, cdp: await context.newCDPSession(page) };
  await freeze(game);
  return game;
}

/**
 * The variants measured in turn on each of `urls`, `options.rounds` times over, in one Chrome: each URL's page set
 * up once and held still while the others play (`freeze`), each variant's styles put on it as it runs
 * (`useStyle`). Measures side by side in time, so what slows the machine meanwhile (another agent's browser on its
 * GPU) slows each URL and variant alike (one URL measured after another, minutes apart, this tree's frames to beat
 * read 121 a second and production's 135), and a boot a URL where `measure` boots for each. `sourcesFor(url)`
 * names a URL's functions; each measure goes to `measured` as it's made, with `pictureAt()` the picture of its end.
 */
async function measureRounds(urls, options, sourcesFor, pictureAt, measured) {
  const chrome = await chromeFor(options);
  try {
    const context = await gameContext(chrome.browser, 'base');
    const games = [];
    for (const url of urls) games.push(await openForRounds(context, url, options));
    for (let round = 1; round <= options.rounds; round++) {
      for (const game of games) {
        await thaw(game);
        options.sourceOf = sourcesFor(game.url);
        for (const variant of options.variants) {
          const playing = `${options.nameOf(game.url)} ${variant}, round ${round}`;
          console.log(`measuring ${playing}: ${options.scenario} for ${options.seconds} s`);
          await game.page.evaluate(useStyle, liveCss(variant));
          await game.page.waitForTimeout(STYLE_SETTLE_MS);
          const { notes, findings } = await playTracedOnce(chrome.browser, game.page, options, pictureAt());
          const group = `${options.nameOf(game.url)} ${variant}`;
          const name = `${group} (round ${round})`;
          measured({ name, group, notes: [...notes, ...errorNotes(game.errors)], findings });
        }
        await freeze(game);
      }
    }
  } finally {
    await chrome.close();
  }
}

/** Each variant on each of `urls` measured once, in a Chrome of its own (`measure`): a first visit's stalls.
 *  `sourcesFor(url)` names a URL's functions; each measure goes to `measured` as it's made. */
async function measureEach(urls, options, sourcesFor, pictureAt, measured) {
  for (const url of urls) {
    options.sourceOf = sourcesFor(url);
    for (const variant of options.variants) {
      console.log(`measuring ${options.nameOf(url)} ${variant}: ${options.scenario} for ${options.seconds} s`);
      measured(await measure(url, variant, options, pictureAt()));
    }
  }
}

async function main() {
  const options = readOptions(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  // (left at the priority it was started at, unlike the lab: it times the browser's own stalls, and below normal the
  // desktop's work would read as the game's)
  console.log(`stalls: running at ${priorityNow()} priority`);
  mkdirSync(OUT, { recursive: true });
  if (options.scenario === WEBGPU_CACHE) {
    const text = await measureWebgpuCache(join(OUT, 'profiles'), options.urls);
    writeFileSync(join(OUT, 'report.txt'), `${text}\n`);
    console.log(`${text}\n\n(written to ${join(OUT, 'report.txt')})`);
    return;
  }
  const asked = options.urls.length ? options.urls : [THIS_TREE];
  const served = await serveTrees(asked, REPO, OUT, { named: options.js });
  const urls = asked.map(served.urlOf);
  if (options.scenario === AUTOPLAY) {
    const texts = [];
    try {
      for (const url of urls) texts.push(await measureAutoplay(url, join(OUT, 'profiles'), options));
    } finally {
      await served.close();
    }
    const text = texts.join('\n\n');
    writeFileSync(join(OUT, 'report.txt'), `${text}\n`);
    console.log(`${text}\n\n(written to ${join(OUT, 'report.txt')})`);
    return;
  }
  options.nameOf = served.nameOf;
  // (the page's functions named from a served tree's build; another URL's by its scripts' lines)
  const sources = new Map([...served.builds].map(([url, distDir]) => [url, sourcesOf(distDir)]));
  const sourcesFor = (url) => sources.get(url) ?? (() => null);
  const measures = [];
  const booting = options.scenario === BOOT;
  const textOf = (result) => (booting ? bootText : measureText)(result, { links: options.links });
  const measured = (result) => {
    console.log(textOf(result));
    measures.push(result);
  };
  try {
    const pictureAt = () => (booting ? bootPictures : endPicture)(measures.length);
    if (booting) await measureBoots(urls, options, { chromeFor, sourcesFor, pictureAt, measured });
    else if (options.rounds > 1) await measureRounds(urls, options, sourcesFor, pictureAt, measured);
    else await measureEach(urls, options, sourcesFor, pictureAt, measured);
  } finally {
    await served.close();
  }
  const sections = measures.map(textOf);
  const summaries = booting
    ? [bootRoundsText(measures)]
    : [summaryText(measures), ...(options.rounds > 1 ? [roundsText(measures)] : [])];
  const text = [...sections, ...summaries].join('\n\n');
  writeFileSync(join(OUT, 'report.txt'), `${text}\n`);
  if (measures.length > 1) console.log(`\n${summaries.join('\n\n')}`);
  console.log(`\n(written to ${join(OUT, 'report.txt')})`);
}

await main();
