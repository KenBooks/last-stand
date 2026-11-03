// One side of the lab (tools/lab): a tree of the game served by a Vite dev server of the lab's own and booted in a
// page of the lab's browser. This tree is one side; for an A/B another commit is exported (commits.mjs) and served
// as the other, the lab's page modules copied into it so both run the same measures.
//
// Every command runs on a page booted for it: a page a command has run on is left as that command left it (the
// game's clock on, the hero wherever it took him), and a set-up on it started from another moment than a fresh
// boot's, so the same command gave other numbers depending on what ran before it.
import { createServer } from 'vite';
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { lowerProcesses, PAGE_SCRIPTS, takeKeptContext } from './browser.mjs';
import { exportedTreePaths, packagesRoot } from './commits.mjs';
import { compileError, labError } from './errors.mjs';
import { mapsCodeOf } from './mapsCode.mjs';
import { watchLayers } from './layers.mjs';
import { probeFiles } from './probeFiles.mjs';
import { stampOf } from './sideCache.mjs';
import { decodeMappings, sourceOf } from './sourceMaps.mjs';

const VIEWPORT = { width: 1920, height: 1080 };
/** the size every page of the lab's is given, in a context of its own or the browser's kept one */
export const CONTEXT_OPTIONS = { viewport: VIEWPORT, deviceScaleFactor: 1 };
const BOOT_TIMEOUT_MS = 180_000;
/** how often a booting page is asked whether the loading screen is gone, ms */
const BOOT_POLL_MS = 100;
/** how long an expression `evaluate` runs may take to settle, ms: one waiting on a frame of the page's, which the lab's
 *  clock holds, never settled, and every command after it waited on it, `status` too, till the server was stopped */
const EVALUATE_TIMEOUT_MS = 60_000;
const BOOTED = 'booted';

/** What an expression that never settled is told. */
function evaluateTimeoutText() {
  return `lab: eval: the expression hadn't settled after ${EVALUATE_TIMEOUT_MS / 1000} s (the page's `
    + 'requestAnimationFrame waits on the lab\'s frames, lab.step; the browser\'s next frame is '
    + 'window.__labClock.realFrame())';
}

/** In the page: whether its boot is over, `BOOTED` or what its loading screen says went wrong (src/ui/loading.ts
 *  `loadingFailed`); false while it's still loading, or while the fight's programs are still warmed behind the
 *  lobby, asked for at once (src/game/warm.ts: a page from before it has no `allWarm`). A `cold` boot asks for
 *  nothing: over once the lobby shows, the fight's and the other heroes' programs left cold as a first visit's. */
function bootOutcome(cold) {
  const loading = document.getElementById('loading');
  if (loading) return loading.classList.contains('failed') ? loading.textContent.trim() : false;
  if (cold) return 'booted';
  window.__dev?.hurry?.();
  return window.__dev?.allWarm?.() === false ? false : 'booted';
}

/**
 * How a page boots: at `quality`, as Auto's cookie holds it (`low@518400`; null: the lab's own, High), and `cold` or
 * not (`bootOutcome`). The lab's own boot asks for everything the game warms after the lobby shows and waits for it.
 */
export const LAB_BOOT = Object.freeze({ quality: null, cold: false });

/** The boot a command's `options` ask for (`--boot`, `--cold`). */
export function bootOf(options) {
  return { quality: options.boot ?? null, cold: Boolean(options.cold) };
}

/** How `boot` is said after the hero it booted: ` at low@518400`, `, cold`, or nothing for the lab's own. */
export function bootText(boot) {
  const at = boot.quality ? ` at ${boot.quality}` : '';
  return `${at}${boot.cold ? ', cold' : ''}`;
}

/** Whether two boots are the same. */
function sameBoot(a, b) {
  return a.quality === b.quality && a.cold === b.cold;
}
/** how much of a failed script's answer is said (Vite's message of what wouldn't compile, the start of it) */
const FAILED_ANSWER_CHARS = 600;
/** where Vite's answer for a module it couldn't compile says why: a page of its error overlay, the error in it */
const VITE_ERROR = /const error = (\{.*\})/;

/**
 * Whether a console message is the dev server's own client's: its socket to the server, which the lab never uses (it
 * serves with `hmr: false`, and boots a page afresh for a change). On a machine short of sockets the client failed to
 * connect, and its errors failed jobs whose game had passed (3 of `check`'s 155 jobs, on both sides).
 */
function fromDevClient(message) {
  return message.location().url.includes('/@vite/client');
}

/**
 * Whether `page` fails to load a script as it boots: `promise` settles with what its server answered for the first
 * script that failed (a module Vite couldn't compile never runs, so the loading screen never says it failed), or
 * with the error of a module that wouldn't link (one importing a name another doesn't export: each was served whole,
 * and the boot waited out its three minutes on a page that never ran), until `stop`.
 */
function scriptFailure(page) {
  let stop;
  const promise = new Promise((resolve) => {
    const answered = async (response) => {
      if (response.request().resourceType() !== 'script' || response.status() < 400) return;
      resolve(`${response.url()} answered ${response.status()}:\n${await whyFailed(response)}`);
    };
    const thrown = (error) => {
      if (error.name === 'SyntaxError') resolve(`a module wouldn't load: ${error.message}`);
    };
    page.on('response', answered);
    page.on('pageerror', thrown);
    stop = () => {
      page.off('response', answered);
      page.off('pageerror', thrown);
    };
  });
  return { promise, stop };
}

/** What a failed script's answer says went wrong: Vite's message, or the start of the answer. (The page's copy of
 *  the answer comes back empty, so it's asked for again.) */
async function whyFailed(response) {
  const answer = await fetch(response.url())
    .then((again) => again.text())
    .catch(() => '');
  const error = VITE_ERROR.exec(answer);
  if (!error) return answer.slice(0, FAILED_ANSWER_CHARS);
  try {
    return JSON.parse(error[1]).message.slice(0, FAILED_ANSWER_CHARS);
  } catch {
    return error[1].slice(0, FAILED_ANSWER_CHARS);
  }
}

/** the ports the two sides' servers try first (another free one is taken if it's in use) */
const REPO_PORT = 5190;
const OTHER_PORT = 5191;
/** a change here boots this tree's page afresh before the next command */
const WATCHED = /[\\/](src|tools[\\/]lab[\\/]page)[\\/]|[\\/]index\.html$/;
/** the dev server's own config and what it reads: a change here starts this tree's server afresh, then the page */
const SERVER_CONFIG = /[\\/](vite\.config\.ts|package(-lock)?\.json|scripts[\\/]pwa\.ts)$/;
/** What this tree's server never watches, from the tree's root: scratch, other checkouts and generated harness
 *  output. The stalls browser profiles alone can hold hundreds of thousands of files; traversing them delayed a lab
 *  boot for minutes. From the root, not anywhere on the path: as `**\/.claude/**`, a tree that is itself a worktree
 *  under `.claude/worktrees` had every file ignored, and its server ran a page booted before each edit. */
const UNWATCHED = ['.tmp', '.claude', 'tools/lab/out', 'tools/stalls/out', 'tools/facelab', 'dist'];

/** Whether `path` (absolute) is one of `root`'s `UNWATCHED` folders or in one. */
export function unwatched(root, path) {
  const relative = toSlashes(path).toLowerCase().slice(toSlashes(root).toLowerCase().length + 1);
  return UNWATCHED.some((folder) => relative === folder || relative.startsWith(`${folder}/`));
}
/** the cookies every boot starts with besides its hero's: the forest, the high quality preset */
const BOOT_COOKIES = { 'last-stand-biome': 'forest', 'last-stand-quality': 'high' };

/** each page's DevTools session, opened as it first needs one */
const DEVTOOLS = new WeakMap();

/** `page`'s DevTools session (the same one each time). */
async function devtoolsOf(page) {
  if (!DEVTOOLS.has(page)) DEVTOOLS.set(page, await page.context().newCDPSession(page));
  return DEVTOOLS.get(page);
}

/** the layers watched on a page while a command runs with `--layers` (layers.mjs), kept at each screen picture */
const LAYER_WATCHES = new WeakMap();

/**
 * The page pictured as it shows (within `clip`, css px, when one is given), as a PNG data URL at the screen's own
 * pixels: `lab.screen`'s, its layers kept as it's taken where they're watched (`layered`). Taken through the
 * DevTools protocol: Playwright's screenshot put the page back on the screen Playwright had given it, and on a
 * `--screen` every picture after the first showed the boot's 1920x1080.
 */
async function screenshotOf(page, clip) {
  const devtools = await devtoolsOf(page);
  const region = clip ? { clip: { ...clip, scale: 1 } } : {};
  const { data } = await devtools.send('Page.captureScreenshot', { format: 'png', ...region });
  await LAYER_WATCHES.get(page)?.pictured();
  return `data:image/png;base64,${data}`;
}

/**
 * Runs `work` with `page`'s layers kept at each of its screen pictures; resolves with what `work` returned and the
 * layers, a list of lines for each picture (layers.mjs `watchLayers`).
 */
export async function layered(page, work) {
  const watch = await watchLayers(await devtoolsOf(page));
  LAYER_WATCHES.set(page, watch);
  let result;
  let pictures = [];
  try {
    result = await work();
  } finally {
    LAYER_WATCHES.delete(page);
    pictures = await watch.stop();
  }
  return { result, pictures };
}

/** the pages whose touch input is on: a touch screen's, as a phone's or a tablet's */
const TOUCHING = new WeakSet();

/**
 * A finger's touch sent to the page as the browser gets one from a touch screen (`lab.touch`'s): `type` is
 * `touchStart`, `touchMove` or `touchEnd`, `points` the finger it puts down, moves or lifts, by its id (css px). The
 * page's own pointer events follow from it, with their pointer ids, so the game handles it as a player's.
 */
async function touchOf(page, type, points) {
  const devtools = await devtoolsOf(page);
  if (!TOUCHING.has(page)) {
    await devtools.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    TOUCHING.add(page);
  }
  await devtools.send('Input.dispatchTouchEvent', { type, touchPoints: points });
}

/**
 * The mouse sent to the page as the browser gets it from a mouse (`lab.click`'s): `type` is `mouseMoved`, or
 * `mousePressed` or `mouseReleased` for its left button, or `mouseWheel` turning its wheel `deltaY` px down, at `x`,
 * `y` (css px). The browser's own handling follows from it, as a player's click: its mouse and pointer events, and the
 * focus it moves.
 */
async function mouseOf(page, type, x, y, deltaY = 0) {
  const devtools = await devtoolsOf(page);
  const wheel = type === 'mouseWheel' ? { deltaX: 0, deltaY } : {};
  await devtools.send('Input.dispatchMouseEvent', { type, x, y, ...MOUSE_BUTTONS[type], ...wheel });
}

/** the left button's fields for each of the mouse's events: none moving or turning the wheel, held as it's pressed,
 *  up once released */
const MOUSE_BUTTONS = {
  mouseMoved: { button: 'none', buttons: 0 },
  mousePressed: { button: 'left', buttons: 1, clickCount: 1 },
  mouseReleased: { button: 'left', buttons: 0, clickCount: 1 },
  mouseWheel: { button: 'none', buttons: 0 },
};

/** The page's `prefers-reduced-motion` as the browser emulates it: `reduced`, or no preference. */
function motionOf(page, reduced) {
  return page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
}

/** The page's CPU slowed `rate` times (1: as it is), as the browser emulates a slower device's. */
async function throttleOf(page, rate) {
  const devtools = await devtoolsOf(page);
  await devtools.send('Emulation.setCPUThrottlingRate', { rate });
}

/** The page put on a screen of `screen`'s size (css px) and pixel ratio, as the browser emulates one. */
async function screenOf(page, screen) {
  const devtools = await devtoolsOf(page);
  await devtools.send('Emulation.setDeviceMetricsOverride', {
    width: screen.width,
    height: screen.height,
    deviceScaleFactor: screen.ratio,
    mobile: false,
  });
  if (screen.insets) await insetsOf(devtools, screen.insets);
}

/** The screen's safe-area insets (css px) as the browser emulates a phone's camera cutout: what the page's
 *  `env(safe-area-inset-*)` reads. */
async function insetsOf(devtools, insets) {
  try {
    await devtools.send('Emulation.setSafeAreaInsetsOverride', { insets });
  } catch (error) {
    throw new Error(`lab: --insets: this browser can't emulate a screen's safe area (${error.message})`);
  }
}

/**
 * A key sent to the page as the browser gets it from a keyboard (`lab.press`'s): `type` is `keyDown` or `keyUp`,
 * `key` the key's code (`KeyW`). The browser's own handling follows from it, as a player's key: what it does to the
 * focused element (a focus ring shown, a button pressed).
 */
async function keyOf(page, type, key) {
  const devtools = await devtoolsOf(page);
  await devtools.send('Input.dispatchKeyEvent', { type, ...keyFields(key) });
}

/** The DevTools protocol's fields for the key whose code is `code`: a letter's (`KeyW`), or a named key's. */
function keyFields(code) {
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) {
    const upper = letter[1];
    return { code, key: upper.toLowerCase(), windowsVirtualKeyCode: upper.charCodeAt(0) };
  }
  const named = NAMED_KEYS[code];
  if (!named) throw new Error(`lab: press: no key ${code} (a letter's code, KeyW, or ${Object.keys(NAMED_KEYS)})`);
  return { code, ...named };
}

/** the keys besides the letters a measure may press: their key names and Windows key codes */
const NAMED_KEYS = {
  Space: { key: ' ', windowsVirtualKeyCode: 32 },
  Enter: { key: 'Enter', windowsVirtualKeyCode: 13 },
  Escape: { key: 'Escape', windowsVirtualKeyCode: 27 },
  Tab: { key: 'Tab', windowsVirtualKeyCode: 9 },
  AltLeft: { key: 'Alt', windowsVirtualKeyCode: 18, location: 1 },
  ControlLeft: { key: 'Control', windowsVirtualKeyCode: 17, location: 1 },
};

const toSlashes = (path) => path.split('\\').join('/');

/** the note an exported tree keeps of the lab page modules last copied into it */
const PAGE_STAMP = 'tools/lab/page/.lab-stamp';

/**
 * Copies the lab's page modules from `repo` into the exported tree `root`, unless the ones there are those already
 * (`PAGE_STAMP`): a check's sides side by side boot from one exported tree, and a copy under a page being served
 * could hand it a file half written.
 */
export function copyLabPage(repo, root) {
  const stamp = stampOf(['tools/lab/page']);
  const note = join(root, PAGE_STAMP);
  if (existsSync(note) && readFileSync(note, 'utf8') === stamp) return;
  cpSync(join(repo, 'tools/lab/page'), join(root, 'tools/lab/page'), { recursive: true });
  writeFileSync(note, stamp);
}

export class Side {
  /**
   * @param name what reports call it
   * @param root the tree it serves
   * @param repo the lab's own tree: its packages, and its page modules (copied into an exported tree)
   * @param outDir where the lab writes (this tree's Vite cache)
   * @param browser the lab's browser
   * @param sha an exported commit's sha (null for this tree)
   * @param worker the session's (`LabSession.open`): a Vite cache of its own, for a server side by side with another
   * @param servedBy another side of the same tree whose Vite server serves this one's pages too (a check's sessions:
   *   each with a server of its own, eight transformed the whole game at once, and a boot took 45 s, not 10)
   */
  constructor({ name, root, repo, outDir, browser, sha = null, worker = 0, servedBy = null }) {
    this.name = name;
    this.worker = worker;
    this.servedBy = servedBy;
    /** its server starting, while it does: sides served by it ask at once */
    this.starting = null;
    this.root = root;
    this.repo = repo;
    this.outDir = outDir;
    this.browser = browser;
    this.sha = sha;
    this.isRepo = root === repo;
    this.server = null;
    /** where its server serves the game, once it's up */
    this.url = null;
    this.context = null;
    this.page = null;
    /** a co-op partner's page's context, while one is open (`coop`) */
    this.partnerContext = null;
    /** the hero its page booted, null until one booted whole */
    this.heroClass = null;
    /** how its page booted (`LAB_BOOT`'s fields), null until one booted whole */
    this.bootedAs = null;
    /** the source changed since the page booted */
    this.stale = true;
    /** the dev server's config changed since it started */
    this.serverStale = false;
    /** a command has run on the page since it booted */
    this.used = false;
    /** its commands' set-ups build the hero afresh (session.mjs `afresh`) */
    this.afresh = false;
    /** the kind of page it has up, as the commands run on it (commands.mjs `pageKind`; null: none to keep) */
    this.pageKind = null;
    /** called with the file when this tree's source changes (the server boots the next page then) */
    this.onStale = null;
    /** what the page raised or logged as an error since they were last read */
    this.errors = [];
  }

  /**
   * Starts its Vite server (HMR off: a probe never meets a stale copy of a module), afresh when its config changed (a
   * server made with `createServer` keeps the config it started with, and the pre-bundled packages made from it).
   */
  async serve() {
    if (this.servedBy) {
      await this.servedBy.serve();
      this.server = this.servedBy.server;
      this.url = this.servedBy.url;
      return;
    }
    this.starting ??= this.startServing().finally(() => {
      this.starting = null;
    });
    await this.starting;
  }

  /** `serve`'s work: the server started, or started again when its config changed. */
  async startServing() {
    if (this.server && this.serverStale) {
      await this.closePage();
      await this.server.close();
      this.server = null;
    }
    this.serverStale = false;
    if (this.server) return;
    // (an exported tree's build is its own commit: vite.config.ts asks git, which, from inside this tree, names its)
    const buildSha = process.env.BUILD_SHA;
    if (this.sha) process.env.BUILD_SHA = this.sha;
    try {
      this.server = await createServer(this.viteConfig());
    } finally {
      if (buildSha === undefined) delete process.env.BUILD_SHA;
      else process.env.BUILD_SHA = buildSha;
    }
    await this.server.listen();
    this.url = this.server.resolvedUrls.local[0];
    if (this.isRepo) this.server.watcher.on('all', (_event, file) => this.sourceChanged(file));
  }

  /** Marks the page stale (and the server, for its config) when `file` is part of what they were made from. */
  sourceChanged(file) {
    const configChanged = SERVER_CONFIG.test(file);
    if (!configChanged && !WATCHED.test(file)) return;
    if (configChanged) this.serverStale = true;
    this.stale = true;
    this.onStale?.(file);
  }

  /** What this tree's watcher leaves alone (`UNWATCHED`), as Vite's `ignored` takes it. */
  unwatchedHere() {
    return (path) => unwatched(this.root, path);
  }

  /** This tree watched for changes; an exported one never changes, and finds its packages in this tree. */
  viteConfig() {
    // (the config loaded by Vite's module runner: bundled, it's written next to itself, imported and deleted, and
    // `node --watch` took that for a change to the lab's code and restarted the server mid-command)
    const common = { root: this.root, logLevel: 'error', configLoader: 'runner' };
    if (this.isRepo) {
      return {
        ...common,
        cacheDir: join(this.outDir, this.worker ? `vite-${this.worker}` : 'vite'),
        server: { port: REPO_PORT, strictPort: false, hmr: false, watch: { ignored: this.unwatchedHere() } },
      };
    }
    return {
      ...common,
      configFile: join(this.root, 'vite.config.ts'),
      // (a cache of its own per commit: commits may differ in their packages, and a cache shared between them kept a
      // bundle made before the paths above were right, ez-tree with a second copy of three in it)
      cacheDir: join(this.root, this.worker ? `.lab-vite-${this.worker}` : '.lab-vite'),
      plugins: [exportedTreePaths(this.root, this.repo)],
      server: {
        port: OTHER_PORT,
        strictPort: false,
        hmr: false,
        watch: null,
        fs: { allow: [this.root, join(packagesRoot(this.root, this.repo), 'node_modules')] },
      },
    };
  }

  /** Whether its page is booted for `heroClass` as `how` asks (`LAB_BOOT`'s fields) from the current source, and no
   *  command has run on it yet. */
  isFresh(heroClass, how = LAB_BOOT) {
    return this.isBooted(heroClass, how) && !this.used;
  }

  /** Whether its page is booted for `heroClass` as `how` asks from the current source, used or not. */
  isBooted(heroClass, how = LAB_BOOT) {
    const alive = this.page && !this.page.isClosed();
    const booted = this.heroClass === heroClass && this.bootedAs !== null && sameBoot(this.bootedAs, how);
    return Boolean(alive && !this.stale && booted);
  }

  /**
   * Boots a page for `heroClass` as `how` asks unless a fresh one is up already, or with `used`, one a command has run
   * on (a check's, `keepPages` in session.mjs): with `clean` too, only one that has compiled nothing since it loaded,
   * whose programs are the boot's alone as a fresh page's are (a command that counts the shaders compiled late: a
   * program an earlier command had compiled was there for the next, which counted none). Returns whether it booted.
   */
  async ready(heroClass, how = LAB_BOOT, { used = false, clean = false } = {}) {
    await this.serve();
    if (this.isFresh(heroClass, how)) return false;
    const kept = used && this.isBooted(heroClass, how);
    if (kept && !(clean && (await this.compiledSinceLoad()) > 0)) return false;
    await this.boot(heroClass, how);
    return true;
  }

  /** How many programs its page has compiled since it loaded (src/core/shaders.ts; 0 on a commit without the count). */
  compiledSinceLoad() {
    const count = async () => {
      const shaders = await import('/src/core/shaders.ts');
      return shaders.programsCompiledInGame?.() ?? 0;
    };
    return this.page.evaluate(count);
  }

  /**
   * Boots a page for `heroClass`: the game loaded with nothing kept from the last boot, the lab installed once the
   * loading screen is gone, and the hero checked, as `how` asks (`LAB_BOOT`'s fields). At its `quality` (Auto's
   * cookie, `low@518400`), it boots as a device whose Auto settled there: the boot's warm-ups run at that level, the
   * hero built at its detail; `cold`, it asks for nothing warmed after the lobby (`bootOutcome`). A boot that fails
   * leaves no page behind (none counts as fresh).
   */
  async boot(heroClass, how = LAB_BOOT) {
    if (!this.isRepo) copyLabPage(this.repo, this.root);
    await this.closePage();
    this.heroClass = null;
    this.bootedAs = null;
    this.pageKind = null;
    try {
      await this.openPage(heroClass, how);
      const booted = await this.page.evaluate(async () => {
        const lab = await import('/tools/lab/page/lab.ts');
        await lab.mapsCome();
        return lab.install().heroes();
      });
      if (booted.hero !== heroClass) {
        throw labError(`--class ${heroClass}: no such hero (the heroes: ${booted.heroes.join(', ')})`);
      }
    } catch (error) {
      await this.closePage();
      throw error;
    }
    this.heroClass = heroClass;
    this.bootedAs = how;
  }

  /** Opens a page on the game for `heroClass` (booted as `how` asks, as `boot` takes it) and waits out its loading
   *  screen. */
  async openPage(heroClass, how = LAB_BOOT) {
    this.context ??= await this.newContext({ kept: this.isRepo });
    this.errors = [];
    this.stale = false;
    this.used = false;
    this.page = await this.openPageIn(this.context, heroClass, '', how);
  }

  /**
   * Opens a second page of this side's game in a context of its own, booted for `heroClass` and with the lab installed
   * as `boot` does: a co-op partner (`coop`). Its errors count as this side's, said to be the partner's. Returns the
   * page; `closePartner` closes it.
   */
  async openPartner(heroClass) {
    await this.closePartner();
    this.partnerContext = await this.newContext();
    const page = await this.openPageIn(this.partnerContext, heroClass, 'partner: ', this.bootedAs ?? LAB_BOOT);
    await page.evaluate(async () => {
      const lab = await import('/tools/lab/page/lab.ts');
      await lab.mapsCome();
      lab.install();
    });
    return page;
  }

  /** Closes the co-op partner's page, if one is open. */
  async closePartner() {
    await this.partnerContext?.close().catch(() => {});
    this.partnerContext = null;
  }

  /**
   * A browser context as every page of the lab's has it: its viewport and the scripts run before the page's own. With
   * `kept`, the one the browser keeps on its profile where it has one (`takeKeptContext`): this tree's maps made once.
   */
  async newContext({ kept = false } = {}) {
    const keptContext = kept ? takeKeptContext(this.browser) : null;
    const context = keptContext ?? await this.browser.newContext(CONTEXT_OPTIONS);
    for (const script of PAGE_SCRIPTS) await context.addInitScript(script);
    return context;
  }

  /**
   * Opens a page on the game for `heroClass` in `context` and waits out its loading screen, its errors kept as this
   * side's (each after `prefix`), booted as `how` asks: at its `quality` (Auto's cookie), on Auto settled there.
   */
  async openPageIn(context, heroClass, prefix, how = LAB_BOOT) {
    const { quality, cold } = how;
    // (nothing kept from the last boot: the game writes cookies of its own, the skill loadout's among them, and a boot
    // after them ended its set-up a frame apart from the first; storage is cleared as the page starts, browser.mjs)
    await context.clearCookies();
    const settled = quality ? { 'last-stand-quality': 'auto', 'last-stand-quality-auto': quality } : {};
    const cookies = { ...BOOT_COOKIES, ...settled, 'last-stand-class': heroClass };
    await context.addCookies(Object.entries(cookies).map(([name, value]) => ({ name, value, url: this.url })));
    const page = await context.newPage();
    // (the maps made once kept in the context's store, under a name for their code: src/core/kept.ts `keepAs`)
    await page.addInitScript((name) => {
      window.__labMapsAs = name;
    }, mapsCodeOf(this.root));
    page.on('pageerror', (error) => this.errors.push(`${prefix}${String(error)}`));
    page.on('console', (message) => {
      if (message.type() === 'error' && !fromDevClient(message)) this.errors.push(`${prefix}${message.text()}`);
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    // (a probe's `lab.screen`: the game with the page's UI over it, which the canvas views can't show)
    await page.exposeFunction('__labScreenshot', (clip) => screenshotOf(page, clip));
    // (a probe's `lab.touch`: a finger on the touch controls, which no scripted input reaches)
    await page.exposeFunction('__labTouch', (type, points) => touchOf(page, type, points));
    // (a probe's `lab.click` and `lab.press`: the browser's own handling of a click and a key, its focus with them)
    await page.exposeFunction('__labMouse', (type, x, y, deltaY) => mouseOf(page, type, x, y, deltaY));
    await page.exposeFunction('__labKey', (type, key) => keyOf(page, type, key));
    // (a probe's `lab.reduceMotion`: the motion asked for let back on, to measure a decorative animation)
    await page.exposeFunction('__labMotion', (reduced) => motionOf(page, reduced));
    // (a probe's `lab.throttle`: the CPU slowed as a low-end device's, for what the page's work costs one)
    await page.exposeFunction('__labThrottle', (rate) => throttleOf(page, rate));
    // (a probe's `lab.showOn`: the window resized as the command runs, as the player's is taken to full screen)
    await page.exposeFunction('__labScreen', (screen) => screenOf(page, screen));
    const failed = scriptFailure(page);
    // (the boot's time for the page's load too: Playwright's own 30 s ran out on the first page after the server
    // started, a cold dev server sending every module on a machine busy with other agents)
    await page.goto(this.url, { timeout: BOOT_TIMEOUT_MS });
    // (Chrome raises a page's renderer to normal priority as it shows it: lowered again to the lab's)
    await lowerProcesses(this.browser);
    // (polled on a timer: by default it polls by animation frame, and the lab's clock holds those once the game shows)
    const polling = { polling: BOOT_POLL_MS, timeout: BOOT_TIMEOUT_MS };
    // (a boot that threw says so on its loading screen, and a script that wouldn't load in its answer: waited for the
    // screen to go alone, either was waited out to the timeout, three minutes)
    try {
      const outcome = await Promise.race([
        page.waitForFunction(bootOutcome, cold, polling).then((booted) => booted.jsonValue()),
        failed.promise,
      ]);
      if (outcome !== BOOTED) throw labError(`${prefix}the game failed to boot: ${outcome}`);
    } finally {
      failed.stop();
    }
    return page;
  }

  // A command runs in one task of the page, its modules imported first and the lab readied after them (`begin`: the
  // random numbers started again): while a module loads, whatever lands meanwhile (a texture made in a worker, each
  // three.js object drawing a random number for its id) runs, and a command readied before its imports started at
  // another point of the sequence one boot in four.

  /** Calls `fn` from page/commands.ts with the lab and `options`; returns its result. */
  command(fn, options) {
    return this.page.evaluate(async ([fn, options, afresh]) => {
      const commands = await import('/tools/lab/page/commands.ts');
      window.__lab.begin(afresh);
      return commands[fn](window.__lab, options);
    }, [fn, options, this.afresh]);
  }

  /**
   * Puts its page on a screen of `screen`'s size (css px) and pixel ratio (`--screen`), as a window moved onto another
   * monitor is: no resize may come with it, and the game fits its canvas to it on its next frame.
   */
  showOn(screen) {
    return screenOf(this.page, screen);
  }

  /**
   * Imports a probe module (a path under the tree, read afresh each time) and runs its default export, after setting
   * `fixture` up (none when null).
   */
  async probe(path, options, fixture) {
    this.forgetModulesUnder(dirname(join(this.root, path)));
    await this.checkCompiles(probeFiles(this.root, path));
    return this.page.evaluate(async ([path, options, fixture]) => {
      const commands = await import('/tools/lab/page/commands.ts');
      const probe = await import(`/${path}?t=${Date.now()}`);
      if (typeof probe.default !== 'function') throw new Error(`lab: probe: ${path} has no default export to run`);
      window.__lab.begin();
      if (fixture) await commands.setup(window.__lab, fixture);
      return probe.default(window.__lab, options);
    }, [path, options, fixture]);
  }

  /**
   * Throws, saying where and why, unless each module at `paths` (under the tree) compiles: imported in the page, one
   * that didn't said only "Failed to fetch dynamically imported module", whatever was wrong with it.
   */
  async checkCompiles(paths) {
    for (const path of paths) {
      try {
        await this.server.environments.client.transformRequest(`/${path}`);
      } catch (error) {
        const { reason, where } = compileError(error);
        throw labError(`${path}${where} doesn't compile: ${reason}`);
      }
    }
  }

  /**
   * Drops the modules from files under `dir` out of Vite's cache, so the next import compiles them afresh. Its watcher
   * leaves scratch folders alone (`UNWATCHED`), so it never saw a probe edited there, and went on serving the probe
   * as it was first compiled, whatever its import's query said.
   */
  forgetModulesUnder(dir) {
    const graph = this.server.environments.client.moduleGraph;
    const prefix = toSlashes(dir).toLowerCase() + '/';
    for (const [file, modules] of graph.fileToModulesMap) {
      if (!toSlashes(file).toLowerCase().startsWith(prefix)) continue;
      for (const module of modules) graph.invalidateModule(module);
    }
  }

  /**
   * Where the code this side's server compiled came from, for the scripts at `urls` (`--profile`): a function of a
   * script's address, line and column (from 0) to `{ file, line }` in the source, or null where it doesn't know.
   */
  async sourceLocator(urls) {
    const origin = new URL(this.url).origin;
    const maps = new Map();
    for (const url of urls) {
      if (!url.startsWith(`${origin}/`)) continue;
      // (Vite keeps what it compiled, so this compiles nothing again)
      const compiled = await this.server.transformRequest(url.slice(origin.length)).catch(() => null);
      const map = compiled?.map;
      if (map?.mappings) maps.set(url, { sources: map.sources ?? [], lines: decodeMappings(map.mappings) });
    }
    return (url, line, column) => {
      const map = maps.get(url);
      const found = map && sourceOf(map.lines, line, column);
      if (!found) return null;
      return { file: map.sources[found.source] ?? url, line: found.line };
    };
  }

  /** Evaluates `expression` in the page, with the lab as `lab`, readied first. Throws if it hasn't settled within
   *  `EVALUATE_TIMEOUT_MS` (what it started runs on in the page). */
  async evaluate(expression) {
    let timer;
    const evaluated = this.page.evaluate(`(async (lab) => { lab.begin(); return (${expression}); })(window.__lab)`);
    const timedOut = new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(evaluateTimeoutText())), EVALUATE_TIMEOUT_MS);
    });
    try {
      return await Promise.race([evaluated, timedOut]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** The page's errors and the lab's anatomy warnings since the last call. */
  async drainMessages() {
    const errors = [...new Set(this.errors)];
    this.errors = [];
    const readWarnings = () => window.__lab?.warnings.splice(0) ?? [];
    const warnings = this.page ? await this.page.evaluate(readWarnings).catch(() => []) : [];
    return { errors, warnings: [...new Set(warnings)] };
  }

  /** Closes its page (the server stays up). */
  /** Serves its pages from `browser` from now on (a new one, the last having closed): nothing of the old kept. */
  useBrowser(browser) {
    this.browser = browser;
    this.context = null;
    this.partnerContext = null;
    this.page = null;
    this.heroClass = null;
    this.bootedAs = null;
  }

  async closePage() {
    if (!this.page) return;
    await this.page.close().catch(() => {});
    this.page = null;
  }

  async close() {
    await this.closePartner();
    await this.closePage();
    await this.context?.close().catch(() => {});
    if (!this.servedBy) await this.server?.close();
  }
}
