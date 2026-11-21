// The gates' portals under the Rust engine: `world/portalNodes.ts`'s membrane and the light it spills over the
// floor, their WGSL as it is there. (Not ported: the membrane fading as the gate round it dissolves.)
import type { PortalUniforms } from '../../world/portalNodes';
import type { RustLook, RustShader } from '../custom';

const NOISE = /* wgsl */ `
fn vertex_hook(v: ptr<function, Vertex>, instance: u32) {}
fn portal_hash(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
fn portal_value(p: vec2f) -> f32 {
  let i = floor(p);
  var f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(portal_hash(i), portal_hash(i + vec2f(1.0, 0.0)), f.x),
    mix(portal_hash(i + vec2f(0.0, 1.0)), portal_hash(i + vec2f(1.0, 1.0)), f.x), f.y);
}
fn portal_fbm(start: vec2f) -> f32 {
  var p = start;
  var v = 0.0;
  var a = 0.5;
  for (var k = 0; k < 4; k++) {
    v += portal_value(p) * a;
    p = p * 2.03 + 17.1;
    a *= 0.5;
  }
  return v;
}
`;

const MEMBRANE: RustShader = {
  name: 'portal-membrane',
  hooks: NOISE + /* wgsl */ `
fn portal_membrane(uv: vec2f, time: f32, power: f32, arch: f32, a: vec3f, b: vec3f, core: vec3f) -> vec4f {
  let p = uv * 2.0 - 1.0;
  // rounded rectangle filling the opening: sd < 0 inside
  let q = abs(p) - vec2f(0.72, 0.8);
  var sd = length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - 0.14;
  // or straight sides under a round top
  var arch_sd = max(abs(p.x) - 0.8, -0.92 - p.y);
  if (p.y > 0.08) { arch_sd = length(vec2f(p.x, p.y - 0.08)) - 0.8; }
  sd = mix(sd, arch_sd, arch);
  let r = length(p * vec2f(1.0, 0.95));
  // twist the plane round the centre, tighter towards it (no atan: no seam)
  let tw = 3.2 * (1.0 - smoothstep(0.0, 1.1, r)) + time * 0.9;
  let w = mat2x2f(cos(tw), -sin(tw), sin(tw), cos(tw)) * p;
  let arms = portal_fbm(w * 2.2 + vec2f(0.0, time * 0.25));
  let fine = portal_fbm(w * 5.5 - vec2f(time * 0.4));
  var c = mix(a * 0.3, b, smoothstep(0.35, 0.75, arms)) * (0.35 + fine * 1.3);
  // a dark heart round a bright pinpoint core
  c *= mix(0.25, 1.0, smoothstep(0.08, 0.6, r));
  c += core * (exp(-r * r * 60.0) * 1.6 + exp(-r * r * 8.0) * 0.25);
  // sparks swept round with the swirl
  let sg = w * 9.0 + vec2f(time * 0.7, 0.0);
  let spark = 1.0 - smoothstep(0.1, 0.5, length(fract(sg) - vec2f(0.5)));
  c += core * step(0.965, portal_hash(floor(sg))) * spark * 1.2;
  let inside = 1.0 - smoothstep(-0.03, 0.02, sd);
  // crackling rim along the edge
  let crackle = 0.6 + 0.8 * portal_value(p * 7.0 + vec2f(time * 3.0, -time * 2.0));
  let e = min(uv, 1.0 - uv);
  let rim = (exp(-abs(sd) * 30.0) * crackle + exp(-abs(sd) * 8.0) * 0.25) * smoothstep(0.0, 0.06, min(e.x, e.y));
  c = c * inside + mix(b, core, 0.55) * rim;
  return vec4f(c * power * 2.3, clamp(inside * 0.94 + rim, 0.0, 1.0));
}

fn surface_hook(s: ptr<function, Surface>, in: VertexOut) -> bool {
  (*s).base = portal_membrane(in.uv, m.c[0].x, m.c[0].y, m.c[0].z, m.c[1].rgb, m.c[2].rgb, m.c[3].rgb);
  return true;
}
`,
};

const SPILL: RustShader = {
  name: 'portal-spill',
  hooks: NOISE + /* wgsl */ `
fn surface_hook(s: ptr<function, Surface>, in: VertexOut) -> bool {
  let uv = in.uv;
  let time = m.c[0].x;
  let p = vec2f((uv.x - 0.5) * 1.6, uv.y);
  let glow = exp(-dot(p, p) * 3.5) * (0.75 + 0.5 * portal_value(vec2f(uv.x * 5.0, uv.y * 3.0 - time * 0.8)));
  (*s).base = vec4f(mix(m.c[2].rgb, m.c[3].rgb, 0.3) * glow * m.c[0].y * 0.55, 1.0);
  return true;
}
`,
};

function numbers(uniforms: PortalUniforms): RustLook['numbers'] {
  return (out) => {
    out[0] = uniforms.uTime.value; out[1] = uniforms.uPower.value; out[2] = uniforms.uArch.value;
    uniforms.uA.value.toArray(out, 4);
    uniforms.uB.value.toArray(out, 8);
    uniforms.uCore.value.toArray(out, 12);
  };
}

/** The membrane's look, from the portal's uniforms as `world/props.ts` keeps them. */
export const membraneLook = (uniforms: PortalUniforms): RustLook => ({ shader: MEMBRANE, numbers: numbers(uniforms) });

/** The light it spills over the floor. */
export const spillLook = (uniforms: PortalUniforms): RustLook => ({ shader: SPILL, numbers: numbers(uniforms) });
