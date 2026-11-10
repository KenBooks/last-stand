// A fire's flames on WebGPU (core/webgpu.ts): fire.ts's ray march as WGSL functions (`wgslFn`), written line for line
// from its GLSL, the node material's whole output as `gl_FragColor` was. The noise is read at its first level
// (`textureSampleLevel`): WGSL samples with gradients only where every pixel takes the same path, and the march stops
// early. The flames fade as the prop under them dissolves (`seeThroughFade`, core/shaderPorts.ts `seeFade`, as one by their middle's). The bed's
// and the logs' char and embers (`emberMat`) are its look's functions as WGSL, set on the lit material three converts
// it to (`emberNodes`).
import * as THREE from 'three';
import { gpu, tsl } from '../core/webgpu';
import { seeFade, seeUniforms, type SeeNodes } from '../core/shaderPorts';
import type { FLAME_LOOK, KEPT, KEPT_SIZE } from './fireBake';

// (untyped: TSL's types don't follow its conversions across these calls yet)
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

/** The flames' uniforms as fire.ts keeps them (each `{ value }`, read as each frame draws). */
export interface FlameUniforms {
  uFlames: { value: THREE.Data3DTexture };
  uCentre: { value: THREE.Vector3 };
  uBox: { value: THREE.Vector3 };
  uRadius: { value: number };
  uHeight: { value: number };
  uPuff: { value: number };
  uGlow: { value: number };
  uFrame: { value: number };
  uTurn: { value: THREE.Vector2 };
  uBowl: { value: THREE.Vector2[] };
  uLogs: { value: THREE.Vector4[] };
  uStepShare: { value: number };
}

/** fire.ts's numbers the GLSL had written into it: the march's steps, how thick and bright the gas is, its glow against
 *  its life, its blackbody's colours, and the loop's tiles. */
export interface FlameShape {
  steps: number;
  /** the fewest steps a ray takes, and the least share of a whole crossing its length counts for */
  stepsLeast: number;
  spanLeast: number;
  look: typeof FLAME_LOOK;
  tiles: { across: number; down: number };
  cells: { nx: number; ny: number; nz: number };
  kept: typeof KEPT;
  keptSize: typeof KEPT_SIZE;
  frames: number;
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

/** Where a ray first meets a log (as fire.ts's `logAt`), made once. */
let log: N = null;
function logFn(): N {
  const { wgslFn } = tsl as any;
  log ??= wgslFn(`fn fireLog(eye: vec3f, dir: vec3f, a: vec4f, b: vec4f) -> f32 {
    let ba = b.xyz - a.xyz;
    let baba = dot(ba, ba);
    if (a.w <= 0.0 || baba < 1e-8) {
      return 1e9;
    }
    let oa = eye - a.xyz;
    let bard = dot(ba, dir);
    let baoa = dot(ba, oa);
    let qa = baba - bard * bard;
    let qb = baba * dot(dir, oa) - baoa * bard;
    let qc = baba * dot(oa, oa) - baoa * baoa - a.w * a.w * baba;
    let h = qb * qb - qa * qc;
    if (h < 0.0) {
      return 1e9;
    }
    let root = sqrt(h);
    var t = -1.0;
    if (qa > 1e-8) {
      t = (-qb - root) / qa;
    }
    let y = baoa + t * bard;
    if (t > 0.0 && y > 0.0 && y < baba) {
      return t;
    }
    if (abs(bard) < 1e-8) {
      return 1e9;
    }
    var end = baba;
    if (y <= 0.0) {
      end = 0.0;
    }
    let tc = (end - baoa) / bard;
    if (tc > 0.0 && abs(qb + qa * tc) < root) {
      return tc;
    }
    return 1e9;
  }`);
  return log;
}

/** The march's functions, made once for `shape` (the same for every fire). */
let march: N = null;
function marchFor(shape: FlameShape): N {
  const { wgslFn } = tsl as any;
  if (march) return march;
  const look = shape.look;
  const stops = look.blackbody.slice(1).map(([at, r, g, b, bright], i) => {
    const [before, r0, g0, b0, bright0] = look.blackbody[i];
    return `if (life <= ${f(at)}) { return mix(vec3f(${f(r0)}, ${f(g0)}, ${f(b0)}) * ${f(bright0)}, `
      + `vec3f(${f(r)}, ${f(g)}, ${f(b)}) * ${f(bright)}, (life - ${f(before)}) / ${f(at - before)}); }`;
  }).join('\n    ');
  const colour = wgslFn(`fn fireColour(life: f32) -> vec3f {
    ${stops}
    return vec3f(1.0);
  }`);
  // the loop at one frame's tile (as fire.ts's `flameTile`)
  const tile = wgslFn(`fn fireTile(q: vec3f, frame: f32, noise: texture_3d<f32>, noiseAt: sampler) -> f32 {
    let row = floor(frame / ${f(shape.tiles.across)});
    let at = vec2f(frame - row * ${f(shape.tiles.across)}, row - floor(row / ${f(shape.tiles.down)}) * ${f(shape.tiles.down)});
    let size = vec2f(${f(shape.keptSize.x)}, ${f(shape.keptSize.y)});
    let inBox = q.xy * vec2f(${f(shape.cells.nx)}, ${f(shape.cells.ny)}) - vec2f(${f(shape.kept.x[0])}, ${f(shape.kept.y[0])});
    let cell = (at * size + clamp(inBox, vec2f(0.5), size - 0.5)) / (size * vec2f(${f(shape.tiles.across)}, ${f(shape.tiles.down)}));
    let deep = (q.z * ${f(shape.cells.nz)} - ${f(shape.kept.z[0])}) / ${f(shape.keptSize.z)};
    return textureSampleLevel(noise, noiseAt, vec3f(cell, deep), 0.0).r;
  }`);
  // a flame's life at p (as fire.ts's `flameLife`)
  const life = wgslFn(`fn fireLife(p: vec3f, noise: texture_3d<f32>, noiseAt: sampler, top: f32, reach: f32, frame: f32,
    turn: vec2f) -> f32 {
    let across = vec2f(p.x * turn.x - p.z * turn.y, p.x * turn.y + p.z * turn.x) / reach;
    let q = vec3f(across.x * 0.5 + 0.5, p.y / top, across.y * 0.5 + 0.5);
    if (q.y <= 0.0 || q.y >= 1.0 || dot(across, across) >= 1.0) {
      return 0.0;
    }
    let first = floor(frame);
    let next = first + 1.0 - floor((first + 1.0) / ${f(shape.frames)}) * ${f(shape.frames)};
    let life = mix(fireTile(q, first, noise, noiseAt), fireTile(q, next, noise, noiseAt), frame - first);
    if (life <= 0.004) {
      return 0.0;
    }
    let fine = vec3f(abs(fract(q.x * ${f(look.strandsAcross)}) * 2.0 - 1.0) * 0.3 + 0.35,
      0.1 + fract(q.y * ${f(look.strandsUp)}) * 0.4,
      abs(fract(q.z * ${f(look.strandsAcross)}) * 2.0 - 1.0) * 0.3 + 0.35);
    let strands = fireTile(fine, first, noise, noiseAt);
    let sideFrom = mix(${f(look.sideFadeFoot)}, ${f(look.sideFade)}, smoothstep(0.0, ${f(look.footNarrows)}, q.y));
    let side = 1.0 - smoothstep(sideFrom, sideFrom + 0.3, length(across));
    return life * (1.0 - ${f(look.strandsTake)} * (1.0 - strands)) * side * smoothstep(0.0, ${f(look.footFade)}, q.y);
  }`, [tile]);
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
    noiseAt: sampler, top: f32, reach: f32, frame: f32, turn: vec2f, glow: f32, foot: vec2f,
    belly: vec2f, rim: vec2f, logs: f32, stepShare: f32) -> vec4f {
    let eye = eyeWorld - centre;
    let dir = normalize(world - eyeWorld);
    var span = fireSpan(eye, dir, top, reach);
    span.y = min(span.y, fireBowl(eye, dir, foot, belly, rim));
    span.y = min(span.y, logs);
    if (span.y <= span.x) {
      return vec4f(0.0);
    }
    let spanLength = max(span.y - span.x, 0.0);
    let wanted = f32(${shape.steps}) * stepShare * clamp(spanLength / (2.0 * reach), ${f(shape.spanLeast)}, 1.0);
    let steps = max(i32(ceil(wanted)), ${shape.stepsLeast});
    let stride = spanLength / f32(steps);
    let jitter = fract(sin(dot(pixel, vec2f(12.9898, 78.233))) * 43758.5453);
    var light = vec3f(0.0);
    var through = 1.0;
    for (var i = 0; i < ${shape.steps}; i++) {
      if (i >= steps) {
        break;
      }
      let here = fireLife(eye + dir * (span.x + (f32(i) + jitter) * stride), noise, noiseAt, top, reach, frame, turn);
      if (here <= 0.004) {
        continue;
      }
      let thick = 1.0 - exp(-clamp(here / ${f(look.glowFullLife)}, 0.0, 1.0) * stride * ${f(look.thickPerMetre)});
      light += through * thick * fireColour(here);
      through *= 1.0 - thick * smoothstep(${f(look.holdsFrom)}, ${f(look.holdsFully)}, here);
      if (through < 0.02) {
        break;
      }
    }
    return vec4f(light * ${f(look.glow)} * glow, 1.0 - through);
  }`, [colour, life, span, bowl]);
  return march;
}

/** A bowl's part (0 its foot, 1 its belly, 2 its rim) as a node, read as each frame draws: fire.ts swaps the list. */
function bowlPart(uniforms: FlameUniforms, part: number): N {
  const { uniform } = tsl as any;
  return uniform(new THREE.Vector2()).onRenderUpdate(() => uniforms.uBowl.value[part]);
}

/** A log's end (`end` of fire.ts's `uLogs`) as a node, read as each frame draws. */
function logEnd(uniforms: FlameUniforms, end: number): N {
  const { uniform } = tsl as any;
  return uniform(new THREE.Vector4()).onRenderUpdate(() => uniforms.uLogs.value[end]);
}

/** Where a ray from the camera through this pixel first meets a log in the fire (from its bed's middle), far off with
 *  none. */
function logsHit(uniforms: FlameUniforms, centre: N): N {
  const { cameraPosition, positionWorld, min } = tsl as any;
  const eye = cameraPosition.sub(centre);
  const dir = positionWorld.sub(cameraPosition).normalize();
  const hits = Array.from({ length: uniforms.uLogs.value.length / 2 }, (_, i) =>
    logFn()({ eye, dir, a: logEnd(uniforms, i * 2), b: logEnd(uniforms, i * 2 + 1) }));
  return hits.reduce((hit, next) => min(hit, next));
}

/** The share of the flames' light kept as their prop dissolves: one for all of them, the fade at five points along
 *  the view through their middle averaged (fire.ts's `kept`). */
function evenFade(see: SeeNodes, read: (name: keyof FlameUniforms, type: string) => N): N {
  const { cameraPosition, float, vec3 } = tsl as any;
  const middle = read('uCentre', 'vec3').add(vec3(0, read('uHeight', 'float').mul(0.5), 0));
  const across = middle.sub(cameraPosition).normalize().mul(read('uBox', 'vec3').x);
  const fades = [-1, -0.5, 0, 0.5, 1].map((share) => seeFade(middle.add(across.mul(share)), see));
  return float(1).sub(fades.reduce((sum, fade) => sum.add(fade)).div(5));
}

/** The flames' material: their light gathered along each ray through their box, added. */
export function flameMaterial(uniforms: FlameUniforms, shape: FlameShape): THREE.Material {
  const { cameraPosition, positionWorld, reference, sampler, screenCoordinate, texture3D } = tsl as any;
  const read = (name: keyof FlameUniforms, type: string): N => reference('value', type, uniforms[name]);
  const noise = texture3D(uniforms.uFlames.value);
  const material = new gpu.MeshBasicNodeMaterial({
    transparent: true, depthWrite: false, blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const light = marchFor(shape)({
    world: positionWorld, eyeWorld: cameraPosition, centre: read('uCentre', 'vec3'), pixel: screenCoordinate.xy,
    noise, noiseAt: sampler(noise),
    top: read('uHeight', 'float').mul(read('uPuff', 'float')), reach: read('uBox', 'vec3').x,
    frame: read('uFrame', 'float'), turn: read('uTurn', 'vec2'), glow: read('uGlow', 'float'),
    foot: bowlPart(uniforms, 0), belly: bowlPart(uniforms, 1), rim: bowlPart(uniforms, 2),
    logs: logsHit(uniforms, read('uCentre', 'vec3')), stepShare: read('uStepShare', 'float'),
  });
  // (the flames fade with the prop under them, `seeThroughFade`: fire.ts binds its uniforms first; as one, by the fade
  // along the view through their middle, as fire.ts has it)
  const see = uniforms as unknown as Record<string, { value: unknown }>;
  material.fragmentNode = see.uSeeK ? light.mul(evenFade(seeUniforms(see), read)) : light;
  return material;
}
