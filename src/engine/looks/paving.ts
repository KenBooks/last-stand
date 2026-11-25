// The village's paving under the Rust engine: `unrepeatedNodes` (world/villageNodes.ts) as WGSL for the engine's
// surface hook, written line for line. Every map is read twice, shifted by one of six offsets and the next as a slow
// noise over the world picks them, and blended over a narrow band; broad patches of shade and stain lie over it.
// With the maps read as they repeat, the square's stones came round every metre and a half in rows (from play, "too
// obvious texture pieces (tiling is visible)", #819).
import { rustShader, type RustLook, type RustShader } from '../custom';
import { noiseTable, noiseWgsl } from './noiseTable';

const PAVING: RustShader = rustShader({
  name: 'paving-unrepeated',
  hooks: /* wgsl */ `
${noiseWgsl('ground_noise', 't_extra0')}
// (the table's red: the paving's hash, noiseTable.ts)
fn pave_noise(p: vec2f) -> f32 { return ground_noise_r(p); }

fn vertex_hook(v: ptr<function, Vertex>, instance: u32) {}

fn surface_hook(s: ptr<function, Surface>, in: VertexOut) -> bool {
  let xz = in.world.xz;
  let pick = pave_noise(xz * 0.12) * 6.0;
  let k = floor(pick);
  let a = sin(vec2f(3.0, 7.0) * k);
  let b = sin(vec2f(3.0, 7.0) * (k + 1.0));
  let between = smoothstep(0.35, 0.65, fract(pick));
  let dx = dpdx(in.uv);
  let dy = dpdy(in.uv);
  let stone = mix(textureSampleGrad(t_base, samp, in.uv + a, dx, dy), textureSampleGrad(t_base, samp, in.uv + b, dx, dy), between);
  let broad = pave_noise(xz * 0.11) * 0.55 + pave_noise(xz * 0.37 + 4.0) * 0.3 + pave_noise(xz * 1.3 + 9.0) * 0.15;
  let stained = smoothstep(0.55, 0.85, pave_noise(xz * 0.21 + 17.0));
  let shaded = stone.rgb * m.base.rgb * in.color.rgb * mix(0.72, 1.18, broad);
  (*s).base = vec4f(mix(shaded, shaded * vec3f(0.78, 0.74, 0.66), stained * 0.6), (*s).base.a);
  // (the plain levels read no surface map, as the engine's own reads: Low and Very low)
  if (g.shelter_lit.z > 1.5) { return true; }
  if (m.flags.w % 2.0 > 0.5) {
    let rough = mix(textureSampleGrad(t_orm, samp, in.uv + a, dx, dy), textureSampleGrad(t_orm, samp, in.uv + b, dx, dy), between);
    (*s).roughness = m.params.x * rough.g;
  }
  if (m.flags.z > 0.5) {
    let bent = mix(textureSampleGrad(t_normal, samp, in.uv + a, dx, dy), textureSampleGrad(t_normal, samp, in.uv + b, dx, dy), between);
    (*s).normal = mapped_normal(normalize(in.normal), in.world, in.uv, bent.xyz);
  }
  return true;
}
`,
});

/** The paving's look: its maps read unrepeated, its vertices where its mesh has them. */
export const pavingLook = (): RustLook => ({ shader: PAVING, maps: [noiseTable()], casts: true, numbers() {} });
