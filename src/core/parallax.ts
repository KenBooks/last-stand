// The floors' relief (parallax occlusion): the floor's height, kept in its roughness map's red channel (core/pbr.ts),
// read along the view ray, so the grout between the crypt's cobbles and the soil round the forest's pebbles and leaves
// lie sunk below their tops and shift against them as the view moves. Only the hollows sink: the tops stay at the
// floor's own level, where everything on the floor stands (feet, arrows, marks). The steps a ray takes are a uniform the
// quality preset sets (none on Low), so switching presets compiles nothing. On WebGPU the same walk is WGSL, and the
// build's context moves each of the floor's maps to where it meets the ray (`reliefContext`).
import type * as THREE from 'three';
import { tsl } from './webgpu';

// (untyped: TSL's types don't follow its conversions across these calls yet)
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

/** How a floor's relief lies. */
export interface FloorRelief {
  /** m: how far its lowest point lies under its tops */
  depth: number;
  /** its maps' tiles a metre over the floor (their repeat over the floor's span), u along x and v along -z */
  perMetre: number;
  /** m from the camera: the relief fades out up to here (too fine to see that far, and the steps cost the same) */
  fade: number;
}

/** the most steps down the view ray (looking straight down it takes half) */
const steps = { value: 16 };

/** The quality preset's steps (0: no relief). */
export function setReliefSteps(n: number): void {
  steps.value = n;
}

const RELIEF_GLSL = /* glsl */`
varying vec3 vReliefWorld;
uniform int uReliefSteps;
uniform vec3 uRelief;
// Where the view ray through this point meets the relief, in uv: walked down from the tops a layer at a time, then
// between the last two layers where it crossed (the height map's red channel: 1 the tops, 0 the lowest point). The
// gradients are the floor's own: inside a loop the GPU's are undefined, and the moved uv's jump at each stone's edge.
vec2 reliefUv(vec2 uv, vec2 dx, vec2 dy) {
  vec3 toEye = cameraPosition - vReliefWorld;
  float dist = length(toEye);
  toEye /= dist;
  float depth = uRelief.x * (1.0 - smoothstep(uRelief.z * 0.6, uRelief.z, dist));
  if (uReliefSteps <= 0 || depth <= 0.0 || toEye.y <= 0.0) return uv;
  // a metre down the ray moves it this far over the floor, in uv (away from the eye; v runs along -z)
  vec2 slide = vec2(-toEye.x, toEye.z) / max(toEye.y, 0.25) * uRelief.y;
  float n = max(1.0, floor(mix(float(uReliefSteps) * 0.5, float(uReliefSteps), 1.0 - toEye.y)));
  float layer = 1.0 / n;
  vec2 stepUv = slide * depth * layer;
  vec2 at = uv;
  float ray = 0.0;
  float surface = 1.0 - textureGrad(roughnessMap, at, dx, dy).r;
  if (surface <= 0.0) return uv;
  for (int i = 0; i < 64; i++) {
    if (float(i) >= n) break;
    vec2 next = at + stepUv;
    float nextRay = ray + layer;
    float nextSurface = 1.0 - textureGrad(roughnessMap, next, dx, dy).r;
    if (nextRay >= nextSurface) {
      float above = surface - ray, below = nextRay - nextSurface;
      return at + stepUv * clamp(above / max(above + below, 1e-4), 0.0, 1.0);
    }
    at = next;
    ray = nextRay;
    surface = nextSurface;
  }
  return at;
}
`;

/** The walk down the view ray as WGSL (`RELIEF_GLSL`'s `reliefUv`), in the maps' own uv before their repeat: a
 *  metre of the floor is `relief.y` of it, and the heights are read at the repeat (made once). */
let reliefWalk: N = null;
function reliefWalkFn(): N {
  const { wgslFn } = tsl as any;
  reliefWalk ??= wgslFn(`fn reliefUv(uv: vec2f, repeat: vec2f, dx: vec2f, dy: vec2f, world: vec3f, eye: vec3f,
    relief: vec3f, steps: f32, heights: texture_2d<f32>, heightsAt: sampler) -> vec2f {
    var toEye = eye - world;
    let dist = length(toEye);
    toEye = toEye / dist;
    let depth = relief.x * (1.0 - smoothstep(relief.z * 0.6, relief.z, dist));
    if (steps <= 0.0 || depth <= 0.0 || toEye.y <= 0.0) {
      return uv;
    }
    let slide = vec2f(-toEye.x, toEye.z) / max(toEye.y, 0.25) * relief.y;
    let n = max(1.0, floor(mix(steps * 0.5, steps, 1.0 - toEye.y)));
    let layer = 1.0 / n;
    let stepUv = slide * depth * layer;
    var at = uv;
    var ray = 0.0;
    var surface = 1.0 - textureSampleGrad(heights, heightsAt, at * repeat, dx, dy).r;
    if (surface <= 0.0) {
      return uv;
    }
    for (var i = 0; i < 64; i++) {
      if (f32(i) >= n) {
        break;
      }
      let next = at + stepUv;
      let nextRay = ray + layer;
      let nextSurface = 1.0 - textureSampleGrad(heights, heightsAt, next * repeat, dx, dy).r;
      if (nextRay >= nextSurface) {
        let above = surface - ray;
        let below = nextRay - nextSurface;
        return at + stepUv * clamp(above / max(above + below, 1e-4), 0.0, 1.0);
      }
      at = next;
      ray = nextRay;
      surface = nextSurface;
    }
    return at;
  }`);
  return reliefWalk;
}

/**
 * A floor's relief on WebGPU, set as its material's build context: its map, normal map and roughness map (tiling
 * alike, by their repeat alone) each read where the view ray meets the relief, their gradients the floor's own (in a
 * loop the GPU's are undefined, and the moved uv's jump at each stone's edge). Other textures keep their own uv.
 */
export function reliefContext(material: THREE.MeshStandardMaterial, relief: FloorRelief): void {
  const { context, uv, dFdx, dFdy, positionWorld, cameraPosition, reference, vec3, float, texture, sampler } =
    tsl as any;
  const heightsMap = material.roughnessMap!;
  const maps = new Set<THREE.Texture | null>([material.map, material.normalMap, material.roughnessMap]);
  const repeat = heightsMap.repeat;
  const own = uv();
  const tiled = own.mul(repeat);
  const gradients = [dFdx(own), dFdy(own)];
  const heights = texture(heightsMap);
  const at = reliefWalkFn()({
    uv: own, repeat, dx: dFdx(tiled), dy: dFdy(tiled), world: positionWorld, eye: cameraPosition,
    relief: vec3(relief.depth, relief.perMetre / repeat.x, relief.fade),
    steps: float(reference('value', 'int', steps)), heights, heightsAt: sampler(heights),
  });
  (material as unknown as { contextNode: N }).contextNode = context({
    getUV: (node: N) => (maps.has(node.value) ? at : null),
    getTextureGradient: (node: N) => (maps.has(node.value) ? gradients : null),
  });
}

/**
 * Gives a floor's standard material (a map, a normal map and a roughness map, tiling alike) its relief: applied in its
 * `onBeforeCompile` after the floor's own edits, its maps are read where the view ray meets the relief.
 */
export function floorRelief(shader: THREE.WebGLProgramParametersWithUniforms, relief: FloorRelief): void {
  shader.uniforms.uReliefSteps = steps;
  shader.uniforms.uRelief = { value: [relief.depth, relief.perMetre, relief.fade] };
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vReliefWorld;')
    .replace('#include <project_vertex>', '#include <project_vertex>\nvReliefWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  shader.fragmentShader = shader.fragmentShader
    .replace(/void\s+main\s*\(\s*\)/, `${RELIEF_GLSL}\nvoid main()`)
    .replace('#include <map_fragment>', `vec2 reliefDx = dFdx(vMapUv), reliefDy = dFdy(vMapUv);
      vec2 reliefAt = reliefUv(vMapUv, reliefDx, reliefDy);
      diffuseColor *= textureGrad(map, reliefAt, reliefDx, reliefDy);`)
    .replace('#include <roughnessmap_fragment>', `float roughnessFactor = roughness;
      roughnessFactor *= textureGrad(roughnessMap, reliefAt, reliefDx, reliefDy).g;`)
    .replace('#include <normal_fragment_maps>', `vec3 mapN = textureGrad(normalMap, reliefAt, reliefDx, reliefDy).xyz * 2.0 - 1.0;
      mapN.xy *= normalScale;
      normal = normalize(tbn * mapN);`);
}
