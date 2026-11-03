// The particle pools on WebGPU (core/webgpu.ts), which draws points a pixel wide: each particle an instanced quad
// (three's sprite path of `PointsNodeMaterial`), sized, faded and dimmed as particles.ts's GLSL does it.
import * as THREE from 'three';
import { NEAR_GLOW } from '../core/materials';
import { gpu, tsl } from '../core/webgpu';

/** A pool's mesh on WebGPU and its scale (particles.ts's `uScale`: a size in metres to pixels at 1 m). */
export interface ParticleQuads { mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.Material>; scale: { value: number } }

/** A quad a particle over `centers`, `colors` and `sizes` (instanced attributes), blended by `blending`. */
/** The dazed stars on WebGPU (fx/dazed.ts's points as instanced quads), and what each frame sets: how many, and the
 *  scale their sizes are drawn at. */
export interface StarQuads {
  mesh: THREE.Mesh;
  geo: THREE.InstancedBufferGeometry;
  scale: { value: number };
}

/** The stars at `centers`, `sizes` across and `alphas` seen, in `fill` with a `rim`: dazed.ts's shaders as nodes. */
export function starQuads([centers, sizes, alphas]: THREE.InstancedBufferAttribute[], fill: THREE.Color,
  rim: THREE.Color): StarQuads {
  // (untyped: TSL's types don't follow these conversions yet)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { attribute, uniform, varying, uv, positionView, screenDPR, smoothstep, wgslFn } = tsl as any;
  const geo = quadGeometry();
  geo.setAttribute('aCenter', centers);
  geo.setAttribute('aSize', sizes);
  geo.setAttribute('aAlpha', alphas);
  const scale = uniform(400);
  const material = new gpu.PointsNodeMaterial({ transparent: true, depthWrite: false });
  material.sizeAttenuation = false;
  const node = material as unknown as Record<'positionNode' | 'sizeNode' | 'colorNode', unknown>;
  node.positionNode = attribute('aCenter', 'vec3');
  const depth = positionView.z.negate();
  node.sizeNode = attribute('aSize', 'float').mul(scale).div(depth).div(screenDPR);
  const starDist = wgslFn(`fn starDist(pIn: vec2f, r: f32, rf: f32) -> f32 {
    let k1 = vec2f(0.809016994375, -0.587785252292);
    let k2 = vec2f(-k1.x, k1.y);
    var p = pIn;
    p.x = abs(p.x);
    p -= 2.0 * max(dot(k1, p), 0.0) * k1;
    p -= 2.0 * max(dot(k2, p), 0.0) * k2;
    p.x = abs(p.x);
    p.y -= r;
    let ba = rf * vec2f(-k1.y, k1.x) - vec2f(0.0, 1.0);
    let h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
    return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
  }`);
  const star = wgslFn(`fn dazedStar(uv: vec2f, alpha: f32, fill: vec3f, rim: vec3f) -> vec4f {
    let d = starDist((uv - 0.5) * 2.0, 0.95, 0.45);
    let a = 1.0 - smoothstep(-0.06, 0.06, d);
    if (a <= 0.0) { discard; }
    return vec4f(mix(rim, fill, 1.0 - smoothstep(-0.3, -0.12, d)), alpha * a);
  }`, [starDist]);
  // (gone near the lens, as every particle)
  const seen = varying(attribute('aAlpha', 'float').mul(smoothstep(0.5, 3.5, depth)));
  node.colorNode = star({ uv: uv(), alpha: seen, fill: uniform(fill), rim: uniform(rim) });
  return { mesh: new THREE.Mesh(geo, material as unknown as THREE.Material), geo, scale };
}

/** A quad a particle, its instances none until a frame sets them (three's Infinity is a draw WebGPU refuses). */
function quadGeometry(): THREE.InstancedBufferGeometry {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
  geo.setIndex([0, 1, 2, 2, 1, 3]);
  geo.instanceCount = 0;
  return geo;
}

export function particleQuads(
  centers: THREE.InstancedBufferAttribute, colors: THREE.InstancedBufferAttribute, sizes: THREE.InstancedBufferAttribute,
  blending: THREE.Blending, soft: number,
): ParticleQuads {
  // (untyped: TSL's types don't follow these conversions yet)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { Fn, If, Discard, attribute, uniform, varying, vec4, uv, positionView, screenDPR, smoothstep, clamp, pow } = tsl as any;
  const geo = quadGeometry();
  geo.setAttribute('aCenter', centers);
  geo.setAttribute('aColor', colors);
  geo.setAttribute('aSize', sizes);
  const scale = uniform(400);
  const material = new gpu.PointsNodeMaterial({ transparent: true, depthWrite: false, blending });
  material.sizeAttenuation = false;
  const node = material as unknown as Record<'positionNode' | 'sizeNode' | 'colorNode', unknown>;
  node.positionNode = attribute('aCenter', 'vec3');
  const depth = positionView.z.negate();
  // (its diameter in the scene's pixels, as gl_PointSize had it; three multiplies the pixel ratio back in)
  node.sizeNode = attribute('aSize', 'float').mul(scale).div(depth).div(screenDPR);
  const color = attribute('aColor', 'vec4');
  // fade out near the lens (particles.ts), and an additive pool's glow dims with distance (`nearGlow`)
  const near = varying(smoothstep(0.5, 3.5, depth));
  const glow = blending === THREE.AdditiveBlending
    ? varying(clamp(pow(depth.div(NEAR_GLOW.ref), NEAR_GLOW.pow), NEAR_GLOW.min, 1)) : 1;
  const c = varying(color);
  node.colorNode = Fn(() => {
    const d = uv().sub(0.5).length().mul(2).toVar();
    If(d.greaterThan(1), () => { Discard(); });
    return vec4(c.rgb.mul(glow), c.a.mul(near).mul(pow(d.oneMinus(), soft)));
  })();
  const mesh = new THREE.Mesh(geo, material as unknown as THREE.Material);
  return { mesh, scale };
}
