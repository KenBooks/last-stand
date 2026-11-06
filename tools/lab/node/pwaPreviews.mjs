// `lab pwa`'s previews (pwa.mjs): a PR's preview builds as the previews service (server/previews) serves them, on an
// origin of their own as the service's host is. Each build is sent as pr-preview.yml sends it (packed by
// scripts/preview/tar.mjs, its stable page and latest.json beside it), the service run in this process, then visited
// as a player visits it: the stable page going to the newest build, its worker installed, the build reloaded offline,
// a pruned build's page and a closed PR's opened. The game must show every time.
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { start } from '../../../server/previews/previews.mjs';
import { latestJson, stablePage } from '../../../scripts/preview/latest.mjs';
import { previewServer } from '../../../scripts/preview/server.mjs';
import { packFolder } from '../../../scripts/preview/tar.mjs';
import { OUT, REPO } from './paths.mjs';

const DIR = join(OUT, 'pwa', 'previews-service');
const TOKEN = 'lab';
const PR = 1;
/** a closed PR's preview, which an installed app last showed: never sent */
const GONE_PR = 2;
const WAIT = 15_000;
const POLL = 250;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The build's folder's name (`aaaaaaa`) from a preview's (`pr-preview/pr-1/aaaaaaa/`). */
const folderName = (folder) => folder.split('/').at(-2);

/** Where the page is and the game's entry script once it shows (none in `WAIT`: no game). */
async function gameShown(page) {
  const started = Date.now();
  let shown = { path: null, entry: null };
  while (Date.now() - started < WAIT) {
    shown = await page.evaluate(() => ({
      path: location.pathname,
      entry: document.querySelector('script[type="module"][src]')?.getAttribute('src') ?? null,
    })).catch(() => shown);
    if (shown.entry) return shown;
    await sleep(POLL);
  }
  return shown;
}

/** Opens `url`: what it shows, or the error it couldn't be loaded with. */
async function opened(page, url) {
  try {
    await page.goto(url);
  } catch (error) {
    return { path: null, entry: null, error: error.message.split('\n')[0] };
  }
  return gameShown(page);
}

/** The page's worker's cache once one with `cache` has it; throws past `WAIT`. */
async function waitForWorker(page, cache, what) {
  const started = Date.now();
  while (Date.now() - started < WAIT * 4) {
    const now = await page.evaluate(() => {
      const worker = navigator.serviceWorker.controller;
      if (!worker) return null;
      return new Promise((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = (event) => resolve(event.data);
        worker.postMessage('cache', [channel.port2]);
        setTimeout(() => resolve(null), 1000);
      });
    }).catch(() => null);
    if (now === cache) return;
    await sleep(POLL);
  }
  throw new Error(`lab: pwa: ${what} never took the page in ${(WAIT * 4) / 1000} s`);
}

/** One opening's line and problem: one of `builds` (by entry) must show, at `path` when given. */
function judgedOpening(name, shown, builds, path = null) {
  const at = shown.error ?? shown.path ?? 'nothing';
  const build = builds.find((each) => each.entry === shown.entry);
  const game = build ? `${build.name}'s game` : 'no game';
  const line = `  ${name}: ${game}, at ${at}`;
  if (!build) return { line, problem: `the previews service: ${name}: ${game}` };
  if (path && shown.path !== path) {
    return { line, problem: `the previews service: ${name}: the game at ${shown.path}, not ${path}` };
  }
  return { line, problem: null };
}

/** Each preview build sent as the workflow sends it; with `stale`, the newest's latest.json is left unsent. */
async function sendBuild(server, folder, preview, { template, stale }) {
  const name = folderName(folder);
  const sha = name.padEnd(40, '0');
  const archive = join(DIR, `${name}.tar.gz`);
  await packFolder(preview.dir, archive);
  await server.putBuild(PR, sha, archive);
  await server.putPage(PR, stablePage(template, { repo: 'lab/game', number: PR, folder: name }));
  if (stale) return;
  const run = 'https://github.com/lab/game/actions/runs/1';
  await server.putLatest(PR, latestJson({ sha, state: 'ready', folder: name, run }));
}

/**
 * The previews visited on the service: `builds` as pwa.mjs built them (`previews` by folder, `now` production's),
 * `productionUrl` where production is served (a gone PR's page goes there). With the canary, the newest build's
 * latest.json is never sent, so the stable page never goes to it.
 */
export async function playPreviewService({ browser, builds, productionUrl, canary }) {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  // (each PR keeps its newest build alone here, so the second sent prunes the first)
  const service = await start(0, { DATA: join(DIR, 'data'), PREVIEWS_TOKEN: TOKEN, KEEP: '1', SITE: productionUrl });
  const origin = `http://127.0.0.1:${service.address().port}`;
  const server = previewServer({ origin, token: TOKEN, fetch });
  const template = readFileSync(join(REPO, '.github', 'preview-index.html'), 'utf8');
  const lines = [`the previews service (${origin}):`];
  const problems = [];
  const note = ({ line, problem }) => {
    lines.push(line);
    if (problem) problems.push(problem);
  };
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const page = await context.newPage();
    const folders = [...builds.previews.keys()];
    for (const [index, folder] of folders.entries()) {
      const preview = builds.previews.get(folder);
      const stale = canary && index === folders.length - 1;
      await sendBuild(server, folder, preview, { template, stale });
      const shown = await opened(page, server.stableUrl(PR));
      note(judgedOpening(`the stable page, ${folderName(folder)} sent`, shown, [preview], `/${folder}`));
      if (shown.entry !== preview.entry) continue;
      await waitForWorker(page, preview.cacheAt(`/${folder}`), `the preview's worker at ${folder}`);
      await context.setOffline(true);
      await page.reload().catch(() => {});
      note(judgedOpening(`${folderName(folder)} reloaded offline`, await gameShown(page), [preview]));
      await context.setOffline(false);
    }
    const all = [...builds.previews.values()];
    const [pruned] = folders;
    note(judgedOpening(`the app at a pruned build (${pruned})`, await opened(page, `${origin}/${pruned}`), all));
    const gone = `${origin}/pr-preview/pr-${GONE_PR}/ccccccc/`;
    const production = new URL(productionUrl).pathname;
    note(judgedOpening(`the app at a closed PR's build`, await opened(page, gone), [builds.now], production));
  } finally {
    await context.close();
    service.close();
  }
  return { lines, problems };
}
