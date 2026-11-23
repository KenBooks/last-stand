// The crypt's floor and what stands beyond its wall under the Rust engine: `world/cryptNodes.ts`'s nodes as WGSL for
// the engine's hooks: the cobbles' damp, drift and moss, the earth round the small dead trees' feet, and the world
// past the wall darkened in the top-down view; the cobbles' relief is looks/relief.ts.
import type * as THREE from 'three';
import type { Damp, Outside } from '../../world/cryptNodes';
import type { FloorRelief } from '../../core/parallax';
import type { RustLook, RustShader } from '../custom';
import { RELIEF, reliefNumbers } from './relief';

/** where the looks' numbers are in `m.c`, in floats, and how many spots of earth the floor's shader reads at most */
const AT = { span: 0, tile: 1, ragged: 2, stones: 3, spots: 4, amount: 5, washed: 6, from: 8, to: 9, most: 10,
  relief: 12, earth: 16 };
const SPOTS_MOST = 16;

/** the dimming past the wall, of whatever was lit: `m.c[1].y` how far in (0 to 1), `m.c[2]` from, to, the most */
const DIM = /* wgsl */ `
fn dimmed_outside(xz: vec2f) -> f32 {
  return 1.0 - m.c[1].y * m.c[2].z * smoothstep(m.c[2].x, m.c[2].y, length(xz));
}
`;

const OUTSIDE: RustShader = {
  name: 'crypt-outside',
  hooks: DIM + /* wgsl */ `
fn vertex_hook(v: ptr<function, Vertex>, instance: u32) {}

fn surface_hook(s: ptr<function, Surface>, in: VertexOut) -> bool {
  (*s).shade = dimmed_outside(in.world.xz);
  return true;
}
`,
};

const DAMP: RustShader = {
  name: 'crypt-damp',
  hooks: DIM + RELIEF + /* wgsl */ `
fn vertex_hook(v: ptr<function, Vertex>, instance: u32) {}

fn surface_hook(s: ptr<function, Surface>, in: VertexOut) -> bool {
  // (the cobbles stood up out of their grout: their maps read where the view's ray meets them)
  let cobbles_at = relief_at(s, in, m.c[3]);
  let xz = in.world.xz;
  let damp = textureSample(t_extra0, samp, xz / m.c[0].x).rgb;
  let stone_top = textureSampleGrad(t_orm, samp, cobbles_at, dpdx(in.uv), dpdy(in.uv)).r;
  let soil_at = xz / m.c[0].y;
  let soil = textureSample(t_extra1, samp, soil_at).rgb;
  let soil_bump = textureSample(t_extra2, samp, soil_at).xyz * 2.0 - 1.0;
  let soil_rough = textureSample(t_extra3, samp, soil_at).g;
  // (each spot's reach is its z: the earth's edge ragged by the damp's own noise, cut round the cobbles' tops)
  var earth = 0.0;
  var inward = 1.0;
  let spots = u32(m.c[1].x);
  for (var i = 0u; i < spots; i++) {
    let spot = m.c[4u + i].xyz;
    let reach = spot.z;
    let away = length(xz - spot.xy) + (damp.g - 0.5) * reach * m.c[0].z;
    let edge = away - reach - (0.5 - stone_top) * m.c[0].w;
    earth = max(earth, 1.0 - smoothstep(-m.c[1].z, m.c[1].w, edge));
    inward = min(inward, away / max(reach, 1e-3));
  }
  var shade = (*s).base.rgb * (damp.g * 0.36 + 0.82);
  shade = mix(shade, shade * vec3f(0.5, 0.55, 0.68), damp.r);
  // moss creeping in from the wall
  let moss = smoothstep(22.0, 28.0, length(xz)) * damp.b;
  shade = mix(shade, vec3f(0.05, 0.075, 0.035), moss * 0.7);
  // bare soil, darker in towards the trunk
  (*s).base = vec4f(mix(shade, soil * (clamp(inward, 0.0, 1.0) * 0.25 + 0.75), earth), (*s).base.a);
  let wet = damp.r * (1.0 - earth);
  (*s).roughness = mix(mix((*s).roughness, 0.42, wet), soil_rough, earth);
  // the soil's own relief, its tangent space the floor's (u along x, v along z, up its normal)
  let soil_up = normalize(vec3f(soil_bump.x, soil_bump.z, -soil_bump.y));
  (*s).normal = normalize(mix((*s).normal, soil_up, earth));
  (*s).shade = dimmed_outside(xz);
  return true;
}
`,
};

function dim(out: Float32Array, amount: { value: number }, { from, to, most }: Outside): void {
  out[AT.amount] = amount.value;
  out[AT.from] = from; out[AT.to] = to; out[AT.most] = most;
}

/** What stands beyond the wall, darkened past it by `amount` (a `{ value }` eased 0 to 1). */
export const outsideLook = (amount: { value: number }, outside: Outside): RustLook => ({
  shader: OUTSIDE,
  casts: true,
  numbers(out) { dim(out, amount, outside); },
});

/** The cobbles with the damp, the moss and the earth laid over them, and the dimming past the wall. */
export function dampLook(damp: Damp, amount: { value: number }, outside: Outside, relief: FloorRelief): RustLook {
  const maps: (THREE.Texture | null)[] = [damp.map, damp.soil.map, damp.soil.normalMap, damp.soil.roughnessMap];
  return {
    shader: DAMP,
    casts: true,
    maps,
    numbers(out) {
      out[AT.span] = damp.span; out[AT.tile] = damp.tile; out[AT.ragged] = damp.ragged; out[AT.stones] = damp.stones;
      const spots = Math.min(damp.earth.length, SPOTS_MOST);
      out[AT.spots] = spots;
      out[AT.washed] = damp.washed[0]; out[AT.washed + 1] = damp.washed[1];
      dim(out, amount, outside);
      reliefNumbers(out, AT.relief, relief);
      for (let spot = 0; spot < spots; spot++) damp.earth[spot].toArray(out, AT.earth + spot * 4);
    },
  };
}

const BEACON: RustShader = {
  name: 'crypt-beacon',
  hooks: /* wgsl */ `
fn beacon_hash(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
fn beacon_noise(p: vec2f) -> f32 {
  let i = floor(p);
  var f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(beacon_hash(i), beacon_hash(i + vec2f(1.0, 0.0)), f.x),
    mix(beacon_hash(i + vec2f(0.0, 1.0)), beacon_hash(i + vec2f(1.0, 1.0)), f.x), f.y);
}

fn vertex_hook(v: ptr<function, Vertex>, instance: u32) {
  let time = m.c[0].x;
  var p = (*v).position;
  let w = sin(time * 7.0 + p.y * 9.0) * 0.06 + sin(time * 11.0 - p.y * 5.0) * 0.04;
  p = vec3f(p.x * (1.0 + w * p.y), p.y, p.z * (1.0 + w * p.y));
  p.x += sin(time * 3.0 + p.y * 4.0) * 0.05 * p.y * p.y;
  (*v).position = p;
  (*v).c0 = vec4f(p, 0.0);
}

fn surface_hook(s: ptr<function, Surface>, in: VertexOut) -> bool {
  let time = m.c[0].x;
  let p = in.c0.xyz;
  let facing = dot(normalize(in.normal), normalize(g.cam_pos.xyz - in.world));
  let rim = pow(max(1.0 - abs(facing), 0.0), 1.6);
  let bands = beacon_noise(vec2f(p.x * 6.0 + p.z * 4.0, p.y * 5.0 - time * 3.2)) * 0.6
    + beacon_noise(vec2f(p.z * 11.0 - p.x * 3.0, p.y * 9.0 - time * 5.0)) * 0.4;
  let fade = 1.0 - smoothstep(0.45, 1.05, p.y + bands * 0.25);
  let c = mix(vec3f(0.1, 0.35, 1.0), vec3f(0.75, 0.9, 1.0), rim * 0.6 + (1.0 - p.y) * 0.3);
  (*s).base = vec4f(c * (0.25 + rim * 1.2) * (0.55 + bands * 0.9) * fade, 1.0);
  (*s).fog = 0.0;
  return true;
}
`,
};

/** A beacon's cold flame, on its clock (`{ value }`). */
export const beaconLook = (time: { value: number }): RustLook => ({
  shader: BEACON,
  numbers(out) { out[0] = time.value; },
});
