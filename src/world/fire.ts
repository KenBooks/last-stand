// A fire burning on a prop (a brazier's coals, a bonfire's logs): flames as a volume, their light gathered along each
// ray through a box over the bed, their stuff rising through them as noise in the world that eats their tops into
// tongues, coloured by its heat (dull red at its edges, orange, yellow, near white in its core low down), so they hold
// their shape as the camera goes round them (sheets turned to the camera turned with it); a bed of coal lumps glowing
// through cracks in their char; embers drifting up and smoke over it. One swell of the flames' height and the light's (a fire a metre across puffs about
// 1.5 times a second) moves them together. `tools/lab` `fire` measures it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { particles, col } from '../fx/particles';
import { rand } from '../util';
import { seeThrough, seeThroughFade } from '../core/seeThrough';
import type { Updater } from './props';
import { runPhase } from './runPhase';
import { WEBGPU } from '../core/webgpu';
import { emberNodes, flameMaterial, type EmberLooks, type FlameUniforms } from './fireNodes';

/** A fire to build: its bed and flames, and the biome's light it flickers. */
export interface FireSpec {
  /** the middle of its bed (world, m) */
  at: THREE.Vector3;
  /** its bed's radius and its flames' height (m) */
  radius: number;
  height: number;
  /** how far its bed rises to its rim (m): a brazier's bowl is dished, a bonfire's ground flat */
  dish: number;
  /** the solid bowl under it, if it has one: its outside's foot, belly and rim, each a height and a radius from the
   *  bed's middle (m; the flames behind it are hidden as it hides them) */
  bowl?: [number, number][];
  /** the biome's point light over it (one of its six), and its intensity at rest */
  light: THREE.PointLight;
  intensity: number;
  /** its smoke: how many puffs a second, and their colour (a coal fire's is thin and dark, wood's paler) */
  smoke: number;
  smokeColour: THREE.ColorRepresentation;
  /** how many embers a second it gives off */
  embers: number;
  /** its flames' light, a share of a fire's own (1 by default): seen from low and near, as the hall of heroes' camera
   *  sees its braziers, a ray through their foot crosses the most of them, and at a fire's own it burned white there */
  glow?: number;
}

/** the steps a ray takes through the flames' box: fewer, and the flames read as slices across the view */
const STEPS = 48;
/** the flames' light a metre of them, at their heat's own colour, and how much of the light behind it a metre of
 *  them holds back (its share kept is e to minus this) */
const GLOW_PER_METRE = 3.2;
const SOOT_PER_METRE = 3;
/** the noise volume's side (voxels), its octaves' periods across it (cells) and their weights */
const NOISE_SIZE = 32;
const NOISE_OCTAVES = [{ period: 4, weight: 0.57 }, { period: 8, weight: 0.29 }, { period: 16, weight: 0.14 }];
/** the noise's scale through the flames (its volume's sides a unit of its bed's radius across, and of its flames'
 *  height up), and how fast it rises through them (its sides a second): its stuff rises about a flame's height a
 *  second, as a wood fire's does, the fine noise faster */
const NOISE_SCALE = { across: 0.45, up: 0.16, fineAcross: 0.8, fineUp: 0.4 };
/** the flames' half-width at their foot and their tip (a share of the bed's radius), and how far the noise bends them
 *  aside at their tip (a share of it, from `BEND_FOOT` of that at their foot by the square of their height: bent as
 *  much half way up, where they're still wide, the whole of them leant out past a brazier's rim) */
const FLAME_FOOT = 0.9;
const FLAME_TIP = 0.15;
const TONGUE_BEND = 1.0;
const BEND_FOOT = 0.15;
/** The flames' half-width at `h` (a share of their height), and how far the noise bends them there, as the shader has
 *  them (shares of the bed's radius). */
const widthAt = (h: number): number => FLAME_FOOT + (FLAME_TIP - FLAME_FOOT) * h ** 0.9;
const bendAt = (h: number): number => TONGUE_BEND * (BEND_FOOT + (1 - BEND_FOOT) * h * h);
/** how far from the bed's middle they reach (a share of its radius): bent as far as all but the noise's rarest, 0.6
 *  of its most (bent further, they're cut where their box ends) */
const FLAME_REACH = Math.max(...Array.from({ length: 11 }, (_, at) => widthAt(at / 10) + 0.6 * bendAt(at / 10)));
const NOISE_RISE = { coarse: 0.39, fine: 0.72 };
/** a puff's swell of the flames' height, slow and quick (a share of it) */
const PUFF_SLOW = 0.18;
const PUFF_QUICK = 0.04;
/** the slow and quick swells' rates (Hz): value noise at a rate carries its swing under it */
const PUFF_SLOW_HZ = 1.7;
const PUFF_QUICK_HZ = 6.3;
/** how much of a puff the light swells by (a share of the flames' swell) */
const LIGHT_SWELL = 1.2;
/** how far the light sways with a puff (m) */
const LIGHT_SWAY = 0.05;
/** how hot a fire's bed glows, against a log's char */
const BED_HEAT = 1.5;
/** a puff of smoke's opacity as it leaves the flames */
const SMOKE_ALPHA = 0.3;

/** Value noise in one dimension: smooth, between 0 and 1. */
function noise1(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const hash = (n: number) => {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const eased = f * f * (3 - 2 * f);
  return hash(i) + (hash(i + 1) - hash(i)) * eased;
}

/** A fire's puff at `t` (1 at rest): the swell of its flames' height, slow and quick, at no common beat. */
function puffAt(t: number, seed: number): number {
  const slow = (noise1(t * PUFF_SLOW_HZ + seed) - 0.5) * 2 * PUFF_SLOW;
  const quick = (noise1(t * PUFF_QUICK_HZ + seed * 3.1) - 0.5) * 2 * PUFF_QUICK;
  return 1 + slow + quick;
}

const NOISE = /* glsl */`
  float fireHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float fireNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(fireHash(i), fireHash(i + vec2(1.0, 0.0)), f.x),
      mix(fireHash(i + vec2(0.0, 1.0)), fireHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fireFbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * fireNoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
    return v;
  }`;

/** A number from 0 to 1 for a lattice point of the noise volume, by its place and its channel. */
function latticeValue(x: number, y: number, z: number, channel: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177) ^ Math.imul(channel, 362437);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Value noise at (`x`, `y`, `z`) in cells of a lattice `period` cells round, wrapping (so the volume tiles). */
function wrappedNoise(x: number, y: number, z: number, period: number, channel: number): number {
  const [ix, iy, iz] = [Math.floor(x), Math.floor(y), Math.floor(z)];
  const ease = (f: number) => f * f * f * (f * (f * 6 - 15) + 10);
  const [fx, fy, fz] = [ease(x - ix), ease(y - iy), ease(z - iz)];
  const at = (dx: number, dy: number, dz: number) => latticeValue(
    (ix + dx) % period, (iy + dy) % period, (iz + dz) % period, channel);
  const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
  const row = (dy: number, dz: number) => lerp(at(0, dy, dz), at(1, dy, dz), fx);
  const plane = (dz: number) => lerp(row(0, dz), row(1, dz), fy);
  return lerp(plane(0), plane(1), fz);
}

/** The flames' stuff: a volume of noise that tiles, `NOISE_SIZE` voxels a side, made once. Two channels of noise of
 *  `NOISE_OCTAVES` each, apart: the flames' own and the warp and streaks that move it. */
let noiseVolume: THREE.Data3DTexture | null = null;
function flameNoise(): THREE.Data3DTexture {
  if (noiseVolume) return noiseVolume;
  const size = NOISE_SIZE;
  const data = new Uint8Array(size * size * size * 2);
  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        for (let channel = 0; channel < 2; channel++) {
          let value = 0;
          for (const { period, weight } of NOISE_OCTAVES) {
            const cells = period / size;
            value += weight * wrappedNoise(x * cells, y * cells, z * cells, period, channel);
          }
          data[((z * size + y) * size + x) * 2 + channel] = Math.round(value * 255);
        }
      }
    }
  }
  const texture = new THREE.Data3DTexture(data, size, size, size);
  texture.format = THREE.RGFormat;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = texture.wrapR = THREE.RepeatWrapping;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  noiseVolume = texture;
  return texture;
}

/** `value` written into a shader, as a float whatever it is */
const glsl = (value: number): string => value.toFixed(4);

const FLAME_VERTEX = /* glsl */`
  varying vec3 vFlameWp;
  void main() {
    vFlameWp = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * viewMatrix * vec4(vFlameWp, 1.0);
  }`;

/** The flames' light, gathered along each ray through their box: at each step their heat there, from the noise
 *  rising through a body wide at its foot and drawn in to its tip, coloured by heat as a wood fire burns (dull red,
 *  orange, yellow, near white in its core). A flame's light passes through it, so nothing is taken from the ray. */
const FLAME_FRAGMENT = /* glsl */`
  uniform sampler3D uNoise;
  uniform vec3 uCentre;
  uniform vec3 uBox;
  uniform float uRadius;
  uniform float uHeight;
  uniform float uPuff;
  uniform float uGlow;
  uniform vec2 uRise;
  uniform vec3 uSeed;
  uniform vec2 uBowl[3];
  varying vec3 vFlameWp;
  vec3 flameColour(float heat) {
    vec3 c = mix(vec3(0.5, 0.04, 0.005), vec3(0.95, 0.22, 0.02), smoothstep(0.05, 0.3, heat));
    c = mix(c, vec3(1.0, 0.45, 0.06), smoothstep(0.3, 0.6, heat));
    c = mix(c, vec3(1.0, 0.72, 0.22), smoothstep(0.6, 0.85, heat));
    return mix(c, vec3(1.0, 0.9, 0.62), smoothstep(0.85, 1.0, heat));
  }
  // the flames' heat at p (m from the bed's middle, up from it), 0 outside them
  float flameHeat(vec3 p) {
    float h = p.y / (uHeight * uPuff);
    if (h <= 0.0 || h >= 1.0) return 0.0;
    // as wide as their foot low down, drawn in to a tip
    vec2 across = p.xz / uRadius;
    // (as widthAt and bendAt have them)
    float halfWidth = mix(${glsl(FLAME_FOOT)}, ${glsl(FLAME_TIP)}, pow(h, 0.9));
    float bend = ${glsl(TONGUE_BEND)} * mix(${glsl(BEND_FOOT)}, 1.0, h * h);
    // (the bend is a vector of two noises, as long as 0.71 of it: cut at half, a tongue's side was cut straight)
    if (length(across) > halfWidth + bend * 0.71) return 0.0;
    // the noise bends the body aside more as it rises, slowly up its height and fast across it, so it splits into
    // tongues (in the shape, not its light: the light of a noise summed along a ray evened out into a smooth cone)
    vec3 coarse = vec3(across.x * ${glsl(NOISE_SCALE.across)}, h * ${glsl(NOISE_SCALE.up)} - uRise.x,
      across.y * ${glsl(NOISE_SCALE.across)});
    vec2 a = texture(uNoise, coarse + uSeed).rg;
    vec2 bent = across + (a - 0.5) * bend;
    float outward = length(bent) / halfWidth;
    if (outward >= 1.0) return 0.0;
    // (even within, falling off at their edge: their light summed along a ray shows their shape, brighter where they're
    // thicker; falling off from their middle, they read as a soft blob)
    float body = 1.0 - smoothstep(0.7, 1.0, outward);
    // each tongue's own height, and streaks rising through it
    vec3 fine = vec3(bent.x * ${glsl(NOISE_SCALE.fineAcross)}, h * ${glsl(NOISE_SCALE.fineUp)} - uRise.y,
      bent.y * ${glsl(NOISE_SCALE.fineAcross)});
    vec2 b = texture(uNoise, fine + uSeed * 1.7).rg;
    float tip = 0.35 + 1.3 * (b.r - 0.25);
    float tongue = 1.0 - smoothstep(tip - 0.15, tip, h);
    // hot low down, cooling as they rise, streaked (hotter, every ray through their core summed to cream)
    float heat = body * tongue * (0.95 - h * 0.6) * (0.35 + 0.9 * smoothstep(0.3, 0.7, b.g));
    // thin into their bed (where every ray met their foot, a patch of cream), gone at their tip
    heat *= smoothstep(0.0, 0.15, h) * (1.0 - smoothstep(0.86, 1.0, h));
    return clamp(heat, 0.0, 1.0);
  }
  // where a ray from eye along dir is among the flames, a cylinder as far round as they bend and as high as they are
  // now (its first and last distance, the first 0 from inside it; the box's corners and its top took steps from them)
  vec2 flameSpan(vec3 eye, vec3 dir) {
    float up = abs(dir.y) < 1e-5 ? 1e-5 : dir.y;
    float floorAt = -eye.y / up;
    float topAt = (uHeight * uPuff - eye.y) / up;
    vec2 span = vec2(min(floorAt, topAt), max(floorAt, topAt));
    vec2 from = eye.xz;
    vec2 along = dir.xz;
    float a = dot(along, along);
    float b = dot(from, along);
    float c = dot(from, from) - uBox.x * uBox.x;
    if (a < 1e-8) return c > 0.0 ? vec2(0.0) : vec2(max(span.x, 0.0), span.y);
    float meets = b * b - a * c;
    if (meets <= 0.0) return vec2(0.0);
    float root = sqrt(meets);
    span = vec2(max(span.x, (-b - root) / a), min(span.y, (-b + root) / a));
    return vec2(max(span.x, 0.0), span.y);
  }
  // where a ray from eye along dir first meets the side of a cone frustum round the bed's middle, from height y0 and
  // radius r0 up to y1 and r1 (far off if it never does)
  float sideAt(vec3 eye, vec3 dir, vec2 foot, vec2 top) {
    float k = (top.y - foot.y) / (top.x - foot.x);
    float q = foot.y + (eye.y - foot.x) * k;
    float along = dir.y * k;
    float a = dot(dir.xz, dir.xz) - along * along;
    float b = dot(eye.xz, dir.xz) - q * along;
    float c = dot(eye.xz, eye.xz) - q * q;
    float meets = b * b - a * c;
    float hit = 1e9;
    if (abs(a) < 1e-6 || meets < 0.0) return hit;
    float root = sqrt(meets);
    for (int i = 0; i < 2; i++) {
      float t = (-b + (i == 0 ? -root : root)) / a;
      float y = eye.y + dir.y * t;
      if (t > 0.0 && y >= foot.x && y <= top.x) hit = min(hit, t);
    }
    return hit;
  }
  // where a ray from eye along dir first meets a disc round the bed's middle at height y, radius r
  float discAt(vec3 eye, vec3 dir, float y, float r) {
    if (abs(dir.y) < 1e-5) return 1e9;
    float t = (y - eye.y) / dir.y;
    vec2 p = eye.xz + dir.xz * t;
    return t > 0.0 && dot(p, p) <= r * r ? t : 1e9;
  }
  // where a ray from eye along dir first meets the bowl under the flames (uBowl: its foot, its belly and its rim, each
  // a height and a radius from the bed's middle), or far off with none: the march stops there, as a depth test would.
  // (The box's faces are what's depth-tested, and its corners stand out past the bowl's wall: from below, the flames
  // showed through it.) Its foot is a disc, its walls two cones up to its rim, and the bed a disc across them.
  float bowlAt(vec3 eye, vec3 dir) {
    vec2 foot = uBowl[0];
    vec2 belly = uBowl[1];
    vec2 rim = uBowl[2];
    if (rim.x <= foot.x) return 1e9;
    float hit = discAt(eye, dir, foot.x, foot.y);
    hit = min(hit, sideAt(eye, dir, foot, belly));
    hit = min(hit, sideAt(eye, dir, belly, rim));
    vec2 low = belly.x > 0.0 ? foot : belly;
    vec2 high = belly.x > 0.0 ? belly : rim;
    float bed = mix(low.y, high.y, clamp(-low.x / (high.x - low.x), 0.0, 1.0));
    return min(hit, discAt(eye, dir, 0.0, bed));
  }
  void main() {
    vec3 eye = cameraPosition - uCentre;
    vec3 dir = normalize(vFlameWp - cameraPosition);
    vec2 span = flameSpan(eye, dir);
    span.y = min(span.y, bowlAt(eye, dir));
    // (none of the flames on this ray: its steps all on one point, their light times a stride of 0 still lit the bowl
    // from below)
    if (span.y <= span.x) discard;
    float stride = max(span.y - span.x, 0.0) / float(${STEPS});
    // (each pixel starts its steps a little further in than its neighbours, at random: in step, the slices showed,
    // and by a pattern's offsets, its stripes did through a thin tongue)
    float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    // (from the camera out, what's nearer hiding some of what's behind it: a wood fire's soot holds back its light,
    // and summed through it all, a fire looked down on from above was a ball of cream)
    vec3 light = vec3(0.0);
    float through = 1.0;
    for (int i = 0; i < ${STEPS}; i++) {
      float heat = flameHeat(eye + dir * (span.x + (float(i) + jitter) * stride));
      if (heat <= 0.0) continue;
      float flame = smoothstep(0.04, 0.4, heat);
      light += through * flameColour(heat) * flame * (0.2 + heat * 1.4);
      through *= exp(-flame * stride * ${glsl(SOOT_PER_METRE)});
      if (through < 0.02) break;
    }
    gl_FragColor = vec4(light * stride * ${glsl(GLOW_PER_METRE)} * uGlow * (1.0 - seeFade()), 1.0);
  }`;

/** the numbers the flames' shader is written with, for its WGSL (fireNodes.ts) */
const FLAME_SHAPE = {
  steps: STEPS, glowPerMetre: GLOW_PER_METRE, sootPerMetre: SOOT_PER_METRE, foot: FLAME_FOOT, tip: FLAME_TIP,
  tongueBend: TONGUE_BEND, bendFoot: BEND_FOOT, noise: NOISE_SCALE,
};

/** A fire's flames' box over its bed's middle (m): as far round as their tongues bend, as high as their tallest puff. */
function flameBox(radius: number, height: number): THREE.Vector3 {
  const reach = radius * FLAME_REACH;
  return new THREE.Vector3(reach, height * (1 + PUFF_SLOW + PUFF_QUICK) * 1.02, reach);
}

/** A bowl the flames' shader knows as none (its rim under its foot). */
const noBowl = (): THREE.Vector2[] => [0, 0, -1].map((y) => new THREE.Vector2(y, 0));

/** A fire's flames' material, for its bed's `radius` and its flames' `height` (m), by its seed. */
function flameMat(radius: number, height: number, seed: number): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uNoise: { value: flameNoise() },
      uCentre: { value: new THREE.Vector3() },
      uBox: { value: flameBox(radius, height) },
      uRadius: { value: radius },
      uHeight: { value: height },
      uPuff: { value: 1 },
      uGlow: { value: 1 },
      uRise: { value: new THREE.Vector2() },
      uSeed: { value: new THREE.Vector3(seed % 1, (seed * 7.31) % 1, (seed * 3.17) % 1) },
      // (none: its rim under its foot)
      uBowl: { value: noBowl() },
    },
    vertexShader: FLAME_VERTEX,
    fragmentShader: FLAME_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  // (it fades as the prop under it dissolves, not left burning in the air)
  return seeThroughFade(mat, 'prop');
}

/** how much of a standard material's sheen char keeps */
const CHAR_SHEEN = 0.2;

/** the embers' clock, one for every fire's bed and char (each fire's updater keeps it) */
const emberTime = { value: 0 };

/** The char's and the embers' look at a point (the bed's middle `uEmberCentre`, `uEmberRadius` out): black char
 *  cracked into blocks as burnt wood cracks, grey ash on its cooler faces, and light through its cracks and from its
 *  hot patches, brighter towards the middle and each glow slowly brightening and dimming. Cracks along the noise's
 *  middle ran as long lines, like lightning. */
const EMBER_COMMON = /* glsl */`
  uniform float uEmberTime;
  uniform vec3 uEmberCentre;
  uniform float uEmberRadius;
  uniform float uEmberHeat;
  varying vec3 vFireWp;
  varying float vFireUp;
  ${NOISE}
  vec3 fireHash3(vec3 p) {
    p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
    return fract(sin(p) * 43758.5453);
  }
  // how far a point is from the edge between the nearest two cells (0 on it)
  float cellEdge(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    float nearest = 8.0, next = 8.0;
    for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec3 cell = vec3(float(x), float(y), float(z));
      float d = length(cell + fireHash3(i + cell) - f);
      if (d < nearest) { next = nearest; nearest = d; } else if (d < next) next = d;
    }
    return next - nearest;
  }
  float emberHot(vec3 p) {
    return clamp((1.0 - smoothstep(0.2, 1.05, length(p - uEmberCentre) / uEmberRadius)) * uEmberHeat, 0.0, 1.0);
  }
  vec3 emberChar(vec3 p) {
    float ash = smoothstep(0.7, 0.84, fireFbm(p.xz * 9.0 + p.y * 7.0 + 3.0)) * (0.25 + 0.75 * (1.0 - emberHot(p)));
    return mix(vec3(0.01, 0.009, 0.008), vec3(0.1, 0.097, 0.094), ash);
  }
  vec3 emberGlow(vec3 p) {
    float hot = emberHot(p);
    // (most cracks dark: only where the noise runs high do they show the fire inside)
    float crack = (1.0 - smoothstep(0.0, 0.06, cellEdge(p * 22.0)))
      * smoothstep(0.4, 0.62, fireFbm(p.xz * 4.0 + p.y * 3.0));
    float hotPatch = smoothstep(0.62, 0.8, fireFbm(p.xz * 7.0 + p.y * 5.0));
    float breathe = 0.45 + 0.55 * fireNoise(p.xz * 3.0 + vec2(uEmberTime * 0.35, uEmberTime * 0.21));
    // (a bed, hotter than a log's char, glows over its lumps' faces too, not only through its cracks: over their sides
    // and in the gaps between them, their tops cooled dark by the air; glowing on top too, they read as salmon clay)
    float sides = 1.0 - smoothstep(0.3, 0.8, vFireUp);
    float faces = max(uEmberHeat - 1.0, 0.0) * hot * sides * (0.3 + 0.7 * fireNoise(p.xz * 14.0 + p.y * 9.0));
    float glow = clamp((crack * (0.03 + hot * hot) + hotPatch * hot * hot + faces) * breathe, 0.0, 1.0);
    return mix(vec3(0.8, 0.08, 0.01), vec3(1.0, 0.42, 0.07), glow) * (0.6 + glow * 2.4) * glow;
  }`;

/** A lit char material glowing through its cracks round `centre` out to `radius` (the bed's, a log's charred end), as
 *  hot as `heat` (1 a log's char, more a bed's): lit by the fire as wood is (unlit, its char and ash read flat as
 *  card), its light its own glow. */
export function emberMat(centre: THREE.Vector3, radius: number, heat = 1): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  const centreValue = { value: centre.clone() };
  const radiusValue = { value: radius };
  const heatValue = { value: heat };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uEmberTime = emberTime;
    shader.uniforms.uEmberCentre = centreValue;
    shader.uniforms.uEmberRadius = radiusValue;
    shader.uniforms.uEmberHeat = heatValue;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFireWp;\nvarying float vFireUp;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vFireWp = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vFireUp = normalize(mat3(modelMatrix) * objectNormal).y;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${EMBER_COMMON}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= emberChar(vFireWp);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += emberGlow(vFireWp);`)
      // char is matte: with a standard 4% sheen a metre under the fire's light, its lumps outshone their own dark and
      // read as salmon clay
      .replace('#include <aomap_fragment>', `reflectedLight.directSpecular *= ${CHAR_SHEEN.toFixed(2)};
        reflectedLight.indirectSpecular *= ${CHAR_SHEEN.toFixed(2)};
        #include <aomap_fragment>`);
  };
  mat.customProgramCacheKey = () => 'fire-ember';
  // (on WebGPU, its look as nodes: world/fireNodes.ts; its own values a property of its own, read off it as drawn)
  const looks: EmberLooks = { time: emberTime, centre: centreValue, radius: radiusValue, heat: heatValue };
  Object.defineProperty(mat, 'emberLooks', { value: looks, configurable: true });
  Object.defineProperty(mat, 'webgpuLooks', { value: emberNodes, configurable: true });
  return seeThrough(mat, 'prop');
}

/** A heap of coal lumps over a disc of `radius` (m), highest in its middle, on a dish rising `dish` to its rim; its
 *  base at 0. Laid flat in a brazier's bowl, those away from its middle sank into its sides. */
function coalsGeo(radius: number, dish: number, rng: () => number): THREE.BufferGeometry {
  const lumps: THREE.BufferGeometry[] = [];
  const count = Math.round(30 + radius * 80);
  for (let i = 0; i < count; i++) {
    const out = Math.sqrt(rng()) * radius * 0.92;
    const angle = rng() * Math.PI * 2;
    const size = radius * (0.07 + rng() * 0.08);
    const lump = new THREE.DodecahedronGeometry(size, 0).toNonIndexed();
    lump.scale(1 + rng() * 0.5, 0.45 + rng() * 0.25, 1 + rng() * 0.5);
    lump.rotateY(rng() * Math.PI * 2);
    const heap = (1 - out / radius) * radius * 0.28 + (out / radius) ** 2 * dish;
    lump.translate(Math.cos(angle) * out, heap + size * 0.2, Math.sin(angle) * out);
    lumps.push(lump);
  }
  return mergeGeometries(lumps);
}

/** A small deterministic random stream for a fire's lumps, by its place. */
function streamAt(at: THREE.Vector3): () => number {
  let state = Math.floor((at.x * 73.1 + at.z * 19.7) * 1000) >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Builds the fire `spec` into `scene`: its bed, its flames, and the updater that burns them. */
export function buildFire(scene: THREE.Object3D, spec: FireSpec, updaters: Updater[]): void {
  const { at, radius, height, light } = spec;
  const rng = streamAt(at);
  const bed = emberMat(at, radius, BED_HEAT);
  const coals = new THREE.Mesh(coalsGeo(radius, spec.dish, rng), bed);
  coals.position.copy(at);
  scene.add(coals);
  const seed = rng() * 100;
  const flames = flameMat(radius, height, seed);
  flames.uniforms.uCentre.value.copy(at);
  flames.uniforms.uGlow.value = spec.glow ?? 1;
  if (spec.bowl) flames.uniforms.uBowl.value = spec.bowl.map(([y, r]) => new THREE.Vector2(y, r));
  const box = flameBox(radius, height);
  const drawnWith = WEBGPU ? flameMaterial(flames.uniforms as unknown as FlameUniforms, FLAME_SHAPE) : flames;
  const volume = new THREE.Mesh(new THREE.BoxGeometry(box.x * 2, box.y, box.z * 2).translate(0, box.y / 2, 0), drawnWith);
  // (its box stands over the bed unturned: the shader reads the ray in the world, from `uCentre`)
  volume.position.copy(at);
  // (drawn after the smoke, before the glows)
  volume.renderOrder = 15;
  scene.add(volume);
  const rise: THREE.Vector2 = flames.uniforms.uRise.value;
  const lightAt = light.position.clone();
  const due = runPhase({ embers: 0, smoke: 0 });
  updaters.push((dt, t) => {
    const puff = puffAt(t, seed);
    flames.uniforms.uPuff.value = puff;
    // (the noise tiles: its offsets wrap without a seam, and stay small however long the game runs)
    rise.set((t * NOISE_RISE.coarse) % 1, (t * NOISE_RISE.fine) % 1);
    emberTime.value = t;
    light.intensity = spec.intensity * (1 + (puff - 1) * LIGHT_SWELL);
    light.position.set(lightAt.x + (puff - 1) * LIGHT_SWAY, lightAt.y + (puff - 1) * LIGHT_SWAY * 2, lightAt.z);
    due.embers += dt * spec.embers;
    while (due.embers >= 1) {
      due.embers -= 1;
      spawnEmber(at, radius, height);
    }
    due.smoke += dt * spec.smoke;
    while (due.smoke >= 1) {
      due.smoke -= 1;
      spawnSmoke(at, radius, height * puff, spec.smokeColour);
    }
  });
}

/** An ember thrown up off the bed: a spark that rises, drifts and cools from yellow to red. */
function spawnEmber(at: THREE.Vector3, radius: number, height: number): void {
  const out = Math.sqrt(Math.random()) * radius * 0.7;
  const angle = Math.random() * Math.PI * 2;
  particles.glow.spawn({
    x: at.x + Math.cos(angle) * out,
    y: at.y + rand(0.1, 0.45) * height,
    z: at.z + Math.sin(angle) * out,
    vx: rand(-0.45, 0.45),
    vy: rand(1.1, 2.6),
    vz: rand(-0.45, 0.45),
    life: rand(0.8, 2.2),
    size: rand(0.03, 0.06),
    sizeEnd: 0.015,
    color: col(0xffc060, 4),
    colorEnd: col(0xff3000, 0.6),
    gravity: -0.35,
    drag: 0.9,
  });
}

/** A puff of smoke off the flames' tips, rising and spreading as it thins. */
function spawnSmoke(at: THREE.Vector3, radius: number, height: number, colour: THREE.ColorRepresentation): void {
  particles.smoke.spawn({
    x: at.x + rand(-0.25, 0.25) * radius,
    y: at.y + height * rand(0.75, 0.95),
    z: at.z + rand(-0.25, 0.25) * radius,
    vx: rand(-0.12, 0.12),
    vy: rand(0.45, 0.85),
    vz: rand(-0.12, 0.12),
    life: rand(2.2, 3.4),
    size: radius * 0.6,
    sizeEnd: radius * 2.6,
    color: col(colour),
    alpha: SMOKE_ALPHA,
    drag: 0.25,
  });
}
