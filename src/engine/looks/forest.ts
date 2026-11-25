// The Thornwood's floor, grass and light under the Rust engine: `world/forestNodes.ts`'s nodes as WGSL for the
// engine's hooks: the moss tinted over the floor (its pebbles and leaves stood up out of the soil:
// looks/relief.ts), the grass's tufts swaying in the wind, the shafts of light.
import type * as THREE from 'three';
import type { Sway } from '../../world/forestNodes';
import type { FloorRelief } from '../../core/parallax';
import { rustShader, type RustLook, type RustShader } from '../custom';
import { RELIEF, reliefNumbers } from './relief';

const MOSS_NOISE = /* wgsl */ `
fn moss_hash(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
fn moss_noise(p: vec2f) -> f32 {
  let i = floor(p);
  var f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(moss_hash(i), moss_hash(i + vec2f(1.0, 0.0)), f.x),
    mix(moss_hash(i + vec2f(0.0, 1.0)), moss_hash(i + vec2f(1.0, 1.0)), f.x), f.y);
}
`;

const MOSS: RustShader = rustShader({
  name: 'forest-moss',
  hooks: MOSS_NOISE + RELIEF + /* wgsl */ `
fn vertex_hook(v: ptr<function, Vertex>, instance: u32) {}

fn surface_hook(s: ptr<function, Surface>, in: VertexOut) -> bool {
  relief_at(s, in, m.c[0]);
  let xz = in.world.xz;
  let patches = moss_noise(xz * 0.11) * 0.6 + moss_noise(xz * 0.37 + 7.0) * 0.3 + moss_noise(xz * 1.3) * 0.1;
  let moss = smoothstep(0.4, 0.7, patches);
  let tint = vec3f(0.045, 0.09, 0.025) * (moss_noise(xz * 3.1) * 0.6 + 0.7);
  (*s).base = vec4f(mix((*s).base.rgb, tint, moss * 0.75), (*s).base.a);
  return true;
}
`,
});

const GRASS: RustShader = rustShader({
  name: 'forest-grass',
  hooks: /* wgsl */ `
fn vertex_hook(v: ptr<function, Vertex>, instance: u32) {
  // (each tuft out of step with its neighbours by where it stands)
  let tuft_at = (*v).origin.xz;
  let time = g.cam_pos.w;
  let rate = m.c[0].x;
  let height = (*v).position.y;
  let bend = height * height * 4.0;
  let gust = sin(time * rate + tuft_at.x * 0.35 + tuft_at.y * 0.22) * 0.75
    + sin(time * rate * 2.3 + tuft_at.x * 0.9 - tuft_at.y * 0.6) * 0.25;
  let push = vec2f(0.8, 0.6) * (gust * m.c[0].y * bend);
  (*v).position += vec3f(push.x, 0.0, push.y);
}

fn surface_hook(s: ptr<function, Surface>, in: VertexOut) -> bool { return true; }
`,
});

const SHAFTS: RustShader = rustShader({
  name: 'forest-shafts',
  hooks: MOSS_NOISE + /* wgsl */ `
fn vertex_hook(v: ptr<function, Vertex>, instance: u32) {}

fn surface_hook(s: ptr<function, Surface>, in: VertexOut) -> bool {
  // brightest along a shaft's axis as seen from the camera, faded in below the canopy and out at the ground
  let facing = abs(dot(normalize(in.normal), normalize(g.cam_pos.xyz - in.world)));
  let along = smoothstep(0.0, 0.08, in.uv.y) * (1.0 - smoothstep(0.55, 1.0, in.uv.y));
  let dust = moss_noise(vec2f(in.uv.x * 6.0, in.uv.y * 14.0 - m.c[0].x * 0.15)) * 0.35 + 0.65;
  (*s).base = vec4f(m.c[1].rgb * (pow(facing, 4.0) * along * dust), 1.0);
  (*s).fog = 0.0;
  return true;
}
`,
});

/** The floor's moss, over the material's own colour. */
export const mossLook = (relief: FloorRelief): RustLook => ({
  shader: MOSS,
  casts: true,
  numbers(out) { reliefNumbers(out, 0, relief); },
});

/** The grass in the wind (`windInGrass`'s numbers); the engine's own clock is the game's. */
export const grassWindLook = ({ rate, reach }: Sway): RustLook => ({
  shader: GRASS,
  numbers(out) { out[0] = rate; out[1] = reach; },
});

/** The shafts of light, on their clock (`{ value }`). */
export const shaftsLook = (time: { value: number }, color: THREE.Color): RustLook => ({
  shader: SHAFTS,
  numbers(out) { out[0] = time.value; color.toArray(out, 4); },
});
