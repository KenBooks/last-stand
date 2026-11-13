// The heroes' head: the sculpted skin of models/face.ts (meshed on its ray grid, painted in the loading
// workers), glossy eyes under lids with lashes, sculpted ears, hair and a full beard (a volume, with tufts of cards), and
// the neck below it. Built on the rig's head joint, in metres, the chin's underside level with the joint;
// the head is 1/7.5 of the heroes' stature (a realistic figure: an ideal one is 8 heads, a heroic 8.5).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lod, heroDetail } from './armor';
import { part } from './rig';
import { Sculpt } from './shapes';
import { clamp, lerp, mulberry } from '../../util';
import { faceCanvases, faceGrid } from '../../core/textures';
import { createKit } from '../../core/materials';
import { FACES, LOOKS, EYE, origin, eyeOpening, headGrid, gridSize, headSDF, gridDir, scalp, hairline, PLAIN_SKIN, beardLift, mouthY, neckSeam, type FaceShape, type HeadGrid } from './face';
import type { MaterialKit } from '../../types';
import { built } from './steps';

/** metres per millimetre of the face's frame: the head is 1/7.5 of the heroes' stature */
export const HEAD_MM = 0.2421 / 228;
/** the point of the face's frame that sits on the head joint: under the middle of the skull */
const ORIGIN = { x: 0, y: 0, z: 5 };

/** A point of the face's frame (mm: up from the chin, forward from the ear canals) in the head group's
 *  space (m), for placing anything by the head's anatomy. */
export const toGroup = (x: number, y: number, z: number, out = new THREE.Vector3()): THREE.Vector3 =>
  out.set((x - ORIGIN.x) * HEAD_MM, (y - ORIGIN.y) * HEAD_MM, (z - ORIGIN.z) * HEAD_MM);

/** bare skin away from the painted face (ears, neck, bare hands): one material setup, so one shader */
export const plainSkin = (kit: MaterialKit, who: keyof typeof FACES, vertexColors = false) => {
  const s = LOOKS[who].skin;
  // (the ears' shaded creases are rougher too)
  return kit.rim({ color: new THREE.Color().setRGB(s[0] * PLAIN_SKIN, s[1] * PLAIN_SKIN, s[2] * PLAIN_SKIN, THREE.SRGBColorSpace), roughness: vertexColors ? 0.88 : 0.6, vertexColors }, 0x6a2a1c, 0.25);
};

/** bare hands' skin: the ears' and neck's darker and warmer (beside the face's paint, shaded where light falls less,
 *  plain skin reads pale: at 0.86 of it, every hero's hands were paler and pinker than his face; at 0.76, as bright as
 *  the warrior's brow but a paler, yellower pink, red to green 1.24 against its 1.30) */
const HAND_TONE: readonly [number, number, number] = [0.77, 0.71, 0.67];
export const handSkin = (kit: MaterialKit, who: keyof typeof FACES) => {
  const m = plainSkin(kit, who);
  m.color.r *= HAND_TONE[0];
  m.color.g *= HAND_TONE[1];
  m.color.b *= HAND_TONE[2];
  return m;
};

/** the head's geometry, made once for each face, hair and detail and shared by every head built after it (a class
 *  switch builds the hero again: made afresh each time, the head was 60% of the build, its hair's cards most of it) */
const madeOnce = new Map<string, object>();
let madeHere = 0;
/** Cache misses sculpted by this thread (the lab checks that live hero builds add none). */
export const headsMadeHere = (): number => madeHere;

/** What `make` made for `key`, made the first time: its geometry marked shared, so a model's dispose keeps it. */
function once<T extends object>(key: string, make: () => T): T {
  let made = madeOnce.get(key) as T | undefined;
  if (!made) {
    madeHere++;
    made = make();
    const parts = made instanceof THREE.BufferGeometry ? [made] : Object.values(made);
    for (const geo of parts) if (geo instanceof THREE.BufferGeometry) geo.userData.shared = true;
    madeOnce.set(key, made);
  }
  return made;
}

/**
 * The geometry of `model`'s head made ahead (`once`: every head built after shares it), so his first build is left
 * only his body: a hero's first build in one task was 210 to 350 ms on the owner's PC, his head's hair most of it,
 * a frozen loading bar as Change hero warmed the other heroes (trace FD2V-NB48, 618 ms). A head built on a joint of
 * its own and dropped: its materials were never drawn, so nothing of the GPU's is let go.
 */
export function makeHeadAhead(model: string): void {
  const head = HERO_HEADS[model as keyof typeof HERO_HEADS];
  if (head) buildHead(new THREE.Object3D(), createKit(), head.who, head);
}

const grids = new Map<string, HeadGrid>();
/** the skin's ray grid for a face at the current detail, cast once: the one its paint was cast on, where that's come
 *  (the workers paint the faces on the full detail's grid) */
function gridFor(name: keyof typeof FACES): HeadGrid {
  const [nu, nv] = gridSize(FACES[name], lod(112, 40), lod(88, 32)), key = `${name}:${nu}x${nv}`;
  let g = grids.get(key);
  const painted = faceGrid(name);
  if (!g) grids.set(key, (g = painted && painted.nu === nu && painted.nv === nv ? painted : headGrid(FACES[name], nu, nv)));
  return g;
}

/** the skin on its grid: uvs follow the grid, so the paint (painted on the same grid) lines up */
function skinGeometry(g: HeadGrid): THREE.BufferGeometry {
  const W = g.nu + 1, n = W * (g.nv + 1), pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), p = new THREE.Vector3();
  for (let j = 0; j <= g.nv; j++) for (let i = 0; i <= g.nu; i++) {
    const k = j * W + i;
    toGroup(g.p[k * 3], g.p[k * 3 + 1], g.p[k * 3 + 2], p);
    pos[k * 3] = p.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z;
    uv[k * 2] = i / g.nu; uv[k * 2 + 1] = j / g.nv;
  }
  const idx: number[] = [];
  for (let j = 0; j < g.nv; j++) for (let i = 0; i < g.nu; i++) {
    const a = j * W + i, b = a + 1, c = a + W + 1, e = a + W;
    idx.push(a, b, c, a, c, e);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  weldNormals(geo, W);
  return geo;
}

/** A grid wrapped round (each row's first and last vertices in one place): one normal there, theirs averaged (each its own
 *  side's, they showed a line down the back of the head and neck). */
function weldNormals(geo: THREE.BufferGeometry, W: number): void {
  const N = geo.attributes.normal as THREE.BufferAttribute, a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let k = 0; k + W - 1 < N.count; k += W) {
    a.fromBufferAttribute(N, k).add(b.fromBufferAttribute(N, k + W - 1)).normalize();
    N.setXYZ(k, a.x, a.y, a.z); N.setXYZ(k + W - 1, a.x, a.y, a.z);
  }
}

const maps = new Map<string, { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture }>();
/** the painted face's textures (painted by the loading workers, see face.ts faceData), made once per face */
function faceMaps(who: keyof typeof FACES) {
  let m = maps.get(who);
  if (m) return m;
  const C = faceCanvases(who);
  const tex = (cv: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(cv);
    // round the head the paint wraps; from the crown to the neck it doesn't
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8; t.wrapS = THREE.RepeatWrapping;
    return t;
  };
  maps.set(who, (m = { map: tex(C.albedo, true), normalMap: tex(C.normal, false), roughnessMap: tex(C.rough, false) }));
  return m;
}

let eyeTex: Map<string, THREE.CanvasTexture> | null = null;
/** An eye seen from the front (planar uvs): sclera, a dark limbal ring, a fibrous iris, the pupil. `shade`: the upper lid's
 *  shadow over its top (the eyes never turn, so it can be painted) and a dimmer white, for a deep-set eye. */
function eyeMap(iris: [number, number, number], shade = 0): THREE.CanvasTexture {
  eyeTex ??= new Map();
  const key = iris.join() + ':' + shade;
  const hit = eyeTex.get(key);
  if (hit) return hit;
  const S = 128, img = new ImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x + 0.5) / S * 2 - 1, v = 1 - (y + 0.5) / S * 2, r = Math.hypot(u, v), a = Math.atan2(v, u);
    // radius in mm on the eye's face (the texture spans the eyeball's 24 mm)
    const mm = r * EYE.r;
    let c: number[];
    // (a deep-set eye's pupil a little smaller: a big one reads as a doll's)
    const pr = shade ? 1.6 : 1.9, ir = 5.9;
    if (mm < pr) c = [0.02, 0.018, 0.02];
    else if (mm < ir) {
      // (a deep-set eye's iris seen in the lid's shade: its fibres soft, a dark ring at its rim, lighter round the pupil)
      const fa = shade ? 0.12 : 0.25, k = (mm - pr) / (ir - pr), fib = 1 - fa + fa * Math.sin(a * 37 + Math.sin(a * 11) * 2) * Math.sin(a * 23 + mm), ring = 1 - 0.45 * Math.exp(-(((mm - 2.2) / 0.5) ** 2));
      const edge = 1 - 0.6 * clamp((k - 0.8) / 0.2, 0, 1);
      // (a deep-set eye's lighter round the pupil, darkening to its rim; the other way round otherwise)
      const rad = shade ? 1.25 - 0.5 * k : 0.75 + 0.5 * k;
      c = iris.map((ch, i) => ch * fib * ring * edge * rad + (i === 0 ? 0.04 : 0.02) * (1 - k));
    } else if (mm < ir + 0.5) c = [0.08, 0.08, 0.09];
    else {
      // the white, greyer towards its edge and a little pink in the corners
      const k = clamp((mm - ir - 0.5) / 5, 0, 1);
      c = [0.78 - 0.14 * k + 0.05 * Math.abs(u) * k, 0.74 - 0.18 * k, 0.72 - 0.18 * k].map((ch) => ch * (1 - 0.2 * shade));
    }
    if (shade) {
      // (darkest under the lid's edge, and into the corners)
      const k = 1 - shade * (0.55 * sm(-2, 3.2, v * EYE.r) + 0.5 * sm(5, 10, Math.abs(u) * EYE.r));
      c = c.map((ch) => ch * k);
    }
    const i = (y * S + x) * 4;
    img.data[i] = clamp(c[0], 0, 1) * 255; img.data[i + 1] = clamp(c[1], 0, 1) * 255; img.data[i + 2] = clamp(c[2], 0, 1) * 255; img.data[i + 3] = 255;
  }
  const cv = document.createElement('canvas'); cv.width = cv.height = S; cv.getContext('2d')!.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  eyeTex.set(key, t);
  return t;
}

/** an eyeball facing +z with the cornea's bulge over the iris, planar uvs */
function eyeGeometry(): THREE.BufferGeometry {
  const R = EYE.r * HEAD_MM, g = new THREE.SphereGeometry(R, lod(24, 24), lod(18, 18)).rotateX(Math.PI / 2), p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), rr = Math.hypot(x, y) / R;
    // the cornea: a clear dome over the iris, standing ~1.5 mm proud
    if (z > 0) p.setZ(i, z + 1.4 * HEAD_MM * Math.max(0, 1 - (rr / 0.52) ** 2) ** 1.5);
    uv.setXY(i, x / R * 0.5 + 0.5, y / R * 0.5 + 0.5);
  }
  g.computeVertexNormals();
  return g;
}

export interface Head {
  /** on the head joint, in metres: anything worn on the head goes here */
  group: THREE.Group;
  face: THREE.Mesh; eyes: THREE.Mesh[];
  /** the skin (or `lift` mm above it) towards `az` round the head (0 the face, +x the left) and `el` up */
  surface(az: number, el: number, lift?: number, out?: THREE.Vector3): THREE.Vector3;
  /** how far forward the skin is (mm, the face's frame) down the middle of the face at height `y` mm */
  midZ(y: number): number;
  /** the hair over the scalp (its cap and locks): a model hides it under a helmet */
  hair: THREE.Mesh[];
  /** short hair at the back and sides below a hat's band (`crop`), in tufts lying down the head to the nape */
  crop?: THREE.Mesh;
  /** a full beard's volume and its tufts (`FACES[...].beardFull`) */
  beards: THREE.Mesh[];
  /** the face in a hood's shade, `depth` deep (0: none): the forehead and the eyes the most, gone by the mouth, the sides
   *  of the face more (the game's shadow map is too coarse to shade a face under a brim: it sat lit, pasted into it) */
  shade(depth: number): void;
}

/** each hero's head as his model builds it: its face and its hair (the head workers make the same, `preloadHeads`) */
export const HERO_HEADS = {
  mage: { who: 'mage', hair: 'short', crop: true },
  ranger: { who: 'ranger', hair: 'swept', crop: true },
  warrior: { who: 'warrior', hair: 'loose' },
} as const satisfies Record<string, { who: keyof typeof FACES } & HeadStyle>;

/** A head's hair (`buildHead`'s options). */
export interface HeadStyle { hair?: 'swept' | 'mane' | 'loose' | 'short'; crop?: boolean }

// --- the hair's cards left off (Very low) ----------------------------------------------------------------------------

/** Whether the hair's cards are drawn (`setHairCards`, the quality's `hairCards`): each is cut out of its strands'
 *  texture, two-sided and laid over the others, what a phone's tiled GPU pays most for a pixel of a hero. */
let cardsShown = true;

/** A head's card meshes (locks, crop, beard's tufts) and its cap, whose colour stands in for the hair they'd show. */
interface HairCards { cards: THREE.Mesh[]; cap: THREE.MeshStandardMaterial | null; under: THREE.Color; bare: THREE.Color }

/** every head built, held weakly: a hero let go of is forgotten (each holds its own on its group, `userData`) */
const hairHeads = new Set<WeakRef<HairCards>>();

const hairShown = (m: THREE.Mesh): boolean => m.userData.hairShown ?? true;

/** the bare cap's colour, of the cards' (`hk` times the hair's): their strands' texture shows it darker than itself */
const BARE_CAP = 0.8;

function showCards(h: HairCards): void {
  for (const m of h.cards) m.visible = hairShown(m) && cardsShown;
  // (a colour, a uniform's value: no program changes)
  h.cap?.color.copy(cardsShown ? h.under : h.bare);
}

/** The hair's cards drawn or left off on every head, live: hidden meshes and a colour, so no program is made (every
 *  hero's cards are compiled at load anyway, shown by the warm-up's `heroAllWorn`). */
export function setHairCards(on: boolean): void {
  cardsShown = on;
  for (const ref of hairHeads) {
    const h = ref.deref();
    if (h) showCards(h);
    else hairHeads.delete(ref);
  }
}

/** Shows or hides a head's hair (under a helmet): a card stays hidden while the quality leaves the cards off. */
export function showHair(meshes: readonly THREE.Mesh[], on: boolean): void {
  for (const m of meshes) {
    m.userData.hairShown = on;
    m.visible = on && (!m.userData.hairCard || cardsShown);
  }
}

/** A head's geometry: the skin, an eye (both share it), the lashes (none where the eyes are shaded), each ear (the
 *  left's first), and with hair its cap, the crop's tufts, the locks; and a full beard's volume and tufts. */
export interface HeadShapes {
  skin: THREE.BufferGeometry;
  eye: THREE.BufferGeometry;
  lashes: THREE.BufferGeometry | null;
  ears: THREE.BufferGeometry[];
  cap: THREE.BufferGeometry | null;
  crop: THREE.BufferGeometry | null;
  locks: THREE.BufferGeometry | null;
  beard: { volume: THREE.BufferGeometry; tufts: THREE.BufferGeometry } | null;
}

/** A point on the skin's grid at an azimuth and elevation, lifted off it by `lift` (mm), in the head's group. */
function surfaceOf(g: HeadGrid) {
  return (az: number, el: number, lift = 0, out = new THREE.Vector3()) => {
    const d = gridDir(az, el, { x: 0, y: 0, z: 0 }), C = origin(el, { x: 0, y: 0, z: 0 });
    const r = radiusAt(g, az, el) + lift;
    return toGroup(C.x + d.x * r, C.y + d.y * r, C.z + d.z * r, out);
  };
}

/**
 * The head's geometry for `who` with hair `o`, at the current detail: made the first time and shared by every head
 * after (`once`). No material, canvas or scene in it, so a worker makes it as the game loads (the head was 2.8 s of
 * the first hero's 6.4 s build on a CPU slowed six times, the loading screen frozen).
 */
export function headShapes(who: keyof typeof FACES, o: HeadStyle = {}): HeadShapes {
  const F: FaceShape = FACES[who], L = LOOKS[who], g = gridFor(who);
  // (what the head's geometry is made from: the face, the hair, and the detail it is built at)
  const key = `${who}:${o.hair ?? 'bare'}${o.crop ? '+crop' : ''}:${heroDetail()}`;
  const shaded = !!L.eyeShade, earAo = L.ao ?? 0, rng = mulberry(7), skullC = toGroup(0, 128, -12);
  const surface = surfaceOf(g);
  const skin = once(`${key}:skin`, () => skinGeometry(g));
  const eye = once(`${key}:eye`, eyeGeometry);
  const lashes = shaded ? null : once(`${key}:lashes`, () => lashGeometry(F, shaded));
  const ears = [1, -1].map((s) => once(`${key}:ear${s}`, () => earGeometry(s, F, earAo)));
  let cap: THREE.BufferGeometry | null = null, crop: THREE.BufferGeometry | null = null;
  let locks: THREE.BufferGeometry | null = null;
  if (o.hair) {
    const loose = o.hair === 'loose';
    const made = once(`${key}:cap`, () => capGeometry(g, who, loose, !!o.crop));
    cap = made.cap;
    const roots = made.roots;
    if (o.crop) {
      crop = once(`${key}:crop`, () => {
        const clear = hairTools(surface, F, L.hairDrop ?? 0, L.templeDrop ?? 0).clear;
        return cropTufts(made.cap, roots, g, mulberry(13), clear);
      });
    }
    locks = once(`${key}:locks`, () => {
      const made: THREE.BufferGeometry[] = [];
      if (loose) looseLocks(surface, rng, skullC, made, F, L.hairDrop ?? 0, L.templeDrop ?? 0);
      else if (o.hair === 'short') shortLocks(surface, rng, skullC, made, F, L.hairDrop ?? 0, L.templeDrop ?? 0);
      else sweptLocks(surface, rng, skullC, made, F, L.hairDrop ?? 0, L.templeDrop ?? 0, o.hair === 'mane');
      const merged = mergeGeometries(made)!;
      for (const x of made) x.dispose();
      return merged;
    });
  }
  let beard: HeadShapes['beard'] = null;
  if (F.beardFull) {
    beard = once(`${key}:beard`, () => {
      const { volume, lifts } = beardVolume(g, F);
      return { volume, tufts: beardTufts(volume, lifts, g, rng) };
    });
  }
  return { skin, eye, lashes, ears, cap, crop, locks, beard };
}

/** The heads' geometry made so far and the grids they're made on, packed to be sent from a worker: each geometry's
 *  arrays to transfer. */
export function packHeadShapes(): { packed: PackedHeads; buffers: ArrayBuffer[] } {
  const buffers: ArrayBuffer[] = [];
  const packGeometry = (geo: THREE.BufferGeometry): PackedGeometry => {
    const attributes: PackedGeometry['attributes'] = {};
    for (const [name, a] of Object.entries(geo.attributes) as [string, THREE.BufferAttribute][]) {
      attributes[name] = { array: a.array as Float32Array, itemSize: a.itemSize, normalized: a.normalized };
      buffers.push(a.array.buffer as ArrayBuffer);
    }
    const index = geo.index ? geo.index.array as Uint16Array | Uint32Array : null;
    if (index) buffers.push(index.buffer as ArrayBuffer);
    return { attributes, index, groups: geo.groups.map((group) => ({ ...group })) };
  };
  const made: PackedHeads['made'] = [];
  for (const [key, value] of madeOnce) {
    if (value instanceof THREE.BufferGeometry) {
      made.push({ key, geometry: packGeometry(value) });
      continue;
    }
    const fields: Record<string, PackedGeometry | unknown> = {};
    const geometries: string[] = [];
    for (const [name, field] of Object.entries(value)) {
      if (field instanceof THREE.BufferGeometry) {
        fields[name] = packGeometry(field);
        geometries.push(name);
      } else {
        fields[name] = field;
      }
    }
    made.push({ key, fields, geometries });
  }
  return { packed: { made, grids: [...grids] }, buffers };
}

/** A geometry's arrays, as a worker sends them. */
interface PackedGeometry {
  attributes: Record<string, { array: Float32Array; itemSize: number; normalized: boolean }>;
  index: Uint16Array | Uint32Array | null;
  groups: { start: number; count: number; materialIndex?: number }[];
}

/** The heads' geometry a worker made: each `once` key's geometry, or its fields, and the grids by their key. */
export interface PackedHeads {
  made: ({ key: string; geometry: PackedGeometry } | { key: string; fields: Record<string, unknown>; geometries: string[] })[];
  grids: [string, HeadGrid][];
}

/** A worker's heads kept as made here: each key the page hasn't made itself, its geometry shared. */
let keptFromWorkers = 0;
/** How many heads' pieces the workers made that the page took (a harness's: 0 means every head was made here). */
export const headsFromWorkers = (): number => keptFromWorkers;

function keepHeadShapes(packed: PackedHeads): void {
  const unpack = (p: PackedGeometry): THREE.BufferGeometry => {
    const geo = new THREE.BufferGeometry();
    for (const [name, a] of Object.entries(p.attributes)) {
      geo.setAttribute(name, new THREE.BufferAttribute(a.array, a.itemSize, a.normalized));
    }
    if (p.index) geo.setIndex(new THREE.BufferAttribute(p.index, 1));
    for (const group of p.groups) geo.addGroup(group.start, group.count, group.materialIndex);
    geo.userData.shared = true;
    return geo;
  };
  for (const [key, grid] of packed.grids) if (!grids.has(key)) grids.set(key, grid);
  for (const entry of packed.made) {
    if (madeOnce.has(entry.key)) continue;
    keptFromWorkers++;
    if ('geometry' in entry) {
      madeOnce.set(entry.key, unpack(entry.geometry));
      continue;
    }
    const value: Record<string, unknown> = { ...entry.fields };
    for (const name of entry.geometries) value[name] = unpack(entry.fields[name] as PackedGeometry);
    madeOnce.set(entry.key, value);
  }
}

/**
 * Every hero's head made in a worker of its own while the game loads, at the detail the heroes are built at
 * (`detail`, the quality's): each a second or two of a phone's main thread otherwise, the loading screen frozen
 * ("phone has freezes during loading for like 1-2sec, where particles stop moving completely"). A worker that fails
 * leaves its head to the first build, here.
 */
const preloaded = new Map<number, { ready: boolean; promise: Promise<void> }>();
/** Whether workers have finished preparing this detail (including the existing worker-failure fallback). */
export const headsReady = (detail: number): boolean => preloaded.get(detail)?.ready ?? false;

export function preloadHeads(detail: number): Promise<void> {
  const previous = preloaded.get(detail);
  if (previous) return previous.promise;
  const state = { ready: false, promise: Promise.resolve() };
  preloaded.set(detail, state);
  state.promise = makeHeads(detail).then(() => { state.ready = true; });
  return state.promise;
}

async function makeHeads(detail: number): Promise<void> {
  if (typeof Worker === 'undefined') return;
  const one = (model: keyof typeof HERO_HEADS) => new Promise<void>((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./head.worker.ts', import.meta.url), { type: 'module', name: `${model}@${detail}` });
    } catch {
      resolve();
      return;
    }
    // (it ends itself once its head is kept across visits: ended here as it came, nothing was kept)
    worker.onmessage = (e: MessageEvent<PackedHeads>) => {
      keepHeadShapes(e.data);
      resolve();
    };
    worker.onerror = () => {
      worker.terminate();
      resolve();
    };
  });
  await Promise.all((Object.keys(HERO_HEADS) as (keyof typeof HERO_HEADS)[]).map(one));
}

/**
 * Build the head of `who` on `headJoint` (the rig's head joint). `hair`: a cap of hair over the scalp
 * with locks of cards over it, `swept` back behind the ears to the nape, `mane` swept back as it is but fuller, in
 * waves and falling past the nape to the collar (the mage's), or `loose`: parted a little off the middle, swept out
 * over the temples and falling in waves past the ears to the chin (left out, the scalp is painted).
 * `crop`: short tufts over the back and sides below a hat's band (`Head.crop`), for a hat to show under its brim.
 * A face with `beardFull` gets a full beard: a volume over the skin and tufts of cards along it.
 */
export function buildHead(headJoint: THREE.Object3D, kit: MaterialKit, who: keyof typeof FACES, o: HeadStyle = {}): Head {
  return built(headSteps(headJoint, kit, who, o));
}

/** `buildHead` a piece at a time (models/steps.ts): its geometry, where no worker made it (`preloadHeads`), is a
 *  piece of its own, 200 to 270 ms on the 4080 for the hair's cap, locks or beard, which held the lobby's frame. */
export function* headSteps(
  headJoint: THREE.Object3D, kit: MaterialKit, who: keyof typeof FACES, o: HeadStyle = {},
): Generator<void, Head, undefined> {
  const F: FaceShape = FACES[who];
  const head = new THREE.Group();
  headJoint.add(head);
  const g = gridFor(who);
  // (its geometry, made once for the face, the hair and the detail: by a worker as the game loads, `preloadHeads`)
  const shapes = headShapes(who, o);
  yield;
  const M = faceMaps(who);
  const skin = kit.rim({ roughness: 1, map: M.map, normalMap: M.normalMap, roughnessMap: M.roughnessMap, normalScale: new THREE.Vector2(0.5, 0.5) }, 0x6a2a1c, 0.25);
  const face = part(shapes.skin, skin, head);
  face.name = 'face';

  // --- eyes: glossy balls in the sockets behind the lids, and lashes along the upper lids
  // (a deep-set eye's shine softer: a sharp one on a dark iris reads as a marble)
  const eyeMat = kit.std({ map: eyeMap(F.iris, LOOKS[who].eyeShade), roughness: LOOKS[who].eyeShade ? 0.2 : 0.08 });
  const shaded = !!LOOKS[who].eyeShade, lash = kit.std({ color: shaded ? 0x2e2016 : 0x1c120c, roughness: 0.9, side: THREE.DoubleSide });
  const eyes: THREE.Mesh[] = [];
  const eg = shapes.eye;
  for (const s of [1, -1]) {
    const m = part(eg, eyeMat, head);
    toGroup(s * EYE.x, EYE.y, EYE.z, m.position);
    m.castShadow = false;
    // (turned in its socket by a glance, models/glance.ts)
    m.name = 'eye';
    eyes.push(m);
  }
  // (a deep-set eye's lashes are painted: a strip reads as a line drawn round the eye)
  if (shapes.lashes) part(shapes.lashes, lash, head).castShadow = false;

  // --- ears
  const earAo = LOOKS[who].ao ?? 0, earMat = plainSkin(kit, who, earAo > 0);
  for (const ear of shapes.ears) part(ear, earMat, head).name = 'ear';

  const surface = surfaceOf(g);

  // --- hair: a cap with some body over the scalp, locks of hair cards swept back over it to the nape
  const L = LOOKS[who];
  // (both styles' locks in the dense clump texture: thin strands of high contrast read as wood grain, and sparse cards
  // hanging apart read as a wig's fringe)
  const hk = o.hair === 'loose' || o.hair === 'mane' || o.hair === 'short' ? 2.4 : 2.1, hairCol = new THREE.Color().setRGB(L.hair[0] * hk, L.hair[1] * hk, L.hair[2] * hk, THREE.SRGBColorSpace);
  const cards = kit.std({ color: hairCol, map: strandMap(true), alphaTest: 0.35, alphaToCoverage: true, side: THREE.DoubleSide, roughness: o.hair === 'loose' ? 0.72 : o.hair === 'short' ? 0.78 : 0.62, vertexColors: true });
  bothSidesOut(cards);
  const hair: THREE.Mesh[] = [];
  const skullC = toGroup(0, 128, -12);
  let crop: THREE.Mesh | undefined;
  if (o.hair) {
    // (under the locks the cap is only the shadow between them: darker and plain, as its texture would show the grid's
    // rows closing to a point on top as a starburst through the part; and a cap of combed fur with a sharp edge, the swept
    // locks over it few and apart, read as a wig)
    const loose = o.hair === 'loose', capK = o.hair === 'mane' ? 1.8 : 1.3, capCol = new THREE.Color().setRGB(L.hair[0] * capK, L.hair[1] * capK, L.hair[2] * capK, THREE.SRGBColorSpace);
    const capMat = kit.std({ color: capCol, roughness: 0.8 });
    const cap = shapes.cap!;
    hair.push(part(cap, capMat, head));
    if (o.crop) {
      const tufts = shapes.crop!;
      crop = part(tufts, cards, head);
      crop.castShadow = true;
      crop.name = 'crop';
    }
    // (the locks draw from `rng` before the beard's tufts do: both are made in the head's first build, in this order)
    const locks = shapes.locks!;
    const m = part(locks, cards, head);
    m.castShadow = true;
    hair.push(m);
  }
  // a full beard's volume over the face (face.ts `beardLift`): the skin's grid points lifted along their rays, leaning down
  // below the mouth (it hangs), painted as the face is (its uvs the grid's), its edges sunk into the skin; and short tufts
  // of cards over its lower part and out past its edge, so its outline is hair, not a smooth rim
  const beards: THREE.Mesh[] = [];
  if (F.beardFull) {
    const beard = shapes.beard!;
    beards.push(part(beard.volume, skin, head));
    // (the tufts in the painted beard's colour, darker than the scalp's locks; their strands dense)
    const tuftMat = Object.assign(cards.clone(), { map: strandMap(true), roughness: 0.85, color: hairCol.clone().multiplyScalar(1.2 / hk) });
    const tufts = part(beard.tufts, tuftMat, head);
    tufts.castShadow = true;
    beards.push(tufts);
    for (const m of beards) m.name = 'beard';
  }
  // (named, so a probe or a tool can find them)
  for (const m of hair) m.name = 'hair';
  // (the cards left off at Very low, `setHairCards`: the cap alone then, in about the hair's own colour as its strands
  // show it, not the shadow between them)
  const cardMeshes = [...hair, ...beards, ...(crop ? [crop] : [])].filter((m) => m.material === cards || (m.material as THREE.Material).alphaTest > 0);
  for (const m of cardMeshes) m.userData.hairCard = true;
  const capOf = hair.find((m) => !m.userData.hairCard)?.material as THREE.MeshStandardMaterial | undefined;
  const bareK = hk * BARE_CAP;
  const hairCards: HairCards = {
    cards: cardMeshes, cap: capOf ?? null, under: capOf?.color.clone() ?? new THREE.Color(),
    bare: new THREE.Color().setRGB(L.hair[0] * bareK, L.hair[1] * bareK, L.hair[2] * bareK, THREE.SRGBColorSpace),
  };
  head.userData.hairCards = hairCards;
  hairHeads.add(new WeakRef(hairCards));
  showCards(hairCards);
  // (each height's depth found once: stepped in through the field 0.25 mm at a time, a helmet's nasal asked it at every
  // point of its plate, 40,000 evaluations of the field a build)
  const depths = new Map<number, number>();
  const midZ = (y: number) => {
    let z = depths.get(y);
    if (z !== undefined) return z;
    z = 140;
    while (z > 0 && headSDF(0, y, z, F) > 0) z -= 0.25;
    depths.set(y, z);
    return z;
  };
  // (from the brow down to the chin, deeper towards the sides, as a recess is: full to below the eyes and gone above
  // the cheeks, it read as a mask's stripe)
  const full = toGroup(0, EYE.y + 5, 0).y, gone = toGroup(0, EYE.y - 115, 0).y;
  // (the face, the hair and the beard: not what hangs from the head, as a hood, its wool shaded above the eye line)
  const shade = (depth: number) => head.traverse((o) => {
    if (o.userData.hoodPart) return;
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    (m?.userData.shade as { value: THREE.Vector4 } | undefined)?.value.set(depth, full, gone, 6);
  });
  return { group: head, face, eyes, surface, midZ, hair, crop, beards, shade };
}

/** The hair's cap over the scalp, on the skin's grid (`loose` or swept), and the grid points the crop's tufts root on
 *  (`cropped`: on the scalp below a hat's band, from over the ears round the back). */
function capGeometry(g: HeadGrid, who: keyof typeof FACES, loose: boolean, cropped: boolean): { cap: THREE.BufferGeometry; roots: number[] } {
  const L = LOOKS[who];
  const W = g.nu + 1, pos = new Float32Array((g.nv + 1) * W * 3), uv = new Float32Array((g.nv + 1) * W * 2), keep = new Uint8Array((g.nv + 1) * W);
  const d = { x: 0, y: 0, z: 0 }, C = { x: 0, y: 0, z: 0 }, q = new THREE.Vector3(), roots: number[] = [];
  for (let j = 0; j <= g.nv; j++) for (let i = 0; i <= g.nu; i++) {
    const k = j * W + i, r = g.r[k];
    gridDir(g.az[i], g.el[j], d); origin(g.el[j], C);
    const x = C.x + d.x * r, y = C.y + d.y * r, z = C.z + d.z * r, sc = scalp(Math.abs(x), y, z, L.hairDrop, L.templeDrop, L.nape);
    // thicker on top, combed into shallow ridges running back
    // (starting behind the painted hairline, its edge sunk into the skin: the grid's steps never show)
    // (rising gradually from behind the hairline: a step over a cell or two of the grid shows as a stair)
    // (and as gradually beside a hairline that runs steeply down, at the temples: measured across it too)
    const ha = Math.atan2(Math.abs(x), z + 12), hr = Math.hypot(Math.abs(x), z + 12);
    const inside = (da: number) => y - hairline(hr * Math.sin(Math.max(0, ha - da)), hr * Math.cos(Math.max(0, ha - da)) - 12, L.hairDrop, L.templeDrop, L.nape);
    // (swept back, it lies close to the scalp at the hairline and gains body over the crown: standing 6 mm off within
    // 16 mm of the hairline, it was a wig's edge)
    const lift = loose ? sm(-1, 16, inside(0)) * sm(-1, 10, inside(0.12)) * sm(-1, 6, inside(0.25)) * (6 + 6 * sm(120, 200, y) + 2 * Math.sin(Math.atan2(x, z) * 18 + y * 0.05)) - 1.2
      : sm(-1, 30, inside(0)) * sm(-1, 14, inside(0.12)) * (2.5 + 4.5 * sm(150, 215, y)) - 1.2;
    toGroup(x + d.x * lift, y + d.y * lift, z + d.z * lift, q);
    pos[k * 3] = q.x; pos[k * 3 + 1] = q.y; pos[k * 3 + 2] = q.z;
    uv[k * 2] = i / g.nu * 6; uv[k * 2 + 1] = j / g.nv * 3;
    keep[k] = sc > 0.85 ? 1 : 0;
    if (cropped && sc > 0.5 && y < EYE.y + 32 && ha > 0.95) roots.push(k);
  }
  const idx: number[] = [];
  for (let j = 0; j < g.nv; j++) for (let i = 0; i < g.nu; i++) {
    const a = j * W + i, b = a + 1, c = a + W + 1, e = a + W;
    if (keep[a] || keep[b] || keep[c] || keep[e]) idx.push(a, b, c, a, c, e);
  }
  const cap = new THREE.BufferGeometry();
  cap.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  cap.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  cap.setIndex(idx);
  cap.computeVertexNormals();
  return { cap, roots };
}

/** A full beard's volume: the skin's grid points lifted along their rays (`beardLift`), leaning down below the mouth,
 *  and each point's lift (mm). */
function beardVolume(g: HeadGrid, F: FaceShape): { volume: THREE.BufferGeometry; lifts: Float32Array } {
  const W = g.nu + 1, pos = new Float32Array((g.nv + 1) * W * 3), uv = new Float32Array((g.nv + 1) * W * 2), lifts = new Float32Array((g.nv + 1) * W);
  const d = { x: 0, y: 0, z: 0 }, q = new THREE.Vector3();
  for (let j = 0; j <= g.nv; j++) for (let i = 0; i <= g.nu; i++) {
    const k = j * W + i, x = g.p[k * 3], y = g.p[k * 3 + 1], z = g.p[k * 3 + 2], lift = beardLift(Math.abs(x), y, z, F) - 1.2;
    gridDir(g.az[i], g.el[j], d);
    d.y -= BEARD_HANG * clamp((45 - y) / 45, 0, 1);
    const dl = Math.hypot(d.x, d.y, d.z);
    toGroup(x + (d.x / dl) * lift, y + (d.y / dl) * lift, z + (d.z / dl) * lift, q);
    pos[k * 3] = q.x; pos[k * 3 + 1] = q.y; pos[k * 3 + 2] = q.z;
    uv[k * 2] = i / g.nu; uv[k * 2 + 1] = j / g.nv; lifts[k] = lift;
  }
  const idx: number[] = [];
  for (let j = 0; j < g.nv; j++) for (let i = 0; i < g.nu; i++) {
    const a = j * W + i, b = a + 1, c = a + W + 1, e = a + W;
    if (lifts[a] > 0 || lifts[b] > 0 || lifts[c] > 0 || lifts[e] > 0) idx.push(a, b, c, a, c, e);
  }
  const volume = new THREE.BufferGeometry();
  volume.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  volume.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  volume.setIndex(idx);
  volume.computeVertexNormals();
  return { volume, lifts };
}

/** The upper lids' lashes: a thin fringe along each lid's edge, curving out and up (`shaded`: a deep-set eye's, shorter
 *  and stopping short of its corners). */
function lashGeometry(F: FaceShape, shaded: boolean): THREE.BufferGeometry {
  const lashes: number[] = [];
  for (const s of [1, -1]) {
    const N = 14, row: THREE.Vector3[][] = [];
    for (let k = 0; k <= N; k++) {
      // (a deep-set eye's stop short of its corners: past them they read as a line drawn round the eye)
      const t = shaded ? lerp(-0.8, 0.82, k / N) : lerp(-0.92, 0.95, k / N), xe = t * (F.eyeW ?? 15) - 0.5;
      let ye = 0;
      // the lid's edge: where the opening's top crosses this column
      for (let y = 8; y > -2; y -= 0.05) if (eyeOpening(xe, y, F) <= 0) { ye = y; break; }
      const R = EYE.r + 1.9, zz = Math.sqrt(Math.max(0, R * R - xe * xe - ye * ye));
      const len = (shaded ? 1.7 : 2.6) * (1 - 0.5 * Math.abs(t - 0.3));
      const root = [s * (EYE.x + xe), EYE.y + ye + 0.2, EYE.z + zz];
      const tipP = [s * (EYE.x + xe * 1.04), EYE.y + ye + len * 0.8, EYE.z + zz + len * 0.6];
      row.push([toGroup(root[0], root[1], root[2]), toGroup(tipP[0], tipP[1], tipP[2])]);
    }
    for (let k = 0; k < N; k++) {
      const [a0, a1] = row[k], [b0, b1] = row[k + 1];
      lashes.push(...a0.toArray(), ...b0.toArray(), ...b1.toArray(), ...a0.toArray(), ...b1.toArray(), ...a1.toArray());
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(lashes, 3));
  geo.computeVertexNormals();
  return geo;
}

/** how far a full beard's volume leans down from its rays below the mouth (it hangs: lifted along them, from above the jaw,
 *  the chin's beard jutted forward like a spade) */
const BEARD_HANG = 1.2;

/**
 * Tufts over a full beard's volume (`cap`, its lifts along the rays in mm): short cards rooted in its lower part, lying
 * along it down the way it grows and out past its edge, in the beard's colour, darker at the root.
 */
function beardTufts(cap: THREE.BufferGeometry, lifts: Float32Array, g: HeadGrid, rng: () => number): THREE.BufferGeometry {
  const P = cap.attributes.position, N = cap.attributes.normal, roots: number[] = [];
  // (where it stands well off the skin, below the cheeks)
  // (not round the mouth: tufts at its corners hung over the lips like fangs)
  for (let k = 0; k < lifts.length; k++) {
    const ax = Math.abs(g.p[k * 3]), y = g.p[k * 3 + 1];
    if (lifts[k] > 3 && y < 60 && (ax > 34 || y < mouthY(Math.min(ax, 24)) - 14)) roots.push(k);
  }
  const n = Math.min(roots.length, lod(220, 70)), out: THREE.BufferGeometry[] = [], V = THREE.Vector3;
  const p = new V(), nr = new V(), t = new V(), down = new V(0, -1, 0), centre = toGroup(0, 40, 20);
  for (let c = 0; c < n; c++) {
    const k = roots[Math.floor(rng() * roots.length)], y = g.p[k * 3 + 1], low = clamp((30 - y) / 50, 0, 1);
    p.fromBufferAttribute(P, k); nr.fromBufferAttribute(N, k).normalize();
    // down along the surface, out over its edge where it faces down
    t.copy(down).addScaledVector(nr, -down.dot(nr));
    if (t.lengthSq() < 0.1) t.copy(down).addScaledVector(nr, 0.6);
    t.normalize();
    // (short: longer ones hung from the beard's edge as drips)
    const len = (8 + rng() * 7 + 6 * low) * HEAD_MM, w = (7 + rng() * 4) * HEAD_MM, curl = (rng() - 0.5) * 6 * HEAD_MM, pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 4; i++) {
      const s = i / 4;
      pts.push(p.clone().addScaledVector(nr, (-1.5 + 2.5 * s * (1 - 0.4 * s)) * HEAD_MM).addScaledVector(t, len * s).addScaledVector(down, len * 0.25 * s * s)
        .add(new V(curl * s * s, 0, 0)));
    }
    const shade = 0.6 + 0.25 * rng();
    out.push(hairCard(pts, (s) => w * (1 - 0.7 * s), centre, lod(4, 2), (rng() - 0.5) * 0.8, (s) => shade * (0.75 + 0.25 * s), (_s, O) => { O.copy(nr); }));
  }
  const geo = mergeGeometries(out)!;
  for (const x of out) x.dispose();
  return geo;
}

/**
 * Short hair (`crop`): tufts of cards rooted on the cap (`roots`, its grid's points) over the back and sides below a hat's
 * band, each lying down the head the way short hair grows there (down, and back at the sides), kept on the skin at its
 * lift by the head's distance field (`clear`, with the ears) as the skull curves in to the nape, and its ends out past the
 * hairline, so the nape's edge is broken hair, not a cap's rim. (Under a hat the cap alone was a flat dark shell with a
 * hard edge.)
 */
function cropTufts(cap: THREE.BufferGeometry, roots: number[], g: HeadGrid, rng: () => number,
  clear: (x: number, y: number, z: number) => number): THREE.BufferGeometry {
  const P = cap.attributes.position, N = cap.attributes.normal, V = THREE.Vector3, out: THREE.BufferGeometry[] = [];
  const p = new V(), nr = new V(), t = new V(), q = new V(), gr = new V(), centre = toGroup(0, 110, -10), n = Math.min(roots.length * 3, lod(560, 160));
  // (a point moved along the field's gradient to `lift` mm off the skin: in or out)
  const settle = (v: THREE.Vector3, lift: number) => {
    for (let k = 0; k < 3; k++) {
      toFace(v, q);
      const dd = clear(q.x, q.y, q.z);
      gr.set(clear(q.x + 1, q.y, q.z) - clear(q.x - 1, q.y, q.z), clear(q.x, q.y + 1, q.z) - clear(q.x, q.y - 1, q.z), clear(q.x, q.y, q.z + 1) - clear(q.x, q.y, q.z - 1)).normalize();
      v.addScaledVector(gr, (lift - dd) * HEAD_MM);
    }
    return v;
  };
  for (let c = 0; c < n; c++) {
    const k = roots[Math.floor(rng() * roots.length)], fx = g.p[k * 3], fz = g.p[k * 3 + 2];
    p.fromBufferAttribute(P, k); nr.fromBufferAttribute(N, k).normalize();
    // down the head, and back towards the nape at the sides (more so the further forward)
    const side = Math.sign(fx) * clamp((fz + 30) / 60, 0, 1);
    t.set(0, -1, 0).addScaledVector(new V(0, 0, -1), 0.5 * Math.abs(side)).addScaledVector(new V(Math.sign(fx), 0, 0), (rng() - 0.5) * 0.5);
    t.addScaledVector(nr, -t.dot(nr)).normalize();
    // (short and fine at their ends: 10-17 mm long and 40% as wide at the tip, they hung off the hairline as teeth)
    const len = (6 + rng() * 6) * HEAD_MM, w = (4 + rng() * 3) * HEAD_MM, pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 4; i++) {
      const s = i / 4;
      pts.push(settle(p.clone().addScaledVector(t, len * s), 0.6 + 2.2 * s * (1 - 0.6 * s)));
    }
    const shade = 0.75 + 0.25 * rng();
    out.push(hairCard(pts, (s) => w * (1 - 0.88 * s), centre, lod(4, 2), (rng() - 0.5) * 0.6, (s) => shade * (0.7 + 0.3 * s), (_s, O) => { O.copy(nr); }));
  }
  const geo = mergeGeometries(out)!;
  for (const x of out) x.dispose();
  return geo;
}

/** a point of the head group's space (m) in the face's frame (mm) */
const toFace = (p: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 => out.set(p.x / HEAD_MM + ORIGIN.x, p.y / HEAD_MM + ORIGIN.y, p.z / HEAD_MM + ORIGIN.z);

/**
 * Thick, tousled hair to the chin, as a portrait shows it: parted a little off the middle, rising off the scalp and
 * swept out from the part over the temples (from the front its strands run out and down from the part), falling in
 * waves past the ears to about the chin, the ends curling out; a few curls framing the forehead at the temples, and
 * stray wisps. Locks of cards in layers, each lifted further off the scalp, every point kept clear of the skin and
 * the ears (the head's own distance field).
 */
/** what the locks of either style are laid with: a direction from its angles, the hairline's elevation towards an azimuth
 *  (the first point up the skin where the scalp grows hair), how far a point (mm) is from the skin or the ear standing off
 *  the side of the head, and a point (the group's metres) pushed out to `margin` mm from them, along the distance's gradient */
function hairTools(surface: Head['surface'], F: FaceShape, drop: number, temple: number) {
  const V = THREE.Vector3, q = new V(), g = new V();
  const dirOf = (az: number, el: number, v = new V()) => v.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  const hairEl = (az: number) => {
    for (let el = 0.2; el < 1.5; el += 0.01) { toFace(surface(az, el), q); if (scalp(Math.abs(q.x), q.y, q.z, drop, temple) > 0.6) return el; }
    return 1.5;
  };
  let earX = 40;
  while (earX < 90 && headSDF(earX, 97, 0, F) < 0) earX += 0.5;
  const clear = (x: number, y: number, z: number) => {
    const ex = (Math.abs(x) - earX - 7) / 12, ey = (y - 98) / 36, ez = (z + 8) / 25;
    return Math.min(headSDF(x, y, z, F), (Math.sqrt(ex * ex + ey * ey + ez * ez) - 1) * 15);
  };
  const pushOut = (p: THREE.Vector3, margin: number) => {
    for (let k = 0; k < 3; k++) {
      toFace(p, q);
      const d = clear(q.x, q.y, q.z);
      if (d >= margin) return;
      g.set(clear(q.x + 1, q.y, q.z) - clear(q.x - 1, q.y, q.z), clear(q.x, q.y + 1, q.z) - clear(q.x, q.y - 1, q.z), clear(q.x, q.y, q.z + 1) - clear(q.x, q.y, q.z - 1)).normalize();
      p.addScaledVector(g, (margin - d) * HEAD_MM);
    }
  };
  return { dirOf, hairEl, clear, pushOut };
}

/** where loose hair's locks down the back of the head end (the face's mm: 0 is about the chin's height), the lowest and
 *  how far above it the rest end: at the collar, as the locks at his sides. (Ending between the mouth and the chin,
 *  -40 to 0, the back was cut level above a bare neck, shorter than the sides: "it cut off too early".) */
const BACK_END = -92, BACK_SPREAD = 42;

function looseLocks(surface: Head['surface'], rng: () => number, skullC: THREE.Vector3, out: THREE.BufferGeometry[], F: FaceShape, drop: number, temple: number): void {
  const n = lod(460, 130), PART = 0.08, V = THREE.Vector3;
  const { dirOf, hairEl, clear, pushOut } = hairTools(surface, F, drop, temple), q = new V();
  const d0 = new V(), d1 = new V(), d = new V(), pts: THREE.Vector3[] = [], up = new V(0, 1, 0);
  for (let i = 0; i < n; i++) {
    const layer = i % 4, kind = rng(), s = rng() < 0.55 ? -1 : 1;
    const ph = rng() * Math.PI * 2, waves = 1.4 + rng() * 1.1, tone = 0.7 + rng() * 0.5;
    // over the head from (az0, el0) to where it leaves it (az1, el1), standing `top` mm off the scalp at its fullest,
    // then hanging to `yEnd` mm (the face's frame); `w` its width (mm)
    let az0: number, el0: number, az1: number, el1: number, top: number, yEnd: number, w: number, frame = false;
    // (a lock may turn on the way: up and back off the hairline first, then out to the side)
    let mid: [number, number] | null = null;
    if (kind < 0.12) {
      // the front, along the hairline: lifted up and back off the forehead, then out over the top and down the side
      // (it covers the part's front and frames the forehead's top, flat across it rather than arched)
      // (some rooted just across the part, so its front is covered)
      az0 = PART + s * (rng() * 0.48 - 0.07); el0 = hairEl(az0) + 0.02;
      mid = [PART + s * (0.12 + Math.abs(az0 - PART) * 0.8), el0 + 0.32 + rng() * 0.1];
      az1 = s * (1.45 + rng() * 0.35) + (s > 0 ? 0.1 : 0); el1 = 0.46 + rng() * 0.15 + (s > 0 ? 0.08 : 0);
      top = 18 + rng() * 9; yEnd = -55 + rng() * 45; w = 15 + rng() * 8;
    } else if (kind < 0.46) {
      // from the part (a line from the front of the hairline back over the top to the crown), out over the top and down
      // to the side past the ear: seen from the front its strands run out and down from the part. Roots further back
      // reach further round; on his left, the part's near side, the hair sweeps back higher over the temple.
      // (the part stops short of the crown, which the locks below run straight back over)
      const u = rng() ** 0.9 * 0.78;
      dirOf(PART, hairEl(PART) + 0.04, d0); dirOf(Math.PI - 0.25, 1.0, d1);
      const pa = d0.angleTo(d1), pd = d.copy(d0).multiplyScalar(Math.sin((1 - u) * pa)).addScaledVector(d1, Math.sin(u * pa)).normalize();
      az0 = Math.atan2(pd.x, pd.z) + s * (0.04 + 0.1 * rng() + 0.12 * (1 - sm(0, 0.15, u))) / Math.max(0.3, Math.cos(Math.asin(clamp(pd.y, -1, 1)))); el0 = Math.asin(clamp(pd.y, -1, 1));
      // (over the ear and down behind it, the ear showing below: none hang in front of it over the cheek)
      az1 = s * lerp(1.38, 2.6, u) * (0.94 + 0.12 * rng()) + (s > 0 ? 0.1 : 0); el1 = lerp(0.42, 0.45, u) + 0.12 * rng() + (s > 0 ? 0.1 : -0.02);
      top = 13 + rng() * 9; yEnd = -65 + rng() * 45; w = 15 + rng() * 9;
    } else if (kind < 0.64) {
      // the sides above the ears, back and down past them
      az0 = s * (1.0 + rng() * 1.0); el0 = 0.5 + rng() * 0.5;
      az1 = s * (Math.abs(az0) + 0.45 + rng() * 0.4); el1 = 0.3 + rng() * 0.18;
      top = 14 + rng() * 9; yEnd = -65 + rng() * 45; w = 14 + rng() * 8;
    } else if (kind < 0.72) {
      // over the crown: from the part ahead of the top of the head, straight back over it and down the back (where the
      // locks rising off the part meet on top never shows)
      dirOf(PART, hairEl(PART) + 0.04, d0); dirOf(Math.PI - 0.25, 1.0, d1);
      const u = 0.22 + rng() * 0.3, pa = d0.angleTo(d1), pd = d.copy(d0).multiplyScalar(Math.sin((1 - u) * pa)).addScaledVector(d1, Math.sin(u * pa)).normalize();
      az0 = Math.atan2(pd.x, pd.z) + s * rng() * 0.2; el0 = Math.asin(clamp(pd.y, -1, 1));
      az1 = s * (Math.PI - 0.05 - rng() * 0.4); el1 = -0.05 + rng() * 0.25;
      top = 14 + rng() * 8; yEnd = BACK_END + rng() * BACK_SPREAD; w = 18 + rng() * 9;
    } else if (kind < 0.9) {
      // the back of the head, down to the nape (rooted below the crown: none meet at a point)
      az0 = s * (1.9 + rng() * 1.24); el0 = 0.3 + rng() * 0.65;
      az1 = s * Math.min(Math.PI, Math.abs(az0) + rng() * 0.3); el1 = -0.05 + rng() * 0.2;
      top = 12 + rng() * 8; yEnd = BACK_END + rng() * BACK_SPREAD; w = 18 + rng() * 9;
    } else if (kind < 0.94) {
      // framing the forehead (more on his right, as the part leaves more hair that side): from the front of the hairline
      // out and down over the temple, beside the eye, curling away from the face
      frame = true;
      // (hanging straight down beside the forehead to about the brow: his right a little in from its edge)
      // (one arc: up off the hairline, over and down beside the forehead, the end flicking out; nothing hanging)
      const sf = rng() < 0.75 ? -1 : 1;
      az0 = sf * (sf < 0 ? 0.3 + rng() * 0.14 : 0.44 + rng() * 0.12); el0 = hairEl(az0) + 0.03;
      mid = [az0 * 1.1, el0 + 0.14];
      az1 = az0 * 1.3; el1 = 0.18 + rng() * 0.08;
      top = 10 + rng() * 5; yEnd = 0; w = 10 + rng() * 6; frame = true;
    } else {
      // more of the sides and back (the deepest layers)
      az0 = s * (1.3 + rng() * 1.8); el0 = 0.25 + rng() * 0.5;
      az1 = s * Math.min(Math.PI, Math.abs(az0) + 0.2 + rng() * 0.3); el1 = 0.0 + rng() * 0.2;
      top = 8 + rng() * 6; yEnd = BACK_END + rng() * BACK_SPREAD; w = 18 + rng() * 8;
    }
    pts.length = 0;
    const N = 9, dm = new V();
    if (mid) dirOf(mid[0], mid[1], dm);
    /** the direction a share `t` of the way between two (along the great circle) */
    const slerp = (A: THREE.Vector3, B: THREE.Vector3, t: number) => {
      const ang = A.angleTo(B), a = ang > 1e-4 ? Math.sin((1 - t) * ang) / Math.sin(ang) : 1 - t, b = ang > 1e-4 ? Math.sin(t * ang) / Math.sin(ang) : t;
      return d.copy(A).multiplyScalar(a).addScaledVector(B, b).normalize();
    };
    dirOf(az0, el0, d0); dirOf(az1, el1, d1);
    for (let k = 0; k <= N; k++) {
      // (along the great circle between the two, in waves across it and in and out)
      const t = k / N;
      if (mid) { if (t < 0.4) slerp(d0, dm, t / 0.4); else slerp(dm, d1, (t - 0.4) / 0.6); } else slerp(d0, d1, t);
      const az = Math.atan2(d.x, d.z) + 0.08 * Math.sin(ph + t * waves * Math.PI) * sm(0.15, 0.5, t), el = Math.asin(clamp(d.y, -1, 1));
      const lift = lerp(1.5, top + layer * 3.5, sm(0, 0.42, t)) + 6 * Math.sin(ph * 1.7 + t * waves * Math.PI) * sm(0.2, 0.6, t) + (frame ? 9 * sm(0.75, 1, t) : 0);
      pts.push(surface(az, el, lift));
    }
    // then down to its end in a loose curl (a helix widening towards the end, the card turning with it: seen from any
    // side it waves, wide where it faces you and thin where it turns away), the end flicking out and up
    const last = pts[N], o = new V(last.x - skullC.x, 0, last.z - skullC.z).normalize(), tg = new V().crossVectors(up, o);
    const turns = 1.5 + rng() * 1.3;
    if (!frame) {
      toFace(last, q);
      const fall = Math.max(18, q.y - yEnd) * HEAD_MM, R0 = (3 + rng() * 3) * HEAD_MM, R1 = (10 + rng() * 6) * HEAD_MM, M = 16;
      const lead = new V().subVectors(pts[N], pts[N - 1]).normalize(), fk = (12 + rng() * 10) * HEAD_MM;
      for (let k = 1; k <= M; k++) {
        const t = k / M, phi = ph + t * turns * Math.PI * 2, R = lerp(R0, R1, t) * sm(0, 0.25, t);
        const flick = t ** 2.2 * fk, flare = (0.5 + 1.5 * t) * HEAD_MM;
        // (carrying on the way it left the head at first, then hanging)
        const carry = (1 - t) ** 2 * 18 * HEAD_MM;
        const p = last.clone().addScaledVector(lead, carry).addScaledVector(o, flare + flick + R * Math.cos(phi)).addScaledVector(tg, R * Math.sin(phi));
        p.y = last.y - fall * t + flick * 0.7;
        pushOut(p, 3 + layer * 2.5);
        pts.push(p);
      }
    }
    for (let k = 3; k <= N; k++) pushOut(pts[k], 2 + layer * 2);
    // (smoothed once: a point pushed out on its own would kink the lock)
    for (let k = 1; k < pts.length - 1; k++) pts[k].lerp(new V().addVectors(pts[k - 1], pts[k + 1]).multiplyScalar(0.5), 0.3);
    // (each lock its own shade: darker at the root and in the deeper layers, lighter on its waves' crests)
    // (and darker where it lies close to the head: little light gets in there)
    const occ = pts.map((p) => { toFace(p, q); return (kind < 0.12 ? 0.75 : 0.55) + (kind < 0.12 ? 0.25 : 0.45) * sm(2, 28, clear(q.x, q.y, q.z)); });
    const occAt = (t: number) => { const f = t * (occ.length - 1), j = Math.min(occ.length - 2, Math.floor(f)); return lerp(occ[j], occ[j + 1], f - j); };
    const root = kind < 0.12 ? 0.85 : 0.62, shade = (t: number) => tone * (root + (1 - root) * sm(0, 0.25, t)) * (0.8 + 0.09 * layer) * (1 + 0.38 * Math.sin(ph + t * waves * Math.PI * 1.6)) * occAt(t);
    const tw = (rng() - 0.5) * (frame ? 0.4 : 0.9), wm = w * HEAD_MM;
    // (where it hangs, the card faces out from the curl's axis, turning with it)
    let h0 = 1;
    if (!frame) { let all = 0, onHead = 0; for (let k = 1; k < pts.length; k++) { const l = pts[k].distanceTo(pts[k - 1]); all += l; if (k <= N) onHead += l; } h0 = onHead / all; }
    const fv = new V(), facing = frame ? undefined : (t: number, O: THREE.Vector3) => {
      if (t <= h0) return;
      const phi = ph + (t - h0) / (1 - h0) * turns * Math.PI * 2;
      // (only partly: edge on, a card shows its pointed outline as a spike)
      O.lerp(fv.copy(o).multiplyScalar(Math.cos(phi)).addScaledVector(tg, Math.sin(phi)), 0.55 * sm(h0, h0 + 0.12, t)).normalize();
    };
    // (narrow at the root, so its end never shows as a block)
    out.push(hairCard(pts, (t) => wm * (0.35 + 0.65 * sm(0, 0.12, t)) * (1 - 0.45 * t ** 2), skullC, lod(56, 14), tw, shade, facing));
  }
}

/**
 * Hair combed straight back, as a portrait shows it: from the hairline back over the top of the head and round above the
 * ears, lying on the head all the way down to the nape (close at the hairline and over the temples, with body over the
 * crown) and ending just below the nape's hairline and behind the ears, the tips flicking out a little. Locks of cards in
 * layers, each lifted further off the scalp, every point kept clear of the skin and the ears (the head's own distance
 * field). (Fewer locks standing well off a cap of combed fur read as a wig; and hung straight down from where they left the
 * head, all ending about the jaw, they made a bob over the ears.)
 */
function sweptLocks(surface: Head['surface'], rng: () => number, skullC: THREE.Vector3, out: THREE.BufferGeometry[], F: FaceShape, drop: number, temple: number, mane = false): void {
  // (`mane`: the locks run on past the nape to the collar and behind the ears down the neck, stand fuller off the head and
  // wave more along their length, as the mage's sheet's: swept to the nape, his read as a slick black helmet)
  const n = lod(mane ? 480 : 400, 120), V = THREE.Vector3, fall = mane ? 1 : 0;
  const { dirOf, hairEl, clear, pushOut } = hairTools(surface, F, drop, temple), q = new V();
  const d0 = new V(), d1 = new V(), d = new V(), pts: THREE.Vector3[] = [];
  const slerp = (A: THREE.Vector3, B: THREE.Vector3, t: number) => {
    const ang = A.angleTo(B), a = ang > 1e-4 ? Math.sin((1 - t) * ang) / Math.sin(ang) : 1 - t, b = ang > 1e-4 ? Math.sin(t * ang) / Math.sin(ang) : t;
    return d.copy(A).multiplyScalar(a).addScaledVector(B, b).normalize();
  };
  for (let i = 0; i < n; i++) {
    const layer = i % 4, kind = rng(), s = rng() < 0.5 ? -1 : 1, ph = rng() * Math.PI * 2, tone = 0.72 + rng() * 0.45;
    // over the head from (az0, el0) to its end (az1, el1), `top` mm off the scalp at its fullest; `w` its width (mm)
    let az0: number, el0: number, az1: number, el1: number, top: number, w: number;
    if (kind < 0.3) {
      // from along the front of the hairline straight back over the top to the nape (rooted on it: no lock's end shows there)
      az0 = (rng() - 0.5) * 1.7 * (mane ? 0.35 + 0.65 * rng() : 1); el0 = hairEl(az0) + 0.015;
      // (a mane's cross the middle to either side, as hair combed straight back does: each kept to its own side, the two
      // halves parted down the middle)
      az1 = (mane ? s : Math.sign(az0) || s) * (Math.PI - 0.1 - 0.35 * Math.abs(az0) - 0.2 * rng()); el1 = -0.12 - rng() * 0.12 - fall * (0.08 + rng() * 0.08);
      top = 5 + rng() * 3 + fall * 9; w = 16 + rng() * 8;
    } else if (kind < 0.5) {
      // the temples, back round above the ears to behind them
      az0 = s * (0.85 + rng() * 0.6); el0 = hairEl(az0) + 0.015;
      az1 = s * (2.05 + rng() * 0.45 + fall * 0.35); el1 = 0.02 + rng() * 0.2;
      top = 4 + rng() * 3 + fall * 3; w = 14 + rng() * 7;
    } else if (kind < 0.75) {
      // the crown, behind the hairline, straight back over it to the nape
      az0 = (rng() - 0.5) * 1.4; el0 = hairEl(az0) + 0.15 + rng() * 0.45;
      az1 = (mane ? s : Math.sign(az0) || s) * (Math.PI - 0.05 - 0.45 * rng()); el1 = -0.16 - rng() * 0.1 - fall * (0.08 + rng() * 0.08);
      top = 8 + rng() * 4 + fall * 10; w = 18 + rng() * 9;
    } else {
      // the back of the head, down to the nape (the deeper layers)
      az0 = s * (1.6 + rng() * 1.5); el0 = 0.4 + rng() * 0.55;
      az1 = s * Math.min(Math.PI, Math.abs(az0) + rng() * 0.25); el1 = -0.2 - rng() * 0.1 - fall * (0.06 + rng() * 0.08);
      top = 6 + rng() * 4 + fall * 4; w = 18 + rng() * 9;
    }
    pts.length = 0;
    const N = mane ? 16 : 12, wave = mane ? 2.4 : 1;
    dirOf(az0, el0, d0); dirOf(az1, el1, d1);
    for (let k = 0; k <= N; k++) {
      // (along the great circle between the two: combed, a gentle wave across it and in and out; settling onto the neck
      // at its end, the tip flicking out)
      const t = k / N;
      slerp(d0, d1, t);
      const az = Math.atan2(d.x, d.z) + 0.03 * wave * Math.sin(ph + t * Math.PI * 2 * wave) * sm(0.2, 0.6, t), el = Math.asin(clamp(d.y, -1, 1));
      const lift = lerp(1, top + layer * 2.5, sm(0, 0.4, t)) * (1 - 0.65 * sm(0.75, 1, t)) + 1.5 * wave * Math.sin(ph * 1.3 + t * Math.PI * 2 * wave) * sm(0.25, 0.6, t) + (4 + 3 * rng()) * (1 + fall * 0.6) * sm(0.9, 1, t);
      pts.push(surface(az, el, lift));
    }
    if (mane) hang(pts, skullC, ph);
    for (let k = 2; k <= N; k++) pushOut(pts[k], 1.5 + layer * 1.8);
    // (smoothed once: a point pushed out on its own would kink the lock)
    for (let k = 1; k < pts.length - 1; k++) pts[k].lerp(new V().addVectors(pts[k - 1], pts[k + 1]).multiplyScalar(0.5), 0.3);
    // (each lock its own shade: darker at the root, in the deeper layers and where it lies close to the head)
    const occ = pts.map((p) => { toFace(p, q); return 0.6 + 0.4 * sm(2, 24, clear(q.x, q.y, q.z)); });
    const occAt = (t: number) => { const f = t * (occ.length - 1), j = Math.min(occ.length - 2, Math.floor(f)); return lerp(occ[j], occ[j + 1], f - j); };
    const shade = (t: number) => tone * (0.7 + 0.3 * sm(0, 0.2, t)) * (0.8 + 0.07 * layer) * (1 + 0.2 * Math.sin(ph + t * Math.PI * 3)) * occAt(t);
    const wm = w * HEAD_MM;
    // (the strands' texture's body along the lock and its tip only at the end: stretched over the lock, its tip, a third
    // of it, narrowing and fading, was the back of the head, and the hair seemed to stop at the crown's back)
    const vAt = (t: number) => (t < 0.88 ? 0.7 * t / 0.88 : 0.7 + 0.3 * (t - 0.88) / 0.12);
    // (narrow at the root, so its end never shows as a block)
    const card = hairCard(pts, (t) => wm * (0.35 + 0.65 * sm(0, 0.1, t)) * (1 - 0.4 * t ** 2), skullC, lod(40, 12), (rng() - 0.5) * 0.6, shade, undefined, vAt);
    if (mane) massNormals(card, skullC);
    out.push(card);
  }
}

/** Hair cut short (`short`, the mage's: the battle scholar's sheet): short locks rooted all over the top and the upper sides,
 *  longer on top and close at the sides (sdf-harness's short groom, `groomHair`: lengths by where they root), standing off
 *  the scalp on top and tousled, each running back over the head turned a random way from the comb's line, its tip lifting;
 *  `crop`'s tufts cover the back and the sides below them. Lit by the hair's mass (`massNormals`). */
function shortLocks(surface: Head['surface'], rng: () => number, skullC: THREE.Vector3, out: THREE.BufferGeometry[], F: FaceShape, drop: number, temple: number): void {
  const n = lod(720, 180), V = THREE.Vector3, N = 9;
  const { dirOf, hairEl, clear, pushOut } = hairTools(surface, F, drop, temple), q = new V();
  const r = new V(), flow = new V(), end = new V(), d = new V(), pts: THREE.Vector3[] = [];
  const slerp = (A: THREE.Vector3, B: THREE.Vector3, t: number) => {
    const ang = A.angleTo(B), a = ang > 1e-4 ? Math.sin((1 - t) * ang) / Math.sin(ang) : 1 - t, b = ang > 1e-4 ? Math.sin(t * ang) / Math.sin(ang) : t;
    return d.copy(A).multiplyScalar(a).addScaledVector(B, b).normalize();
  };
  for (let i = 0; i < n; i++) {
    const layer = i % 3, ph = rng() * Math.PI * 2, tone = 0.72 + rng() * 0.45;
    // (rooted anywhere from the hairline up, more of them towards the top, where the hair is longest)
    const az0 = (rng() * 2 - 1) * Math.PI, e0 = hairEl(az0) + 0.01, el0 = lerp(e0, 1.5, Math.sqrt(rng()));
    const topness = sm(0.55, 1.25, el0) * (1 - 0.5 * sm(2.2, 3, Math.abs(az0)));
    dirOf(az0, el0, r);
    // the comb's line: back over the head and down at the sides; along the front of the hairline forward instead, falling
    // over the forehead and swept to his right, as the sheet's (combed back, it read as slicked); turned a random way from
    // it (tousled), the crown's every way
    const fringe = sm(1.2, 0.4, Math.abs(az0)) * sm(0.45, 0.1, el0 - e0) * (rng() < 0.7 ? 1 : 0);
    flow.set(-0.45 * fringe, -0.35 * (1 - topness) - 0.5 * fringe, lerp(-1, 1, fringe));
    flow.addScaledVector(r, -r.dot(flow)).normalize();
    const crown = sm(1.0, 1.35, el0);
    flow.applyAxisAngle(r, (rng() - 0.5) * (0.6 + 1.2 * topness + 2.5 * crown) * (1 - 0.6 * fringe));
    // its length (mm): 18 to 30 at the sides, 40 to 65 on top; as an angle round the skull
    const R = surface(az0, el0, 0).distanceTo(skullC) / HEAD_MM, len = lerp(26, 56, topness) + rng() * lerp(14, 30, topness);
    const ang = len / R;
    end.copy(r).multiplyScalar(Math.cos(ang)).addScaledVector(flow, Math.sin(ang)).normalize();
    const top = 7 + 20 * topness + rng() * 7;
    pts.length = 0;
    for (let k = 0; k <= N; k++) {
      const t = k / N;
      slerp(r, end, t);
      const az = Math.atan2(d.x, d.z), el = Math.asin(clamp(d.y, -1, 1));
      // (standing up off the root, lying along the head, the tip lifting off it again on top)
      const lift = lerp(1, top * (1 - 0.6 * fringe) + layer * 2, sm(0, 0.35, t)) * (1 - (0.3 + 0.6 * fringe) * sm(0.6, 1, t)) + 5 * topness * (1 - fringe) * sm(0.7, 1, t) + 1.2 * Math.sin(ph + t * 5);
      pts.push(surface(az, el, lift));
    }
    for (let k = 2; k <= N; k++) pushOut(pts[k], 1.2 + layer * 1.5);
    for (let k = 1; k < pts.length - 1; k++) pts[k].lerp(new V().addVectors(pts[k - 1], pts[k + 1]).multiplyScalar(0.5), 0.3);
    // (each lock its own shade: darker at the root, in the deeper layers and where it lies close to the head)
    const occ = pts.map((p) => { toFace(p, q); return 0.6 + 0.4 * sm(2, 20, clear(q.x, q.y, q.z)); });
    const occAt = (t: number) => { const f = t * (occ.length - 1), j = Math.min(occ.length - 2, Math.floor(f)); return lerp(occ[j], occ[j + 1], f - j); };
    const shade = (t: number) => tone * (0.68 + 0.32 * sm(0, 0.3, t)) * (0.82 + 0.08 * layer) * occAt(t);
    const wm = (12 + rng() * 8 + 6 * topness) * HEAD_MM;
    const vAt = (t: number) => (t < 0.8 ? 0.7 * t / 0.8 : 0.7 + 0.3 * (t - 0.8) / 0.2);
    const card = hairCard(pts, (t) => wm * (0.4 + 0.6 * sm(0, 0.15, t)) * (1 - 0.55 * t ** 2), skullC, lod(14, 6), (rng() - 0.5) * 0.8, shade, undefined, vAt);
    massNormals(card, skullC);
    out.push(card);
  }
}

/** where a long lock ends (mm, the head's frame: the chin is about -60): at the collar behind, give or take `HANG_SPREAD` */
const HANG_END = -32, HANG_SPREAD = 24;

/** A long lock past the back of the skull hanging by its weight (sdf-harness's `grow`): from where it turns under the
 *  skull's widest, straight down to the collar, a little out from the head and waving across (along the scalp it curled
 *  in under the skull and ended at the ear lobes in a bowl; laid to a point far down the neck, it fell to the shoulders). */
function hang(pts: THREE.Vector3[], centre: THREE.Vector3, phase: number): void {
  const d = new THREE.Vector3();
  // (only behind the ears: a lock over the side of the head hanging straight down fell over the face)
  const from = pts.findIndex((p, k) => k > 2 && d.subVectors(p, centre).normalize().y < -0.3 && d.z < -0.35);
  const end = (HANG_END + HANG_SPREAD * Math.sin(phase * 3.7)) * HEAD_MM;
  if (from < 0) {
    // (a lock that stays on the side of the head is kept above the collar too)
    for (const p of pts) if (p.y < end) p.y = end - (end - p.y) * 0.15;
    return;
  }
  const base = pts[from].clone(), out = d.subVectors(base, centre).setY(0).normalize(), side = new THREE.Vector3(-out.z, 0, out.x);
  const drop = Math.max(0.01, base.y - end), n = pts.length - 1 - from;
  for (let k = from + 1; k < pts.length; k++) {
    const t = (k - from) / n, fall = drop * t;
    // (its end flicking out off the neck, as the sheet's ends curl)
    const flick = drop * 0.35 * Math.max(0, t - 0.7) ** 2 / 0.09;
    pts[k].copy(base).addScaledVector(out, fall * 0.18 + flick).addScaledVector(side, 0.008 * Math.sin(phase + t * 9)).setY(base.y - fall + flick * 0.4);
  }
}

/** A card lit as the hair's mass is (sdf-harness's strands): its normals turned most of the way to point out from the head's
 *  middle, so the side of the hair away from the light falls into shade as a whole; lit by the flat card's own, each lock
 *  caught the light on its own and the long hair read as overlapping shingles. */
function massNormals(card: THREE.BufferGeometry, centre: THREE.Vector3, share = 0.75): void {
  const p = card.attributes.position, n = card.attributes.normal, o = new THREE.Vector3(), f = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    o.set(p.getX(i), p.getY(i), p.getZ(i)).sub(centre).normalize();
    f.set(n.getX(i), n.getY(i), n.getZ(i));
    // (the card's face turned to the mass's side first: a twisted card's normal may point into the head)
    if (f.dot(o) < 0) f.negate();
    f.lerp(o, share).normalize();
    n.setXYZ(i, f.x, f.y, f.z);
  }
}

const sm = (a: number, b: number, x: number): number => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** the skin's distance from the ray origin towards (az, el), interpolated from the grid */
function radiusAt(g: HeadGrid, az: number, el: number): number {
  const find = (arr: Float64Array, v: number) => {
    let lo = 0, hi = arr.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m] <= v) lo = m; else hi = m; }
    return lo + clamp((v - arr[lo]) / (arr[hi] - arr[lo] || 1), 0, 1);
  };
  const a = Math.atan2(Math.sin(az), Math.cos(az));
  const fi = find(g.az, a), fj = find(g.el, clamp(el, -Math.PI / 2, Math.PI / 2));
  const i0 = Math.min(Math.floor(fi), g.nu - 1), j0 = Math.min(Math.floor(fj), g.nv - 1), W = g.nu + 1, u = fi - i0, v = fj - j0;
  const r = (i: number, j: number) => g.r[j * W + i];
  return (r(i0, j0) * (1 - u) + r(i0 + 1, j0) * u) * (1 - v) + (r(i0, j0 + 1) * (1 - u) + r(i0 + 1, j0 + 1) * u) * v;
}

// --- ears ------------------------------------------------------------------------------------------

/** the ear's outline round the middle of its bowl (degrees round from forward, towards the top: mm) */
const EAR_OUTLINE: [number, number][] = [[0, 12], [45, 16], [70, 24], [92, 33], [118, 31], [145, 26], [182, 21], [220, 21], [250, 26], [272, 29], [298, 23], [326, 15], [360, 12]];
// (a rounder top, the helix one C from front to back: the outline above came to a point at its top)
const EAR_ROUND: [number, number][] = [[0, 14], [45, 21], [70, 27], [95, 30], [120, 30], [150, 28], [185, 24], [220, 23], [250, 26], [275, 27], [300, 24], [330, 17], [360, 14]];
function outlineR(table: [number, number][], deg: number): number {
  const a = ((deg % 360) + 360) % 360;
  for (let i = 1; i < table.length; i++) {
    const [a1, r1] = table[i];
    if (a <= a1) { const [a0, r0] = table[i - 1], t = (a - a0) / (a1 - a0); return lerp(r0, r1, t * t * (3 - 2 * t)); }
  }
  return table[0][1];
}
/** the ear's outline's radius (mm) at `deg`, rounder at its top by `round` (0 to 1) */
const earR = (deg: number, round = 0): number => lerp(outlineR(EAR_OUTLINE, deg), outlineR(EAR_ROUND, deg), round);
/** a bump rising from 0 at a to 1 halfway and back to 0 at b */
const bump = (x: number, a: number, b: number): number => (x <= a || x >= b ? 0 : Math.sin(((x - a) / (b - a)) * Math.PI));
/** 1 inside the angular window [a, b] (degrees), easing over `e` */
const win = (deg: number, a: number, b: number, e = 20): number => {
  const d = ((deg - a) % 360 + 360) % 360, w = ((b - a) % 360 + 360) % 360;
  return d > w ? 0 : clamp(Math.min(d, w - d) / e, 0, 1);
};

/**
 * Where an ear's point (v up, u forward of the ear canal, mm) sits out from the middle: flat at the side of the head at
 * the canal (`sx`), or, with `earIn` set, on the side of the head under it: a flat ear's back half sank into a fuller
 * back of the skull, its front edge stood off where the head narrows before the canal (the mage). The head's side is
 * found on a grid over the ear.
 */
function earSeat(F: FaceShape, sx: number): (v: number, u: number) => number {
  if (F.earIn === undefined) return () => sx;
  const U0 = -50, V0 = -45, STEP = 2.5, NU = 33, NV = 37, grid: number[] = [];
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
    const y = 97 + V0 + j * STEP, z = U0 + i * STEP;
    let x = 30;
    while (x < 90 && headSDF(x, y, z, F) < 0) x += 1;
    let lo = x - 1, hi = x;
    for (let k = 0; k < 6; k++) {
      const m = (lo + hi) / 2;
      if (headSDF(m, y, z, F) < 0) lo = m;
      else hi = m;
    }
    grid.push(lo);
  }
  return (v, u) => {
    const fi = clamp((u - U0) / STEP, 0, NU - 1.001), fj = clamp((v - V0) / STEP, 0, NV - 1.001);
    const i = Math.floor(fi), j = Math.floor(fj), a = fi - i, b = fj - j, at = (ii: number, jj: number) => grid[jj * NU + ii];
    return lerp(lerp(at(i, j), at(i + 1, j), a), lerp(at(i, j + 1), at(i + 1, j + 1), a), b);
  };
}

/**
 * An ear (ANSUR II: 64 mm long, 36 wide): a rolled rim (the helix) round a shallow groove, a ridge
 * inside it, a deep bowl leading to the ear canal with the small flap in front of it, a soft lobe.
 * Built in the ear's own frame (u forward, v up, the relief out from the head), set on the side of the
 * head at the ear canal, its top tilted back and its back edge standing off the head.
 */
function earGeometry(s: number, F: FaceShape, ao = 0): THREE.BufferGeometry {
  const rd = F.earRound ?? 0, sc = F.earScale ?? 1;
  // (more rings for a rim rolled round, more steps round a rounded outline: over one its edge was a step, round 40 a
  // polygon)
  const nt = rd ? lod(64, 28) : lod(40, 20), nr = rd ? lod(18, 8) : lod(12, 6), thick = F.earThick ?? 3.4;
  // the side of the head at the ear canal
  let sx = 40;
  while (sx < 90 && headSDF(sx, 97, 0, F) < 0) sx += 0.5;
  const tilt = 0.26, flare = F.earFlare ?? 0.5, cu = -8 * sc, cv = 3 * sc;
  const seat = earSeat(F, sx);
  // (`floor`: the least a point stands off the head's skin, mm: a rounded ear's bowl sank into the head, the skin
  // showing through as a hole)
  const place = (u: number, v: number, h: number, out: THREE.Vector3, floor = -Infinity) => {
    // tilt the ear back, then flare it out from the head about its front edge
    const u1 = u * Math.cos(tilt) - v * Math.sin(tilt), v1 = u * Math.sin(tilt) + v * Math.cos(tilt);
    const back = Math.max(0, -u1);
    const out1 = h + back * Math.sin(flare), u2 = u1 + (u1 < 0 ? back * (1 - Math.cos(flare)) : 0);
    // (a seated ear's front edge, the rim's root and the flap before the canal, grows out of the cheek: sunk into it)
    const root = F.earIn === undefined ? 0 : 4 * sm(-2, 10, u2);
    return toGroup(s * (seat(v1, u2) + Math.max(floor, 4 - (F.earIn ?? 0) - root + out1)), 97 + v1, u2, out);
  };
  const front: number[] = [], backP: number[] = [], v = new THREE.Vector3(), cf: number[] = [], cb: number[] = [];
  for (let j = 0; j <= nr; j++) {
    const rho = j / nr;
    for (let i = 0; i <= nt; i++) {
      const deg = (i / nt) * 360, a = deg * Math.PI / 180, R = earR(deg, rd) * rho * sc;
      const lobe = win(deg, 245, 305, 25), tragus = win(deg, 330, 30, 18), back = win(deg, 80, 250, 30);
      // relief: the rolled rim, the groove inside it, the ridge, the bowl, the flap before the canal
      // (a rounded ear's rim a C, open at the front where it runs down into the bowl; the ridge inside it at the back;
      // a shallower bowl: rings all round and a 7.5 mm bowl read as a target with a hole in it)
      const open = rd * win(deg, 300, 40, 30);
      let h = 3.3 * bump(rho, 0.76, 1.08) * (1 - lobe) * (1 - 0.75 * open) + 0.6 * bump(rho, 0.62, 0.8) * (1 - rd);
      h += 2.6 * bump(rho, 0.44, 0.7) * (0.35 * (1 - rd) + 0.65 * back) * (1 - lobe);
      h += 2.4 * bump(rho, 0.4, 0.7) * win(deg, 215, 250, 12);
      h -= (7.5 - 2.5 * rd) * Math.max(0, 1 - rho / 0.5) ** 1.4 * (1 + 0.25 * win(deg, 330, 30, 30));
      h += 3.4 * bump(rho, 0.5, 1.02) * tragus;
      h += 1.2 * lobe * sm(0.3, 0.8, rho);
      const u = cu + Math.cos(a) * R, vv = cv + Math.sin(a) * R, th = thick * (1 + 0.6 * lobe);
      // (a rolled rim: the front and the back curling round to meet at the outer edge, not a flat band between them)
      const roll = rd * sm(0.86, 1, rho) ** 1.5 * th * 0.45;
      place(u, vv, h - roll, v, rd ? 1 : -Infinity); front.push(v.x, v.y, v.z);
      place(u, vv, h - th + roll, v); backP.push(v.x, v.y, v.z);
      // (occlusion: deep in the bowl, the back against the head; all of it in the hair's shade, the top most)
      const k = ao ? 1 - (0.55 + 0.1 * sm(-10, 25, vv) + 0.2 * sm(0, -6, h)) : 1, kb = k * (1 - 0.45 * ao);
      cf.push(k ** 0.8, k, k ** 1.05); cb.push(kb ** 0.8, kb, kb ** 1.05);
    }
  }
  // one indexed mesh (smooth normals): the front faces out from the head, the back towards it, a rim
  // joins them round the outline; the right ear is the mirror image, so its winding turns over
  const W = nt + 1, off = front.length / 3, idx: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, out: boolean) => {
    if (out !== s < 0) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c);
  };
  for (let j = 0; j < nr; j++) for (let i = 0; i < nt; i++) {
    const a = j * W + i, b = a + 1, c = a + W + 1, d = a + W;
    quad(a, b, c, d, true);
    quad(off + a, off + b, off + c, off + d, false);
  }
  const rim = nr * W;
  for (let i = 0; i < nt; i++) quad(rim + i, off + rim + i, off + rim + i + 1, rim + i + 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...front, ...backP], 3));
  if (ao) g.setAttribute('color', new THREE.Float32BufferAttribute([...cf, ...cb], 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// --- hair ----------------------------------------------------------------------------------------

const strandTex = new Map<boolean, THREE.DataTexture>();
/**
 * A lock of hair for the hair cards: fine strands running down the texture (v along the lock), each its own shade,
 * thinning towards the card's sides and its tip, on transparency. `dense`: a clump, solid in its middle (its strands
 * shown by their shades), its edges and tip ragged: thick hair rather than a few strings.
 */
/**
 * A thin two-sided material lit on both sides as its front: a hair card is a lock of strands, not a sheet with an
 * inside, but three turns a back face's normal over, into the head, and seen from behind (along the hair's outline)
 * it shaded near black against the sky. Its own program, compiled with the rest at the boot's warm-up.
 */
function bothSidesOut(m: THREE.Material): void {
  const base = m.onBeforeCompile.bind(m), key = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = (shader, renderer) => {
    base(shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>',
      THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
  };
  m.customProgramCacheKey = () => key() + '-bothsides';
  (m as unknown as { litBothSides: boolean }).litBothSides = true;
}

/**
 * A cut-out map from a canvas, its see-through pixels given its strands' mean colour (alpha kept): cleared to
 * transparent black, the filtering and the mipmaps blended that black into every edge the alpha test keeps, a dark
 * outline round the hair against a bright sky. (A canvas is stored premultiplied, so the colour is set in the pixels
 * read back, and the map made from them; rows turned over as a canvas texture's are.)
 */
function bledMap(c: CanvasRenderingContext2D, W: number, H: number): THREE.DataTexture {
  const src = c.getImageData(0, 0, W, H).data, d = new Uint8Array(W * H * 4);
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < src.length; i += 4) {
    const a = src[i + 3] / 255;
    r += src[i] * a; g += src[i + 1] * a; b += src[i + 2] * a; n += a;
  }
  if (n > 0) { r /= n; g /= n; b /= n; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, o = ((H - 1 - y) * W + x) * 4;
    // (a faint pixel's own colour is too coarse to keep: blended towards the mean as it fades out)
    const k = Math.min(1, src[i + 3] / 128);
    d[o] = src[i] * k + r * (1 - k); d[o + 1] = src[i + 1] * k + g * (1 - k); d[o + 2] = src[i + 2] * k + b * (1 - k);
    d[o + 3] = src[i + 3];
  }
  const t = new THREE.DataTexture(d, W, H, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

function strandMap(dense = false): THREE.DataTexture {
  const hit = strandTex.get(dense);
  if (hit) return hit;
  const W = 128, H = 512, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d')!, rng = mulberry(dense ? 31 : 29);
  c.clearRect(0, 0, W, H);
  if (dense) {
    // the clump's body, narrowing to the tip
    c.fillStyle = 'rgb(150,150,150)';
    c.beginPath(); c.moveTo(W * 0.2, H * 0.06); c.lineTo(W * 0.8, H * 0.06); c.quadraticCurveTo(W * 0.74, H * 0.6, W * 0.5, H * 0.92); c.quadraticCurveTo(W * 0.26, H * 0.6, W * 0.2, H * 0.06); c.fill();
  }
  for (let k = 0; k < (dense ? 560 : 90); k++) {
    // strands thin out towards the card's sides, some end early (a ragged tip)
    const e = dense ? clamp((rng() + rng() + rng() - 1.5) / 1.5, -1, 1) : rng() * 2 - 1, x0 = W / 2 + Math.sign(e) * Math.abs(e) ** (dense ? 1 : 1.4) * W * 0.48;
    const len = H * (dense ? 0.5 + rng() * 0.5 : 0.45 + rng() * 0.55), wv = (rng() - 0.5) * 12, w = dense ? 0.8 + rng() * 1 : 0.9 + rng() * 1.8;
    const l = dense ? 0.56 + rng() * 0.22 + (rng() < 0.05 ? 0.16 : 0) : 0.35 + rng() * 0.65;
    // (a clump's strands start raggedly at the root)
    const y0 = dense ? rng() * H * 0.1 : 0;
    c.strokeStyle = `rgb(${Math.round(255 * Math.min(1, l))},${Math.round(255 * Math.min(1, l))},${Math.round(255 * Math.min(1, l))})`;
    c.lineWidth = w;
    c.beginPath();
    for (let y = y0; y <= len; y += 8) {
      // (drawn in towards the tip with the clump)
      const x = (dense ? W / 2 + (x0 - W / 2) * (1 - 0.55 * (y / H) ** 1.5) : x0) + Math.sin(y / H * 5 + k) * wv * (y / H);
      if (y === y0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.stroke();
  }
  if (dense) {
    // (a clump is rounded: darker at its edges)
    c.globalCompositeOperation = 'source-atop';
    const e = c.createLinearGradient(0, 0, W, 0);
    e.addColorStop(0, 'rgba(0,0,0,0.6)'); e.addColorStop(0.3, 'rgba(0,0,0,0.12)'); e.addColorStop(0.5, 'rgba(0,0,0,0)'); e.addColorStop(0.7, 'rgba(0,0,0,0.12)'); e.addColorStop(1, 'rgba(0,0,0,0.6)');
    c.fillStyle = e; c.fillRect(0, 0, W, H);
  }
  // the tip thins out
  c.globalCompositeOperation = 'destination-in';
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(dense ? 0.75 : 0.65, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  const t = bledMap(c, W, H);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  strandTex.set(dense, t);
  return t;
}

/**
 * A hair card: a ribbon `width(t)` wide along a curve through `pts`, lying flat on the head (its face
 * turned out from `centre`, unless `facing` turns it), the strands running along it.
 */
function hairCard(pts: THREE.Vector3[], width: (t: number) => number, centre: THREE.Vector3, segs: number, twist = 0, shade: (t: number) => number = () => 1,
  facing?: (t: number, O: THREE.Vector3, p: THREE.Vector3) => void, vAt: (t: number) => number = (t) => t): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts), pos: number[] = [], uv: number[] = [], idx: number[] = [], col: number[] = [];
  const p = new THREE.Vector3(), T = new THREE.Vector3(), O = new THREE.Vector3(), X = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, p); curve.getTangentAt(t, T);
    O.subVectors(p, centre).normalize();
    facing?.(t, O, p);
    X.crossVectors(T, O).normalize().applyAxisAngle(T, twist * t);
    const w = width(t) / 2;
    pos.push(p.x - X.x * w, p.y - X.y * w, p.z - X.z * w, p.x + X.x * w, p.y + X.y * w, p.z + X.z * w);
    uv.push(0, 1 - vAt(t), 1, 1 - vAt(t));
    const c = shade(t); col.push(c, c, c, c, c, c);
    if (i < segs) { const a = i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// --- the neck -------------------------------------------------------------------------------------

/**
 * The neck on the rig's neck joint, up into the head (whose own skin carries on under the jaw): oval,
 * a man's neck (ANSUR II: 40 cm round), the two muscles from behind the ears to the breastbone showing
 * as a V from the front, the Adam's apple. `len`: the neck joint to the head joint (m).
 */
/** With the head's joint, the top of the neck follows the head (skinned; see Sculpt.skin) */
export function buildNeck(neckJoint: THREE.Object3D, kit: MaterialKit, who: keyof typeof FACES, len: number, headJoint?: THREE.Object3D): void {
  const F = FACES[who], C = F.neckCol, rings = C ? lod(32, 32) : lod(24, 24), segs = C ? lod(64, 24) : lod(28, 14), pos: number[] = [], posN: number[] = [], idx: number[] = [], share: number[] = [];
  for (let k = 0; k <= rings; k++) {
    const t = k / rings, y = lerp(-0.03, len + 0.012, t), yf = (y - len) / HEAD_MM;
    // wider at the base, set a little back at the top (under the skull), in mm
    // (a face with a narrower neck under its jaw has the neck's top to match, standing in under the jaw's line)
    let rx = lerp(66, (F.neckW ?? 54) + 3, sm(0, 1, t)), rz = lerp(62, 52, sm(0, 1, t)), cz = lerp(-2, -13, t);
    if (C) {
      // a column neck: the head's own column's section all the way up, flaring only at its base inside the clothes
      const fl = 5 * sm(-60, -95, yf) + (F.neckFlare ?? 0) * sm(-35, -110, yf) ** 1.5;
      rx = C[0] + fl; rz = C[1] + fl * 0.8; cz = (F.neckBack ?? -8) - ORIGIN.z;
    }
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2 - Math.PI, ang = Math.abs(a);
      // a column neck crosses the head's skin at its seam by a millimetre each way (outside it below, inside above), and is
      // shaded as the column without the crossing (its slope tilted the normals, and the light from above made a band of it);
      // the muscles' relief only below it (the head's column has none)
      const s = C ? neckSeam(Math.cos(a)) : 0, cross = C ? 1 - 2 * sm(s - 4, s + 4, yf) : 0, up = C ? sm(s - 2, s - 12, yf) : 1;
      // the muscles running from the back of the jaw (top) to the breastbone (bottom), the Adam's apple
      const scm = 3 * up * Math.exp(-(((ang - lerp(0.45, 1.3, t)) / 0.28) ** 2));
      // (under a column neck's seam, wholly)
      const adam = 5 * up * Math.exp(-((a / 0.3) ** 2)) * (C ? Math.exp(-(((yf + 62) / 12) ** 2)) : Math.exp(-(((t - 0.55) / 0.16) ** 2)));
      pos.push(Math.sin(a) * (rx + scm + cross) * HEAD_MM, y, (cz + Math.cos(a) * (rz + scm + adam + cross)) * HEAD_MM);
      posN.push(Math.sin(a) * (rx + scm) * HEAD_MM, y, (cz + Math.cos(a) * (rz + scm + adam)) * HEAD_MM);
      // (moving with the head from a little below the seam, as the head's skin there does; bending under that)
      share.push(sm(s - 40, s - 12, yf));
    }
  }
  const W = segs + 1;
  for (let k = 0; k < rings; k++) for (let i = 0; i < segs; i++) { const a = k * W + i; idx.push(a, a + 1, a + W, a + 1, a + W + 1, a + W); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(posN, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  weldNormals(g, W);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // (a column neck's share of the head's motion, round it: the two skins stay matched at the seam as the head turns)
  if (C) g.setAttribute('skinK', new THREE.Float32BufferAttribute(share, 1));
  const mat = plainSkin(kit, who);
  mat.roughness = LOOKS[who].ao ? 0.88 : 0.6;
  const meshes = headJoint ? new Sculpt().skin(g, mat, neckJoint, headJoint, len * 0.35, len).build() : [part(g, mat, neckJoint)];
  // (named, so a probe or a tool can find it: tools/lab neck)
  for (const m of meshes) m.name = 'neck';
}
