// three's WebGPURenderer, the host of our engine (`src/engine`, docs/research/webgpu.md): the renderer made and given
// what the code around it asks of a WebGLRenderer. It draws what lies over the engine's frame (the labels, the
// outline); the scene is the engine's alone.
import * as THREE from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { initHdrForWebGPU } from './hdr';
import type { KitLooks } from './materials';
import { engineWorkDone } from '../engine/pipelinesAside';

/** how long three's async compile works before it yields a frame (ms, `compileSlice`): while nothing is played (the
 *  loading screen, the fight's loading bar), and while the lobby is. Its own 8 ms kept the GPU's compilers a third
 *  busy (2.7 of Chrome's 9 at once), the lobby's main thread building nodes between frames: 40 took a return's lobby
 *  from 7.1 to 6.5 s and its fight's bar from 2.1 to 0.8 s, but behind the lobby drew it at 14 to 19 a second. While
 *  the lobby is played, `playing` is the most: the slice is fitted to what the frames leave (`fitSlices` in
 *  game/warmup.ts), as 8 held a 144 Hz lobby's 141 frames a second down to 56 as the fight warmed behind it. */
export const COMPILE_SLICE = { loading: 40, playing: 8, least: 1 };
/** three's async compile set to work `ms` before it yields a frame (`vite.config.ts` makes its build read it). */
export function compileSlice(ms: number): void {
  (globalThis as { __compileSliceMs?: number }).__compileSliceMs = ms;
}

/** the scene's target as the game holds it (`holdSceneTarget`) */
let sceneTarget: THREE.RenderTarget | null = null;
/** The target that holds the scene's size and samples (core/renderer.ts's: nothing of three's draws into it). */
export const webgpuSceneTarget = (): THREE.RenderTarget => sceneTarget!;
/** `target` held as the scene's (`webgpuSceneTarget`). */
export function holdSceneTarget(target: THREE.RenderTarget): void {
  sceneTarget = target;
}

/** the renderer, for what's sent to the GPU outside a draw (`uploadTexture`) */
let uploader: WebGPURenderer | null = null;
/** `texture` sent to the GPU now, as it stands. A material three doesn't refresh sends none of its textures, so what
 *  still meshes read that changes each frame is sent by what changes it (a crowd's rows, `models/crowd.ts`). */
export function uploadTexture(texture: THREE.Texture): void {
  uploader?.initTexture(texture);
}

/** three's WebGPU build and its node language, loaded with the renderer: what node materials are made from */
export let gpu: typeof import('three/webgpu');
export let tsl: typeof import('three/tsl');

/**
 * A WebGPURenderer, initialised, typed as the WebGLRenderer the rest of the game takes. What it lacks of one is
 * stood in for: `compile` (nothing listed as made), its programs (none
 * are WebGL's) and the anisotropy asked at boot. (Its own `debug` stays: its node builder reads hooks off it.)
 */
export async function makeWebGPURenderer(hdrAllowed: boolean): Promise<THREE.WebGLRenderer> {
  gpu = await import('three/webgpu');
  tsl = await import('three/tsl');
  const { WebGPURenderer } = gpu;
  // (the canvas in extended range for HDR: core/hdr.ts)
  const outputType = initHdrForWebGPU(hdrAllowed) ? THREE.HalfFloatType : undefined;
  const renderer = new WebGPURenderer({
    antialias: false, powerPreference: 'high-performance', forceWebGL: false, trackTimestamp: true, outputType,
  });
  await renderer.init();
  uploader = renderer;
  pipelinesBeside(renderer);
  stillWhereStill(renderer);
  bundlesBeforeTransparents(renderer);
  if (new URLSearchParams(location.search).has('builds')) recordNodeBuilds(renderer);
  compileSlice(COMPILE_SLICE.loading);
  // (own properties over the class's getters: `compile` is one)
  const stand = (key: string, value: unknown) => Object.defineProperty(renderer, key, { value, writable: true });
  // (three draws the overlays and a few targets alone, the engine the scene: nothing of the scene is compiled for
  // three ahead, src/engine. Nothing listed as made: no WebGL programs to link.)
  stand('compile', () => new Set<THREE.Material>());
  // (the labels' atlas is sized within it: missing, its side was NaN, a texture 1 px wide)
  const maxTextureSize = (renderer.backend as unknown as GpuBackend).device?.limits.maxTextureDimension2D ?? 4096;
  stand('capabilities', { getMaxAnisotropy: () => renderer.getMaxAnisotropy(), isWebGL2: true, maxTextureSize });
  Object.defineProperty(renderer.info, 'programs', { value: [], writable: true });
  return renderer as unknown as THREE.WebGLRenderer;
}

/** what of three's WebGPU backend a canvas's copy into a texture reads: the device, and each texture's own */
interface GpuBackend {
  device?: {
    limits: { maxTextureDimension2D: number };
    queue: {
      copyExternalImageToTexture(source: object, destination: object, size: object): void;
    };
  };
  get(texture: THREE.Texture): { texture?: object };
}

/**
 * `w` by `h` px of `canvas` from its top left copied into `texture` at `x`, `y`, premultiplied by their alpha on
 * the way (the labels' slots, ui/overlay/atlas.ts): three's own copy reads a texture's upload, which would send the
 * whole canvas each time. False where it can't (WebGPURenderer's WebGL 2 backend, a texture not yet on the GPU).
 */
export function copyCanvasInto(renderer: THREE.WebGLRenderer, canvas: HTMLCanvasElement, texture: THREE.Texture,
  w: number, h: number, x: number, y: number): boolean {
  const backend = (renderer as unknown as WebGPURenderer).backend as unknown as GpuBackend;
  const into = backend.device && backend.get(texture).texture;
  if (!backend.device || !into) return false;
  backend.device.queue.copyExternalImageToTexture(
    { source: canvas, origin: { x: 0, y: 0 } },
    { texture: into, origin: { x, y }, premultipliedAlpha: true },
    { width: w, height: h },
  );
  return true;
}

/** The labels' material on WebGPU (ui/overlay/layer.ts's shader as nodes): each instance a box of the canvas
 *  (`aRect`, px) showing its slot of the atlas (`aUv`) at its alpha (`aAlpha`), premultiplied. */
export function labelsMaterial(atlas: THREE.Texture, view: THREE.Vector2): {
  material: THREE.Material;
  setAtlas(texture: THREE.Texture): void;
} {
  const { attribute, positionGeometry, vec4, mix, varying, texture, uniform } = tsl;
  const rect = attribute('aRect', 'vec4'), slot = attribute('aUv', 'vec4');
  const size = uniform(view);
  const px = rect.xy.add(positionGeometry.xy.mul(rect.zw));
  const material = new gpu.MeshBasicNodeMaterial();
  material.vertexNode = vec4(px.x.div(size.x).mul(2).sub(1), px.y.div(size.y).mul(2).oneMinus(), 0, 1);
  const shown = texture(atlas, varying(mix(slot.xy, slot.zw, positionGeometry.xy)));
  material.fragmentNode = shown.mul(varying(attribute('aAlpha', 'float')));
  return { material, setAtlas: (t) => { shown.value = t; } };
}

/** whether the next draw over the frame clears the canvas as its pass begins (`clearOverFrame`) */
let overClears = false;
/**
 * The canvas cleared by the next draw over the frame (`drawOverFrame`), as its pass begins: under the Rust engine
 * three's canvas holds the world's overlays alone, over the engine's. Cleared by a pass of its own, each draw
 * after it was a pass that read the whole canvas back first: on a phone's GPU, which draws by tiles, 4.5 million
 * pixels loaded and stored a pass, three passes a frame with an outline shown (10.9 ms a frame of its GPU, a
 * report from play, 64P8-0VPK, where a frame with nothing drawn over it took 1.5).
 */
export function clearOverFrame(): void {
  overClears = true;
  overPasses = 0;
}
/** how many passes the frame has drawn onto the canvas over the engine's so far */
let overPasses = 0;
/** A pass onto that canvas counted: a clear of its own (`drawOverFrame` counts its draws). */
export function countOverPass(): void { overPasses++; }
/** For a harness: the passes the last frame drew onto the canvas over the engine's. */
export const overFramePasses = (): number => overPasses;
/** Whether the canvas is still to be cleared: no draw over the frame has begun since `clearOverFrame`. */
export function overFrameUncleared(): boolean {
  const left = overClears;
  overClears = false;
  return left;
}

/**
 * `draw` onto the canvas over the frame the pipeline drew: with no tone mapping or conversion asked, so three draws
 * straight onto it (else it draws into a target of its own, empty, and copies that over the frame: the labels' first
 * port blacked the frame out), and not cleared, but where the canvas is to be cleared first (`clearOverFrame`): then
 * this draw's pass clears it as it begins.
 */
export function drawOverFrame(renderer: THREE.WebGLRenderer, draw: () => void): void {
  const r = renderer as unknown as WebGPURenderer;
  const { toneMapping, outputColorSpace, autoClear } = r;
  r.toneMapping = THREE.NoToneMapping;
  r.outputColorSpace = THREE.ColorManagement.workingColorSpace;
  r.autoClear = overClears;
  overClears = false;
  overPasses++;
  r.setRenderTarget(null);
  draw();
  r.toneMapping = toneMapping;
  r.outputColorSpace = outputColorSpace;
  r.autoClear = autoClear;
}

/** A node build three made for an object (`?builds`, `recordNodeBuilds`): when (the page's clock) and how long it
 *  took, whether a compile asked for it or a draw, whether it reused another's shaders, what it was for, and its
 *  shaders by number (in the order they were first made), with the bytes of WGSL it made that no build made before. */
export interface NodeBuild {
  at: number;
  ms: number;
  by: 'compile' | 'draw';
  reused: boolean;
  object: string;
  material: string;
  shadow: boolean;
  /** what sets its material's shaders apart from another's of its kind (`featuresOf`) */
  features: string;
  vertex: number;
  fragment: number;
  newBytes: number;
}

/** a render object as `recordNodeBuilds` reads it */
type Built = {
  object: THREE.Object3D;
  material: THREE.Material & { isShadowPassMaterial?: boolean };
  initialCacheKey: number;
};

/** three's node manager as `recordNodeBuilds` reads it */
type BuildingNodes = {
  getForRender(built: Built, ...rest: unknown[]): { vertexShader?: string; fragmentShader?: string };
  get(built: Built): { nodeBuilderState?: unknown };
  nodeBuilderCache: Map<number, unknown>;
};

/** a material's maps, each a part of its shaders where it's set */
const MAP_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap',
  'displacementMap', 'lightMap', 'envMap'] as const;

/** What sets `built`'s shaders apart from another's of its material's kind: its maps, and the object's and the
 *  material's switches (`MAP_SLOTS`, skinned, instanced, its colours, its sides, blending, alpha test, flat shading,
 *  shadows received). */
function featuresOf({ object, material }: Built): string {
  const lit = material as THREE.Material & Partial<Record<(typeof MAP_SLOTS)[number], unknown>> & {
    flatShading?: boolean; vertexColors?: boolean;
  };
  const mesh = object as THREE.Mesh & { isSkinnedMesh?: boolean; isInstancedMesh?: boolean; instanceColor?: unknown };
  const switches = [
    ...MAP_SLOTS.filter((slot) => lit[slot]),
    mesh.isSkinnedMesh && 'skinned', mesh.isInstancedMesh && 'instanced', mesh.instanceColor && 'instanceColor',
    lit.vertexColors && 'vertexColors', lit.flatShading && 'flat', material.transparent && 'transparent',
    material.alphaTest > 0 && 'alphaTest', material.side !== THREE.FrontSide && `side${material.side}`,
    mesh.geometry?.attributes.color && 'colorAttribute', mesh.morphTargetInfluences?.length && 'morphs',
    object.receiveShadow && 'receivesShadow',
  ];
  return switches.filter(Boolean).join(' ');
}

/** `object`'s name as a build lists it: its own, else its nearest named parent's, else its type. */
function nameOf(object: THREE.Object3D): string {
  for (let at: THREE.Object3D | null = object; at; at = at.parent) if (at.name) return at.name;
  return object.type;
}

/**
 * Every node build three makes, kept in `window.__webgpuBuilds` (`?builds`; `npm run stalls -- --scenario boot
 * --builds` lists them by boot step): each new WGSL shader is a compile of Chrome's (DXC) on every visit, as its cache
 * keeps about 6 MB of a page's, so what a boot builds, and when, is what it waits for.
 */
function recordNodeBuilds(renderer: WebGPURenderer): void {
  const nodes = (renderer as unknown as { _nodes: BuildingNodes })._nodes;
  const getForRender = nodes.getForRender.bind(nodes);
  const shaders = new Map<string, number>();
  let newBytes = 0;
  const shaderOf = (code = ''): number => {
    if (!shaders.has(code)) {
      shaders.set(code, shaders.size);
      newBytes += code.length;
    }
    return shaders.get(code)!;
  };
  const builds: NodeBuild[] = [];
  Object.assign(window, { __webgpuBuilds: builds });
  nodes.getForRender = (built: Built, ...rest: unknown[]) => {
    if (nodes.get(built).nodeBuilderState !== undefined) return getForRender(built, ...rest);
    const reused = nodes.nodeBuilderCache.has(built.initialCacheKey);
    const compiling = (renderer as unknown as { _precompilationState: unknown })._precompilationState !== null;
    const start = performance.now();
    const state = getForRender(built, ...rest);
    const ms = performance.now() - start;
    newBytes = 0;
    const vertex = shaderOf(state.vertexShader);
    const fragment = shaderOf(state.fragmentShader);
    builds.push({
      at: start, ms, by: compiling ? 'compile' : 'draw', reused,
      // (the GPU-driven drawing's own builds, `?meshlets`, have no object or material)
      object: built.object ? nameOf(built.object) : 'meshlets', material: built.material?.name || built.material?.type || '',
      shadow: built.material?.isShadowPassMaterial === true, features: built.material ? featuresOf(built) : '',
      vertex, fragment, newBytes,
    });
    return state;
  };
  recordPipelines(renderer);
  recordDraws(renderer);
  recordRenders(renderer);
  recordWrites();
  Object.assign(window, { __webgpuRecordFrom: recordFromNow });
}

/** the recorders that sum over the frames (`__webgpuRenders`, `__webgpuFull`, `__webgpuDraws`), emptied together */
const sumsKept: Record<string, unknown>[] = [];

/** `record` kept as `window[name]`, emptied by `recordFromNow`. */
function summed<T extends Record<string, unknown>>(name: string, record: T): T {
  Object.assign(window, { [name]: record });
  sumsKept.push(record);
  return record;
}

/** What the page sends the GPU's process, kept as `window.__webgpuWrites` with the frames counted (`frames`): each kind of
 *  write by its size, its calls and bytes, and the submits. That process decodes it all on its main thread, where a frame
 *  waits for it, and no timer of the page's sees it (`Late` in the perf report; `CommandBufferService:PutChanged`). */
function recordWrites(): void {
  const writes = summed<Record<string, number>>('__webgpuWrites', { frames: 0 });
  const count = (): void => {
    writes.frames++;
    requestAnimationFrame(count);
  };
  requestAnimationFrame(count);
  const add = (what: string, bytes: number): void => {
    writes[`${what} calls`] = (writes[`${what} calls`] ?? 0) + 1;
    writes[`${what} bytes`] = (writes[`${what} bytes`] ?? 0) + bytes;
  };
  const queue = GPUQueue.prototype;
  const { writeBuffer, writeTexture, submit } = queue;
  queue.writeBuffer = function (this: GPUQueue, ...args: Parameters<GPUQueue['writeBuffer']>) {
    const given = args[4] ?? (args[2] as ArrayBufferView).byteLength ?? 0;
    add(`buffer of ${args[0].size}`, Number(given));
    return writeBuffer.apply(this, args);
  };
  queue.writeTexture = function (this: GPUQueue, destination, data, layout, size) {
    add('texture', (data as ArrayBufferView).byteLength ?? 0);
    return writeTexture.call(this, destination, data, layout, size as Iterable<number>);
  };
  queue.submit = function (this: GPUQueue, ...args: Parameters<GPUQueue['submit']>) {
    add('submit', 0);
    return submit.apply(this, args);
  };
}

/** The sums started again from this frame (`window.__webgpuRecordFrom`, which `npm run stalls` calls as its scenario
 *  starts): summed from the boot, a steady lobby's frames were read with the loading screen's and the rise of its
 *  dummies. */
function recordFromNow(): void {
  for (const record of sumsKept) {
    const countsFrames = 'frames' in record;
    for (const key of Object.keys(record)) delete record[key];
    if (countsFrames) record.frames = 0;
  }
}

/** One kind of render call summed over the frames (`recordRenders`): how many, their time (ms, its nested renders
 *  in it), the objects they drew and how each object's uniforms were refreshed (three's full, shared or none). */
interface RenderSum { calls: number; ms: number; draws: number; full: number; shared: number; none: number }

/**
 * Every render call summed by what it drew into and with what camera, kept as `window.__webgpuRenders` (`frames`
 * counted too): the shadow maps, the scene's pass, the post chain's passes, each with its time and its objects'
 * refreshes, which is where WebGPU's JS goes (an object refreshed in full writes its uniforms anew).
 */
function recordRenders(renderer: WebGPURenderer): void {
  type Rendering = {
    render(scene: THREE.Object3D, camera: THREE.Camera): unknown;
    getRenderTarget(): THREE.RenderTarget | null;
    _nodes: { needsRefresh(built: unknown): number };
  };
  const r = renderer as unknown as Rendering;
  const sums = summed<Record<string, RenderSum | number>>('__webgpuRenders', { frames: 0 });
  const count = (): void => {
    (sums.frames as number)++;
    requestAnimationFrame(count);
  };
  requestAnimationFrame(count);
  const stack: RenderSum[] = [];
  const render = r.render.bind(r);
  r.render = (scene, camera) => {
    const target = r.getRenderTarget();
    const key = `${scene?.name || scene?.type} by ${camera?.name || camera?.type} into ${target?.texture?.name || (target ? 'a target' : 'the canvas')}`;
    const sum = (sums[key] ??= { calls: 0, ms: 0, draws: 0, full: 0, shared: 0, none: 0 }) as RenderSum;
    const start = performance.now();
    stack.push(sum);
    try {
      return render(scene, camera);
    } finally {
      stack.pop();
      sum.calls++;
      sum.ms += performance.now() - start;
    }
  };
  // (three's refresh types: none 0, shared 1, full 2)
  const kinds = ['none', 'shared', 'full'] as const;
  // (and each full refresh by what it refreshed and why, as three's observer decides: `window.__webgpuFull`)
  const full = summed<Record<string, number>>('__webgpuFull', {});
  const needsRefresh = r._nodes.needsRefresh.bind(r._nodes);
  r._nodes.needsRefresh = (built) => {
    const type = needsRefresh(built);
    const sum = stack[stack.length - 1];
    if (sum) {
      sum.draws++;
      sum[kinds[type] ?? 'full']++;
    }
    if (type === 2) {
      const object = (built as Observed).object as THREE.Mesh;
      // (an unnamed mesh by its geometry: its kind and size)
      const shape = object.name || `${object.geometry?.type} ${object.geometry?.attributes.position?.count}`;
      const what = `${fullBecause(built as Observed)}: ${nameOf(object)} / ${shape}`;
      full[what] = (full[what] ?? 0) + 1;
    }
    return type;
  };
}

/** a render object as three's observer reads it */
type Observed = Built & {
  getMonitor(): { hasNode: boolean; hasAnimation: boolean; hasDynamicInstancing(object: THREE.Object3D): boolean };
  looksChanged?: boolean;
};

/** each draw's object's world matrix as it was at the draw's last full refresh (`fullBecause`; by the render object:
 *  an object drawn in two passes is refreshed in each) */
const lastPlaced = new WeakMap<object, THREE.Matrix4>();

/** Why three's observer refreshes `built`'s uniforms in full: a node on its material, an animation, its instances
 *  changing, it moved since its last full refresh, or something else of it changed since the last draw (its
 *  material, its looks, the target...). */
function fullBecause(built: Observed): string {
  const monitor = built.getMonitor();
  const material = built.material as THREE.Material & { seeThrough?: unknown; isNodeMaterial?: boolean };
  const kind = `${material.type}${material.seeThrough ? ', see-through' : ''}${stillNodes.has(material) ? ', still' : ''}`;
  if (monitor.hasNode) return `a node (${kind})`;
  if (monitor.hasAnimation) return 'animated';
  if (built.looksChanged) return 'looks';
  if (monitor.hasDynamicInstancing(built.object)) return 'instances';
  const placed = lastPlaced.get(built);
  const moved = !placed || !placed.equals(built.object.matrixWorld);
  if (placed) placed.copy(built.object.matrixWorld);
  else lastPlaced.set(built, built.object.matrixWorld.clone());
  return moved ? 'moved' : 'changed';
}

/** Every draw counted by what it drew (its object's name and material), kept as `window.__webgpuDraws`, with the
 *  frames counted (`frames`): what a frame's draws are, for what a cut of them would save. */
function recordDraws(renderer: WebGPURenderer): void {
  type Drawing = { draw(built: Built, info: unknown): unknown };
  const backend = renderer.backend as unknown as Drawing;
  const draw = backend.draw.bind(backend);
  const draws = summed<Record<string, number>>('__webgpuDraws', { frames: 0 });
  const count = (): void => {
    draws.frames++;
    requestAnimationFrame(count);
  };
  requestAnimationFrame(count);
  backend.draw = (built, info) => {
    // (the material's id too: how many of an object's draws share one, what a merge by material would leave)
    const mesh = built.object as THREE.InstancedMesh;
    // (an unnamed mesh by its geometry: its kind and size)
    const shape = `${mesh?.geometry?.type} ${mesh?.geometry?.attributes.position?.count}`;
    const own = `${mesh?.name || shape}${mesh?.isInstancedMesh ? ' (instanced)' : ''}${mesh?.userData.noBake ? ' (breakable)' : ''}`;
    const what = `${mesh ? nameOf(mesh) : 'meshlets'}: ${own} / ${built.material?.name || built.material?.type} #${built.material?.id}`;
    draws[what] = (draws[what] ?? 0) + 1;
    return draw(built, info);
  };
}

/** the materials whose nodes hold nothing an object's draw must refresh: their uniforms are set once a render, their
 *  maps never change (a see-through prop's, core/shaderPorts.ts) */
export const stillNodes = new WeakSet<THREE.Material>();

/** the objects refreshed in full whatever they are (`stillWhereStill`): a still mesh whose texture was made anew, which
 *  its bindings must be told of. Whoever adds one takes it out after a frame. */
export const refreshedInFull = new WeakSet<THREE.Object3D>();

/** how many numbers a kit material's looks are (`looksChanged`) */
const LOOKS_COUNT = 16;

/** a render object as three's refresh reads it: its material, and its build's observer */
type Monitored = {
  material: THREE.Material & { kitLooks?: KitLooks };
  getMonitor(): { hasNode: boolean };
  /** a kit material's looks as this render object last drew them (`looksChanged`): its own, as three's observer is
   *  shared by every render object of one node build (every kit's material of a kind) */
  looksSeen?: Float32Array;
  /** whether its looks changed since its last draw: why it was refreshed in full (`fullBecause`) */
  looksChanged?: boolean;
};

/** Whether `value` differs from `seen[i]`, `seen[i]` set to it (as the array holds it: a float32 never equals the
 *  double it rounded). */
function seeAt(seen: Float32Array, i: number, value: number): boolean {
  if (seen[i] === Math.fround(value)) return false;
  seen[i] = value;
  return true;
}

/** Whether `looks` differ from what `seen` holds, `seen` set to them: a kit material's looks as its render object
 *  last drew them, compared number by number, nothing made at a draw (every one compared, so `seen` is all set). */
function looksChanged(looks: KitLooks, seen: Float32Array): boolean {
  const { u, near, rim, shade } = looks;
  let changed = seeAt(seen, 0, u.uDissolve.value);
  changed = seeAt(seen, 1, u.uFrozen.value) || changed;
  changed = seeAt(seen, 2, u.uChar.value) || changed;
  changed = seeAt(seen, 3, u.uHit.value) || changed;
  changed = seeAt(seen, 4, u.uShine.value) || changed;
  changed = seeAt(seen, 5, u.uEdge.value.r) || changed;
  changed = seeAt(seen, 6, u.uEdge.value.g) || changed;
  changed = seeAt(seen, 7, u.uEdge.value.b) || changed;
  changed = seeAt(seen, 8, near.value) || changed;
  changed = seeAt(seen, 9, rim.value.r) || changed;
  changed = seeAt(seen, 10, rim.value.g) || changed;
  changed = seeAt(seen, 11, rim.value.b) || changed;
  changed = seeAt(seen, 12, shade.value.x) || changed;
  changed = seeAt(seen, 13, shade.value.y) || changed;
  changed = seeAt(seen, 14, shade.value.z) || changed;
  changed = seeAt(seen, 15, shade.value.w) || changed;
  return changed;
}

/**
 * three refreshes every uniform of an object at each of its draws when the material it builds from holds any node
 * (a node may read something of the object), so each still prop wrote its uniforms anew every frame, in the scene's
 * pass and the shadow map's: on WebGPU, 128 of the lobby's 165 objects and all its 109 shadow casters. A build of a
 * `stillNodes` material is refreshed as three refreshes a plain one: when the object, its material or its geometry
 * changes, and its shared uniforms once a render. A kit material's (core/materials.ts) is too, and also as its looks
 * change (`looksChanged`: its nodes read them off the material, `kitNodes` in core/shaderPorts.ts): refreshed at each
 * draw, the lobby's two training dummies standing still were 31 full refreshes a frame (and 16 more as they swayed).
 * Its looks are kept on each render object: three's observer is one for every render object of a node build, and
 * kept on it, the two dummies' looks took turns and refreshed every draw.
 */
function stillWhereStill(renderer: WebGPURenderer): void {
  const nodes = (renderer as unknown as { _nodes: { needsRefresh(built: Monitored): number } })._nodes;
  const needsRefresh = nodes.needsRefresh.bind(nodes);
  nodes.needsRefresh = (built) => {
    if (refreshedInFull.has((built as unknown as { object: THREE.Object3D }).object)) return 2;
    // (and the shadow maps' depth materials: what makes a caster's shadow change moves it, which is a refresh)
    const shadow = (built.material as { isShadowPassMaterial?: boolean }).isShadowPassMaterial === true;
    const still = shadow || stillNodes.has(built.material);
    // (at every draw: three sets it again as each render object of the build is first drawn, and a still material
    // holds a node, `refreshedEachDraw` in core/shaderPorts.ts)
    if (still) built.getMonitor().hasNode = false;
    const type = needsRefresh(built);
    const looks = built.material.kitLooks;
    if (!looks || !still) return type;
    built.looksSeen ??= new Float32Array(LOOKS_COUNT).fill(NaN);
    built.looksChanged = looksChanged(looks, built.looksSeen);
    // (three's refresh types: none 0, shared 1, full 2)
    return built.looksChanged ? 2 : type;
  };
}

/** a render context's state in three's WebGPU backend, as far as its render bundles go */
type BundlesOfPass = { renderBundles: object[]; currentPass: { executeBundles(bundles: object[]): void } };
type Bundling = {
  backend: { get(context: unknown): BundlesOfPass; _resetRenderContextData(data: BundlesOfPass): void };
  _currentRenderBundle: unknown;
  _currentRenderContext: unknown;
  _renderTransparents(...rest: unknown[]): void;
};

/**
 * three executes a pass's render bundles as it ends, after what's blended, so a bundle's opaque meshes would be drawn
 * over the glows and particles before them, which saw no depth of theirs to stop at. They're executed before the first
 * blended draw instead, and the pass's state forgotten: executing a bundle clears what the pass had set.
 */
function bundlesBeforeTransparents(renderer: WebGPURenderer): void {
  const r = renderer as unknown as Bundling;
  const transparents = r._renderTransparents.bind(r);
  r._renderTransparents = (...rest) => {
    if (r._currentRenderBundle === null) {
      const pass = r.backend.get(r._currentRenderContext);
      // (none in a compile: it begins no pass)
      if (pass.renderBundles?.length > 0) {
        pass.currentPass.executeBundles(pass.renderBundles);
        pass.renderBundles.length = 0;
        r.backend._resetRenderContextData(pass);
      }
    }
    transparents(...rest);
  };
}

/** how many draws want their pipelines made at once (`pipelinesAtOnce`); one for good once the loading screen is
 *  gone (`pipelinesAtOnceFromNow`) */
let atOnce = 0;

/** Every pipeline made at its draw from now on (the lobby revealed): left out of the draws while made beside the
 *  frames, a pass of the post chain made again in the lobby left a frame wrong, and the screen flickered. */
export function pipelinesAtOnceFromNow(): void {
  atOnce++;
}

/** `draw` run with the pipelines it needs made at once, before it draws: a draw that is made only now and then (the
 *  still shadows), whose objects would be left out of it while theirs were made beside the frames. */
export function pipelinesAtOnce<T>(draw: () => T): T {
  atOnce++;
  try {
    return draw();
  } finally {
    atOnce--;
  }
}

/**
 * A pipeline first needed at a draw is made on the GPU's threads, beside the frames (`createRenderPipelineAsync`, as
 * a compile makes them), and three leaves its object out of the draws until it's made. Made there and then, the GPU
 * process's main thread made each: the post chain's at the lobby's first frames held the page up 0.6 to 0.8 s just
 * before the logo was blown away, on a return too. Under the loading screen alone: nothing shows of it there, where
 * in the lobby a pass left out made the screen flicker (`pipelinesAtOnceFromNow`).
 */
function pipelinesBeside(renderer: WebGPURenderer): void {
  const pipelines = (renderer as unknown as { _pipelines: MakingPipelines })._pipelines;
  const make = pipelines._getRenderPipeline.bind(pipelines);
  pipelines._getRenderPipeline = (built, vertex, fragment, key, promises) => {
    pipelineCount.made += 1;
    if (!promises) pipelineCount.atDraw += 1;
    return make(built, vertex, fragment, key, promises ?? (atOnce > 0 ? null : []));
  };
}

/** The render pipelines three has made since the renderer was: all of them, and those a draw made (not a compile:
 *  each held its frame up, or left its object out of it). */
const pipelineCount = { made: 0, atDraw: 0 };

/** The render pipelines made so far, and those a draw made (`pipelineCount`): the profiler's count of what its parts
 *  made, WebGPU's programs. */
export const pipelinesMade = (): { made: number; atDraw: number } => ({ ...pipelineCount });

/** what of three's pipelines `holdPipelines` holds: their releases, as three makes them */
interface ReleasingPipelines {
  _releasePipeline(pipeline: { usedTimes: number }): void;
  _releaseProgram(program: { usedTimes: number }): void;
}

/**
 * Every pipeline and shader three lets go of as nothing draws with it now kept while `held` (the profiler's turns, a
 * part taken out and put back again and again), and those still unused let go once it's over. three makes a
 * pipeline again for its next use once it's let go: the plain colour's, and the scene's under it, were made again at
 * every turn.
 */
export function holdPipelines(renderer: THREE.WebGLRenderer, held: boolean): void {
  const pipelines = (renderer as unknown as { _pipelines: ReleasingPipelines })._pipelines;
  if (held && !heldReleases) {
    heldReleases = { pipelines: new Set(), programs: new Set() };
    const kept = heldReleases;
    pipelines._releasePipeline = (pipeline) => kept.pipelines.add(pipeline);
    pipelines._releaseProgram = (program) => kept.programs.add(program);
    return;
  }
  if (held || !heldReleases) return;
  const { pipelines: keptPipelines, programs } = heldReleases;
  heldReleases = null;
  // (the class's own again: the instance's stand-ins removed)
  delete (pipelines as Partial<ReleasingPipelines>)._releasePipeline;
  delete (pipelines as Partial<ReleasingPipelines>)._releaseProgram;
  for (const pipeline of keptPipelines) if (pipeline.usedTimes === 0) pipelines._releasePipeline(pipeline);
  for (const program of programs) if (program.usedTimes === 0) pipelines._releaseProgram(program);
}

/** the pipelines and programs three let go of while they're held (`holdPipelines`), null while they aren't */
let heldReleases: { pipelines: Set<{ usedTimes: number }>; programs: Set<{ usedTimes: number }> } | null = null;

/** A pipeline three made: when, by a compile or at a draw, for what, and its key (its two shaders' ids, then the
 *  backend's: blending, depth, side, the target's samples and formats, the vertex layout...). */
interface PipelineMade { at: number; by: 'compile' | 'draw'; object: string; material: string; key: string }
type MakingPipelines = { _getRenderPipeline(built: Built, vertex: unknown, fragment: unknown, key: string, promises: unknown[] | null): unknown };

/** Every render pipeline made, kept as `window.__webgpuPipelines`: a draw that made one a compile had made with
 *  another key shows which part of the key differs (the `--read` of `npm run stalls`). */
function recordPipelines(renderer: WebGPURenderer): void {
  const pipelines = (renderer as unknown as { _pipelines: MakingPipelines })._pipelines;
  const make = pipelines._getRenderPipeline.bind(pipelines);
  const made: PipelineMade[] = [];
  Object.assign(window, { __webgpuPipelines: made });
  pipelines._getRenderPipeline = (built, vertex, fragment, key, promises) => {
    const material = built.material?.name || built.material?.type || '';
    const object = built.object ? nameOf(built.object) : 'meshlets';
    made.push({ at: performance.now(), by: promises ? 'compile' : 'draw', object, material, key });
    return make(built, vertex, fragment, key, promises);
  };
}

/** `group`'s point lights, those casting shadows first (as the rig has them: `rigPointLights`). */
function pointLightsIn(group: THREE.Object3D): THREE.PointLight[] {
  const lights: THREE.PointLight[] = [];
  group.traverse((o) => { if ((o as THREE.PointLight).isPointLight) lights.push(o as THREE.PointLight); });
  return [...lights.filter((l) => l.castShadow), ...lights.filter((l) => !l.castShadow)];
}

/** `light`'s place, colour, reach and shadow given to `rigged`, and a shadow it was to draw again handed on. */
function mirror(light: THREE.PointLight, rigged: THREE.PointLight): void {
  light.getWorldPosition(rigged.position);
  rigged.color.copy(light.color);
  rigged.intensity = light.intensity;
  rigged.distance = light.distance;
  rigged.decay = light.decay;
  if (light.castShadow) {
    rigged.shadow.mapSize.copy(light.shadow.mapSize);
    rigged.shadow.camera.near = light.shadow.camera.near;
    rigged.shadow.bias = light.shadow.bias;
    rigged.shadow.radius = light.shadow.radius;
    if (light.shadow.needsUpdate) rigged.shadow.needsUpdate = true;
    light.shadow.needsUpdate = false;
  }
  rigged.updateMatrixWorld();
}

/**
 * The biomes' and the hall of heroes' point lights drawn by one rig of lights, the shown one's copied onto it before
 * each render (its own hidden from WebGPU): WebGPU keys every lit pipeline by its lights' ids, where WebGL counts
 * them, so each biome and the hall had a copy of every lit pipeline, and a run in another biome than the lobby's
 * built its foes', heroes' and effects' at their first draws (7 s under the fight's loading bar on a return). Each
 * has as many as the rig, as many casting (`arena.ts` checks): the casters take its first slots.
 */
export function rigPointLights(scene: THREE.Scene, groups: THREE.Object3D[]): void {
  const lightsOf = rigPlaces.lightsOf;
  for (const group of groups) rigMorePointLights(group);
  groups = rigPlaces.groups;
  const most = Math.max(...[...lightsOf.values()].map((lights) => lights.length));
  const rig = Array.from({ length: most }, () => new THREE.PointLight(0xffffff, 0));
  for (const rigged of rig) rigged.userData.rigged = true;
  [...lightsOf.values()][0].forEach((light, i) => {
    rig[i].castShadow = light.castShadow;
    rig[i].shadow.autoUpdate = light.shadow.autoUpdate;
  });
  scene.add(...rig);
  const before = scene.onBeforeRender;
  scene.onBeforeRender = (...args) => {
    const shown = groups.find((group) => group.visible);
    const lights = shown ? lightsOf.get(shown)! : [];
    rig.forEach((rigged, i) => {
      if (lights[i]) mirror(lights[i], rigged);
      else rigged.intensity = 0;
    });
    before.apply(scene, args);
  };
}

/**
 * The shown place's own point lights, which the rig copies (`rigPointLights`) and three never sees: for a renderer
 * that isn't three's (src/engine), which runs none of the hooks the rig is set in. It walked the scene for its
 * lights and found the rig's alone, as the last hook left them: a house's candles, hearth and chandelier lit
 * nothing (`lab rust --village --room library`: "0 point lights").
 */
export function shownPointLights(): readonly THREE.PointLight[] {
  const shown = rigPlaces.groups.find((group) => group.visible);
  return (shown && rigPlaces.lightsOf.get(shown)) || NO_LIGHTS;
}
const NO_LIGHTS: readonly THREE.PointLight[] = [];

/** The place shown now, of those the rig copies its lights from (the Rust engine draws its lights' shadows of
 *  what stands still in it: engine/lampShadows.ts). */
export const shownPlace = (): THREE.Object3D | undefined => rigPlaces.groups.find((group) => group.visible);

/** the places the rig copies its lights from, each with its point lights (`rigPointLights`, `rigMorePointLights`) */
const rigPlaces = { groups: [] as THREE.Object3D[], lightsOf: new Map<THREE.Object3D, THREE.PointLight[]>() };

/** A place built after the rig was made (a fight's biome, built at the run's start: world/arena.ts) copied by it too:
 *  it has as many lights as every place, so the rig's lit pipelines take it as they are. */
export function rigMorePointLights(group: THREE.Object3D): void {
  const lights = pointLightsIn(group);
  rigPlaces.lightsOf.set(group, lights);
  rigPlaces.groups.push(group);
  for (const light of lights) light.visible = false;
}

/** Waits for the GPU to be done with every command sent so far: the engine's device's queue, which draws the game
 *  (`engineWorkDone`: three's own, waited for alone, left the engine's frame out), then three's (the overlays over it:
 *  the profiler's frames, `src/perf/profiler.ts`). */
export async function gpuDone(renderer: THREE.WebGLRenderer): Promise<void> {
  await engineWorkDone();
  const backend = (renderer as unknown as { backend: { device?: GPUDevice } }).backend;
  await backend.device?.queue.onSubmittedWorkDone();
}
