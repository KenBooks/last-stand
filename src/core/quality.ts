// Graphics quality: the player's setting (auto / high / medium / low / very low, cookie) and the
// level in effect. Auto holds the best frame rate the device shows on its screen: what the lowest level reaches,
// read there (`probe`), and nine tenths of it the target (from the owner: "auto on any device should always try
// to reach max FPS on any screen", "but we should try to make it run in a higher quality setting, still.... if we
// can"). Held to 50 frames a second, a 120 Hz phone that ran 109 to 117 at its lower levels was raised to Medium
// and left at 62, then 28 as it warmed (trace YJ7A-A409). Auto steps down while frame rate stays under the target,
// judging play alone (no loading frame) and, where its
// GPU's time a frame is known, only a GPU too slow for the target. Each boot or fresh Auto choice,
// once the game is shown, it tries higher levels in turn, each kept once it holds its frame rate for a
// window, else left for the settled one at its first quick window under the target and put off
// for a few boots (`bootAuto`, `trialMissed`). Every level renders the
// screen's own pixels: what's cut is other work,
// never the resolution (from play, "I want to run the game at full phone res, if we need
// to cut, we need to cut something else, not resolution").
import { WEBGPU, setPlainLitOnWebGPU } from './webgpu';
import * as THREE from 'three';
import { G } from '../state';
import { QUALITY, QUALITY_ORDER, AUTO_QUALITY, type QualityLevel, type QualitySetting } from '../data/quality';
import { setBloomShare, setRenderQuality, setResolutionShare, setShadowInTurns } from './renderer';
import { setParticleShare } from '../fx/particles';
import { setFlameSteps } from '../world/fire';

import { readCookie, writeCookie } from './cookies';
import { framesUncapped } from './frameLoop';
import { setHeroDetail } from '../entities/models/armor';
import { setRubbleShadows } from '../fx/rubble';
import { setReliefSteps } from './parallax';
import { setGrassSpread, setGrassTufts } from '../world/meadow';
import { setDrapeRounds } from '../entities/models/armor';
import { setLampQuality } from './lamps';
import { setShadowsOnMove } from '../world/shadowsOnMove';
import { setHdrAllowed } from './hdr';
import { setSkullDetail } from '../world/skull';
import { setSunShadowStill } from '../world/props';
import { setClutterShare, setLeafShare, setFloorPlants } from '../world/culling';
import { setSimpleTrees } from '../world/simpleTrees';
import { compiledThoughHidden } from './shaders';
import { setGearGlowByLevel } from './materials';

// (Very low's floor plants, hidden, compiled with the rest on WebGPU: Auto may climb to Low, and show them, mid-fight)
compiledThoughHidden(() => {
  if (QUALITY[level].floorPlants) return () => undefined;
  setFloorPlants(true);
  return () => setFloorPlants(false);
});

/** how far the moon's shadows' edges blur on the floor (m): at its default a texel, 1.7 to 7 cm by the map's size,
 *  every shadow's edge was hard */
const PENUMBRA = 0.12;

const COOKIE = 'last-stand-quality';
// what Auto settled on, the next session starting there: its level (a budget of pixels after an `@`, which an
// older Auto wrote, `low@518400`, is let go)
const AUTO_COOKIE = 'last-stand-quality-auto';
// the trial of the level above, after one missed: the boots still to skip it and the gap it was given, `skip/gap`
// (trace 9JA7-BSSS: a phone settled on Medium ran High at 26 to 47 frames a second for 6 s every boot)
const TRIAL_COOKIE = 'last-stand-quality-trial';
/** the most boots a missed trial skips before the next (a gap doubled at each miss: 1, 2, 4, 8) */
const TRIAL_GAP_MOST = 8;

let setting: QualitySetting = 'auto';
let level: QualityLevel = 'high';
/** the level above the settled one still to be tried this session (`bootAuto`) */
let aboveNext = false;
/** the level Auto settled on while it tries the one above, null once it's kept or left */
let trialFrom: QualityLevel | null = null;
/** the most pixels the scene renders (Infinity: the screen's own); only a harness sets one (`useQuality`) */
let budget = Infinity;
let frames = 0, time = 0, settle = 0;
/** the window's frame times up to `longestFrame` (s), and their sum: the quick path's median reads them */
const quick: number[] = [];
let quickTime = 0;
/** the GPU's own times a frame (ms) come back over each path's window, where a timer query gives them
 *  (`noteGpuFrame`): a window under the target with these within the target's frame steps nothing */
const gpuQuick: number[] = [];
const gpuWindow: number[] = [];
/** the play (s) still to go before the level a step down left is tried again, Infinity: none to try */
let retryIn = Infinity;
/** the levels already tried again this visit: each a step down left is tried once */
const retried = new Set<QualityLevel>();

// the best frame rate the device has shown at the lowest level and the day it was read, `fps/day`
const BEST_COOKIE = 'last-stand-quality-best';
/** the best frames a second the lowest level has shown (0: not read yet), and the day it was read (days since
 *  1970) */
let best = 0, bestDay = 0;
/** the level Auto left to read the lowest one's frame rate, while it reads it; the windows read and their best */
let probeFrom: QualityLevel | null = null;
let probeWindows = 0, probeBest = 0;
/** the windows in a row at the bottom, outside a probe, and the best of them: the device's best as it is now */
let bottomWindows = 0, bottomBest = 0;
/** how many windows at the bottom, all under the target, say the screen shows fewer frames than it did */
const BOTTOM_SAYS = 5;

const today = (): number => Math.floor(Date.now() / 86_400_000);

/** The frames a second Auto holds: `holdBest` of the best the lowest level has shown, `minFps` where that isn't
 *  known, is never read (`probeWindows` 0) or frames are uncapped (they come as fast as they're drawn, and the
 *  screen's own rate isn't theirs). Exported for a harness (`lab auto`) and the report. */
export function autoTarget(): number {
  if (!(best > 0) || AUTO_QUALITY.probeWindows <= 0 || framesUncapped()) return AUTO_QUALITY.minFps;
  return AUTO_QUALITY.holdBest * best;
}

function readBest(): void {
  const [fps, day] = (readCookie(BEST_COOKIE) ?? '').split('/').map(Number);
  best = fps > 0 ? fps : 0;
  bestDay = day > 0 ? day : 0;
}

function keepBest(fps: number): void {
  best = fps;
  bestDay = today();
  writeCookie(BEST_COOKIE, `${fps.toFixed(1)}/${bestDay}`);
}

/** Whether the lowest level's frame rate is to be read now: never read, or `probeDays` ago (a phone's battery
 *  saver, a window moved to another screen). */
const probeDue = (): boolean => AUTO_QUALITY.probeWindows > 0 && !framesUncapped()
  && (!(best > 0) || today() - bestDay >= AUTO_QUALITY.probeDays);

/** The lowest level gone to for `probeWindows` quick windows, to read the best the device shows. */
function probe(): string {
  probeFrom = level;
  probeWindows = probeBest = 0;
  const bottom = QUALITY_ORDER[QUALITY_ORDER.length - 1];
  if (level !== bottom) apply(bottom);
  else restart();
  return `reading ${bottom}`;
}

/** A frame of a probe: once its windows are read, their best kept and the level it left gone back to. */
function probing(dt: number): string | null {
  quick.push(dt);
  quickTime += dt;
  if (quickTime < AUTO_QUALITY.quickWindow) return null;
  probeBest = Math.max(probeBest, 1 / median(quick));
  quick.length = 0;
  quickTime = 0;
  if (++probeWindows < AUTO_QUALITY.probeWindows) return null;
  keepBest(probeBest);
  const back = probeFrom!;
  probeFrom = null;
  if (back !== level) apply(back);
  return `best ${probeBest.toFixed(0)}`;
}

/** A frame at the bottom, outside a probe: each window's frame rate read, the best raised by one over it, and
 *  lowered to what `BOTTOM_SAYS` windows in a row show at the most where all are under the target (the screen
 *  shows fewer frames than when it was read: nothing lower to go to, and no level above could be kept). */
function atBottomNow(dt: number): void {
  if (AUTO_QUALITY.probeWindows <= 0 || framesUncapped() || dt > HITCH) return;
  quick.push(dt);
  quickTime += dt;
  if (quickTime < AUTO_QUALITY.quickWindow) return;
  const fps = 1 / median(quick);
  quick.length = 0;
  quickTime = 0;
  bottomWindows++;
  bottomBest = Math.max(bottomBest, fps);
  if (fps > best) keepBest(fps);
  else if (bottomWindows >= BOTTOM_SAYS && bottomBest < autoTarget()) keepBest(bottomBest);
  if (bottomWindows >= BOTTOM_SAYS) bottomWindows = bottomBest = 0;
}

/** The window started again, both paths. */
function restart(): void {
  frames = time = 0;
  quick.length = 0;
  quickTime = 0;
  gpuQuick.length = 0;
  gpuWindow.length = 0;
}

/** the most GPU frames a window keeps (its last ones) */
const GPU_KEPT = 600;

/** A frame's GPU time as its timer query gave it (ms), a few frames after it was drawn (ui/perfHud.ts). */
export function noteGpuFrame(ms: number): void {
  if (setting !== 'auto' || !(ms > 0)) return;
  if (gpuQuick.push(ms) > GPU_KEPT) gpuQuick.shift();
  if (gpuWindow.push(ms) > GPU_KEPT) gpuWindow.shift();
}

/** Whether the GPU's frames of a window held the target (its middle frame within `gpuShare` of the target's frame):
 *  then a slow window was the CPU's or the loading's, and no lower level helps. None known: no say. */
function gpuHeld(times: number[]): boolean {
  if (times.length < AUTO_QUALITY.gpuFrames) return false;
  return median([...times]) <= AUTO_QUALITY.gpuShare * 1000 / autoTarget();
}

const isLevel = (v: string | null): v is QualityLevel => v !== null && v in QUALITY;

/**
 * The level Auto starts from where it has settled on none (a first visit, Auto chosen again): Low on every device.
 * High's boot work cannot wait for Auto's later frame samples: an integrated GPU took 27.6 s to reveal the lobby
 * (trace N8DN-CDRW). Low also avoids HDR, MSAA and the animated loading exit at first boot. It climbs as a settled level
 * does: each boot tries the level above and keeps it where it holds (`bootAuto`). A start, not a verdict: what the
 * device holds is still measured.
 */
function autoStart(): QualityLevel {
  return 'low';
}

/** Auto's level from its cookie, `autoStart`'s when there's none. */
function readAuto(): QualityLevel {
  const saved = (readCookie(AUTO_COOKIE) ?? '').split('@')[0];
  return isLevel(saved) ? saved : autoStart();
}

function writeAuto(): void {
  writeCookie(AUTO_COOKIE, level);
}

/** The level a boot starts at, read from the cookies alone: the player's setting, else the level Auto settled on. */
function bootLevel(): QualityLevel {
  const saved = readCookie(COOKIE);
  return isLevel(saved) ? saved : readAuto();
}

/** Whether the level the boot starts at lets HDR show, for a renderer made before `initQuality` (WebGPU's). */
export const hdrAllowedAtBoot = (): boolean => QUALITY[bootLevel()].hdr;
/** The heroes' detail at the level the boot starts at, for what's made before `initQuality` (the hands' sculpts). */
export const heroDetailAtBoot = (): number => QUALITY[bootLevel()].heroDetail;
/** Whether the level the boot starts at makes WebGPU's lit shading plain, for its pipeline made before
 *  `initQuality` (`plainAtBoot` in core/webgpu.ts). */
export const plainLitAtBoot = (): boolean => QUALITY[bootLevel()].plainLit;
/** The level the boot starts at, for what's decided before `initQuality` (the crest's blow, ui/crestBlow.ts). */
export const levelAtBoot = (): QualityLevel => bootLevel();

/** the player's Resolution, a share of the screen's pixels each way (its cookie, and the choices the menu offers) */
const RESOLUTION_COOKIE = 'last-stand-resolution';
export const RESOLUTIONS = [1, 0.75, 0.5, 0.25] as const;
let resolution = 1;

/** The player's Resolution: the share of the screen's pixels each way the scene renders. */
export const resolutionSetting = (): number => resolution;

/** The scene drawn at `share` of the screen's pixels each way, kept for the next visits: the player's own choice,
 *  apart from the quality level and Auto, which never touch it. */
export function setResolution(share: number): void {
  resolution = (RESOLUTIONS as readonly number[]).includes(share) ? share : 1;
  writeCookie(RESOLUTION_COOKIE, String(resolution));
  setResolutionShare(resolution);
}

export function initQuality(): void {
  const kept = Number(readCookie(RESOLUTION_COOKIE));
  resolution = (RESOLUTIONS as readonly number[]).includes(kept) ? kept : 1;
  setResolutionShare(resolution);
  const saved = readCookie(COOKIE);
  setting = saved === 'auto' || isLevel(saved) ? saved : 'auto';
  if (setting === 'auto') bootAuto(readAuto());
  else apply(setting);
}

/**
 * Auto as a boot starts it, at the level it last `settled` on, the level above it tried once the game's frames are
 * the device's (the first frame sampled after the reveal and its warm-ups: the boot, its warm-ups and the loading
 * screen's exit stay the settled level's, Low's plain fade on a phone). A step down is kept for good, so a desktop
 * slowed once (a build, another program on the GPU) stayed a level down from then on: from play, a 4070 Ti on Medium
 * "somehow". Each higher level is kept (and saved) once a window's frames hold the target, then the next is tried
 * until High. A failed trial stops this visit's climb: Auto goes back to
 * the settled level at once and steps on from there as ever. A device that can't hold it spends a settle and a quick
 * window there a boot (about 3 s), the cookie never changed. Exported for a harness (`lab auto`), which can't boot
 * the page again.
 */
export function bootAuto(settled: QualityLevel): void {
  trialFrom = null;
  probeFrom = null;
  bottomWindows = bottomBest = 0;
  readBest();
  retryIn = Infinity;
  retried.clear();
  aboveNext = settled !== QUALITY_ORDER[0] && trialDue();
  apply(settled);
}

/** The boots a missed trial still skips and the gap it was given (none: `0/0`). */
function readTrial(): { skip: number; gap: number } {
  const [skip, gap] = (readCookie(TRIAL_COOKIE) ?? '').split('/').map(Number);
  return { skip: skip > 0 ? skip : 0, gap: gap > 0 ? gap : 0 };
}

/** Whether this boot tries the level above: not while a missed trial's boots are being skipped, one counted off. */
function trialDue(): boolean {
  const { skip, gap } = readTrial();
  if (skip === 0) return true;
  writeCookie(TRIAL_COOKIE, `${skip - 1}/${gap}`);
  return false;
}

/** A trial missed: the next skips twice the boots the last did (one the first time), up to `TRIAL_GAP_MOST`. */
function trialMissed(): void {
  const gap = Math.min(Math.max(readTrial().gap * 2, 1), TRIAL_GAP_MOST);
  writeCookie(TRIAL_COOKIE, `${gap}/${gap}`);
}

/** The level above the settled one tried: what it went to, for the trace. */
function tryAbove(): string {
  aboveNext = false;
  trialFrom = level;
  apply(QUALITY_ORDER[QUALITY_ORDER.indexOf(level) - 1]);
  return `trying ${level}`;
}

export const qualitySetting = (): QualitySetting => setting;
export const qualityLevel = (): QualityLevel => level;
/** The most pixels the scene renders (Infinity: the screen's own). */
export const qualityBudget = (): number => budget;

export function setQuality(s: QualitySetting): void {
  setting = s;
  trialFrom = null;
  probeFrom = null;
  readBest();
  retryIn = Infinity;
  retried.clear();
  aboveNext = false;
  writeCookie(COOKIE, s);
  apply(s === 'auto' ? autoStart() : s);
  // choosing Auto again starts over from Low on every device
  if (s === 'auto') writeAuto();
  aboveNext = s === 'auto' && level !== QUALITY_ORDER[0];
  writeCookie(TRIAL_COOKIE, '0/0');
}

/** A level and a budget of pixels put to use for now, the setting and Auto's cookie left as they are: a harness's
 *  (tools/lab `perf` renders as a device Auto settled on does). Whatever applies the setting next undoes it. */
export const useQuality = (l: QualityLevel, most = Infinity): void => apply(l, most);

function apply(l: QualityLevel, most = Infinity): void {
  level = l;
  budget = most;
  const p = QUALITY[l];
  setRenderQuality(p, most);
  setHeroDetail(p.heroDetail);
  const shadow = G.arena.moon.shadow;
  // (WebGL's map is made again at the new size on the next render. WebGPU's is sized once, as it's first made: three
  // resizes it from `mapSize` as it draws it, but the lit materials kept the old map's binding, and every frame's
  // submit was refused for drawing with it destroyed, 543 times a lab profile, the scene's picture standing still as
  // the game went on: a phone's hero stuck mid pose once Auto stepped down a level, trace 4CP9-45EC)
  const resizable = !WEBGPU || shadow.map === null;
  if (shadow.mapSize.x !== p.shadowMap && resizable) {
    shadow.mapSize.set(p.shadowMap, p.shadowMap);
    shadow.map?.dispose();
    shadow.map = null;
  }
  // (a uniform: as wide on the floor at every map's size)
  shadow.radius = PENUMBRA * shadow.mapSize.x / (shadow.camera.right - shadow.camera.left);
  setRubbleShadows(p.minCasterRadius);
  setReliefSteps(p.relief);
  setGrassSpread(p.grassSpread);
  setGrassTufts(p.grassTufts);
  setLampQuality(p.lampReach, p.lampShadows);
  setShadowsOnMove(p.shadowsOnMove);
  setBloomShare(p.bloomShare);
  setDrapeRounds(p.drapeRounds);
  setHdrAllowed(p.hdr);
  setSkullDetail(p.coarseProps);
  setShadowInTurns(p.shadowInTurns);
  setSunShadowStill(p.stillSunShadow);
  setClutterShare(p.clutter);
  setLeafShare(p.leaves);
  setSimpleTrees(p.simpleTrees);
  setFloorPlants(p.floorPlants);
  // (its map made anew at another size, or its casters another set: drawn again)
  G.arena.sunShadowChanged();
  setParticleShare(p.particles);
  setGearGlowByLevel(p.gearGlow);
  setFlameSteps(p.flameSteps, p.flameLite);
  if (WEBGPU) setPlainLitOnWebGPU(p.plainLit);
  for (const p of G.players) applyShadowDetail(p.obj);
  for (const e of G.enemies) applyShadowDetail(e.obj);
  restart();
  settle = AUTO_QUALITY.settle;
}

const _s = new THREE.Vector3();
/** Small character parts barely show in the shadow map, but each caster is a shadow draw call. */
export function applyShadowDetail(root: THREE.Object3D): void {
  const min = QUALITY[level].minCasterRadius;
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !(m.userData.casts ??= m.castShadow)) return;   // remember the model's own choice
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
    m.getWorldScale(_s);
    m.castShadow = m.geometry.boundingSphere!.radius * Math.max(_s.x, _s.y, _s.z) >= min;
  });
}

/**
 * Each frame a warm-up runs behind the lobby or under the fight's loading bar (game/warm.ts `isWarming`), in place of
 * `sampleQuality`: its frames are the warm-up's, not the device's (compiled cold behind the lobby, a return drew 3
 * frames a second, and Auto would have halved the pixels for good). Sampling starts again a settle after.
 */
export function holdQuality(): void {
  restart();
  settle = AUTO_QUALITY.settle;
}

/** Whether a frame is the game's loading, not its play, and Auto leaves it out (`holdQuality`): a warm-up behind the
 *  lobby or under the fight's loading bar, anything else under that bar, the hall of heroes' staged heroes, or a
 *  program compiled at a draw in the frame before (its time three's link, not the device's pace). From play, a 4070
 *  Ti's trial of High was judged on the frames round its fight's loading bar and left (trace P307-C0HE). */
export const loadingFrame = (s: { warming: boolean; readying: boolean; hall: boolean; compiled: boolean }): boolean =>
  s.warming || s.readying || s.hall || s.compiled;

/** Feed the real (unclamped) frame delta each frame while the game is running. Returns Auto's step, if it took one
 *  (`low`), for the performance trace to mark. */
export function sampleQuality(dt: number): string | null {
  if (setting !== 'auto') return null;
  if (dt > AUTO_QUALITY.longestFrame) return null;   // tab switch, breakpoint: not a performance signal
  if (settle > 0) {
    // let a level change take effect first (the GPU's frames still coming back drawn at the level before)
    settle -= dt;
    gpuQuick.length = gpuWindow.length = 0;
    return null;
  }
  if (!trialFrom && (retryIn -= dt) <= 0) {
    retryIn = Infinity;
    aboveNext = true;
  }
  // (the best the device shows read first: the target every level is held to)
  if (probeFrom) return probing(dt);
  if (!trialFrom && probeDue()) return probe();
  if (aboveNext) return tryAbove();
  // (at the bottom: nothing lower to judge; its frame rate is the best there is)
  if (atBottom() && !trialFrom) {
    atBottomNow(dt);
    return null;
  }
  bottomWindows = bottomBest = 0;
  quick.push(dt);
  quickTime += dt;
  // (far below the target, judged by the window's middle frame, which a hitch doesn't move: to Low at once; a device
  // too slow for the 4 s path's frames, over `HITCH` each, stepped never)
  if (quickTime >= AUTO_QUALITY.quickWindow) {
    const fps = 1 / median(quick);
    // (the GPU within its frame: whatever held the frames up, a lower level wouldn't help)
    const gpuFine = gpuHeld(gpuQuick);
    // (the level above, tried, is left at the first window under the target: judged by the 4 s path, a phone at 26
    // to 47 frames a second there stayed 6 s a boot, trace 9JA7-BSSS)
    if (trialFrom && fps < autoTarget() && !gpuFine) return step(false);
    if (fps < autoTarget() * AUTO_QUALITY.farBelow && !gpuFine) return step(true);
    quick.length = 0;
    quickTime = 0;
    gpuQuick.length = 0;
  }
  // (the 4 s path as it always was: the mean of frames up to `HITCH`, a level a step)
  if (dt > HITCH) return null;
  frames++; time += dt;
  if (time < AUTO_QUALITY.window) return null;
  const fps = frames / time;
  const gpuFine = gpuHeld(gpuWindow);
  restart();
  if (fps < autoTarget() && !gpuFine) return step(false);
  return trialFrom ? keepTrial() : null;
}

/** The level tried above the settled one kept: it held the target for a window. What it kept, for the trace. */
function keepTrial(): string {
  trialFrom = null;
  writeAuto();
  writeCookie(TRIAL_COOKIE, '0/0');
  aboveNext = level !== QUALITY_ORDER[0];
  return `${level} kept`;
}

/** a frame the 4 s path leaves out of its mean (s): a hitch, not the device's pace */
const HITCH = 0.25;

/** A step down, every level at once when `far` below the target, kept for the next session; what it went to. */
function step(far: boolean): string {
  restart();
  if (trialFrom) {
    // (the level tried above missed: back to the settled one alone, the cookie as it was, the next trial put off)
    apply(trialFrom);
    trialFrom = null;
    trialMissed();
    return level;
  }
  const steps = far ? QUALITY_ORDER.length : 1;
  for (let i = 0; i < steps && !atBottom(); i++) stepDown();
  writeAuto();
  // (the level above tried again after a while, once a level: a hitch's step comes back this visit, a device that
  // can't hold it spends a trial's settle and quick window there)
  const above = QUALITY_ORDER[QUALITY_ORDER.indexOf(level) - 1];
  if (!retried.has(above)) {
    retried.add(above);
    retryIn = AUTO_QUALITY.retry;
  }
  return level;
}

/** The middle of `values` (sorted in place). */
function median(values: number[]): number {
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
}

/** Whether Auto has nothing left to lower: the last level (Very low). */
const atBottom = (): boolean => level === QUALITY_ORDER[QUALITY_ORDER.length - 1];

/** Auto's step down: a level, the screen's own pixels kept (from play, "cut something else, not resolution"). */
function stepDown(): void {
  apply(QUALITY_ORDER[QUALITY_ORDER.indexOf(level) + 1]);
}

/** Whether Auto is trying the level above the settled one: its frames are Auto's trial, not the device's pace at its
 *  level, and the performance recorder leaves them out of play (src/perf/recorder.ts). */
export const autoTrying = (): boolean => trialFrom !== null || probeFrom !== null;

/** Whether Auto has stepped as far down as it goes (a harness's: `lab auto`). */
export const autoAtBottom = (): boolean => atBottom();

/** The level Auto would start from at the next boot, as its cookie keeps it (a harness's: `lab auto`). */
export const autoSettled = (): QualityLevel => readAuto();
