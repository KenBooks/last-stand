// The skies under the Rust engine: `world/skyNodes.ts`'s domes for the engine's hooks, their WGSL as it is there.
// Each is drawn on the far plane, unlit and out of the fog.
import type * as THREE from 'three';
import { rustShader, type RustLook, type RustShader } from '../custom';

type Uniforms = Record<string, THREE.IUniform>;

/** a dome's place handed to its pixels, and the far plane */
const DOME_VERTEX = /* wgsl */ `
fn vertex_hook(v: ptr<function, Vertex>, instance: u32) {
  (*v).c0 = vec4f((*v).position, 0.0);
  (*v).far = 1.0;
}
`;

const STAR_HASH = /* wgsl */ `
fn sky_star_hash(start: vec3f) -> f32 {
  var p = fract(start * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
`;

const CLOUDS = /* wgsl */ `
fn sky_hash(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
fn sky_value(p: vec2f) -> f32 {
  let i = floor(p);
  var f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(sky_hash(i), sky_hash(i + vec2f(1.0, 0.0)), f.x),
    mix(sky_hash(i + vec2f(0.0, 1.0)), sky_hash(i + vec2f(1.0, 1.0)), f.x), f.y);
}
`;

/** a dome's surface: `colour`'s value, as it is */
const domeSurface = (colour: string): string => /* wgsl */ `
fn surface_hook(s: ptr<function, Surface>, in: VertexOut) -> bool {
  (*s).base = vec4f(${colour}, 1.0);
  (*s).fog = 0.0;
  return true;
}
`;

const NIGHT: RustShader = rustShader({
  name: 'sky-night',
  hooks: DOME_VERTEX + STAR_HASH + /* wgsl */ `
fn sky_night(direction: vec3f, fog: vec3f, moon: vec3f, zenith: vec3f) -> vec3f {
  let d = normalize(direction);
  let y = max(d.y, 0.0);
  var c = mix(fog, fog * vec3f(1.5, 1.45, 1.35), 1.0 - smoothstep(0.0, 0.18, abs(y - 0.05)));
  c = mix(c, zenith, smoothstep(0.08, 0.7, y));
  let m = max(dot(d, moon), 0.0);
  c += vec3f(0.06, 0.07, 0.12) * pow(m, 300.0) + vec3f(0.02, 0.025, 0.04) * pow(m, 8.0);
  let disc = vec3f(0.5, 0.54, 0.64) * (0.85 + 0.15 * sky_star_hash(floor(d * 900.0)));
  c = mix(c, disc, smoothstep(0.99988, 0.99993, m));
  // cubic cells cut the sphere unevenly (more cells towards the diagonals): scale them to even the density out
  let ad = abs(d);
  let g = floor(d * 700.0);
  let dens = 0.004 * 1.732 / (ad.x + ad.y + ad.z);
  let b = sky_star_hash(g + 1.0);
  let tint = mix(vec3f(0.6, 0.68, 1.0), vec3f(1.0, 0.85, 0.7), sky_star_hash(g + 2.0));
  c += tint * 0.55 * step(1.0 - dens, sky_star_hash(g)) * smoothstep(0.12, 0.4, y) * (0.25 + 1.1 * b * b * b);
  return c;
}
` + domeSurface('sky_night(in.c0.xyz, m.c[0].xyz, m.c[1].xyz, m.c[2].xyz)'),
});

const DAY: RustShader = rustShader({
  name: 'sky-day',
  hooks: DOME_VERTEX + CLOUDS + /* wgsl */ `
fn sky_day(direction: vec3f, horizon: vec3f, zenith: vec3f, sun: vec3f, time: f32) -> vec3f {
  let d = normalize(direction);
  let y = max(d.y, 0.0);
  var c = mix(horizon, zenith, smoothstep(0.0, 0.55, y));
  let m = max(dot(d, sun), 0.0);
  c += vec3f(0.5, 0.42, 0.28) * pow(m, 12.0) * 0.35 + vec3f(1.0, 0.92, 0.75) * smoothstep(0.9993, 0.9996, m) * 2.5;
  // clouds on a plane overhead, thinning towards the horizon
  let p = d.xz / max(d.y, 0.08) * 1.6 + vec2f(time * 0.01, time * 0.004);
  var cl = sky_value(p) * 0.55 + sky_value(p * 2.3 + 5.0) * 0.3 + sky_value(p * 5.1 + 9.0) * 0.15;
  cl = smoothstep(0.5, 0.8, cl) * smoothstep(0.04, 0.3, y);
  c = mix(c, horizon * 1.25 + vec3f(0.08, 0.07, 0.05) * pow(m, 4.0), cl * 0.7);
  return c;
}
` + domeSurface('sky_day(in.c0.xyz, m.c[0].xyz, m.c[1].xyz, m.c[2].xyz, m.c[3].x)'),
});

const VILLAGE: RustShader = rustShader({
  name: 'sky-village',
  hooks: DOME_VERTEX + STAR_HASH + CLOUDS + /* wgsl */ `
fn sky_village(direction: vec3f, horizon: vec3f, zenith: vec3f, sun: vec3f, day: f32, time: f32) -> vec3f {
  let d = normalize(direction);
  let y = max(d.y, 0.0);
  var c = mix(horizon, zenith, smoothstep(0.0, 0.55, y));
  let m = max(dot(d, sun), 0.0);
  let glow = mix(vec3f(0.05, 0.06, 0.1), vec3f(0.55, 0.38, 0.2), day);
  c += glow * pow(m, 10.0) * 0.4;
  let disc = smoothstep(mix(0.99988, 0.9993, day), mix(0.99993, 0.9996, day), m);
  c += mix(vec3f(0.5, 0.54, 0.64), vec3f(1.0, 0.9, 0.72) * 2.4, day) * disc;
  let ad = abs(d);
  let g = floor(d * 700.0);
  let dens = 0.004 * 1.732 / (ad.x + ad.y + ad.z);
  let b = sky_star_hash(g + 1.0);
  let lit = step(1.0 - dens, sky_star_hash(g)) * smoothstep(0.12, 0.4, y) * (0.25 + b * b * b) * (1.0 - day);
  c += vec3f(0.8, 0.82, 1.0) * 0.5 * lit;
  let p = d.xz / max(d.y, 0.08) * 1.6 + vec2f(time * 0.01, time * 0.004);
  var cl = sky_value(p) * 0.55 + sky_value(p * 2.3 + 5.0) * 0.3 + sky_value(p * 5.1 + 9.0) * 0.15;
  cl = smoothstep(0.52, 0.82, cl) * smoothstep(0.04, 0.3, y);
  c = mix(c, horizon * mix(0.7, 1.25, day) + vec3f(0.1, 0.06, 0.03) * pow(m, 4.0), cl * 0.6);
  return c;
}
` + domeSurface('sky_village(in.c0.xyz, m.c[0].xyz, m.c[1].xyz, m.c[2].xyz, m.c[3].x, m.c[3].y)'),
});

/** A uniform's three numbers (a colour's or a vector's) written at `at`. */
function three(out: Float32Array, at: number, uniform: THREE.IUniform | undefined): void {
  (uniform?.value as { toArray(into: Float32Array, at: number): unknown } | undefined)?.toArray(out, at);
}

/** The night sky's look, from its uniforms (`uFog`, `uMoon`, `uZenith`). */
export function nightSkyLook(uniforms: Uniforms): RustLook {
  return {
    shader: NIGHT,
    numbers(out) {
      three(out, 0, uniforms.uFog);
      three(out, 4, uniforms.uMoon);
      three(out, 8, uniforms.uZenith);
    },
  };
}

/** The day sky's (`uHorizon`, `uZenith`, `uSun`, `uTime`). */
export function daySkyLook(uniforms: Uniforms): RustLook {
  return {
    shader: DAY,
    numbers(out) {
      three(out, 0, uniforms.uHorizon);
      three(out, 4, uniforms.uZenith);
      three(out, 8, uniforms.uSun);
      out[12] = uniforms.uTime.value as number;
    },
  };
}

/** The village's (`uHorizon`, `uZenith`, `uSun`, `uDay`, `uTime`). */
export function villageSkyLook(uniforms: Uniforms): RustLook {
  return {
    shader: VILLAGE,
    numbers(out) {
      three(out, 0, uniforms.uHorizon);
      three(out, 4, uniforms.uZenith);
      three(out, 8, uniforms.uSun);
      out[12] = uniforms.uDay.value as number;
      out[13] = uniforms.uTime.value as number;
    },
  };
}
