// `lab auto`: Auto quality's walk down on a slow device (src/core/quality.ts). Auto is set as a player sets it, which
// starts it over from High, and fed each frame's time as a GPU-bound device would take it: in proportion to the
// pixels the scene renders, at the level's cost a pixel (`DEVICE`: the laptop's integrated GPU of trace JGNM-1NCF
// and its report, 5 frames a second at High on a 2864x1536 canvas, 15 ms a frame at Low on 0.52 Mpx). Each of Auto's
// steps is listed with when it came, and the time until the device holds its target: from play, "for the first
// minute or two, it was 5 fps". Run it on the tester's screen too: --screen 1432x768@2. The lab's frames are a 60th
// of a second each, so Auto is fed the device's times directly, its own code run as the game runs it.
// Canary: Auto's old pace (a level every 4 s window, frames over 250 ms not counted), which
// must be found too slow.
import type { Report } from './lab';
import { AUTO_QUALITY } from '../../../src/data/quality';
import type { QualityLevel } from '../../../src/data/quality';
import { autoAtBottom, qualityLevel, qualitySetting, sampleQuality, setQuality } from '../../../src/core/quality';
import { scenePixels } from '../../../src/core/renderer';

/** What `lab auto` is given. */
export interface AutoOptions { canary: boolean }

/** The slow device: its frame's time (ms) a million scene pixels at each level (High's MSAA and shadows dearest). */
const DEVICE: Record<QualityLevel, number> = { high: 45, medium: 36, low: 29 };
/** the longest Auto may take to bring the device to its target, or to Low where its pixels can't (s): Auto keeps the
 *  screen's own at every level (src/core/quality.ts) */
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
  if (!options.canary) return { text: lines.join('\n'), problems };
  const old = walkAt(OLD_PACE);
  lines.push(...walkLines('canary, the old pace', old));
  const caught = tookS(old) > MOST_S;
  lines.push(`  canary: the old pace ${caught ? 'caught' : 'went unseen'}`);
  if (!caught) problems.push('canary: Auto\'s old pace went unseen');
  return { text: lines.join('\n'), problems };
}
