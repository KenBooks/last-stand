// A fire's flames under the Rust engine: `world/fireNodes.ts`'s ray march, its WGSL as it is there (`flameWgsl`), in
// the engine's surface hook; the baked loop is the look's volume. (Not ported: the flames fading as the prop under
// them dissolves, and the embers' own look on the bed and the logs.)
import type * as THREE from 'three';
import { emberWgsl, flameWgsl, type EmberLooks, type FlameShape, type FlameUniforms } from '../../world/fireNodes';
import type { RustLook, RustShader } from '../custom';

/** the logs a fire's flames know at most, each two ends (`LOGS_MOST` in world/fire.ts) */
const LOG_ENDS = 16;
/** where the logs' ends begin in `m.c`, in vec4s */
const LOGS_AT = 8;

/** the flames' shader, made once: the march is the same for every fire */
let shader: RustShader | null = null;
function flameShader(shape: FlameShape): RustShader {
  shader ??= {
    name: 'fire-flames',
    hooks: flameWgsl(shape) + /* wgsl */ `
fn vertex_hook(v: ptr<function, Vertex>, instance: u32) {}

fn surface_hook(s: ptr<function, Surface>, in: VertexOut) -> bool {
  let centre = m.c[0].xyz;
  let eye = g.cam_pos.xyz - centre;
  let dir = normalize(in.world - g.cam_pos.xyz);
  var logs = 1e9;
  for (var i = 0u; i < ${LOG_ENDS / 2}u; i++) {
    logs = min(logs, fireLog(eye, dir, m.c[${LOGS_AT}u + i * 2u], m.c[${LOGS_AT + 1}u + i * 2u]));
  }
  (*s).base = fireLight(in.world, g.cam_pos.xyz, centre, in.clip.xy, t_volume, samp_clamp, m.c[0].w, m.c[1].x,
    m.c[1].y, m.c[1].zw, m.c[2].x, m.c[3].xy, m.c[3].zw, m.c[4].xy, logs, m.c[2].y, m.c[2].z);
  (*s).fog = 0.0;
  return true;
}
`,
  };
  return shader;
}

/** A fire's flames' look, from its uniforms as `world/fire.ts` keeps them. */
export function flameLook(uniforms: FlameUniforms, shape: FlameShape): RustLook {
  return {
    shader: flameShader(shape),
    volume: () => uniforms.uFlames.value as THREE.Data3DTexture,
    numbers(out) {
      uniforms.uCentre.value.toArray(out, 0);
      out[3] = uniforms.uHeight.value * uniforms.uPuff.value;
      out[4] = uniforms.uBox.value.x; out[5] = uniforms.uFrame.value;
      out[6] = uniforms.uTurn.value.x; out[7] = uniforms.uTurn.value.y;
      out[8] = uniforms.uGlow.value; out[9] = uniforms.uStepShare.value; out[10] = uniforms.uLite.value;
      const [foot, belly, rim] = uniforms.uBowl.value;
      out[12] = foot.x; out[13] = foot.y; out[14] = belly.x; out[15] = belly.y;
      out[16] = rim.x; out[17] = rim.y;
      uniforms.uLogs.value.slice(0, LOG_ENDS).forEach((end, index) => end.toArray(out, (LOGS_AT + index) * 4));
    },
  };
}

/** how much of a standard material's sheen char keeps (world/fire.ts's `CHAR_SHEEN`) */
const CHAR_SHEEN = 0.2;

/** the embers' shader, made once */
let embers: RustShader | null = null;
function emberShader(): RustShader {
  embers ??= {
    name: 'fire-embers',
    hooks: emberWgsl() + /* wgsl */ `
fn vertex_hook(v: ptr<function, Vertex>, instance: u32) {}

fn surface_hook(s: ptr<function, Surface>, in: VertexOut) -> bool {
  let centre = m.c[0].xyz;
  let radius = m.c[0].w;
  let heat = m.c[1].x;
  (*s).base = vec4f((*s).base.rgb * emberChar(in.world, centre, radius, heat), (*s).base.a);
  (*s).emissive += emberGlow(in.world, normalize(in.normal).y, m.c[1].y, centre, radius, heat);
  // (char is matte)
  (*s).specular = ${CHAR_SHEEN};
  return true;
}
`,
  };
  return embers;
}

/** A fire's bed and its charred logs: darkened to char and ash, glowing through their cracks. */
export const emberLook = (looks: EmberLooks): RustLook => ({
  shader: emberShader(),
  numbers(out) {
    looks.centre.value.toArray(out, 0);
    out[3] = looks.radius.value; out[4] = looks.heat.value; out[5] = looks.time.value;
  },
});
