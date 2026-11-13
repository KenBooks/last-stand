// A fire burning on a prop (a brazier's coals, a bonfire's logs): flames as a volume, a fluid simulated once
// (world/fireBake.ts) and played as a loop, each ray through a box over the bed gathering the light its burning gas gives
// and losing what's behind to it, as hot gas does (emission and absorption by one coefficient, after Fire Pro's,
// https://github.com/dgreenheck/threejs-fire-pro, MIT), coloured as a blackbody's heat, so they hold their shape as the
// camera goes round them (sheets turned to the camera turned with it); a bed of coal lumps glowing
// through cracks in their char; embers drifting up and smoke over it. One swell of the flames' height and the light's (a fire a metre across puffs about
// 1.5 times a second) moves them together. `tools/lab` `fire` measures it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { particles, col } from '../fx/particles';
import { rand } from '../util';
import { seeThrough, seeThroughFade } from '../core/seeThrough';
import { inTheFog } from '../core/sight';
import type { Updater } from './props';
import { runPhase } from './runPhase';
import { WEBGPU } from '../core/webgpu';
import { emberNodes, flameMaterial, type EmberLooks, type FlameUniforms } from './fireNodes';
import { BAKE, decodeFrame, DOMAIN, FLAME_LOOK, FRAME_CELLS, KEPT, KEPT_SIZE, LOOP, TILES, type BakedFlames }
  from './fireBake';

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
  /** the logs in it, if any (in its scene's frame, m; up to `LOGS_MOST`): the flames behind them are hidden as they
   *  hide them, and those in front drawn over them */
  logs?: FireLog[];
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

/** A log in a fire, from end to end, its thickness its radius (m): a cylinder with flat ends. */
export interface FireLog {
  from: THREE.Vector3;
  to: THREE.Vector3;
  radius: number;
}

/** the most logs a fire's flames know (a bonfire has 7) */
export const LOGS_MOST = 8;

/** the steps a ray takes through the flames' box: fewer, and the flames read as slices across the view */
const STEPS = 64;
/** the frames a second the loop plays at, as it was simulated */
const LOOP_RATE = 60 / LOOP.stepsEach;
/** how far round its bed the box reaches and how far up it stands, shares of the bed's radius and of the flames' height */
const FLAME_REACH = DOMAIN.half / DOMAIN.bed;
const FLAME_TOP = DOMAIN.high / DOMAIN.flames;
/** a puff's swell of the flames' height, slow and quick (a share of it) */
const PUFF_SLOW = 0.18;
const PUFF_QUICK = 0.04;
/** the slow and quick swells' rates (Hz): value noise at a rate carries its swing under it */
const PUFF_SLOW_HZ = 1.7;
const PUFF_QUICK_HZ = 6.3;
/** how much of a puff the flames' own height takes: the simulation has swells of its own */
const PUFF_SHOWS = 0.25;
/** how much of a puff the light swells by (a share of the flames' swell) */
const LIGHT_SWELL = 1.2;
/** how far the light sways with a puff (m) */
const LIGHT_SWAY = 0.05;
/** how hot a fire's bed glows, against a log's char */
const BED_HEAT = 1.5;
/** a puff of smoke's opacity as it leaves the flames */
const SMOKE_ALPHA = 0.16;

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

/** The two frames of the flames' loop every fire draws now (1 by 1 by 1 and empty until its worker has made it: a
 *  texture's size is all that changes, so no program does), and the wait for it. The loop itself is kept as runs
 *  (`BakedFlames`, about 1 MB), each frame decoded into its slot as the loop comes to it: the loop whole on the GPU was
 *  12.8 MB, and 23 MB before its box was cut to the flames. */
const flamesVolume = new THREE.Data3DTexture(new Uint8Array(1), 1, 1, 1);
flamesVolume.format = THREE.RedFormat;
flamesVolume.minFilter = flamesVolume.magFilter = THREE.LinearFilter;
flamesVolume.wrapS = flamesVolume.wrapT = flamesVolume.wrapR = THREE.ClampToEdgeWrapping;
flamesVolume.unpackAlignment = 1;
flamesVolume.needsUpdate = true;
let flamesBaked: Promise<void> = Promise.resolve();
/** the loop as the worker made it, the frame each slot holds, and a frame's box decoded */
let loop: BakedFlames | null = null;
const inSlot = [-1, -1];
const decoded = new Uint8Array(FRAME_CELLS);

/** The texture holding the frames either side of `moment` (a frame of the loop), each decoded into its slot as it's
 *  first needed: one frame a step of the loop. */
function showMoment(moment: number): void {
  if (!loop) return;
  const first = Math.floor(moment);
  const data = flamesVolume.image.data as Uint8Array;
  const width = KEPT_SIZE.x * TILES.across;
  let changed = false;
  for (const frame of [first, (first + 1) % LOOP.frames]) {
    const slot = frame % TILES.across;
    if (inSlot[slot] === frame) continue;
    decodeFrame(loop, frame, decoded);
    for (let z = 0; z < KEPT_SIZE.z; z++) {
      for (let y = 0; y < KEPT_SIZE.y; y++) {
        const from = (y + z * KEPT_SIZE.y) * KEPT_SIZE.x;
        const to = slot * KEPT_SIZE.x + (y + z * KEPT_SIZE.y) * width;
        data.set(decoded.subarray(from, from + KEPT_SIZE.x), to);
      }
    }
    inSlot[slot] = frame;
    changed = true;
  }
  if (changed) flamesVolume.needsUpdate = true;
}

/** The fire's simulation made by a worker as the game loads, or read back as it was kept. */
export function preloadFlames(): void {
  if (typeof Worker === 'undefined') return;
  flamesBaked = new Promise((resolve) => {
    const worker = new Worker(new URL('./fireBake.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<BakedFlames>) => {
      worker.terminate();
      loop = e.data;
      // (a new size: its storage is made again, by every renderer, on its next use)
      flamesVolume.dispose();
      const width = KEPT_SIZE.x * TILES.across;
      const height = KEPT_SIZE.y * TILES.down;
      flamesVolume.image = { data: new Uint8Array(width * height * KEPT_SIZE.z), width, height, depth: KEPT_SIZE.z };
      inSlot.fill(-1);
      showMoment(0);
      resolve();
    };
    worker.onerror = () => {
      worker.terminate();
      resolve();
    };
    // (the name the lab's pages keep what they make under, `keepAs` in core/kept.ts)
    worker.postMessage({ keepName: (globalThis as { __labMapsAs?: string }).__labMapsAs });
  });
}

/** Resolved once the flames' loop has come (the lab's pages wait for it: landing mid-command, a fire's frame differed). */
export const flamesCome = (): Promise<void> => flamesBaked;

/** `value` written into a shader, as a float whatever it is */
const glsl = (value: number): string => value.toFixed(4);

const FLAME_VERTEX = /* glsl */`
  varying vec3 vFlameWp;
  void main() {
    vFlameWp = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * viewMatrix * vec4(vFlameWp, 1.0);
  }`;

/** The flames' light, gathered along each ray through their box: the simulation's flames there, what a flame gives by its
 *  life (a blackbody's colour and radiance), what's behind it held back by the hot gas alone. */
const FLAME_FRAGMENT = /* glsl */`
  uniform sampler3D uFlames;
  uniform vec3 uCentre;
  uniform vec3 uBox;
  uniform float uRadius;
  uniform float uHeight;
  uniform float uPuff;
  uniform float uGlow;
  uniform float uFrame;
  uniform vec2 uTurn;
  uniform vec2 uBowl[3];
  uniform vec4 uLogs[${LOGS_MOST * 2}];
  varying vec3 vFlameWp;
  // the gas's light at a flame's life: a blackbody's, its colour and radiance by its heat
  vec3 flameColour(float life) {
${FLAME_LOOK.blackbody.slice(1).map(([at, r, g, b, bright], i) => {
    const [before, r0, g0, b0, bright0] = FLAME_LOOK.blackbody[i];
    return `    if (life <= ${glsl(at)}) return mix(vec3(${glsl(r0)}, ${glsl(g0)}, ${glsl(b0)}) * ${glsl(bright0)}, `
      + `vec3(${glsl(r)}, ${glsl(g)}, ${glsl(b)}) * ${glsl(bright)}, (life - ${glsl(before)}) / ${glsl(at - before)});`;
  }).join('\n')}
    return vec3(1.0);
  }
  // the loop at one frame's tile: q's x and y in cells, its z a share of the depth
  float flameTile(vec3 q, float frame) {
    vec2 tile = vec2(mod(frame, ${glsl(TILES.across)}), mod(floor(frame / ${glsl(TILES.across)}), ${glsl(TILES.down)}));
    // (the atlas keeps a box of the grid, KEPT: outside it the clamp reads its empty edge)
    vec2 size = vec2(${glsl(KEPT_SIZE.x)}, ${glsl(KEPT_SIZE.y)});
    vec2 inBox = q.xy * vec2(${glsl(BAKE.nx)}, ${glsl(BAKE.ny)}) - vec2(${glsl(KEPT.x[0])}, ${glsl(KEPT.y[0])});
    vec2 cell = (tile * size + clamp(inBox, vec2(0.5), size - 0.5)) / (size * vec2(${glsl(TILES.across)}, ${glsl(TILES.down)}));
    float deep = (q.z * ${glsl(BAKE.nz)} - ${glsl(KEPT.z[0])}) / ${glsl(KEPT_SIZE.z)};
    return texture(uFlames, vec3(cell, deep)).r;
  }
  // a flame's life at p (m from the bed's middle, up from it), its loop's two frames either side of now eased between
  float flameLife(vec3 p) {
    vec2 across = vec2(p.x * uTurn.x - p.z * uTurn.y, p.x * uTurn.y + p.z * uTurn.x) / uBox.x;
    vec3 q = vec3(across.x * 0.5 + 0.5, p.y / (uHeight * uPuff), across.y * 0.5 + 0.5);
    if (q.y <= 0.0 || q.y >= 1.0 || dot(across, across) >= 1.0) return 0.0;
    float first = floor(uFrame);
    float next = mod(first + 1.0, ${glsl(LOOP.frames)});
    float life = mix(flameTile(q, first), flameTile(q, next), uFrame - first);
    if (life <= 0.004) return 0.0;
    // (the strands: the loop's own middle read finer, mirrored as it repeats so no seam shows)
    vec3 fine = vec3(abs(fract(q.x * ${glsl(FLAME_LOOK.strandsAcross)}) * 2.0 - 1.0) * 0.3 + 0.35,
      0.1 + fract(q.y * ${glsl(FLAME_LOOK.strandsUp)}) * 0.4,
      abs(fract(q.z * ${glsl(FLAME_LOOK.strandsAcross)}) * 2.0 - 1.0) * 0.3 + 0.35);
    float strands = flameTile(fine, first);
    life *= 1.0 - ${glsl(FLAME_LOOK.strandsTake)} * (1.0 - strands);
    float sideFrom = mix(${glsl(FLAME_LOOK.sideFadeFoot)}, ${glsl(FLAME_LOOK.sideFade)}, smoothstep(0.0, ${glsl(FLAME_LOOK.footNarrows)}, q.y));
    float side = 1.0 - smoothstep(sideFrom, sideFrom + 0.3, length(across));
    return life * side * smoothstep(0.0, ${glsl(FLAME_LOOK.footFade)}, q.y);
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
  // where a ray from eye along dir first meets a log, a cylinder from a.xyz to b.xyz a.w thick with flat ends (from
  // the bed's middle), or far off if never: none where a.w is 0. (Capsules' round ends stood past the logs' flat ones,
  // and the flames were cut in a dome round each log's tip, the ground showing through.)
  float logAt(vec3 eye, vec3 dir, vec4 a, vec4 b) {
    vec3 ba = b.xyz - a.xyz;
    float baba = dot(ba, ba);
    if (a.w <= 0.0 || baba < 1e-8) return 1e9;
    vec3 oa = eye - a.xyz;
    float bard = dot(ba, dir);
    float baoa = dot(ba, oa);
    float qa = baba - bard * bard;
    float qb = baba * dot(dir, oa) - baoa * bard;
    float qc = baba * dot(oa, oa) - baoa * baoa - a.w * a.w * baba;
    float h = qb * qb - qa * qc;
    if (h < 0.0) return 1e9;
    h = sqrt(h);
    float t = qa > 1e-8 ? (-qb - h) / qa : -1.0;
    float y = baoa + t * bard;
    if (t > 0.0 && y > 0.0 && y < baba) return t;
    // (past its side's ends: the end it's past, a disc)
    if (abs(bard) < 1e-8) return 1e9;
    float tc = ((y <= 0.0 ? 0.0 : baba) - baoa) / bard;
    return tc > 0.0 && abs(qb + qa * tc) < h ? tc : 1e9;
  }
  // where a ray from eye along dir first meets a log in the fire (uLogs, two a log), far off with none: the march stops
  // there, as a depth test would. (The box's faces are what's depth-tested: the logs inside it were drawn over by the
  // flames behind them, and those reaching out of it hid the flames in front of them, "split exactly in half".)
  float logsAt(vec3 eye, vec3 dir) {
    float hit = 1e9;
    for (int i = 0; i < ${LOGS_MOST}; i++) hit = min(hit, logAt(eye, dir, uLogs[i * 2], uLogs[i * 2 + 1]));
    return hit;
  }
  void main() {
    vec3 eye = cameraPosition - uCentre;
    vec3 dir = normalize(vFlameWp - cameraPosition);
    vec2 span = flameSpan(eye, dir);
    span.y = min(span.y, bowlAt(eye, dir));
    span.y = min(span.y, logsAt(eye, dir));
    // (none of the flames on this ray: its steps all on one point, their light times a stride of 0 still lit the bowl
    // from below)
    if (span.y <= span.x) discard;
    float stride = max(span.y - span.x, 0.0) / float(${STEPS});
    // (each pixel starts its steps a little further in than its neighbours, at random: in step, the slices showed,
    // and by a pattern's offsets, its stripes did through a thin tongue)
    float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    // (from the camera out: burning gas gives light and holds back what's behind it by one coefficient, so it has a body
    // and an edge, where light added alone summed along each ray into a soft cone)
    vec3 light = vec3(0.0);
    float through = 1.0;
    for (int i = 0; i < ${STEPS}; i++) {
      float life = flameLife(eye + dir * (span.x + (float(i) + jitter) * stride));
      if (life <= 0.004) continue;
      float thick = 1.0 - exp(-clamp(life / ${glsl(FLAME_LOOK.glowFullLife)}, 0.0, 1.0) * stride * ${glsl(FLAME_LOOK.thickPerMetre)});
      light += through * thick * flameColour(life);
      through *= 1.0 - thick * smoothstep(${glsl(FLAME_LOOK.holdsFrom)}, ${glsl(FLAME_LOOK.holdsFully)}, life);
      if (through < 0.02) break;
    }
    // (faded as one, by the fade along the view through its middle: each pixel by its own place on the box's faces,
    // the hole's end, a plane across the view, cut the fire in two as the camera came near, "a plane that cuts the
    // fire in two parts"; by its middle alone, the whole fire faded at once as the hole's end passed it)
    vec3 middle = uCentre + vec3(0.0, uHeight * 0.5, 0.0);
    vec3 across = normalize(middle - cameraPosition) * uBox.x;
    float fade = 0.0;
    for (int i = 0; i < 5; i++) fade += seeFadeAt(middle + across * (float(i) * 0.5 - 1.0));
    float kept = 1.0 - fade / 5.0;
    gl_FragColor = vec4(light * ${glsl(FLAME_LOOK.glow)} * uGlow * kept, (1.0 - through) * kept);
  }`;

/** the numbers the flames' shader is written with, for its WGSL (fireNodes.ts) */
const FLAME_SHAPE = {
  steps: STEPS, look: FLAME_LOOK,
  tiles: TILES, cells: BAKE, kept: KEPT, keptSize: KEPT_SIZE, frames: LOOP.frames,
};

/** `logs` (in a scene's frame, its world matrix `toWorld`) into the flames' `uLogs`, each end from the bed's middle
 *  `centre` (in the world), the rest 0 thick. */
function knowLogs(known: THREE.Vector4[], logs: FireLog[], toWorld: THREE.Matrix4, centre: THREE.Vector3): void {
  if (logs.length > LOGS_MOST) throw new Error(`a fire's flames know ${LOGS_MOST} logs at most, not ${logs.length}`);
  const fromCentre = (end: THREE.Vector3) => end.clone().applyMatrix4(toWorld).sub(centre);
  logs.forEach((log, i) => {
    known[i * 2].set(...fromCentre(log.from).toArray(), log.radius);
    known[i * 2 + 1].set(...fromCentre(log.to).toArray(), 0);
  });
}

/** A fire's flames' box over its bed's middle (m): as far round as their tongues bend, as high as their tallest puff. */
function flameBox(radius: number, height: number): THREE.Vector3 {
  const reach = radius * FLAME_REACH;
  return new THREE.Vector3(reach, height * FLAME_TOP * (1 + PUFF_SLOW + PUFF_QUICK) * 1.02, reach);
}

/** A bowl the flames' shader knows as none (its rim under its foot). */
const noBowl = (): THREE.Vector2[] => [0, 0, -1].map((y) => new THREE.Vector2(y, 0));

/** A fire's flames' material, for its bed's `radius` and its flames' `height` (m), by its seed. */
function flameMat(radius: number, height: number, seed: number): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uFlames: { value: flamesVolume },
      uCentre: { value: new THREE.Vector3() },
      uBox: { value: flameBox(radius, height) },
      uRadius: { value: radius },
      uHeight: { value: height * FLAME_TOP },
      uPuff: { value: 1 },
      uGlow: { value: 1 },
      // (each fire its own way round, so no two show the same flames)
      uFrame: { value: 0 },
      uTurn: { value: new THREE.Vector2(Math.cos(seed * 6.283), Math.sin(seed * 6.283)) },
      // (none: its rim under its foot)
      uBowl: { value: noBowl() },
      // (none: each 0 thick)
      uLogs: { value: Array.from({ length: LOGS_MOST * 2 }, () => new THREE.Vector4()) },
    },
    vertexShader: FLAME_VERTEX,
    fragmentShader: FLAME_FRAGMENT,
    transparent: true,
    depthWrite: false,
    // (its light over what it hides: added, it washed out over anything bright, the daylit forest above all)
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
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
  const seed = rng();
  const flames = flameMat(radius, height, seed);
  // (the shader, the embers and the smoke read the world: laid out in a group turned and moved, as the yard's torches
  // are, the sparks rose from the group's own numbers, on the plaza, "weird particles like fire burning")
  scene.updateWorldMatrix(true, false);
  const inWorld = at.clone().applyMatrix4(scene.matrixWorld);
  flames.uniforms.uCentre.value.copy(inWorld);
  flames.uniforms.uGlow.value = spec.glow ?? 1;
  if (spec.bowl) flames.uniforms.uBowl.value = spec.bowl.map(([y, r]) => new THREE.Vector2(y, r));
  knowLogs(flames.uniforms.uLogs.value, spec.logs ?? [], scene.matrixWorld, inWorld);
  const box = flameBox(radius, height);
  const drawnWith = WEBGPU ? flameMaterial(flames.uniforms as unknown as FlameUniforms, FLAME_SHAPE) : flames;
  const volume = new THREE.Mesh(new THREE.BoxGeometry(box.x * 2, box.y, box.z * 2).translate(0, box.y / 2, 0), drawnWith);
  volume.userData.noMeshlets = true;
  // (found by the profiler, perf/sceneParts.ts, to time the flames alone)
  volume.userData.fireFlames = true;
  // (its box stands over the bed unturned: the shader reads the ray in the world, from `uCentre`)
  volume.position.copy(at);
  // (drawn after the smoke, before the glows)
  volume.renderOrder = 15;
  scene.add(volume);
  const lightAt = light.position.clone();
  const due = runPhase({ embers: 0, smoke: 0 });
  updaters.push((dt, t) => {
    emberTime.value = t;
    // (what he can't see plays out nothing, from play, "fire should not animate when in fog of war": its flames held at
    // the moment they had, none of the loop decoded for it, no embers or smoke)
    if (inTheFog(inWorld.x, inWorld.z)) return;
    const puff = puffAt(t, seed);
    flames.uniforms.uPuff.value = 1 + (puff - 1) * PUFF_SHOWS;
    // (every fire at one moment of the loop, so the GPU holds two frames of it, each fire turned its own way and puffing
    // on its own swell)
    const moment = (t * LOOP_RATE) % LOOP.frames;
    showMoment(moment);
    flames.uniforms.uFrame.value = moment;
    light.intensity = spec.intensity * (1 + (puff - 1) * LIGHT_SWELL);
    light.position.set(lightAt.x + (puff - 1) * LIGHT_SWAY, lightAt.y + (puff - 1) * LIGHT_SWAY * 2, lightAt.z);
    due.embers += dt * spec.embers;
    while (due.embers >= 1) {
      due.embers -= 1;
      spawnEmber(inWorld, radius, height);
    }
    due.smoke += dt * spec.smoke;
    while (due.smoke >= 1) {
      due.smoke -= 1;
      spawnSmoke(inWorld, radius, height * puff, spec.smokeColour);
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
    vy: rand(1.4, 3.2),
    vz: rand(-0.45, 0.45),
    life: rand(0.7, 1.9),
    size: rand(0.018, 0.036),
    sizeEnd: 0.008,
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
