// The dashboard on sample data, to work on it and take its pictures (`npm run traces:demo`): the service on
// localhost with its own folder (.tmp/traces-demo, emptied at each start), a token of its own, and a few dozen
// traces and bug reports sent to it the way games send them. It prints a sign-in link, signed as Dokci signs one
// (server/traces/AGENTS.md), good once for 5 minutes; open it in a browser. Never touches production's data.
// `-- --pictures` instead takes each section's picture at a desktop's and a phone's width in the installed Chrome,
// headless, into .tmp/traces-demo-pictures, and stops (a PR's pictures of the dashboard).
import { createHmac } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { encodeTrace } from '../../src/perf/traceFormat.ts';
import { start } from './traces.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const DATA = join(ROOT, '.tmp', 'traces-demo');
const PICTURES = join(ROOT, '.tmp', 'traces-demo-pictures');
const PORT = Number(process.env.PORT ?? 8788);
const TOKEN = 'demo';
const ORIGIN = 'https://last-stand.cc';
/** the sample's sender: trusted, so the day's limits don't cut the sample short */
const SENDER = '10.9.9.9';
const HOUR = 3600_000;

const SCENES = ['fight', 'fight', 'fight', 'lobby', 'village', 'hall', 'boot'];
const WHYS = ['low', 'low', 'stall', 'stall', 'manual', 'freeze'];
const GPUS = ['Mali-G78', 'Adreno 740', 'Intel Iris Xe', 'Apple M1', 'NVIDIA GeForce RTX 3060', 'AMD Radeon 680M'];
const QUALITY = ['low', 'medium', 'high', 'very low'];
const COMMITS = ['37c2e75', '466acd5', '6b811b1', '676fe76', 'b5d008a'];
const TRACES = 42;

const REPORTS = [
  ['looks', 'The warrior\'s arm goes through his shield when he blocks while running.', 'The shield stays on his arm.'],
  ['gameplay', 'Bank after wave 7 kept nothing I had found in the bag.', 'Everything found is kept.'],
  ['slow', 'The village drops to about 20 fps at night near the fountain on my phone.', ''],
  ['coop', 'My partner\'s hero froze for a few seconds after I went through the Crypt portal.', 'We both arrive.'],
  ['menus', 'The stash\'s tooltip covers the item I am trying to drag on a small screen.', ''],
  ['idea', 'A key to repeat the last skill would help on the mage.', ''],
];

/** Each section's address and a name for its pictures. */
const SECTIONS = [
  { name: 'traces', path: '/traces' },
  { name: 'reports', path: '/traces/reports' },
];
const SCREENS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'phone', width: 390, height: 844 },
];

/** The i-th sample trace: its scene, why, GPU and build picked in turn, so the list and its sums vary. */
function sample(i) {
  const frames = 120 + ((i * 37) % 900);
  const interval = Array.from({ length: frames }, (_, f) => 7 + ((f * 13 + i) % 30));
  const pr = i % 3 === 0 ? 700 + (i % 9) : null;
  const header = {
    at: new Date(Date.now() - i * 5 * HOUR).toISOString(),
    build: { bundle: pr ? 'index-pr.js' : 'index-main.js', commit: COMMITS[i % COMMITS.length], pr },
    page: '/',
    reason: { scene: SCENES[i % SCENES.length], why: WHYS[i % WHYS.length] },
    device: { gpu: GPUS[i % GPUS.length], ua: 'demo' },
    settings: { quality: QUALITY[i % QUALITY.length] },
    game: {},
    columns: [{ name: 'interval', kind: 'ms' }],
    longFrames: [],
    marks: [],
  };
  return gzipSync(encodeTrace(header, frames, { interval }));
}

/** Sends `body` to `path` as a game does. */
function post(path, body) {
  const headers = { origin: ORIGIN, 'x-forwarded-for': `1.2.3.4, ${SENDER}` };
  return fetch(`http://127.0.0.1:${PORT}${path}`, { method: 'POST', body, headers });
}

/** The service started on an empty folder, the sample sent to it. */
async function startWithSample() {
  rmSync(DATA, { recursive: true, force: true });
  const server = await start(PORT, {
    DATA, TRACES_TOKEN: TOKEN, ORIGINS: ORIGIN, TRUSTED_ADDRESSES: SENDER,
    PER_DAY: '1000', PER_DAY_ALL: '1000', REPORT_PER_HOUR: '100', REPORT_PER_DAY: '100',
  });
  for (let i = 0; i < TRACES; i++) await post('/traces', sample(i));
  for (const [kind, text, expected] of REPORTS) {
    const facts = ['Where: the lobby', `Build: ${COMMITS[0]}`, 'Quality: medium'];
    await post('/traces/reports', JSON.stringify({ kind, text, expected, facts, picture: null }));
  }
  return server;
}

/** A sign-in link, as Dokci makes one: HMAC-SHA256 by the token over the host, the path and its expiry. */
function signInLink() {
  const host = 'localhost';
  const exp = Math.floor(Date.now() / 1000) + 300;
  const signed = `dokci-link/v1\n${host}\n/traces\n${exp}`;
  const sig = createHmac('sha256', TOKEN).update(signed, 'utf8').digest('base64url');
  return `http://${host}:${PORT}/traces?dokci_link=v1.${exp}.${sig}`;
}

/** Each section at each screen's width, its whole page, into PICTURES; the paths written. */
async function takePictures() {
  const { chromium } = await import('playwright-core');
  mkdirSync(PICTURES, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio'] });
  const written = [];
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(signInLink());
    await page.waitForURL(/\/traces\/?$/);
    for (const screen of SCREENS) {
      await page.setViewportSize({ width: screen.width, height: screen.height });
      for (const section of SECTIONS) {
        await page.goto(`http://localhost:${PORT}${section.path}`);
        await page.locator('tbody tr').first().waitFor();
        const path = join(PICTURES, `${section.name}-${screen.name}.png`);
        await page.screenshot({ path, fullPage: screen.name === 'desktop' });
        written.push(path);
      }
    }
  } finally {
    await browser.close();
  }
  return written;
}

const server = await startWithSample();
if (process.argv.includes('--pictures')) {
  const written = await takePictures();
  console.log(`The dashboard's pictures:\n${written.join('\n')}`);
  server.close();
} else {
  console.log(`The dashboard on sample data. Sign in (good once, 5 min): ${signInLink()}`);
  console.log(`Or read it with the token "${TOKEN}". Ctrl+C stops it.`);
}
