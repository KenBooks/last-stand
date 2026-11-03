// An outline round one thing on screen (the foe a held Quarry Mark would mark): its solid meshes drawn into a mask of
// their own, and the mask's edge drawn over the finished frame, in front of everything (it shows through a pillar or
// a crowd), under the world's overlays. Only what's outlined is drawn again, on a render of its own: a render of the
// scene with only its layer shown would see none of the scene's lights, and every lit material would look for its
// program again in the next frame. Each mesh is drawn with a mask material made for its own, its alpha test kept (a
// leaf card drawn whole outlined as a box), so the programs are few and all compiled at load (`warmOutline`).
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { G } from '../../state';
import { uiScales } from '../scale';
import { CROWD_LAYER } from '../../core/layers';
import { passCamera, passTriangle } from '../../core/renderer';
import { portShader } from '../../core/shaderPorts';
import { WEBGPU, drawOverFrame } from '../../core/webgpu';

/** the outline's width, and its soft glow's past it (px of the UI's reference layout, at the HUD's scale) */
const WIDTH = 2.5;
const GLOW = 3.5;
/** how bright the glow is, of the line */
const GLOW_SHARE = 0.4;
/** how far round the outlined thing's box on screen the edge is drawn (px of the canvas, past the glow) */
const BOX_MARGIN = 4;

/** What's outlined: its root, the colour (as the screen shows it), and how strongly (0 to 1). */
interface Outlined {
  root: THREE.Object3D;
  color: THREE.Color;
  strength: number;
}
let current: Outlined | null = null;

/** `root`'s solid meshes outlined in `color` at `strength` (0 to 1), from now until it's changed; null: nothing. */
export function outline(root: THREE.Object3D | null, color = 0xff3030, strength = 1): void {
  if (!root || strength <= 0) {
    current = null;
    return;
  }
  current ??= { root, color: new THREE.Color(), strength };
  current.root = root;
  current.color.setHex(color, THREE.LinearSRGBColorSpace);
  current.strength = Math.min(1, strength);
}

/** What's outlined now, its colour (as a hex) and how strongly, if anything (tools/lab measures it). */
export function outlinedLook(): { root: THREE.Object3D; color: number; strength: number } | null {
  if (!current) return null;
  return { root: current.root, color: current.color.getHex(THREE.LinearSRGBColorSpace), strength: current.strength };
}

/** the mask's material for each of the meshes' own, and every one of them */
const masks = new WeakMap<THREE.Material, THREE.MeshBasicMaterial>();
const isMask = new WeakSet<THREE.Material>();

/** The mask's material for a mesh drawn with `own`: white where it's solid (as its own alpha test has it). */
function maskFor(own: THREE.Material): THREE.MeshBasicMaterial {
  let mask = masks.get(own);
  if (mask) return mask;
  const cut = own.alphaTest > 0;
  const mapped = own as THREE.MeshStandardMaterial;
  mask = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    fog: false,
    side: own.side,
    alphaTest: cut ? own.alphaTest : 0,
    map: cut ? mapped.map ?? null : null,
    alphaMap: cut ? mapped.alphaMap ?? null : null,
    depthTest: false,
    depthWrite: false,
  });
  masks.set(own, mask);
  isMask.add(mask);
  return mask;
}

/** Whether `material` draws a solid surface (not a glow, a shadow under it or anything else blended over it). */
function solid(material: THREE.Material): boolean {
  return material.visible && !material.transparent && material.blending === THREE.NormalBlending;
}

/** A mesh's own material while the mask is drawn, or a shown object that draws nothing solid, hidden meanwhile. */
type Swapped = { mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] } | { hidden: THREE.Object3D };

/** Whether `object` draws something other than a mesh (particles, a line, a sprite). */
function drawsOther(object: THREE.Object3D): boolean {
  return !!((object as THREE.Points).isPoints || (object as THREE.Line).isLine || (object as THREE.Sprite).isSprite);
}

/** `root`'s meshes given their mask materials, and what draws nothing solid hidden: what puts each back. */
function swapIn(root: THREE.Object3D): Swapped[] {
  const swapped: Swapped[] = [];
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) {
      if (object.visible && drawsOther(object)) swapped.push({ hidden: object });
      return;
    }
    const own = Array.isArray(mesh.material) ? mesh.material.find(solid) : mesh.material;
    if (own && solid(own)) {
      swapped.push({ mesh, material: mesh.material });
      mesh.material = maskFor(own);
    } else if (mesh.visible) {
      swapped.push({ hidden: mesh });
    }
  });
  for (const swap of swapped) {
    if ('hidden' in swap) swap.hidden.visible = false;
  }
  return swapped;
}

/** Puts back what `swapIn` changed. */
function swapOut(swapped: Swapped[]): void {
  for (const swap of swapped) {
    if ('hidden' in swap) swap.hidden.visible = true;
    else swap.mesh.material = swap.material;
  }
}

/** the mask: white where the outlined thing is, at the canvas's pixels (its texture the same one through a resize,
 *  as WebGPU's edge samples it) */
const maskTarget = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
const canvasSize = new THREE.Vector2();

function maskOfSize(width: number, height: number): THREE.WebGLRenderTarget {
  if (maskTarget.width !== width || maskTarget.height !== height) maskTarget.setSize(width, height);
  return maskTarget;
}

/** the edge's pass: each pixel outside the mask lit by how near it the mask comes, within the line and the glow */
const edgeMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uMask: { value: null },
    uLine: { value: new THREE.Vector2() },
    uGlow: { value: new THREE.Vector2() },
    uColor: { value: new THREE.Color() },
    uStrength: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D uMask;
    uniform vec2 uLine;
    uniform vec2 uGlow;
    uniform vec3 uColor;
    uniform float uStrength;
    varying vec2 vUv;
    float cover(vec2 uv) { return min(1.0, texture2D(uMask, uv).a * 2.0); }
    void main() {
      float inside = cover(vUv);
      float line = 0.0;
      float glow = 0.0;
      for (int i = 0; i < 16; i++) {
        float a = float(i) * 0.39269908;
        vec2 way = vec2(cos(a), sin(a));
        line = max(line, max(cover(vUv + way * uLine), cover(vUv + way * uLine * 0.5)));
        glow = max(glow, cover(vUv + way * uGlow));
      }
      float lit = max(line, glow * ${GLOW_SHARE.toFixed(2)}) * (1.0 - inside) * uStrength;
      gl_FragColor = vec4(uColor * lit, lit);
    }`,
  // (premultiplied, as the world's overlays are drawn over the frame)
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
// (on WebGPU: the same 16 ways round, the mask read where the pixel is on the screen)
portShader(edgeMaterial, ({ texture, screenUV, positionGeometry, vec2, float, min, max, vec4 }, u) => {
  // (the mask's own texture, the same through a resize)
  const mask = texture(maskTarget.texture);
  const cover = (at: unknown) => min(1, mask.sample(at).a.mul(2));
  const inside = cover(screenUV);
  let line = float(0);
  let glow = float(0);
  for (let i = 0; i < 16; i++) {
    const way = vec2(Math.cos(i * 0.39269908), Math.sin(i * 0.39269908));
    line = max(line, max(cover(screenUV.add(way.mul(u.uLine))), cover(screenUV.add(way.mul(u.uLine).mul(0.5)))));
    glow = max(glow, cover(screenUV.add(way.mul(u.uGlow))));
  }
  const lit = max(line, glow.mul(GLOW_SHARE)).mul(inside.oneMinus()).mul(u.uStrength);
  return { vertex: vec4(positionGeometry.xy, 0, 1), fragment: vec4(u.uColor.mul(lit), lit) };
});
const edgeQuad = new FullScreenQuad(edgeMaterial);
/** the edge's pass compiled on a triangle of its own, as its quad's is three's */
const edgeStandIn = new THREE.Mesh(passTriangle(), edgeMaterial);

/** Draws `root`'s mask into the mask's target, at the canvas's size. */
function drawMask(gl: THREE.WebGLRenderer, root: THREE.Object3D): THREE.WebGLRenderTarget {
  gl.getDrawingBufferSize(canvasSize);
  const target = maskOfSize(canvasSize.x, canvasSize.y);
  const swapped = swapIn(root);
  const clear = gl.getClearColor(new THREE.Color());
  const clearAlpha = gl.getClearAlpha();
  const autoClear = gl.autoClear;
  // (a crowd's bodies are drawn by their crowd, their own meshes on a layer of their own: models/crowd.ts)
  const crowd = G.camera.layers.isEnabled(CROWD_LAYER);
  G.camera.layers.enable(CROWD_LAYER);
  try {
    gl.setRenderTarget(target);
    gl.setClearColor(0x000000, 0);
    gl.clear(true, false, false);
    gl.autoClear = false;
    gl.render(root, G.camera);
  } finally {
    if (!crowd) G.camera.layers.disable(CROWD_LAYER);
    swapOut(swapped);
    gl.autoClear = autoClear;
    gl.setClearColor(clear, clearAlpha);
  }
  return target;
}

const box = new THREE.Box3();
const corner = new THREE.Vector3();
const area = new THREE.Vector4();

/** The outlined thing's box on the canvas (pixels from its bottom left, as the scissor takes them, within the canvas),
 *  with `room` round it; null when it reaches behind the camera (the whole canvas then). */
function boxOnCanvas(root: THREE.Object3D, room: number): THREE.Vector4 | null {
  box.setFromObject(root);
  if (box.isEmpty()) return null;
  const camera = G.camera;
  let left = Infinity;
  let right = -Infinity;
  let bottom = Infinity;
  let top = -Infinity;
  for (let i = 0; i < 8; i++) {
    corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
    corner.applyMatrix4(camera.matrixWorldInverse);
    if (corner.z > -camera.near) return null;
    corner.applyMatrix4(camera.projectionMatrix);
    left = Math.min(left, corner.x);
    right = Math.max(right, corner.x);
    bottom = Math.min(bottom, corner.y);
    top = Math.max(top, corner.y);
  }
  const x0 = Math.max(0, Math.floor((left * 0.5 + 0.5) * canvasSize.x - room));
  const y0 = Math.max(0, Math.floor((bottom * 0.5 + 0.5) * canvasSize.y - room));
  const x1 = Math.min(canvasSize.x, Math.ceil((right * 0.5 + 0.5) * canvasSize.x + room));
  const y1 = Math.min(canvasSize.y, Math.ceil((top * 0.5 + 0.5) * canvasSize.y + room));
  return area.set(x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0));
}

/** The edge of the mask drawn over the canvas, in `color` at `strength`, within the outlined thing's box. */
function drawEdge(gl: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget, look: Outlined): void {
  const px = uiScales.hud * gl.getPixelRatio();
  const line = WIDTH * px;
  const glow = (WIDTH + GLOW) * px;
  const u = edgeMaterial.uniforms;
  u.uMask.value = target.texture;
  u.uLine.value.set(line / canvasSize.x, line / canvasSize.y);
  u.uGlow.value.set(glow / canvasSize.x, glow / canvasSize.y);
  u.uColor.value.copy(look.color);
  u.uStrength.value = look.strength;
  const within = boxOnCanvas(look.root, glow + BOX_MARGIN);
  const autoClear = gl.autoClear;
  gl.autoClear = false;
  gl.setRenderTarget(null);
  if (within) {
    // (WebGPU's scissor is from the canvas's top, WebGL's from its bottom)
    if (WEBGPU) within.y = canvasSize.y - within.y - within.w;
    // (in css px: the renderer scales the scissor by its pixel ratio)
    gl.setScissor(within.divideScalar(gl.getPixelRatio()));
    gl.setScissorTest(true);
  }
  edgeQuad.render(gl);
  gl.setScissorTest(false);
  gl.autoClear = autoClear;
}

/** Draws the outline over the finished frame, if anything is outlined (under the world's labels, `layer.ts`). */
export function drawOutline(): void {
  const look = current;
  if (!look || !look.root.parent) return;
  const gl = G.renderer;
  const mask = drawMask(gl, look.root);
  if (WEBGPU) drawOverFrame(gl, () => drawEdge(gl, mask, look));
  else drawEdge(gl, mask, look);
}

/**
 * Compiles the outline's programs at load: `roots` (one of every foe) each drawn into the mask, its meshes unculled,
 * and the edge drawn once, at no strength, unless `edge` is false (its program is the lobby's: behind it, a part's
 * outline draws its masks alone, as the edge's pass is the whole canvas's).
 */
export function warmOutline(roots: THREE.Object3D[], { edge = true } = {}): void {
  const gl = G.renderer;
  let target: THREE.WebGLRenderTarget | null = null;
  for (const root of roots) {
    const culled: THREE.Object3D[] = [];
    root.traverse((object) => {
      if (!object.frustumCulled) return;
      object.frustumCulled = false;
      culled.push(object);
    });
    target = drawMask(gl, root);
    for (const object of culled) object.frustumCulled = true;
  }
  if (!edge || !target || !roots[0]) return;
  const look = { root: roots[0], color: new THREE.Color(), strength: 0 };
  const mask = target;
  if (WEBGPU) drawOverFrame(gl, () => drawEdge(gl, mask, look));
  else drawEdge(gl, mask, look);
}

/** `root`'s masks compiled into the mask's target, alone (no lights, no fog, as `drawMask` draws it), what draws no
 *  mask left out (a compile passes over a mesh with no material), into `compiled`. */
function compileMasks(gl: THREE.WebGLRenderer, root: THREE.Object3D, compiled: Set<THREE.Material>): void {
  const swapped = swapIn(root);
  const unmasked = new Map<THREE.Mesh, THREE.Mesh['material']>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.material || isMask.has(mesh.material as THREE.Material)) return;
    unmasked.set(mesh, mesh.material);
    mesh.material = undefined as unknown as THREE.Material;
  });
  try {
    for (const material of gl.compile(root, G.camera)) compiled.add(material);
  } finally {
    for (const [mesh, material] of unmasked) mesh.material = material;
    swapOut(swapped);
  }
}

/**
 * The programs `warmOutline` draws compiled now, as they're drawn: `roots`' masks, and unless `edge` is false the
 * edge's pass, over the canvas. Gives back their materials, for a warm-up to wait for their links: drawn with none
 * linked, each was linked inside its draw, the page held up (a first visit's lobby, the dummies' mask and the edge).
 */
export function compileOutline(roots: THREE.Object3D[], { edge = true } = {}): Set<THREE.Material> {
  const gl = G.renderer;
  const prev = gl.getRenderTarget();
  const compiled = new Set<THREE.Material>();
  gl.getDrawingBufferSize(canvasSize);
  gl.setRenderTarget(maskOfSize(canvasSize.x, canvasSize.y));
  for (const root of roots) compileMasks(gl, root, compiled);
  if (edge) {
    gl.setRenderTarget(null);
    for (const material of gl.compile(edgeStandIn, passCamera)) compiled.add(material);
  }
  gl.setRenderTarget(prev);
  return compiled;
}
