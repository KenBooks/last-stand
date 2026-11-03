// The atlas the world's overlays are drawn from (ui/overlay): one texture, every label painted into a slot of its
// own, and a slot uploaded alone when its label changes (its region, straight from the canvas it was painted on).
import * as THREE from 'three';
import { G } from '../../state';
import { WEBGPU, copyCanvasInto } from '../../core/webgpu';

/** the atlas's side, px, for each canvas pixel a px of a label's art takes (the canvas's ratio times the UI's scale;
 *  rounded up to a multiple of `SIDE_STEP`, at least `SIDE_MIN`): a label's pixels go with that ratio's square, and
 *  at 2 a heavy fight's 250 floating numbers took more than the 2048 px square the atlas was at any ratio */
const SIDE_PER_RATIO = 1536;
const SIDE_MIN = 2048;
const SIDE_STEP = 512;
/** a slot's height rounds up to one of these (px): each shelf of the atlas holds slots of one height (a downed
 *  partner's marker is some 200 px of art, 1000 at an 8K screen's UI scale at 100%) */
const HEIGHTS = [16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512, 768, 1024];
/** a full atlas is packed again (every label shown painted anew) when this share of it is slots given back */
const REPACK_SPARE = 0.25;
/** a slot's width rounds up to a multiple of this (px) */
const WIDTH_STEP = 16;
/** a slot holds a label of up to this many times its size, and this many px more (more would waste it) */
const SLACK = 2;
const SLACK_PX = 16;

/** A slot: its region of the atlas, px from the top left. */
export interface Slot { x: number; y: number; w: number; h: number }

interface Shelf { y: number; h: number; used: number }

/** the texture the labels are drawn from: a render target's, so its storage needs no copy in memory */
let target: THREE.WebGLRenderTarget | null = null;
const shelves: Shelf[] = [];
/** slots given back, by their height, for the next label of that height they hold (a fight's numbers come in every
 *  width: kept for their own width alone, the atlas filled with slots no new one fitted) */
const spare = new Map<number, Slot[]>();
let nextY = 0;
let side = SIDE_MIN;
/** the area of the slots given back, px, and whether a slot was asked for that didn't fit */
let spareArea = 0;
let full = false;
/** what the labels are painted on before their slot is uploaded */
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
/** the canvas as a texture three uploads from (never drawn itself: `copyTextureToTexture` reads its image) */
let source: THREE.Texture | null = null;
let warned = false;

/** The atlas's side, px. */
export const atlasSide = (): number => side;

/** The atlas's texture (made and cleared on first use). */
export function atlasTexture(): THREE.Texture {
  if (target) return target.texture;
  target = new THREE.WebGLRenderTarget(side, side, { depthBuffer: false, generateMipmaps: false });
  const t = target.texture;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  // (canvas pixels in, as the page's colours: drawn as they are, premultiplied by their alpha on the way)
  t.colorSpace = THREE.NoColorSpace;
  t.flipY = false;
  t.premultiplyAlpha = true;
  const gl = G.renderer, was = gl.getRenderTarget(), clear = gl.getClearAlpha(), col = gl.getClearColor(new THREE.Color());
  gl.setRenderTarget(target);
  gl.setClearColor(0x000000, 0);
  gl.clear(true, false, false);
  gl.setClearColor(col, clear);
  gl.setRenderTarget(was);
  return t;
}

/** Whether `slot` holds a label of `w` by `h` px, and isn't too large for it. */
export function fits(slot: Slot, w: number, h: number): boolean {
  return slot.w >= w && slot.h >= h && slot.w <= w * SLACK + SLACK_PX && slot.h <= h * SLACK + SLACK_PX;
}

/** The narrowest slot given back of `height` that holds a label of `w` by `h` px, taken off the list; or null. */
function reuse(height: number, w: number, h: number): Slot | null {
  const list = spare.get(height);
  if (!list) return null;
  let best = -1;
  for (let i = 0; i < list.length; i++) {
    if (fits(list[i], w, h) && (best < 0 || list[i].w < list[best].w)) best = i;
  }
  if (best < 0) return null;
  const [slot] = list.splice(best, 1);
  spareArea -= slot.w * slot.h;
  return slot;
}

/** The size class a label of `w` by `h` px takes: its slot's width and height. */
function sizeClass(w: number, h: number): { w: number; h: number } | null {
  const height = HEIGHTS.find((x) => x >= h);
  if (height === undefined || w > side) return null;
  return { w: Math.ceil(w / WIDTH_STEP) * WIDTH_STEP, h: height };
}

/** A slot for a label of `w` by `h` px, or null when none fits (the atlas is full: the label isn't drawn). */
export function takeSlot(w: number, h: number): Slot | null {
  const size = sizeClass(Math.max(1, w), Math.max(1, h));
  if (!size) return null;
  const given = reuse(size.h, Math.max(1, w), Math.max(1, h));
  if (given) return given;
  let shelf = shelves.find((s) => s.h === size.h && s.used + size.w <= side);
  if (!shelf) {
    if (nextY + size.h > side) {
      full = true;
      if (!crowded() && !warned && import.meta.env.DEV) console.error('overlay: the label atlas is full');
      warned = true;
      return null;
    }
    shelf = { y: nextY, h: size.h, used: 0 };
    shelves.push(shelf);
    nextY += size.h;
  }
  const slot = { x: shelf.used, y: shelf.y, w: size.w, h: size.h };
  shelf.used += size.w;
  return slot;
}

/** Whether the atlas is full of slots given back, and so worth packing again. */
const crowded = (): boolean => full && spareArea >= REPACK_SPARE * side * side;

/** Whether the atlas should be emptied for every label shown to be painted again: full of slots given back. */
export const atlasCrowded = crowded;

/** The atlas's side for labels painted at `ratio` canvas pixels per px of their art. */
function sideFor(ratio: number): number {
  const grown = Math.ceil((SIDE_PER_RATIO * ratio) / SIDE_STEP) * SIDE_STEP;
  return Math.min(G.renderer.capabilities.maxTextureSize, Math.max(SIDE_MIN, grown));
}

/**
 * Empties the atlas, for labels painted at up to `ratio` canvas pixels per px of their art: every slot is free again,
 * and the atlas is the size for that ratio (made again on its next use when that changed: the labels' material takes
 * it from `atlasTexture`).
 */
export function clearAtlas(ratio: number): void {
  const wanted = sideFor(ratio);
  if (wanted !== side) {
    side = wanted;
    target?.dispose();
    target = null;
    source?.dispose();
    source = null;
    canvas = null;
  }
  shelves.length = 0;
  spare.clear();
  nextY = 0;
  spareArea = 0;
  full = false;
  warned = false;
}

/** The share of the atlas's rows its shelves take (the perf report's). */
export const atlasUse = (): number => nextY / side;

/** Gives a slot back for the next label it holds. */
export function freeSlot(slot: Slot): void {
  let list = spare.get(slot.h);
  if (!list) spare.set(slot.h, (list = []));
  list.push(slot);
  spareArea += slot.w * slot.h;
}

/** The canvas a label is painted on, cleared over a slot's size, and its context (unscaled, px). */
export function paintCanvas(slot: Slot): CanvasRenderingContext2D {
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = side;
    canvas.height = HEIGHTS[HEIGHTS.length - 1];
    ctx = canvas.getContext('2d', { willReadFrequently: false })!;
    source = new THREE.Texture(canvas);
    source.flipY = false;
  }
  const c = ctx!;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, slot.w, slot.h);
  return c;
}

const region = new THREE.Box2(), at = new THREE.Vector2();
/** Uploads what was painted (the paint canvas's top left, a slot's size) into the slot. */
export function uploadSlot(slot: Slot): void {
  atlasTexture();
  region.min.set(0, 0);
  region.max.set(slot.w, slot.h);
  at.set(slot.x, slot.y);
  if (WEBGPU && copyCanvasInto(G.renderer, canvas!, target!.texture, slot.w, slot.h, slot.x, slot.y)) return;
  // (on WebGPU's WebGL 2 backend three copies the canvas's texture as last uploaded: uploaded again first)
  if (WEBGPU) source!.needsUpdate = true;
  G.renderer.copyTextureToTexture(source!, target!.texture, region, at);
}
