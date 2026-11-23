// `lab crest`: the village's crest blown away as the lobby shows it (src/ui/crestBlow.ts). Its first blow must be on
// the context the boot made at its start, while the GPU's process was idle (`prepareCrest`): made as the crest was
// found, half way through the boot, that context waited 3.7 s behind the lobby's compiles on a CPU slowed four times,
// as a laptop's AMD Radeon held its boot 3.8 s and an Adreno 810 7.4 (traces EP2G-9M10, 4NA2-KWVF). At High each blow
// is the wind's; at Very low the crest fades, with no context made for it. The loading screen's exit is held to the
// same (`prepareExit` in loading.ts): a context made at High, none at Very low, where it fades; and a context let go
// is never lost by hand (`loseContext` waits on the GPU's process: as the lobby showed, an Adreno 810's boot held 13 s
// behind the pipelines it was compiling, trace DMDE-1E1R). `--canary` puts the level at Very low for the High blow,
// which must be caught as a fade, and makes the exit's context at Very low, as main made it at every level.
//
// The lab's pages have the wind off (reduced motion, and the device marked slow: `freshStorage` in node/browser.mjs),
// so its boot faded the crest and made no context for it: the wind is let back on here, the boot's context made and
// the crest found as the boot does them, and both put back after. A context's link is asked after on the browser's own
// timers (`readWhenLinked` in logoWind.ts), which the lab's stepped frames leave no time for: each read waits a moment
// of the browser's clock, as the game's frames leave it.
import * as crestBlow from '../../../src/ui/crestBlow';
import * as loading from '../../../src/ui/loading';
import * as logoWind from '../../../src/ui/logoWind';
import { qualityLevel, qualitySetting, setQuality } from '../../../src/core/quality';
import type { QualitySetting } from '../../../src/data/quality';
import type { Lab, Report } from './lab';

/** The options `lab crest` takes. */
export interface CrestOptions {
  canary: boolean;
}

/** How the crest stands (`crestNow` in crestBlow.ts). */
interface CrestNow {
  state: 'up' | 'blowing' | 'gone';
  went: 'wind' | 'fade' | null;
  waiting: boolean;
  fromBoot: boolean;
  linked?: boolean;
  lost?: boolean;
}

/** The crest's functions a tree from before `crestNow` lacks. */
interface CrestReads {
  crestNow?: () => CrestNow;
  prepareCrest?: () => void;
}

/** frames the crest is watched for its blow: its 8 s and the blow itself, at the lab's 60 a second */
const WATCHED_FRAMES = 60 * 12;
/** frames between reads of whether it has gone */
const READ_EVERY = 30;
/** the browser's own ms let pass at each read, for the link's asks on its timers */
const PAUSE_MS = 20;
/** the key that marks the device too slow for the wind (`SLOW_KEY` in logoWind.ts), and the lab's mark in it */
const SLOW_KEY = 'last-stand.logo-wind-slow';
const LAB_SLOW = '2';

const reads = crestBlow as CrestReads;

/** The exit's functions a tree from before `prepareExit` lacks. */
interface ExitReads {
  prepareExit?: () => void;
  exitWindAhead?: () => boolean;
}
const exitReads = { ...loading, ...logoWind } as ExitReads;

/** How many contexts were lost by hand since `countLosses` began (each `WEBGL_lose_context`'s `loseContext`). */
let losses = 0;
let counting = false;

/** Each context's `loseContext` counted from here on: the extension's prototype, every context's, patched once,
 *  found on a context of the check's own (the page's globals don't hold its interface). */
function countLosses(): void {
  if (counting) return;
  counting = true;
  const own = document.createElement('canvas').getContext('webgl2')?.getExtension('WEBGL_lose_context');
  if (!own) throw new Error('the page has no WEBGL_lose_context to count its losses by');
  const prototype = Object.getPrototypeOf(own) as WEBGL_lose_context;
  const lose = prototype.loseContext;
  prototype.loseContext = function (this: WEBGL_lose_context): void {
    losses++;
    lose.call(this);
  };
}

/** The loading screen's exit's context made as the boot makes it at `level`, then let go as a fade lets it go;
 *  problems where it's made at a level that fades, missing at one that blows, or lost by hand. */
function exitAt(level: QualitySetting, lines: string[], problems: string[], canary: boolean): void {
  if (!exitReads.prepareExit || !exitReads.exitWindAhead) {
    lines.push('the exit: a tree before prepareExit');
    return;
  }
  setQuality(level);
  // (the canary: made at every level, as main made it)
  if (canary) logoWind.prepareWind();
  else exitReads.prepareExit();
  const made = exitReads.exitWindAhead();
  const fades = level === 'low' || level === 'verylow';
  const before = losses;
  logoWind.dropWind();
  const lost = losses - before;
  lines.push(`the exit at ${level}: ${made ? 'a context made' : 'no context made'}, ${lost} lost by hand as let go`);
  if (fades && made) problems.push(`the exit's context made at ${level}, where it fades`);
  if (!fades && !made) problems.push(`no context made for the exit at ${level}, where it blows`);
  if (lost > 0) problems.push(`the exit's context lost by hand at ${level} (loseContext waits on the GPU's process)`);
}

/** How the crest stands now, or null in a tree whose crest says nothing of it (main's, before `crestNow`). */
const crestNow = (): CrestNow | null => reads.crestNow?.() ?? null;

/** A moment of the browser's own clock. */
const pause = (): Promise<void> => new Promise((done) => setTimeout(done, PAUSE_MS));

/** The crest shown until it has gone, or for `WATCHED_FRAMES`. */
async function watchBlow(lab: Lab): Promise<CrestNow | null> {
  for (let frame = 0; frame < WATCHED_FRAMES; frame += READ_EVERY) {
    await pause();
    await lab.step(READ_EVERY);
    if (crestNow()?.state === 'gone') break;
  }
  return crestNow();
}

/** A line saying how the crest stood. */
function lineOf(name: string, now: CrestNow | null): string {
  if (!now) return `${name}: the crest says nothing of how it stands (a tree before crestNow)`;
  const how = [now.fromBoot && 'the boot\'s', now.linked && 'linked', now.lost && 'lost'].filter(Boolean);
  const context = now.waiting ? `a context waiting${how.length ? ` (${how.join(', ')})` : ''}` : 'no context waiting';
  return `${name}: ${now.state}, its last blow ${now.went ?? 'none yet'}, ${context}`;
}

/** The crest put back up at `level` (the lobby left and entered again; at the boot, found as it finds it), then
 *  blown; its lines added. */
async function blowAt(lab: Lab, level: QualitySetting, name: string, lines: string[], boot = false):
Promise<CrestNow | null> {
  setQuality(level);
  if (boot) crestBlow.initCrestBlow();
  else crestBlow.updateCrestBlow(0, false);
  lines.push(lineOf(`${name}, put back`, crestNow()));
  const blown = await watchBlow(lab);
  lines.push(lineOf(`${name}, blown`, blown));
  return blown;
}

/** The wind let on (`on`) or off as the lab has it. */
async function windOn(lab: Lab, on: boolean): Promise<void> {
  await lab.reduceMotion(!on);
  if (on) localStorage.removeItem(SLOW_KEY);
  else localStorage.setItem(SLOW_KEY, LAB_SLOW);
}

/** `lab crest`: the crest's first blow on the boot's context, a blow at High by the wind, one at Very low faded. */
export async function crestBlows(lab: Lab, options: CrestOptions): Promise<Report> {
  const problems: string[] = [];
  const lines: string[] = [`booted at ${qualityLevel()}`];
  const setting = qualitySetting();
  countLosses();
  await windOn(lab, true);
  try {
    exitAt('high', lines, problems, false);
    exitAt('verylow', lines, problems, options.canary);
    // (the boot's context made as the boot makes it, at the level it starts at, and the crest found as it finds it)
    setQuality('high');
    reads.prepareCrest?.();
    const high = await blowAt(lab, options.canary ? 'verylow' : 'high', 'at High', lines, true);
    if (options.canary) lines.push('(the canary: the High blow at Very low)');
    if (high && high.went !== 'wind') problems.push(`the crest blown at High went by ${high.went ?? 'nothing'}`);
    const firstTook = lines.find((line) => line.startsWith('at High, put back')) ?? '';
    if (reads.prepareCrest && !options.canary && !firstTook.includes('the boot\'s')) {
      problems.push('the first blow\'s context isn\'t the one the boot made at its start (prepareCrest)');
    }
    const again = await blowAt(lab, 'high', 'at High again', lines);
    if (again && again.went !== 'wind') problems.push(`the crest blown again went by ${again.went ?? 'nothing'}`);
    const low = await blowAt(lab, 'verylow', 'at Very low', lines);
    if (low && low.went !== 'fade') problems.push(`the crest blown at Very low went by ${low.went ?? 'nothing'}`);
    if (low?.waiting) problems.push('a context waits for a blow at Very low, which fades');
    if (losses > 0) problems.push(`${losses} of the wind's contexts lost by hand (loseContext waits on the GPU)`);
  } finally {
    setQuality(setting);
    await windOn(lab, false);
  }
  return { text: lines.join('\n'), problems };
}
