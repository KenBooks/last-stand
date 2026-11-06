// `lab pwa` (tools/lab): a deploy as a returning player meets it, the offline worker and all, which the lab's dev
// server never has. Another commit's production build (origin/main by default) is served as Pages serves the game and
// loaded twice in a fresh browser (its worker installed, then the page and its fonts fetched through it); then this
// tree's build is served in its place and the page reloaded as a player reloads it: under the old worker, again once
// the new one has taken over, and offline. Every load must show the game's own fonts, and every load after the swap
// this tree's build (a plain reload must show a new deploy: the root AGENTS.md). (The owner, of a preview whose font
// stylesheet was asked for with CORS: the old worker answered with the copy it kept from a request without, which
// can't answer one with, the stylesheet failed and the lobby showed the system's fonts, wider: "increasing font size
// had unintended side effects".)
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser } from './browser.mjs';
import { exportCommit, exportedTreePaths } from './commits.mjs';
import { describeError } from './errors.mjs';
import { OUT, REPO } from './paths.mjs';
import { StaticHost } from './staticHost.mjs';

/** where the builds go */
const PWA_DIR = join(OUT, 'pwa');
/** the path the builds are served under, as Pages serves production */
const BASE = '/last-stand/';
/** the game's fonts, which a page that lost its font stylesheet shows the system's in place of */
const FAMILIES = ['Cinzel', 'Alegreya Sans'];
/** how long a load may take to show its fonts, and a worker to take the page (ms) */
const FONTS_WAIT = 15_000;
const WORKER_WAIT = 60_000;
/** how long this tree's page may take to load the labels' lining twin: until the lobby's first label (ms) */
const TWIN_WAIT = 30_000;
/** how often a wait looks again (ms) */
const POLL = 250;
/** the page's font stylesheet's address as it's written, and as the canary breaks it */
const FONT_SHEET = 'fonts.googleapis.com/css2?';
const BROKEN_SHEET = 'fonts.googleapis.com/css2-lab-canary?';
/** two builds of one PR's preview, visited in turn (each a worker of its own, its caches beside production's) */
const PREVIEWS = ['pr-preview/pr-1/aaaaaaa/', 'pr-preview/pr-1/bbbbbbb/'];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const seconds = (since) => `${((Date.now() - since) / 1000).toFixed(1)} s`;

/**
 * Builds the game in `root` for production into `outDir`; an exported tree finds its packages in this one's. `sha`,
 * when given, is the commit the build says it is (a preview's: its bundle and its worker's cache another build's).
 */
async function buildTree(root, outDir, exported, sha = null) {
  const { build } = await import('vite');
  const buildSha = process.env.BUILD_SHA;
  if (sha) process.env.BUILD_SHA = sha;
  // (in the tree's own folder: an older commit's PWA plugin read `public/` from the working directory, and built
  // there from another tree listed that one's files to precache, its worker never installing for a file it lacked)
  const workingDir = process.cwd();
  process.chdir(root);
  try {
    await build({
      root,
      configFile: join(root, 'vite.config.ts'),
      configLoader: 'runner',
      logLevel: 'error',
      ...(exported ? { plugins: [exportedTreePaths(root, REPO)] } : {}),
      build: { outDir, emptyOutDir: true },
    });
  } finally {
    process.chdir(workingDir);
    if (sha) restoreEnv('BUILD_SHA', buildSha);
  }
}

/** Puts an environment variable back as it was (`value` undefined: it wasn't set). */
function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

/** A build: its name, folder, its page's entry script (which a load shows it by) and its worker's cache's name. */
function buildOf(name, dir) {
  const page = readFileSync(join(dir, 'index.html'), 'utf8');
  const worker = readFileSync(join(dir, 'sw.js'), 'utf8');
  const entry = /<script type="module"[^>]*src="([^"]+)"/.exec(page)?.[1];
  // (named by the worker's scope since the previews' workers stopped deleting production's caches, before as a build)
  const scoped = /const CACHE = OWN \+ '([^']+)'/.exec(worker)?.[1];
  const cacheAt = (scope) => `last-stand:${scope}:${scoped}`;
  const cache = scoped ? cacheAt(BASE) : /const CACHE = '([^']+)'/.exec(worker)?.[1];
  if (!entry || !cache) throw new Error(`lab: pwa: the ${name} build has no entry script or no worker's cache`);
  return { name, dir, entry, cache, cacheAt: scoped ? cacheAt : () => cache };
}

/** A PR preview's commit, named by its folder (`pr-preview/pr-1/aaaaaaa/`: aaaaaaa000...). */
const previewSha = (folder) => folder.split('/').at(-2).padEnd(40, '0');

/**
 * The builds: `from`'s, exported, this tree's, and this tree's as each preview's commit (`previews`, by folder),
 * each another bundle with a worker's cache of its own, as a PR's builds are.
 */
async function buildAll(from) {
  mkdirSync(PWA_DIR, { recursive: true });
  const exported = exportCommit(REPO, OUT, from);
  const oldDir = join(PWA_DIR, 'from');
  const newDir = join(PWA_DIR, 'this');
  await buildTree(exported.dir, oldDir, true);
  await buildTree(REPO, newDir, false);
  const previews = new Map();
  for (const [index, folder] of PREVIEWS.entries()) {
    const dir = join(PWA_DIR, `preview-${index + 1}`);
    await buildTree(REPO, dir, false, previewSha(folder));
    previews.set(folder, buildOf(`the preview at ${folder}`, dir));
  }
  const old = buildOf(`${from} (${exported.sha.slice(0, 7)})`, oldDir);
  return { old, now: buildOf('this tree', newDir), previews };
}

/** The cache the page's worker serves (run in the page): its answer to 'cache', null with no worker. */
function workerCache() {
  const worker = navigator.serviceWorker.controller;
  if (!worker) return null;
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => resolve(event.data);
    worker.postMessage('cache', [channel.port2]);
    setTimeout(() => resolve(null), 1000);
  });
}

/**
 * What the page shows (run in it): its entry script, the faces of each of the game's fonts loaded once its font
 * stylesheet has come (or `wait` has passed), and whether the labels' lining twin loaded.
 */
async function pageShown({ families, wait, twinWait, poll }) {
  const named = (face) => face.family.replace(/["']/g, '');
  const until = async (done, ms) => {
    const started = performance.now();
    while (!done() && performance.now() - started < ms) await new Promise((resolve) => setTimeout(resolve, poll));
    return done();
  };
  await until(() => [...document.fonts].some((face) => named(face) === families[0]), wait);
  const fonts = {};
  for (const family of families) {
    const faces = await document.fonts.load(`16px "${family}"`, 'Ag1').catch(() => []);
    fonts[family] = faces.filter((face) => named(face) === family).length;
  }
  // (made once the first label is painted, as the lobby boots: none is looked for in a build that makes none)
  const lining = (face) => named(face).endsWith(' Lining') && face.status === 'loaded';
  const twinLoaded = () => [...document.fonts].some(lining);
  const twin = twinWait ? await until(twinLoaded, twinWait) : twinLoaded();
  const entry = document.querySelector('script[type="module"][src]')?.getAttribute('src') ?? null;
  return { entry, fonts, twin };
}

/** Asks the page's worker for its cache as the page starts (run in every page before its own scripts), so a load is
 *  known by the worker that served it: a new one takes the page over a moment later. */
function noteWorkerAtLoad() {
  const worker = navigator.serviceWorker?.controller;
  window.__labWorkerAtLoad = !worker ? Promise.resolve(null) : new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => resolve(event.data);
    worker.postMessage('cache', [channel.port2]);
    setTimeout(() => resolve(null), 1000);
  });
}

/** The page's state once it has loaded: what it shows, and the cache of the worker that served it. */
async function stateOf(page, load) {
  const twinWait = load.shows === 'now' ? TWIN_WAIT : 0;
  const shown = await page.evaluate(pageShown, { families: FAMILIES, wait: FONTS_WAIT, twinWait, poll: POLL });
  return { ...shown, cache: await page.evaluate(() => window.__labWorkerAtLoad) };
}

/** Waits until the page's worker is the one with `cache` (null: any worker at all); throws after `WORKER_WAIT`. */
async function waitForWorker(page, cache, what) {
  const started = Date.now();
  while (Date.now() - started < WORKER_WAIT) {
    const now = await page.evaluate(workerCache);
    if (now && (cache === null || now === cache)) return;
    await sleep(POLL);
  }
  throw new Error(`lab: pwa: ${what} never took the page in ${WORKER_WAIT / 1000} s`);
}

/** Which of the builds `value` (an entry script or a cache's name) is, by `key`, for a line. */
function whichBuild(builds, key, value) {
  if (value === builds.now[key]) return 'this tree\'s';
  if (value === builds.old[key]) return 'the old';
  return value ? 'an unknown' : 'no';
}

/** One load's line, and its problems: the game's fonts, and the build it should show. */
function judged(load, state, builds) {
  const fonts = FAMILIES.map((family) => `${family} ${state.fonts[family]}`).join(', ');
  const shown = whichBuild(builds, 'entry', state.entry);
  const under = whichBuild(builds, 'cache', state.cache);
  const twin = state.twin ? '; the labels\' lining twin loaded' : '';
  const line = `  ${load.name}: ${shown} build, under ${under} worker; fonts' faces ${fonts}${twin}`;
  const problems = [];
  const missing = FAMILIES.filter((family) => !state.fonts[family]);
  if (missing.length) problems.push(`${load.name}: the page showed the system's fonts, no ${missing.join(' nor ')}`);
  if (load.shows === 'now' && !state.twin) {
    problems.push(`${load.name}: the labels' lining twin never loaded (their digits old-style)`);
  }
  const wanted = builds[load.shows];
  if (state.entry !== wanted.entry) problems.push(`${load.name}: the page showed ${shown} build, not ${wanted.name}'s`);
  // (a load under another worker than it's for measured nothing of it)
  const worker = load.worker ? builds[load.worker] : null;
  if (worker && state.cache !== worker.cache) problems.push(`${load.name}: served by ${under} worker`);
  return { line, problems };
}

/**
 * The loads, in turn: what each is, the build it should show, what's served for it, whether a worker must have taken
 * the page first (`under`), offline or not. With the canary, a stale page is served for the first load after the swap
 * and the deploy's font stylesheet's address broken after it.
 */
function loadsOf(builds, canary) {
  const broken = (text) => text.replace(FONT_SHEET, BROKEN_SHEET);
  // (the deploy's own files, its worker with them, but the old page: a stale page met on a reload)
  const oldPage = readFileSync(join(builds.old.dir, 'index.html'), 'utf8');
  const stale = () => oldPage;
  return [
    { name: 'the old build, a first visit', shows: 'old', serve: [builds.old.dir], first: true },
    { name: 'the old build, under its worker', shows: 'old', serve: [builds.old.dir], under: 'any', worker: 'old' },
    {
      name: 'this tree deployed, a plain reload under the old worker',
      shows: 'now',
      serve: [builds.now.dir, canary ? stale : null],
      worker: 'old',
    },
    {
      name: 'a reload under this tree\'s worker',
      shows: 'now',
      serve: [builds.now.dir, canary ? broken : null],
      under: builds.now.cache,
      worker: 'now',
    },
    { name: 'a reload offline', shows: 'now', serve: [builds.now.dir], offline: true, worker: 'now' },
  ];
}

/** a closed PR's build, which a phone's app last showed: never served here */
const GONE = 'pr-preview/pr-2/ccccccc/';
/** how long a page may take to show the game, sent on by the 404 page or not (ms) */
const GAME_WAIT = 15_000;

/** Where the page is and the game's entry script once it shows (no entry: it never did in `GAME_WAIT`). */
async function gameShown(page) {
  const started = Date.now();
  let shown = { path: null, entry: null };
  while (Date.now() - started < GAME_WAIT) {
    // (the 404 page sends the page on: a look between the two finds no page to ask)
    shown = await page.evaluate(() => ({
      path: location.pathname,
      entry: document.querySelector('script[type="module"][src]')?.getAttribute('src') ?? null,
    })).catch(() => shown);
    if (shown.entry) return shown;
    await sleep(POLL);
  }
  return shown;
}

/** Opens `url` as the installed app opens a page: what it shows, or the error it couldn't be loaded with. */
async function opened(page, url) {
  try {
    await page.goto(url);
  } catch (error) {
    return { path: null, entry: null, error: error.message.split('\n')[0] };
  }
  return gameShown(page);
}

/** The game an opening showed, for its line: another build's, this tree's, or none. */
function gameNamed(shows, other) {
  if (other) return `${other.name}'s game`;
  return shows ? 'this tree\'s game' : 'no game (Pages\' plain 404 or a browser error)';
}

/**
 * One opening's line, and its problem: a game must show, this tree's or one of `alike` (the builds it may show in its
 * place), at `path` when given.
 */
function judgedOpening(name, shown, builds, { path = null, alike = [] } = {}) {
  const at = shown.error ?? shown.path ?? 'nothing';
  const other = alike.find((build) => build.entry === shown.entry);
  const shows = shown.entry === builds.now.entry || Boolean(other);
  const game = gameNamed(shows, other);
  const line = `  ${name}: ${game}, at ${at}`;
  if (!shows) return { line, problem: `${name}: ${game}` };
  if (path && shown.path !== path) return { line, problem: `${name}: the game at ${shown.path}, not ${path}` };
  return { line, problem: null };
}

/**
 * The installed app, once this tree is deployed: a PR's preview builds visited in turn (each its own worker, its
 * caches beside production's on the one origin), then the app opened offline at its start, at a preview's build pruned
 * since (the page it last showed) and at a closed PR's (Pages' 404 for it). With the canary, production's cache is
 * deleted before the offline start, and a path with nothing is answered with a plain 404, not the build's page.
 */
async function playInstalled({ page, context, host, url, builds, canary }) {
  const lines = [];
  const problems = [];
  const note = (found) => {
    lines.push(found.line);
    if (found.problem) problems.push(found.problem);
  };
  await context.setOffline(false);
  for (const [folder, preview] of builds.previews) {
    host.mount(folder, preview.dir);
    await page.goto(url + folder);
    await waitForWorker(page, preview.cacheAt(BASE + folder), `the preview's worker at ${folder}`);
    lines.push(`  a preview visited, its worker installed: ${folder}`);
  }
  if (canary) await page.evaluate((name) => caches.delete(name), builds.now.cache);
  await context.setOffline(true);
  note(judgedOpening('the app started offline', await opened(page, url), builds));
  await context.setOffline(false);
  // (its worker may still show its own build from its cache; else the 404 page sends it on)
  const [pruned] = PREVIEWS;
  host.unmount(pruned);
  const prunedShown = await opened(page, url + pruned);
  const alike = [builds.previews.get(pruned)];
  note(judgedOpening(`the app at a pruned build (${pruned})`, prunedShown, builds, { alike }));
  host.answerMissingWithPage(!canary);
  const goneShown = await opened(page, url + GONE);
  note(judgedOpening(`the app at a closed PR's build (${GONE})`, goneShown, builds, { path: BASE }));
  return { lines, problems };
}

/** The loads played in a fresh browser: each one's line and problems. */
async function playLoads(builds, canary) {
  const host = new StaticHost(BASE);
  host.serve(builds.old.dir);
  const url = await host.start();
  const browser = await launchBrowser();
  const lines = [];
  const problems = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await context.addInitScript(noteWorkerAtLoad);
    const page = await context.newPage();
    for (const load of loadsOf(builds, canary)) {
      const awaited = load.under === 'any' ? null : load.under;
      if (load.under) await waitForWorker(page, awaited, `the worker for ${load.name}`);
      host.serve(...load.serve);
      await context.setOffline(Boolean(load.offline));
      if (load.first) await page.goto(url);
      else await page.reload();
      const found = judged(load, await stateOf(page, load), builds);
      lines.push(found.line);
      problems.push(...found.problems);
    }
    lines.push('the installed app:');
    const installed = await playInstalled({ page, context, host, url, builds, canary });
    lines.push(...installed.lines);
    problems.push(...installed.problems);
  } finally {
    await browser.close();
    await host.close();
  }
  return { lines, problems };
}

/** The canary's verdict: the stale page, the broken font stylesheet, the lost cache and the plain 404 each found. */
function canaryVerdict(problems) {
  const stale = problems.some((problem) => problem.includes('not this tree'));
  const fonts = problems.some((problem) => problem.includes('the system\'s fonts'));
  const offline = problems.some((problem) => problem.startsWith('the app started offline'));
  const gone = problems.some((problem) => problem.startsWith('the app at a closed PR'));
  const caught = [
    ['stale page', stale],
    ['broken font stylesheet', fonts],
    ['deleted production cache', offline],
    ['plain 404', gone],
  ];
  const lines = caught.map(([what, seen]) => `canary: the ${what} ${seen ? 'caught' : 'went unseen'}`);
  const missed = caught.filter(([, seen]) => !seen).map(([what]) => `the canary's ${what} went unseen`);
  return { lines, missed };
}

/** `lab pwa`: prints the loads and their problems; returns the exit code. */
export async function runPwa(options) {
  const from = typeof options.from === 'string' ? options.from : 'origin/main';
  const canary = Boolean(options.canary);
  const started = Date.now();
  try {
    const builds = await buildAll(from);
    console.log(`built ${builds.old.name}, this tree and its previews (${seconds(started)})`);
    const { lines, problems } = await playLoads(builds, canary);
    console.log([`from ${builds.old.name} to this tree:`, ...lines].join('\n'));
    const missed = canary ? canaryVerdict(problems) : { lines: [], missed: problems };
    if (missed.lines.length) console.log(missed.lines.join('\n'));
    if (missed.missed.length) console.log(`FAILED: ${missed.missed.join('; ')}`);
    console.log(`(${seconds(started)})`);
    return missed.missed.length ? 1 : 0;
  } catch (error) {
    console.log(describeError(error));
    return 1;
  }
}
