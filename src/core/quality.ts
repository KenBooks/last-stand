// Graphics quality: the player's setting (auto / high / medium / low / very low, cookie) and the
// level in effect. Auto steps down while frame rate stays low. Each boot or fresh Auto choice,
// once the game is shown, it tries higher levels in turn, each kept once it holds its frame rate for a
// window, else left for the settled one at its first quick window under the target and put off
// for a few boots (`bootAuto`, `trialMissed`). Every level renders the
// screen's own pixels: what's cut is other work,
// never the resolution (from play, "I want to run the game at full phone res, if we need
// to cut, we need to cut something else, not resolution").
import { WEBGPU } from './webgpu';
import * as THREE from 'three';
import { G } from '../state';
import { QUALITY, QUALITY_ORDER, AUTO_QUALITY, type QualityLevel, type QualitySetting } from '../data/quality';
import { setBloomShare, setRenderQuality, setResolutionShare, setShadowInTurns } from './renderer';
import { setParticleShare } from '../fx/particles';

import { readCookie, writeCookie } from './cookies';
import { setHeroDetail } from '../entities/models/armor';
import { setRubbleShadows } from '../fx/rubble';
import { setReliefSteps } from './parallax';
import { setGrassSpread } from '../world/meadow';
import { setDrapeRounds } from '../entities/models/armor';
import { setLampQuality } from './lamps';
import { setShadowsOnMove } from '../world/shadowsOnMove';
import { setHdrAllowed } from './hdr';
import { setSkullDetail } from '../world/skull';
import { setSunShadowStill } from '../world/props';
import { setClutterShare } from '../world/culling';

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

/** The window started again, both paths. */
function restart(): void {
  frames = time = 0;
  quick.length = 0;
  quickTime = 0;
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
  setLampQuality(p.lampReach, p.lampShadows);
  setShadowsOnMove(p.shadowsOnMove);
  setBloomShare(p.bloomShare);
  setDrapeRounds(p.drapeRounds);
  setHdrAllowed(p.hdr);
  setSkullDetail(p.coarseProps);
  setShadowInTurns(p.shadowInTurns);
  setSunShadowStill(p.stillSunShadow);
  setClutterShare(p.clutter);
  // (its map made anew at another size, or its casters another set: drawn again)
  G.arena.sunShadowChanged();
  setParticleShare(p.particles);
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

/** Feed the real (unclamped) frame delta each frame while the game is running. Returns Auto's step, if it took one
 *  (`low`), for the performance trace to mark. */
export function sampleQuality(dt: number): string | null {
  if (setting !== 'auto' || (atBottom() && !aboveNext)) return null;
  if (dt > AUTO_QUALITY.longestFrame) return null;   // tab switch, breakpoint: not a performance signal
  if (settle > 0) { settle -= dt; return null; }   // let a level change take effect first
  if (aboveNext) return tryAbove();
  quick.push(dt);
  quickTime += dt;
  // (far below the target, judged by the window's middle frame, which a hitch doesn't move: to Low at once; a device
  // too slow for the 4 s path's frames, over `HITCH` each, stepped never)
  if (quickTime >= AUTO_QUALITY.quickWindow) {
    const fps = 1 / median(quick);
    // (the level above, tried, is left at the first window under the target: judged by the 4 s path, a phone at 26
    // to 47 frames a second there stayed 6 s a boot, trace 9JA7-BSSS)
    if (trialFrom && fps < AUTO_QUALITY.minFps) return step(false);
    if (fps < AUTO_QUALITY.minFps * AUTO_QUALITY.farBelow) return step(true);
    quick.length = 0;
    quickTime = 0;
  }
  // (the 4 s path as it always was: the mean of frames up to `HITCH`, a level a step)
  if (dt > HITCH) return null;
  frames++; time += dt;
  if (time < AUTO_QUALITY.window) return null;
  const fps = frames / time;
  restart();
  if (fps < AUTO_QUALITY.minFps) return step(false);
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
export const autoTrying = (): boolean => trialFrom !== null;

/** Whether Auto has stepped as far down as it goes (a harness's: `lab auto`). */
export const autoAtBottom = (): boolean => atBottom();

/** The level Auto would start from at the next boot, as its cookie keeps it (a harness's: `lab auto`). */
export const autoSettled = (): QualityLevel => readAuto();
