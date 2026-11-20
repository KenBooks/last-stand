// The dashboard on sample data, to work on it and take its pictures (`npm run traces:demo`): the service on
// localhost with its own folder (.tmp/traces-demo, emptied at each start), a token of its own, and a few dozen
// traces and bug reports sent to it the way games send them, and 30 days of made-up players' sums with a few live
// heartbeats. It prints a sign-in link, signed as Dokci signs one
// (server/traces/AGENTS.md), good once for 5 minutes; open it in a browser. Never touches production's data.
// `-- --pictures` instead takes each section's picture at a desktop's and a phone's width in the installed Chrome,
// headless, into .tmp/traces-demo-pictures, and stops (a PR's pictures of the dashboard).
import { createHmac } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { encodeTrace } from '../../src/perf/traceFormat.ts';
import { dayOf } from './stats.mjs';
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
/** the made-up players' history: days of it, and the live heartbeats sent on top */
const STAT_DAYS = 30;
const LIVE_PLAYERS = 7;
const DAY = 24 * HOUR;
const SLOTS = 288;

const REPORTS = [
  ['looks', 'The warrior\'s arm goes through his shield when he blocks while running.', 'The shield stays on his arm.'],
  ['gameplay', 'Bank after wave 7 kept nothing I had found in the bag.', 'Everything found is kept.'],
  ['slow', 'The village drops to about 20 fps at night near the fountain on my phone.', ''],
  ['coop', 'My partner\'s hero froze for a few seconds after I went through the Crypt portal.', 'We both arrive.'],
  ['menus', 'The stash\'s tooltip covers the item I am trying to drag on a small screen.', ''],
  ['idea', 'A key to repeat the last skill would help on the mage.', ''],
];

/** Each section's address, a name for its pictures, what shows once it has read what it shows, and what the
 *  pointer rests on for its picture (a chart's tooltip). */
const SECTIONS = [
  { name: 'traces', path: '/traces', ready: 'tbody tr' },
  { name: 'players', path: '/traces/players', ready: 'app-time-chart .line', hover: 'app-time-chart svg' },
  { name: 'reports', path: '/traces/reports', ready: 'tbody tr' },
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

/** How many are online in slot `slot` (5 minutes) of a day `growth` far into the history: an evening's peak, a
 *  night's low, a little wobble. */
function onlineAt(slot, growth) {
  const hour = slot / 12;
  const evening = Math.exp(-((hour - 20) ** 2) / 18);
  const afternoon = 0.5 * Math.exp(-((hour - 15) ** 2) / 10);
  const wobble = 0.85 + 0.3 * Math.abs(Math.sin(slot * 12.9898));
  return Math.round((2 + 26 * (evening + afternoon)) * growth * wobble);
}

/** A made-up day's sums as stats.mjs keeps them (ids as stand-ins for the hashed ones), `back` days ago. */
function statDay(back, now) {
  const growth = 0.6 + 0.4 * (1 - back / STAT_DAYS);
  const lastSlot = back === 0 ? Math.floor((now % DAY) / (5 * 60_000)) : SLOTS - 1;
  const online = Array.from({ length: SLOTS }, (_, slot) => (slot <= lastSlot ? onlineAt(slot, growth) : 0));
  const minutes = online.reduce((sum, count) => sum + count * 5, 0);
  const players = Math.round(minutes / 38);
  // (players overlap from day to day, each day's distinct: a pool of 4 times a day's, so a week's and a month's
  // count each once)
  const pool = players * 4;
  const shift = Math.round(players * 0.3) * back;
  const ids = Array.from({ length: players }, (_, i) => `p${(i + shift) % pool}`);
  const sums = {
    minutes, fight: Math.round(minutes * 0.62), coop: Math.round(minutes * 0.18), sessions: Math.round(players * 1.6),
    newPlayers: Math.round(players * 0.15), online, ids,
  };
  const test = { minutes: 40 + back * 3, fight: 20, coop: 5, sessions: 3, newPlayers: 0, online: online.map(() => 0), ids: ['t1', 't2'] };
  return { live: sums, test };
}

/** The made-up history written where the service reads it at its start. */
function writeStatHistory() {
  const folder = join(DATA, 'stats');
  mkdirSync(folder, { recursive: true });
  const now = Date.now();
  for (let back = 0; back < STAT_DAYS; back++) {
    writeFileSync(join(folder, `${dayOf(now - back * DAY)}.json`), JSON.stringify(statDay(back, now)));
  }
}

/** A heartbeat as the game sends one, from the i-th live player. */
function heartbeat(i) {
  const id = Buffer.from(`demo-player-${i}`.padEnd(16, '.')).toString('base64url');
  return JSON.stringify({ id, where: i % 3 ? 'fight' : 'lobby', coop: i % 4 === 0, start: true, first: false });
}

/** Sends `body` to `path` as a game does. */
function post(path, body) {
  const headers = { origin: ORIGIN, 'x-forwarded-for': `1.2.3.4, ${SENDER}` };
  return fetch(`http://127.0.0.1:${PORT}${path}`, { method: 'POST', body, headers });
}

/** The service started on an empty folder, the sample sent to it. */
async function startWithSample() {
  rmSync(DATA, { recursive: true, force: true });
  writeStatHistory();
  const server = await start(PORT, {
    DATA, TRACES_TOKEN: TOKEN, ORIGINS: ORIGIN, TRUSTED_ADDRESSES: SENDER,
    PER_DAY: '1000', PER_DAY_ALL: '1000', REPORT_PER_HOUR: '100', REPORT_PER_DAY: '100',
  });
  for (let i = 0; i < TRACES; i++) await post('/traces', sample(i));
  for (let i = 0; i < LIVE_PLAYERS; i++) await post('/traces/beat', heartbeat(i));
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
        await page.locator(section.ready).first().waitFor();
        if (section.hover) await page.locator(section.hover).first().hover();
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
