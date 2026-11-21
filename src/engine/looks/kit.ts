// A kit material's looks under the Rust engine (`core/shaderPorts.ts` `kitNodes`, the foes' and the heroes'): the
// dissolve (its pixels dropped by the noise, an edge glowing round the hole), frost and char over its colour, its
// glow dimmed near the camera, a rim of light at glancing angles, the char's embers and a hit's flash. Found on a
// material by its `kitLooks`, and shared by what it holds, so a kind's bodies still batch. (Not ported: a painted
// face's hair in another colour, a worn item's glow, the hood's shade and the shine's cap.)
import type * as THREE from 'three';
import { NEAR_GLOW, type KitLooks } from '../../core/materials';
import { rustLook, type RustLook, type RustShader } from '../custom';

/** how many of the look's numbers tell two materials apart */
const NUMBERS = 16;

const KIT: RustShader = {
  name: 'kit',
  hooks: /* wgsl */ `
fn kit_hash(start: vec3f) -> f32 {
  var p = fract(start * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
fn kit_noise3(x: vec3f) -> f32 {
  let i = floor(x);
  var f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(kit_hash(i), kit_hash(i + vec3f(1.0, 0.0, 0.0)), f.x),
      mix(kit_hash(i + vec3f(0.0, 1.0, 0.0)), kit_hash(i + vec3f(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(kit_hash(i + vec3f(0.0, 0.0, 1.0)), kit_hash(i + vec3f(1.0, 0.0, 1.0)), f.x),
      mix(kit_hash(i + vec3f(0.0, 1.0, 1.0)), kit_hash(i + vec3f(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}

fn vertex_hook(v: ptr<function, Vertex>, instance: u32) {
  // (the noise stays on the body as it bends: read where each point is at rest)
  (*v).c0 = vec4f((*v).rest, 0.0);
}

fn surface_hook(s: ptr<function, Surface>, in: VertexOut) -> bool {
  let dissolve = m.c[0].x;
  let frozen = m.c[0].y;
  let char = m.c[0].z;
  let hit = m.c[0].w;
  let at = in.c0.xyz;
  var dn = 0.0;
  if (max(dissolve, char) > 0.0) { dn = kit_noise3(at * 7.0) * 0.65 + kit_noise3(at * 19.0) * 0.35; }
  if (dissolve > 0.0 && dn < dissolve) { return false; }
  let frost = mix((*s).base.rgb, vec3f(0.55, 0.8, 1.0), frozen * 0.75);
  (*s).base = vec4f(mix(frost, vec3f(0.045, 0.035, 0.03), char * 0.9), (*s).base.a);
  var edge = 0.0;
  if (dissolve > 0.0) { edge = 1.0 - smoothstep(dissolve, dissolve + 0.09, dn); }
  let facing = clamp(dot((*s).normal, normalize(g.cam_pos.xyz - in.world)), 0.0, 1.0);
  let near = clamp(pow(in.depth / ${NEAR_GLOW.ref.toFixed(1)}, ${NEAR_GLOW.pow.toFixed(2)}), ${NEAR_GLOW.min.toFixed(2)}, 1.0);
  (*s).emissive = ((*s).emissive * mix(1.0, near, m.c[1].x) + m.c[2].rgb * pow(1.0 - facing, 3.0) + m.c[3].rgb * edge * 3.0
      + vec3f(0.25, 0.55, 0.9) * frozen * 0.35) * (1.0 - 0.7 * char)
    + vec3f(1.0, 0.32, 0.06) * char * smoothstep(0.6, 0.78, dn) * 1.6 * near
    + vec3f(1.0, 0.9, 0.85) * hit * 0.45 * near;
  return true;
}
`,
};

function kitLook(kit: KitLooks, material: THREE.MeshStandardMaterial): RustLook {
  // (what the material showed by when it was last described: the kit's numbers, and what the game changes on a
  // foe's material itself)
  const was = new Float64Array(18).fill(NaN);
  const now = new Float64Array(18);
  return {
    shader: KIT,
    casts: true,
    shared: NUMBERS,
    moved() {
      const u = kit.u, edge = u.uEdge.value;
      now[0] = u.uDissolve.value; now[1] = u.uFrozen.value; now[2] = u.uChar.value; now[3] = u.uHit.value;
      now[4] = edge.r; now[5] = edge.g; now[6] = edge.b;
      now[7] = material.emissiveIntensity; now[8] = material.opacity; now[9] = material.version;
      now[10] = (material.transparent ? 1 : 0) + (material.depthWrite ? 2 : 0) + (material.visible ? 4 : 0);
      now[11] = kit.near.value;
      const tint = material.color, glow = material.emissive;
      now[12] = tint.r; now[13] = tint.g; now[14] = tint.b; now[15] = glow.r; now[16] = glow.g; now[17] = glow.b;
      let moved = false;
      for (let at = 0; at < 18; at++) {
        if (now[at] !== was[at]) { was[at] = now[at]; moved = true; }
      }
      return moved;
    },
    numbers(out) {
      const u = kit.u;
      out[0] = u.uDissolve.value; out[1] = u.uFrozen.value; out[2] = u.uChar.value; out[3] = u.uHit.value;
      out[4] = kit.near.value;
      kit.rim.value.toArray(out, 8);
      u.uEdge.value.toArray(out, 12);
    },
  };
}

/** A kit material's look, made the first time it's asked for; none for a material that isn't a kit's. */
export function kitLookOf(material: THREE.Material): RustLook | undefined {
  const kit = (material as { kitLooks?: KitLooks }).kitLooks;
  if (!kit) return undefined;
  const look = kitLook(kit, material as THREE.MeshStandardMaterial);
  rustLook(material, look);
  return look;
}
