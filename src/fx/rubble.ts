// Rubble: the pieces a broken prop leaves, shaped like what broke (their look is in `rubbleGeo.ts`). Stone breaks into
// faceted shards, wood into tapered splinters, flakes and bark strips, a glowcap into glowing cap fragments and torn
// stem pieces, a bonfire into charred sticks and glowing coals. Real geometry that tumbles, bounces off the floor and
// topples onto its broad face (nothing rests on its end), stays a few seconds and shrinks away. One instanced mesh
// per shape variant, from fixed pools (the oldest piece is reused when one runs out). Every material is a standard
// one, so the few programs are all warmed in `warmup.ts`.
import * as THREE from 'three';
import { G } from '../state';
import { groundHeight } from '../world/ground';
import { rand } from '../util';
import { textureFromCanvas } from '../core/textures';
import { stoneGeometry, rockBump, coalTexture, woodAtlas, flakeGeometry, mushroomAtlas, tornTubeGeometry, shellGeometry, STEM_COLS, STUB_COLS } from './rubbleGeo';

type Shape = 'stone' | 'coal' | 'shell' | 'stem' | 'stub' | 'splinter' | 'chip' | 'bark';
/** what a prop is made of: sets its pieces */
export type RubbleKind = 'stone' | 'wood' | 'shroom' | 'ember';

/** pool size and number of different shapes, per shape (each variant is its own mesh with `max` pieces), and roughly how
 * big its pieces are (m): a pool casts shadows only where the quality preset's caster size allows (each is a draw call
 * in every shadow pass) */
const POOL: Record<Shape, { max: number; variants: number; radius: number }> = {
  stone: { max: 60, variants: 4, radius: 0.25 }, coal: { max: 40, variants: 3, radius: 0.08 }, shell: { max: 40, variants: 3, radius: 0.2 }, stem: { max: 30, variants: 3, radius: 0.2 }, stub: { max: 20, variants: 2, radius: 0.2 },
  splinter: { max: 40, variants: 3, radius: 0.12 }, chip: { max: 50, variants: 3, radius: 0.1 }, bark: { max: 30, variants: 2, radius: 0.1 },
};
let minCaster = 0;
/** seconds a piece lies before it goes, and how long it takes to shrink away */
const LIFE = 6, SHRINK = 1.3;
const GRAVITY = 15, BOUNCE = 0.35, HALF = Math.PI / 2;

interface Chunk { shape: Shape; pool: string; x: number; y: number; z: number; vx: number; vy: number; vz: number; rx: number; ry: number; rz: number; wx: number; wy: number; wz: number; sx: number; sy: number; sz: number; t: number; life: number; rest: boolean; tx: number; tz: number }
interface Pool { mesh: THREE.InstancedMesh; chunks: Chunk[]; next: number; max: number }
const pools: Record<string, Pool> = {};
let coalMat: THREE.MeshStandardMaterial | null = null;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

/** One kind of piece in a recipe: its shape, its share of a prop's pieces, its size along each axis (a splinter's
 * grain runs along z, a tube's y) and its colour (`null`: the prop's own) */
interface Part { shape: Shape; w: number; sx: number; sy: number; sz: number; color: number | null; shade?: number }
const RECIPES: Record<RubbleKind, Part[]> = {
  stone: [
    { shape: 'stone', w: 5, sx: 1, sy: 0.75, sz: 0.9, color: null },
    { shape: 'stone', w: 3, sx: 1.15, sy: 0.32, sz: 0.95, color: null },                // slabs
    { shape: 'stone', w: 3, sx: 0.4, sy: 0.35, sz: 0.4, color: null, shade: 0.75 },     // grit
  ],
  wood: [
    { shape: 'splinter', w: 4, sx: 0.3, sy: 0.22, sz: 2.4, color: 0xffffff },   // splinters, pale where it split
    { shape: 'chip', w: 5, sx: 0.55, sy: 0.16, sz: 0.85, color: 0xf2e4c8 },     // flakes
    { shape: 'bark', w: 2, sx: 0.5, sy: 0.12, sz: 1.5, color: 0xffffff },       // bark strips
    { shape: 'stub', w: 1, sx: 0.5, sy: 0.45, sz: 0.5, color: 0xd8c8b0 },       // a torn stub of trunk
  ],
  shroom: [
    { shape: 'shell', w: 5, sx: 1, sy: 0.55, sz: 0.85, color: 0xffffff },       // cap fragments (they glow)
    { shape: 'stem', w: 3, sx: 0.4, sy: 0.7, sz: 0.4, color: 0xd8d8d0 },        // torn stem pieces
    { shape: 'shell', w: 2, sx: 0.4, sy: 0.25, sz: 0.4, color: 0xc8d4cc },
  ],
  ember: [
    { shape: 'splinter', w: 4, sx: 0.3, sy: 0.25, sz: 2.2, color: 0x2a1e16 },   // charred sticks
    { shape: 'bark', w: 2, sx: 0.5, sy: 0.15, sz: 1.2, color: 0x4a3a2c },
    { shape: 'coal', w: 4, sx: 0.4, sy: 0.35, sz: 0.4, color: 0x5a2a12 },       // coals (they glow)
  ],
};

export function initRubble(): void {
  const wood = woodAtlas(), shroom = mushroomAtlas();
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0.05, ...o });
  const stoneMat = std({ flatShading: true, vertexColors: true, bumpMap: rockBump(), bumpScale: 1.5 });
  coalMat = std({ flatShading: true, emissive: 0xffffff, emissiveIntensity: 2.2, emissiveMap: coalTexture() });
  const woodMat = std({ map: textureFromCanvas(wood.albedo), bumpMap: textureFromCanvas(wood.height, false), bumpScale: 2, roughness: 0.85, metalness: 0 });
  const shroomMat = std({ map: textureFromCanvas(shroom.albedo), bumpMap: textureFromCanvas(shroom.height, false), bumpScale: 2, emissive: 0xffffff, emissiveMap: textureFromCanvas(shroom.glow), emissiveIntensity: 1.1, roughness: 0.6, metalness: 0 });
  const mats: Record<Shape, THREE.Material> = { stone: stoneMat, coal: coalMat, shell: shroomMat, stem: shroomMat, stub: woodMat, splinter: woodMat, chip: woodMat, bark: woodMat };
  for (const shape of Object.keys(POOL) as Shape[]) {
    const { max, variants } = POOL[shape];
    for (let v = 0; v < variants; v++) {
      const seed = 7 + v * 13 + shape.length * 3;
      const geo = shape === 'stone' || shape === 'coal' ? stoneGeometry(seed)
        : shape === 'shell' ? shellGeometry(seed)
        : shape === 'stem' ? tornTubeGeometry(seed, STEM_COLS)
        : shape === 'stub' ? tornTubeGeometry(seed, STUB_COLS)
        : flakeGeometry(shape, seed);
      const mesh = new THREE.InstancedMesh(geo, mats[shape], max);
      mesh.name = `rubble: ${shape} ${v + 1}`;
      // the colour attribute exists from the start (adding it later would change the shader)
      for (let i = 0; i < max; i++) mesh.setColorAt(i, _c.set(0x808080));
      mesh.count = 0;
      mesh.frustumCulled = false;
      // (shown through the boot's warm-ups, which run no update, so its programs compile in each biome's light, its
      // shadow's too: three's shadow material takes a caster's map, and a textured pool's is a program of its own in
      // each biome; hidden by `updateRubble` from then on while it holds no piece: drawn empty, the 23 pools were 23
      // to 46 draws a frame of nothing. Hidden after the first warm-up, the forest's wood compiled mid-fight, #243)
      mesh.castShadow = POOL[shape].radius >= minCaster;
      mesh.receiveShadow = true;
      G.scene.add(mesh);
      pools[`${shape}:${v}`] = { mesh, chunks: [], next: 0, max };
    }
  }
}

/** The quality preset's smallest shadow caster (m): smaller kinds of piece stop casting, live */
export function setRubbleShadows(min: number): void {
  minCaster = min;
  for (const k in pools) pools[k].mesh.castShadow = POOL[k.split(':')[0] as Shape].radius >= min;
}

export interface RubbleOpts { count: number; color: number; kind?: RubbleKind; /** where the pieces start: a circle round x, z, and a height range */ radius: number; height: number; /** the pieces' size (m) and how hard they fly */ size: number; speed: number;
  /** how long each lies before it shrinks away (s; `LIFE` and up to 3 s more by default) */ life?: number }

/** A prop's worth of pieces at (x, z) */
export function rubble(x: number, z: number, { count, color, kind = 'stone', radius, height, size, speed, life }: RubbleOpts): void {
  if (!pools['stone:0']) return;
  const parts = RECIPES[kind], total = parts.reduce((a, q) => a + q.w, 0), dirty = new Set<Pool>();
  for (let i = 0; i < count; i++) {
    let r = Math.random() * total, part = parts[0];
    for (const q of parts) { if ((r -= q.w) < 0) { part = q; break; } }
    const key = `${part.shape}:${Math.floor(Math.random() * POOL[part.shape].variants)}`;
    const pool = pools[key], slot = pool.next, c = pool.chunks[slot] ??= {} as Chunk;
    pool.next = (slot + 1) % pool.max;
    const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * radius, s = size * rand(0.4, 1);
    Object.assign(c, {
      shape: part.shape, pool: key,
      x: x + Math.cos(a) * d, y: groundHeight(x, z) + 0.15 + Math.random() * height, z: z + Math.sin(a) * d,
      vx: Math.cos(a) * speed * rand(0.3, 1), vy: rand(1.5, 4.5) * (speed / 4), vz: Math.sin(a) * speed * rand(0.3, 1),
      rx: rand(0, 6), ry: rand(0, 6), rz: rand(0, 6), wx: rand(-9, 9), wy: rand(-9, 9), wz: rand(-9, 9),
      sx: s * part.sx * rand(0.8, 1.2), sy: s * part.sy * rand(0.8, 1.2), sz: s * part.sz * rand(0.8, 1.2), t: 0, life: life ?? LIFE + rand(0, 3), rest: false, tx: 0, tz: 0,
    });
    pool.mesh.setColorAt(slot, _c.set(part.color ?? color).multiplyScalar((part.shade ?? 1) * rand(0.75, 1.15)));
    // (placed where it starts at once: drawn before the next update with the pool's unset place, a fresh piece stood
    // full size at the world's middle, a pale rock on the dais beside the hero for a frame)
    pool.mesh.setMatrixAt(slot, _m.compose(_p.set(c.x, c.y, c.z), _q.setFromEuler(_e.set(c.rx, c.ry, c.rz)), _s.set(c.sx, c.sy, c.sz)));
    pool.mesh.count = Math.min(pool.max, Math.max(pool.mesh.count, pool.chunks.length));
    pool.mesh.visible = true;
    dirty.add(pool);
  }
  for (const pool of dirty) { pool.mesh.instanceColor!.needsUpdate = true; pool.mesh.instanceMatrix.needsUpdate = true; }
}

/** how far the piece's lowest point is below its centre, for the way it's turned (its box, a little smaller for the
 * rounder stones) */
function halfHeight(c: Chunk): number {
  const e = _m.makeRotationFromEuler(_e.set(c.rx, c.ry, c.rz)).elements;
  if (c.shape === 'stem' || c.shape === 'stub') return Math.abs(e[5]) * c.sy + Math.hypot(e[1], e[9]) * c.sx;
  // a cap fragment's rim, its lowest point, is well below its middle but nowhere near the box's floor
  if (c.shape === 'shell') return (Math.abs(e[1]) * c.sx + Math.abs(e[9]) * c.sz) * 0.8 + Math.abs(e[5]) * c.sy * 0.35;
  const h = Math.abs(e[1]) * c.sx + Math.abs(e[5]) * c.sy + Math.abs(e[9]) * c.sz;
  return c.shape === 'stone' || c.shape === 'coal' ? h * 0.8 : h;
}

/** The quarter turns nearest the piece's tilt that lay it lowest, its broadest face down: nothing rests on its end */
function settle(c: Chunk): void {
  const bx = Math.round(c.rx / HALF), bz = Math.round(c.rz / HALF), rx = c.rx, rz = c.rz;
  // a cap fragment is a dome: it lies on its rim, convex side up, so it may turn right over to do it
  const span = c.shape === 'shell' ? 2 : 1;
  let best = 1e9;
  for (let i = -span; i <= span; i++) for (let k = -span; k <= span; k++) {
    c.rx = (bx + i) * HALF; c.rz = (bz + k) * HALF;
    const flipped = c.shape === 'shell' && _m.makeRotationFromEuler(_e.set(c.rx, c.ry, c.rz)).elements[5] < 0.5;
    const score = halfHeight(c) + 0.02 * (Math.abs(i) + Math.abs(k)) + (flipped ? 1 : 0);
    if (score < best) { best = score; c.tx = c.rx; c.tz = c.rz; }
  }
  c.rx = rx; c.rz = rz;
}

export function updateRubble(dt: number): void {
  // the coals breathe, slowly (about 0.6 Hz)
  if (coalMat) coalMat.emissiveIntensity = 2.2 + 0.5 * Math.sin(G.time * 3.8);
  for (const k in pools) {
    const pool = pools[k];
    updatePool(pool, dt);
    pool.mesh.visible = pool.mesh.count > 0;
  }
}

function updatePool({ mesh, chunks }: Pool, dt: number): void {
  if (!mesh.count) return;
  let live = 0;
  for (let i = 0; i < mesh.count; i++) {
    const c = chunks[i];
    if (!c || c.t >= c.life) { _m.makeScale(0, 0, 0); mesh.setMatrixAt(i, _m); continue; }
    c.t += dt;
    live++;
    if (!c.rest) {
      c.vy -= GRAVITY * dt;
      c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
      c.rx += c.wx * dt; c.ry += c.wy * dt; c.rz += c.wz * dt;
      const floor = groundHeight(c.x, c.z) + halfHeight(c);
      if (c.y < floor) {
        c.y = floor;
        if (c.vy < -1.2) {
          c.vy *= -BOUNCE; c.vx *= 0.6; c.vz *= 0.6; c.wx *= 0.5; c.wy *= 0.5; c.wz *= 0.5;
        } else { c.rest = true; c.vx = c.vy = c.vz = 0; c.wx = c.wy = c.wz = 0; settle(c); }
      }
    } else {
      // it topples onto its broad face
      const k = Math.min(1, dt * 12), { tx, tz } = c;
      if (Math.abs(tx - c.rx) + Math.abs(tz - c.rz) > 1e-3) {
        c.rx += (tx - c.rx) * k; c.rz += (tz - c.rz) * k;
        c.y = groundHeight(c.x, c.z) + halfHeight(c);
      }
    }
    const k = c.life - c.t < SHRINK ? Math.max(0, (c.life - c.t) / SHRINK) : 1;
    _m.compose(_p.set(c.x, c.y, c.z), _q.setFromEuler(_e.set(c.rx, c.ry, c.rz)), _s.set(c.sx * k, c.sy * k, c.sz * k));
    mesh.setMatrixAt(i, _m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (!live) mesh.count = 0;
}

export function clearRubble(): void {
  for (const k in pools) { const p = pools[k]; p.chunks.length = 0; p.next = 0; p.mesh.count = 0; }
}
