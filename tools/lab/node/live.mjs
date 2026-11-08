// The lab's live session (tools/lab, `lab live`): one page of the game booted and set up once, kept by the server
// between steps, each step on the state the last one left, as a modelling tool's scene is kept between edits: an
// expression evaluated (a joint turned, a value set), frames run, the hero pictured from any view in any look, the
// scene listed. Its steps are kept (liveLog.mjs): when the source changes, or the server starts again, the next step
// boots the page again and replays them first.
//
// It runs in a browser of its own: with two pages alive in one browser one of them lost its focus, and the game lets
// go of the input on a blur (session.mjs), so a command run beside the live page would have measured another game.
// What's found here is measured by a command, on a page booted for it: the live page's state is wherever its steps
// took it.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { launchBrowser } from './browser.mjs';
import { fixtureFrom } from './commands.mjs';
import { labError } from './errors.mjs';
import { LiveLog, describeStep, pictureName } from './liveLog.mjs';
import { OUT, REPO } from './paths.mjs';
import { Side } from './side.mjs';
import { pictureUrl } from './pictureFile.mjs';

/** where the live session writes its pictures, and keeps its steps */
const LIVE_DIR = join(OUT, 'live');
const LOG_FILE = join(LIVE_DIR, 'steps.json');
/** the hero a session starts with unless `--class` says */
const DEFAULT_CLASS = 'warrior';
/** the options each step takes besides what follows it (the set-up's for `start`) */
const STEP_OPTIONS = {
  start: ['class', 'view', 'at', 'facing', 'nocked', 'gear', 'weapon', 'wear', 'screen'],
  picture: ['views', 'look', 'focus', 'on', 'distance', 'over', 'strength', 'crop', 'canary'],
  inspect: ['depth'],
  eval: [],
  frames: [],
  log: [],
  stop: [],
};
/** the steps that need words after them, and what they are */
const STEP_WORDS = { eval: 'expression', frames: 'count' };
/** a reference picture's types by its file's extension */

/** A screen as `--screen` writes it: `832x384@3.75`. */
const screenText = (screen) => `${screen.width}x${screen.height}@${screen.ratio}`;

function seconds(since) {
  return `${((Date.now() - since) / 1000).toFixed(1)} s`;
}

/** Throws unless `options` are a step's: one it has, and only the options it takes. */
export function checkStep(options) {
  const [step] = options._;
  const steps = Object.keys(STEP_OPTIONS);
  if (!STEP_OPTIONS[step]) throw labError(`live: no step ${step} (the steps: ${steps.join(', ')})`);
  const given = Object.keys(options).filter((name) => name !== '_' && options[name] !== undefined);
  const stray = given.find((name) => !STEP_OPTIONS[step].includes(name) && !DEFAULTED.includes(name));
  if (stray) throw labError(`live ${step} takes no --${stray} (it takes ${listed(STEP_OPTIONS[step])})`);
  if (STEP_WORDS[step] && options._.length < 2) throw labError(`live ${step} needs its ${STEP_WORDS[step]}`);
  if (step === 'frames' && !(Number(options._[1]) >= 1)) throw labError('live frames: a count of at least 1');
  if (options.on && !isPlace(options.on.map(Number))) {
    throw labError('live picture --on: a place in the world as x,y,z in metres (7.5,0.4,17.1)');
  }
  if (options.crop && !isCrop(options.crop.map(Number))) {
    throw labError('live picture --crop: left,top,right,bottom as shares of the picture (0.5,0,1,0.6)');
  }
}

/** the options read with a default whatever the step, which no step is faulted for */
const DEFAULTED = ['depth'];

const listed = (names) => (names.length ? names.map((name) => `--${name}`).join(', ') : 'none');

/** Whether `on` is a place: three finite numbers. */
function isPlace(on) {
  return on.length === 3 && on.every(Number.isFinite);
}

function isCrop(crop) {
  const [left, top, right, bottom] = crop;
  const shares = crop.length === 4 && crop.every((share) => share >= 0 && share <= 1);
  return shares && left < right && top < bottom;
}

export class LiveSession {
  /** the server's session: its side of this tree serves the live page too */
  constructor(session) {
    this.session = session;
    this.log = new LiveLog(LOG_FILE);
    this.browser = null;
    this.side = null;
    /** the version of the source (the server's count of its changes) the page was booted from */
    this.version = null;
  }

  /** Runs one step (`options._[0]`, the words after it, its options); `version` is the source's as the server counts
   *  its changes. Resolves with the step's report and the problems that fail it. */
  async run(options, version) {
    checkStep(options);
    const [step, ...words] = options._;
    if (step === 'log') return { text: this.log.describe().join('\n'), problems: [] };
    if (step === 'stop') return this.stop();
    if (step === 'start') return this.start(options, version);
    const notes = await this.keep(version);
    const { text, problems = [] } = await this.step(step, words, options);
    return this.reported([...notes, text], problems);
  }

  /** A step on the page kept: its text, and the problems it found. */
  async step(step, words, options) {
    if (step === 'eval') return { text: await this.evaluate(words.join(' ')) };
    if (step === 'inspect') {
      const depth = Math.round(options.depth);
      return { text: await this.side.command('liveInspect', { name: words[0], depth }) };
    }
    if (step === 'frames') {
      const count = Math.round(Number(words[0]));
      const text = await this.side.command('liveFrames', { count });
      this.log.add({ kind: 'frames', count });
      return { text };
    }
    return this.picture(options);
  }

  /** `start`: the page booted for the hero (on `--screen`'s screen, as a phone's: its layout, the touch controls'
   *  scale) and set up, the steps begun again from it. */
  async start(options, version) {
    const heroClass = options.class ?? DEFAULT_CLASS;
    const fixture = fixtureFrom(options);
    this.log.begin({ heroClass, fixture, screen: options.screen ?? null });
    const started = Date.now();
    const setup = await this.boot(version);
    const took = seconds(started);
    const on = options.screen ? ` on ${screenText(options.screen)}` : '';
    return this.reported([`live: the ${heroClass} booted${on} and set up as ${JSON.stringify(setup)} (${took})`]);
  }

  /** `eval`: the expression evaluated on the page, kept to replay once it has run. */
  async evaluate(expression) {
    const result = await this.side.evaluate(expression);
    this.log.add({ kind: 'eval', expression });
    return typeof result === 'string' ? result : JSON.stringify(result, null, 2) ?? String(result);
  }

  /** `picture`: the page pictured, each picture written to its own file; their paths and notes, and the problems
   *  it found (a canary missed). */
  async picture(options) {
    const command = {
      views: options.views,
      look: options.look,
      focus: options.focus,
      on: options.on?.map(Number),
      distance: options.distance,
      over: options.over ? pictureUrl(options.over, 'live picture --over') : undefined,
      strength: options.strength,
      crop: options.crop?.map(Number),
      canary: Boolean(options.canary),
    };
    const { tiles, notes, problems } = await this.side.command('livePicture', command);
    mkdirSync(LIVE_DIR, { recursive: true });
    const number = this.log.nextPicture();
    const lines = tiles.map((tile) => {
      const file = join(LIVE_DIR, pictureName(number, tile.view, options.look));
      writeFileSync(file, Buffer.from(tile.png.split(',')[1], 'base64'));
      return `${tile.view}: ${relative(REPO, file)} (${tile.width}x${tile.height})`;
    });
    return { text: [...lines, ...notes].join('\n'), problems };
  }

  /**
   * The page kept as the steps left it: booted again and the steps replayed when it's gone (never booted by this
   * server, the browser closed) or the source changed since it booted. Returns notes of what it did.
   */
  async keep(version) {
    if (!this.log.started) throw labError('no live session: lab live start (with --class and the set-up) begins one');
    const alive = this.browser?.isConnected() && this.side?.page && !this.side.page.isClosed();
    if (alive && this.version === version) return [];
    const why = !alive ? 'the live page was not up' : 'the source changed';
    const started = Date.now();
    await this.boot(version);
    const replayed = await this.replay();
    return [`(${why}: booted it again and replayed ${replayed} (${seconds(started)}))`];
  }

  /** Boots the page for the log's hero and sets it up as the log began; resolves with the set-up. */
  async boot(version) {
    const { heroClass, fixture, screen } = this.log.start;
    if (!this.browser?.isConnected()) {
      this.browser = await launchBrowser();
      this.side = null;
    }
    this.side ??= new Side({
      name: 'live',
      root: REPO,
      repo: REPO,
      outDir: OUT,
      browser: this.browser,
      servedBy: this.session.repoSide,
    });
    await this.side.serve();
    await this.side.boot(heroClass);
    // (a fresh page each boot: a screen goes with its session)
    if (screen) await this.side.showOn(screen);
    this.version = version;
    return this.side.command('liveStart', fixture);
  }

  /** Replays the log's steps on a page just booted; a step that fails now is dropped with those after it. */
  async replay() {
    const steps = [...this.log.steps];
    for (let i = 0; i < steps.length; i++) {
      try {
        if (steps[i].kind === 'eval') await this.side.evaluate(steps[i].expression);
        else await this.side.command('liveFrames', { count: steps[i].count });
      } catch (error) {
        this.log.steps = steps.slice(0, i);
        this.log.write();
        const message = String(error?.message ?? error).split('\n')[0];
        throw labError(`live: replaying step ${i + 1} (${describeStep(steps[i])}) failed: ${message}; the steps `
          + `after it are dropped, the page holds those before it`);
      }
    }
    return steps.length === 1 ? '1 step' : `${steps.length} steps`;
  }

  /** The report of a step: its lines, and the problems it found with the errors the page raised. */
  async reported(lines, found = []) {
    const { errors } = await this.side.drainMessages();
    const problems = [...found, ...errors.map((error) => `the page: ${error}`)];
    const failed = problems.length ? [`FAILED: ${problems.join('; ')}`] : [];
    return { text: [...lines, ...failed].join('\n'), problems };
  }

  /** `stop`: the page and its browser closed, the steps forgotten. */
  async stop() {
    await this.close();
    this.log.clear();
    return { text: 'live: stopped', problems: [] };
  }

  /** Closes the page and its browser (the steps are kept, for a server started again). */
  async close() {
    await this.side?.closePage();
    await this.browser?.close().catch(() => {});
    this.side = null;
    this.browser = null;
  }
}
