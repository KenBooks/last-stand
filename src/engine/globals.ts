// The frame's globals as the engine reads them (`Globals` in its common.wgsl): where each part begins, what's tuned
// by hand, the camera's projection, and the camera, sun, sky, fog and grade written for a frame.
import * as THREE from 'three';
import { tunable } from '../core/tuning';
import { holeNow } from '../core/seeThrough';

/** where the globals' parts begin, in floats (`Globals` in the engine's common.wgsl) */
export const GLOBALS = {
  viewProj: 0, camPos: 16, sunDir: 20, sunColor: 24, ambient: 28, hemiSky: 32, hemiGround: 36, fogColor: 40, misc: 44,
  shadowView: 48, points: 64, camRight: 320, camUp: 324, seeFocus: 328, seeHole: 332, grade: 336, shelter: 344,
  seeHall: 352, seeKinds: 360, floats: 1000,
};
/** the sun's shadow map, a side, where the game has no sun to say (`SHADOW_SIZE` in the engine's gpu.rs) */
const SHADOW_SIZE = 2048;
/** The sun's shadow map's side as the game's quality level has it (core/quality.ts sets the sun's own). */
export const shadowSizeOf = (sun: THREE.DirectionalLight | null): number => sun?.shadow.mapSize.x || SHADOW_SIZE;

/** What's tuned by hand against three's picture (`window.__rust.tune`). */
export const TUNE = tunable('rust', {
  exposure: 1.05,
  /** how strongly the sky is mirrored by smooth surfaces */
  environment: 1,
  /** the sky's light where three reads an environment map the engine doesn't have */
  skyFill: 0.35,
  shadows: 1,
  /** what a profile of the frame takes out in turns (perf/sceneParts.ts): the point lights and the lamps, the
   *  lamps' shadows, the bloom's passes */
  points: 1,
  lampShadows: 1,
  bloom: 1,
  /** how far along its normal a surface is moved before the shadow map is read, world units */
  shadowBias: 0.06,
  /** a look to debug by: 1 how much of the sun reaches each pixel, 2 the normals, 3 a plain colour in place of
   *  the lit shading (a profile's: what the lighting costs) */
  debug: 0,
  /** every opaque mesh casts the sun's shadow, not only those three is told to draw into its own map (the
   *  village's still things are in maps three keeps, which the engine doesn't have) */
  castAll: 1,
  /** the share of the sky's light under the shelter's roof (the hall of heroes' inside), set against three's frame */
  shelterSky: 0.25,
  /** ms a frame spent handing over what isn't shown yet (`prepareAhead`), under the loading screen and after it
   *  (0: nothing ahead, each place handed over as it's first shown) */
  aheadLoading: 30,
  ahead: 2,
  /** only what moved has its matrices made again, only a material that changed is described again (0: every
   *  object's and every material's each frame, to compare) */
  still: 1,
  /** the hole that keeps the hero in sight under what hides him (0: none dropped) */
  see: 1,
});

const scratchMatrix = new THREE.Matrix4(), viewProj = new THREE.Matrix4(), projection = new THREE.Matrix4();
const v3 = new THREE.Vector3(), target3 = new THREE.Vector3();

/** A perspective camera's projection with clip depth from 0 to 1, whatever convention three keeps its own in. */
export function projectionOf(camera: THREE.PerspectiveCamera | THREE.OrthographicCamera, out: THREE.Matrix4):
  THREE.Matrix4 {
  const { near, far } = camera;
  if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
    const c = camera as THREE.PerspectiveCamera;
    const f = 1 / Math.tan(THREE.MathUtils.degToRad(c.fov) / 2) * c.zoom;
    return out.set(
      f / c.aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, far / (near - far), near * far / (near - far),
      0, 0, -1, 0);
  }
  const c = camera as THREE.OrthographicCamera;
  const w = (c.right - c.left) / c.zoom, h = (c.top - c.bottom) / c.zoom;
  const cx = (c.right + c.left) / 2, cy = (c.top + c.bottom) / 2;
  return out.set(
    2 / w, 0, 0, -2 * cx / w,
    0, 2 / h, 0, -2 * cy / h,
    0, 0, 1 / (near - far), near / (near - far),
    0, 0, 0, 1);
}

/** The game's grade as the engine's passes after the scene read it (`fs_grade` in the engine's post.wgsl). */
export interface Grade {
  /** the light the small and the large areas adapt to */
  small: number; large: number;
  /** the highlights' room over their knee */
  cap: number;
  vignette: number;
  /** a blow taken, and how low the health is (0 to 1 each) */
  hurt: number; low: number;
  /** the scene's MSAA samples the quality level asks for on this screen (core/renderer.ts `sceneSamples`) */
  samples?: number;
}
export const PLAIN_GRADE: Grade = { small: 1e4, large: 1e4, cap: 1, vignette: 1.05, hurt: 0, low: 0 };

/** What of a frame's lights its globals are written from: how many point lights it has, and its sun. */
export interface Lit {
  points: number;
  sun: THREE.DirectionalLight | null;
}

/**
 * The frame's camera, sun and its shadow's view, the sky's fill, the hero's hole, the fog and the grade written to
 * `g` (the lights' own floats and the kinds of see-through are written before it: `lights.ts`, `seeKinds.ts`).
 * Returns the colour the frame is cleared to.
 */
export function writeGlobals(g: Float32Array, scene: THREE.Scene, camera: THREE.PerspectiveCamera, time: number,
  lit: Lit, grade: Grade): [number, number, number] {
  viewProj.multiplyMatrices(projectionOf(camera, projection), camera.matrixWorldInverse).toArray(g, GLOBALS.viewProj);
  v3.setFromMatrixPosition(camera.matrixWorld).toArray(g, GLOBALS.camPos);
  g[GLOBALS.camPos + 3] = time;
  g[GLOBALS.sunDir + 3] = lit.points;
  g[GLOBALS.sunColor + 3] = TUNE.exposure;
  // (three lights a surface by an environment map too; the engine has the sky's two halves alone)
  g[GLOBALS.hemiSky] += TUNE.skyFill * (scene.environmentIntensity ?? 1) * (scene.environment ? 1 : 0);
  g[GLOBALS.hemiSky + 1] += TUNE.skyFill * (scene.environmentIntensity ?? 1) * (scene.environment ? 1 : 0);
  g[GLOBALS.hemiSky + 2] += TUNE.skyFill * (scene.environmentIntensity ?? 1) * (scene.environment ? 1 : 0);
  g[GLOBALS.misc] = 1 / shadowSizeOf(lit.sun);
  g[GLOBALS.misc + 1] = TUNE.shadowBias;
  g[GLOBALS.misc + 2] = TUNE.environment;
  g[GLOBALS.misc + 3] = TUNE.debug;
  g[GLOBALS.fogColor + 3] = 0;
  const e = camera.matrixWorld.elements;
  g[GLOBALS.camRight] = e[0]; g[GLOBALS.camRight + 1] = e[1]; g[GLOBALS.camRight + 2] = e[2];
  g[GLOBALS.camUp] = e[4]; g[GLOBALS.camUp + 1] = e[5]; g[GLOBALS.camUp + 2] = e[6];
  const hole = holeNow();
  hole.focus.toArray(g, GLOBALS.seeFocus);
  g[GLOBALS.seeFocus + 3] = hole.minY;
  hole.k.toArray(g, GLOBALS.seeHole);
  if (!TUNE.see) g[GLOBALS.seeHole + 2] = 0;
  const sun = lit.sun;
  if (sun) {
    v3.setFromMatrixPosition(sun.matrixWorld).sub(target3.setFromMatrixPosition(sun.target.matrixWorld)).normalize();
    v3.toArray(g, GLOBALS.sunDir);
    g[GLOBALS.sunColor] = sun.color.r * sun.intensity; g[GLOBALS.sunColor + 1] = sun.color.g * sun.intensity;
    g[GLOBALS.sunColor + 2] = sun.color.b * sun.intensity;
    if (sun.castShadow && TUNE.shadows) {
      const shadowCamera = sun.shadow.camera;
      sun.shadow.updateMatrices(sun);
      scratchMatrix.multiplyMatrices(projectionOf(shadowCamera, projection), shadowCamera.matrixWorldInverse)
        .toArray(g, GLOBALS.shadowView);
      g[GLOBALS.fogColor + 3] = 1;
    }
  }
  const fog = scene.fog as (THREE.Fog & THREE.FogExp2) | null;
  const background = scene.background as THREE.Color | null;
  let clear: THREE.Color | null = background?.isColor ? background : null;
  if (fog) {
    g[GLOBALS.ambient + 3] = fog.isFogExp2 ? 2 : 1;
    g[GLOBALS.hemiSky + 3] = fog.isFogExp2 ? fog.density : fog.near;
    g[GLOBALS.hemiGround + 3] = fog.isFogExp2 ? 0 : fog.far;
    fog.color.toArray(g, GLOBALS.fogColor);
    clear ??= fog.color;
  }
  g[GLOBALS.grade] = grade.small; g[GLOBALS.grade + 1] = grade.large; g[GLOBALS.grade + 2] = grade.cap;
  g[GLOBALS.grade + 3] = grade.vignette; g[GLOBALS.grade + 4] = grade.hurt; g[GLOBALS.grade + 5] = grade.low;
  g[GLOBALS.grade + 6] = time % 1000; g[GLOBALS.grade + 7] = TUNE.exposure;
  return clear ? [clear.r, clear.g, clear.b] : [0, 0, 0];
}
