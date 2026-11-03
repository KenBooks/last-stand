// The crypt's floor and what stands beyond its wall on WebGPU (core/webgpu.ts): crypt.ts's GLSL hooks as TSL nodes,
// set on its plain materials (three copies them onto the node material it makes of each). The cobbles' damp, drift
// and moss and the earth round the small dead trees' feet (`dampGround`), and the world past the wall darkened in the
// top-down view (`dimOutside`); the cobbles' relief is core/parallax.ts's `reliefContext`. The dimming comes after the
// fog here, before it in the GLSL.
import type * as THREE from 'three';
import { tsl } from '../core/webgpu';

// (untyped: TSL's types don't follow its conversions across these calls yet)
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

/** How far past the wall the dimming starts and is full (m from the middle), and how much it takes. */
export interface Outside { from: number; to: number; most: number }

/** The material's output darkened past the wall by `amount` (a `{ value }` eased 0 to 1, read each render). */
export function outsideOutputNode(amount: { value: number }, { from, to, most }: Outside): N {
  const { output, positionWorld, smoothstep, uniform, vec4 } = tsl as any;
  const eased = uniform(0).onRenderUpdate(() => amount.value);
  const dim = eased.mul(most).mul(smoothstep(from, to, positionWorld.xz.length())).oneMinus();
  return vec4(output.rgb.mul(dim), output.a);
}

/** What `dampGround` lays over the cobbles: its baked damp map and its tile (m), the earth's spots (x, z, reach) and
 *  look, and the soil's maps. */
export interface Damp {
  map: THREE.Texture;
  span: number;
  earth: THREE.Vector3[];
  ragged: number;
  stones: number;
  washed: readonly number[];
  tile: number;
  soil: { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture };
}

/** The cobbles' colour, roughness and normal with the damp, the moss by the wall and the earth round the trees laid
 *  over them, as `dampGround` lays them (one set of nodes, shared by them all). */
export function dampNodes(cobbles: THREE.MeshStandardMaterial, damp: Damp): { color: N; roughness: N; normal: N } {
  const {
    Fn, Loop, cameraViewMatrix, clamp, float, materialColor, materialNormal, materialRoughness, max, min, mix,
    positionWorld, smoothstep, texture, uniformArray, uv, vec2, vec3, vec4,
  } = tsl as any;
  const xz = positionWorld.xz;
  const sample = texture(damp.map, xz.mul(1 / damp.span)).rgb;
  const heightMap = cobbles.roughnessMap!;
  const spots = uniformArray(damp.earth, 'vec3');
  // (each spot's reach is its z: the earth's edge ragged by the damp's own noise, cut round the cobbles' tops)
  const earth = Fn(() => {
    const stoneTop = texture(heightMap, uv().mul(vec2(heightMap.repeat.x, heightMap.repeat.y))).r;
    const amount = float(0).toVar();
    const inward = float(1).toVar();
    Loop(damp.earth.length, ({ i }: { i: N }) => {
      const spot = spots.element(i);
      const reach = spot.z;
      const away = xz.sub(spot.xy).length().add(sample.g.sub(0.5).mul(reach).mul(damp.ragged));
      const edge = away.sub(reach).sub(float(0.5).sub(stoneTop).mul(damp.stones));
      amount.assign(max(amount, smoothstep(-damp.washed[0], damp.washed[1], edge).oneMinus()));
      inward.assign(min(inward, away.div(max(reach, 1e-3))));
    });
    return vec2(amount, inward);
  })();
  const earthAmount = earth.x;
  const soilAt = xz.mul(1 / damp.tile);
  const color = Fn(() => {
    let shade = materialColor.rgb.mul(sample.g.mul(0.36).add(0.82));
    shade = mix(shade, shade.mul(vec3(0.5, 0.55, 0.68)), sample.r);
    // moss creeping in from the wall
    const moss = smoothstep(22, 28, xz.length()).mul(sample.b);
    shade = mix(shade, vec3(0.05, 0.075, 0.035), moss.mul(0.7));
    // bare soil, darker in towards the trunk
    const soil = texture(damp.soil.map, soilAt).rgb.mul(clamp(earth.y, 0, 1).mul(0.25).add(0.75));
    return vec4(mix(shade, soil, earthAmount), materialColor.a);
  })();
  const wet = sample.r.mul(earthAmount.oneMinus());
  const roughness = mix(mix(materialRoughness, 0.42, wet), texture(damp.soil.roughnessMap, soilAt).g, earthAmount);
  // the soil's own relief, its tangent space the floor's (u along x, v along z, up its normal), in view space
  const soilNormal = texture(damp.soil.normalMap, soilAt).xyz.mul(2).sub(1);
  const soilUp = cameraViewMatrix.mul(vec4(soilNormal.x, soilNormal.z, soilNormal.y.negate(), 0)).xyz.normalize();
  const normal = mix(materialNormal, soilUp, earthAmount).normalize();
  return { color, roughness, normal };
}
