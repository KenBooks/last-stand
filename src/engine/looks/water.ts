// The fountain's water under the Rust engine (`world/villageNodes.ts` `waterNodes` and `causticNodes`): its normal
// bent by rings out from its middle, two slow swells and wavelets crossing three ways, clearer looked down into; and
// the basin floor's web of light; what it mirrors of the sky by the hour, and how the lights round it see it
// (`waterLooks`: rougher, a share of their highlights; its glints' most is the material's `litMost`). The falling
// water mirrors the sky by the hour alone (`fallingLook`).
import type { RustLook, RustShader } from '../custom';

const WATER: RustShader = {
  name: 'fountain-water',
  hooks: /* wgsl */ `
fn vertex_hook(v: ptr<function, Vertex>, instance: u32) {
  // (from its middle, in the world: the pool lies flat, so its own x and z are the world's but for where it stands)
  (*v).c0 = vec4f((*v).position.xz, 0.0, 0.0);
}

fn surface_hook(s: ptr<function, Surface>, in: VertexOut) -> bool {
  let t = m.c[0].x;
  let ripple = in.c0.xy;
  let away = length(ripple) + 1e-4;
  let rings = cos(away * 11.0 - t * 4.0) * 0.16 * exp(away * -0.35);
  var slope = ripple / away * rings;
  slope += vec2f(sin(ripple.y * 2.3 + t * 0.9), cos(ripple.x * 1.9 - t * 0.7)) * 0.05;
  for (var w = 0; w < 3; w++) {
    let turn = f32(w) * 2.1 + 0.4;
    let way = vec2f(cos(turn), sin(turn));
    slope += way * (sin(dot(ripple, way) * (17.0 + f32(w) * 6.0) + t * (2.3 + f32(w))) * 0.08);
  }
  let normal = normalize((*s).normal + vec3f(slope.x, 0.0, slope.y));
  (*s).normal = normal;
  let facing = clamp(dot(normal, normalize(g.cam_pos.xyz - in.world)), 0.0, 1.0);
  (*s).base = vec4f((*s).base.rgb, mix(0.45, 0.92, pow(1.0 - facing, 3.0)));
  (*s).mirror = m.c[0].y;
  (*s).lights = m.c[0].zw;
  return true;
}
`,
};

const FALLING: RustShader = {
  name: 'fountain-falling',
  hooks: /* wgsl */ `
fn vertex_hook(v: ptr<function, Vertex>, instance: u32) {}

fn surface_hook(s: ptr<function, Surface>, in: VertexOut) -> bool {
  (*s).mirror = m.c[0].x;
  return true;
}
`,
};

const CAUSTICS: RustShader = {
  name: 'fountain-caustics',
  hooks: /* wgsl */ `
fn vertex_hook(v: ptr<function, Vertex>, instance: u32) {
  (*v).c0 = vec4f((*v).rest.xz, 0.0, 0.0);
}

fn surface_hook(s: ptr<function, Surface>, in: VertexOut) -> bool {
  var t = m.c[0].x;
  var p = in.c0.xy * 2.6;
  var web = 0.0;
  for (var k = 0; k < 2; k++) {
    let q = p + vec2f(sin(p.y * 1.3 + t * 0.9), cos(p.x * 1.1 - t * 0.7)) * 0.7;
    let lines = abs(sin(q.x * 2.2 + sin(q.y * 1.7 + t)) * sin(q.y * 2.4 + sin(q.x * 1.5 - t * 0.8)));
    web += pow(1.0 - lines, 7.0);
    p = p * 1.6 + vec2f(1.7, 9.2);
    t *= 1.3;
  }
  (*s).emissive += (*s).base.rgb * web * 0.35 * m.c[0].y;
  return true;
}
`,
};

/** How the lights round the water see it (`WaterLit` in world/villageNodes.ts). */
interface Lit { rough: number; shine: number }

/** A pool's water, on the game's clock (`{ value }`), mirroring `sky` of the sky, lit as `lit` says. */
export const waterLook = (time: { value: number }, sky: { value: number }, lit: Lit): RustLook => ({
  shader: WATER,
  numbers(out) { out[0] = time.value; out[1] = sky.value; out[2] = lit.rough; out[3] = lit.shine; },
});

/** The falling water and its foam, mirroring `sky` of the sky. */
export const fallingLook = (sky: { value: number }): RustLook => ({
  shader: FALLING,
  numbers(out) { out[0] = sky.value; },
});

/** The basin's floor under the water: its web of light on `time`, by how much of the sky's light there is. */
export const causticsLook = (time: { value: number }, light: { value: number }): RustLook => ({
  shader: CAUSTICS,
  casts: true,
  numbers(out) { out[0] = time.value; out[1] = light.value; },
});
