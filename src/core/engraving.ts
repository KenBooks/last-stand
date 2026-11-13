// Hand-drawn ornament for the heroes, painted procedurally on canvases: an atlas of engraved steel
// (knotwork filigree on a breastplate, medallions, knee cops) and embroidered cloth panels. Each is a
// height field drawn with strokes; albedo, normal and roughness maps are derived from it, so an
// engraved band catches the light like the real thing. Made once, shared by every hero.
import * as THREE from 'three';
import { albedoPixels, ctx2d, readCtx2d, steel } from './textures';
import { deriveMaps, steelTint, type BasePixels, type DerivedPixels, type Tint } from './engravingMaps';
import { clamp, mulberry } from '../util';

type Ctx = CanvasRenderingContext2D;
type Pt = [number, number];

/** A region of an atlas in uv space (0..1, v up, as three samples it). */
export interface UVRect { u0: number; v0: number; u1: number; v1: number }

/** the engraved steel atlas: 1024 square, regions in pixels [x, y, w, h] (y down) */
const ATLAS = 1024;
const REGIONS = {
  /** a breastplate's front, projected straight on: x -0.3..0.3 m, y -0.12..0.3 m of the chest joint */
  chest: [0, 0, 512, 360],
  /** a round medallion (pauldrons, the belt buckle) */
  disc: [512, 0, 256, 256],
  /** a knee cop, projected from the front */
  knee: [768, 0, 256, 256],
  /** plain worn steel, for every other plate */
  plain: [0, 512, 1024, 512],
} as const;
export type SteelRegion = keyof typeof REGIONS;

const rectOf = ([x, y, w, h]: readonly number[], size: number): UVRect =>
  ({ u0: x / size, u1: (x + w) / size, v0: 1 - (y + h) / size, v1: 1 - y / size });

/** uv rect of an atlas region */
export const steelRegion = (r: SteelRegion): UVRect => rectOf(REGIONS[r], ATLAS);

/** Set a geometry's uvs from its positions: `f` maps a position to 0..1 within `rect`. */
export function projectUV(geo: THREE.BufferGeometry, rect: UVRect, f: (x: number, y: number, z: number) => [number, number]): THREE.BufferGeometry {
  const p = geo.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const [a, b] = f(p.getX(i), p.getY(i), p.getZ(i));
    uv[i * 2] = rect.u0 + clamp(a, 0, 1) * (rect.u1 - rect.u0);
    uv[i * 2 + 1] = rect.v0 + clamp(b, 0, 1) * (rect.v1 - rect.v0);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

// --- drawing: a raised band is drawn as a dark groove with a lighter band inside it, so where a later
// stroke crosses an earlier one it passes over it (knotwork's over-and-under)

function band(c: Ctx, path: (c: Ctx) => void, w: number): void {
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); path(c); c.strokeStyle = '#000'; c.lineWidth = w + 5; c.stroke();
  c.beginPath(); path(c); c.strokeStyle = '#d8d8d8'; c.lineWidth = w; c.stroke();
  c.beginPath(); path(c); c.strokeStyle = '#fff'; c.lineWidth = w * 0.35; c.stroke();
}
/** an engraved line: a thin groove */
function groove(c: Ctx, path: (c: Ctx) => void, w = 2.5): void {
  c.lineCap = 'round'; c.beginPath(); path(c); c.strokeStyle = '#000'; c.lineWidth = w; c.stroke();
}
function spiral(c: Ctx, cx: number, cy: number, r: number, turns: number, a0: number, dir: number): void {
  const n = 40 * turns;
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = a0 + dir * t * turns * Math.PI * 2, rr = r * (1 - t * 0.85);
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    i ? c.lineTo(x, y) : c.moveTo(x, y);
  }
}
const bez = (c: Ctx, p: Pt[]) => { c.moveTo(...p[0]); for (let i = 1; i + 2 < p.length + 1; i += 3) c.bezierCurveTo(...p[i], ...p[i + 1], ...p[i + 2]); };
/** mirror a path's points about x = cx */
const mir = (p: Pt[], cx: number, s: number): Pt[] => p.map(([x, y]) => [cx + (x - cx) * s, y]);

/** A column of arcane signs down a panel's middle: a line through circles, crosses and diamonds. */
export function arcaneColumn(c: Ctx, w: number, h: number): void {
  const m = w / 2;
  c.lineWidth = 3;
  c.beginPath(); c.moveTo(m, 50); c.lineTo(m, h - 110); c.stroke();
  const ring = (y: number, r: number) => { c.beginPath(); c.arc(m, y, r, 0, Math.PI * 2); c.stroke(); };
  const diamond = (y: number, r: number) => { c.beginPath(); c.moveTo(m, y - r); c.lineTo(m + r * 0.7, y); c.lineTo(m, y + r); c.lineTo(m - r * 0.7, y); c.closePath(); c.stroke(); };
  const cross = (y: number, r: number) => { c.beginPath(); c.moveTo(m - r, y); c.lineTo(m + r, y); c.stroke(); for (const s of [1, -1]) { c.beginPath(); c.moveTo(m + s * r, y - 8); c.lineTo(m + s * (r + 10), y); c.lineTo(m + s * r, y + 8); c.stroke(); } };
  cross(110, 40); diamond(170, 18);
  const cy = h * 0.4;
  ring(cy, 62); ring(cy, 40); ring(cy, 10);
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; c.beginPath(); c.moveTo(m + Math.cos(a) * 40, cy + Math.sin(a) * 40); c.lineTo(m + Math.cos(a) * 62, cy + Math.sin(a) * 62); c.stroke(); }
  for (let y = cy + 100; y < h - 180; y += 70) { cross(y, 26 - (y - cy) * 0.02); diamond(y + 35, 10); }
  diamond(h - 150, 24);
}

function drawChest(c: Ctx, w: number, h: number): void {
  const cx = w / 2;
  // a double border following the plate's edge, with a row of punched dots between the lines
  c.strokeStyle = '#000';
  for (const inset of [16, 26]) { c.lineWidth = 3; c.strokeRect(inset, inset, w - inset * 2, h - inset * 2); }
  c.fillStyle = '#000';
  for (let x = 30; x < w - 26; x += 14) for (const y of [21, h - 21]) { c.beginPath(); c.arc(x, y, 2.2, 0, Math.PI * 2); c.fill(); }
  // scrolls sweeping out from the centre under the collar, ending in spirals
  for (const s of [1, -1]) {
    band(c, (c) => { bez(c, mir([[cx + 40, 110], [cx + 90, 60], [cx + 150, 70], [cx + 170, 110], [cx + 185, 140], [cx + 215, 150], [cx + 225, 120]], cx, s)); }, 9);
    band(c, (c) => spiral(c, cx + s * 205, 118, 22, 1.4, Math.PI * (s > 0 ? 0 : 1), s), 7);
    band(c, (c) => { bez(c, mir([[cx + 30, 200], [cx + 90, 230], [cx + 150, 190], [cx + 200, 230], [cx + 220, 260], [cx + 200, 300], [cx + 170, 290]], cx, s)); }, 8);
    band(c, (c) => spiral(c, cx + s * 175, 280, 18, 1.2, 0, -s), 6);
  }
  // the central knot: two interlaced loops forming a pointed heart, a teardrop inside, spirals at the lobes
  for (const s of [1, -1]) band(c, (c) => bez(c, mir([[cx, 70], [cx + 70, 20], [cx + 125, 110], [cx + 60, 170], [cx + 20, 210], [cx - 10, 240], [cx, 290]], cx, s)), 11);
  for (const s of [1, -1]) band(c, (c) => bez(c, mir([[cx + 25, 95], [cx + 95, 90], [cx + 90, 200], [cx, 215]], cx, s)), 9);
  for (const s of [1, -1]) band(c, (c) => spiral(c, cx + s * 58, 88, 20, 1.3, Math.PI * (s > 0 ? 1.2 : -0.2), -s), 7);
  band(c, (c) => bez(c, [[cx, 115], [cx + 30, 140], [cx + 25, 185], [cx, 195], [cx - 25, 185], [cx - 30, 140], [cx, 115]]), 8);
  // a fine hatched leaf on each side of the knot
  for (const s of [1, -1]) for (let i = 0; i < 6; i++) groove(c, (c) => { c.moveTo(cx + s * (130 + i * 8), 150 + i * 4); c.lineTo(cx + s * (150 + i * 8), 175 + i * 4); }, 2);
}

function drawDisc(c: Ctx, size: number, seed: number): void {
  const m = size / 2, r = mulberry(seed);
  c.strokeStyle = '#000';
  for (const rr of [m - 10, m - 24]) { c.lineWidth = 4; c.beginPath(); c.arc(m, m, rr, 0, Math.PI * 2); c.stroke(); }
  // a ring of rivets, then a triskele of three interlocking spirals
  c.fillStyle = '#fff';
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; c.beginPath(); c.arc(m + Math.cos(a) * (m - 17), m + Math.sin(a) * (m - 17), 4, 0, Math.PI * 2); c.fill(); }
  for (let k = 0; k < 3; k++) {
    const a = k * Math.PI * 2 / 3 + r() * 0.1, x = m + Math.cos(a) * 34, y = m + Math.sin(a) * 34;
    band(c, (c) => spiral(c, x, y, 38, 1.6, a + Math.PI, 1), 9);
  }
  band(c, (c) => { c.arc(m, m, 12, 0, Math.PI * 2); }, 6);
}

function drawKnee(c: Ctx, size: number): void {
  const m = size / 2;
  // a flame-shaped leaf rising from the bottom, flanked by two curling fronds
  band(c, (c) => bez(c, [[m, size - 30], [m + 60, size - 90], [m + 40, 70], [m, 30], [m - 40, 70], [m - 60, size - 90], [m, size - 30]]), 9);
  groove(c, (c) => { c.moveTo(m, size - 40); c.lineTo(m, 50); }, 3);
  for (let i = 0; i < 5; i++) for (const s of [1, -1]) groove(c, (c) => { c.moveTo(m, size - 60 - i * 28); c.lineTo(m + s * 26, size - 80 - i * 28); }, 2);
  for (const s of [1, -1]) {
    band(c, (c) => bez(c, mir([[m + 20, size - 25], [m + 90, size - 40], [m + 110, 110], [m + 80, 80]], m, s)), 7);
    band(c, (c) => spiral(c, m + s * 88, 95, 16, 1.2, 0, s), 6);
  }
}

/** a height canvas (`readCtx2d`'s) → the three maps, with `base` (a neutral albedo's pixels) under the ornament */
function derive(hc: HTMLCanvasElement, base: BasePixels | null, tint: Tint) {
  const w = hc.width, h = hc.height, src = readCtx2d(hc).getImageData(0, 0, w, h).data;
  return mapsOf(deriveMaps(src, w, h, base, tint), w, h);
}

/** The three maps as textures, from their pixels. */
function mapsOf(pixels: DerivedPixels, w: number, h: number) {
  const mk = (data: Uint8ClampedArray, srgb: boolean) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    ctx2d(c).putImageData(new ImageData(data as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    return t;
  };
  return { map: mk(pixels.albedo, true), normalMap: mk(pixels.normal, false), roughnessMap: mk(pixels.roughness, false) };
}

/** The engraved steel atlas's heights, drawn (cheap: the strokes; the maps from them are what costs). */
function steelHeights(): HTMLCanvasElement {
  const hc = document.createElement('canvas'); hc.width = hc.height = ATLAS;
  const c = readCtx2d(hc);
  c.fillStyle = '#808080'; c.fillRect(0, 0, ATLAS, ATLAS);
  const at = (r: SteelRegion, draw: (c: Ctx, w: number, h: number) => void) => {
    const [x, y, w, h] = REGIONS[r];
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.translate(x, y); draw(c, w, h); c.restore();
  };
  at('chest', drawChest);
  at('disc', (c, w) => drawDisc(c, w, 3));
  at('knee', (c, w) => drawKnee(c, w));
  return hc;
}

let steelMaps: ReturnType<typeof derive> | null = null;
let steelFromWorker = false;
/** Whether the engraved steel's maps came from the worker (a harness's). */
export const engravingFromWorker = (): boolean => steelFromWorker;
/** the engraved steel atlas (see REGIONS): neutral, tinted by the material's colour; the maps a worker made as the
 *  game loaded (`preloadEngraving`), or made here */
export function engravedSteel(): ReturnType<typeof derive> {
  // (grime settles in the grooves, the raised bands are polished bright: `steelTint`)
  steelMaps ??= derive(steelHeights(), albedoPixels(steel()), steelTint);
  return steelMaps;
}

/**
 * The engraved steel's maps derived in a worker as the game loads, once the steel's own map has come (its albedo
 * lies under the ornament): 1.35 s of the first hero's build on a CPU slowed six times, the loading screen frozen
 * ("phone has freezes during loading for like 1-2sec"). A worker that fails leaves them to the first build.
 */
export async function preloadEngraving(): Promise<void> {
  if (steelMaps || typeof Worker === 'undefined') return;
  const heights = readCtx2d(steelHeights()).getImageData(0, 0, ATLAS, ATLAS).data;
  const albedo = albedoPixels(steel());
  const base = albedo ? { data: albedo.data.slice(), width: albedo.width } : null;
  const pixels = await new Promise<DerivedPixels | null>((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./engraving.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      resolve(null);
      return;
    }
    worker.onmessage = (e: MessageEvent<DerivedPixels>) => {
      worker.terminate();
      resolve(e.data);
    };
    worker.onerror = () => {
      worker.terminate();
      resolve(null);
    };
    const transfer = [heights.buffer as ArrayBuffer, ...(base ? [base.data.buffer as ArrayBuffer] : [])];
    worker.postMessage({ heights, size: ATLAS, base }, { transfer });
  });
  if (pixels && !steelMaps) {
    steelMaps = mapsOf(pixels, ATLAS, ATLAS);
    steelFromWorker = true;
  }
}

/**
 * An embroidered cloth panel, `w`×`h` px, the outline given by `outline` (a closed path in pixels): the
 * field in `field`, a woven border band in `thread` a little inside the edge, knotwork along it, and
 * whatever `motif` draws (in white: thread).
 */
const panels = new Map<string, ReturnType<typeof derive>>();
export function embroidered(w: number, h: number, outline: Pt[], field: [number, number, number], thread: [number, number, number], motif?: (c: Ctx, w: number, h: number) => void) {
  // made once per design: every build of a hero (class switch, co-op) shares the textures
  const key = JSON.stringify([w, h, outline, field, thread, motif?.name]);
  let made = panels.get(key);
  if (!made) panels.set(key, made = drawPanel(w, h, outline, field, thread, motif));
  return made;
}
function drawPanel(w: number, h: number, outline: Pt[], field: [number, number, number], thread: [number, number, number], motif?: (c: Ctx, w: number, h: number) => void) {
  const hc = document.createElement('canvas'); hc.width = w; hc.height = h;
  const c = readCtx2d(hc);
  c.fillStyle = '#808080'; c.fillRect(0, 0, w, h);
  // weave: fine diagonal ribs
  c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 1;
  for (let k = -h; k < w; k += 3) { c.beginPath(); c.moveTo(k, 0); c.lineTo(k + h, h); c.stroke(); }
  const path = (inset: number) => {
    // shrink the outline towards its centroid by `inset` px (enough for these convex panels)
    const mx = outline.reduce((s, p) => s + p[0], 0) / outline.length, my = outline.reduce((s, p) => s + p[1], 0) / outline.length;
    c.beginPath();
    outline.forEach(([x, y], i) => {
      const dx = mx - x, dy = my - y, l = Math.hypot(dx, dy) || 1;
      const px = x + dx / l * inset, py = y + dy / l * inset;
      i ? c.lineTo(px, py) : c.moveTo(px, py);
    });
    c.closePath();
  };
  // the border: two raised cords with a running interlace between them
  const mask = document.createElement('canvas'); mask.width = w; mask.height = h;
  const mc = readCtx2d(mask);
  for (const [inset, lw] of [[10, 5], [30, 5]] as const) { path(inset); c.strokeStyle = '#fff'; c.lineWidth = lw; c.stroke(); }
  path(20); c.setLineDash([7, 5]); c.strokeStyle = '#e8e8e8'; c.lineWidth = 9; c.stroke(); c.setLineDash([]);
  path(20); c.strokeStyle = '#000'; c.lineWidth = 1.5; c.stroke();
  // where the thread lies, for the colouring: everything brighter than the cloth
  mc.drawImage(hc, 0, 0);
  // anything else stitched on, in thread (white)
  if (motif) { c.strokeStyle = '#fff'; c.fillStyle = '#fff'; c.lineCap = 'round'; c.lineJoin = 'round'; motif(c, w, h); }
  const md = readCtx2d(hc).getImageData(0, 0, w, h).data;
  let i = 0;
  return derive(hc, null, (hv) => {
    const th = md[i++ * 4] > 150 ? 1 : 0;
    const k = 0.75 + hv * 0.4;
    const col = th ? thread : field;
    return [clamp(col[0] * k, 0, 1), clamp(col[1] * k, 0, 1), clamp(col[2] * k, 0, 1), th ? 0.5 : 0.92];
  });
}
