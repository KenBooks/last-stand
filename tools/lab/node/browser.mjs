// The lab's browser (tools/lab): headless, and a page in it can never capture the real pointer or keyboard (pointer
// lock, keyboard lock and fullscreen are stubbed before any page script runs). Its profile and everything else it
// writes stay under tools/lab/out, never in the user's temp folder.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { lowerProcess } from './priority.mjs';

/** Points TEMP and TMP at `dir`/tmp: Playwright puts the browser's profile under os.tmpdir(), which reads them. */
export function useLocalTemp(dir) {
  const tmp = join(dir, 'tmp');
  mkdirSync(tmp, { recursive: true });
  process.env.TEMP = tmp;
  process.env.TMP = tmp;
  process.env.TMPDIR = tmp;
}

/** the browsers tried, in order: Playwright's Chromium, then Edge, then Chrome */
const CHANNELS = ['chromium', 'msedge', 'chrome'];

/**
 * The GPU's flags: the machine's own graphics through ANGLE (Direct3D 11 on Windows, Metal on macOS; elsewhere the
 * browser's own choice), and the GPU used even where the browser's blocklist would turn it off. A page that lost its
 * context isn't then refused another: with eight browsers booting at once on a lent PC, a boot lost its context and
 * Chrome blocked the page from WebGL till the browser closed ("Web page caused context loss and was blocked"), so
 * the boot tried again failed too, two shards of a check's eight.
 */
function gpuArgs() {
  const angle = { win32: 'd3d11', darwin: 'metal' }[process.platform];
  const args = ['--enable-gpu', '--ignore-gpu-blocklist', '--disable-domain-blocking-for-3d-apis'];
  if (angle) args.unshift(`--use-angle=${angle}`);
  return args;
}

/**
 * Each of `browser`'s processes that runs above the lab's priority lowered to it (priority.mjs); how many were. Its
 * processes inherit the lab's, below normal, but Chrome raised its GPU process to above normal as it started and a
 * page's renderer to normal as it showed it, the two that work hardest (`--disable-renderer-priority-management`
 * left the renderer raised, and the GPU's is a feature: a `--disable-features` of our own replaces Playwright's list).
 */
export async function lowerProcesses(browser) {
  const cdp = await browser.newBrowserCDPSession();
  try {
    const { processInfo } = await cdp.send('SystemInfo.getProcessInfo');
    return processInfo.filter(({ id }) => lowerProcess(id)).length;
  } finally {
    await cdp.detach();
  }
}

/** every browser the lab launched that is still open */
const OPEN_BROWSERS = new Set();

/** Closes every browser the lab has open (the command was stopped, running.mjs), within `ms`. */
export async function closeEveryBrowser(ms = 5000) {
  const closing = Promise.allSettled([...OPEN_BROWSERS].map((browser) => browser.close()));
  const waited = new Promise((resolve) => {
    setTimeout(resolve, ms).unref();
  });
  await Promise.race([closing, waited]);
}

/** the context of each browser launched on a profile kept from run to run (`launchBrowser`'s `profile`) */
const KEPT_CONTEXTS = new WeakMap();

/**
 * The context `browser` keeps on its profile, once (null after, and for a browser launched on a fresh profile): its
 * storage is on the profile's disk, the procedural maps a page made among it (src/core/kept.ts), kept for the next run.
 */
export function takeKeptContext(browser) {
  const context = KEPT_CONTEXTS.get(browser) ?? null;
  KEPT_CONTEXTS.delete(browser);
  return context;
}

/**
 * A browser launched on `profile`, a folder kept from run to run, its pages `contextOptions`' size; null if it won't
 * launch there (another browser has the profile open). Launched on a fresh profile, every first boot of a check's
 * eight sessions made every map again and compiled every program, each taking 45 to 55 s, eight at once, where a
 * boot on a kept one takes 10.
 */
async function launchOnProfile(profile, channel, contextOptions) {
  try {
    const options = { headless: true, channel, args: gpuArgs(), ...contextOptions };
    const context = await chromium.launchPersistentContext(profile, options);
    // (the page it opens with closed: two pages alive at once, one loses the focus)
    for (const page of context.pages()) await page.close();
    const browser = context.browser();
    KEPT_CONTEXTS.set(browser, context);
    return browser;
  } catch {
    return null;
  }
}

/**
 * Launches a browser in its native headless mode: Playwright's Chromium (npx playwright install chromium), else Edge
 * or Chrome. (`channel: 'chromium'` is the full browser run headless, not Playwright's separate headless shell, a
 * console program that opened a console window of its own.) On `profile`, a folder kept from run to run, where it
 * can (`launchOnProfile`), its own context there sized by `contextOptions` (`takeKeptContext`); else on a fresh one.
 */
export async function launchBrowser({ profile = null, contextOptions = {} } = {}) {
  const failures = [];
  for (const channel of CHANNELS) {
    try {
      const kept = profile ? await launchOnProfile(profile, channel, contextOptions) : null;
      const browser = kept ?? await chromium.launch({ headless: true, channel, args: gpuArgs() });
      OPEN_BROWSERS.add(browser);
      browser.on('disconnected', () => OPEN_BROWSERS.delete(browser));
      await lowerProcesses(browser);
      return browser;
    } catch (error) {
      failures.push(`${channel}: ${String(error?.message ?? error).split('\n')[0]}`);
    }
  }
  const tried = failures.map((failure) => `\n  ${failure}`).join('');
  throw new Error(`lab: no browser would start (install one: npx playwright install chromium)${tried}`);
}

// ---- scripts run in every page before its own (each is serialized into the page: it can use nothing from here)

/** For an A/B's side on a commit from before the heroes' capes were taken off: its capes step in the page from its
 *  boot (`cape.ts`, `__labCapesHere`), never in the cape's worker pool, which with eight pages booting side by side
 *  failed to start in one and the page's error failed the command. */
function capesHere() {
  window.__labCapesHere = true;
}

/**
 * The page can't take the pointer, the keyboard or the screen; attempts are counted in `window.__lockAttempts`.
 *
 * A measure of mouse look (`lab cursor`) has the page play the pointer lock instead (`window.__labLock.on`), as the
 * browser holds one: taken on a request made while a click or a key still counts as the player's, let go on exit,
 * each change told to the page (`pointerlockchange`); while it's held, every event of the mouse goes to the locked
 * element (none of its hover), at the point where the mouse was as it was taken, its moves told only as movement. So
 * a click on the HUD over mouse look lands on the game's canvas, as the player's does. The real lock is never taken:
 * a probe once took the owner's mouse.
 */
export function noCapture() {
  window.__lockAttempts = 0;
  const lock = { on: false, element: null, at: { x: 0, y: 0 } };
  window.__labLock = lock;
  // (where the mouse was at its last event of each kind, and at its last of any: a move's movement is from its kind's)
  const seen = {};
  let mouse = { x: 0, y: 0 };
  const changed = () => queueMicrotask(() => document.dispatchEvent(new Event('pointerlockchange')));
  const refuse = function () {
    window.__lockAttempts++;
    return Promise.resolve();
  };
  const take = function () {
    window.__lockAttempts++;
    if (!lock.on) return Promise.resolve();
    if (!navigator.userActivation.isActive) {
      return Promise.reject(new DOMException('no click or key the player made just now', 'NotAllowedError'));
    }
    lock.element = this;
    lock.at = { ...mouse };
    changed();
    return Promise.resolve();
  };
  const exit = () => {
    if (!lock.element) return;
    lock.element = null;
    changed();
  };
  for (const proto of [Element.prototype, HTMLElement.prototype, HTMLCanvasElement.prototype]) {
    Object.defineProperty(proto, 'requestPointerLock', { value: take, configurable: false, writable: false });
    Object.defineProperty(proto, 'requestFullscreen', { value: refuse, configurable: false, writable: false });
  }
  Object.defineProperty(Document.prototype, 'exitPointerLock', { value: exit, configurable: false });
  Object.defineProperty(Document.prototype, 'pointerLockElement', { get: () => lock.element, configurable: false });
  if (navigator.keyboard) Object.defineProperty(navigator.keyboard, 'lock', { value: refuse, configurable: false });

  const HOVER = ['mouseover', 'mouseout', 'mouseenter', 'mouseleave'];
  const POINTER_HOVER = ['pointerover', 'pointerout', 'pointerenter', 'pointerleave'];
  const SENT = ['mousemove', 'mousedown', 'mouseup', 'click', 'auxclick', 'dblclick', 'contextmenu', 'wheel'];
  const POINTER_SENT = ['pointermove', 'pointerdown', 'pointerup'];
  const MOVES = ['mousemove', 'pointermove'];
  const FIELDS = [
    'bubbles', 'cancelable', 'composed', 'view', 'detail', 'screenX', 'screenY', 'ctrlKey', 'shiftKey', 'altKey',
    'metaKey', 'button', 'buttons', 'pointerId', 'pointerType', 'isPrimary', 'width', 'height', 'pressure', 'deltaX',
    'deltaY', 'deltaZ', 'deltaMode',
  ];
  /** The event the locked element gets for the mouse's `event`: at the lock's point, its move as movement alone. */
  const lockedCopy = (event) => {
    const init = {};
    for (const field of FIELDS) {
      if (field in event) init[field] = event[field];
    }
    const from = seen[event.type] ?? mouse;
    const moves = MOVES.includes(event.type);
    init.clientX = lock.at.x;
    init.clientY = lock.at.y;
    init.movementX = moves ? event.clientX - from.x : 0;
    init.movementY = moves ? event.clientY - from.y : 0;
    return new event.constructor(event.type, init);
  };
  // (a pointer's down the page cancels holds back the mouse's down, moves and up after it, as the browser does)
  const HELD_BACK = ['mousedown', 'mousemove', 'mouseup'];
  let heldBack = false;
  const toLocked = (event) => {
    if (!event.isTrusted) return;
    const copy = lock.element ? lockedCopy(event) : null;
    seen[event.type] = { x: event.clientX, y: event.clientY };
    mouse = seen[event.type];
    if (!copy) return;
    event.stopImmediatePropagation();
    // (never a pointer's event cancelled here: that would hold the mouse's back)
    if (!event.type.startsWith('pointer')) event.preventDefault();
    const held = heldBack && HELD_BACK.includes(event.type);
    if (event.type === 'mouseup') heldBack = false;
    if (held) return;
    lock.element.dispatchEvent(copy);
    if (event.type === 'pointerdown') heldBack = copy.defaultPrevented;
  };
  const noHover = (event) => {
    if (event.isTrusted && lock.element) event.stopImmediatePropagation();
  };
  for (const type of [...SENT, ...POINTER_SENT]) {
    window.addEventListener(type, toLocked, { capture: true, passive: false });
  }
  for (const type of [...HOVER, ...POINTER_HOVER]) window.addEventListener(type, noHover, true);
}

/**
 * The lab's clock (`window.__labClock`, read by page/lab.ts). It runs in real time until the loading screen reveals
 * the game; from then on (`manual`) the game's animation frames are queued for the lab to run, each `frame` ms long.
 *
 * Every time the page reads is on a grid of 1/1024 ms, and a frame is a whole number of its steps (a hair over a 60th
 * of a second), so the differences the game takes between them are exact. With the browser's own times and frames of
 * exactly 1000/60 ms, each boot's frame time came out a few bits apart (0.01666666666666606 s on one, ...697 on
 * another), and a cast lasting a whole number of 60ths ended a frame early or late, as its sum of them fell either
 * side. On the grid every boot has the same frame time, and a cast of n 60ths always takes n frames.
 */
function labClock() {
  const GRID = 1024;
  const onGrid = (ms) => Math.round(ms * GRID) / GRID;
  const browserFrame = window.requestAnimationFrame.bind(window);
  const browserNow = performance.now.bind(performance);
  // (`realNow`: the browser's own clock, off the grid, for timing the page's work: performance.now is the lab's;
  // `realFrame`: a frame the browser draws, the game's own left queued, for a page change to reach the screen)
  const realFrame = () => new Promise((resolve) => browserFrame(() => resolve()));
  const clock = { mode: 'real', t: 0, frame: 17067 / GRID, queue: [], realNow: browserNow, realFrame };
  window.__labClock = clock;
  window.requestAnimationFrame = (callback) => {
    if (clock.mode !== 'real') {
      clock.queue.push(callback);
      return 0;
    }
    return browserFrame((time) => {
      if (clock.mode !== 'real') {
        clock.queue.push(callback);
        return;
      }
      clock.t = onGrid(time);
      callback(clock.t);
    });
  };
  performance.now = () => (clock.mode === 'real' ? onGrid(browserNow()) : clock.t);
  // (manual from the moment the loading screen reveals the game, which starts its updates: the frames until the lab
  // took over ran on the browser's clock, as many as the page managed, and every boot's state was a little different)
  const reveal = new MutationObserver(() => {
    if (!document.getElementById('loading')?.classList.contains('done')) return;
    clock.mode = 'manual';
    reveal.disconnect();
  });
  reveal.observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });
}

/**
 * `Math.random` seeded, the same sequence on every boot: a new profile rolls its weapons, and with the same seed
 * both sides of an A/B carry the same gear. `window.__labSeed(n)` starts the sequence again, as each set-up does, and
 * `window.__labFrame()` at each lab frame starts it again from that seed and the frames since.
 * What runs in a timer's callback draws from a stream of its own: timers fire by the browser's clock, and the
 * loading screen's tips, picked every 6 s, took numbers from the sequence as many times as the boot was long, so a
 * slower boot rolled other weapons (the two sides of a commit compared with itself had 360 and 392 energy). And the
 * sequence starts again as a hero's profile is found missing, just before a new one is rolled (src/loot/profile.ts),
 * so its gear is the seed's alone: every three.js object made draws numbers for its id, and a commit that made one
 * more as its modules loaded rolled the ranger another bow and 2 less Health than main, every A/B of him two heroes.
 */
function seededRandom() {
  // mulberry32
  const generator = (seed) => {
    let state = seed | 0;
    const next = () => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.reseed = (value) => {
      state = value | 0;
    };
    return next;
  };
  const sequence = generator(0x9e3779b9);
  const timerStream = generator(0x85ebca6b);
  // (the sequence started again each frame from the last seed and the frames since: a draw one side of an A/B made
  // and the other didn't, three's id for a skeleton's bone texture made as it's first drawn, moves only the random
  // things after it in its own frame, not every particle from then on)
  let seed = 0x9e3779b9;
  let frames = 0;
  window.__labSeed = (value) => {
    seed = value | 0;
    frames = 0;
    sequence.reseed(seed);
  };
  window.__labFrame = () => {
    frames++;
    sequence.reseed((seed + Math.imul(frames, 0x632be5ab)) | 0);
  };
  // (while a command runs with --randoms, each draw tallied by the stack it was drawn from: node/randoms.mjs)
  const CALLERS = 3;
  let tally = null;
  const drawn = () => {
    if (tally) {
      const callers = new Error().stack.split('\n').slice(2, 2 + CALLERS).join('\n');
      tally.set(callers, (tally.get(callers) ?? 0) + 1);
    }
    return sequence();
  };
  window.__labRandoms = {
    start() {
      tally = new Map();
    },
    stop() {
      const entries = tally ? [...tally] : [];
      tally = null;
      return entries;
    },
  };
  Math.random = drawn;
  // (a hero's profile by its key: last-stand.profile.ranger.v1, a save slot's last-stand.s2.profile.ranger.v1, the
  // older last-stand.profile.v1)
  const profileKey = /^last-stand(\.s\d)?\.profile\./;
  const profileSeed = 0x27d4eb2f;
  const readItem = Storage.prototype.getItem;
  Storage.prototype.getItem = function (key) {
    const value = readItem.call(this, key);
    if (value === null && profileKey.test(key)) sequence.reseed(profileSeed);
    return value;
  };

  const ownStream = (callback) => function (...args) {
    const random = Math.random;
    Math.random = timerStream;
    try {
      return callback.apply(this, args);
    } finally {
      Math.random = random;
    }
  };
  const browserTimeout = window.setTimeout.bind(window);
  const browserInterval = window.setInterval.bind(window);
  window.setTimeout = (callback, ms, ...args) => {
    return browserTimeout(typeof callback === 'function' ? ownStream(callback) : callback, ms, ...args);
  };
  window.setInterval = (callback, ms, ...args) => {
    return browserInterval(typeof callback === 'function' ? ownStream(callback) : callback, ms, ...args);
  };
}

/**
 * Every boot a first boot: nothing kept from the last (a saved profile loaded where the first boot rolled one made
 * a frame's difference), and no logo wind (the loading screen's watchdog counted as having cut it short on the
 * launches in a row it takes to switch it off).
 */
export function freshStorage() {
  try {
    localStorage.clear();
    localStorage.setItem('last-stand.logo-wind-slow', '2');
  } catch {
    // storage blocked: the intro plays, slower but harmless
  }
}

export const PAGE_SCRIPTS = [noCapture, labClock, seededRandom, freshStorage, capesHere];
