// `lab auto`'s part on the frame rate Auto holds: the best the device shows, read at the lowest level
// (src/core/quality.ts `probe`), nine tenths of it the target every level is held to. From the owner: "auto on any
// device should always try to reach max FPS on any screen", "but we should try to make it run in a higher quality
// setting, still.... if we can". Devices are played by their frame's time at each level, no faster than their screen
// shows; the canary is Auto with nothing read (its target 50 frames a second, as it was).
import type { QualityLevel } from '../../../src/data/quality';
import { AUTO_QUALITY } from '../../../src/data/quality';
import { autoSettled, autoTarget, bootAuto, qualityLevel, qualitySetting, sampleQuality, setQuality } from '../../../src/core/quality';
import { removeCookie, writeCookie } from '../../../src/core/cookies';

/** Auto's cookies (src/core/quality.ts): the level it settled on, a missed trial's boots, the best frame rate read */
const AUTO_COOKIE = 'last-stand-quality-auto';
const TRIAL_COOKIE = 'last-stand-quality-trial';
const BEST_COOKIE = 'last-stand-quality-best';

/** A device: what a frame takes it at each level (s), and how often its screen shows one (Hz). */
interface Device { frame: Record<QualityLevel, number>; screen: number }

/** A phone with a 120 Hz screen that shows 120 at Very low, 111 at Low and 62 at Medium (the S25 of trace YJ7A-A409:
 *  109 to 117 at its lower levels, 62 at Medium). */
const PHONE: Device = { frame: { verylow: 1 / 125, low: 1 / 111, medium: 1 / 62, high: 1 / 33 }, screen: 120 };
/** A desktop that draws every level faster than its 60 Hz screen shows. */
const FAST_60: Device = { frame: { verylow: 1 / 400, low: 1 / 300, medium: 1 / 200, high: 1 / 150 }, screen: 60 };
/** A weak device: 40 frames a second at its best, 38.5 at Low, 25 at Medium. */
const WEAK: Device = { frame: { verylow: 1 / 40, low: 1 / 38.5, medium: 1 / 25, high: 1 / 16 }, screen: 60 };

/** How long each case is played (s): a probe, a walk down every level and a climb back up them fit. */
const PLAYED_S = 120;

/** A case: a device booted settled on a level, the best frame rate its cookie holds (none: never read), and where
 *  Auto must be once played. */
interface Case { label: string; device: Device; settled: QualityLevel; kept?: number; end: QualityLevel }

const CASES: Case[] = [
  { label: 'a 120 Hz phone settled on Medium at 62 fps, its best never read', device: PHONE, settled: 'medium', end: 'low' },
  { label: 'a fast desktop on a 60 Hz screen, settled on Medium', device: FAST_60, settled: 'medium', end: 'high' },
  { label: 'a weak device, 40 fps at its best, settled on Very low', device: WEAK, settled: 'verylow', end: 'low' },
  { label: 'a fast desktop moved from a 120 Hz screen to a 60 Hz one', device: FAST_60, settled: 'high', kept: 120, end: 'high' },
];

/** What a case came to: where Auto ended, what it kept for the next boot, its target then, and what it said. */
interface Played { end: QualityLevel; saved: QualityLevel; target: number; said: string[] }

/** The frame a device shows at the level in effect (s): its own time, no shorter than its screen's. */
const shownS = (device: Device): number => Math.max(device.frame[qualityLevel()], 1 / device.screen);

/** A case played through Auto for `PLAYED_S`, with `pace` over Auto's own; Auto's setting and cookies put back. */
function played(one: Case, pace: Partial<typeof AUTO_QUALITY> = {}): Played {
  const own = { ...AUTO_QUALITY };
  const setting = qualitySetting();
  Object.assign(AUTO_QUALITY, pace);
  try {
    setQuality('auto');
    removeCookie(TRIAL_COOKIE);
    writeCookie(AUTO_COOKIE, one.settled);
    if (one.kept) writeCookie(BEST_COOKIE, `${one.kept}/${Math.floor(Date.now() / 86_400_000)}`);
    else removeCookie(BEST_COOKIE);
    bootAuto(one.settled);
    const said: string[] = [];
    for (let at = 0; at < PLAYED_S;) {
      const dt = shownS(one.device);
      at += dt;
      const step = sampleQuality(dt);
      if (step) said.push(`${at.toFixed(1)} s: ${step}`);
    }
    return { end: qualityLevel(), saved: autoSettled(), target: autoTarget(), said };
  } finally {
    Object.assign(AUTO_QUALITY, own);
    removeCookie(BEST_COOKIE);
    removeCookie(TRIAL_COOKIE);
    setQuality(setting);
  }
}

const line = (label: string, p: Played): string =>
  `  ${label}: at ${p.end}, ${p.saved} kept, holding ${p.target.toFixed(0)} fps (${p.said.join('; ') || 'no step'})`;

/** The frame rate Auto holds, as lines; its problems added to `problems`. */
export function bestCases(canary: boolean, problems: string[]): string[] {
  const lines = ['The frame rate Auto holds: nine tenths of the best the device shows, read at its lowest level:'];
  for (const one of CASES) {
    const p = played(one);
    lines.push(line(one.label, p));
    if (p.end !== one.end) problems.push(`${one.label}: Auto ended at ${p.end}, not ${one.end}`);
    if (p.saved !== one.end) problems.push(`${one.label}: Auto kept ${p.saved} for the next boot, not ${one.end}`);
  }
  if (!canary) return lines;
  const old = played(CASES[0], { probeWindows: 0 });
  lines.push(line('canary, the phone with nothing read (50 fps the target)', old));
  const caught = old.end !== CASES[0].end;
  lines.push(`  canary: Auto holding 50 fps ${caught ? 'caught' : 'went unseen'}`);
  if (!caught) problems.push('canary: Auto holding 50 fps on the 120 Hz phone went unseen');
  return lines;
}
