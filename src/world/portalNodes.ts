// The gates' portals on WebGPU (core/webgpu.ts): `portalMembrane`'s two shaders (props.ts), the swirling membrane and
// the light it spills over the floor, as WGSL functions (`wgslFn`) written line for line from the GLSL, each a node
// material's whole output as `gl_FragColor` was, the membrane fading as the gate round it dissolves
// (`seeThroughFade`, core/shaderPorts.ts `seeKept`).
import * as THREE from 'three';
import { gpu, tsl } from '../core/webgpu';
import { seeKept, seeUniforms } from '../core/shaderPorts';

// (untyped: TSL's types don't follow its conversions across these calls yet)
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

/** The portal's uniforms as props.ts keeps them (each `{ value }`, read as each frame draws). */
export interface PortalUniforms {
  uTime: { value: number };
  uPower: { value: number };
  uArch: { value: number };
  uA: { value: THREE.Color };
  uB: { value: THREE.Color };
  uCore: { value: THREE.Color };
}

/** the GLSL's `h`, `n` and `fbm`, made once */
let noise: { hash: N; value: N; fbm: N } | null = null;
function portalNoise(): { hash: N; value: N; fbm: N } {
  const { wgslFn } = tsl as any;
  if (noise) return noise;
  const hash = wgslFn(`fn portalHash(p: vec2f) -> f32 {
    return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
  }`);
  const value = wgslFn(`fn portalValue(p: vec2f) -> f32 {
    let i = floor(p);
    var f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(portalHash(i), portalHash(i + vec2f(1.0, 0.0)), f.x),
      mix(portalHash(i + vec2f(0.0, 1.0)), portalHash(i + vec2f(1.0, 1.0)), f.x), f.y);
  }`, [hash]);
  const fbm = wgslFn(`fn portalFbm(start: vec2f) -> f32 {
    var p = start;
    var v = 0.0;
    var a = 0.5;
    for (var k = 0; k < 4; k++) {
      v += portalValue(p) * a;
      p = p * 2.03 + 17.1;
      a *= 0.5;
    }
    return v;
  }`, [value]);
  noise = { hash, value, fbm };
  return noise;
}

/** `uniforms`' values as nodes, read as each frame draws */
function uniformNodes(uniforms: PortalUniforms): Record<string, N> {
  const { reference } = tsl as any;
  return {
    time: reference('value', 'float', uniforms.uTime),
    power: reference('value', 'float', uniforms.uPower),
    arch: reference('value', 'float', uniforms.uArch),
    a: reference('value', 'color', uniforms.uA),
    b: reference('value', 'color', uniforms.uB),
    core: reference('value', 'color', uniforms.uCore),
  };
}

/** The membrane: a vortex twisting round a dark heart and a bright core, sparks swept round it, a crackling rim
 *  round a rounded rectangle (or straight sides under a round top), alpha-blended over what's behind the gate. */
export function membraneMaterial(uniforms: PortalUniforms): THREE.Material {
  const { wgslFn, uv } = tsl as any;
  const { hash, value, fbm } = portalNoise();
  const membrane = wgslFn(`fn portalMembrane(uv: vec2f, time: f32, power: f32, arch: f32, a: vec3f, b: vec3f,
    core: vec3f) -> vec4f {
    let p = uv * 2.0 - 1.0;
    // rounded rectangle filling the opening: sd < 0 inside
    let q = abs(p) - vec2f(0.72, 0.8);
    var sd = length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - 0.14;
    // or straight sides under a round top
    var archSd = max(abs(p.x) - 0.8, -0.92 - p.y);
    if (p.y > 0.08) {
      archSd = length(vec2f(p.x, p.y - 0.08)) - 0.8;
    }
    sd = mix(sd, archSd, arch);
    let r = length(p * vec2f(1.0, 0.95));
    // twist the plane round the centre, tighter towards it (no atan: no seam)
    let tw = 3.2 * (1.0 - smoothstep(0.0, 1.1, r)) + time * 0.9;
    let w = mat2x2f(cos(tw), -sin(tw), sin(tw), cos(tw)) * p;
    let arms = portalFbm(w * 2.2 + vec2f(0.0, time * 0.25));
    let fine = portalFbm(w * 5.5 - vec2f(time * 0.4));
    var c = mix(a * 0.3, b, smoothstep(0.35, 0.75, arms)) * (0.35 + fine * 1.3);
    // a dark heart round a bright pinpoint core
    c *= mix(0.25, 1.0, smoothstep(0.08, 0.6, r));
    c += core * (exp(-r * r * 60.0) * 1.6 + exp(-r * r * 8.0) * 0.25);
    // sparks swept round with the swirl
    let sg = w * 9.0 + vec2f(time * 0.7, 0.0);
    let spark = 1.0 - smoothstep(0.1, 0.5, length(fract(sg) - vec2f(0.5)));
    c += core * step(0.965, portalHash(floor(sg))) * spark * 1.2;
    let inside = 1.0 - smoothstep(-0.03, 0.02, sd);
    // crackling rim along the edge
    let crackle = 0.6 + 0.8 * portalValue(p * 7.0 + vec2f(time * 3.0, -time * 2.0));
    let e = min(uv, 1.0 - uv);
    let rim = (exp(-abs(sd) * 30.0) * crackle + exp(-abs(sd) * 8.0) * 0.25) * smoothstep(0.0, 0.06, min(e.x, e.y));
    c = c * inside + mix(b, core, 0.55) * rim;
    return vec4f(c * power * 2.3, clamp(inside * 0.94 + rim, 0.0, 1.0));
  }`, [hash, value, fbm]);
  const material = new gpu.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const shown = membrane({ uv: uv(), ...uniformNodes(uniforms) });
  // (seeThroughFade's uniforms, bound before the membrane's material was made: props.ts)
  const see = uniforms as unknown as Record<string, { value: unknown }>;
  material.fragmentNode = see.uSeeK ? shown.mul(tsl.vec4(1, 1, 1, seeKept(seeUniforms(see)))) : shown;
  return material;
}

/** The light the portal spills across the floor in front of the gate, added. */
export function spillMaterial(uniforms: PortalUniforms): THREE.Material {
  const { wgslFn, uv } = tsl as any;
  const { hash, value } = portalNoise();
  const spill = wgslFn(`fn portalSpill(uv: vec2f, time: f32, power: f32, b: vec3f, core: vec3f) -> vec4f {
    let p = vec2f((uv.x - 0.5) * 1.6, uv.y);
    let g = exp(-dot(p, p) * 3.5) * (0.75 + 0.5 * portalValue(vec2f(uv.x * 5.0, uv.y * 3.0 - time * 0.8)));
    return vec4f(mix(b, core, 0.3) * g * power * 0.55, 1.0);
  }`, [hash, value]);
  const { time, power, b, core } = uniformNodes(uniforms);
  const material = new gpu.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  material.fragmentNode = spill({ uv: uv(), time, power, b, core });
  return material;
}
