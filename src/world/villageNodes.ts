// The village's paving and its fountain on WebGPU (core/webgpu.ts): the GLSL hooks of `unrepeated` in village.ts and of
// fountain.ts as TSL nodes, written line for line. What's a plain property of the material is set on it (three copies
// it onto the node material it makes, and the GPU-driven drawing takes it from there too); what reaches into three's
// lighting model is a look of the converted material (`webgpuLooks`, core/shaderPorts.ts).
import type * as THREE from 'three';
import { tsl } from '../core/webgpu';

// (untyped: TSL's types don't follow its conversions across these calls yet)
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

/** A `{ value }` read once a render. */
function onceARender(of: { value: number }): N {
  const { renderGroup, uniform } = tsl as any;
  return uniform(of.value).setGroup(renderGroup).onRenderUpdate(() => of.value);
}

/** the paving's value noise, made once */
let paveNoise: N = null;
function paveNoiseOf(p: N): N {
  const { wgslFn } = tsl as any;
  if (!paveNoise) {
    const hash = wgslFn('fn paveH(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }');
    paveNoise = wgslFn(`fn paveN(p: vec2f) -> f32 {
      let i = floor(p);
      var f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(paveH(i), paveH(i + vec2f(1.0, 0.0)), f.x), mix(paveH(i + vec2f(0.0, 1.0)), paveH(i + vec2f(1.0, 1.0)), f.x), f.y);
    }`, [hash]);
  }
  return paveNoise({ p });
}

/** `m`, a paving's, as `unrepeated` shades it: every map read twice at two offsets a slow noise over the world picks,
 *  blended over a narrow band, and broad patches of shade and stain over it. */
export function unrepeatedNodes(m: THREE.MeshStandardMaterial): void {
  const {
    color, dFdx, dFdy, float, floor, fract, mix, normalMap, positionWorld, sin, smoothstep, texture, uniform, uv, vec2, vec4,
  } = tsl as any;
  const xz = positionWorld.xz;
  const pick = paveNoiseOf(xz.mul(0.12)).mul(6);
  const k = floor(pick);
  const shiftOf = (at: N): N => sin(vec2(3, 7).mul(at));
  const a = shiftOf(k);
  const b = shiftOf(k.add(1));
  const between = smoothstep(0.35, 0.65, fract(pick));
  const read = (map: THREE.Texture): N => {
    const at = uv().mul(vec2(map.repeat.x, map.repeat.y));
    const dx = dFdx(at);
    const dy = dFdy(at);
    return mix(texture(map, at.add(a)).grad(dx, dy), texture(map, at.add(b)).grad(dx, dy), between);
  };
  const broad = paveNoiseOf(xz.mul(0.11)).mul(0.55)
    .add(paveNoiseOf(xz.mul(0.37).add(4)).mul(0.3))
    .add(paveNoiseOf(xz.mul(1.3).add(9)).mul(0.15));
  const stained = smoothstep(0.55, 0.85, paveNoiseOf(xz.mul(0.21).add(17)));
  const stone = read(m.map!).rgb.mul(color(m.color)).mul(mix(0.72, 1.18, broad));
  const tint = (tsl as any).vec3(0.78, 0.74, 0.66);
  const nodes = m as N;
  nodes.colorNode = vec4(mix(stone, stone.mul(tint), stained.mul(0.6)), 1);
  nodes.roughnessNode = read(m.roughnessMap!).g.mul(float(m.roughness));
  nodes.normalNode = normalMap(read(m.normalMap!).xyz, uniform(m.normalScale));
}

/** The light a material takes from the environment scaled by `sky`, as `mirroredSky` scales it (the environment is the
 *  day's, whatever the hour). */
function skyMirrored(converted: N, sky: N): void {
  const setupLightingModel = converted.setupLightingModel.bind(converted);
  converted.setupLightingModel = (builder: N) => {
    const model = setupLightingModel(builder);
    const indirect = model.indirect.bind(model);
    model.indirect = (building: N) => {
      const { radiance, iblIrradiance } = building.context;
      radiance?.mulAssign(sky);
      iblIrradiance?.mulAssign(sky);
      indirect(building);
    };
    return model;
  };
}

/** Falling water's look: what it takes of the sky by the hour. */
export function fallingNodes(converted: N, sky: { value: number }): void {
  skyMirrored(converted, onceARender(sky));
}

/** What the lights round the water do to it: rougher for them, a share of their highlights, and each glint held just
 *  under the bloom's threshold (`WATER_LIT_ROUGH`, `WATER_LIT_SHINE`, `GLINT_MOST` in fountain.ts). */
export interface WaterLit { rough: number; shine: number; glintMost: number }

/** The water's look on the node material three converts it to: as lit (`WaterLit`), and what it takes of the sky. */
export function waterLooks(converted: N, sky: { value: number }, lit: WaterLit): void {
  const { max, min, mix, roughness, smoothstep, specularColor, specularColorBlended, specularF90, vec3 } = tsl as any;
  const skyNow = onceARender(sky);
  skyMirrored(converted, skyNow);
  const setupLightingModel = converted.setupLightingModel.bind(converted);
  converted.setupLightingModel = (builder: N) => {
    const model = setupLightingModel(builder);
    const direct = model.direct.bind(model);
    model.direct = (light: N, building: N) => {
      const held = [roughness, specularColor, specularColorBlended, specularF90].map((own: N) => own.toVar());
      roughness.assign(max(held[0], lit.rough));
      specularColor.mulAssign(lit.shine);
      specularColorBlended.mulAssign(lit.shine);
      specularF90.mulAssign(lit.shine);
      direct(light, building);
      roughness.assign(held[0]);
      specularColor.assign(held[1]);
      specularColorBlended.assign(held[2]);
      specularF90.assign(held[3]);
    };
    const finish = model.finish.bind(model);
    model.finish = (state: N) => {
      const { outgoingLight, reflectedLight } = state.context;
      const highlight = reflectedLight.directSpecular;
      const capped = min(highlight, vec3(lit.glintMost));
      outgoingLight.assign(outgoingLight.sub(highlight).add(capped));
      finish(state);
    };
    return model;
  };
}

/** The water's normal bent by rings out from its middle, two slow swells and fine wavelets crossing three ways, on
 *  `time`, and its opacity by how it faces the eye, set on `m`. */
export function waterNodes(m: THREE.MeshStandardMaterial, time: { value: number }): void {
  const {
    Fn, cameraViewMatrix, clamp, cos, dot, exp, length, mix, modelWorldMatrix, normalViewGeometry, normalize,
    positionViewDirection, positionWorld, pow, sin, vec2, vec4,
  } = tsl as any;
  const t = onceARender(time);
  const nodes = m as N;
  const normal = Fn(() => {
    const ripple = positionWorld.xz.sub(modelWorldMatrix.element(3).xz).toVar();
    const away = length(ripple).add(1e-4).toVar();
    const rings = cos(away.mul(11).sub(t.mul(4))).mul(0.16).mul(exp(away.mul(-0.35)));
    let slope = ripple.div(away).mul(rings);
    slope = slope.add(vec2(sin(ripple.y.mul(2.3).add(t.mul(0.9))), cos(ripple.x.mul(1.9).sub(t.mul(0.7)))).mul(0.05));
    for (let w = 0; w < 3; w++) {
      const turn = w * 2.1 + 0.4;
      const way = vec2(Math.cos(turn), Math.sin(turn));
      slope = slope.add(way.mul(sin(dot(ripple, way).mul(17 + w * 6).add(t.mul(2.3 + w))).mul(0.08)));
    }
    return normalize(normalViewGeometry.add(cameraViewMatrix.mul(vec4(slope.x, 0, slope.y, 0)).xyz));
  })().toVar();
  nodes.normalNode = normal;
  const facing = clamp(dot(normal, positionViewDirection), 0, 1);
  nodes.opacityNode = mix(0.45, 0.92, pow(facing.oneMinus(), 3));
}

/** The basin's floor's light: the web of bright lines the water above focuses, drifting on `time`, by how much of the
 *  sky's light there is (`light`), set on `m` as its glow. */
export function causticNodes(m: THREE.MeshStandardMaterial, time: { value: number }, light: { value: number }): void {
  const { Fn, abs, cos, float, materialColor, positionGeometry, pow, sin, varying, vec2 } = tsl as any;
  const clock = onceARender(time);
  const lit = onceARender(light);
  const floorAt = varying(positionGeometry.xz);
  (m as N).emissiveNode = Fn(() => {
    let t = clock;
    let p = floorAt.mul(2.6);
    let web = float(0);
    for (let k = 0; k < 2; k++) {
      const q = p.add(vec2(sin(p.y.mul(1.3).add(t.mul(0.9))), cos(p.x.mul(1.1).sub(t.mul(0.7)))).mul(0.7)).toVar();
      const lines = abs(sin(q.x.mul(2.2).add(sin(q.y.mul(1.7).add(t)))).mul(sin(q.y.mul(2.4).add(sin(q.x.mul(1.5).sub(t.mul(0.8)))))));
      web = web.add(pow(lines.oneMinus(), 7));
      p = p.mul(1.6).add(vec2(1.7, 9.2));
      t = t.mul(1.3);
    }
    return materialColor.rgb.mul(web).mul(0.35).mul(lit);
  })();
}
