// Procedural textures: cobblestone, ashlar, flagstones, marble, slate, forest floor, bark, grunge, rune circles, decals.
// Everything is generated on the CPU once at startup (no external art assets).
import * as THREE from 'three';
import { makeFbm, mulberry, clamp } from '../util';
import { RECIPES, PRELOAD, recipeKey, makeVoronoi, photosFor, type PBRData, type RecipeName, type RecipeArgs } from './pbr';

export function canvasOf(size: number, height = size): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size; c.height = height;
  return c;
}

/** 2D context that is never null (canvas 2D is always available in browsers). */
export function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  return c.getContext('2d')!;
}

/**
 * The 2D context of a canvas whose pixels are read back (`getImageData`), drawn and read on the CPU. On the GPU each
 * read was a round trip to the GPU's process, waiting behind its work (on a first visit, the lobby's panels' raster:
 * the hero's build waited 0.8 s for the engraving's). Not for a canvas that's only drawn and made a texture: from
 * the CPU, its upload is a copy of all its pixels (the lobby's maps' took 0.58 s, against 4 ms from the GPU).
 */
export function readCtx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  return c.getContext('2d', { willReadFrequently: true })!;
}

function toTexture(canvas: HTMLCanvasElement, srgb: boolean, u = 1, v = u): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(u, v);
  t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

export interface PBRCanvases { albedo: HTMLCanvasElement; normal: HTMLCanvasElement; rough: HTMLCanvasElement }

const cache = new Map<string, PBRCanvases>();
const texCache: Record<string, THREE.CanvasTexture> = {};
/** maps made by the loading workers, waiting to be asked for */
const made = new Map<string, PBRData>();
/** whether a map was made afresh, not read back from a visit before (`mapsMadeAfresh`) */
let madeAfresh = false;
/** Whether a map has come made afresh: a first visit, or a new build's (whose programs are new to the GPU's cache
 *  too, likely as not). */
export const mapsMadeAfresh = (): boolean => madeAfresh;
/** the map each canvas handed out is painted with, by key (`mapsArrived`) */
const keyOfCanvas = new WeakMap<HTMLCanvasElement, string>();
/** the maps the loading workers are still making, by key: what to make, and its arrival */
const coming = new Map<string, { job: Job; arrive: () => void; arrived: Promise<void> }>();
/** a map to make: its recipe and what it's made with */
export type Job = (typeof PRELOAD)[number];

const make = ([name, args]: Job): PBRData => (RECIPES[name] as (...a: unknown[]) => PBRData)(...args);

/** the maps whose albedo the page paints from (the engraving's steel): their pixels kept as they came
 *  (`albedoPixels`) */
const PAINTED_FROM = new Set([recipeKey('steel', [])]);
const albedos = new Map<string, ImageData>();

/** `maps` (`key`'s) painted with `d` (sized to it: a map asked for before it was made is handed out blank) */
function paint(maps: PBRCanvases, d: PBRData, key: string): void {
  const h = d.height ?? d.size;
  for (const [c, data] of [[maps.albedo, d.albedo], [maps.normal, d.normal], [maps.rough, d.rough]] as const) {
    c.width = d.size; c.height = h;
    ctx2d(c).putImageData(new ImageData(data, d.size, h), 0, 0);
  }
  if (PAINTED_FROM.has(key)) albedos.set(key, new ImageData(d.albedo, d.size, h));
}

/** `maps`' albedo's pixels: as its map came where the page paints from it (`PAINTED_FROM`), not read back from
 *  its canvas (a round trip to the GPU's process); else read back. */
export function albedoPixels(maps: PBRCanvases): ImageData {
  const kept = albedos.get(keyOfCanvas.get(maps.albedo) ?? '');
  return kept ?? ctx2d(maps.albedo).getImageData(0, 0, maps.albedo.width, maps.albedo.height);
}

/** the ray grids the faces were painted on, by the face's key (`faceGrid`) */
const grids = new Map<string, NonNullable<PBRData['grid']>>();

/** A map made (by a worker, or on the page for one a worker failed): painted on its canvases if they were asked for. */
function arrived(key: string, d: PBRData): void {
  if (d.grid) grids.set(key, d.grid);
  const maps = cache.get(key);
  if (maps) paint(maps, d, key); else made.set(key, d);
  coming.get(key)?.arrive();
  coming.delete(key);
}

/**
 * A map's canvases. One the workers are still making is handed out blank and painted as it arrives: three reads a
 * canvas as it first draws it, and nothing is drawn before every map has come (`MapsComing.all`, awaited by the
 * first warm-up's render), so the arena and the heroes are built while the workers paint.
 */
function pbrCanvases<N extends RecipeName>(name: N, ...args: RecipeArgs<N>): PBRCanvases {
  const key = recipeKey(name, args);
  let maps = cache.get(key);
  if (maps) return maps;
  cache.set(key, maps = { albedo: canvasOf(1), normal: canvasOf(1), rough: canvasOf(1) });
  for (const canvas of [maps.albedo, maps.normal, maps.rough]) keyOfCanvas.set(canvas, key);
  if (coming.has(key)) return maps;
  const d = made.get(key) ?? make([name, args] as Job);
  if (d.grid) grids.set(key, d.grid);
  paint(maps, d, key);
  made.delete(key);
  return maps;
}

export const cobblestone = (): PBRCanvases => pbrCanvases('cobblestone');
/** Squared blocks in courses (walls, a plinth): `courses` a tile, `blocks` a course. */
export const ashlar = (seed: number, courses: number, blocks: number): PBRCanvases => pbrCanvases('ashlar', seed, courses, blocks);
/** Irregular stone slabs (a dais), `cells` across a tile; `marble`'s cut from black marble. */
export const flagstone = (seed: number, cells: number): PBRCanvases => pbrCanvases('flagstone', seed, cells);
export const marble = (seed: number, cells: number): PBRCanvases => pbrCanvases('marble', seed, cells);
/** Riven slate slabs in courses (a dais): `courses` a tile, `blocks` a course. */
export const slate = (seed: number, courses: number, blocks: number): PBRCanvases => pbrCanvases('slate', seed, courses, blocks);
/** Weathered rock, cracked, mossy and crusted with lichen, a tile a metre (boulders, standing stones). */
export const rock = (seed: number): PBRCanvases => pbrCanvases('rock', seed);
export const granite = (seed: number): PBRCanvases => pbrCanvases('granite', seed);
/** Weathered limestone, pitted, streaked by the rain and cracked, a tile a metre (the crypt's carved stone). */
export const limestone = (seed: number): PBRCanvases => pbrCanvases('limestone', seed);
export const moss = (seed: number): PBRCanvases => pbrCanvases('moss', seed);
export const grunge = (): PBRCanvases => pbrCanvases('grunge');
export const wood = (): PBRCanvases => pbrCanvases('wood');
export const burlap = (): PBRCanvases => pbrCanvases('burlap');
export const forestFloor = (): PBRCanvases => pbrCanvases('forestFloor');
/** Bare earth: clumpy soil and grit, no litter (where the crypt's dead trees grow). */
export const soil = (): PBRCanvases => pbrCanvases('soil');
export const bark = (): PBRCanvases => pbrCanvases('bark');
/** the heroes' materials: neutral albedo, tinted by the material's colour */
export const leather = (): PBRCanvases => pbrCanvases('leather');
export const oiled = (): PBRCanvases => pbrCanvases('oiled');
/** bare skin: fine wrinkles and pores (the fingers a glove leaves bare) */
export const skin = (): PBRCanvases => pbrCanvases('skin');
export const wool = (): PBRCanvases => pbrCanvases('wool');
export const felt = (): PBRCanvases => pbrCanvases('felt');
export const mail = (): PBRCanvases => pbrCanvases('mail');
export const cloth = (): PBRCanvases => pbrCanvases('cloth');
export const steel = (): PBRCanvases => pbrCanvases('steel');
export const fur = (): PBRCanvases => pbrCanvases('fur');
export const bowWood = (): PBRCanvases => pbrCanvases('bowWood');
/** a hero's painted face (entities/models/face.ts), on its head's ray grid */
export const faceCanvases = (who: 'warrior' | 'mage' | 'ranger'): PBRCanvases => pbrCanvases('face', who);
/** the ray grid a hero's face was painted on, once it has been (models/head.ts builds the head on it) */
export const faceGrid = (who: 'warrior' | 'mage' | 'ranger'): PBRData['grid'] => grids.get(recipeKey('face', [who]));

/** The key of the map `texture` is painted with (`bark()`), where it's one of these canvases. */
export const mapKeyOf = (texture: THREE.Texture): string | undefined => keyOfCanvas.get(texture.image as HTMLCanvasElement);

/**
 * Resolved once every map `textures` are painted with has come: what a warm-up draws waits for its own maps alone
 * (the lobby's, not the fight's: those come while it shows).
 */
export function mapsArrived(textures: Iterable<THREE.Texture>): Promise<void> {
  const waits: Promise<void>[] = [];
  for (const texture of textures) {
    const key = mapKeyOf(texture);
    const map = key === undefined ? undefined : coming.get(key);
    if (map) waits.push(map.arrived);
  }
  return Promise.all(waits).then(() => undefined);
}

/** Resolved once every map the loading workers were asked for has come (the lab waits for it before it measures: a
 *  map landing mid-measure, later under a loaded machine, drew a foe's skin blank for some frames and not others). */
export function everyMapCome(): Promise<void> {
  return Promise.all([...coming.values()].map((map) => map.arrived)).then(() => undefined);
}

/** `PRELOAD` in the order the lobby needs its maps: the steel and `hero`'s face (the one it shows), the other maps,
 *  then the other heroes' faces (1.5 s each in a worker: on a first visit, made before the heroes' materials, the
 *  lobby waited 1.7 s for its maps). */
function inTheLobbysOrder(hero: string): Job[] {
  const face = (job: Job): boolean => job[0] === 'face';
  const own = (job: Job): boolean => face(job) && job[1][0] === hero;
  const steel = PRELOAD.filter((job) => job[0] === 'steel');
  const rest = PRELOAD.filter((job) => job[0] !== 'steel' && !face(job));
  return [...steel, ...PRELOAD.filter(own), ...rest, ...PRELOAD.filter((job) => face(job) && !own(job))];
}

/** The maps the workers are making: `ready` when one has come, `all` when every one has. */
export interface MapsComing {
  ready<N extends RecipeName>(name: N, ...args: RecipeArgs<N>): Promise<void>;
  all: Promise<void>;
}

/** What a worker sends back: the map, when it was made (in the worker's clock from its time origin), whether it
 *  was read back from a visit before (core/kept.ts), how long asking the store for it took (`readMs`), and when
 *  the worker's script ran (`up`, in that clock too). */
export interface MapMade { key: string; data: PBRData; start: number; ms: number; kept: boolean; readMs: number; up: number }

/** What a maps worker is given as it's made, in its name: the maps in the order they're needed, its place among
 *  the workers and how many there are, this boot's mark (the locks the workers share the maps out by are this
 *  boot's alone, `pbr.worker.ts`), and in the lab's pages the name their maps are kept under (core/kept.ts `keepAs`,
 *  `window.__labMapsAs`). */
export interface MapOrders { jobs: Job[]; worker: number; workers: number; boot: string; keepAs?: string }

/** the name the lab keeps a dev build's maps under (tools/lab/node/side.mjs), none in the game */
const labMapsAs = (): string | undefined => (globalThis as { __labMapsAs?: string }).__labMapsAs;

/**
 * Make the game's PBR maps in workers, in parallel, while the page stays responsive: done on the
 * main thread they block it for over a second, and a window moved to another monitor meanwhile
 * shows black until the main thread can paint it. Without workers, the maps are made on first use;
 * those a failed worker leaves are made on the page once the others are done. A production build's are
 * kept for the next visit (core/kept.ts). The lobby's come first: `hero` is the hero it shows (his model). The
 * workers share the maps out among themselves: handed out by the page, a worker waited for the page's long tasks
 * between them, and its first for the arena's (its messages are the page's to pass on: 0.8 s on a first visit).
 * Each is timed as a user timing measure, `map <key>`, from the worker's start on it to its end, its detail
 * whether it was kept, how long the store took to answer, when its worker was asked for and when its script ran
 * (the stalls' boot lists them).
 */
export function preloadTextures(hero: string): MapsComing {
  const jobs = typeof Worker === 'undefined' ? [] : inTheLobbysOrder(hero);
  for (const job of jobs) {
    let arrive = (): void => undefined;
    const at = new Promise<void>((resolve) => { arrive = resolve; });
    coming.set(recipeKey(job[0], job[1]), { job, arrive, arrived: at });
  }
  const ready = <N extends RecipeName>(name: N, ...args: RecipeArgs<N>): Promise<void> => {
    return coming.get(recipeKey(name, args))?.arrived ?? Promise.resolve();
  };
  if (!jobs.length) return { ready, all: Promise.resolve() };
  // (more than 4 made a first visit's maps no sooner: they vie with the GPU's compiles, as the maps' times showed)
  const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1, jobs.length));
  // (this boot's alone: another tab's workers share out maps of their own)
  const boot = `${performance.timeOrigin} ${Math.random()}`;
  const workers: Worker[] = [];
  const run = (worker: number): Promise<void> => new Promise((resolve) => {
    const orders: MapOrders = { jobs, worker, workers: n, boot, keepAs: labMapsAs() };
    let w: Worker;
    const asked = performance.now();
    try {
      w = new Worker(new URL('./pbr.worker.ts', import.meta.url), { type: 'module', name: JSON.stringify(orders) });
    } catch { resolve(); return; }
    workers.push(w);
    w.onmessage = ({ data: made }: MessageEvent<MapMade | 'finished'>) => {
      if (made === 'finished') { resolve(); return; }
      const { key, data, start, ms, kept, readMs, up } = made;
      const detail = { kept, readMs, asked, up: up - performance.timeOrigin };
      performance.measure(`map ${key}`, { start: start - performance.timeOrigin, duration: ms, detail });
      if (!kept) madeAfresh = true;
      arrived(key, data);
    };
    // a worker that fails leaves what it took on to the page
    w.onerror = () => { w.terminate(); resolve(); };
  });
  const all = Promise.all(Array.from({ length: n }, (_, worker) => run(worker))).then(async () => {
    // (every map asked of the store by now: each worker keeps what it made, and closes)
    for (const w of workers) w.postMessage('keep');
    for (const [key, { job }] of [...coming]) {
      await photosFor(job[0]);
      arrived(key, make(job));
    }
  });
  return { ready, all };
}

/** How often a map's tile repeats across a surface's UVs: as often both ways, or `[along u, along v]`. */
export type Repeat = number | readonly [number, number];

interface MapTextures { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture }

// Textures are shared per (maps, repeat): every enemy of a kind reuses one GPU upload
// instead of uploading (and mipmapping) its own copies when it first comes into view.
// Another repeat of the same maps copies the first's textures: copies share their source, so its one upload.
const mapTextures = new WeakMap<PBRCanvases, Map<string, MapTextures>>();

/** `t` copied (its source and upload shared) to repeat `u` by `v` times. */
function repeated(t: THREE.Texture, u: number, v: number): THREE.Texture {
  const copy = t.clone();
  copy.repeat.set(u, v);
  return copy;
}

export function pbrMaterialMaps(maps: PBRCanvases, repeat: Repeat, normalScale = 1) {
  const [u, v] = typeof repeat === 'number' ? [repeat, repeat] : repeat;
  let byRepeat = mapTextures.get(maps);
  if (!byRepeat) mapTextures.set(maps, byRepeat = new Map());
  let tex = byRepeat.get(`${u},${v}`);
  if (!tex) {
    const first = byRepeat.values().next().value;
    tex = first
      ? { map: repeated(first.map, u, v), normalMap: repeated(first.normalMap, u, v), roughnessMap: repeated(first.roughnessMap, u, v) }
      : { map: toTexture(maps.albedo, true, u, v), normalMap: toTexture(maps.normal, false, u, v), roughnessMap: toTexture(maps.rough, false, u, v) };
    byRepeat.set(`${u},${v}`, tex);
  }
  return { ...tex, normalScale: new THREE.Vector2(normalScale, normalScale) };
}

export function textureFromCanvas(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = toTexture(c, srgb, 1);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** the banners' velvet and its gold thread (sRGB) */
const VELVET = { base: [106, 20, 32], pile: 0.12 };
const THREAD = '#c99a48', THREAD_SHADE = '#4a2c10';

/**
 * A banner's cloth: deep red velvet (or `base`, its colour 0-255), its pile a fine mottle, a gold border sewn round its
 * edges and the order's sigil embroidered over its upper half (a ring round a crescent, a blade down through both, a star over it), the same on
 * every banner. The canvas is the banner's u across and v down from its top (`bannerGeo` in `world/crypt.ts`).
 */
export function bannerCloth(width = 256, height = 512, base: readonly number[] = VELVET.base): THREE.CanvasTexture {
  const c = canvasOf(width, height);
  const g = ctx2d(c);
  const rng = mulberry(31);
  const img = g.createImageData(width, height);
  for (let i = 0; i < width * height; i++) {
    const shade = 1 + (rng() - 0.5) * 2 * VELVET.pile;
    for (let ch = 0; ch < 3; ch++) img.data[i * 4 + ch] = Math.min(255, base[ch] * shade);
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const thread = (draw: () => void, line: number): void => {
    // (a dark edge under the thread, as raised embroidery throws one)
    g.lineCap = g.lineJoin = 'round';
    g.strokeStyle = THREAD_SHADE;
    g.lineWidth = line + 5;
    draw();
    g.stroke();
    g.strokeStyle = THREAD;
    g.lineWidth = line;
    draw();
    g.stroke();
  };
  const border = 14;
  thread(() => { g.beginPath(); g.rect(border, border, width - border * 2, height * 0.78); }, 5);
  const cx = width / 2, cy = height * 0.36, ring = width * 0.3;
  thread(() => { g.beginPath(); g.arc(cx, cy, ring, 0, Math.PI * 2); }, 7);
  // the crescent, horns up
  thread(() => {
    g.beginPath();
    g.arc(cx, cy + ring * 0.12, ring * 0.62, Math.PI * 0.12, Math.PI * 0.88);
    g.arc(cx, cy - ring * 0.12, ring * 0.5, Math.PI * 0.8, Math.PI * 0.2, true);
    g.closePath();
  }, 5);
  // the blade, point down, its guard across the ring's top
  thread(() => {
    g.beginPath();
    g.moveTo(cx, cy - ring * 1.25);
    g.lineTo(cx, cy + ring * 1.35);
    g.moveTo(cx - ring * 0.42, cy - ring * 0.82);
    g.lineTo(cx + ring * 0.42, cy - ring * 0.82);
  }, 6);
  // a four-pointed star over it all
  thread(() => {
    const sy = cy - ring * 1.6, s = ring * 0.22;
    g.beginPath();
    g.moveTo(cx, sy - s);
    g.lineTo(cx + s * 0.3, sy);
    g.lineTo(cx, sy + s);
    g.lineTo(cx - s * 0.3, sy);
    g.closePath();
    g.moveTo(cx - s, sy);
    g.lineTo(cx + s, sy);
  }, 4);
  const t = textureFromCanvas(c);
  t.anisotropy = 4;
  return t;
}

// Glowing rune circle drawn with 2D canvas (white on transparent; tinted by material).
export function runeCircle(seed = 1, size = 1024): THREE.CanvasTexture {
  const c = canvasOf(size);
  const g = ctx2d(c);
  const rng = mulberry(seed);
  const cx = size / 2;
  g.strokeStyle = '#fff'; g.fillStyle = '#fff';
  g.shadowColor = '#fff'; g.shadowBlur = size / 90;
  const ring = (r: number, w: number) => { g.lineWidth = w; g.beginPath(); g.arc(cx, cx, r, 0, Math.PI * 2); g.stroke(); };
  ring(size * 0.48, size * 0.008);
  ring(size * 0.445, size * 0.003);
  ring(size * 0.33, size * 0.006);
  ring(size * 0.16, size * 0.004);
  // glyph band
  const glyphs = 36;
  for (let i = 0; i < glyphs; i++) {
    const a = (i / glyphs) * Math.PI * 2;
    g.save();
    g.translate(cx + Math.cos(a) * size * 0.39, cx + Math.sin(a) * size * 0.39);
    g.rotate(a + Math.PI / 2);
    g.lineWidth = size * 0.004;
    g.beginPath();
    const s = size * 0.022;
    for (let k = 0; k < 3; k++) {
      g.moveTo((rng() - 0.5) * s * 2, (rng() - 0.5) * s * 2);
      g.lineTo((rng() - 0.5) * s * 2, (rng() - 0.5) * s * 2);
    }
    g.stroke();
    g.restore();
  }
  // star polygon
  g.lineWidth = size * 0.004;
  const pts = 7;
  g.beginPath();
  for (let i = 0; i <= pts; i++) {
    const a = (i * 3 / pts) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(a) * size * 0.33, y = cx + Math.sin(a) * size * 0.33;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.stroke();
  return textureFromCanvas(c);
}

// Radial soft decal (scorch / frost / shadow blob).
export function radialDecal(inner = 'rgba(0,0,0,0.9)', outer = 'rgba(0,0,0,0)', noisy = true, seed = 3) {
  const size = 256;
  const c = canvasOf(size);
  const g = noisy ? readCtx2d(c) : ctx2d(c);
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.55, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  if (noisy) {
    const img = g.getImageData(0, 0, size, size);
    const fbm = makeFbm(seed, 6, 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      img.data[i + 3] *= clamp(fbm(x / size, y / size) * 1.8 - 0.25, 0, 1);
    }
    g.putImageData(img, 0, 0);
  }
  return textureFromCanvas(c);
}

// Emissive lava/aether crack texture for brute skins.
export function cracks(seed = 5): THREE.CanvasTexture {
  const key = 'cracks' + seed;
  if (texCache[key]) return texCache[key];
  const vor = makeVoronoi(seed, 6);
  const fbm = makeFbm(seed, 8, 3);
  const size = 256;
  const c = canvasOf(size);
  const g = ctx2d(c);
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const r = vor(x / size, y / size);
    const e = clamp(1 - (r.f2 - r.f1) / 0.07, 0, 1) * (0.5 + fbm(x / size, y / size));
    const i = (y * size + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = clamp(e * e, 0, 1) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  texCache[key] = toTexture(c, true, 1);
  return texCache[key];
}

// Emissive veins: sparse branching lines on black that tile (corruption spreading under skin).
export function veins(seed = 3, count = 7): THREE.CanvasTexture {
  const key = `veins${seed},${count}`;
  if (texCache[key]) return texCache[key];
  const r = mulberry(seed), size = 512, c = canvasOf(size), g = ctx2d(c);
  g.fillStyle = '#000'; g.fillRect(0, 0, size, size);
  g.lineCap = 'round'; g.lineJoin = 'round';
  const branch = (x: number, y: number, a: number, w: number, len: number, depth: number): void => {
    const pts: [number, number][] = [[x, y]];
    for (let i = 0; i < len; i++) { a += (r() - 0.5) * 0.9; x += Math.cos(a) * 9; y += Math.sin(a) * 9; pts.push([x, y]); }
    // drawn at every tile offset so the texture wraps without seams
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      g.beginPath(); g.moveTo(pts[0][0] + ox, pts[0][1] + oy);
      for (const [px, py] of pts) g.lineTo(px + ox, py + oy);
      g.lineWidth = w * 3.5; g.strokeStyle = 'rgba(255,255,255,0.12)'; g.stroke();
      g.lineWidth = w; g.strokeStyle = 'rgba(255,255,255,0.9)'; g.stroke();
    }
    if (depth > 0) for (let k = 0; k < 2; k++) {
      const [bx, by] = pts[Math.floor(r() * (pts.length - 1)) + 1];
      branch(bx, by, a + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.7), w * 0.6, Math.floor(len * 0.6), depth - 1);
    }
  };
  for (let i = 0; i < count; i++) branch(r() * size, r() * size, r() * Math.PI * 2, 2.6, 14 + Math.floor(r() * 10), 2);
  texCache[key] = toTexture(c, true, 1);
  return texCache[key];
}
