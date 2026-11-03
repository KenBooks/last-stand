// The installed Chrome, started for a measure of its stalls (tools/stalls): on the machine's GPU, with a profile of
// its own made fresh each time (its shader caches empty, as a first visit's after an update), and killed with its
// whole process tree however the measure ends (a browser connected over CDP outlives `browser.close()`), its profile
// deleted after it.
import { chromium } from 'playwright-core';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';

/** where Chrome is installed, by platform, tried in order (CHROME_EXE comes first) */
const INSTALLED = {
  win32: [
    join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
    join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
    join(process.env.LOCALAPPDATA ?? '', 'Google\\Chrome\\Application\\chrome.exe'),
  ],
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
  linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'],
};

/** how long Chrome is given to open its debugging port, and how often it's asked */
const CONNECT_TRIES = 80;
const CONNECT_WAIT_MS = 250;
/** a profile's files may be held a moment after the browser is killed: its deletion is tried again this often */
const REMOVE_TRIES = 5;
const REMOVE_WAIT_MS = 200;

/** The installed Chrome's path: CHROME_EXE, else the first of its usual places that exists. */
export function chromePath() {
  const candidates = [process.env.CHROME_EXE, ...(INSTALLED[process.platform] ?? [])].filter(Boolean);
  const found = candidates.find((path) => existsSync(path));
  if (!found) throw new Error(`stalls: no Chrome found (set CHROME_EXE); tried ${candidates.join(', ')}`);
  return found;
}

/** A free TCP port on this machine. */
function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/**
 * The flags: the GPU through ANGLE (Direct3D 11 on Windows, as the reports' browsers draw), nothing asked of the
 * user, the window `width` by `height` (css px) on a screen scaled `scale`, and its sound muted: the game's music and
 * sounds still play (their cost is the page's), but out of no speaker (headless, the owner heard them). Nothing is
 * fetched in the background: the models, Safe Browsing's lists and the components Chrome fetches into a new profile
 * were 85 MB of its 120, each measure's, left behind where a sandboxed shell can't delete Chrome's files.
 */
function chromeArgs({ headed, profile, port, width, height, scale }) {
  const size = [`--window-size=${width},${height}`, `--force-device-scale-factor=${scale}`];
  const visible = headed ? size : ['--headless', ...size];
  const angle = process.platform === 'win32' ? ['--use-angle=d3d11'] : [];
  return [
    ...visible,
    ...angle,
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    '--no-first-run',
    '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required',
    '--mute-audio',
    '--disable-background-networking',
    '--disable-component-update',
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`,
    'about:blank',
  ];
}

/** Connects to the browser on `port`, waiting for it to open the port. */
async function connect(port) {
  for (let tries = 0; tries < CONNECT_TRIES; tries++) {
    try {
      return await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, CONNECT_WAIT_MS));
    }
  }
  throw new Error(`stalls: Chrome never opened its debugging port ${port}`);
}

/** Kills `child` and every process it started (Chrome's GPU, renderer and utility processes), unless it has ended. */
function killTree(child) {
  if (child.exitCode !== null) return;
  if (process.platform !== 'win32') {
    child.kill('SIGKILL');
    return;
  }
  spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
}

/**
 * Deletes a profile once the browser that used it has let go of its files. Returns whether it could: from a sandboxed
 * shell, the files Chrome wrote may be its own to delete alone.
 */
async function removeProfile(profile) {
  for (let tries = 0; tries < REMOVE_TRIES; tries++) {
    try {
      rmSync(profile, { recursive: true, force: true });
      return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, REMOVE_WAIT_MS));
    }
  }
  return false;
}

/** Deletes a profile, or says it couldn't. */
async function removeOrWarn(profile) {
  if (await removeProfile(profile)) return;
  console.warn(`stalls: couldn't delete the profile ${profile} (no permission, or still in use): delete it by hand`);
}

/** Slows `page`'s CPU `rate` times (CDP's throttling, kept across its loads: a phone's slower cores), unless
 *  `rate` is 1. Returns the way to set it again (1: at full speed), on the session that set it. */
export async function slowCpu(page, rate) {
  if (rate <= 1) return async () => {};
  const session = await page.context().newCDPSession(page);
  const setRate = (to) => session.send('Emulation.setCPUThrottlingRate', { rate: to });
  await setRate(rate);
  return setRate;
}

/**
 * Starts the installed Chrome with a fresh profile under `outDir` (headless unless `headed`, its screen scaled
 * `scale`) and connects to it.
 * Returns the browser, its profile's folder and `close`, which kills its process tree and deletes its profile.
 */
export async function startChrome({ outDir, headed = false, width = 1536, height = 864, scale = 1 }) {
  const profile = join(outDir, `profile-${Date.now()}`);
  mkdirSync(profile, { recursive: true });
  const port = await freePort();
  const child = spawn(chromePath(), chromeArgs({ headed, profile, port, width, height, scale }), { stdio: 'ignore' });
  const kill = () => killTree(child);
  process.once('exit', kill);
  try {
    const browser = await connect(port);
    return {
      browser,
      profile,
      async close() {
        // (its tree first: once the browser has closed itself, the processes it leaves are no longer under it)
        kill();
        await browser.close().catch(() => {});
        await removeOrWarn(profile);
      },
    };
  } catch (error) {
    kill();
    await removeOrWarn(profile);
    throw error;
  }
}
