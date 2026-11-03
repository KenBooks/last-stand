// A fire's flames on WebGPU (core/webgpu.ts): fire.ts's ray march as WGSL functions (`wgslFn`), written line for line
// from its GLSL, the node material's whole output as `gl_FragColor` was. The noise is read at its first level
// (`textureSampleLevel`): WGSL samples with gradients only where every pixel takes the same path, and the march stops
// early. The flames fade as the prop under them dissolves (`seeThroughFade`, core/shaderPorts.ts `seeKept`). The bed's
// and the logs' char and embers (`emberMat`) are its look's functions as WGSL, set on the lit material three converts
// it to (`emberNodes`).
import * as THREE from 'three';
import { gpu, tsl } from '../core/webgpu';
import { seeKept, seeUniforms } from '../core/shaderPorts';

// (untyped: TSL's types don't follow its conversions across these calls yet)
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

/** The flames' uniforms as fire.ts keeps them (each `{ value }`, read as each frame draws). */
export interface FlameUniforms {
  uNoise: { value: THREE.Data3DTexture };
  uCentre: { value: THREE.Vector3 };
  uBox: { value: THREE.Vector3 };
  uRadius: { value: number };
  uHeight: { value: number };
  uPuff: { value: number };
  uGlow: { value: number };
  uRise: { value: THREE.Vector2 };
  uSeed: { value: THREE.Vector3 };
  uBowl: { value: THREE.Vector2[] };
}

/** fire.ts's numbers the GLSL had written into it: the march's steps, the light and soot a metre, the body's
 *  half-width at foot and tip, its bend, and the noise's scales. */
export interface FlameShape {
  steps: number;
  glowPerMetre: number;
  sootPerMetre: number;
  foot: number;
  tip: number;
  tongueBend: number;
  bendFoot: number;
  noise: { across: number; up: number; fineAcross: number; fineUp: number };
}

/** An ember material's values as fire.ts keeps them (each `{ value }`): the embers' clock, the bed's middle, how far
 *  out it glows and how hot. */
export interface EmberLooks {
  time: { value: number };
  centre: { value: THREE.Vector3 };
  radius: { value: number };
  heat: { value: number };
}

/** how much of a standard material's sheen char keeps (fire.ts's `CHAR_SHEEN`) */
const CHAR_SHEEN = 0.2;

/** The char's and the embers' functions, fire.ts's `EMBER_COMMON` as WGSL (made once). */
let embers: { char: N; glow: N } | null = null;
function emberFns(): { char: N; glow: N } {
  const { wgslFn } = tsl as any;
  if (embers) return embers;
  const hash = wgslFn(`fn emberHash(p: vec2f) -> f32 {
    return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
  }`);
  const noise = wgslFn(`fn emberNoise(p: vec2f) -> f32 {
    let i = floor(p);
    var f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(emberHash(i), emberHash(i + vec2f(1.0, 0.0)), f.x),
      mix(emberHash(i + vec2f(0.0, 1.0)), emberHash(i + vec2f(1.0, 1.0)), f.x), f.y);
  }`, [hash]);
  const fbm = wgslFn(`fn emberFbm(start: vec2f) -> f32 {
    var p = start;
    var v = 0.0;
    var a = 0.5;
    for (var i = 0; i < 4; i++) {
      v += a * emberNoise(p);
      p = p * 2.03 + 17.1;
      a *= 0.5;
    }
    return v;
  }`, [noise]);
  const hash3 = wgslFn(`fn emberHash3(q: vec3f) -> vec3f {
    let p = vec3f(dot(q, vec3f(127.1, 311.7, 74.7)), dot(q, vec3f(269.5, 183.3, 246.1)),
      dot(q, vec3f(113.5, 271.9, 124.6)));
    return fract(sin(p) * 43758.5453);
  }`);
  // how far a point is from the edge between the nearest two cells (0 on it)
  const cellEdge = wgslFn(`fn emberCellEdge(p: vec3f) -> f32 {
    let i = floor(p);
    let f = fract(p);
    var nearest = 8.0;
    var next = 8.0;
    for (var z = -1; z <= 1; z++) {
      for (var y = -1; y <= 1; y++) {
        for (var x = -1; x <= 1; x++) {
          let cell = vec3f(f32(x), f32(y), f32(z));
          let d = length(cell + emberHash3(i + cell) - f);
          if (d < nearest) {
            next = nearest;
            nearest = d;
          } else if (d < next) {
            next = d;
          }
        }
      }
    }
    return next - nearest;
  }`, [hash3]);
  const hot = wgslFn(`fn emberHot(p: vec3f, centre: vec3f, radius: f32, heat: f32) -> f32 {
    return clamp((1.0 - smoothstep(0.2, 1.05, length(p - centre) / radius)) * heat, 0.0, 1.0);
  }`);
  const char = wgslFn(`fn emberChar(p: vec3f, centre: vec3f, radius: f32, heat: f32) -> vec3f {
    let ash = smoothstep(0.7, 0.84, emberFbm(p.xz * 9.0 + p.y * 7.0 + 3.0))
      * (0.25 + 0.75 * (1.0 - emberHot(p, centre, radius, heat)));
    return mix(vec3f(0.01, 0.009, 0.008), vec3f(0.1, 0.097, 0.094), ash);
  }`, [fbm, hot]);
  const glow = wgslFn(`fn emberGlow(p: vec3f, up: f32, time: f32, centre: vec3f, radius: f32, heat: f32) -> vec3f {
    let hotHere = emberHot(p, centre, radius, heat);
    let crack = (1.0 - smoothstep(0.0, 0.06, emberCellEdge(p * 22.0)))
      * smoothstep(0.4, 0.62, emberFbm(p.xz * 4.0 + p.y * 3.0));
    let hotPatch = smoothstep(0.62, 0.8, emberFbm(p.xz * 7.0 + p.y * 5.0));
    let breathe = 0.45 + 0.55 * emberNoise(p.xz * 3.0 + vec2f(time * 0.35, time * 0.21));
    let sides = 1.0 - smoothstep(0.3, 0.8, up);
    let faces = max(heat - 1.0, 0.0) * hotHere * sides * (0.3 + 0.7 * emberNoise(p.xz * 14.0 + p.y * 9.0));
    let g = clamp((crack * (0.03 + hotHere * hotHere) + hotPatch * hotHere * hotHere + faces) * breathe, 0.0, 1.0);
    return mix(vec3f(0.8, 0.08, 0.01), vec3f(1.0, 0.42, 0.07), g) * (0.6 + g * 2.4) * g;
  }`, [hot, cellEdge, fbm, noise]);
  embers = { char, glow };
  return embers;
}

/** An ember material's look on the node material three converts it to (fire.ts `emberMat`, its GLSL patch): its
 *  colour darkened to char and ash, its glow through the cracks as its light, its sheen cut to a fifth. Its values
 *  are read off the material drawn (`emberLooks`): every fire's bed and char shares the build. */
export function emberNodes(node: N): void {
  const {
    materialReference, materialColor, materialOpacity, materialEmissive, positionWorld, normalWorld, vec4,
    specularColor, specularColorBlended, specularF90,
  } = tsl as any;
  const { char, glow } = emberFns();
  const read = (name: keyof EmberLooks, type: string): N => materialReference(`emberLooks.${name}.value`, type);
  const at = { centre: read('centre', 'vec3'), radius: read('radius', 'float'), heat: read('heat', 'float') };
  const time = read('time', 'float');
  node.colorNode = vec4(materialColor.rgb.mul(char({ p: positionWorld, ...at })), materialOpacity);
  node.emissiveNode = materialEmissive.add(glow({ p: positionWorld, up: normalWorld.y, time, ...at }));
  const setupSpecular = node.setupSpecular.bind(node);
  node.setupSpecular = () => {
    setupSpecular();
    specularColor.assign(specularColor.mul(CHAR_SHEEN));
    specularColorBlended.assign(specularColorBlended.mul(CHAR_SHEEN));
    specularF90.assign(specularF90.mul(CHAR_SHEEN));
  };
}

/** `value` written into WGSL as a float */
const f = (value: number): string => value.toFixed(4);

/** The march's functions, made once for `shape` (the same for every fire). */
let march: N = null;
function marchFor(shape: FlameShape): N {
  const { wgslFn } = tsl as any;
  if (march) return march;
  const colour = wgslFn(`fn fireColour(heat: f32) -> vec3f {
    var c = mix(vec3f(0.5, 0.04, 0.005), vec3f(0.95, 0.22, 0.02), smoothstep(0.05, 0.3, heat));
    c = mix(c, vec3f(1.0, 0.45, 0.06), smoothstep(0.3, 0.6, heat));
    c = mix(c, vec3f(1.0, 0.72, 0.22), smoothstep(0.6, 0.85, heat));
    return mix(c, vec3f(1.0, 0.9, 0.62), smoothstep(0.85, 1.0, heat));
  }`);
  // the flames' heat at p (m from the bed's middle, up from it), 0 outside them; `top` their height now
  const heat = wgslFn(`fn fireHeat(p: vec3f, noise: texture_3d<f32>, noiseAt: sampler, radius: f32, top: f32,
    rise: vec2f, seed: vec3f) -> f32 {
    let h = p.y / top;
    if (h <= 0.0 || h >= 1.0) {
      return 0.0;
    }
    // as wide as their foot low down, drawn in to a tip
    let across = p.xz / radius;
    let halfWidth = mix(${f(shape.foot)}, ${f(shape.tip)}, pow(h, 0.9));
    let bend = ${f(shape.tongueBend)} * mix(${f(shape.bendFoot)}, 1.0, h * h);
    if (length(across) > halfWidth + bend * 0.71) {
      return 0.0;
    }
    let coarse = vec3f(across.x * ${f(shape.noise.across)}, h * ${f(shape.noise.up)} - rise.x,
      across.y * ${f(shape.noise.across)});
    let a = textureSampleLevel(noise, noiseAt, coarse + seed, 0.0).rg;
    let bent = across + (a - 0.5) * bend;
    let outward = length(bent) / halfWidth;
    if (outward >= 1.0) {
      return 0.0;
    }
    let body = 1.0 - smoothstep(0.7, 1.0, outward);
    // each tongue's own height, and streaks rising through it
    let fine = vec3f(bent.x * ${f(shape.noise.fineAcross)}, h * ${f(shape.noise.fineUp)} - rise.y,
      bent.y * ${f(shape.noise.fineAcross)});
    let b = textureSampleLevel(noise, noiseAt, fine + seed * 1.7, 0.0).rg;
    let tip = 0.35 + 1.3 * (b.r - 0.25);
    let tongue = 1.0 - smoothstep(tip - 0.15, tip, h);
    var hot = body * tongue * (0.95 - h * 0.6) * (0.35 + 0.9 * smoothstep(0.3, 0.7, b.g));
    hot *= smoothstep(0.0, 0.15, h) * (1.0 - smoothstep(0.86, 1.0, h));
    return clamp(hot, 0.0, 1.0);
  }`);
  // where a ray from eye along dir is among the flames: a cylinder `reach` round, `top` high
  const span = wgslFn(`fn fireSpan(eye: vec3f, dir: vec3f, top: f32, reach: f32) -> vec2f {
    var up = dir.y;
    if (abs(up) < 1e-5) {
      up = 1e-5;
    }
    let floorAt = -eye.y / up;
    let topAt = (top - eye.y) / up;
    var span = vec2f(min(floorAt, topAt), max(floorAt, topAt));
    let origin = eye.xz;
    let along = dir.xz;
    let a = dot(along, along);
    let b = dot(origin, along);
    let c = dot(origin, origin) - reach * reach;
    if (a < 1e-8) {
      if (c > 0.0) {
        return vec2f(0.0);
      }
      return vec2f(max(span.x, 0.0), span.y);
    }
    let meets = b * b - a * c;
    if (meets <= 0.0) {
      return vec2f(0.0);
    }
    let root = sqrt(meets);
    span = vec2f(max(span.x, (-b - root) / a), min(span.y, (-b + root) / a));
    return vec2f(max(span.x, 0.0), span.y);
  }`);
  // where a ray first meets the side of a cone frustum round the bed's middle (each end a height and a radius)
  const side = wgslFn(`fn fireSide(eye: vec3f, dir: vec3f, foot: vec2f, upper: vec2f) -> f32 {
    let k = (upper.y - foot.y) / (upper.x - foot.x);
    let q = foot.y + (eye.y - foot.x) * k;
    let along = dir.y * k;
    let a = dot(dir.xz, dir.xz) - along * along;
    let b = dot(eye.xz, dir.xz) - q * along;
    let c = dot(eye.xz, eye.xz) - q * q;
    let meets = b * b - a * c;
    var hit = 1e9;
    if (abs(a) < 1e-6 || meets < 0.0) {
      return hit;
    }
    let root = sqrt(meets);
    for (var i = 0; i < 2; i++) {
      var turn = root;
      if (i == 0) {
        turn = -root;
      }
      let t = (-b + turn) / a;
      let y = eye.y + dir.y * t;
      if (t > 0.0 && y >= foot.x && y <= upper.x) {
        hit = min(hit, t);
      }
    }
    return hit;
  }`);
  // where a ray first meets a disc round the bed's middle at height y, radius r
  const disc = wgslFn(`fn fireDisc(eye: vec3f, dir: vec3f, y: f32, r: f32) -> f32 {
    if (abs(dir.y) < 1e-5) {
      return 1e9;
    }
    let t = (y - eye.y) / dir.y;
    let p = eye.xz + dir.xz * t;
    if (t > 0.0 && dot(p, p) <= r * r) {
      return t;
    }
    return 1e9;
  }`);
  // where a ray first meets the bowl under the flames (its foot, belly and rim), far off with none
  const bowl = wgslFn(`fn fireBowl(eye: vec3f, dir: vec3f, foot: vec2f, belly: vec2f, rim: vec2f) -> f32 {
    if (rim.x <= foot.x) {
      return 1e9;
    }
    var hit = fireDisc(eye, dir, foot.x, foot.y);
    hit = min(hit, fireSide(eye, dir, foot, belly));
    hit = min(hit, fireSide(eye, dir, belly, rim));
    var low = belly;
    var high = rim;
    if (belly.x > 0.0) {
      low = foot;
      high = belly;
    }
    let bed = mix(low.y, high.y, clamp(-low.x / (high.x - low.x), 0.0, 1.0));
    return min(hit, fireDisc(eye, dir, 0.0, bed));
  }`, [side, disc]);
  march = wgslFn(`fn fireLight(world: vec3f, eyeWorld: vec3f, centre: vec3f, pixel: vec2f, noise: texture_3d<f32>,
    noiseAt: sampler, radius: f32, top: f32, reach: f32, rise: vec2f, seed: vec3f, glow: f32, foot: vec2f,
    belly: vec2f, rim: vec2f) -> vec4f {
    let eye = eyeWorld - centre;
    let dir = normalize(world - eyeWorld);
    var span = fireSpan(eye, dir, top, reach);
    span.y = min(span.y, fireBowl(eye, dir, foot, belly, rim));
    if (span.y <= span.x) {
      return vec4f(0.0, 0.0, 0.0, 1.0);
    }
    let stride = max(span.y - span.x, 0.0) / f32(${shape.steps});
    let jitter = fract(sin(dot(pixel, vec2f(12.9898, 78.233))) * 43758.5453);
    var light = vec3f(0.0);
    var through = 1.0;
    for (var i = 0; i < ${shape.steps}; i++) {
      let hot = fireHeat(eye + dir * (span.x + (f32(i) + jitter) * stride), noise, noiseAt, radius, top, rise, seed);
      if (hot <= 0.0) {
        continue;
      }
      let flame = smoothstep(0.04, 0.4, hot);
      light += through * fireColour(hot) * flame * (0.2 + hot * 1.4);
      through *= exp(-flame * stride * ${f(shape.sootPerMetre)});
      if (through < 0.02) {
        break;
      }
    }
    return vec4f(light * stride * ${f(shape.glowPerMetre)} * glow, 1.0);
  }`, [colour, heat, span, bowl]);
  return march;
}

/** A bowl's part (0 its foot, 1 its belly, 2 its rim) as a node, read as each frame draws: fire.ts swaps the list. */
function bowlPart(uniforms: FlameUniforms, part: number): N {
  const { uniform } = tsl as any;
  return uniform(new THREE.Vector2()).onRenderUpdate(() => uniforms.uBowl.value[part]);
}

/** The flames' material: their light gathered along each ray through their box, added. */
export function flameMaterial(uniforms: FlameUniforms, shape: FlameShape): THREE.Material {
  const { cameraPosition, positionWorld, reference, sampler, screenCoordinate, texture3D } = tsl as any;
  const read = (name: keyof FlameUniforms, type: string): N => reference('value', type, uniforms[name]);
  const noise = texture3D(uniforms.uNoise.value);
  const material = new gpu.MeshBasicNodeMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const light = marchFor(shape)({
    world: positionWorld, eyeWorld: cameraPosition, centre: read('uCentre', 'vec3'), pixel: screenCoordinate.xy,
    noise, noiseAt: sampler(noise), radius: read('uRadius', 'float'),
    top: read('uHeight', 'float').mul(read('uPuff', 'float')), reach: read('uBox', 'vec3').x,
    rise: read('uRise', 'vec2'), seed: read('uSeed', 'vec3'), glow: read('uGlow', 'float'),
    foot: bowlPart(uniforms, 0), belly: bowlPart(uniforms, 1), rim: bowlPart(uniforms, 2),
  });
  // (the flames fade with the prop under them, `seeThroughFade`: fire.ts binds its uniforms first)
  const see = uniforms as unknown as Record<string, { value: unknown }>;
  material.fragmentNode = see.uSeeK ? light.mul(tsl.vec4(tsl.vec3(seeKept(seeUniforms(see))), 1)) : light;
  return material;
}
