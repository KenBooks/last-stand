// Whether the loading screen's exit is heard (tools/stalls, `--scenario autoplay`): the game loaded in the installed
// Chrome under the desktop's autoplay policy (every other scenario starts it with
// `--autoplay-policy=no-user-gesture-required`, which hides the question; headless, Chrome lets the context run
// without a gesture even so, so this shows the gust played wherever sound may play, never the block), the ways a player meets the exit one after another in one Chrome: opened fresh, reloaded
// untouched, clicked and reloaded, opened again in a new tab. Each visit reports the effects' context's state as the
// logo starts blowing away, and whether the gust started (#424: from play, "sometimes doesn't play on startup,
// sometimes it does, I'd say 50/50").
import { startChrome } from './chrome.mjs';

/** the scenario's name (`--scenario autoplay`) */
export const AUTOPLAY = 'autoplay';

/** how long a visit is given to reach the exit, and how long the exit is watched once it starts (ms) */
const EXIT_MS = 180_000;
const AFTER_EXIT_MS = 1500;
/** the gust's noise sources, started together (`logoGust` in src/core/audio.ts: body, air, swirl, landing) */
const GUST_SOURCES = 4;

/**
 * The page's watch, run before its own scripts: every AudioContext made kept, each looping noise source started
 * counted with its time, and the moment the loading screen starts blowing (`#loading.blowing`) with every context's
 * state then. Read from `window.__autoplay`.
 */
function watchScript() {
  const record = {
    contexts: [], starts: [], blowingAt: null, statesAtBlowing: null, states: [], resumes: [], errors: [],
    visibility: null,
  };
  window.__autoplay = record;
  addEventListener('error', (event) => record.errors.push(String(event.message)));
  addEventListener('unhandledrejection', (event) => record.errors.push(String(event.reason)));
  const Original = window.AudioContext;
  const resume = Original.prototype.resume;
  Original.prototype.resume = function noted(...args) {
    record.resumes.push(performance.now());
    return resume.apply(this, args);
  };
  window.AudioContext = class extends Original {
    constructor(...args) {
      super(...args);
      record.contexts.push(this);
      record.states.push([performance.now(), this.state]);
      this.addEventListener('statechange', () => record.states.push([performance.now(), this.state]));
    }
  };
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function counted(...args) {
    if (this.loop && this.context instanceof Original) record.starts.push(performance.now());
    return start.apply(this, args);
  };
  // (stamped as the class is added, in the task that starts the gust: a MutationObserver heard it only after the
  // particles' start too, tens of ms after the gust's sources, and read a gust played as none)
  const add = DOMTokenList.prototype.add;
  DOMTokenList.prototype.add = function stamped(...tokens) {
    const loading = document.getElementById('loading');
    if (record.blowingAt === null && tokens.includes('blowing') && loading && this === loading.classList) {
      record.blowingAt = performance.now();
      record.statesAtBlowing = record.contexts.map((context) => context.state);
      record.visibility = document.visibilityState;
    }
    return add.apply(this, tokens);
  };
}

/** What a visit's page recorded once its exit has had time to play: the context's state, the gust started or not. */
async function visitResult(page) {
  await page.waitForFunction(() => window.__autoplay?.blowingAt !== null, null, { timeout: EXIT_MS });
  await page.waitForTimeout(AFTER_EXIT_MS);
  return page.evaluate((sources) => {
    const record = window.__autoplay;
    const gust = record.starts.filter((at) => at >= record.blowingAt);
    const resumes = record.resumes.map(Math.round);
    return {
      state: record.statesAtBlowing.join(', ') || 'no context',
      gust: gust.length >= sources,
      lateMs: gust.length ? Math.round(gust[0] - record.blowingAt) : null,
      blowingAt: Math.round(record.blowingAt),
      states: record.states.map(([at, state]) => `${state} at ${Math.round(at)} ms`).join(', '),
      resumes: `${resumes.length} (${resumes.slice(0, 6).join(', ')}${resumes.length > 6 ? '...' : ''} ms)`,
      loops: gust.length,
      visibility: record.visibility,
      errors: record.errors.slice(0, 3).join(' | ') || 'none',
    };
  }, GUST_SOURCES);
}

/** A visit's lines in the report. */
function visitLine(name, result) {
  const heard = result.gust ? `gust started (+${result.lateMs} ms)` : 'no gust';
  return `${name}: context ${result.state} as the exit starts at ${result.blowingAt} ms, ${heard}\n`
    + `  the context: ${result.states}; resume() asked ${result.resumes}\n`
    + `  the page ${result.visibility} then; ${result.loops} loops started from then; errors: ${result.errors}`;
}

/** Clicks the middle of the lobby, as a player's first click there does (a gesture: the page may play sound). */
async function clickLobby(page) {
  const size = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  await page.mouse.click(size.width / 2, size.height / 2);
}

/**
 * The visits, in one Chrome under its own autoplay policy, on `url`: each loaded, its exit watched and reported.
 * Returns the report's text.
 */
export async function measureAutoplay(url, outDir, { headed = false } = {}) {
  const chrome = await startChrome({ outDir, headed, autoplay: 'browser' });
  const lines = [`autoplay: ${url} in the installed Chrome under its own autoplay policy, one profile`];
  try {
    const context = chrome.browser.contexts()[0] ?? (await chrome.browser.newContext());
    await context.addInitScript(watchScript);
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(url);
    lines.push(visitLine('opened fresh', await visitResult(page)));
    await page.reload();
    lines.push(visitLine('reloaded, untouched', await visitResult(page)));
    await clickLobby(page);
    await page.reload();
    lines.push(visitLine('clicked, then reloaded', await visitResult(page)));
    await page.reload();
    lines.push(visitLine('reloaded again, untouched', await visitResult(page)));
    const tab = await context.newPage();
    await tab.goto(url);
    lines.push(visitLine('a new tab', await visitResult(tab)));
  } finally {
    await chrome.close();
  }
  return lines.join('\n');
}
