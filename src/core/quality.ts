// Graphics quality: the player's setting (auto / high / medium / low, cookie) and the
// level in effect. Auto steps down the levels while the frame rate stays low, and never
// steps back up within a session, to avoid oscillating; each boot, once the game is shown, it
// tries the level above the one it last settled on, kept once it holds its frame rate for a
// window, else left for the settled one at once (`bootAuto`). Every level renders the
// screen's own pixels: what's cut is other work,
// never the resolution (from play, "I want to run the game at full phone res, if we need
// to cut, we need to cut something else, not resolution").
import * as THREE from 'three';
import { G } from '../state';
import { QUALITY, QUALITY_ORDER, AUTO_QUALITY, type QualityLevel, type QualitySetting } from '../data/quality';
import { setBloomShare, setRenderQuality } from './renderer';

import { readCookie, writeCookie } from './cookies';
import { setHeroDetail } from '../entities/models/armor';
import { setRubbleShadows } from '../fx/rubble';
import { setReliefSteps } from './parallax';
import { setHdrAllowed } from './hdr';
import { setSkullDetail } from '../world/skull';

/** how far the moon's shadows' edges blur on the floor (m): at its default a texel, 1.7 to 7 cm by the map's size,
 *  every shadow's edge was hard */
const PENUMBRA = 0.12;

const COOKIE = 'last-stand-quality';
// what Auto settled on, the next session starting there: its level (a budget of pixels after an `@`, which an
// older Auto wrote, `low@518400`, is let go)
const AUTO_COOKIE = 'last-stand-quality-auto';

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

/** Auto's level from its cookie, the top when there's none. */
function readAuto(): QualityLevel {
  const saved = (readCookie(AUTO_COOKIE) ?? '').split('@')[0];
  return isLevel(saved) ? saved : 'high';
}

function writeAuto(): void {
  writeCookie(AUTO_COOKIE, level);
}

export function initQuality(): void {
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
 * "somehow". The level above is kept (and saved) once a window's frames hold the target; missed, Auto goes back to
 * the settled level at once and steps on from there as ever. A device that can't hold it spends a settle and a quick
 * window there a boot (about 3 s), the cookie never changed. Exported for a harness (`lab auto`), which can't boot
 * the page again.
 */
export function bootAuto(settled: QualityLevel): void {
  trialFrom = null;
  aboveNext = settled !== QUALITY_ORDER[0];
  apply(settled);
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
  apply(s === 'auto' ? 'high' : s);
  // choosing Auto again starts over from the top
  if (s === 'auto') writeAuto();
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
  if (shadow.mapSize.x !== p.shadowMap) {
    shadow.mapSize.set(p.shadowMap, p.shadowMap);
    shadow.map?.dispose();
    shadow.map = null;   // recreated at the new size on the next render
  }
  // (a uniform: as wide on the floor at every map's size)
  shadow.radius = PENUMBRA * p.shadowMap / (shadow.camera.right - shadow.camera.left);
  setRubbleShadows(p.minCasterRadius);
  setReliefSteps(p.relief);
  setHdrAllowed(p.hdr);
  setSkullDetail(p.coarseProps);
  setBloomShare(p.bloomShare);
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
  return `${level} kept`;
}

/** a frame the 4 s path leaves out of its mean (s): a hitch, not the device's pace */
const HITCH = 0.25;

/** A step down, every level at once when `far` below the target, kept for the next session; what it went to. */
function step(far: boolean): string {
  restart();
  if (trialFrom) {
    // (the level tried above missed: back to the settled one alone, the cookie as it was)
    apply(trialFrom);
    trialFrom = null;
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

/** Whether Auto has nothing left to lower: Low. */
const atBottom = (): boolean => level === 'low';

/** Auto's step down: a level, the screen's own pixels kept (from play, "cut something else, not resolution"). */
function stepDown(): void {
  apply(QUALITY_ORDER[QUALITY_ORDER.indexOf(level) + 1]);
}

/** Whether Auto has stepped as far down as it goes (a harness's: `lab auto`). */
export const autoAtBottom = (): boolean => atBottom();

/** The level Auto would start from at the next boot, as its cookie keeps it (a harness's: `lab auto`). */
export const autoSettled = (): QualityLevel => readAuto();
