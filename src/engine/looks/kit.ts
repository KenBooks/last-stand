// A kit material's looks under the Rust engine (`core/shaderPorts.ts` `kitNodes`, the foes' and the heroes'): the
// dissolve (its pixels dropped by the noise, an edge glowing round the hole), frost and char over its colour, its
// glow dimmed near the camera, a rim of light at glancing angles, the char's embers and a hit's flash. Found on a
// material by its `kitLooks`, and shared by what it holds, so a kind's bodies still batch; a painted face's hair in
// another colour, a worn item's glow in its rarity's colour, the hood's shade, the fur's sway
// (entities/models/furSway.ts), and a hand's maps read triplanar (entities/models/triplanar.ts). A held blade's highlights through the eyes are held to a most (`kit.u.uShine`).
import type * as THREE from 'three';
import { NEAR_GLOW, itemGlowUniforms, type KitLooks } from '../../core/materials';
import { rustLook, type RustLook, type RustShader } from '../custom';

/** how many of the look's numbers tell two materials apart (past them: the clocks, and the glow's shape) */
const NUMBERS = 32;
/** where the look's numbers are, in floats (`m.c`, four to a vec4) */
const AT = { shade: 16, aura: 20, hairTinted: 23, hair: 24, fur: 27, lag: 28, triplanar: 31, auraClock: 32, furTime: 33, shape: 36,
  loop: 40 };
/** the fur's sway on a material (entities/models/furSway.ts): its lag and its clock */
interface Fur { lag: { value: THREE.Vector3 }; time: { value: number } }

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

// a worn item's glow (core/shaderPorts.ts auraTendrils, line for line): tendrils of light on its surface, drifting
// up on a loop
fn aura_wrap(x: f32, per: f32) -> f32 { return x - per * floor(x / per); }
fn aura_hash(start: vec3f, per: f32) -> f32 { return kit_hash(vec3f(start.x, aura_wrap(start.y, per), start.z)); }
fn aura_noise3(x: vec3f, per: f32) -> f32 {
  let i = floor(x);
  var f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(aura_hash(i, per), aura_hash(i + vec3f(1.0, 0.0, 0.0), per), f.x),
      mix(aura_hash(i + vec3f(0.0, 1.0, 0.0), per), aura_hash(i + vec3f(1.0, 1.0, 0.0), per), f.x), f.y),
    mix(mix(aura_hash(i + vec3f(0.0, 0.0, 1.0), per), aura_hash(i + vec3f(1.0, 0.0, 1.0), per), f.x),
      mix(aura_hash(i + vec3f(0.0, 1.0, 1.0), per), aura_hash(i + vec3f(1.0, 1.0, 1.0), per), f.x), f.y), f.z);
}
fn aura_noise(p: vec3f, w: f32, per: vec2f) -> f32 {
  let s = floor(w);
  var f = fract(w);
  f = f * f * (3.0 - 2.0 * f);
  let s0 = aura_wrap(s, per.y);
  let s1 = aura_wrap(s + 1.0, per.y);
  let slice = vec3f(17.31, 7.0, 11.13);
  return mix(aura_noise3(p + slice * s0, per.x), aura_noise3(p + slice * s1, per.x), f);
}
fn aura_fbm(p: vec3f, w: f32, per: vec2f) -> f32 {
  return aura_noise(p, w, per) * 0.5 + aura_noise(p * 2.0 + 3.7, w * 2.0, per * 2.0) * 0.3
    + aura_noise(p * 4.0 + 9.1, w * 4.0, per * 4.0) * 0.2;
}
fn aura_warp(p: vec3f, w: f32, per: vec2f) -> f32 {
  return aura_noise(p, w, per) * 0.62 + aura_noise(p * 2.0 + 3.7, w * 2.0, per * 2.0) * 0.38;
}
fn aura_tendrils(at: vec3f, c: f32, shape: vec4f, looping: vec4f) -> f32 {
  let p = at * shape.xyx - vec3f(0.0, c * looping.x, 0.0);
  let w = c * looping.y;
  let per = looping.xy;
  let warped = vec2f(aura_warp(p * 0.5, w * 0.5, per * 0.5),
    aura_warp(p * 0.5 + vec3f(5.0, 1.0, 3.0), w * 0.5 + 1.0, per * 0.5));
  let tex = aura_fbm(p + vec3f(warped.x, warped.y, warped.x) * 2.2, w, per);
  let strand = smoothstep(0.0, 1.0, 1.0 - abs(tex - shape.z) / shape.w);
  return looping.z + strand * mix(0.4, 1.0, smoothstep(0.3, 0.5, warped.x));
}

fn vertex_hook(v: ptr<function, Vertex>, instance: u32) {
  // (the noise stays on the body as it bends: read where each point is at rest)
  (*v).c0 = vec4f((*v).rest, 0.0);
  (*v).c1 = vec4f((*v).rest_normal, 0.0);
  // (fur: a tuft lags the joint it rides and flutters, by the square of how far along it a point is, its uv's v)
  if (m.c[6].w > 0.5) {
    let along = (*v).uv.y / 3.0;
    let phase = dot((*v).position, vec3f(127.1, 311.7, 74.7));
    let time = m.c[8].y;
    let flutter = vec3f(sin(time * 5.1 + phase), sin(time * 4.3 + phase * 1.7) * 0.4, sin(time * 4.7 + phase * 0.6));
    (*v).position += (m.c[7].xyz + flutter * 0.0035) * along * along;
  }
}

fn surface_hook(s: ptr<function, Surface>, in: VertexOut) -> bool {
  // (read before anything is left out: the share of hair a painted face's roughness map's blue holds)
  let hair_share = textureSample(t_orm, samp, in.uv).b * 4.0;
  // (a sculpt with no unwrapping of its own, a hand: its colour, roughness and normal maps each read flat along
  // each axis of the space it was sculpted in, blended by how squarely it faced each there; m.c[7].w tiles a
  // metre, 0 for none)
  if (m.c[7].w > 0.0) {
    var share = pow(abs(normalize(in.c1.xyz)), vec3f(4.0));
    share = share / (share.x + share.y + share.z);
    let along_x = in.c0.zy * m.c[7].w;
    let along_y = in.c0.xz * m.c[7].w;
    let along_z = in.c0.xy * m.c[7].w;
    let tinted = textureSample(t_base, samp, along_x) * share.x + textureSample(t_base, samp, along_y) * share.y
      + textureSample(t_base, samp, along_z) * share.z;
    (*s).base = m.base * in.color * tinted;
    if (m.flags.w % 2.0 > 0.5) {
      (*s).roughness = m.params.x * (textureSample(t_orm, samp, along_x).g * share.x
        + textureSample(t_orm, samp, along_y).g * share.y + textureSample(t_orm, samp, along_z).g * share.z);
    }
    if (m.flags.z > 0.5) {
      var face = normalize(in.normal);
      if (dot(face, g.cam_pos.xyz - in.world) < 0.0) { face = -face; }
      (*s).normal = normalize(
        mapped_normal(face, in.world, along_x, textureSample(t_normal, samp, along_x).xyz) * share.x
        + mapped_normal(face, in.world, along_y, textureSample(t_normal, samp, along_y).xyz) * share.y
        + mapped_normal(face, in.world, along_z, textureSample(t_normal, samp, along_z).xyz) * share.z);
    }
  }
  let dissolve = m.c[0].x;
  let frozen = m.c[0].y;
  let char = m.c[0].z;
  let hit = m.c[0].w;
  let at = in.c0.xyz;
  var dn = 0.0;
  if (max(dissolve, char) > 0.0) { dn = kit_noise3(at * 7.0) * 0.65 + kit_noise3(at * 19.0) * 0.35; }
  if (dissolve > 0.0 && dn < dissolve) { return false; }
  // (a painted face's hair in another colour: the picked colour less the face's own, in the paint's sRGB, added
  // in the share of hair its roughness map's blue holds)
  if (m.c[5].w > 0.5) {
    let painted = pow(max((*s).base.rgb, vec3f(0.0)), vec3f(1.0 / 2.2)) + m.c[6].xyz * hair_share;
    (*s).base = vec4f(pow(max(painted, vec3f(0.0)), vec3f(2.2)), (*s).base.a);
  }
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
  // (the most a highlight on it gives: a blade held before the eyes)
  (*s).shine_most = m.c[1].y;
  // (a worn item's glow in its rarity's colour, black for none)
  let aura = m.c[5].xyz;
  if (aura.r + aura.g + aura.b > 0.0) {
    (*s).emissive += aura * m.c[10].w * aura_tendrils(at, m.c[8].x, m.c[9], m.c[10]);
  }
  // (in a hood's shade, all its light dimmed: x how deep, y where up the mesh it's full, z where it's gone, w how
  // much more aside)
  let shade = m.c[4];
  if (shade.x > 0.0) {
    (*s).shade *= 1.0 - shade.x * clamp(smoothstep(shade.z, shade.y, at.y) + shade.w * abs(at.x), 0.0, 1.0);
  }
  return true;
}
`,
};

function kitLook(kit: KitLooks, material: THREE.MeshStandardMaterial): RustLook {
  // (what the material showed by when it was last described: the kit's numbers, and what the game changes on a
  // foe's material itself)
  const was = new Float64Array(35).fill(NaN);
  const now = new Float64Array(35);
  // (a copy of a fur's material holds a copy of its numbers, which nothing moves: three copies `userData` as JSON)
  const fur = (): Fur | undefined => {
    const sway = material.userData.fur as Fur | undefined;
    return (sway?.lag?.value as { isVector3?: boolean } | undefined)?.isVector3 ? sway : undefined;
  };
  const glows = (): boolean => kit.aura.value.r + kit.aura.value.g + kit.aura.value.b > 0;
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
      kit.shade.value.toArray(now, 18);
      kit.aura.value.toArray(now, 22);
      kit.hair.value.toArray(now, 25);
      // (its clocks, while it has what they move: a glow, a fur's sway)
      now[28] = glows() ? itemGlowUniforms.clock.value : 0;
      const sway = fur();
      now[29] = sway ? sway.time.value : 0;
      if (sway) sway.lag.value.toArray(now, 30);
      now[33] = itemGlowUniforms.loop.value.w;
      now[34] = u.uShine.value;
      let moved = false;
      for (let at = 0; at < 35; at++) {
        if (now[at] !== was[at]) { was[at] = now[at]; moved = true; }
      }
      return moved;
    },
    numbers(out) {
      const u = kit.u;
      out[0] = u.uDissolve.value; out[1] = u.uFrozen.value; out[2] = u.uChar.value; out[3] = u.uHit.value;
      out[4] = kit.near.value;
      out[5] = u.uShine.value;
      kit.rim.value.toArray(out, 8);
      u.uEdge.value.toArray(out, 12);
      kit.shade.value.toArray(out, AT.shade);
      kit.aura.value.toArray(out, AT.aura);
      out[AT.hairTinted] = kit.hairTinted ? 1 : 0;
      kit.hair.value.toArray(out, AT.hair);
      const sway = fur();
      out[AT.fur] = sway ? 1 : 0;
      if (sway) sway.lag.value.toArray(out, AT.lag);
      else out.fill(0, AT.lag, AT.lag + 3);
      const tile = material.userData.triplanar as number | undefined;
      out[AT.triplanar] = tile ? 1 / tile : 0;
      out[AT.auraClock] = glows() ? itemGlowUniforms.clock.value : 0;
      out[AT.furTime] = sway ? sway.time.value : 0;
      itemGlowUniforms.shape.value.toArray(out, AT.shape);
      itemGlowUniforms.loop.value.toArray(out, AT.loop);
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
