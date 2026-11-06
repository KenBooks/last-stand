// Graphics quality: the player's setting (auto / high / medium / low, cookie) and the
// level in effect. Auto starts from the level it last settled on and steps down while
// the frame rate stays low, High's resolution first (from the screen's own pixels, on
// any device and at any of the OS's scaling: what the hardware holds is measured), then
// the levels, then Low's resolution; it never steps back up on its own, to avoid
// oscillating.
import * as THREE from 'three';
import { G } from '../state';
import { QUALITY, QUALITY_ORDER, AUTO_QUALITY, type QualityLevel, type QualitySetting } from '../data/quality';
import { scenePixels, setRenderQuality } from './renderer';

/** pixels within this share over a floor are at it: a step to it would change nothing you'd see */
const AT_FLOOR = 1.05;
import { readCookie, writeCookie } from './cookies';
import { setHeroDetail } from '../entities/models/armor';
import { setRubbleShadows } from '../fx/rubble';
import { setReliefSteps } from './parallax';

/** how far the moon's shadows' edges blur on the floor (m): at its default a texel, 1.7 to 7 cm by the map's size,
 *  every shadow's edge was hard */
const PENUMBRA = 0.12;

const COOKIE = 'last-stand-quality';
// what Auto settled on, the next session starting there: its level, and the most pixels it lets the scene render
// (`high@4147200`: a budget measured in pixels holds on a screen of any size or pixel ratio)
const AUTO_COOKIE = 'last-stand-quality-auto';

let setting: QualitySetting = 'auto';
let level: QualityLevel = 'high';
/** the most pixels Auto lets the scene render (Infinity: as many as the level's resolution gives) */
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

/** Auto's level and budget from its cookie (`high`, `high@4147200`), the top when there's none. */
function readAuto(): { level: QualityLevel; budget: number } {
  const [saved, pixels] = (readCookie(AUTO_COOKIE) ?? '').split('@');
  const most = Number(pixels);
  return { level: isLevel(saved) ? saved : 'high', budget: most > 0 ? most : Infinity };
}

function writeAuto(): void {
  writeCookie(AUTO_COOKIE, budget === Infinity ? level : `${level}@${Math.round(budget)}`);
}

export function initQuality(): void {
  const saved = readCookie(COOKIE);
  setting = saved === 'auto' || isLevel(saved) ? saved : 'auto';
  const auto = readAuto();
  if (setting === 'auto') apply(auto.level, auto.budget);
  else apply(setting);
}

export const qualitySetting = (): QualitySetting => setting;
export const qualityLevel = (): QualityLevel => level;
/** The most pixels Auto lets the scene render (Infinity: no budget). */
export const qualityBudget = (): number => budget;

export function setQuality(s: QualitySetting): void {
  setting = s;
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
 *  (`low@518400`), for the performance trace to mark. */
export function sampleQuality(dt: number): string | null {
  if (setting !== 'auto' || atBottom()) return null;
  if (dt > AUTO_QUALITY.longestFrame) return null;   // tab switch, breakpoint: not a performance signal
  if (settle > 0) { settle -= dt; return null; }   // let a level change take effect first
  quick.push(dt);
  quickTime += dt;
  // (far below the target, judged by the window's middle frame, which a hitch doesn't move: a step a second, its
  // pixels cut by how far below; a device too slow for the 4 s path's frames, over `HITCH` each, stepped never)
  if (quickTime >= AUTO_QUALITY.quickWindow) {
    const fps = 1 / median(quick);
    if (fps < AUTO_QUALITY.minFps * AUTO_QUALITY.farBelow) return step(fps);
  }
  // (the 4 s path as it always was: the mean of frames up to `HITCH`, half the pixels a step)
  if (dt > HITCH) return null;
  frames++; time += dt;
  if (time < AUTO_QUALITY.window) return null;
  const fps = frames / time;
  restart();
  return fps < AUTO_QUALITY.minFps ? step(AUTO_QUALITY.minFps / 2) : null;
}

/** a frame the 4 s path leaves out of its mean (s): a hitch, not the device's pace */
const HITCH = 0.25;

/** A step down at `fps`, kept for the next session; what it went to (`low@518400`). */
function step(fps: number): string {
  restart();
  stepDown(fps);
  writeAuto();
  return `${level}@${Math.round(scenePixels())}`;
}

/** The middle of `values` (sorted in place). */
function median(values: number[]): number {
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
}

/** Whether Auto has nothing left to lower: Low, at its fewest pixels (or the screen's own, if fewer). */
const atBottom = (): boolean => level === 'low' && scenePixels() <= AUTO_QUALITY.fewest * AT_FLOOR;

/** Auto's step down at `fps`: High's pixels cut to `AUTO_QUALITY.highFloor`, then a level (the pixels kept), then
 *  Low's pixels cut to `AUTO_QUALITY.fewest`, each cut by how far `fps` is below the target (`pixelsKept`). */
function stepDown(fps: number): void {
  const now = scenePixels();
  const kept = now * pixelsKept(fps);
  if (level === 'high' && now > AUTO_QUALITY.highFloor * AT_FLOOR) {
    apply('high', Math.max(AUTO_QUALITY.highFloor, kept));
    return;
  }
  if (level !== 'low') {
    apply(QUALITY_ORDER[QUALITY_ORDER.indexOf(level) + 1], budget);
    return;
  }
  apply('low', Math.max(AUTO_QUALITY.fewest, kept));
}

/** The share of its pixels a step keeps at `fps`: the frame rate's share of the target, from half to `deepest`. */
const pixelsKept = (fps: number): number =>
  Math.min(0.5, Math.max(AUTO_QUALITY.deepest, fps / AUTO_QUALITY.minFps));

/** Whether Auto has stepped as far down as it goes (a harness's: `lab auto`). */
export const autoAtBottom = (): boolean => atBottom();
