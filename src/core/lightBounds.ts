// Each point light's reach, packed for the lit shaders' loop: its place as the camera sees it and the square of how
// far it lights, 0 for one that lights nothing (the pool's idle ones). Every lit pixel loops over every point light
// in view, 20 in a lobby, and on a GPU loaded by its pixels the point lights are half the scene pass (the crypt's
// 3.6 ms of 7.0 at 20.7 Mpx on a 4080 laptop), their lighting where they reach a twelfth of that (`lab scenecost`).
// The loop stays three's, its bound a constant (a loop over a list of the lit ones, its bound a uniform, took the
// forest's pass from 3.8 ms to 6.5); what it reads of a light it passes over is one packed value, tested before
// the light itself is read: 13% of the scene pass, in the crypt and the forest. A uniform's values, made anew at
// each render for its camera, so nothing compiles. WebGL only: WebGPU's lights are its nodes'.
import * as THREE from 'three';

/** Whether a light out of reach is passed over on its packed bounds (`?lightBounds=0`: on three's own values, as
 *  before; read at every render, so a measure times the frame both ways). */
export const lightBounds = {
  packed: typeof location === 'undefined' || !/[?&]lightBounds=0/.test(location.search),
};

/** the most point lights packed (the shaders' array is as long) */
const MOST = 32;
/** a reach no point is beyond: a light whose bounds aren't packed, or with no `distance`, is read as before */
const EVERYWHERE = 1e30;
/** x, y, z as the camera sees it, and its reach's square, a light */
const bounds = new Float32Array(MOST * 4);
const POINT_BOUNDS = { value: bounds };
/** three's lit materials, whose uniforms the bounds join */
const LIT_LIBS = ['standard', 'physical', 'lambert', 'phong', 'toon'] as const;
/** where three declares its point lights, in its lit shaders */
const POINT_LIGHTS_DECLARED = '#if NUM_POINT_LIGHTS > 0';

/** The lit shaders' test of a light before it's read, in the unshadowed point lights' loop (`renderer.ts`
 *  `loopPointLights`: `toLight` is declared there). */
export const BOUNDS_TEST = [
  '\t\ttoLight = pointBounds[ i ].xyz - geometryPosition;',
  '\t\tif ( dot( toLight, toLight ) >= pointBounds[ i ].w ) continue;',
];

/** The bounds declared in three's lit shaders and given to its lit materials; false where three's shaders have
 *  changed (said: the loop is then left as it was). */
export function declarePointBounds(): boolean {
  const chunk = THREE.ShaderChunk.lights_pars_begin;
  const at = chunk.indexOf(POINT_LIGHTS_DECLARED);
  if (at < 0) {
    console.error('declarePointBounds: three\'s lights_pars_begin has changed: the point lights are read as before');
    return false;
  }
  const after = at + POINT_LIGHTS_DECLARED.length;
  THREE.ShaderChunk.lights_pars_begin = `${chunk.slice(0, after)}\n\tuniform vec4 pointBounds[ ${MOST} ];`
    + chunk.slice(after);
  for (const lib of LIT_LIBS) THREE.ShaderLib[lib].uniforms.pointBounds = POINT_BOUNDS;
  return true;
}

/** `scene`'s point lights shown, in the order three gives them to its shaders: those casting first, the rest as
 *  the scene holds them. */
function pointLightsOf(scene: THREE.Scene): THREE.PointLight[] {
  const casting: THREE.PointLight[] = [];
  const others: THREE.PointLight[] = [];
  scene.traverseVisible((object) => {
    const light = object as THREE.PointLight;
    if (!light.isPointLight) return;
    if (light.castShadow) casting.push(light);
    else others.push(light);
  });
  return [...casting, ...others];
}

/** The square of how far `light` lights: 0 where it lights nothing, everywhere where it has no `distance`. */
function reachSquared(light: THREE.PointLight): number {
  const dark = light.intensity === 0 || (light.color.r === 0 && light.color.g === 0 && light.color.b === 0);
  if (dark) return 0;
  return light.distance > 0 ? light.distance * light.distance : EVERYWHERE;
}

const _place = new THREE.Vector3();
let warned = false;

/** The bounds packed for `scene` as `camera` sees it now. */
export function packPointBounds(scene: THREE.Scene, camera: THREE.Camera): void {
  const lights = pointLightsOf(scene);
  if (lights.length > MOST && !warned) {
    warned = true;
    console.error(`packPointBounds: over ${MOST} point lights: the rest are read as before`);
  }
  bounds.fill(EVERYWHERE);
  lights.slice(0, MOST).forEach((light, place) => {
    _place.setFromMatrixPosition(light.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
    _place.toArray(bounds, place * 4);
    bounds[place * 4 + 3] = lightBounds.packed ? reachSquared(light) : EVERYWHERE;
  });
}

/** The bounds kept as `scene` is drawn: packed before each of its renders, for its camera. */
export function packWhileDrawn(scene: THREE.Scene): void {
  const before = scene.onBeforeRender;
  scene.onBeforeRender = (...args) => {
    before.apply(scene, args);
    packPointBounds(scene, args[2]);
  };
}
