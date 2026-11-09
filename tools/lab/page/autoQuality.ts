// `lab auto`: Auto quality's walk down on a slow device (src/core/quality.ts). Auto is set as a player sets it, which
// starts it over from High, and fed each frame's time as a GPU-bound device would take it: in proportion to the
// pixels the scene renders, at the level's cost a pixel (`DEVICE`: the laptop's integrated GPU of trace JGNM-1NCF
// and its report, 5 frames a second at High on a 2864x1536 canvas, 15 ms a frame at Low on 0.52 Mpx). Each of Auto's
// steps is listed with when it came, and the time until the device holds its target: from play, "for the first
// minute or two, it was 5 fps". Run it on the tester's screen too: --screen 1432x768@2. The lab's frames are a 60th
// of a second each, so Auto is fed the device's times directly, its own code run as the game runs it.
// Then Auto as a boot starts it, at a level it settled on before: once its frames are the device's it tries the level
// above, kept on a device that
// holds it (a fast one settled on Medium, from play: a 4070 Ti on Medium "somehow"), left at once for the settled one
// on a device that can't, never past it, and the cookie as it was.
// A device that runs the level above under the target but not far under it (trace 9JA7-BSSS: a phone settled on
// Medium, at 26 to 47 frames a second on High) must leave it within a settle and a quick window, and boots in a row
// on it must skip the trial after each miss, twice as many boots each time (1, 2, 4, 8), its trial's frames marked
// Auto's (`autoTrying`, which the performance recorder leaves out of play).
// Canaries: Auto's old pace (a level every 4 s window, frames over 250 ms not counted), which must be found too slow,
// and must leave the phone's High too late; a boot that starts at the settled level as Auto used to, whose fast device
// must be found never stepped back up; and the trial's cookie lost between boots, which must be found trying every
// boot.
import type { Report } from './lab';
import { AUTO_QUALITY } from '../../../src/data/quality';
import type { QualityLevel } from '../../../src/data/quality';
import {
  autoAtBottom, autoSettled, autoTrying, bootAuto, qualityLevel, qualitySetting, sampleQuality, setQuality, useQuality,
} from '../../../src/core/quality';
import { scenePixels } from '../../../src/core/renderer';
import { removeCookie, writeCookie } from '../../../src/core/cookies';

/** Auto's cookie, the level it settled on (`AUTO_COOKIE` in src/core/quality.ts) */
const AUTO_COOKIE = 'last-stand-quality-auto';
/** the missed trial's cookie, the boots it still skips (`TRIAL_COOKIE` in src/core/quality.ts) */
const TRIAL_COOKIE = 'last-stand-quality-trial';

/** What `lab auto` is given. */
export interface AutoOptions { canary: boolean }

/** The slow device: its frame's time (ms) a million scene pixels at each level (High's MSAA and shadows dearest). */
const DEVICE: Record<QualityLevel, number> = { high: 45, medium: 36, low: 29, verylow: 24 };
/** the longest Auto may take to bring the device to its target, or to the last level (Very low) where its pixels
 *  can't (s): Auto keeps the screen's own at every level (src/core/quality.ts) */
const MOST_S = 8;
/** the longest it's run before giving up (s) */
const GIVE_UP_S = 300;
/** Auto's pace before the walk was sped up: the canary's (its quick path never judged before the 4 s path) */
const OLD_PACE = { quickWindow: Infinity, longestFrame: 0.25 };
/** The fast device with hitches: its frame (s), a hitch every so many frames and how long (s), and for how long */
const FAST_FRAME_S = 1 / 60;
const HITCH_EVERY = 120;
const HITCH_S = 0.8;
const HITCHED_S = 30;

/** A step Auto took: when (s from the start), and where it went. */
interface Step { at: number; said: string; fps: number }

/** The device's frame time now (s). */
const frameS = (): number => (scenePixels() / 1e6) * DEVICE[qualityLevel()] / 1000;

/** Auto walked down on the device from High: its steps, and when the device first held its target (s; -1 never). */
function walk(): { steps: Step[]; heldAt: number; start: string } {
  setQuality('auto');
  const start = `${qualityLevel()}@${Math.round(scenePixels())}, ${(1 / frameS()).toFixed(1)} fps`;
  const steps: Step[] = [];
  let at = 0;
  let heldAt = -1;
  while (at < GIVE_UP_S) {
    const dt = frameS();
    if (heldAt < 0 && 1 / dt >= AUTO_QUALITY.minFps) heldAt = at;
    if (heldAt >= 0 || autoAtBottom()) break;
    at += dt;
    const said = sampleQuality(dt);
    if (said) steps.push({ at, said, fps: 1 / frameS() });
  }
  return { steps, heldAt, start };
}

/** `fn` run with `pace` over Auto's own, both put back after. */
function withPace<T>(pace: Partial<typeof AUTO_QUALITY>, fn: () => T): T {
  const own = { ...AUTO_QUALITY };
  const setting = qualitySetting();
  Object.assign(AUTO_QUALITY, pace);
  try {
    return fn();
  } finally {
    Object.assign(AUTO_QUALITY, own);
    setQuality(setting);
  }
}

/** The walk run with `pace` over Auto's own. */
const walkAt = (pace: Partial<typeof AUTO_QUALITY>): ReturnType<typeof walk> => withPace(pace, walk);

/** A fast device's frames with a long hitch every two seconds, fed to Auto from High: the steps it took (none). */
function hitched(): string[] {
  return withPace({}, () => {
    setQuality('auto');
    const steps: string[] = [];
    for (let frame = 1, at = 0; at < HITCHED_S; frame++) {
      const dt = frame % HITCH_EVERY === 0 ? HITCH_S : FAST_FRAME_S;
      at += dt;
      const said = sampleQuality(dt);
      if (said) steps.push(`${at.toFixed(1)} s: ${said}`);
    }
    return steps;
  });
}

/** A boot of Auto's from a level it settled on: on a device whose frame (s) at each level is `deviceS`, how it went. */
interface Boot {
  /** the level it started at */
  start: QualityLevel;
  /** where it was after `BOOT_S` */
  end: QualityLevel;
  /** what its cookie keeps for the next boot */
  saved: QualityLevel;
  /** when it last stepped or kept a level (s), and what it said */
  steps: string[];
  /** whether it tried the level above */
  tried: boolean;
  /** how long its frames were marked Auto's trial (s) */
  tryingS: number;
}

/** how long a boot is fed frames (s) */
const BOOT_S = 20;
/** the longest a boot may take to keep the level above or leave it (s): two settles and a window */
const BOOT_MOST_S = 10;

/** Auto booted from `settled` (as it used to, with no level above tried, when `old`) and fed `deviceS`'s frames. */
function boot(settled: QualityLevel, deviceS: (level: QualityLevel) => number, old = false): Boot {
  return withPace({}, () => {
    setQuality('auto');
    return bootOnce(settled, deviceS, old);
  });
}

/** One boot of Auto's from `settled` (the trial's cookie as the last boot left it), fed `deviceS`'s frames. */
function bootOnce(settled: QualityLevel, deviceS: (level: QualityLevel) => number, old = false): Boot {
  // (the cookie as a boot finds it: choosing Auto saved High)
  writeCookie(AUTO_COOKIE, settled);
  if (old) useQuality(settled);
  else bootAuto(settled);
  const start = qualityLevel();
  const steps: string[] = [];
  let tryingS = 0;
  for (let at = 0; at < BOOT_S;) {
    const dt = deviceS(qualityLevel());
    at += dt;
    const said = sampleQuality(dt);
    if (autoTrying()) tryingS += dt;
    if (said) steps.push(`${at.toFixed(1)} s: ${said}`);
  }
  const tried = steps.some((said) => said.includes('trying'));
  return { start, end: qualityLevel(), saved: autoSettled(), steps, tried, tryingS };
}

/** when a boot's last step came (s) */
const lastStepS = (b: Boot): number => Number.parseFloat(b.steps.at(-1) ?? '0');

/** A boot in a line. */
const bootLine = (label: string, b: Boot): string => `  ${label}: started at ${b.start}, at ${b.end} after `
  + `${BOOT_S} s, ${b.saved} kept for the next boot${b.steps.length ? ` (${b.steps.join('; ')})` : ''}`;

/** A fast device's frame at any level (s) */
const fastS = (): number => FAST_FRAME_S;
/** A device that holds Medium and not High, far below the target there (s) */
const mediumOnlyS = (level: QualityLevel): number => level === 'high' ? 1 / 20 : FAST_FRAME_S;
/** The phone of trace 9JA7-BSSS: Medium held, High under the target but not far under it (s) */
const nearMediumS = (level: QualityLevel): number => level === 'high' ? 1 / 38 : FAST_FRAME_S;
/** the longest a device may run a level above that it can't hold (s): its settle, a quick window and a frame */
const TRIAL_MOST_S = AUTO_QUALITY.settle + AUTO_QUALITY.quickWindow + 0.2;
/** the problem a trial kept too long raises (the old pace's canary must raise it) */
const TRIED_LONG = "ran the level above it can't hold for";
/** A device that holds only Low, far below the target above it (s) */
const lowOnlyS = (level: QualityLevel): number => level === 'low' ? FAST_FRAME_S : 1 / 15;

/** Each boot's problems: where it should end, and what it should keep. */
function bootProblems(label: string, b: Boot, end: QualityLevel, problems: string[]): void {
  if (b.end !== end) problems.push(`${label}: Auto ended at ${b.end}, not ${end}`);
  if (b.saved !== end) problems.push(`${label}: Auto kept ${b.saved} for the next boot, not ${end}`);
  const took = lastStepS(b);
  if (took > BOOT_MOST_S) problems.push(`${label}: Auto took ${took.toFixed(1)} s, over ${BOOT_MOST_S}`);
  const missed = b.tried && b.end === b.start;
  if (missed && b.tryingS > TRIAL_MOST_S) {
    problems.push(`${label}: Auto ${TRIED_LONG} ${b.tryingS.toFixed(1)} s, over ${TRIAL_MOST_S.toFixed(1)}`);
  }
}

/** A boot to judge: a device settled on a level, its frame at each level (s), and where Auto must end. */
interface BootCase {
  label: string;
  settled: QualityLevel;
  device: (level: QualityLevel) => number;
  end: QualityLevel;
}

/** The boots from a settled level, as lines; their problems added to `problems`. */
function boots(canary: boolean, problems: string[]): string[] {
  const lines = ['Auto as a boot starts it, from the level it settled on before:'];
  const cases: BootCase[] = [
    { label: 'a fast device settled on Medium', settled: 'medium', device: fastS, end: 'high' },
    { label: 'a fast device settled on Low', settled: 'low', device: fastS, end: 'medium' },
    { label: 'a device holding Medium alone, settled there', settled: 'medium', device: mediumOnlyS, end: 'medium' },
    { label: 'a phone holding Medium, High at 38 fps', settled: 'medium', device: nearMediumS, end: 'medium' },
    { label: 'a device holding Low alone, settled there', settled: 'low', device: lowOnlyS, end: 'low' },
    { label: 'a fast device settled on High', settled: 'high', device: fastS, end: 'high' },
  ];
  for (const { label, settled, device, end } of cases) {
    const b = boot(settled, device);
    lines.push(bootLine(label, b));
    bootProblems(label, b, end, problems);
  }
  lines.push(inARow(false, problems));
  if (!canary) return lines;
  lines.push(...slowTrialCanary(problems));
  lines.push(...lostCookieCanary(problems));
  const old = boot('medium', fastS, true);
  lines.push(bootLine('canary, a fast device settled on Medium booted as Auto used to', old));
  const caught = old.end !== 'high';
  lines.push(`  canary: Auto never stepping back up ${caught ? 'caught' : 'went unseen'}`);
  if (!caught) problems.push('canary: Auto never stepping back up went unseen');
  return lines;
}

/** how many boots in a row the phone is booted */
const BOOTS_IN_A_ROW = 12;
/** the boots of those that must try the level above (1-based): each miss skips 1, then 2, 4 and 8 boots */
const TRIED_AT = [1, 3, 6, 11];
/** the problem boots tried at other boots raise (the lost cookie's canary must raise it) */
const TRIED_BOOTS = 'tried the level above at boots';

/** The phone booted `BOOTS_IN_A_ROW` times (its trial's cookie lost before each when `lose`): the boots that tried. */
function inARow(lose: boolean, problems: string[]): string {
  const tried = withPace({}, () => {
    setQuality('auto');
    const at: number[] = [];
    for (let n = 1; n <= BOOTS_IN_A_ROW; n++) {
      if (lose) removeCookie(TRIAL_COOKIE);
      if (bootOnce('medium', nearMediumS).tried) at.push(n);
    }
    return at;
  });
  const label = lose ? 'canary, the phone booted with its trial cookie lost' : 'the phone booted';
  const said = `${label} ${BOOTS_IN_A_ROW} times: ${TRIED_BOOTS} ${tried.join(', ')}`;
  if (tried.join() !== TRIED_AT.join()) problems.push(`${said}, not ${TRIED_AT.join(', ')}`);
  return `  ${said}`;
}

/** The phone booted at Auto's old pace: its trial must be found kept too long. */
function slowTrialCanary(problems: string[]): string[] {
  const slow = withPace(OLD_PACE, () => {
    setQuality('auto');
    return bootOnce('medium', nearMediumS);
  });
  const found: string[] = [];
  bootProblems('canary', slow, 'medium', found);
  const caught = found.some((problem) => problem.includes(TRIED_LONG));
  if (!caught) problems.push("canary: the old pace's trial went unseen");
  return [
    bootLine('canary, the phone booted at the old pace', slow),
    `  canary: the old pace's trial ${caught ? 'caught' : 'went unseen'}`,
  ];
}

/** The phone booted with its trial's cookie lost each time: it must be found trying every boot. */
function lostCookieCanary(problems: string[]): string[] {
  const found: string[] = [];
  const line = inARow(true, found);
  const caught = found.some((problem) => problem.includes(TRIED_BOOTS));
  if (!caught) problems.push("canary: the trial's cookie lost went unseen");
  return [line, `  canary: the trial's cookie lost ${caught ? 'caught' : 'went unseen'}`];
}

/** The walk's time to the target, or to the bottom when the device never got there (s). */
const tookS = (w: ReturnType<typeof walk>): number => (w.heldAt >= 0 ? w.heldAt : w.steps.at(-1)?.at ?? 0);

/** The walk in lines. */
function walkLines(label: string, w: ReturnType<typeof walk>): string[] {
  const held = w.heldAt >= 0 ? `held ${AUTO_QUALITY.minFps} fps after ${w.heldAt.toFixed(1)} s`
    : `never held ${AUTO_QUALITY.minFps} fps (at the bottom after ${tookS(w).toFixed(1)} s)`;
  return [
    `  ${label}: from ${w.start}, ${w.steps.length} steps, ${held}`,
    ...w.steps.map((s) => `    ${s.at.toFixed(1)} s: ${s.said}, ${s.fps.toFixed(1)} fps`),
  ];
}

export function autoQuality(options: AutoOptions): Report {
  const lines = [`Auto quality's walk down from High on a slow device (${DEVICE.high} ms a Mpx at High):`];
  const problems: string[] = [];
  const now = walkAt({});
  lines.push(...walkLines('Auto', now));
  if (!now.steps.length) problems.push('Auto never stepped down: the device wasn\'t slow, or Auto never ran');
  if (tookS(now) > MOST_S) problems.push(`Auto took ${tookS(now).toFixed(1)} s to step the device down, over ${MOST_S}`);
  const hitches = hitched();
  lines.push(`  a fast device (60 fps) with a ${HITCH_S * 1000} ms hitch every ${HITCH_EVERY / 60} s, for `
    + `${HITCHED_S} s: ${hitches.length ? hitches.join('; ') : 'no step'}`);
  if (hitches.length) problems.push(`Auto stepped a fast device down for its hitches: ${hitches.join('; ')}`);
  lines.push(...boots(options.canary, problems));
  if (!options.canary) return { text: lines.join('\n'), problems };
  const old = walkAt(OLD_PACE);
  lines.push(...walkLines('canary, the old pace', old));
  const caught = tookS(old) > MOST_S;
  lines.push(`  canary: the old pace ${caught ? 'caught' : 'went unseen'}`);
  if (!caught) problems.push('canary: Auto\'s old pace went unseen');
  return { text: lines.join('\n'), problems };
}
