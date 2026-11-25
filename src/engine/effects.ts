// The effects' own shaders under the Rust engine: a skill's or a bolt's `ShaderMaterial` (GLSL, with its port to
// three's nodes beside it, `core/shaderPorts.ts`) given a look for the engine, beside both, in the file that makes
// the material. Its hooks are the port's WGSL again; its numbers are read off the material's own uniforms each frame
// it's drawn. Without a look a shader material isn't drawn at all (from play: "no mage visual effects on spells").
import type * as THREE from 'three';
import { NEAR_GLOW } from '../core/materials';
import { rustLook, rustShader, type RustLook } from './custom';

/** the effects' shared noise, as `wgslNoise` has it for three's nodes (`fx_` before each name) */
export const FX_NOISE = /* wgsl */ `
fn fx_hash2(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
fn fx_noise2(p: vec2f) -> f32 {
  let i = floor(p);
  var f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fx_hash2(i), fx_hash2(i + vec2f(1.0, 0.0)), f.x),
    mix(fx_hash2(i + vec2f(0.0, 1.0)), fx_hash2(i + vec2f(1.0, 1.0)), f.x), f.y);
}
fn fx_hash3(start: vec3f) -> f32 {
  var p = fract(start * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
fn fx_noise3(x: vec3f) -> f32 {
  let i = floor(x);
  var f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fx_hash3(i), fx_hash3(i + vec3f(1.0, 0.0, 0.0)), f.x),
      mix(fx_hash3(i + vec3f(0.0, 1.0, 0.0)), fx_hash3(i + vec3f(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(fx_hash3(i + vec3f(0.0, 0.0, 1.0)), fx_hash3(i + vec3f(1.0, 0.0, 1.0)), f.x),
      mix(fx_hash3(i + vec3f(0.0, 1.0, 1.0)), fx_hash3(i + vec3f(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
fn fx_fbm3(p: vec3f) -> f32 {
  return fx_noise3(p) * 0.55 + fx_noise3(p * 2.1 + 3.1) * 0.3 + fx_noise3(p * 4.3 + 7.7) * 0.15;
}
/// how much of an effect's light is left this near the camera (\`nearGlow\`, core/materials.ts)
fn fx_near(depth: f32) -> f32 {
  return clamp(pow(depth / ${NEAR_GLOW.ref.toFixed(1)}, ${NEAR_GLOW.pow.toFixed(2)}), ${NEAR_GLOW.min.toFixed(2)}, 1.0);
}
`;

/** a vertex hook that changes nothing */
export const FX_PLAIN_VERTEX = 'fn vertex_hook(v: ptr<function, Vertex>, instance: u32) {}\n';

/** a uniform's value, as a shader material holds it */
type Uniforms = Record<string, { value: unknown }>;

/** What an effect's look reads besides its hooks: its numbers from the material's uniforms, and the rest a look has. */
export interface EffectLook extends Omit<RustLook, 'shader' | 'numbers'> {
  numbers(uniforms: Uniforms, out: Float32Array): void;
}

/** A uniform's number. */
export const num = (uniforms: Uniforms, name: string): number => uniforms[name].value as number;

/** A uniform's colour or vector written at `at` of `out` (its three numbers). */
export function rgb(uniforms: Uniforms, name: string, out: Float32Array, at: number): void {
  const value = uniforms[name].value as { r?: number; g?: number; b?: number; x?: number; y?: number; z?: number };
  out[at] = value.r ?? value.x ?? 0;
  out[at + 1] = value.g ?? value.y ?? 0;
  out[at + 2] = value.b ?? value.z ?? 0;
}

/** An effect's shader listed for the engine as its module loads (`RUST_SHADERS`): joined with the other effects'
 *  into one module, as `effectLook` makes it for each material by its name and hooks (the same two given each). */
export function effectShader(name: string, hooks: string): void {
  rustShader({ name, hooks: FX_NOISE + hooks, group: 'effects' });
}

/** `material` drawn by the engine with `hooks` (its two functions' WGSL, `FX_NOISE` before them), named `name`. */
export function effectLook<M extends THREE.ShaderMaterial>(material: M, name: string, hooks: string, look: EffectLook): M {
  const uniforms = material.uniforms as Uniforms;
  return rustLook(material, {
    ...look,
    shader: { name, hooks: FX_NOISE + hooks },
    numbers: (out) => look.numbers(uniforms, out),
  });
}
