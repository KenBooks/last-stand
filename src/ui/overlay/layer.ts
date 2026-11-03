// The world's overlays, drawn by the game's renderer over the finished frame (`overFrame`): damage numbers, the
// foes' bars and names, the props' gauges, the dummies' meters, the lobby floor's item names, the partners' tags and
// a downed partner's marker. Each is a label painted with the canvas into the atlas (atlas.ts) when what it shows
// changes, and placed every frame where it shows; all of them are one draw. (As page elements over the canvas,
// moved every frame by a transform, Chrome repainted the page round them, and froze for seconds on Windows.)
import * as THREE from 'three';
import { G } from '../../state';
import { overFrame } from '../../core/renderer';
import { WEBGPU, drawOverFrame, labelsMaterial } from '../../core/webgpu';
import { uiScales } from '../scale';
import { drawOutline } from './outline';
import {
  atlasCrowded, atlasSide, atlasTexture, clearAtlas, fits, freeSlot, paintCanvas, takeSlot, uploadSlot, type Slot,
} from './atlas';

/**
 * What a label shows: its size and how to paint it there (its top left at the origin), in px of the UI's reference
 * layout, as the page's are: drawn at the UI's scale (ui/scale.ts), so it is the same share of any screen.
 */
export interface LabelArt {
  w: number;
  h: number;
  /** the point of it (px from its top left) placed on its anchor, where it isn't the label's own `ax`, `ay` share of
   *  its size: the bottom of a bar, as the page's box hung from its anchor, its shadows' room round it aside */
  anchor?: { x: number; y: number };
  /** `scale` is the canvas's pixels per px of the art, for what the context's transform doesn't scale (shadows) */
  paint(c: CanvasRenderingContext2D, scale: number): void;
}

/** Which labels are drawn over which: the floor's names lowest, a downed partner's marker on top. */
export const ORDER = { floor: 0, bar: 1, tag: 2, float: 3, marker: 4 } as const;

/** A label over the world: placed each frame (`at`), painted when its art changes (`show`). */
export class Label {
  private art: LabelArt | null = null;
  slot: Slot | null = null;
  /** the canvas's pixels per px of its art it was last painted at (0: to paint), and the fonts' load it was painted
   *  with */
  painted = 0;
  paintedFonts = -1;
  /** the UI's scale it's drawn at: the HUD's, or the lobby's for what only the lobby shows (ui/scale.ts) */
  sizedBy: 'hud' | 'ui' = 'hud';
  /** where its anchor shows this frame (css px), and whether it shows at all */
  x = 0;
  y = 0;
  shown = false;
  /** how its box hangs off its anchor: fractions of its size (0.5, 1: centred above it) */
  ax = 0.5;
  ay = 1;
  alpha = 1;
  scale = 1;
  /** a label the pointer can pick (the floor's names) */
  pickable = false;
  /** its box on screen as last drawn (css px) */
  readonly box = { x: 0, y: 0, w: 0, h: 0 };

  constructor(readonly order: number) {
    labels.add(this);
  }

  /** What it shows from now on: painted again before it's next drawn. */
  show(art: LabelArt): void {
    this.art = art;
    this.painted = 0;
  }

  get size(): { w: number; h: number } {
    return { w: this.art?.w ?? 0, h: this.art?.h ?? 0 };
  }

  /** The point of it placed on its anchor (px of its art from its top left, unscaled). */
  get anchorAt(): { x: number; y: number } {
    const { w, h } = this.size;
    return this.art?.anchor ?? { x: this.ax * w, y: this.ay * h };
  }

  /** Paints it into its slot at `ratio` canvas pixels per px of its art. */
  paint(ratio: number): void {
    const art = this.art;
    if (!art) return;
    const w = Math.ceil(art.w * ratio), h = Math.ceil(art.h * ratio);
    if (this.slot && !fits(this.slot, w, h)) {
      freeSlot(this.slot);
      this.slot = null;
    }
    this.slot ??= takeSlot(w, h);
    this.painted = ratio;
    this.paintedFonts = fontLoads;
    if (!this.slot) return;
    const c = paintCanvas(this.slot);
    c.setTransform(ratio, 0, 0, ratio, 0, 0);
    art.paint(c, ratio);
    uploadSlot(this.slot);
  }

  /** Takes it off the screen for good, its slot given back. */
  remove(): void {
    labels.delete(this);
    if (this.slot) freeSlot(this.slot);
    this.slot = null;
  }
}

const labels = new Set<Label>();
/** times the page's fonts finished loading: a label painted before then is painted again in its font */
let fontLoads = 0;
if (typeof document !== 'undefined') document.fonts?.addEventListener('loadingdone', () => { fontLoads++; });

// --- drawing: one instanced quad a label, its box in canvas pixels and its slot's corners in the atlas
let mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.Material> | null = null;
/** the size of the canvas the labels are placed in (px), and the atlas they show: the material's, either renderer's */
const view = new THREE.Vector2();
let setAtlas: (texture: THREE.Texture) => void = () => {};
let rects: THREE.InstancedBufferAttribute, uvs: THREE.InstancedBufferAttribute, alphas: THREE.InstancedBufferAttribute;
const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera();
/** drawn once at load whatever is shown, so its program compiles then (as every other does) */
let warmed = false;

function makeMesh(room: number): void {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0], 3));
  geo.setIndex([0, 2, 1, 1, 2, 3]);
  // (three's start is Infinity, which WebGL clamps to the attributes' room, and WebGPU's draw refuses)
  geo.instanceCount = 0;
  rects = new THREE.InstancedBufferAttribute(new Float32Array(room * 4), 4).setUsage(THREE.DynamicDrawUsage);
  uvs = new THREE.InstancedBufferAttribute(new Float32Array(room * 4), 4).setUsage(THREE.DynamicDrawUsage);
  alphas = new THREE.InstancedBufferAttribute(new Float32Array(room), 1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aRect', rects);
  geo.setAttribute('aUv', uvs);
  geo.setAttribute('aAlpha', alphas);
  if (mesh) {
    mesh.geometry.dispose();
    mesh.geometry = geo;
    return;
  }
  const mat = WEBGPU ? nodeMaterial() : new THREE.ShaderMaterial({
    uniforms: { uAtlas: { value: atlasTexture() }, uView: { value: view } },
    vertexShader: /* glsl */ `
      attribute vec4 aRect;
      attribute vec4 aUv;
      attribute float aAlpha;
      uniform vec2 uView;
      varying vec2 vUv;
      varying float vAlpha;
      void main() {
        vec2 px = aRect.xy + position.xy * aRect.zw;
        gl_Position = vec4(px.x / uView.x * 2.0 - 1.0, 1.0 - px.y / uView.y * 2.0, 0.0, 1.0);
        vUv = mix(aUv.xy, aUv.zw, position.xy);
        vAlpha = aAlpha;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uAtlas;
      varying vec2 vUv;
      varying float vAlpha;
      void main() { gl_FragColor = texture2D(uAtlas, vUv) * vAlpha; }`,
  });
  if (!WEBGPU) setAtlas = (texture) => { (mat as THREE.ShaderMaterial).uniforms.uAtlas.value = texture; };
  Object.assign(mat, {
    // (premultiplied by alpha: the atlas is, from the canvas)
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  scene.add(mesh);
}

/** The labels' material on WebGPU: the same draw, as nodes (core/webgpu.ts). */
function nodeMaterial(): THREE.Material {
  const made = labelsMaterial(atlasTexture(), view);
  setAtlas = made.setAtlas;
  return made.material;
}

/** the labels drawn last frame, in the order drawn (lowest first) */
let drawn: Label[] = [];

/** the most canvas pixels per px of a label's art the atlas was sized for */
let atlasRatio = 0;
/** The atlas emptied for every label to be painted again as it's next shown: at a new ratio (each takes a slot of
 *  another size, and the old sizes' shelves would stay taken: a move to another monitor changes the canvas's
 *  ratio, a resize the UI's scale), or packed again when it's full of slots given back. */
function restartAtlas(ratio: number): void {
  atlasRatio = ratio;
  clearAtlas(ratio);
  for (const l of labels) {
    l.slot = null;
    l.painted = 0;
  }
}

/** Every label where it shows now, painted where it changed, into this frame's draw (after the camera moved). */
export function layoutLabels(): void {
  const ratio = G.renderer.getPixelRatio();
  const most = ratio * Math.max(uiScales.hud, uiScales.ui);
  if (most !== atlasRatio || atlasCrowded()) restartAtlas(most);
  const side = atlasSide();
  drawn = [...labels].filter((l) => l.shown && l.alpha > 0.002 && l.size.w > 0).sort((a, b) => a.order - b.order);
  if (!mesh || rects.count < drawn.length) makeMesh(Math.max(64, 2 ** Math.ceil(Math.log2(drawn.length + 1))));
  let n = 0;
  for (const l of drawn) {
    const k = uiScales[l.sizedBy], paint = ratio * k;
    if (l.painted !== paint || l.paintedFonts !== fontLoads) l.paint(paint);
    const slot = l.slot;
    if (!slot) continue;
    const { w, h } = l.size;
    // (in canvas pixels; on whole pixels when it's drawn at its size, so each texel falls on one)
    const pw = Math.ceil(w * paint), ph = Math.ceil(h * paint);
    const a = l.anchorAt;
    let x = l.x * ratio - a.x * l.scale * paint, y = l.y * ratio - a.y * l.scale * paint;
    if (l.scale === 1) {
      x = Math.round(x);
      y = Math.round(y);
    }
    l.box.x = x / ratio;
    l.box.y = y / ratio;
    l.box.w = w * l.scale * k;
    l.box.h = h * l.scale * k;
    rects.setXYZW(n, x, y, pw * l.scale, ph * l.scale);
    uvs.setXYZW(n, slot.x / side, slot.y / side, (slot.x + pw) / side, (slot.y + ph) / side);
    alphas.setX(n, l.alpha);
    n++;
  }
  mesh!.geometry.instanceCount = n;
  rects.needsUpdate = uvs.needsUpdate = alphas.needsUpdate = true;
  if (n > 0) {
    rects.addUpdateRange(0, n * 4);
    uvs.addUpdateRange(0, n * 4);
    alphas.addUpdateRange(0, n);
  }
}

/** Draws this frame's labels over the finished frame. */
function drawLabels(): void {
  if (!mesh) makeMesh(64);
  const count = mesh!.geometry.instanceCount;
  if (count === 0 && warmed) return;
  if (count === 0) {
    // (one transparent quad, so the program compiles with the rest at load)
    rects.setXYZW(0, 0, 0, 1, 1);
    alphas.setX(0, 0);
    rects.needsUpdate = alphas.needsUpdate = true;
    mesh!.geometry.instanceCount = 1;
  }
  warmed = true;
  const gl = G.renderer;
  gl.getDrawingBufferSize(view);
  // (the atlas is made again, larger, as labels take more canvas pixels: a higher ratio, a larger UI)
  setAtlas(atlasTexture());
  if (WEBGPU) drawOverFrame(gl, () => gl.render(scene, camera));
  else {
    const auto = gl.autoClear;
    gl.autoClear = false;
    gl.setRenderTarget(null);
    gl.render(scene, camera);
    gl.autoClear = auto;
  }
  if (count === 0) mesh!.geometry.instanceCount = 0;
}
// (an outline round what a held skill would take, under the labels: a foe's bar and numbers stay over it)
overFrame.draw = () => {
  drawOutline();
  drawLabels();
};

/** The labels' scene, its mesh made: compiled with the post chain, as the frame's last draws (core/renderer.ts
 *  `compilePasses`). */
export function labelsScene(): THREE.Scene {
  if (!mesh) makeMesh(64);
  return scene;
}

/** The labels drawn last frame, lowest first (tools/lab's `ui` measures their boxes). */
export function drawnLabels(): readonly Label[] { return drawn; }

/** The topmost pickable label under a point of the page (css px), as last drawn. */
export function labelAt(x: number, y: number): Label | null {
  for (let i = drawn.length - 1; i >= 0; i--) {
    const l = drawn[i];
    if (!l.pickable) continue;
    const b = l.box;
    if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) return l;
  }
  return null;
}
