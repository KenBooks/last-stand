// A hand's looks on WebGPU (core/webgpu.ts), where the GLSL patches of models/dualQuaternion.ts and models/triplanar.ts
// are WebGL's alone: its bones blended as dual quaternions, and its maps read flat along each axis of the space it was
// sculpted in. Given the node material three converts its copy to (`OwnLooks` in core/shaderPorts.ts).
import * as THREE from 'three';
import { tsl } from '../../core/webgpu';

// (untyped: TSL's types don't follow its conversions across these calls yet)
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

/** how sharply the planes give way to one another, as models/triplanar.ts has it */
const SHARPNESS = 4;

/** A rotation's quaternion, from the largest of its diagonal's terms (`dqsTurn` in models/dualQuaternion.ts). */
const DQS_TURN = /* wgsl */ `
fn dqsTurn(m: mat3x3f) -> vec4f {
  let trace = m[0][0] + m[1][1] + m[2][2];
  if (trace > 0.0) {
    let s = sqrt(trace + 1.0) * 2.0;
    return vec4f(m[1][2] - m[2][1], m[2][0] - m[0][2], m[0][1] - m[1][0], 0.25 * s * s) / s;
  }
  if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
    let s = sqrt(1.0 + m[0][0] - m[1][1] - m[2][2]) * 2.0;
    return vec4f(0.25 * s * s, m[1][0] + m[0][1], m[2][0] + m[0][2], m[1][2] - m[2][1]) / s;
  }
  if (m[1][1] > m[2][2]) {
    let s = sqrt(1.0 + m[1][1] - m[0][0] - m[2][2]) * 2.0;
    return vec4f(m[1][0] + m[0][1], 0.25 * s * s, m[2][1] + m[1][2], m[2][0] - m[0][2]) / s;
  }
  let s = sqrt(1.0 + m[2][2] - m[0][0] - m[1][1]) * 2.0;
  return vec4f(m[2][0] + m[0][2], m[2][1] + m[1][2], 0.25 * s * s, m[0][1] - m[1][0]) / s;
}
`;

const DQS_PRODUCT = /* wgsl */ `
fn dqsProduct(a: vec4f, b: vec4f) -> vec4f {
  return vec4f(a.w * b.xyz + b.w * a.xyz + cross(a.xyz, b.xyz), a.w * b.w - dot(a.xyz, b.xyz));
}
`;

const DQS_TURN_OF = /* wgsl */ `
fn dqsTurnOf(m: mat4x4f, s: f32) -> vec4f {
  return dqsTurn(mat3x3f(m[0].xyz / s, m[1].xyz / s, m[2].xyz / s));
}
`;

/** Four bones' matrices blended by their weights as dual quaternions, as one matrix (`dqsBlend` there). */
const DQS_BLEND = /* wgsl */ `
fn dqsBlend(a: mat4x4f, b: mat4x4f, c: mat4x4f, d: mat4x4f, w: vec4f) -> mat4x4f {
  var bones = array<mat4x4f, 4>(a, b, c, d);
  let pivot = dqsTurnOf(a, length(a[0].xyz));
  var real = vec4f(0.0);
  var dual = vec4f(0.0);
  var scale = 0.0;
  for (var i = 0; i < 4; i++) {
    let s = length(bones[i][0].xyz);
    let turn = dqsTurnOf(bones[i], s);
    let side = select(w[i], -w[i], dot(turn, pivot) < 0.0);
    real += turn * side;
    dual += 0.5 * dqsProduct(vec4f(bones[i][3].xyz, 0.0), turn) * side;
    scale += s * w[i];
  }
  let size = length(real);
  real /= size;
  dual /= size;
  scale /= w.x + w.y + w.z + w.w;
  let move3 = 2.0 * (real.w * dual.xyz - dual.w * real.xyz + cross(real.xyz, dual.xyz));
  let x = real.x;
  let y = real.y;
  let z = real.z;
  let r = real.w;
  let across = vec3f(1.0 - 2.0 * (y * y + z * z), 2.0 * (x * y + r * z), 2.0 * (x * z - r * y)) * scale;
  let up = vec3f(2.0 * (x * y - r * z), 1.0 - 2.0 * (x * x + z * z), 2.0 * (y * z + r * x)) * scale;
  let toward = vec3f(2.0 * (x * z + r * y), 2.0 * (y * z - r * x), 1.0 - 2.0 * (x * x + y * y)) * scale;
  return mat4x4f(vec4f(across, 0.0), vec4f(up, 0.0), vec4f(toward, 0.0), vec4f(move3, 1.0));
}
`;

/** A map's normal `mapped` (-1..1) on the surface at `view`, its tangents found from how `along` changes across the
 *  screen, as three finds them for a surface without tangents of its own. */
const FRAMED_NORMAL = /* wgsl */ `
fn framedNormal(view: vec3f, n: vec3f, along: vec2f, mapped: vec3f) -> vec3f {
  let q0 = dpdx(view);
  let q1 = dpdy(view);
  let st0 = dpdx(along);
  let st1 = dpdy(along);
  let q1Across = cross(q1, n);
  let q0Across = cross(n, q0);
  let t = q1Across * st0.x + q0Across * st1.x;
  let b = q1Across * st0.y + q0Across * st1.y;
  let most = max(dot(t, t), dot(b, b));
  let s = select(1.0 / sqrt(most), 0.0, most == 0.0);
  return t * s * mapped.x + b * s * mapped.y + n * mapped.z;
}
`;

let blend: N = null;
let framed: N = null;

/** `node`'s position, and its normal on the way, from its bones blended as dual quaternions: over three's own skinning,
 *  from the geometry as it was sculpted. */
function dualQuaternionNodes(node: N): void {
  const {
    Fn, attribute, reference, referenceBuffer, wgslFn, uint, vec4, mat3, normalLocal, normalGeometry, positionGeometry,
  } = tsl as any;
  blend ??= wgslFn(DQS_BLEND, [wgslFn(DQS_TURN_OF, [wgslFn(DQS_TURN)]), wgslFn(DQS_PRODUCT)]);
  node.positionNode = Fn((builder: N) => {
    const count = builder.object.skeleton.bones.length;
    const bones = referenceBuffer('skeleton.boneMatrices', 'mat4', count);
    const index = attribute('skinIndex', 'vec4');
    const bone = (i: N): N => bones.element(uint(i));
    const blended = blend({ a: bone(index.x), b: bone(index.y), c: bone(index.z), d: bone(index.w),
      w: attribute('skinWeight', 'vec4') });
    const skin = reference('bindMatrixInverse', 'mat4').mul(blended).mul(reference('bindMatrix', 'mat4')).toVar();
    normalLocal.assign(mat3(skin).mul(normalGeometry));
    return skin.mul(vec4(positionGeometry, 1)).xyz;
  })();
}

/** `node`'s colour, normal and roughness maps read triplanar, a tile each `tile` (m), its own maps let go (the sculpt
 *  has no places on them to read them by). */
function triplanarNodes(node: N, tile: number): void {
  const {
    abs, float, materialRoughness, normalGeometry, normalize, normalViewGeometry, positionGeometry, positionView, pow,
    texture, varying, vec3, vec4, wgslFn,
  } = tsl as any;
  framed ??= wgslFn(FRAMED_NORMAL);
  const place = varying(positionGeometry).div(tile);
  const raised = pow(abs(normalize(varying(normalGeometry))), vec3(SHARPNESS));
  const shares = raised.div(raised.x.add(raised.y).add(raised.z)).toVar();
  const planes = [place.zy, place.xz, place.xy];
  const each = (read: (along: N) => N): N =>
    read(planes[0]).mul(shares.x).add(read(planes[1]).mul(shares.y)).add(read(planes[2]).mul(shares.z));
  const { map, normalMap, normalScale, roughnessMap } = node as THREE.MeshStandardMaterial;
  if (map) {
    const shown = each((along) => texture(map, along));
    node.colorNode = vec4(vec4(node.colorNode).rgb.mul(shown.rgb), vec4(node.colorNode).a.mul(shown.a));
  }
  if (normalMap) {
    const lie = vec3(normalScale.x, normalScale.y, 1);
    node.normalNode = normalize(each((along) => framed({
      view: positionView, n: normalViewGeometry, along, mapped: texture(normalMap, along).xyz.mul(2).sub(1).mul(lie),
    })));
  }
  if (roughnessMap) {
    node.roughnessNode = materialRoughness.mul(float(each((along) => texture(roughnessMap, along).g)));
  }
  node.map = null;
  node.normalMap = null;
  node.roughnessMap = null;
  node.metalnessMap = null;
}

/** What a hand's copy of a material gives the node material three converts it to (`webgpuLooks`). */
export function handNodes(tile: number): (node: N) => void {
  return (node) => {
    dualQuaternionNodes(node);
    triplanarNodes(node, tile);
  };
}
