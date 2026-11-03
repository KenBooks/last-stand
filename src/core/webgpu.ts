// The game on three's WebGPURenderer, behind `?renderer=webgpu` (docs/research/webgpu.md): the renderer made and
// given what the WebGL code around it asks of a WebGLRenderer, and the post chain as a node pipeline.
import * as THREE from 'three';
import type { ClusterWait } from './meshlets';
import type { RenderPipeline, WebGPURenderer } from 'three/webgpu';
import { RUNNING } from './rendererChoice';
import { initHdrForWebGPU } from './hdr';
import type { KitLooks } from './materials';

/** Whether this page draws with WebGPURenderer: chosen in the pause menu, or by the address (`?renderer=webgpu`;
 *  `?renderer=webgpu-gl` its WebGL 2 backend), core/rendererChoice.ts. */
export const WEBGPU = RUNNING.webgpu;

/** the point lights the shaders' loop takes (`DynamicLighting`): a biome's eight without shadows, the hero's two,
 *  the effects' pool of eight (`fx/lights.ts`), with room */
const MAX_LOOPED_LIGHTS = 24;

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

let pipeline: RenderPipeline | null = null;
let sceneTarget: THREE.RenderTarget | null = null;
/** the passes the scene's share of the screen's pixels sizes (`setSceneShare`) */
const sizedByShare: { setResolutionScale(share: number): unknown }[] = [];
/** the scene's samples, chosen once (`setSceneSamples`); null until they are */
let samplesChosen: number | null = null;
/** the scene's pass as far as its samples go */
let samplesOf: { options: { samples?: number }; renderTarget: THREE.RenderTarget } | null = null;
/** the compiles started and not yet waited for (`compiled`) */
const compiling: Promise<unknown>[] = [];

/** Waits for every compile started so far (and any started meanwhile) to have made its pipelines. */
export async function compiled(): Promise<void> {
  while (compiling.length) await Promise.all(compiling.splice(0));
}

let clusters: ClusterWait = { hold: () => () => 0, back: () => Promise.resolve() };
/** The GPU-driven drawing's clusters (`?meshlets`, core/meshlets.ts) held back from the frames while a warm-up
 *  compiles, so their batches' shaders are compiled there (`warmUpWebGPU`): built as the lobby first drew them, they
 *  held its frames up to 270 ms. The release lets those held in and says how many. */
export const holdClusters = (): (() => number) => clusters.hold();
/** waits for every cluster asked so far to be back */
export const clustersBack = (): Promise<void> => clusters.back();

/** The target the scene's pass draws into: what its pipelines are made for, the warm-ups' too. */
export const webgpuSceneTarget = (): THREE.RenderTarget => sceneTarget!;
/** a light node of three's as `shadeEnvironmentNodes` reads it */
type LitNode = { light?: THREE.DirectionalLight; shadowNode?: { x: unknown } | null };

/**
 * The ambient light and the environment's reflection darkened in the sun's shadow, as `shadeEnvironment` in
 * core/renderer.ts has WebGL's chunks do it (`inShadow` the share of each left there). The lights' nodes have all added
 * to the lighting's terms when `setupLights` ends, and three lights a surface by those terms next. The sun's shadow is
 * kept in a variable, as the direct light and the terms here both read it: its map read once a pixel.
 */
export function shadeEnvironmentNodes(inShadow: { environment: number; ambient: number }): void {
  const { LightsNode, DirectionalLightNode } = gpu;
  const { mix, shadow } = tsl as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const directional = DirectionalLightNode.prototype as unknown as { setupShadowNode(this: LitNode): unknown };
  directional.setupShadowNode = function (this: LitNode) {
    return shadow(this.light).toVar();
  };
  type Terms = Record<'irradiance' | 'iblIrradiance' | 'radiance', { mulAssign(by: unknown): void } | undefined>;
  type Building = { object: THREE.Object3D; context: Terms };
  const lights = LightsNode.prototype as unknown as { setupLights(builder: Building, nodes: LitNode[]): void };
  const setupLights = lights.setupLights;
  lights.setupLights = function (builder, nodes) {
    setupLights.call(this, builder, nodes);
    if (!builder.object.receiveShadow) return;
    const sun = nodes.find((node) => node.light?.isDirectionalLight && node.light.castShadow)?.shadowNode;
    if (!sun) return;
    const ambient = mix(inShadow.ambient, 1, sun.x);
    builder.context.irradiance?.mulAssign(ambient);
    builder.context.iblIrradiance?.mulAssign(ambient);
    builder.context.radiance?.mulAssign(mix(inShadow.environment, 1, sun.x));
  };
}

/** The scene and bloom drawn at `share` of the screen's pixels each way (the quality's and Auto's, `sceneShare` in
 *  core/renderer.ts), the last pass scaling it up to the canvas. */
export function setSceneShare(share: number): void {
  for (const pass of sizedByShare) pass.setResolutionScale(share);
}

/**
 * The scene's MSAA samples, taken from the quality as the game starts and kept until a reload (`?msaa=N` chooses them
 * instead). WebGL's target only makes its buffers again for a new count, where a WebGPU pipeline is made for one count:
 * a change would make every pipeline of the frame again, at its draws.
 */
export function setSceneSamples(samples: number): void {
  if (samplesChosen !== null) return;
  const asked = new URLSearchParams(location.search).get('msaa');
  samplesChosen = asked === null ? samples : Number(asked);
  if (!samplesOf) return;
  samplesOf.options.samples = samplesChosen;
  samplesOf.renderTarget.samples = samplesChosen;
}

/** the renderer, for what's sent to the GPU outside a draw (`uploadTexture`) */
let uploader: WebGPURenderer | null = null;
/** `texture` sent to the GPU now, as it stands. A material three doesn't refresh sends none of its textures, so what
 *  still meshes read that changes each frame is sent by what changes it (`models/drawAsOne.ts`). */
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
export async function makeWebGPURenderer(): Promise<THREE.WebGLRenderer> {
  gpu = await import('three/webgpu');
  tsl = await import('three/tsl');
  const { WebGPURenderer } = gpu;
  // (the canvas in extended range for HDR, as the WebGL renderer's presenter is: core/hdr.ts)
  const outputType = initHdrForWebGPU() ? THREE.HalfFloatType : undefined;
  const renderer = new WebGPURenderer({
    antialias: false, powerPreference: 'high-performance', forceWebGL: RUNNING.webgpuOnGl, trackTimestamp: true, outputType,
  });
  await renderer.init();
  uploader = renderer;
  // three's GPU-driven drawing (r187): clusters of 64 triangles culled and their detail picked on the GPU, for what
  // it supports (static meshes and instanced ones in plain node materials); the rest drawn as before
  if (RUNNING.meshlets) {
    const meshlets = await import('three/addons/pipelines/MeshletDrawingPipeline.js');
    const { MeshletDrawingPipeline } = meshlets;
    // (exported by three, not by its types)
    batchesBuiltApart((meshlets as unknown as { MeshletBatch: unknown }).MeshletBatch);
    const drawing = new MeshletDrawingPipeline();
    const { clustersInWorkers } = await import('./meshlets');
    clusters = clustersInWorkers(drawing) ?? clusters;
    (renderer as unknown as { drawingPipeline: unknown }).drawingPipeline = batchesKept(stillAlone(drawing));
  }
  // the point lights casting no shadow drawn by one loop over a uniform array in each lit shader, where three wrote
  // each out in full (the physical model's every term, eight times over): the lit fragment shaders were 55 kB of
  // WGSL each, 3.5 MB of the 4.6 the game made, and Chrome's DXC compiled them again on every visit (its cache
  // never served them). `?lights=each` for three's own, to compare.
  if (!RUNNING.lightsEach) {
    const { DynamicLighting } = await import('three/addons/lighting/DynamicLighting.js');
    renderer.lighting = new DynamicLighting({ maxPointLights: MAX_LOOPED_LIGHTS });
  }
  compileShadowsToo(renderer);
  compilesTakeTurns(renderer);
  walkedAtOnce(renderer);
  pipelinesBeside(renderer);
  stillWhereStill(renderer);
  bundlesBeforeTransparents(renderer);
  if (new URLSearchParams(location.search).has('builds')) recordNodeBuilds(renderer);
  compileSlice(COMPILE_SLICE.loading);
  // (own properties over the class's getters: `compile` is one)
  const stand = (key: string, value: unknown) => Object.defineProperty(renderer, key, { value, writable: true });
  // the WebGL code's compiles started as `compileAsync`, for the target set (the warm-ups': the scene's pass's,
  // `sceneTarget` in renderer.ts): its pipelines made on the GPU's threads, its node builds a slice a frame, where
  // they were made at each material's first draw, on the main thread (the loading screen froze 10-15 s); waited for
  // by `compiled`. (Nothing listed as made: no WebGL programs to link.)
  stand('compile', (scene: THREE.Object3D, camera: THREE.Camera, target?: THREE.Scene | null) => {
    compiling.push(renderer.compileAsync(scene, camera, target ?? null).catch((e: unknown) => console.error('WebGPU compile:', e)));
    return new Set<THREE.Material>();
  });
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

/**
 * `draw` onto the canvas over the frame the pipeline drew: with no tone mapping or conversion asked, so three draws
 * straight onto it (else it draws into a target of its own, empty, and copies that over the frame: the labels' first
 * port blacked the frame out), and not cleared.
 */
export function drawOverFrame(renderer: THREE.WebGLRenderer, draw: () => void): void {
  const r = renderer as unknown as WebGPURenderer;
  const { toneMapping, outputColorSpace, autoClear } = r;
  r.toneMapping = THREE.NoToneMapping;
  r.outputColorSpace = THREE.ColorManagement.workingColorSpace;
  r.autoClear = false;
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
  recordBatches(renderer);
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

/** A batch the GPU-driven drawing made (`?builds` with `?meshlets`): when, for what material, its geometry
 *  pool's size and version then (a pool grown or moved has every render list's batches made again), whether a
 *  compile made it or a draw (a draw's batch is node builds in that frame) and what it drew into */
interface BatchMade {
  at: number; material: string; vertices: number; indices: number; poolVersion: number;
  by: 'compile' | 'draw'; target: string; size: string;
  /** what became of the batch it replaces: none, its culling made again, outgrown, its material changed, other */
  replaces: string;
  /** its render list's record and culling, numbered as they're first met */
  list: number; culling: number; entry: number;
}

/** Every batch three's meshlet pipeline makes, kept in `window.__meshletBatches`: each is drawn with materials of its
 *  own, so each is node builds at its first draw. */
function recordBatches(renderer: WebGPURenderer): void {
  type Pool = { vertexArray: Float32Array; indexArray: Uint32Array; version: number };
  type Batch = { culling: unknown; capacity: number; materialVersion: number };
  type Entry = { material: THREE.Material; batch: Batch | null; count: number };
  type Batching = {
    createBatch?: (entry: Entry, capacity: number, view: unknown, culling: unknown) => unknown;
    _geometryPool: Pool;
    _drawBatches(renderList: unknown, record: object): void;
  };
  type Drawing = { drawingPipeline: Batching; _precompilationState: unknown };
  const r = renderer as unknown as Drawing;
  const drawing = r.drawingPipeline;
  const createBatch = drawing.createBatch?.bind(drawing);
  if (createBatch === undefined) return;
  const made: BatchMade[] = [];
  Object.assign(window, { __meshletBatches: made });
  const replaced = (entry: Entry, culling: unknown): string => {
    const batch = entry.batch;
    if (batch === null) return 'none';
    if (batch.culling !== culling) return 'culling';
    if (entry.count > batch.capacity) return 'outgrown';
    if (batch.materialVersion !== entry.material.version) return 'material';
    return 'other';
  };
  const numbers = new WeakMap<object, number>();
  let numbered = 0;
  const numberOf = (o: unknown): number => {
    if (o === null || typeof o !== 'object') return -1;
    if (!numbers.has(o)) numbers.set(o, numbered++);
    return numbers.get(o)!;
  };
  let list = -1;
  const drawBatches = drawing._drawBatches.bind(drawing);
  drawing._drawBatches = (renderList, record) => {
    list = numberOf(record);
    drawBatches(renderList, record);
  };
  drawing.createBatch = (entry, capacity, view, culling) => {
    const pool = drawing._geometryPool;
    made.push({
      at: performance.now(), material: entry.material.name || entry.material.type,
      vertices: pool.vertexArray.length, indices: pool.indexArray.length, poolVersion: pool.version,
      by: r._precompilationState !== null ? 'compile' : 'draw', target: renderer.getRenderTarget()?.texture.name ?? 'screen',
      size: sizeDrawn(renderer), replaces: replaced(entry, culling), list, culling: numberOf(culling), entry: numberOf(entry),
    });
    return createBatch(entry, capacity, view, culling);
  };
}

/** The size the renderer draws at now (the size the meshlets' occlusion culling is made for): its target's, else
 *  its canvas's. */
function sizeDrawn(renderer: WebGPURenderer): string {
  const target = renderer.getRenderTarget();
  if (target) return `${target.width}x${target.height}`;
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  return `${size.x}x${size.y}`;
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
  /** a meshlet batch's place in its culling's buffers as this render object last drew it (`batchMoved`) */
  batchSeen?: Float32Array;
  /** what a stand-in's base held as this render object last drew it (`baseChanged`) */
  baseSeen?: Float32Array;
};

/** The materials standing in for another (`models/drawAsOne.ts`), by what they stand in for: nothing about their object
 *  or geometry ever changes, so a draw of one looks at its base's values alone (`baseChanged`). */
export const standInBases = new WeakMap<THREE.Material, THREE.Material>();

/** a stand-in's base's values, those a game changes as it runs */
type BaseValues = THREE.MeshPhysicalMaterial & { kitLooks?: KitLooks };

/** how many numbers a stand-in's base is watched by (`baseChanged`) */
const BASE_VALUES = LOOKS_COUNT + 15;

/** Whether `base`'s values differ from what `seen` holds, `seen` set to them: three's observer compares each of the
 *  85 properties of a material at every draw, a stand-in's through its accessors (1.5 ms of the frame's JS, profiled,
 *  for a hero's 31 draws). A map swapped, a colour set, a glow's pulse or anything said by its `version` shows here. */
function baseChanged(base: BaseValues, seen: Float32Array): boolean {
  const looks = base.kitLooks;
  let changed = looks ? looksChanged(looks, seen) : false;
  let at = LOOKS_COUNT;
  changed = seeAt(seen, at++, base.version) || changed;
  changed = seeAt(seen, at++, base.color?.r ?? 0) || changed;
  changed = seeAt(seen, at++, base.color?.g ?? 0) || changed;
  changed = seeAt(seen, at++, base.color?.b ?? 0) || changed;
  changed = seeAt(seen, at++, base.emissive?.r ?? 0) || changed;
  changed = seeAt(seen, at++, base.emissive?.g ?? 0) || changed;
  changed = seeAt(seen, at++, base.emissive?.b ?? 0) || changed;
  changed = seeAt(seen, at++, base.emissiveIntensity ?? 0) || changed;
  changed = seeAt(seen, at++, base.opacity) || changed;
  changed = seeAt(seen, at++, base.roughness ?? 0) || changed;
  changed = seeAt(seen, at++, base.metalness ?? 0) || changed;
  changed = seeAt(seen, at++, base.envMapIntensity ?? 0) || changed;
  changed = seeAt(seen, at++, base.map?.id ?? 0) || changed;
  changed = seeAt(seen, at++, base.normalMap?.id ?? 0) || changed;
  return seeAt(seen, at, base.roughnessMap?.id ?? 0) || changed;
}

/** each meshlet batch's draw materials' batch (`batchesBuiltApart`) */
const batchOf = new WeakMap<THREE.Material, Batch>();

/** how many buffers have been freed (`batchesBuiltApart`) */
let buffersFreed = 0;

/** Whether what `batch`'s draws read differs from what `seen` holds, `seen` set to it: where it lies in its culling's
 *  buffers, which move as the culling is resized and as other batches come and go, and those buffers themselves,
 *  which a resize or a grown pool replaces: drawn on with the old ones, whole passes were refused every frame
 *  (`Buffer used in submit while destroyed`, 500 times a boot). Any buffer freed refreshes them all once: nothing is
 *  freed in a steady frame. */
function batchMoved(batch: Batch, seen: Float32Array): boolean {
  const { dataOffset, queueOffset, counterOffset, maxWorkItems } = batch.rangeNodes;
  let moved = seeAt(seen, 0, dataOffset.value);
  moved = seeAt(seen, 1, queueOffset.value) || moved;
  moved = seeAt(seen, 2, counterOffset.value) || moved;
  moved = seeAt(seen, 3, maxWorkItems.value) || moved;
  moved = seeAt(seen, 4, batch.instanceOffset?.value ?? 0) || moved;
  moved = seeAt(seen, 5, batch.transformCount?.value ?? 0) || moved;
  moved = seeAt(seen, 7, buffersFreed) || moved;
  return seeAt(seen, 6, batch.transformPreviousCount?.value ?? 0) || moved;
}

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
 * kept on it, the two dummies' looks took turns and refreshed every draw. A meshlet batch's draws are too, and as
 * the batch moves in its culling's buffers (`batchMoved`): they read everything else off buffers the culling fills,
 * and were 38 full refreshes a frame, none of them changing anything.
 */
function stillWhereStill(renderer: WebGPURenderer): void {
  const nodes = (renderer as unknown as { _nodes: { needsRefresh(built: Monitored): number } })._nodes;
  const needsRefresh = nodes.needsRefresh.bind(nodes);
  nodes.needsRefresh = (built) => {
    const base = standInBases.get(built.material);
    if (base !== undefined && built.baseSeen) {
      // (a stand-in's uniforms of the render, the camera's and the lights', each render)
      return baseChanged(base as BaseValues, built.baseSeen) ? 2 : 1;
    }
    if (base !== undefined) {
      built.baseSeen = new Float32Array(BASE_VALUES).fill(NaN);
      baseChanged(base as BaseValues, built.baseSeen);
    }
    // (and the shadow maps' depth materials: what makes a caster's shadow change moves it, which is a refresh)
    const shadow = (built.material as { isShadowPassMaterial?: boolean }).isShadowPassMaterial === true;
    const batch = batchOf.get(built.material);
    const still = shadow || batch !== undefined || stillNodes.has(built.material);
    // (at every draw: three sets it again as each render object of the build is first drawn, and a still material
    // holds a node, `refreshedEachDraw` in core/shaderPorts.ts, for the meshlets' copy of it)
    if (still) built.getMonitor().hasNode = false;
    const type = needsRefresh(built);
    if (batch !== undefined) {
      built.batchSeen ??= new Float32Array(8).fill(NaN);
      return batchMoved(batch, built.batchSeen) ? 2 : type;
    }
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
  pipelines._getRenderPipeline = (built, vertex, fragment, key, promises) =>
    make(built, vertex, fragment, key, promises ?? (atOnce > 0 ? null : []));
}

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

/** a shadow node's view of its frame, and the renderer's state while it compiles */
type ShadowFrame = { renderer: { _precompilationState: unknown } };
type Shadowing = { updateShadow(frame: ShadowFrame): void };

/**
 * three's `compileAsync` draws no shadow (r187: "do not render shadow maps during precompilation"), so every
 * caster's shadow pipeline was made as its shadow was first drawn, on the main thread, and with them the GPU's
 * process (the boot's 12 s stalls, which held the logo's WebGL exit up too). Here a compile draws each shadow once
 * as it meets it, its casters queued with the rest of the compile's work as any render inside a compile is
 * (each shadow drawn once a compile started: every object its light reaches meets it).
 */
function compileShadowsToo(renderer: WebGPURenderer): void {
  let compile = 0;
  const drawnFor = new WeakMap<object, number>();
  const compileAsync = renderer.compileAsync.bind(renderer);
  renderer.compileAsync = (...args: Parameters<typeof compileAsync>) => {
    compile++;
    return compileAsync(...args);
  };
  // (a shadow is drawn once a render, by the render's number, and a compile's queue is worked through under the
  // last frame's, whose shadows were drawn: so they're drawn here, where the compile updates each object's nodes)
  const nodes = (renderer as unknown as { _nodes: CompileNodes })._nodes;
  const updateBefore = nodes.updateBefore.bind(nodes);
  nodes.updateBefore = (renderObject: unknown) => {
    if ((renderer as unknown as ShadowFrame['renderer'])._precompilationState !== null) {
      for (const node of nodes_(renderObject).updateBeforeNodes) {
        if (!(node instanceof gpu.ShadowNode) || drawnFor.get(node) === compile) continue;
        drawnFor.set(node, compile);
        (node as unknown as Shadowing).updateShadow(nodes.getNodeFrameForRender(renderObject) as ShadowFrame);
      }
    }
    updateBefore(renderObject);
  };
}

/** the meshes the meshlet pipeline may draw: what the biomes stand, which never moves (`stillForMeshlets`) */
const still = new WeakSet<object>();

/** Everything under `roots` (the biomes and the hall as they're built) given to the meshlet pipeline. */
export function stillForMeshlets(...roots: THREE.Object3D[]): void {
  for (const root of roots) root.traverse((object) => still.add(object));
}

type Meshlets = { _isMeshlet(object: object, ...rest: unknown[]): boolean };

/**
 * The meshlet pipeline kept to still meshes (`stillForMeshlets`): it took every mesh it could, the heroes' and the
 * training dummies' moving parts too, and after the pause menu closed the dummies were gone and a tan shell of their
 * burlap stood round the hero in the middle of the dais.
 */
function stillAlone<T>(drawing: T): T {
  const pipeline = drawing as unknown as Meshlets;
  const isMeshlet = pipeline._isMeshlet.bind(pipeline);
  pipeline._isMeshlet = (object, ...rest) => still.has(object) && isMeshlet(object, ...rest);
  return drawing;
}

type Batch = {
  meshes: THREE.Mesh[];
  prepassMeshes: THREE.Mesh[];
  rangeNodes: Record<'dataOffset' | 'queueOffset' | 'counterOffset' | 'maxWorkItems', { value: number }>;
  instanceOffset?: { value: number };
  transformCount?: { value: number };
  transformPreviousCount?: { value: number };
  setupDraw(shared: unknown): void;
};
type NodeMaterialKey = { customProgramCacheKey(this: THREE.Material): string };

/**
 * Each meshlet batch's draws built apart. A batch draws with a copy of its material that takes the material's own
 * properties, so where the game's material has a `customProgramCacheKey` of its own (`seeThrough`'s, for WebGL) the
 * copy's node build was keyed by it alone, blind to the batch's nodes, and every batch of a see-through material
 * shared the first one's build: its offsets into the culling's queue and objects with it. The crypt's obelisks and
 * beacons drew another batch's range, so nothing at all (#331), and so, likely, did the forest's stones (da9701e).
 */
function batchesBuiltApart(MeshletBatch: unknown): void {
  const prototype = (MeshletBatch as { prototype: Batch }).prototype;
  const setupDraw = prototype.setupDraw;
  const nodeKey = (gpu.NodeMaterial.prototype as unknown as NodeMaterialKey).customProgramCacheKey;
  let made = 0;
  prototype.setupDraw = function (this: Batch, shared: unknown) {
    setupDraw.call(this, shared);
    const tag = `|batch${made++}`;
    for (const { material } of this.meshes) {
      const drawn = material as THREE.Material;
      drawn.customProgramCacheKey = () => nodeKey.call(drawn) + tag;
    }
    // (their constructor makes the prepass's after `setupDraw`: found by the batch's draws as they're first refreshed)
    for (const { material } of this.meshes) batchOf.set(material as THREE.Material, this);
  };
  // (what a batch's draws bind is replaced as buffers go: `batchMoved`)
  const attribute = THREE.BufferAttribute.prototype as unknown as { dispose(this: object): void };
  const dispose = attribute.dispose;
  attribute.dispose = function (this: object) {
    buffersFreed++;
    dispose.call(this);
  };
}

type KeptBatch = { capacity: number; dispose(): void; relocate(): boolean };
type KeptEntry = { unusedProjections: number; batch: KeptBatch | null; source: KeptEntry | null };
type KeptRecord = {
  entries: KeptEntry[];
  staticGroups: Map<unknown, { entries: KeptEntry[]; unusedProjections: number }>;
  culling: unknown;
};
type Keeping = {
  renderer: { _compilationPromises: unknown[] | null };
  createBatch(entry: KeptEntry, ...rest: unknown[]): unknown;
  _drawBatches(renderList: unknown, record: KeptRecord): void;
  _shrinkCulling(record: KeptRecord, entries: KeptEntry[]): void;
  _getCullingCapacity(entries: KeptEntry[], capacities: number[], ...rest: unknown[]): unknown;
  _disposeBatches(record: KeptRecord, kept: Set<KeptEntry>): void;
  _addGeometries(culling: unknown, entries: KeptEntry[]): boolean;
};

/**
 * The meshlet batches a warm-up compiled kept, however long the frames leave them undrawn, and every batch kept
 * through its culling's resize. The warm-ups compile into the frames' own render list, where three drops a batch:
 * one undrawn for 60 projections (0.4 s at 144 Hz); and every one not drawn in the projection that resizes the
 * culling, which each warm-up's new biome or part did, and the lobby's frames as they shrank it to their own. So the
 * lobby's frames made their own batches again after each warm-up, the warm-ups' draws theirs, and the fight's first
 * frames once more, each a node build in its frame: 1477 builds at a draw in the lobby's first seconds, its frames
 * held up 200 to 740 ms. A resized culling is sized for the undrawn batches too, and they're moved into it.
 */
function batchesKept<T>(drawing: T): T {
  const keeping = drawing as unknown as Keeping;
  const warmed = new WeakSet<KeptEntry>();
  /** the render list being drawn or shrunk, and its batches undrawn there, kept through its resize */
  let record: KeptRecord | null = null;
  let undrawn: KeptEntry[] = [];
  const within = <A extends unknown[]>(run: (...args: A) => void) => (at: KeptRecord, ...args: A): void => {
    record = at;
    undrawn = [];
    try {
      run(...args);
    } finally {
      record = null;
      undrawn = [];
    }
  };
  const createBatch = keeping.createBatch.bind(keeping);
  keeping.createBatch = (entry, ...rest) => {
    if (keeping.renderer._compilationPromises !== null) warmed.add(entry);
    return createBatch(entry, ...rest);
  };
  const drawBatches = keeping._drawBatches.bind(keeping);
  keeping._drawBatches = (renderList, at) => within(() => {
    for (const entry of at.entries) if (warmed.has(entry)) entry.unusedProjections = 0;
    for (const group of at.staticGroups.values()) {
      if (group.entries.some((entry) => warmed.has(entry))) group.unusedProjections = 0;
    }
    drawBatches(renderList, at);
  })(at);
  const shrinkCulling = keeping._shrinkCulling.bind(keeping);
  keeping._shrinkCulling = (at, entries) => within(() => shrinkCulling(at, entries))(at);
  const cullingCapacity = keeping._getCullingCapacity.bind(keeping);
  keeping._getCullingCapacity = (entries, capacities, ...rest) => {
    undrawn = record === null ? [] : undrawnOf(record, new Set(entries));
    const all = [...entries, ...undrawn];
    return cullingCapacity(all, [...capacities, ...undrawn.map((entry) => entry.batch!.capacity)], ...rest);
  };
  const disposeBatches = keeping._disposeBatches.bind(keeping);
  keeping._disposeBatches = (at, kept) => disposeBatches(at, new Set([...kept, ...undrawn]));
  const addGeometries = keeping._addGeometries.bind(keeping);
  keeping._addGeometries = (culling, entries) => {
    const added = addGeometries(culling, entries);
    if (undrawn.length === 0 || record?.culling !== culling) return added;
    const moved = undrawn;
    undrawn = [];
    const fits = addGeometries(culling, moved);
    for (const entry of moved) {
      if (fits && entry.batch!.relocate()) continue;
      entry.batch!.dispose();
      entry.batch = null;
    }
    return added;
  };
  return drawing;
}

/** `record`'s entries with a batch that aren't among `drawn`, whose objects' batch (a shared one's) is kept too. */
function undrawnOf(record: KeptRecord, drawn: Set<KeptEntry>): KeptEntry[] {
  const all = [...record.entries, ...[...record.staticGroups.values()].flatMap((group) => group.entries)];
  const undrawn = all.filter((entry) => entry.batch !== null && !drawn.has(entry));
  const kept = new Set([...drawn, ...undrawn]);
  return undrawn.filter((entry) => entry.source === null || kept.has(entry.source));
}

/** what of three's renderer a compile's state is kept by (`compilesTakeTurns`) */
type Precompiling = {
  _precompilationState: object | null;
  _beginPreCompile(state: object): void;
  _finishPreCompile(): void;
  _nodes: CompileNodes & { getForRenderAsync(renderObject: object, yieldFn?: () => Promise<void>): Promise<unknown> };
};

/**
 * three's async compile keeps the state of the item it builds (its target, its render context, its material's side)
 * on the renderer, one for all, and waits a microtask or more mid-item (each stage of a node build, a build found
 * cached): two compiles at once (the lobby's warm-up and a hero's, the fight's behind the lobby) worked through each
 * other's items with each other's state, and one's end cleared the other's ("Cannot destructure property
 * 'useFrameBufferTarget' of 'this._precompilationState' as it is null"), its compile thrown away and its pipelines
 * made at their first draw instead (the lobby at 2 fps). Here each item's state is its own: one begun over another
 * ends the other first, and each item takes its own back where its work goes on after a wait (its build's every
 * yield, and its node updates after the build, the first thing it does past its last wait).
 */
function compilesTakeTurns(renderer: WebGPURenderer): void {
  const r = renderer as unknown as Precompiling;
  const begin = r._beginPreCompile.bind(r);
  const finish = r._finishPreCompile.bind(r);
  r._beginPreCompile = (state) => {
    if (r._precompilationState !== null && r._precompilationState !== state) finish();
    begin(state);
  };
  // (an item's state already ended by another's begin)
  r._finishPreCompile = () => {
    if (r._precompilationState !== null) finish();
  };
  const own = (state: object): void => {
    if (r._precompilationState !== state) r._beginPreCompile(state);
  };
  const ownerOf = new WeakMap<object, object>();
  const nodes = r._nodes;
  const getForRenderAsync = nodes.getForRenderAsync.bind(nodes);
  nodes.getForRenderAsync = (renderObject, yieldFn) => {
    const state = r._precompilationState;
    if (state === null || yieldFn === undefined) return getForRenderAsync(renderObject, yieldFn);
    ownerOf.set(renderObject, state);
    return getForRenderAsync(renderObject, async () => {
      own(state);
      await yieldFn();
      own(state);
    });
  };
  const updateBefore = nodes.updateBefore.bind(nodes);
  nodes.updateBefore = (renderObject: object) => {
    const state = ownerOf.get(renderObject);
    if (state !== undefined) {
      ownerOf.delete(renderObject);
      own(state);
    }
    updateBefore(renderObject);
  };
}

/**
 * The GPU-driven drawing's `prepareAsync` (`?meshlets`) waits as every compile starts, so the compile walked the
 * scene after the warm-up that asked for it had put it back (its objects out, the other biomes in): the lobby's and
 * the fight's pipelines were made at their first draws, on the main thread. Here the compile walks the scene at once,
 * and the clusters are made beside it (any it missed, as their meshes are first drawn).
 */
function walkedAtOnce(renderer: WebGPURenderer): void {
  type Preparing = { prepareAsync?: (scene: THREE.Object3D, camera: THREE.Camera) => Promise<void> | undefined };
  const drawing = (renderer as unknown as { drawingPipeline: Preparing }).drawingPipeline;
  const prepareAsync = drawing.prepareAsync?.bind(drawing);
  if (prepareAsync === undefined) return;
  const compileAsync = renderer.compileAsync.bind(renderer);
  renderer.compileAsync = (...args: Parameters<typeof compileAsync>) => {
    void prepareAsync(args[0], args[1])?.catch((e: unknown) => console.error('WebGPU clusters:', e));
    drawing.prepareAsync = () => undefined;
    try {
      return compileAsync(...args);
    } finally {
      drawing.prepareAsync = prepareAsync;
    }
  };
}

/** what of three's node manager a compile's shadows use */
type CompileNodes = { updateBefore(renderObject: unknown): void; getNodeFrameForRender(renderObject: unknown): unknown };
const nodes_ = (renderObject: unknown): { updateBeforeNodes: object[] } =>
  (renderObject as { getNodeBuilderState(): { updateBeforeNodes: object[] } }).getNodeBuilderState();

/** Where the grade's highlights ease off (renderer.ts's `HI_KNEE`, `HI_CAP`): the brightest channel over `knee`
 *  eases towards `cap`. */
export interface Highlights { knee: number; cap: number }

/** The grade's numbers as renderer.ts has them: the highlights, the adaptation's base and the share of an area's
 *  light a pixel adapts with it from and fully at (`ADAPT_BASE`, `ADAPT_ALIKE`), and where a bright pixel keeps its
 *  hue, by its brightest channel and by the glare round it (`HUE_FROM`..`HUE_TO`, `GLARE_FROM`..`GLARE_TO`). */
export interface GradeLooks {
  highlights: Highlights;
  /** HDR's knee (renderer.ts `HDR_KNEE`): the share of white under which the frame shows as on an SDR screen */
  hdrKnee: number;
  adaptBase: number;
  adaptAlike: readonly [number, number];
  hue: readonly [number, number];
  glare: readonly [number, number];
  /** each blur level's weight in bloom, tightest to widest (renderer.ts `BLOOM_LEVELS`) */
  bloom: readonly number[];
}

/** the weights three's bloom gives its levels: a level's tint is what the game's weight asks of it */
const THREE_BLOOM_LEVELS = [1, 0.8, 0.6, 0.4, 0.2];

/** `colour` with a NaN or Inf pixel made black and the rest held to 0..64, as WebGL's sanitize pass makes the scene
 *  before bloom: bloom smears a single bad pixel into black boxes across the frame. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitized(colour: any): any {
  const { clamp, select, vec4 } = tsl as any;
  // (a NaN is the one value unequal to itself; an Inf is past any float's range)
  const nan = colour.r.notEqual(colour.r).or(colour.g.notEqual(colour.g)).or(colour.b.notEqual(colour.b));
  const inf = colour.r.abs().add(colour.g.abs()).add(colour.b.abs()).greaterThan(1e30);
  return select(nan.or(inf), vec4(0, 0, 0, 1), clamp(colour, 0, 64));
}

/** the light's weights, as the WebGL grade reads an area's and a pixel's */
const LUM = [0.2126, 0.7152, 0.0722] as const;

/** `sample` (a function of a place on the screen) averaged over each texel of a `width` by `height` target, as
 *  WebGL's `AreaPass` does: 8x8 taps an eighth of a texel apart, a NaN or Inf tap left out and each held to 64. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function boxDown(sample: (at: any) => any, width: number, height: number): any {
  const { rtt, screenUV, vec2, vec3, vec4, min, select } = tsl as any;
  const step = vec2(1 / width / 8, 1 / height / 8);
  let sum = vec3(0);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const v = sample(screenUV.add(vec2(x - 3.5, y - 3.5).mul(step))).rgb;
      // (a NaN is the one value unequal to itself; an Inf is past any float's range)
      const bad = v.x.notEqual(v.x).or(v.y.notEqual(v.y)).or(v.z.notEqual(v.z)).or(v.x.add(v.y).add(v.z).greaterThan(1e30));
      sum = sum.add(select(bad, vec3(0), min(v, vec3(64))));
    }
  }
  return rtt(vec4(sum.div(64), 1), width, height, { depthBuffer: false });
}

/** `colour`'s light above the base compressed as the eye adapts to the average light round it, in a small area (a
 *  16x9 grid of the frame) and a large one (4x3), as WebGL's grade does: a pixel as bright as its area or brighter
 *  adapts with it, one half as bright or dimmer keeps its light (renderer.ts's `ADAPT`). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function adapted(colour: any, small: any, large: any, u: GradeUniforms, looks: GradeLooks): any {
  const { dot, vec3, vec4, log, pow, max, min, mix, smoothstep, select, reference, screenUV } = tsl as any;
  const weights = vec3(...LUM);
  const base = looks.adaptBase;
  const lum = dot(colour.rgb, weights);
  const adapt = (avg: any, target: any): any => select(avg.greaterThan(target),
    log(target.div(base)).div(log(avg.div(base))), 1);
  const adaptAt = (avg: any, target: any): any => mix(1, adapt(avg, target),
    smoothstep(looks.adaptAlike[0], looks.adaptAlike[1], lum.div(max(avg, 1e-4))));
  const smallTarget = reference('value', 'float', u.uSmall);
  const largeTarget = reference('value', 'float', u.uLarge);
  const g = min(adaptAt(dot(small.sample(screenUV).rgb, weights), smallTarget),
    adaptAt(dot(large.sample(screenUV).rgb, weights), largeTarget));
  const scale = select(lum.greaterThan(base), pow(lum.div(base), g).mul(base).div(max(lum, 1e-6)), 1);
  return vec4(colour.rgb.mul(scale), colour.a);
}

/** `colour` tone mapped as WebGL's grade maps it: per channel, but a bright pixel in a large glare (bloom's widest
 *  level round it) mapped by its brightest channel, keeping its colour, as the eye sees a large bright area's. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toneMappedKeepingHue(colour: any, glareAt: any, looks: GradeLooks): any {
  const { toneMapping, toneMappingExposure, vec3, vec4, max, mix, smoothstep } = tsl as any;
  const mapped = (c: any): any => toneMapping(THREE.ACESFilmicToneMapping, toneMappingExposure, c);
  const brightest = max(max(colour.r, max(colour.g, colour.b)), 1e-4);
  const hue = colour.rgb.div(brightest).mul(mapped(vec3(brightest)).g);
  const glare = max(glareAt.r, max(glareAt.g, glareAt.b));
  const keep = smoothstep(looks.hue[0], looks.hue[1], brightest).mul(smoothstep(looks.glare[0], looks.glare[1], glare));
  return vec4(mix(mapped(colour.rgb).rgb, hue, keep), colour.a);
}

/** `colour` compressed as the WebGL grade compresses it: the brightest channel over the knee eased towards the cap,
 *  the others kept in their ratio to it, so a stack of lights stops adding up (a fire's flames blew out white). */
// (untyped: TSL's types don't follow a node through these calls yet)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function compressed(colour: any, { knee }: Highlights, u: GradeUniforms): unknown {
  const { exp, max, select, vec4, reference } = tsl as any;
  const brightest = max(colour.r, max(colour.g, colour.b));
  // (as far again as HDR's peak has room over its paper white: `uCap`, the cap less the knee)
  const room = reference('value', 'float', u.uCap);
  const eased = exp(brightest.sub(knee).negate().div(room)).oneMinus().mul(room).add(knee);
  const scale = select(brightest.greaterThan(knee), eased.div(brightest), 1);
  return vec4(colour.rgb.mul(scale), colour.a);
}

/** The WebGL grade's uniforms the WebGPU one reads (core/renderer.ts `GradeShader`), each `{ value }` */
export interface GradeUniforms {
  uTime: { value: number };
  uCap: { value: number };
  uHdr: { value: number };
  uPaper: { value: number };
  uPeak: { value: number };
  uSmall: { value: number };
  uLarge: { value: number };
  uVignette: { value: number };
  uHurt: { value: number };
  uLow: { value: number };
  uBeat: { value: number };
  tBlood: { value: THREE.Texture | null };
}

/** `colour` (tone mapped, in sRGB) graded as the WebGL grade grades it there: the vignette, shadows cooled and
 *  highlights warmed, a film's grain, the low Health look (the colour drained, the blood in from the edges as far as the Health has
 *  fallen: core/lowLife.ts) and a hit's red flash round the edges. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function graded(colour: any, u: GradeUniforms): unknown {
  const { dot, vec2, vec3, vec4, mix, pow, smoothstep, step, clamp, texture, reference, screenUV, fract, sin } =
    tsl as any;
  const read = (uniform: { value: number }): any => reference('value', 'float', uniform);
  const low = read(u.uLow);
  const d = screenUV.sub(0.5);
  const r = dot(d, d);
  const vignette = smoothstep(0.12, 0.75, r.mul(read(u.uVignette))).oneMinus();
  let c = colour.rgb.mul(mix(0.35, 1, vignette));
  const lum = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(c.mul(vec3(0.93, 0.97, 1.08)), c.mul(vec3(1.04, 1.0, 0.94)), smoothstep(0.2, 0.8, lum));
  const grainAt = screenUV.mul(900).add(read(u.uTime));
  const grain = fract(sin(dot(grainAt, vec2(12.9898, 78.233))).mul(43758.5453));
  c = c.add(grain.sub(0.5).mul(0.025));
  c = mix(c, vec3(dot(c, vec3(0.299, 0.587, 0.114))), pow(low, 1.5).mul(0.9));
  // (the mask as WebGL's grade reads it, its rows from the screen's foot up)
  const mask = texture(u.tBlood.value!, screenUV.flipY()).rgb;
  const reach = low.mul(read(u.uBeat).mul(0.06).add(1));
  const shown = mask.r.mul(smoothstep(mask.g.sub(0.03), mask.g.add(0.004), reach)).mul(step(1e-6, low));
  const age = clamp(reach.sub(mask.g).div(0.45), 0, 1);
  const rim = smoothstep(0, 0.035, reach.sub(mask.g)).oneMinus();
  const blood = mix(vec3(0.42, 0.015, 0.025), vec3(0.11, 0, 0.006), age).mul(mask.b.mul(0.5).add(0.75))
    .add(vec3(0.28, 0.04, 0.04).mul(rim).mul(mask.b));
  c = mix(c, blood, shown.mul(mix(0.62, 0.94, age)));
  c = mix(c, vec3(0.6, 0.02, 0.02), read(u.uHurt).mul(smoothstep(0.05, 0.5, r)).mul(0.8));
  return vec4(c, colour.a);
}

/** `colour` (graded, in sRGB) for an HDR canvas, as the WebGL grade's HDR does: the frame as an SDR screen shows it
 *  (gamma 2.2: Windows shows SDR by the sRGB curve, which lifts its shadows), the highlights over `knee` grown towards
 *  the peak by their brightest channel (hue kept; with no room over the paper white, nothing grown), all of it at the
 *  paper white, encoded as extended sRGB. As it is in SDR. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function inHdr(colour: any, u: GradeUniforms, knee: number): any {
  const { clamp, max, pow, reference, select, sRGBTransferOETF, vec3, vec4 } = tsl as any;
  const read = (uniform: { value: number }): any => reference('value', 'float', uniform);
  const paper = read(u.uPaper);
  const v = pow(clamp(colour.rgb, 0, 1), vec3(2.2));
  const top = max(max(v.r, v.g), v.b);
  const room = max(read(u.uPeak).div(paper), 1);
  const along = clamp(top.sub(knee).div(1 - knee), 0, 1);
  const a = room.sub(knee).div(1 - knee).reciprocal();
  const grown = v.mul(along.mul(1 - knee).div(along.mul(a.oneMinus()).oneMinus()).add(knee)).div(max(top, 1e-6));
  const shown = sRGBTransferOETF(vec4(select(top.greaterThan(knee), grown, v).mul(paper), 1)).rgb;
  return vec4(select(read(u.uHdr).greaterThan(0.5), shown, colour.rgb), colour.a);
}

/** what draws into the scene's target after its pass, before the post chain reads it (the arms: `core/renderer.ts`) */
let overScene: () => void = () => {};
export function drawOverScene(draw: () => void): void {
  overScene = draw;
}

/** The post chain on WebGPU: the scene's pass, its bloom added, adapted to the light round each pixel, its highlights
 *  compressed, tone mapped keeping a large glare's hue and in sRGB, then graded there as WebGL's grade is
 *  (`graded`), its NaN and Inf pixels cleaned out first (`sanitized`), and in HDR grown past white (`inHdr`). */
export async function makePipeline(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera,
  looks: GradeLooks, grade: GradeUniforms): Promise<void> {
  const { RenderPipeline } = await import('three/webgpu');
  const { pass } = await import('three/tsl');
  const { bloom } = await import('three/addons/tsl/display/BloomNode.js');
  const gpu = renderer as unknown as WebGPURenderer;
  const scenePass = pass(scene, camera);
  // (sized as its frames will size it, before the warm-ups compile into it: the meshlets' culling is made for the
  // size it's drawn at, and the lobby's, compiled at the 1 px it started at, was made again with all its batches at
  // its first frame, their node builds in it)
  const size = gpu.getDrawingBufferSize(new THREE.Vector2());
  scenePass.setSize(size.x, size.y);
  sceneTarget = scenePass.renderTarget;
  samplesOf = scenePass as unknown as NonNullable<typeof samplesOf>;
  if (samplesChosen !== null) {
    samplesOf.options.samples = samplesChosen;
    samplesOf.renderTarget.samples = samplesChosen;
  }
  sizedByShare.push(scenePass);
  const drawScene = scenePass.updateBefore.bind(scenePass);
  scenePass.updateBefore = (frame: Parameters<typeof drawScene>[0]) => {
    const drawn = drawScene(frame);
    overScene();
    return drawn;
  };
  const raw = scenePass.getTextureNode('output');
  const color = sanitized(raw);
  pipeline = new RenderPipeline(gpu);
  // (tone mapped and in sRGB here, the grade after: the pipeline's own conversion off)
  pipeline.outputColorTransform = false;
  const glow = bloom(color, 0.85, 0, 0.9);
  sizedByShare.push(glow as unknown as (typeof sizedByShare)[number]);
  looks.bloom.forEach((weight, i) => glow.bloomTintColors[i].setScalar(weight / THREE_BLOOM_LEVELS[i]));
  // (untyped in three's types: its output as a texture node)
  const glowTexture = (glow as unknown as { getTextureNode(): any }).getTextureNode(); // eslint-disable-line @typescript-eslint/no-explicit-any
  // (after bloom, as on WebGL: the eye adapts to all the light that reaches it, halos included)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lightAt = (at: any): any => sanitized(raw.sample(at)).add(glowTexture.sample(at));
  const grid = boxDown(lightAt, 64, 36);
  const small = boxDown((at) => grid.sample(at), 16, 9);
  const large = boxDown((at) => small.sample(at), 4, 3);
  // (bloom's widest level: how large a bright spot is)
  const widest = (glow as unknown as { _renderTargetsVertical: THREE.RenderTarget[] })._renderTargetsVertical.at(-1)!;
  const lit = compressed(adapted(color.add(glow), small, large, grade, looks), looks.highlights, grade);
  const mapped = toneMappedKeepingHue(lit, tsl.texture(widest.texture).sample(tsl.screenUV), looks);
  // (tone mapped above: here only into sRGB)
  const out = tsl.renderOutput(mapped as never, THREE.NoToneMapping);
  pipeline.outputNode = <typeof pipeline.outputNode>inHdr(graded(out, grade), grade, looks.hdrKnee);
}

/** the scene's environment as one node, its map swapped (`oneEnvironment`) */
let environment: { value: THREE.Texture } | null = null;

/**
 * The scene's environment map given to WebGPU as one node for good, its map swapped as the look changes: three
 * makes each map a node of its own, whose id is in every lit pipeline's key, so each biome's map and the hall of
 * heroes' had a copy of every lit pipeline, made at the first frames in its look (a first visit's hall: 6 s held up).
 */
export function oneEnvironment(scene: THREE.Scene): void {
  const map = scene.environment;
  if (!WEBGPU || !map) return;
  environment ??= (map as THREE.CubeTexture).isCubeTexture ? tsl.cubeTexture(map as THREE.CubeTexture) : tsl.texture(map);
  environment.value = map;
  (scene as unknown as { environmentNode: unknown }).environmentNode = environment;
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
  if (!WEBGPU) return;
  const lightsOf = new Map(groups.map((group) => [group, pointLightsIn(group)]));
  const most = Math.max(...[...lightsOf.values()].map((lights) => lights.length));
  const rig = Array.from({ length: most }, () => new THREE.PointLight(0xffffff, 0));
  [...lightsOf.values()][0].forEach((light, i) => {
    rig[i].castShadow = light.castShadow;
    rig[i].shadow.autoUpdate = light.shadow.autoUpdate;
  });
  for (const lights of lightsOf.values()) for (const light of lights) light.visible = false;
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

/** Draws a frame through the WebGPU post chain. */
/**
 * The frame: its last pass drawn onto the canvas. three's pipeline draws it into whatever target is set, and an async
 * compile finishing puts back the target set when it started (a warm-up's, the scene's own): the frame after drew
 * into the texture it read (a GPUValidationError on `output`, that pass dropped).
 */
export function renderWebGPU(): void {
  if (!pipeline) return;
  const renderer = (pipeline as unknown as { renderer: WebGPURenderer }).renderer;
  renderer.setRenderTarget(null);
  pipeline.render();
}
