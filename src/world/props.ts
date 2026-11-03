// Building blocks shared by the biome arenas: the biome contract, UV-scaled boxes, instancing
// and geometry helpers, the spawn-portal membrane, the environment map and the static shadow bake.
import * as THREE from 'three';
import { seeThroughFade } from '../core/seeThrough';
import { WEBGPU, gpu, pipelinesAtOnce, webgpuSceneTarget } from '../core/webgpu';
import { portShader } from '../core/shaderPorts';
import { membraneMaterial, spillMaterial } from './portalNodes';
import { daySkyMaterial, nightSkyMaterial } from './skyNodes';
import { drawingStill, inShadowsOnly } from './culling';
import { bySide, casterMaterial, piecesOf, type Piece } from './breakableShadows';
import { rand, TAU } from '../util';
import { valueNoise3 } from '../core/patterns';
import { particles } from '../fx/particles';
import { canvasOf, ctx2d, textureFromCanvas } from '../core/textures';
import type { Obstacle } from '../types';
import type { Prop } from './destructible';
import type { Relief } from './ground';
import type { Wall } from './wall';
import { runPhase } from './runPhase';

export type Updater = (dt: number, t: number) => void;
/** Linear RGB, used as-is in shaders. */
export type RGB = [number, number, number];

/** A spawn gate: where enemies enter and the direction into the arena. */
export interface Portal { pos: THREE.Vector3; dir: THREE.Vector3; pulse(): void }

/** Scene-wide lighting a biome sets when it becomes active (the lights themselves are shared). */
export interface BiomeLook {
  background: number;
  fog: { color: number; near: number; far: number };
  hemi: { sky: number; ground: number; intensity: number };
  moon: { color: number; intensity: number; pos: [number, number, number] };
  /** its environment's colours: the map made as the biome is first shown (`envMap`) */
  env: EnvColours;
  envIntensity: number;
  /** how much brighter the biome's ordinary scenes are than the crypt's: scales the top view's large adaptation target (default 1) */
  adapt?: number;
}

/**
 * What a biome builder returns. Everything it creates goes into its own group, which is
 * hidden while another biome is active. Every biome must add the same number of point
 * lights (6): the light count is part of every lit shader, so a different count would
 * recompile them all when switching.
 */
export interface Biome {
  look: BiomeLook;
  obstacles: Obstacle[];
  /** the breakable ones among them (a prop's index is its id on the network) */
  props: Prop[];
  portals: Portal[];
  /** what lies on its floor that feet step onto (`world/ground.ts`) */
  relief?: Relief;
  /** its wall as drawn, and what stands beyond it (`world/wall.ts`): sealed by the arena once built */
  wall: Wall;
  setCalm(v: number): void;
  update(dt: number, t: number): void;
  /** the props a run shapes anew built again from its seed (the crypt's columns, the forest's stumps): the same on
   *  every game in co-op, as each judges its own hits on them */
  roll?(seed: number): void;
}

export type BiomeBuilder = (group: THREE.Group) => Biome;

export const WALL_R = 28.5;   // radius of the arena's boundary (inner face)
export const GATE_W = 4.2;    // spawn gate width

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

/** the point lights casting the shadows of what stands still (`staticShadow`) */
const stillShadows = new Set<THREE.PointLight>();
/** their shadow maps' size (px a face of the cube), their nearest (m), their bias and their edges' softness */
const STILL_SHADOW = { size: 512, near: 0.3, bias: -0.004, radius: 3 };

/**
 * `light` casting the shadows of what stands in its biome (the props, the wall, the trees), drawn only when they change
 * (`drawStillShadows`): a point light lit everything round it through the props, its reflection on the crypt's marble
 * walks through a column ("shadows on ground for reflected lights still dont work"). Each biome's two warmest (the
 * braziers, the bonfires): a biome casting another count would compile every lit program again as it's shown, and
 * each light that casts is a lit shader's point light written out again (`loopPointLights` in `core/renderer.ts`).
 */
export function staticShadow(light: THREE.PointLight): void {
  light.castShadow = true;
  light.shadow.mapSize.set(STILL_SHADOW.size, STILL_SHADOW.size);
  light.shadow.camera.near = STILL_SHADOW.near;
  light.shadow.bias = STILL_SHADOW.bias;
  light.shadow.radius = STILL_SHADOW.radius;
  light.shadow.autoUpdate = false;
  // (drawn by three's own pass as it's first lit, so a lit shader finds its map; drawn again of what stands still)
  light.shadow.needsUpdate = true;
  stillShadows.add(light);
}

/** what the still shadows are drawn into: nothing seen, a pixel (`drawStillShadows`) */
let stillTarget: THREE.WebGLRenderTarget | null = null;

/** Whether `object` draws (a mesh, points, a line, a sprite). */
const draws = (object: THREE.Object3D): boolean => (object as THREE.Mesh).isMesh || (object as THREE.Points).isPoints
  || (object as THREE.Line).isLine || (object as THREE.Sprite).isSprite;

/** Whether a light stands in `object` or under it. */
function holdsLight(object: THREE.Object3D): boolean {
  let found = false;
  object.traverse((part) => { if ((part as THREE.Light).isLight) found = true; });
  return found;
}

/** What draws under `parent` outside `shown` hidden, into `hidden`: never a light, nor what holds one (each hidden
 *  light changes the count every lit program is made for, and the still shadows' render compiled 26 of them anew),
 *  which casts nothing meanwhile instead, into `uncast`. */
function hideBodies(parent: THREE.Object3D, shown: THREE.Object3D, hidden: THREE.Object3D[], uncast: THREE.Object3D[]): void {
  for (const child of parent.children) {
    if (child === shown || !child.visible) continue;
    if (draws(child) && !holdsLight(child)) {
      child.visible = false;
      hidden.push(child);
      continue;
    }
    if (draws(child) && child.castShadow) {
      child.castShadow = false;
      uncast.push(child);
    }
    hideBodies(child, shown, hidden, uncast);
  }
}

/**
 * The shadow maps of `shown`'s still-shadow lights drawn again, of what stands in it alone: every other part of the
 * scene (the heroes, the foes, the arrows, the rubble) hidden meanwhile, as a shadow drawn once of a body would stay
 * where it stood. By a render of their own, into a pixel, `kept`'s shadow map left as it is (the moon's: drawn again
 * by the frame's own render): three's shadow pass reads the render's state, and called alone it threw.
 */
export function drawStillShadows(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera,
  shown: THREE.Group, kept: THREE.LightShadow): void {
  const lights = [...stillShadows].filter((light) => shown.getObjectById(light.id));
  if (!lights.length) return;
  // (on WebGPU the scene pass's own target, which the frame draws over: a pipeline is made for its target's format
  // and samples, and in a pixel of its own each prop in view had one made at the draw, a breaking prop's frame held
  // up 260 to 300 ms)
  const into = WEBGPU ? webgpuSceneTarget() as THREE.WebGLRenderTarget : stillTarget ??= new THREE.WebGLRenderTarget(1, 1);
  const hidden: THREE.Object3D[] = [];
  const uncast: THREE.Object3D[] = [];
  hideBodies(scene, shown, hidden, uncast);
  const keptAuto = kept.autoUpdate;
  const target = renderer.getRenderTarget();
  for (const light of lights) light.shadow.needsUpdate = true;
  kept.autoUpdate = false;
  renderer.setRenderTarget(into);
  try {
    drawingStill(shown, () => pipelinesAtOnce(() => renderer.render(scene, camera)));
  } finally {
    renderer.setRenderTarget(target);
    kept.autoUpdate = keptAuto;
    for (const child of hidden) child.visible = true;
    for (const child of uncast) child.castShadow = true;
  }
}

/** how far a prop's contact shadow reaches past its circle (a share of its radius), and how dark its middle is */
const CONTACT_REACH = 1.7;
const CONTACT_DARK = 0.7;

/** A soft round shadow's alpha, dark in its middle and gone at its edge. */
function contactTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = canvasOf(size);
  const g = ctx2d(canvas);
  const fall = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (let k = 0; k <= 8; k++) {
    // (eased out: a straight fall read as a disc with an edge)
    const t = k / 8;
    fall.addColorStop(t, `rgba(0,0,0,${((1 - t) ** 2 * (1 + t)).toFixed(3)})`);
  }
  g.fillStyle = fall;
  g.fillRect(0, 0, size, size);
  return textureFromCanvas(canvas, false);
}

/**
 * The contact shadows under a biome's props: a soft dark patch on the floor round each obstacle circle, one instanced
 * draw, gone with its prop as it breaks and back as it's restored. The moon's shadow falls away from a prop, and under
 * it the floor was lit to its foot by the sky: a fallen drum or a column stood on the floor as if pasted over it.
 * Returns its updater (each prop's patch shown while it stands).
 */
export function contactShadows(scene: THREE.Object3D, obstacles: Obstacle[]): Updater {
  const circles = [...obstacles];
  const mat = new THREE.MeshBasicMaterial({
    color: 0x000000, alphaMap: contactTexture(), transparent: true, opacity: CONTACT_DARK, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat, circles.length);
  const standing = circles.map(() => true);
  const place = (i: number, shown: boolean): void => {
    const o = circles[i], d = shown ? o.r * 2 * CONTACT_REACH : 0;
    // (just over the floor and the crypt's walks, under anything on them)
    setInstance(mesh, i, o.x, 0.03, o.z, 0, 0, 0, d, 1, d);
  };
  circles.forEach((_, i) => place(i, true));
  mesh.name = 'contact shadows';
  mesh.renderOrder = -1;
  scene.add(mesh);
  return () => {
    let changed = false;
    circles.forEach((o, i) => {
      const shown = !o.prop?.broken;
      if (shown === standing[i]) return;
      standing[i] = shown;
      place(i, shown);
      changed = true;
    });
    if (changed) mesh.instanceMatrix.needsUpdate = true;
  };
}

/** where a biome's small trees may stand: `n` of them `near` to `far` m from the middle, `apart` from each other */
export interface TreeSpots { n: number; near: number; far: number; apart: number }
/**
 * Spots for a biome's small trees in the play area, one in each of `n` equal slices of the ring round the middle (drawn
 * anywhere, three of the forest's six stood within a quarter of it, by one gate), from a stream of their own (`rng`:
 * drawn from the biome's, every prop placed after them would move): clear of the gates' lanes (`laneGap`: an angle's
 * from the nearest gate's), of every obstacle by 1.5 m and of what `keepOff` says. A slice with no room has none.
 */
export function treeSpots(rng: () => number, { n, near, far, apart }: TreeSpots, laneGap: (a: number) => number,
  obstacles: Obstacle[], keepOff: (x: number, z: number) => boolean = () => false): [number, number][] {
  const spots: [number, number][] = [];
  for (let slice = 0; slice < n; slice++) {
    for (let tries = 0; tries < 400; tries++) {
      const a = (slice + rng()) / n * TAU;
      // (even over the slice's area, not crowded towards the middle)
      const rr = Math.sqrt(near * near + rng() * (far * far - near * near));
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      // (a gate's lane: half its width and the way the foes walk in from it)
      if (laneGap(a) * rr < GATE_W) continue;
      if (keepOff(x, z) || obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + 1.5)) continue;
      if (spots.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < apart)) continue;
      spots.push([x, z]);
      break;
    }
  }
  return spots;
}
export function setInstance(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, rx: number, ry: number, rz: number, sx: number, sy = sx, sz = sx): void {
  _e.set(rx, ry, rz); _q.setFromEuler(_e);
  mesh.setMatrixAt(i, _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)));
}

/** Nudge every vertex along its direction from the origin by a hash of its position, so
 * duplicated (non-indexed) corners move together and the surface stays closed. */
export function lumpy(g: THREE.BufferGeometry, amount: number, seed: number): THREE.BufferGeometry {
  const pos = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = Math.sin(v.x * 12.9898 + v.y * 78.233 + v.z * 37.719 + seed) * 43758.5453;
    const n = (k - Math.floor(k)) * 2 - 1;
    v.multiplyScalar(1 + n * amount);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Each face's UVs laid from the side it faces most (box mapping), in its geometry's units: a map's tile a unit across
 *  whichever way a face turns (`g` unindexed). */
export function boxUVs(g: THREE.BufferGeometry): void {
  const p = g.attributes.position, uv = g.attributes.uv;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), q = new THREE.Vector3();
  for (let i = 0; i + 2 < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    const n = b.sub(a).cross(c.sub(a)), x = Math.abs(n.x), y = Math.abs(n.y), z = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      q.fromBufferAttribute(p, i + k);
      if (y >= x && y >= z) uv.setXY(i + k, q.x, q.z);
      else if (x >= z) uv.setXY(i + k, q.z, q.y);
      else uv.setXY(i + k, q.x, q.y);
    }
  }
}

/**
 * A rock about `radius` round: an icosphere pushed in and out by sdf's solid noise in two sizes (lumps, then chips),
 * its foot flattened to sit on the ground, each face its own normal (facets, as split stone has), and box-mapped UVs in
 * metres (a polyhedron's own wrap a sphere's map round it: stretched 2 to 1 and pinched at its poles, `lab tiles`).
 */
export function boulderGeo(seed: number, radius = 1, detail = 2): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const lump = valueNoise3(v.x * 1.6, v.y * 1.6, v.z * 1.6, seed) - 0.5;
    const chip = valueNoise3(v.x * 4, v.y * 4, v.z * 4, seed + 1) - 0.5;
    v.multiplyScalar(radius * (1 + 0.5 * lump + 0.14 * chip));
    if (v.y < -0.3 * radius) v.y = -0.3 * radius + (v.y + 0.3 * radius) * 0.25;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  boxUVs(g);
  g.computeVertexNormals();
  return g;
}

/** A tuft of thin curved blades with vertex colors (`base` at the root, `tip` at the tips, linear
 * RGB); normals point up so the tufts light like the ground they grow from. */
export function buildGrassGeo(rng: () => number, base: RGB, tip: RGB): THREE.BufferGeometry {
  const pos: number[] = [], colr: number[] = [];
  for (let i = 0; i < 7; i++) {
    const a = rng() * TAU, d = rng() * 0.12, w = 0.03 + rng() * 0.02, ht = 0.25 + rng() * 0.3, bend = 0.08 + rng() * 0.12;
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d, px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    pos.push(cx - px, 0, cz - pz, cx + px, 0, cz + pz, cx + Math.cos(a) * bend, ht, cz + Math.sin(a) * bend);
    colr.push(...base, ...base, ...tip);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  return g;
}

/** A tuft's blades' colours: at the root, halfway up and at the tip (linear RGB), and the share of tips yellowed. */
export interface TuftColours { root: RGB; mid: RGB; tip: RGB; dry: RGB; dryShare: number }

/**
 * A tuft of grass: `blades` blades, each a strip tapering to its tip in `SEGMENTS` segments, curving out and over as it
 * rises (its lean growing with the square of its height) and twisting a little, coloured from a dark root to a lighter
 * tip (some tips yellowed). Its normals lie between the blade's face and straight up, so a tuft is lit round rather
 * than as flat cards.
 */
export function buildGrassTuft(rng: () => number, blades: number, c: TuftColours): THREE.BufferGeometry {
  const SEGMENTS = 3;
  const pos: number[] = [], nor: number[] = [], col: number[] = [];
  const mix = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  for (let i = 0; i < blades; i++) {
    // rooted round the tuft's middle, leaning out from it
    const at = rng() * TAU, d = Math.sqrt(rng()) * 0.09, cx = Math.cos(at) * d, cz = Math.sin(at) * d;
    const lean = at + (rng() - 0.5) * 1.2, height = 0.25 + rng() * 0.35, width = 0.016 + rng() * 0.016;
    const over = height * (0.2 + rng() * 0.55), twist = (rng() - 0.5) * 1.4, shade = 0.75 + rng() * 0.45;
    const tip = rng() < c.dryShare ? c.dry : c.tip;
    const lx = Math.cos(lean), lz = Math.sin(lean);
    // a point up the blade (k: 0 at the root, 1 at the tip), `side` of its width
    const point = (k: number, side: number): [number, number, number] => {
      const turn = lean + Math.PI / 2 + twist * k, half = width * Math.pow(1 - k, 0.8) * side;
      const out = over * k * k;
      return [cx + lx * out + Math.cos(turn) * half, height * (k - 0.35 * (over / height) * k * k * k), cz + lz * out + Math.sin(turn) * half];
    };
    // the face's normal blended with up, outward a little
    const normal = (k: number): [number, number, number] => {
      const turn = lean + twist * k, nx = Math.cos(turn) * 0.55 + lx * 0.2, nz = Math.sin(turn) * 0.55 + lz * 0.2, ny = 0.8;
      const len = Math.hypot(nx, ny, nz);
      return [nx / len, ny / len, nz / len];
    };
    const colour = (k: number): RGB => {
      const base = k < 0.5 ? mix(c.root, c.mid, k * 2) : mix(c.mid, tip, (k - 0.5) * 2);
      return [base[0] * shade, base[1] * shade, base[2] * shade];
    };
    const vertex = (k: number, side: number) => { pos.push(...point(k, side)); nor.push(...normal(k)); col.push(...colour(k)); };
    for (let s = 0; s < SEGMENTS; s++) {
      const k0 = s / SEGMENTS, k1 = (s + 1) / SEGMENTS;
      if (s === SEGMENTS - 1) {
        vertex(k0, -1); vertex(k0, 1); vertex(k1, 0);
        continue;
      }
      vertex(k0, -1); vertex(k0, 1); vertex(k1, 1);
      vertex(k0, -1); vertex(k1, 1); vertex(k1, -1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

// Box whose UVs are scaled by world size so textures don't stretch.
export function boxWithUV(w: number, h: number, d: number, texel = 0.5): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv, n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const sw = ax > 0.5 ? d : w, sh = ay > 0.5 ? d : h;
    uv.setXY(i, uv.getX(i) * sw * texel, uv.getY(i) * sh * texel);
  }
  return g;
}

/**
 * Swirling portal membrane (a GATE_W x 4.4 plane standing at local z = 0.1) that
 * brightens when enemies come through: a twisting vortex with a dark heart and a bright core
 * inside a crackling rim, light spilling onto the floor in front, and motes drawn into it.
 * Square-cornered by default (a gate with a lintel), round-topped with `arch`.
 * Returns the portal for the gate at `angle`.
 */
/** a portal's light (each gate's one of its biome's point lights): how bright, how far it reaches (m), how far out in
 *  front of the membrane and how high it stands, and how much more as foes come through (`pulse`) */
const PORTAL_LIGHT = { intensity: 7, reach: 11, out: 1.2, up: 2.0, pulse: 1.2 };

export function portalMembrane(parent: THREE.Object3D, angle: number, colors: { a: RGB; b: RGB; core: RGB }, updaters: Updater[], arch = false): { mesh: THREE.Mesh; portal: Portal } {
  const uniforms = {
    uTime: { value: 0 }, uPower: { value: 0.4 }, uArch: { value: arch ? 1 : 0 },
    uA: { value: new THREE.Color(...colors.a) }, uB: { value: new THREE.Color(...colors.b) }, uCore: { value: new THREE.Color(...colors.core) },
  };
  const noise = `
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int k = 0; k < 4; k++) { v += n(p) * a; p = p * 2.03 + 17.1; a *= 0.5; } return v; }`;
  // alpha-blended, not additive: the vortex hides what's behind the gate
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      varying vec2 vUv; uniform float uTime; uniform float uPower; uniform float uArch; uniform vec3 uA; uniform vec3 uB; uniform vec3 uCore;
      ${noise}
      void main(){
        vec2 p = vUv*2.0-1.0;
        // rounded rectangle filling the opening: sd < 0 inside
        vec2 q = abs(p) - vec2(0.72, 0.8);
        float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.14;
        // or straight sides under a round top
        float archSd = p.y > 0.08 ? length(vec2(p.x, p.y - 0.08)) - 0.8 : max(abs(p.x) - 0.8, -0.92 - p.y);
        sd = mix(sd, archSd, uArch);
        float r = length(p * vec2(1.0, 0.95));
        // twist the plane round the centre, tighter towards it (no atan: no seam)
        float tw = 3.2 * (1.0 - smoothstep(0.0, 1.1, r)) + uTime * 0.9;
        vec2 w = mat2(cos(tw), -sin(tw), sin(tw), cos(tw)) * p;
        float arms = fbm(w * 2.2 + vec2(0.0, uTime * 0.25));
        float fine = fbm(w * 5.5 - uTime * 0.4);
        vec3 c = mix(uA * 0.3, uB, smoothstep(0.35, 0.75, arms)) * (0.35 + fine * 1.3);
        // a dark heart round a bright pinpoint core
        c *= mix(0.25, 1.0, smoothstep(0.08, 0.6, r));
        c += uCore * (exp(-r * r * 60.0) * 1.6 + exp(-r * r * 8.0) * 0.25);
        // sparks swept round with the swirl
        vec2 sg = w * 9.0 + vec2(uTime * 0.7, 0.0);
        c += uCore * step(0.965, h(floor(sg))) * (1.0 - smoothstep(0.1, 0.5, length(fract(sg) - 0.5))) * 1.2;
        float inside = 1.0 - smoothstep(-0.03, 0.02, sd);
        // crackling rim along the edge
        float crackle = 0.6 + 0.8 * n(p * 7.0 + vec2(uTime * 3.0, -uTime * 2.0));
        vec2 e = min(vUv, 1.0 - vUv);
        float rim = (exp(-abs(sd) * 30.0) * crackle + exp(-abs(sd) * 8.0) * 0.25) * smoothstep(0.0, 0.06, min(e.x, e.y));
        c = c * inside + mix(uB, uCore, 0.55) * rim;
        gl_FragColor = vec4(c * uPower * 2.3, clamp(inside * 0.94 + rim, 0.0, 1.0) * (1.0 - seeFade()));
      }`,
  });
  // (it hides what's behind the gate, the hero too: it fades as the gate round it dissolves)
  seeThroughFade(mat, 'prop');
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(GATE_W, 4.4), WEBGPU ? membraneMaterial(uniforms) : mat);
  mesh.position.set(0, 2.2, 0.1);
  parent.add(mesh);
  // light spilling across the floor in front of the gate
  const spillMat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      varying vec2 vUv; uniform float uTime; uniform float uPower; uniform vec3 uB; uniform vec3 uCore;
      ${noise}
      void main(){
        vec2 p = vec2((vUv.x - 0.5) * 1.6, vUv.y);
        float g = exp(-dot(p, p) * 3.5) * (0.75 + 0.5 * n(vec2(vUv.x * 5.0, vUv.y * 3.0 - uTime * 0.8)));
        gl_FragColor = vec4(mix(uB, uCore, 0.3) * g * uPower * 0.55, 1.0);
      }`,
  });
  const spill = new THREE.Mesh(new THREE.PlaneGeometry(GATE_W + 2.5, 4).rotateX(-Math.PI / 2).rotateY(Math.PI),
    WEBGPU ? spillMaterial(uniforms) : spillMat);
  spill.position.set(0, 0.04, 2.0);
  parent.add(spill);
  // its light on what stands round it: the arch, the wall, the floor, a body coming through (a glow on the floor alone,
  // "portals emit no light")
  const glow = new THREE.PointLight(new THREE.Color(...colors.b).lerp(new THREE.Color(...colors.core), 0.5),
    PORTAL_LIGHT.intensity, PORTAL_LIGHT.reach, 2);
  glow.position.set(0, PORTAL_LIGHT.up, PORTAL_LIGHT.out);
  parent.add(glow);

  const pos = new THREE.Vector3(Math.cos(angle) * (WALL_R - 2.5), 0, Math.sin(angle) * (WALL_R - 2.5));
  const dir = new THREE.Vector3(-Math.cos(angle), 0, -Math.sin(angle));
  // the membrane's centre in the world, and the direction along it
  const cx = Math.cos(angle) * (WALL_R + 0.7), cz = Math.sin(angle) * (WALL_R + 0.7), sx = -Math.sin(angle), sz = Math.cos(angle);
  const coreCol = new THREE.Color(...colors.core), edgeCol = new THREE.Color(...colors.b), mistCol = new THREE.Color(...colors.a);
  const due = runPhase({ pulse: 0, acc: 0 });
  updaters.push((dt, t) => {
    due.pulse = Math.max(0, due.pulse - dt * 0.8);
    const pulse = due.pulse;
    uniforms.uTime.value = t;
    uniforms.uPower.value = 0.35 + pulse * 1.3;
    glow.intensity = PORTAL_LIGHT.intensity * (1 + pulse * PORTAL_LIGHT.pulse);
    due.acc += dt * (1 + pulse * 4);
    while (due.acc > 0.07) {
      due.acc -= 0.07;
      // motes drawn in from the rim towards the core
      const a = Math.random() * TAU, ex = Math.cos(a) * GATE_W * 0.48, ey = 2.2 + Math.sin(a) * 2.1;
      particles.glow.spawn({
        x: cx + sx * ex, y: ey, z: cz + sz * ex, vx: -sx * ex * 1.1, vy: (2.2 - ey) * 1.1, vz: -sz * ex * 1.1,
        life: rand(0.6, 0.9), size: rand(0.05, 0.1), color: edgeCol.clone().multiplyScalar(1.6), colorEnd: coreCol.clone().multiplyScalar(0.6), drag: 0.5,
      });
      // and a low mist spilling out onto the floor
      if (Math.random() < 0.15) {
        const u = rand(-1.6, 1.6);
        particles.smoke.spawn({
          x: cx + sx * u + dir.x * 0.6, y: 0.25, z: cz + sz * u + dir.z * 0.6, vx: dir.x * rand(0.4, 0.8), vy: 0.02, vz: dir.z * rand(0.4, 0.8),
          life: rand(2.5, 4), size: rand(1.5, 2.5), sizeEnd: 4, color: mistCol.clone().multiplyScalar(0.8), alpha: 0.12,
        });
      }
    }
  });
  return { mesh, portal: { pos, dir, pulse() { due.pulse = 1; } } };
}

/** Night sky dome: fog colour at the horizon (where the ground fades into it), a faint glow
 * just above, `zenith` overhead, a moon towards `moonDir` and a sprinkle of stars. Unfogged, behind everything. */
export function buildSky(fogColor: number, moonDir: THREE.Vector3, zenith: RGB = [0.004, 0.005, 0.012]): THREE.Mesh {
  const fog = new THREE.Color(fogColor);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uFog: { value: new THREE.Vector3(fog.r, fog.g, fog.b) }, uMoon: { value: moonDir }, uZenith: { value: new THREE.Vector3(...zenith) } },
    side: THREE.BackSide, depthWrite: false, fog: false,
    // on the far plane, drawn after everything opaque: the depth test skips every covered pixel
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: `
      varying vec3 vDir; uniform vec3 uFog; uniform vec3 uMoon; uniform vec3 uZenith;
      // no sin(): its precision loss on big cell coordinates lines the stars up in rings round the zenith
      float h(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      void main(){
        vec3 d = normalize(vDir);
        float y = max(d.y, 0.0);
        vec3 c = mix(uFog, uFog * vec3(1.5, 1.45, 1.35), 1.0 - smoothstep(0.0, 0.18, abs(y - 0.05)));
        c = mix(c, uZenith, smoothstep(0.08, 0.7, y));
        float m = max(dot(d, uMoon), 0.0);
        c += vec3(0.06, 0.07, 0.12) * pow(m, 300.0) + vec3(0.02, 0.025, 0.04) * pow(m, 8.0);
        c = mix(c, vec3(0.5, 0.54, 0.64) * (0.85 + 0.15 * h(floor(d * 900.0))), smoothstep(0.99988, 0.99993, m));
        // cubic cells cut the sphere unevenly (more cells towards the diagonals): scale them to even the density out
        vec3 ad = abs(d);
        vec3 g = floor(d * 700.0);
        float dens = 0.004 * 1.732 / (ad.x + ad.y + ad.z);
        float b = h(g + 1.0);
        vec3 tint = mix(vec3(0.6, 0.68, 1.0), vec3(1.0, 0.85, 0.7), h(g + 2.0));
        c += tint * 0.55 * step(1.0 - dens, h(g)) * smoothstep(0.12, 0.4, y) * (0.25 + 1.1 * b * b * b);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 16), WEBGPU ? nightSkyMaterial(mat.uniforms) : mat);
  sky.renderOrder = 100;
  sky.frustumCulled = false;
  return sky;
}

/** Day sky dome: `horizon` (the fog colour, where the ground fades into it) rising into `zenith`, a sun
 * towards `sunDir` with a warm glow round it, and slow soft clouds. Unfogged, behind everything. */
export function buildDaySky(horizon: number, zenith: RGB, sunDir: THREE.Vector3): { mesh: THREE.Mesh; update: (t: number) => void } {
  const hz = new THREE.Color(horizon);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uHorizon: { value: new THREE.Vector3(hz.r, hz.g, hz.b) }, uZenith: { value: new THREE.Vector3(...zenith) }, uSun: { value: sunDir.clone().normalize() }, uTime: { value: 0 } },
    side: THREE.BackSide, depthWrite: false, fog: false,
    // on the far plane, drawn after everything opaque: the depth test skips every covered pixel
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: `
      varying vec3 vDir; uniform vec3 uHorizon; uniform vec3 uZenith; uniform vec3 uSun; uniform float uTime;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        vec3 d = normalize(vDir);
        float y = max(d.y, 0.0);
        vec3 c = mix(uHorizon, uZenith, smoothstep(0.0, 0.55, y));
        float m = max(dot(d, uSun), 0.0);
        c += vec3(0.5, 0.42, 0.28) * pow(m, 12.0) * 0.35 + vec3(1.0, 0.92, 0.75) * smoothstep(0.9993, 0.9996, m) * 2.5;
        // clouds on a plane overhead, thinning towards the horizon
        vec2 p = d.xz / max(d.y, 0.08) * 1.6 + vec2(uTime * 0.01, uTime * 0.004);
        float cl = n(p) * 0.55 + n(p * 2.3 + 5.0) * 0.3 + n(p * 5.1 + 9.0) * 0.15;
        cl = smoothstep(0.5, 0.8, cl) * smoothstep(0.04, 0.3, y);
        c = mix(c, uHorizon * 1.25 + vec3(0.08, 0.07, 0.05) * pow(m, 4.0), cl * 0.7);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 16), WEBGPU ? daySkyMaterial(mat.uniforms) : mat);
  mesh.renderOrder = 100;
  mesh.frustumCulled = false;
  return { mesh, update: (t) => { mat.uniforms.uTime.value = t; } };
}

/** Place a gate group on the boundary at `angle`, its local +Z facing the arena center. */
export function placeGate(g: THREE.Object3D, angle: number): void {
  const r = WALL_R + 0.8;
  g.position.set(Math.cos(angle) * r, 0, Math.sin(angle) * r);
  g.lookAt(0, 0, 0);
}

/** A biome's environment's colours: its sky's, and its one soft panel's. */
export interface EnvColours { sky: RGB; panel: RGB }
/** the environments made, by their colours (`envMap`) */
const envMaps = new Map<string, THREE.Texture>();
const envKey = ({ sky, panel }: EnvColours): string => `${sky} ${panel}`;
/** an environment's size, a cube face's side (three's default) */
const ENV_SIZE = 256;
/** the blur over the captured scene before it's convolved, in radians */
const ENV_BLUR = 0.04;

/** What the environments compiled ahead are made with (`compileEnvMaps`): one generator and the scene it captures
 *  for each one's colours. */
let ahead: { pm: THREE.PMREMGenerator; scenes: Map<string, THREE.Scene> } | undefined;

/**
 * Every biome's environment's programs compiled now (`colours`), for the targets they're drawn into: the scene the
 * generator captures, its blur and its convolution. The GPU's threads link them while the arena is built; each map is
 * made as its biome is first shown (`envMap`). Made before the arena, the first waited 0.43 s on the convolution's
 * link, compiled as it was first drawn: three compiles none of its own programs ahead but those it converts a cube or
 * a panorama with, so its private parts are reached for (`compileGenerator`). (The capture's backdrop is the clear
 * colour, a clear: no program.)
 */
export function compileEnvMaps(renderer: THREE.WebGLRenderer, colours: EnvColours[]): void {
  const pm = generator(renderer);
  const scenes = new Map(colours.map((c) => [envKey(c), envScene(c)]));
  ahead = { pm, scenes };
  const target = compileGenerator(renderer, pm);
  if (!target) return;
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  const capture = new THREE.PerspectiveCamera(90, 1, 0.1, 100);
  for (const scene of scenes.values()) renderer.compile(scene, capture);
  renderer.setRenderTarget(prev);
  target.dispose();
}

/** An environment's generator: WebGPU's own there (WebGL's draws with shaders WebGPU can't run: its maps were left
 *  dark, the dais's reflection of the sky with them) */
function generator(renderer: THREE.WebGLRenderer): THREE.PMREMGenerator {
  return WEBGPU ? new gpu.PMREMGenerator(renderer as never) as unknown as THREE.PMREMGenerator
    : new THREE.PMREMGenerator(renderer);
}

/** three's generator's private parts: what `compileGenerator` reaches for, each checked to be there */
interface GeneratorInside {
  _setSize?: (cubeSize: number) => void;
  _allocateTarget?: () => THREE.WebGLCubeRenderTarget;
  _getSourceTarget?: (depthBuffer: boolean) => THREE.WebGLCubeRenderTarget;
  _blur?: (target: THREE.WebGLCubeRenderTarget, sigma: number) => void;
  _applyPMREM?: (target: THREE.WebGLCubeRenderTarget) => void;
  _compileMaterial?: (material: THREE.Material) => void;
  _renderCube?: (target: THREE.WebGLCubeRenderTarget, lod: number, material: THREE.Material) => void;
}

/**
 * `pm`'s blur and convolution compiled for the maps it makes, sized as `fromScene` sizes them: its own passes run
 * with each draw of a cube's faces (`_renderCube`) swapped for a compile into that target, so it makes its materials
 * as it would and draws nothing. Returns a target of that kind, to compile the capture's programs for, the caller's
 * to dispose. None where three's private parts have changed: nothing compiled ahead then, the maps made as before.
 */
function compileGenerator(renderer: THREE.WebGLRenderer, pm: THREE.PMREMGenerator): THREE.WebGLRenderTarget | null {
  const inside = pm as unknown as GeneratorInside;
  const parts = [inside._setSize, inside._allocateTarget, inside._getSourceTarget, inside._blur, inside._applyPMREM,
    inside._compileMaterial, inside._renderCube];
  if (!parts.every((f) => typeof f === 'function')) return null;
  inside._setSize!(ENV_SIZE);
  const target = inside._allocateTarget!();
  inside._getSourceTarget!(true);
  const prev = renderer.getRenderTarget();
  inside._renderCube = (into, _lod, material) => {
    renderer.setRenderTarget(into);
    inside._compileMaterial!(material);
  };
  inside._blur!(target, ENV_BLUR);
  inside._applyPMREM!(target);
  delete inside._renderCube;
  renderer.setRenderTarget(prev);
  return target;
}

/**
 * The environment of `colours`, made once: every one compiled ahead made with it, their generator and scenes let go
 * after (the maps are needed together, as the arena shows its first biome), else made alone with a generator of its
 * own.
 */
export function envMap(renderer: THREE.WebGLRenderer, colours: EnvColours): THREE.Texture {
  // (drawn once: every pass's pipeline made before it draws, none left out while made beside the frames)
  return pipelinesAtOnce(() => envMapNow(renderer, colours));
}

function envMapNow(renderer: THREE.WebGLRenderer, colours: EnvColours): THREE.Texture {
  const made = envMaps.get(envKey(colours));
  if (made) return made;
  if (!ahead) return makeEnvMap(renderer, colours);
  const { pm, scenes } = ahead;
  ahead = undefined;
  for (const [key, scene] of scenes) {
    envMaps.set(key, pm.fromScene(scene, ENV_BLUR, 0.1, 100, { size: ENV_SIZE }).texture);
    disposeScene(scene);
  }
  pm.dispose();
  return envMaps.get(envKey(colours)) ?? makeEnvMap(renderer, colours);
}

/** `colours`' environment made with a generator of its own */
function makeEnvMap(renderer: THREE.WebGLRenderer, colours: EnvColours): THREE.Texture {
  const pm = generator(renderer);
  const scene = envScene(colours);
  const texture = pm.fromScene(scene, ENV_BLUR, 0.1, 100, { size: ENV_SIZE }).texture;
  pm.dispose();
  disposeScene(scene);
  envMaps.set(envKey(colours), texture);
  return texture;
}

function disposeScene(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  });
}

// Dim environment for subtle reflections on metal / wet surfaces: a sky gradient and one soft panel.
function envScene({ sky, panel }: EnvColours): THREE.Scene {
  const envScene = new THREE.Scene();
  const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), portShader(new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { uSky: { value: new THREE.Vector3(...sky) } },
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vP; uniform vec3 uSky; void main(){ float y = normalize(vP).y;
      vec3 c = mix(vec3(0.02,0.02,0.03), uSky, smoothstep(-0.2, 1.0, y));
      gl_FragColor = vec4(c, 1.0); }`,
  }), ({ wgslFn, positionGeometry, varying }, u) => ({
    fragment: wgslFn(`fn envSky(p: vec3f, sky: vec3f) -> vec4f {
      return vec4f(mix(vec3f(0.02, 0.02, 0.03), sky, smoothstep(-0.2, 1.0, normalize(p).y)), 1.0);
    }`)({ p: varying(positionGeometry), sky: u.uSky }),
  })));
  envScene.add(skyMesh);
  const panelMesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(...panel).multiplyScalar(2), side: THREE.DoubleSide }));
  panelMesh.position.set(-5, 7, 3); panelMesh.lookAt(0, 0, 0);
  envScene.add(panelMesh);
  return envScene;
}

/**
 * A biome's shadow casters never move, but each one cost a draw call in the shadow pass
 * every frame. Merge them (positions only) into one caster for each way their faces cast (a material's side: in one
 * front-sided caster a double-sided mesh cast from its back faces alone), drawn by the shadow map alone
 * (`inShadowsOnly`), and stop the originals casting. Instanced props are already one call, and a mesh that can
 * still go (`userData.noBake`: a breakable prop) is cast by its biome's breakables' casters (`breakableShadows.ts`).
 */
export function bakeStaticShadows(group: THREE.Group): void {
  group.updateMatrixWorld(true);
  const pieces: Piece[] = [];
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.castShadow || (m as THREE.InstancedMesh).isInstancedMesh || m.userData.noBake) return;
    pieces.push(...piecesOf(m));
    m.castShadow = false;
  });
  for (const { side, shadowSide, pieces: ofSide } of bySide(pieces)) {
    const positions = new Float32Array(ofSide.reduce((sum, piece) => sum + piece.positions.length, 0));
    let at = 0;
    for (const piece of ofSide) {
      positions.set(piece.positions, at);
      at += piece.positions.length;
    }
    const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const caster = new THREE.Mesh(geometry, casterMaterial(side, shadowSide));
    caster.castShadow = true;
    inShadowsOnly(caster);
    caster.name = `${group.name} static shadow caster`;
    group.add(caster);
  }
}

/** Tube along `curve` whose radius tapers linearly from r0 to r1. */
export function taperedTube(curve: THREE.Curve<THREE.Vector3>, r0: number, r1: number): THREE.BufferGeometry {
  const segs = 24, radial = 8;
  const g = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  const pos = g.attributes.position, uv = g.attributes.uv, c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const k = i / segs;
    curve.getPointAt(k, c);
    const rad = r0 + (r1 - r0) * k;
    for (let j = 0; j <= radial; j++) {
      const idx = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, idx).sub(c).multiplyScalar(rad).add(c);
      pos.setXYZ(idx, v.x, v.y, v.z);
      // u round it and v along it, as a trunk's and `taperTube`'s are (three's tube runs u along it)
      uv.setXY(idx, j / radial, k);
    }
  }
  g.computeVertexNormals();
  return g;
}
