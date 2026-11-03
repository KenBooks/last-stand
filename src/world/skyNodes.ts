// The skies on WebGPU (core/webgpu.ts): props.ts's night and day domes as WGSL functions (`wgslFn`), written line
// for line from their GLSL, each a node material's whole output as `gl_FragColor` was, set on the far plane as the
// GLSL set `gl_Position.z` to its `w` (drawn after everything opaque, the depth test skips every covered pixel).
import * as THREE from 'three';
import { gpu, tsl } from '../core/webgpu';

// (untyped: TSL's types don't follow its conversions across these calls yet)
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

/** a dome's `ShaderMaterial`'s uniforms, read by name as each frame draws */
type Uniforms = Record<string, THREE.IUniform>;

/** A dome's material: `colour` (its direction from the dome's middle in, a colour out), on the far plane. */
function domeMaterial(colour: (direction: N) => N): THREE.Material {
  const { cameraProjectionMatrix, modelViewMatrix, positionGeometry, vec4 } = tsl as any;
  const material = new gpu.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false });
  const clip = cameraProjectionMatrix.mul(modelViewMatrix).mul(vec4(positionGeometry, 1));
  material.vertexNode = vec4(clip.xy, clip.w, clip.w);
  material.fragmentNode = colour(positionGeometry);
  return material;
}

/** The night sky (`buildSky`, its `uFog`, `uMoon` and `uZenith`): the fog's colour at the horizon, a faint glow above
 *  it, the zenith overhead, a moon and a sprinkle of stars. */
export function nightSkyMaterial(uniforms: Uniforms): THREE.Material {
  const { reference, wgslFn } = tsl as any;
  // (no sin(): its precision loss on big cell coordinates lines the stars up in rings round the zenith)
  const hash = wgslFn(`fn skyStarHash(start: vec3f) -> f32 {
    var p = fract(start * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }`);
  const night = wgslFn(`fn skyNight(direction: vec3f, fog: vec3f, moon: vec3f, zenith: vec3f) -> vec4f {
    let d = normalize(direction);
    let y = max(d.y, 0.0);
    var c = mix(fog, fog * vec3f(1.5, 1.45, 1.35), 1.0 - smoothstep(0.0, 0.18, abs(y - 0.05)));
    c = mix(c, zenith, smoothstep(0.08, 0.7, y));
    let m = max(dot(d, moon), 0.0);
    c += vec3f(0.06, 0.07, 0.12) * pow(m, 300.0) + vec3f(0.02, 0.025, 0.04) * pow(m, 8.0);
    let disc = vec3f(0.5, 0.54, 0.64) * (0.85 + 0.15 * skyStarHash(floor(d * 900.0)));
    c = mix(c, disc, smoothstep(0.99988, 0.99993, m));
    // cubic cells cut the sphere unevenly (more cells towards the diagonals): scale them to even the density out
    let ad = abs(d);
    let g = floor(d * 700.0);
    let dens = 0.004 * 1.732 / (ad.x + ad.y + ad.z);
    let b = skyStarHash(g + 1.0);
    let tint = mix(vec3f(0.6, 0.68, 1.0), vec3f(1.0, 0.85, 0.7), skyStarHash(g + 2.0));
    c += tint * 0.55 * step(1.0 - dens, skyStarHash(g)) * smoothstep(0.12, 0.4, y) * (0.25 + 1.1 * b * b * b);
    return vec4f(c, 1.0);
  }`, [hash]);
  return domeMaterial((direction) => night({
    direction,
    fog: reference('value', 'vec3', uniforms.uFog),
    moon: reference('value', 'vec3', uniforms.uMoon),
    zenith: reference('value', 'vec3', uniforms.uZenith),
  }));
}

/** The day sky (`buildDaySky`, its `uHorizon`, `uZenith`, `uSun` and `uTime`): the horizon rising into the zenith, a
 *  sun with a warm glow round it, and slow soft clouds. */
export function daySkyMaterial(uniforms: Uniforms): THREE.Material {
  const { reference, wgslFn } = tsl as any;
  const hash = wgslFn(`fn skyHash(p: vec2f) -> f32 {
    return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
  }`);
  const value = wgslFn(`fn skyValue(p: vec2f) -> f32 {
    let i = floor(p);
    var f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(skyHash(i), skyHash(i + vec2f(1.0, 0.0)), f.x),
      mix(skyHash(i + vec2f(0.0, 1.0)), skyHash(i + vec2f(1.0, 1.0)), f.x), f.y);
  }`, [hash]);
  const day = wgslFn(`fn skyDay(direction: vec3f, horizon: vec3f, zenith: vec3f, sun: vec3f, time: f32) -> vec4f {
    let d = normalize(direction);
    let y = max(d.y, 0.0);
    var c = mix(horizon, zenith, smoothstep(0.0, 0.55, y));
    let m = max(dot(d, sun), 0.0);
    c += vec3f(0.5, 0.42, 0.28) * pow(m, 12.0) * 0.35 + vec3f(1.0, 0.92, 0.75) * smoothstep(0.9993, 0.9996, m) * 2.5;
    // clouds on a plane overhead, thinning towards the horizon
    let p = d.xz / max(d.y, 0.08) * 1.6 + vec2f(time * 0.01, time * 0.004);
    var cl = skyValue(p) * 0.55 + skyValue(p * 2.3 + 5.0) * 0.3 + skyValue(p * 5.1 + 9.0) * 0.15;
    cl = smoothstep(0.5, 0.8, cl) * smoothstep(0.04, 0.3, y);
    c = mix(c, horizon * 1.25 + vec3f(0.08, 0.07, 0.05) * pow(m, 4.0), cl * 0.7);
    return vec4f(c, 1.0);
  }`, [value]);
  return domeMaterial((direction) => day({
    direction,
    horizon: reference('value', 'vec3', uniforms.uHorizon),
    zenith: reference('value', 'vec3', uniforms.uZenith),
    sun: reference('value', 'vec3', uniforms.uSun),
    time: reference('value', 'float', uniforms.uTime),
  }));
}
