// The lab's session (tools/lab): the game in a headless browser, served and booted by the lab, every command on a
// page booted for it. This tree is served by a Vite dev server of the lab's own with HMR off, so a probe never meets
// a stale copy of a module (HMR's re-imported copies once gave numbers from code no longer there). With `--ab`,
// another commit is exported and served beside it (side.mjs, commits.mjs).
//
// `npm run lab:serve` keeps a session up between commands (server.mjs); without it, a command opens a session for
// itself and closes it when done.
import { mkdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { launchBrowser, useLocalTemp } from './browser.mjs';
import { COMMANDS, pageKind, qualityOf } from './commands.mjs';
import { exportCommit } from './commits.mjs';
import { describeDifferences } from './compare.mjs';
import { labError } from './errors.mjs';
import { OUT, REPO } from './paths.mjs';
import { priorityNow } from './priority.mjs';
import { describePictureDifferences } from './pictures.mjs';
import { probeFiles } from './probeFiles.mjs';
import { keepProfile, profiled, scriptsIn, summarize } from './profile.mjs';
import { layersDiffer, summarizeLayers } from './layers.mjs';
import { placedTally, randomsDiffer, scriptsOfTally, summarizeRandoms, tallied } from './randoms.mjs';
import { bootOf, bootText, CONTEXT_OPTIONS, LAB_BOOT, layered, Side } from './side.mjs';
import { cacheShown, keep, readKept, sideKey } from './sideCache.mjs';

/** the hero a session boots until a command names another */
const DEFAULT_CLASS = 'ranger';
/** how many of a page's errors and warnings a report shows */
const MESSAGES_SHOWN = 8;

/** The probe a command names, relative to the repo with forward slashes. */
function probeOf(options) {
  return relative(REPO, resolve(REPO, options._[0])).split('\\').join('/');
}

function seconds(since) {
  return `${((Date.now() - since) / 1000).toFixed(1)} s`;
}

/** A screen as the command line writes it: `1280x720@3`. */
function screenName(screen) {
  return `${screen.width}x${screen.height}@${screen.ratio}`;
}

/** `screen` given the safe-area insets `--insets` names (left, top, right, bottom: css px), if any. */
function withInsets(screen, insets) {
  if (!screen || !insets) return screen;
  const [left, top, right, bottom] = insets;
  return { ...screen, insets: { left, top, right, bottom } };
}

/**
 * How a session's browser is launched: a check's (`worker` 1 and on) on a profile kept for its place from check to
 * check (tools/lab/out/profiles), so its pages find this tree's maps made and the GPU's programs cached on disk; on a
 * fresh one, every first boot of eight sessions made them all again, 45 to 55 s each. The server's and a command's
 * own (`worker` 0) start fresh: two commands run at once from one tree would want the same profile.
 */
function browserOptions(worker) {
  if (worker < 1) return {};
  return { profile: join(OUT, 'profiles', `check-${worker}`), contextOptions: CONTEXT_OPTIONS };
}

export class LabSession {
  /**
   * Opens a session: the browser launched, nothing served or booted until a command needs it. A check's sessions run
   * side by side, each its own `worker` (0 for the one the server keeps), their pages served by the check's servers
   * (`serving`: a side for this tree, and one for the other commit, which serve and boot nothing themselves).
   */
  static async open({ worker = 0, serving = null, keepPages = false } = {}) {
    mkdirSync(OUT, { recursive: true });
    useLocalTemp(OUT);
    const session = new LabSession(await launchBrowser(browserOptions(worker)), worker, serving);
    session.keepPages = keepPages;
    return session;
  }

  constructor(browser, worker = 0, serving = null) {
    this.browser = browser;
    this.worker = worker;
    this.serving = serving;
    /**
     * a page runs one command after another until another hero or boot is asked for, for the commands that keep one
     * (`keepsPage` in commands.mjs; a check's sessions: a boot a job, 15 to 20 s each, was most of a check)
     */
    this.keepPages = false;
    const servedBy = serving?.repo ?? null;
    this.repoSide = new Side({ name: 'this tree', root: REPO, repo: REPO, outDir: OUT, browser, worker, servedBy });
    this.otherSide = null;
    /** where the commands write their pictures (`outFor`): tools/lab/out, or a check's job's own folder */
    this.outRoot = OUT;
  }

  /** Where a command writes what it pictures, `name` under the session's output (`outRoot`). */
  outFor(name) {
    return join(this.outRoot, name);
  }

  /**
   * Runs one command (`{ command, options }`, as options.mjs reads it) on each side it asks for, each on a page
   * booted for it. Resolves with its report (with `--ab` the other commit's first, then how the two sides differ),
   * the problems that fail it (errors in a page, and what the command's own result reports: a canary missed), and
   * what it counted on each side, for a command that counts (`countsOf`), and how long its pages took to boot (s).
   *
   * Each side is the only page open while its turn runs: with two pages alive at once one of them lost the
   * browser's focus (the game lets go of the input on a blur), and a commit compared with itself came out three
   * clip frames apart.
   *
   * `only: 'other'` runs the A/B's other side alone and keeps it, run afresh (a check runs every job's so first, side
   * by side, each session keeping its page for the next; the job then reads it back).
   */
  async run({ command, options = { _: [] }, only = null }) {
    if (command === 'status') return { text: this.status(), problems: [] };
    const relaunched = await this.keepBrowser();
    const handler = COMMANDS[command];
    if (!handler) throw labError(`no command ${command} (there are ${Object.keys(COMMANDS).join(', ')}, status)`);
    handler.check?.(options);
    if (options.boot !== undefined) qualityOf(options.boot, '--boot');
    const boot = bootOf(options);
    const started = Date.now();
    const shown = await this.turnsFor(options);
    if (only === 'other' && shown.length !== 2) throw labError('only the other side: the command runs no A/B');
    // (this tree's turn first: its page was booted ahead, as the last command finished)
    const turns = only === 'other' ? [shown[0]] : [...shown].reverse();
    const heroClass = options.class ?? this.repoSide.heroClass ?? DEFAULT_CLASS;
    const notes = relaunched ? [relaunched] : [];
    /** how long its pages took to boot, s */
    let booting = 0;
    const problems = [];
    const resultOf = new Map();
    const randomsOf = new Map();
    const layersOf = new Map();
    for (const turn of turns) {
      const side = turn.side;
      // (a turn on a renderer of its own boots on it, `--renderers`)
      const turnBoot = turn.renderer === undefined ? boot : { ...boot, renderer: turn.renderer };
      // (every set-up building the hero afresh, a check's: `afresh` in check.mjs `jobOf`)
      const afresh = Boolean(options.afresh) && Boolean(handler.keepsPage);
      const key = this.keyOf(side, command, options, heroClass);
      const kept = key && only !== 'other' ? readKept(key) : null;
      if (kept) {
        resultOf.set(turn, kept.result);
        notes.push(`${turn.name}: as it ran ${kept.ranAt} (kept in ${cacheShown()}; --fresh runs it again)`);
        notes.push(...kept.notes);
        problems.push(...kept.problems);
        continue;
      }
      const sideNotes = [];
      const sideProblems = [];
      // (one page alive at a time: this tree's closed too when the other side runs alone)
      for (const other of [this.repoSide, this.otherSide]) if (other && other !== side) await other.closePage();
      const bootStarted = Date.now();
      // (a page of the kind the command may be run on: commands.mjs `pageKind`, checkQueue.mjs `pageOf`)
      const kind = pageKind(command, options);
      const keeps = this.keepPages && kind !== null && side.pageKind === kind;
      const keeping = { used: keeps, clean: Boolean(handler.countsCompiles) };
      if (await side.ready(heroClass, turnBoot, keeping)) {
        notes.push(`${turn.name}: booted the ${heroClass}${bootText(turnBoot)} (${seconds(bootStarted)})`);
        booting += (Date.now() - bootStarted) / 1000;
      }
      side.used = true;
      side.pageKind = kind;
      side.afresh = afresh;
      if (turn.screen) await side.showOn(turn.screen);
      let tally = null;
      let layers = null;
      const commandOnce = () => handler.each(side, options, this);
      const withLayers = options.layers
        ? async () => {
          const { result, pictures } = await layered(side.page, commandOnce);
          layers = pictures;
          return result;
        }
        : commandOnce;
      const runCommand = options.randoms
        ? async () => {
          const { result, entries } = await tallied(side.page, withLayers);
          tally = entries;
          return result;
        }
        : withLayers;
      if (options.profile) {
        const { result, profile } = await profiled(side.page, runCommand);
        resultOf.set(turn, result);
        const sourceOf = await side.sourceLocator(scriptsIn(profile));
        const within = typeof options.profile === 'string' ? options.profile : null;
        notes.push(`${turn.name}: ${summarize(profile, sourceOf, within)}`);
        // (kept whole too, its samples with their times: DevTools' Performance panel loads it)
        notes.push(`${turn.name}: the profile whole: ${keepProfile(command, turn.name, profile)}`);
      } else {
        resultOf.set(turn, await runCommand());
      }
      if (tally) {
        const placed = placedTally(tally, await side.sourceLocator(scriptsOfTally(tally)));
        randomsOf.set(turn, placed);
        notes.push(`${turn.name}: ${summarizeRandoms(placed)}`);
      }
      if (layers) {
        layersOf.set(turn, layers);
        notes.push(`${turn.name}: ${summarizeLayers(layers)}`);
      }
      const { errors, warnings } = await side.drainMessages();
      if (errors.length) {
        sideNotes.push(`${turn.name}: PAGE ERRORS\n  ${errors.slice(0, MESSAGES_SHOWN).join('\n  ')}`);
        sideProblems.push(`${turn.name}: ${errors.length} errors in the page`);
      }
      if (warnings.length) {
        sideNotes.push(`${turn.name}: joints past their ranges: ${warnings.slice(0, MESSAGES_SHOWN).join(' | ')}`);
      }
      const found = handler.problemsOf?.(resultOf.get(turn)) ?? [];
      for (const problem of found) sideProblems.push(`${turn.name}: ${problem}`);
      notes.push(...sideNotes);
      problems.push(...sideProblems);
      // (kept only from a page that raised nothing: a browser that fell over would be read back for good)
      if (key && errors.length === 0) {
        keep(key, { result: resultOf.get(turn), notes: sideNotes, problems: sideProblems });
      }
    }
    if (only === 'other') return { text: notes.join('\n'), problems, counts: [], booting };
    const results = shown.map((turn) => [turn, resultOf.get(turn)]);
    if (randomsOf.size === 2) notes.push(randomsDiffer(randomsOf.get(turns[0]), randomsOf.get(turns[1])));
    if (layersOf.size === 2) notes.push(layersDiffer(layersOf.get(turns[0]), layersOf.get(turns[1])));
    const textOf = handler.textOf ?? String;
    const text = handler.finish
      ? await handler.finish(results, options, this)
      : results.map(([turn, result]) => `${turn.name}\n${textOf(result)}`).join('\n\n');
    const verdict = results.length === 2 ? await this.compareSides(command, handler, results) : null;
    const failed = problems.length ? `FAILED: ${problems.join('; ')}` : null;
    const report = [...notes, text, verdict, failed, `(${seconds(started)})`].filter(Boolean).join('\n');
    const counts = handler.countsOf ? results.map(([turn, result]) => this.countsOn(turn, handler, result)) : [];
    return { text: report, problems, counts, booting };
  }

  /**
   * The turns a command runs, in the order they're shown (the one compared against first), each a side, its name, the
   * screen it's put on (none: the boot's own) and what its files' names start with: this tree alone; with `--ab`, the
   * other commit and then this tree; with `--screens`, this tree on each screen; with `--renderers`, this tree booted
   * on each renderer (`renderer`, the boot's for that turn).
   */
  async turnsFor(options) {
    const mine = this.repoSide;
    if (options.renderers) {
      const screen = withInsets(options.screen, options.insets);
      return options.renderers.map((renderer) => ({
        side: mine,
        name: `this tree on ${renderer}`,
        screen,
        filePrefix: `${renderer}-`,
        renderer: renderer === 'webgl' ? null : renderer,
      }));
    }
    if (options.screens) {
      return options.screens.map((screen) => withInsets(screen, options.insets)).map((screen) => ({
        side: mine,
        name: `this tree on ${screenName(screen)}`,
        screen,
        filePrefix: `${screenName(screen)}-`,
      }));
    }
    const screen = withInsets(options.screen, options.insets);
    const turns = [{ side: mine, name: mine.name, screen, filePrefix: '' }];
    if (options.ab) {
      const other = await this.sideFor(options.ab === true ? 'origin/main' : options.ab);
      turns.unshift({ side: other, name: other.name, screen, filePrefix: 'main-' });
    }
    return turns;
  }

  /** What a command counted on `turn` (`countsOf`), and whether that turn ran this tree. */
  countsOn(turn, handler, result) {
    return { side: turn.name, mine: turn.side === this.repoSide, counts: handler.countsOf(result) ?? {} };
  }

  /**
   * The key the other side of an A/B is kept under (sideCache.mjs), or null for one run afresh: this tree's (it
   * changes as you work), one asked for `--fresh`, and one being profiled, its random numbers tallied or its layers
   * listed.
   */
  keyOf(side, command, options, heroClass) {
    if (side.isRepo || options.fresh || options.profile || options.randoms || options.layers) return null;
    const extraFiles = command === 'probe' ? probeFiles(REPO, probeOf(options)) : [];
    return sideKey({ sha: side.sha, heroClass, command, options, extraFiles });
  }

  /** What is served and booted, for `lab status`. */
  status() {
    const lines = [this.repoSide, this.otherSide].filter(Boolean).map((side) => {
      if (!side.page) return `${side.name}: ${side.url ?? 'not served yet'}`;
      const how = side.bootedAs ?? LAB_BOOT;
      const fresh = side.isFresh(side.heroClass, how);
      const state = fresh ? 'booted for the next command' : 'used (the next command boots)';
      return `${side.name}: ${side.url}, the ${side.heroClass}${bootText(how)} ${state}`;
    });
    if (lines.length === 0) lines.push('nothing served yet');
    // (its browsers and Vite inherit it: `lowerPriority` in priority.mjs)
    lines.push(`the lab server runs at ${priorityNow()} priority`);
    return lines.join('\n');
  }

  /**
   * The A/B's verdict on its two sides' results (the other commit's first): their reports line by line, and with a
   * command that takes pictures, the pictures pixel by pixel, where they differ pictured in `out/ab/<command>`.
   */
  async compareSides(command, handler, [[before, beforeResult], [after, afterResult]]) {
    const textOf = handler.textOf ?? String;
    const lines = [describeDifferences(before.name, textOf(beforeResult), after.name, textOf(afterResult))];
    if (handler.pictures) {
      const pairs = handler.pictures(beforeResult, afterResult);
      lines.push(await describePictureDifferences(this.browser, pairs, this.outFor(join('ab', command))));
    }
    return lines.join('\n');
  }

  /**
   * Boots this tree's page for the next command (the hero of the last one, booted as it was), unless a fresh one is
   * up. Closes the other side's page first: one page alive at a time. Returns what it did, for the server's log.
   */
  async bootNext() {
    await this.keepBrowser();
    await this.otherSide?.closePage();
    const heroClass = this.repoSide.heroClass ?? DEFAULT_CLASS;
    const how = this.repoSide.bootedAs ?? LAB_BOOT;
    const started = Date.now();
    if (!(await this.repoSide.ready(heroClass, how))) return null;
    return `booted the ${heroClass}${bootText(how)} for the next command (${seconds(started)})`;
  }

  /**
   * Launches the browser again if it has closed (it crashed, or was killed): every page, context and command after
   * it failed on the dead one, and only a restart of the server brought the lab back. Returns a note if it did.
   */
  async keepBrowser() {
    if (this.browser.isConnected()) return null;
    this.browser = await launchBrowser(browserOptions(this.worker));
    for (const side of [this.repoSide, this.otherSide]) side?.useBrowser(this.browser);
    return 'the browser had closed: launched it again';
  }

  async close() {
    await Promise.allSettled([this.repoSide.close(), this.otherSide?.close()]);
    await this.browser.close().catch(() => {});
  }

  /** The other side of an A/B: commit `ref` exported and served (the same one kept while it's asked for again). */
  async sideFor(ref) {
    const { sha, dir } = exportCommit(REPO, OUT, ref);
    // (a check asks for the commit by its hash, resolved once for all its sessions: named by all forty, its reports'
    // every other line began with it)
    const name = ref === sha ? sha.slice(0, 7) : `${ref} (${sha.slice(0, 7)})`;
    if (this.otherSide?.sha === sha) {
      // (named as it's asked for this time: the commit asked for as HEAD~1 and, two commits on, as HEAD~3 was still
      // called HEAD~1)
      this.otherSide.name = name;
      return this.otherSide;
    }
    await this.otherSide?.close();
    const worker = this.worker;
    const servedBy = this.serving?.other?.sha === sha ? this.serving.other : null;
    const browser = this.browser;
    this.otherSide = new Side({ name, root: dir, repo: REPO, outDir: OUT, browser, sha, worker, servedBy });
    return this.otherSide;
  }
}
