// The game's boot measured (tools/stalls, `--scenario boot`): the page loaded in a fresh Chrome as a first visit has
// it (a new profile: every cache empty, no saved game, the game's own settings), then loaded again as a return (its
// caches, the offline worker and the saved profile kept), each traced from the navigation to a while after the
// loading screen reveals the lobby.
import { writeFileSync } from 'node:fs';
import { noCapture } from '../lab/node/browser.mjs';
import { analyzeBoot } from './analyze.mjs';
import { buildsBySteps, readBuilds, withBuilds } from './builds.mjs';
import { slowCpu, touchScreen } from './chrome.mjs';
import { BLINK_FRAMES, filmFrames, filmOf, logoBox, startFilm } from './film.mjs';
import {
  bootRecording, changeHero, chooseIfAsked, fightWarm, heroesShown, heroesShownAt, loaded, startIfCold, startRun,
  stopBootRecording,
} from './page.mjs';
import { startTrace } from './trace.mjs';
import { partsOf, VARIANTS } from './variants.mjs';
import { VIEWS } from './options.mjs';
import { resizeTrips, windFitRead, windFitRecording } from './windFit.mjs';

/** the page's mark on the trace, where its clock starts */
const MARK = 'stalls:boot';
/** how long a boot is given to reveal the lobby, and then to warm the fight's programs behind it (ms) */
const BOOT_TIMEOUT_MS = 180_000;
const WARM_TIMEOUT_MS = 120_000;

/** The visits a boot measure makes in one Chrome, in turn: how each loads the page, and what it is. */
const VISITS = [
  {
    name: 'a first visit',
    note: 'a fresh profile: every cache empty, no saved game',
    load: (page, url) => page.goto(url, { waitUntil: 'commit' }),
  },
  {
    name: 'a return',
    note: 'loaded again in the same Chrome: its caches, the offline worker and the saved game kept',
    load: (page) => page.reload({ waitUntil: 'commit' }),
  },
];

/** `browser`'s first context made ready for a boot: never taking the pointer, the boot recorded from each document's
 *  start (and where its exit draws, with `--resize`), `variant` (each of its parts) applied before the page's
 *  scripts, the performance overlay shown if `perf`, Auto's quality where `auto` says a device settled it and the
 *  battleground where `biome` is given (their cookies, set for `url`). */
async function bootContext(browser, url, variant, options) {
  const context = browser.contexts()[0] ?? (await browser.newContext());
  await context.addInitScript(noCapture);
  const stalls = { stallBlow: options.stallBlow, stallLobby: options.stallLobby };
  const blinks = { blinkExit: options.blinkExit, blinkFrames: BLINK_FRAMES };
  await context.addInitScript(bootRecording, { mark: MARK, ...stalls, ...blinks });
  if (options.resize) await context.addInitScript(windFitRecording, { stale: options.staleWind });
  for (const part of partsOf(variant)) await context.addInitScript(VARIANTS[part].script, VARIANTS[part].arg);
  const cookies = [
    ...(options.perf ? [{ name: 'last-stand-perf-hud', value: '1', url }] : []),
    ...(options.auto ? [{ name: 'last-stand-quality-auto', value: options.auto, url }] : []),
    ...(options.biome ? [{ name: 'last-stand-biome', value: options.biome, url }] : []),
  ];
  if (cookies.length) await context.addCookies(cookies);
  return context;
}

/** How long `--warm-behind` goes on watching the lobby once the fight is warm: its frames then are the lobby's own,
 *  with nothing behind it. */
const AFTER_WARM_MS = 5000;
/** How long the run is watched once the fight is warm and Start pressed (ms): its countdown, the first wave's foes
 *  rising and coming at the hero */
const RUN_WATCHED_MS = 8000;

/** What `--before`'s expression gave, written beside `--read`'s (`read`'s path, `.before.json`): the trace stopped
 *  by then, so it's how the page runs with no trace on it. */
function writeBefore(value, read) {
  if (value === undefined) return;
  writeFileSync(read.replace(/\.json$/, '.before.json'), `${JSON.stringify(value, null, 1)}\n`);
}

/** Whether `visit` leaves without pressing Start (`--cold-return`: the first visit, so the return finds its maps
 *  kept and the fight's programs never compiled, as after a visit that never fought). */
const leftCold = (visit, options) => options.coldReturn && visit === VISITS[0];

/** Whether `visit` stays in the lobby till the fight has warmed behind it (`--warm-behind`): the return alone, as a
 *  first visit warms nothing behind its lobby (no build of this code warmed here before: `src/game/warmup.ts`), and
 *  its fight waited for a Start that never came, the run's 120 s out. */
const staysBehind = (visit, options) => options.warmBehind && visit !== VISITS[0];

/** Whether `visit` presses Change hero rather than Start (`--change-hero`): the return alone, as a first visit warms
 *  every hero for the hall it opens on, and a return's heroes are cold till something needs them. */
const changesHero = (visit, options) => options.changeHero && visit !== VISITS[0];

/** How long the hall of heroes is watched once it shows (ms): the camera's flight to the hero in focus and his
 *  showcase begun. */
const HALL_WATCHED_MS = 4000;

/** Change hero pressed in the lobby, the hall of heroes waited for (its heroes warmed under the loading bar) and
 *  watched `HALL_WATCHED_MS`. */
async function hallOpened(page) {
  await page.evaluate(changeHero);
  await page.waitForFunction(heroesShown, null, { timeout: WARM_TIMEOUT_MS, polling: 50 });
  await page.evaluate(heroesShownAt);
  await page.waitForTimeout(HALL_WATCHED_MS);
}

/** How long `--warm-behind` waits for the fight to warm behind the lobby (ms): one given up there waits for a Start
 *  that never comes (on a phone's CPU, the lobby's own frames ran past what it may hold, and the run timed out). */
const BEHIND_MOST_MS = 30_000;

/** What a visit left without pressing Start says of the fight, read off the page as it's left (`fightWarm`): a
 *  build that warms the fight before its lobby (production before the fight's loading bar) left it warm all the
 *  same, and its return is no cold one; `behind`, a return given up behind its lobby (`--warm-behind`). */
const LEFT_NOTES = {
  cold: 'left without pressing Start, the fight never compiled',
  warm: 'left without pressing Start, its fight warm all the same (warmed before the lobby): not a cold return',
  behind: `the fight not warm ${BEHIND_MOST_MS / 1000} s into the lobby: given up behind it (a frame held past the `
    + "game's HELD_MOST_MS, or a part cold), the rest left for Start",
};

/** The lobby watched till the fight has warmed behind it and `AFTER_WARM_MS` more: null, or `behind` where it was
 *  given up there (`BEHIND_MOST_MS`). */
async function warmedBehind(page) {
  const warm = await page.waitForFunction(fightWarm, null, { timeout: BEHIND_MOST_MS, polling: 250 })
    .then(() => true, () => false);
  await page.waitForTimeout(AFTER_WARM_MS);
  return warm ? null : 'behind';
}

/** One visit of `page` traced: loaded as `visit` loads it (the window taken to `--resize`'s size and back as it
 *  loads, `windFit.mjs`), the lobby revealed and watched `options.seconds` more,
 *  then, unless it's left cold (`leftCold`), Start pressed if the fight's programs aren't warm yet (`startIfCold`)
 *  and watched till they are (`fightWarm`); then its findings (`analyzeBoot`, and its exit's film with `--film`),
 *  how it was left (`LEFT_NOTES`'s key, null where Start could be pressed) and a picture of the screen
 *  (`picture.end`, the film's sheets beside it), taken at the CPU's full speed (`setRate`: slowed ten times, the page
 *  painted none within Playwright's 30 s) and slowed again after. */
async function bootTraced(browser, page, url, visit, options, picture, setRate) {
  const trace = await startTrace(browser, { js: options.js, angle: options.angle, dawn: options.dawn });
  const film = options.film ? await startFilm(page, { full: options.filmLogo }) : null;
  await visit.load(page, url);
  const resized = options.resize ? resizeTrips(page, options) : null;
  await Promise.all([page.waitForFunction(loaded, null, { timeout: BOOT_TIMEOUT_MS, polling: 250 }), resized]);
  await page.waitForTimeout(options.seconds * 1000);
  const windFit = options.resize ? await page.evaluate(windFitRead) : null;
  const logo = options.filmLogo ? await page.evaluate(logoBox) : null;
  // (a first visit opens on the hero selection screen: `--hero` chosen there, else the hero in focus, as a player
  // chooses one; a return keeps him)
  // (watched as long again after the choice, before Start is pressed: what the choice holds up is its own phase)
  if (await page.evaluate(chooseIfAsked, options.hero)) await page.waitForTimeout(options.seconds * 1000);
  let left = null;
  if (leftCold(visit, options)) left = (await page.evaluate(fightWarm)) ? 'warm' : 'cold';
  else {
    if (staysBehind(visit, options)) left = await warmedBehind(page);
    else if (changesHero(visit, options)) await hallOpened(page);
    else {
      await page.evaluate(startIfCold);
      await page.waitForFunction(fightWarm, null, { timeout: WARM_TIMEOUT_MS, polling: 250 });
      await page.evaluate(startRun);
      await page.waitForTimeout(RUN_WATCHED_MS);
    }
  }
  if (options.read) writeFileSync(picture.read, `${JSON.stringify(await page.evaluate(options.read), null, 1)}\n`);
  const builds = options.builds ? await page.evaluate(readBuilds) : null;
  const record = await page.evaluate(stopBootRecording);
  const events = await trace.stop();
  const shots = film ? await film.stop() : [];
  await setRate(1);
  await viewForPicture(page, options.view);
  if (options.before) writeBefore(await page.evaluate(options.before), picture.read);
  await pictureEnd(page, options.cast, picture.end);
  const findings = analyzeBoot(record, events, MARK, options.sourceOf, options.listed);
  if (builds) {
    const bySteps = buildsBySteps(builds, findings.steps);
    findings.steps.forEach((step, index) => { step.builds = bySteps[index]; });
  }
  if (windFit) {
    const { trace, resizes, ...fit } = windFit;
    writeFileSync(picture.wind, `${JSON.stringify({ resizes, trace })}\n`);
    findings.windFit = { ...fit, planted: options.staleWind, file: picture.wind };
  }
  if (options.film) {
    const files = { sheet: picture.film, close: picture.flickers, logo: picture.logo };
    const frames = filmFrames(record, shots, options.filmBoot);
    findings.film = await filmOf(browser, page, frames, findings.revealedAt, files, record.blinks, logo);
  }
  await setRate(options.cpuSlowdown);
  return { findings, left };
}

/** The notes of a boot: the visit, Auto's quality where it was set, the CPU's slowing, the window's trips, the
 *  blow's and the lobby's stalls and the exit's blinks and stale places, how it was left where Start wasn't pressed
 *  (`left`), the page's errors and where its end was pictured. */
function bootNotes(visit, options, left, errors, picture) {
  const auto = options.auto ? [`Auto's quality settled at ${options.auto}`] : [];
  const slowed = options.cpuSlowdown > 1 ? [`the CPU slowed ${options.cpuSlowdown} times`] : [];
  const size = ({ width, height }) => `${width}x${height}`;
  const trip = `the window taken to ${options.resize && size(options.resize)} and back ${options.trips} times as it `
    + 'loaded, the first as the exit was made ready';
  const trips = options.resize ? [trip] : [];
  const stale = options.staleWind ? ['the exit placed once and never again (the canary)'] : [];
  const stalled = options.stallBlow ? [`held up ${options.stallBlow} ms in the logo blow's first frames`] : [];
  const held = options.stallLobby ? [`each of the lobby's frames held up ${options.stallLobby} ms for a second`] : [];
  const blinks = `the loading screen hidden for a frame ${options.blinkExit} times as it left`;
  const blinked = options.blinkExit ? [blinks] : [];
  const leftNote = left ? [LEFT_NOTES[left]] : [];
  const hero = changesHero(visit, options) ? ['Change hero pressed, not Start'] : [];
  const failed = errors.length ? [`page errors: ${distinctErrors(errors).join(' | ')}`] : [];
  const read = options.read ? [`${options.read} read into ${picture.read}`] : [];
  const builds = options.builds ? ['its WebGPU node builds recorded (`?builds`), each step\'s listed'] : [];
  const notes = [visit.note, ...auto, ...slowed, ...trips, ...stalled, ...held, ...blinked, ...stale, ...leftNote,
    ...hero, ...failed, ...read, ...builds];
  return [...notes, `its end pictured in ${picture.end}`];
}

/** the most of an error's text a boot's notes keep (a WGSL compile error quotes its shader) */
const ERROR_CHARS = 400;

/** how long a press of V is held, and how long the camera takes to glide into the next view (ms) */
const VIEW_KEY_MS = 90;
const VIEW_GLIDE_MS = 1500;

/** The fight the boot started put in `view` for its end picture, V pressed as a player does (the close views lock the
 *  pointer, a headless Chrome's own). */
async function viewForPicture(page, view) {
  for (let press = 0; press < VIEWS.indexOf(view); press++) {
    await page.keyboard.press('v', { delay: VIEW_KEY_MS });
    await page.waitForTimeout(VIEW_GLIDE_MS);
  }
}

/** The fight pictured into `path`, with `cast`'s key held its time first where given (a skill's look shown: its
 *  key let go after the picture). */
async function pictureEnd(page, cast, path) {
  if (!cast) {
    await page.screenshot({ path });
    return;
  }
  await page.keyboard.down(cast.key);
  await page.waitForTimeout(cast.ms);
  await page.screenshot({ path });
  await page.keyboard.up(cast.key);
}

/** the most distinct errors a boot's notes list */
const ERRORS_SHOWN = 6;

/** `errors` each told once, with how many times it came where more than once, in the order they first came. */
function distinctErrors(errors) {
  const counts = new Map();
  for (const error of errors) counts.set(error, (counts.get(error) ?? 0) + 1);
  const told = [...counts].map(([error, count]) => (count > 1 ? `${error} (x${count})` : error));
  const more = told.length > ERRORS_SHOWN ? [`${told.length - ERRORS_SHOWN} more`] : [];
  return [...told.slice(0, ERRORS_SHOWN), ...more];
}

/** An uncaught error with the function that threw it and the one under that: its message alone doesn't say where a
 *  frame's error came from, and each frame then draws nothing (`--js` builds this tree with its functions named). */
function errorWithPlace(error) {
  const frames = (error.stack ?? '').split('\n').filter((line) => line.trim().startsWith('at '));
  const named = frames.slice(0, 2).map((line) => line.trim().replace(/^at /, '').replace(/\s*\(.*\)$/, ''));
  return named.length ? `${error} (in ${named.join(' < ')})` : String(error);
}

/** `page`'s errors kept in `errors` as they come: its uncaught ones, and those it logs (three logs a shader that
 *  failed to compile, and draws on without it). */
function keepErrors(page, errors) {
  const keep = (text) => errors.push(text.slice(0, ERROR_CHARS));
  page.on('pageerror', (error) => keep(errorWithPlace(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') keep(`logged: ${message.text()}`);
  });
}

/** What the loading screen says it's doing, and how far its bar is (a boot that never ended stopped there). */
function loadingStep() {
  const step = document.querySelector('#loading .ld-sub')?.textContent ?? 'no loading screen';
  const fill = document.querySelector('#loading .ld-fill');
  return `${step} (the bar at ${fill ? fill.style.width || 'its start' : 'none'})`;
}

/** `boot` as it ends, or its failure with where the loading screen stood and the page's errors added (a lobby that
 *  never showed timed out bare). */
async function withErrorsTold(boot, page, errors) {
  try {
    return await boot;
  } catch (failure) {
    const step = await page.evaluate(loadingStep).catch(() => 'unread');
    const told = [failure.message, `the loading screen: ${step}`];
    if (errors.length) told.push(`page errors: ${distinctErrors(errors).join(' | ')}`);
    // (a new error: an error's stack, which Node prints, keeps the message it was made with)
    throw new Error(told.join('\n'), { cause: failure });
  }
}

/**
 * Each URL's boots in turn with each variant, `options.rounds` times over: in a fresh Chrome (`chromeFor`), a first
 * visit, then a return (`VISITS`). Rounds side by side in time are slowed alike by whatever else uses the machine.
 * `sourcesFor(url)` names a URL's functions; each measure goes to `measured` as it's made, with `pictureAt()` the
 * pictures of its end and its film (`{ end, film, flickers }`).
 */
export async function measureBoots(urls, options, { chromeFor, sourcesFor, pictureAt, measured }) {
  for (let round = 1; round <= options.rounds; round++) {
    for (const url of urls) {
      for (const variant of options.variants) {
        const chrome = await chromeFor(options);
        try {
          const context = await bootContext(chrome.browser, url, variant, options);
          const page = await context.newPage();
          const errors = [];
          keepErrors(page, errors);
          const setRate = await slowCpu(page, options.cpuSlowdown);
          await touchScreen(page, options.touch);
          options.sourceOf = sourcesFor(url);
          for (const visit of VISITS) {
            console.log(`booting ${options.nameOf(url)} ${variant}, ${visit.name}, round ${round}`);
            const picture = pictureAt();
            const loaded = options.builds ? withBuilds(url) : url;
            const traced = bootTraced(chrome.browser, page, loaded, visit, options, picture, setRate);
            const { findings, left } = await withErrorsTold(traced, page, errors);
            const group = `${options.nameOf(url)} ${variant}, ${visit.name}`;
            const notes = bootNotes(visit, options, left, errors, picture);
            measured({ name: `${group} (round ${round})`, group, notes, findings });
          }
        } finally {
          await chrome.close();
        }
      }
    }
  }
}
