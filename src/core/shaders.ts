// Shader program lifetime. three.js deletes a compiled program as soon as the last
// material using it is disposed. Spell and enemy materials are short-lived, so every
// cast or wave recompiled its shaders: a 10-30 ms hitch, worse on ANGLE / Metal.
// The set of distinct programs is small and bounded, so we keep all of them for the
// whole session, and compile the known ones up front (warmUp) before the first frame.
import * as THREE from 'three';
import { WEBGPU, clustersBack, compiled as webgpuCompiled, holdClusters } from './webgpu';
import { G } from '../state';
import { CROWD_LAYER, WARM_LAYER } from './layers';
import { drawnInShadowsOnly } from '../world/culling';

const pinned = new WeakSet<object>();
const known: { name: string; key: string[] }[] = [];
let compiled = 0, loaded = false;
/** Programs compiled after loading, described for the perf report (what differs from the nearest known one). */
export const lateCompiles: string[] = [];

/** Take one extra reference on every program not seen yet, so it is never released. */
export function pinPrograms(renderer: THREE.WebGLRenderer, context?: () => string): void {
  for (const p of renderer.info.programs ?? []) {
    if (pinned.has(p)) continue;
    pinned.add(p);
    p.usedTimes++;
    compiled++;
    const key = p.cacheKey.split(',');
    // (an unnamed material's program by its kind: three's shader for it, `depth` a shadow caster's)
    const kind = p.name || key[0];
    // (a warm-up's after loading, the heroes' made when needed, isn't late: nothing was drawn waiting for it)
    if (loaded && behind) atLoad++;
    else if (loaded) lateCompiles.push(`${ownerOf(renderer, p)} (${kind}) ${context?.() ?? ''} | ${describeNew(p.name, key)}`);
    known.push({ name: p.name, key });
  }
}

/** Which scene object renders with program `p` (for the report): material type and object path. */
function ownerOf(renderer: THREE.WebGLRenderer, p: THREE.WebGLProgram): string {
  // (a shadow pass's material is three's own, on no object: the ledger, in dev builds, saw what it was drawing)
  const drawn = programsMade.find((entry) => entry.program === p);
  let found = drawn && drawn.owner !== '?' ? `drawing ${drawn.owner}` : 'unknown owner (shadow / post pass?)';
  G.scene.traverse((o) => {
    const mats = (o as THREE.Mesh).material;
    for (const m of Array.isArray(mats) ? mats : mats ? [mats] : []) {
      if ((renderer.properties.get(m) as { currentProgram?: unknown }).currentProgram !== p) continue;
      const path: string[] = [];
      for (let a: THREE.Object3D | null = o; a && a !== G.scene; a = a.parent) path.unshift(a.name || a.type);
      found = `${m.type}${m.name ? ` "${m.name}"` : ''} on ${path.join(' > ')}`;
    }
  });
  return found;
}

/**
 * Shadows' programs made the same whatever order the casters are drawn in. three's shadow pass draws every caster
 * that tests no alpha with one depth material, and copies the caster's `map` onto it each draw, but builds a new
 * program for it only when the instancing, the instance colours or the skinning change from one draw to the next: a
 * textured caster drawn just after such a change made a program with a map, one without it otherwise. Which ones the
 * boot compiled hung on the order its warm-up drew in, and a new order mid-fight compiled one more (#243: the forest's
 * wood rubble, after its trees cast from shadow copies of their own). The map does nothing there (a caster that tests
 * alpha gets a depth material of its own, which keeps it), so it's let go before each such draw.
 */
export function steadyShadowPrograms(renderer: THREE.WebGLRenderer): void {
  const draw = renderer.renderBufferDirect.bind(renderer);
  renderer.renderBufferDirect = (camera, scene, geometry, material, object, group) => {
    // (a shadow pass's draw: three gives it no scene; a point light's draws with distance, as `shadowStandIn`)
    const depth = material as THREE.MeshDepthMaterial & { isMeshDistanceMaterial?: boolean };
    const casting = depth.isMeshDepthMaterial || depth.isMeshDistanceMaterial;
    if (scene === null && casting && !(depth.alphaTest > 0)) {
      depth.map = null;
      depth.alphaMap = null;
    }
    draw(camera, scene, geometry, material, object, group);
  };
}

/** the side three's shadow pass draws a caster's material from, where the material sets none (`shadowSide`) */
const SHADOW_SIDE: Record<THREE.Side, THREE.Side> = {
  [THREE.FrontSide]: THREE.BackSide, [THREE.BackSide]: THREE.FrontSide, [THREE.DoubleSide]: THREE.DoubleSide,
};

/** a caster's material, as the shadow pass reads it */
type Casting = THREE.Material & Partial<Pick<THREE.MeshStandardMaterial,
  'map' | 'alphaMap' | 'displacementMap' | 'displacementScale' | 'displacementBias' | 'wireframe'>>;

/** the materials a shadow pass draws casters with: the moon's (a directional light) depth, a point light's distance */
type ShadowKind = 'depth' | 'distance';
type CastAs = THREE.MeshDepthMaterial | THREE.MeshDistanceMaterial;

/**
 * A stand-in for the material three's shadow pass draws `caster` with, `material` its own (r185's `getDepthMaterial`:
 * depth for the moon's light, a directional one, distance for a point light's): its custom one, else three's own, set
 * as the pass sets it, the map let go where `steadyShadowPrograms` lets it go. The pass's own are private, and one
 * serves every caster: a stand-in a caster, as a material has one program to wait for.
 */
function shadowStandIn(caster: THREE.Mesh, material: Casting, kind: ShadowKind): CastAs {
  const custom = (kind === 'depth' ? caster.customDepthMaterial : caster.customDistanceMaterial) as CastAs | undefined;
  const depth = custom ? custom.clone() : kind === 'depth' ? new THREE.MeshDepthMaterial() : new THREE.MeshDistanceMaterial();
  if (custom) {
    depth.onBeforeCompile = custom.onBeforeCompile;
    depth.customProgramCacheKey = custom.customProgramCacheKey;
  }
  depth.visible = material.visible;
  // (set on a distance material too, as the pass sets it: its type leaves it out)
  (depth as THREE.MeshDepthMaterial).wireframe = material.wireframe ?? false;
  depth.side = material.shadowSide ?? SHADOW_SIDE[material.side];
  depth.alphaTest = material.alphaToCoverage ? 0.5 : material.alphaTest;
  const tested = depth.alphaTest > 0;
  depth.map = tested ? material.map ?? null : null;
  depth.alphaMap = tested ? material.alphaMap ?? null : null;
  depth.clipShadows = material.clipShadows;
  depth.clippingPlanes = material.clippingPlanes;
  depth.clipIntersection = material.clipIntersection;
  depth.displacementMap = material.displacementMap ?? null;
  depth.displacementScale = material.displacementScale ?? 1;
  depth.displacementBias = material.displacementBias ?? 0;
  return depth;
}

/**
 * The programs three's shadow pass will make for `root`'s casters (those `camera` sees, as the pass draws them),
 * compiled now as `scene` lights them: the pass made each as it first drew with it, linked there, the page held up
 * (a first visit's lobby, 10 of them inside its warm-up's draw). Compiled without the scene's fog and environment,
 * as the pass draws with neither (three's empty scene in place of the scene). Gives back the stand-ins
 * (`shadowStandIn`), whose programs a warm-up waits for; the pass's own find them made. The stand-ins are left
 * undisposed: their programs are pinned whatever happens to them.
 */
export function compileShadows(renderer: THREE.WebGLRenderer, root: THREE.Object3D, camera: THREE.Camera, scene: THREE.Scene): Compiled {
  // (WebGPU's shadows are its shadow nodes', not three's WebGL depth materials: made as each shadow is first drawn)
  if (WEBGPU) return new Set();
  // (a point light that casts draws its casters' distance from it: the biomes' warmest, #298)
  let pointShadows = false;
  scene.traverse((o) => { if ((o as THREE.PointLight).isPointLight && o.castShadow) pointShadows = true; });
  const compiled: Compiled = new Set(compileCasters(renderer, root, camera, scene, 'depth'));
  if (pointShadows) for (const m of compileCasters(renderer, root, camera, scene, 'distance')) compiled.add(m);
  return compiled;
}

/** `compileShadows` for one kind of shadow pass. */
function compileCasters(renderer: THREE.WebGLRenderer, root: THREE.Object3D, camera: THREE.Camera, scene: THREE.Scene,
  kind: ShadowKind): Compiled {
  const own = new Map<THREE.Mesh, THREE.Mesh['material']>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const drawable = mesh.isMesh || (o as THREE.Line).isLine || (o as THREE.Points).isPoints;
    if (!drawable || !mesh.material) return;
    own.set(mesh, mesh.material);
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const casts = mesh.castShadow && mesh.layers.test(camera.layers);
    const standIns = casts ? materials.filter((m) => m.visible).map((m) => shadowStandIn(mesh, m, kind)) : [];
    // (what casts nothing is left out: a compile passes over a mesh with no material)
    mesh.material = (Array.isArray(mesh.material) ? standIns : standIns[0]) as THREE.Mesh['material'];
  });
  const { fog, environment } = scene;
  scene.fog = null;
  scene.environment = null;
  try {
    return renderer.compile(root, camera, scene);
  } finally {
    scene.fog = fog;
    scene.environment = environment;
    for (const [mesh, material] of own) mesh.material = material;
  }
}

/** A program as three made it, for the lab (`lab programs`): the loading step showing as it was made, whether
 *  `compile()` made it (the warm-ups' compile) or a draw, the material's type and what it was made for (its
 *  material and object, as `ownerOf` says it; three names a program after its material's name alone), the draws
 *  that used it since, and what uses it: the scene's top-level object (by name, else type) of each object compiled
 *  or drawn with it, so a program the foes alone use is told from one the lobby shares. Its shaders' GLSL as three
 *  gave it, which three's own program drops once linked (what `lab programs --cost` compiles again). */
export interface ProgramMade {
  program: THREE.WebGLProgram; step: string; byCompile: boolean; type: string; owner: string; draws: number;
  users: Set<string>; vertex: string; fragment: string;
}
/** Every program made since `watchPrograms`, in dev builds (nothing in a production build records them). */
export const programsMade: ProgramMade[] = [];

/** whether the warm-up behind the lobby is on (game/warmup.ts warmTheRest): its programs are the boot's */
let behind = false;
export function behindTheLobby(on: boolean): void { behind = on; }

/** The loading screen's step, or after it. */
const stepShowing = (): string => {
  if (behind) return 'behind the lobby';
  const loading = document.getElementById('loading');
  return !loading || loading.classList.contains('done') ? 'after the reveal' : loading.querySelector('.ld-sub')?.textContent ?? '?';
};

/** `material` on `object` as the ledger says it: its type, its name and the object's path. */
function madeFor(material: THREE.Material, object: THREE.Object3D): string {
  const path: string[] = [];
  for (let a: THREE.Object3D | null = object; a?.parent; a = a.parent) path.unshift(a.name || a.type);
  return `${material.type}${material.name ? ` "${material.name}"` : ''} on ${path.join(' > ') || object.type}`;
}

/** The scene's top-level object `object` is under (itself, if it's one), by name, else its type. */
function topOf(object: THREE.Object3D): string {
  let top = object;
  while (top.parent?.parent) top = top.parent;
  return top.name || top.type;
}

/** Names what `compile()` made each of `made` for (the first material in `scene`, and its object, using it), and
 *  adds every object it compiled to the users of its program, new or not (`byProgram`). */
function ownCompiled(renderer: THREE.WebGLRenderer, scene: THREE.Object3D, made: ProgramMade[], byProgram: Map<object, ProgramMade>): void {
  const waiting = new Map<object, ProgramMade>(made.map((entry) => [entry.program, entry]));
  scene.traverse((object) => {
    const mats = (object as THREE.Mesh).material;
    for (const material of Array.isArray(mats) ? mats : mats ? [mats] : []) {
      const program = (renderer.properties.get(material) as { currentProgram?: object }).currentProgram;
      if (program) byProgram.get(program)?.users.add(topOf(object));
      const entry = program && waiting.get(program);
      if (!entry) continue;
      entry.type = material.type;
      entry.owner = madeFor(material, object);
      waiting.delete(program!);
    }
  });
}

/** Records each program three makes and each draw that uses it (`programsMade`), in dev builds: the boot's programs
 *  are made before any lab command can watch. */
export function watchPrograms(renderer: THREE.WebGLRenderer): void {
  if (!import.meta.env.DEV) return;
  let compiling = false;
  let drawing: { material: THREE.Material; object: THREE.Object3D } | null = null;
  const byProgram = new Map<object, ProgramMade>();
  const compile = renderer.compile.bind(renderer);
  renderer.compile = (scene, camera, targetScene = null) => {
    const before = programsMade.length;
    compiling = true;
    try { return compile(scene, camera, targetScene); } finally {
      compiling = false;
      ownCompiled(renderer, scene, programsMade.slice(before), byProgram);
    }
  };
  const gl = renderer.getContext();
  const sources = new WeakMap<WebGLShader, string>();
  const shaderSource = gl.shaderSource.bind(gl);
  gl.shaderSource = (shader, source) => { sources.set(shader, source); shaderSource(shader, source); };
  const sourceOf = (shader: unknown): string => sources.get(shader as WebGLShader) ?? '';
  const programs = renderer.info.programs!;
  const push = programs.push.bind(programs);
  programs.push = (...made: THREE.WebGLProgram[]) => {
    for (const program of made) {
      const type = drawing?.material.type ?? '?';
      const owner = drawing ? madeFor(drawing.material, drawing.object) : '?';
      const { vertexShader, fragmentShader } = program as unknown as { vertexShader: unknown; fragmentShader: unknown };
      const entry = {
        program, step: stepShowing(), byCompile: compiling, type, owner, draws: 0, users: new Set<string>(),
        vertex: sourceOf(vertexShader), fragment: sourceOf(fragmentShader),
      };
      programsMade.push(entry);
      byProgram.set(program, entry);
    }
    return push(...made);
  };
  const draw = renderer.renderBufferDirect.bind(renderer);
  renderer.renderBufferDirect = (camera, scene, geometry, material, object, group) => {
    drawing = { material, object };
    try { draw(camera, scene, geometry, material, object, group); } finally { drawing = null; }
    const used = (renderer.properties.get(material) as { currentProgram?: object }).currentProgram;
    const entry = used && byProgram.get(used);
    if (!entry) return;
    entry.draws++;
    entry.users.add(topOf(object));
  };
}

/** Field-level diff against the closest known program of the same kind. */
function describeNew(name: string, key: string[]): string {
  let best: string[] | null = null, bestD = Infinity;
  for (const k of known) {
    if (k.name !== name || k.key.length !== key.length) continue;
    let d = 0;
    for (let i = 0; i < key.length; i++) if (key[i] !== k.key[i]) d++;
    if (d < bestD) { bestD = d; best = k.key; }
  }
  if (!best) return `no similar program; key starts ${key.slice(0, 3).join(',').slice(0, 80)}`;
  return key.map((v, i) => (v !== best![i] ? `[${i}] ${best![i].slice(0, 30)} -> ${v.slice(0, 30)}` : '')).filter(Boolean).join('; ');
}

/** Logs every program that failed to link, where three checked none as it was first used (production builds: its
 *  checks held the boot up, `initRenderer`), once the game is shown and the programs are long linked. */
export function checkPrograms(renderer: THREE.WebGLRenderer): void {
  if (WEBGPU || renderer.debug.checkShaderErrors) return;
  const gl = renderer.getContext();
  for (const p of renderer.info.programs ?? []) {
    const program = (p as unknown as { program: WebGLProgram }).program;
    if (gl.getProgramParameter(program, gl.LINK_STATUS)) continue;
    console.error(`THREE.WebGLProgram: shader error (${p.name || p.cacheKey.slice(0, 60)})`, gl.getProgramInfoLog(program));
  }
}

let atLoad = 0;
/** Call once loading is done; later compiles are counted as in-game hitches. */
export function markLoaded(): void { atLoad = compiled; loaded = true; }
/** Shader programs compiled since loading finished (each one was a frame hitch). */
export const programsCompiledInGame = (): number => compiled - atLoad;

/** What `compile` gives back: the materials of the scene it made programs for. */
type Compiled = Set<THREE.Material>;
/** a program as three keeps it, with what its type leaves out */
type Program = THREE.WebGLProgram & { isReady(): boolean; getAttributes(): unknown };

/** the most of a frame the textures' uploads take before the page is let paint (ms): under the loading screen, and
 *  behind the lobby (a frame at 144 Hz is 7 ms, the lobby's own 5 of it) */
const UPLOAD_SLICE_MS = 25, UPLOAD_SLICE_BEHIND_MS = 2;

/**
 * `compile` run with what no pass draws with its own material left out (put back after, where it was): the crowds'
 * bodies' own meshes, which their crowd draws (models/crowd.ts), and the casters the shadow map alone draws
 * (world/culling.ts: their shadows' programs are `compileShadows`'). three's compile makes a program for every mesh
 * of the scene whatever its layer or whether it's shown (17 lit programs compiled for nothing, `lab programs`; and
 * the biomes' baked casters', one).
 */
function withoutUndrawn(root: THREE.Object3D, compile: () => Compiled): Compiled {
  const out: THREE.Object3D[] = [];
  root.traverse((o) => {
    const undrawn = o.layers.mask === 1 << CROWD_LAYER || drawnInShadowsOnly(o as THREE.Mesh);
    if (undrawn && o.parent) out.push(o);
  });
  return without(out, compile);
}

/** The textures `materials` draw with (a render target's left out: drawn into, not uploaded). */
function texturesOf(materials: Compiled): Set<THREE.Texture> {
  const textures = new Set<THREE.Texture>();
  const add = (value: unknown): void => {
    const texture = value as THREE.Texture | null;
    if (texture?.isTexture && !(texture as THREE.Texture & { isRenderTargetTexture?: boolean }).isRenderTargetTexture) textures.add(texture);
  };
  for (const material of materials) {
    for (const value of Object.values(material)) add(value);
    for (const uniform of Object.values((material as THREE.ShaderMaterial).uniforms ?? {})) add(uniform?.value);
  }
  return textures;
}

/** a step of a warm-up waited for: the next task, or behind the lobby the frame after the next (`WarmUp.step`) */
type Step = () => Promise<void>;
const nextTask: Step = () => new Promise((r) => setTimeout(r));

/**
 * Every one of `textures` uploaded, the page let paint between (`step`, after `sliceMs` of them): the render after
 * a warm-up's compile uploaded them as it drew, queued on the GPU's process ahead of what the render then waited on.
 */
async function uploaded(renderer: THREE.WebGLRenderer, textures: Set<THREE.Texture>, sliceMs: number, step: Step): Promise<void> {
  let slice = performance.now();
  for (const texture of textures) {
    renderer.initTexture(texture);
    if (performance.now() - slice < sliceMs) continue;
    await step();
    slice = performance.now();
  }
}

/**
 * Resolves once the GPU's process has done every command sent before: a fence, whose status WebGL reads between
 * tasks without a round trip, so a program asked whether it's linked after it doesn't wait behind them (a return's
 * fight warmed behind the lobby held it up 250 ms at a time asking, its programs read back from the cache meanwhile).
 * Asked every `poll`.
 */
async function commandsDone(renderer: THREE.WebGLRenderer, poll: Step): Promise<void> {
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  if (!fence) return;
  gl.flush();
  while (gl.getSyncParameter(fence, gl.SYNC_STATUS) !== gl.SIGNALED) await poll();
  gl.deleteSync(fence);
}

/** How `linked` waits: told how far along, asking every `poll`, a frame between each program's uniforms read
 *  (`step`, behind the lobby), and given up on after `giveUpMs` for one program. */
interface Linking { done?: (share: number) => void; poll: Step; step?: Step; giveUpMs?: number }

/**
 * Waits for `materials`' programs to link (on the GPU's process meanwhile, KHR_parallel_shader_compile), each asked
 * once it's the oldest left (a read of a query's result, no round trip), and a linked one's uniforms and attributes
 * read at once (one round trip, behind the lobby one a frame). three's compileAsync asked every material's program
 * each time, and their first draws read them: each a round trip to the GPU's process, waiting behind its work.
 * Whether they all linked: false where one wasn't `giveUpMs` after the commands were done (not from the GPU's cache).
 */
async function linked(renderer: THREE.WebGLRenderer, materials: Compiled, how: Linking): Promise<boolean> {
  // (WebGPU's pipelines are compiled by its `compileAsync`, started where `compile` is asked: core/webgpu.ts)
  if (WEBGPU) {
    await webgpuCompiled();
    return true;
  }
  await commandsDone(renderer, how.poll);
  const programs = new Set<Program>();
  for (const material of materials) {
    const program = (renderer.properties.get(material) as { currentProgram?: Program }).currentProgram;
    if (program) programs.add(program);
  }
  let linkedSoFar = 0;
  for (const program of programs) {
    const asked = performance.now();
    while (!program.isReady()) {
      if (how.giveUpMs !== undefined && performance.now() - asked > how.giveUpMs) return false;
      await how.poll();
    }
    program.getUniforms();
    program.getAttributes();
    how.done?.(++linkedSoFar / programs.size);
    await how.step?.();
  }
  return true;
}

/** How a warm-up goes (`warmUp`). */
export interface WarmUp {
  /** added to the scene for the draw alone, and taken away after (compiled with the scene where `compile` is left
   *  out): the lobby's frames mustn't draw what isn't linked yet, as three would link it there, the frame waiting */
  objects?: THREE.Object3D[];
  /** what's compiled, as the scene lights it (a part of the fight, behind the lobby: the lobby's own are warm);
   *  left out, the whole scene and `objects` */
  compile?: THREE.Object3D[];
  /** left out of it: what the lobby doesn't show (the other biomes), warmed behind it */
  leaveOut?: THREE.Object3D[];
  /** compiled with it, besides the scene's: what passes of their own draw (the outline's), its materials' links
   *  waited for with the rest */
  also?: () => Compiled;
  /** drawn alone, whatever the camera sees, on the warm-ups' layer (every light is on it too: their counts are the
   *  scene's, `lightThePasses` in renderer.ts), into a pixel of the target: the programs the draws make are the
   *  scene's, and its fragments none (a whole lobby drawn again for each part held its frames up); left out, the
   *  whole scene unculled */
  drawn?: THREE.Object3D[];
  /** shown in place of `hide` for the draw alone (a biome the lobby doesn't show, for its shadows' programs, made as
   *  they're drawn: one in place of the other, so the lights counted are as many) */
  swap?: Swap;
  /** called just before the draw: what the lobby's frames mustn't draw before its programs are linked brought in (a
   *  foe seated in its crowd, which draws it whatever the camera sees) */
  show?: () => void;
  /** `show` undone: on WebGPU what it brings in is shown for the compile's walk of the scene alone (a crowd with
   *  no foe seated draws nothing, and its pipelines were made at the draw: the fight's 2.6 s) */
  hide?: () => void;
  /** awaited before the uploads, given the textures the compiled materials draw with (their maps, still coming) */
  before?: (textures: Set<THREE.Texture>) => Promise<void>;
  /** told how much of the warm-up is done, 0 to 1 (the share each step takes is a guess: the links, most) */
  progress?: (share: number) => void;
  /** awaited between its steps (each root's compile, a slice of uploads, each program's uniforms read, the draw):
   *  behind the lobby, a frame each; left out, they run back to back, the loading screen's way */
  step?: Step;
  /** given up on, nothing drawn (`cold`), where a program isn't linked this long after its commands were done (ms):
   *  one not from the GPU's cache, behind the lobby (compiled cold behind it, a return's lobby drew 3 frames a second) */
  giveUpMs?: number;
}

/** What a warm-up shows in place of what (`WarmUp.swap`), and on WebGPU the scene's look it's shown with (`look`:
 *  put on, returning its undoing): there a pipeline is keyed by the scene's environment and fog too, so the hall of
 *  heroes compiled in the biome's look was built again in its own at its first frames (a first visit's 6 s hold). */
export interface Swap { show: THREE.Object3D; hide: THREE.Object3D; look?: () => () => void }

/** of a warm-up (`progress`), the share done once its maps have come, its textures uploaded, its programs linked */
const MAPS_DONE = 0.2, UPLOADS_DONE = 0.3, LINKS_DONE = 0.95;

/** What a warm-up took (ms): its compile and its draw (each one task, the compile a task a root with `step`), its
 *  wait for the maps it draws with (`WarmUp.before`) and their uploads, and the wait for its programs' links (the
 *  GPU's process's work: long where no program came from a cache, a first visit's); and whether it was given up on
 *  as cold (`WarmUp.giveUpMs`: nothing drawn). */
export interface WarmedUp { compileMs: number; mapsMs: number; uploadsMs: number; linksMs: number; drawMs: number; cold: boolean }

/** `run` with `out` taken out of their parents' lists (put back after, where they were): nothing else sees them go. */
function without<T>(out: THREE.Object3D[], run: () => T): T {
  const places = out.filter((o) => o.parent).map((o) => ({ parent: o.parent!, at: o.parent!.children.indexOf(o), o }));
  for (const { parent, at } of [...places].sort((a, b) => b.at - a.at)) parent.children.splice(at, 1);
  try {
    return run();
  } finally {
    for (const { parent, at, o } of [...places].sort((a, b) => a.at - b.at)) parent.children.splice(at, 0, o);
  }
}

/**
 * `draw` with `drawn` alone drawn, whatever the camera sees: what of it the camera draws put on the warm-ups' layer
 * too (not a crowd's bodies' own meshes, which their crowd draws: on the warm-ups' layer, 14 lit programs were made
 * for them, cold inside the draw on a first visit, 4.5 s), unculled, the camera on that layer alone, into a pixel of
 * `target` (its scissor); with no `drawn`, the whole scene unculled.
 */
function drawnAlone(scene: THREE.Scene, camera: THREE.Camera, target: THREE.WebGLRenderTarget, drawn: THREE.Object3D[] | undefined, draw: () => void): void {
  const unculled: THREE.Object3D[] = [], layered: THREE.Object3D[] = [];
  const uncull = (o: THREE.Object3D): void => {
    if (o.frustumCulled) { o.frustumCulled = false; unculled.push(o); }
    if (drawn && o.layers.test(camera.layers) && !o.layers.isEnabled(WARM_LAYER)) {
      o.layers.enable(WARM_LAYER);
      layered.push(o);
    }
  };
  for (const root of drawn ?? [scene]) root.traverse(uncull);
  const mask = camera.layers.mask;
  const scissor = target.scissor.clone(), scissorTest = target.scissorTest;
  if (drawn) {
    camera.layers.set(WARM_LAYER);
    target.scissor.set(0, 0, 1, 1);
    target.scissorTest = true;
  }
  try {
    draw();
  } finally {
    camera.layers.mask = mask;
    target.scissor.copy(scissor);
    target.scissorTest = scissorTest;
    for (const o of unculled) o.frustumCulled = true;
    for (const o of layered) o.layers.disable(WARM_LAYER);
  }
}

/**
 * `scene`'s programs (`leaveOut` left out) compiled now for `target`, ahead of the warm-up that will draw them, and
 * those of `objects` (out of the scene) as the scene lights them: the GPU's threads link them meanwhile, and the
 * warm-up's compile finds them made. The whole scene, as three counts a light twice that is both in the scene and in
 * what's compiled with it.
 */
export function compileAhead(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, target: THREE.WebGLRenderTarget, leaveOut: THREE.Object3D[], objects: THREE.Object3D[] = []): void {
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  without(leaveOut, () => {
    withoutUndrawn(scene, () => renderer.compile(scene, camera));
    compileShadows(renderer, scene, camera, scene);
  });
  for (const root of objects) {
    withoutUndrawn(root, () => renderer.compile(root, camera, scene));
    compileShadows(renderer, root, camera, scene);
  }
  renderer.setRenderTarget(prev);
}

/**
 * Compile every shader the scene (plus `objects`) needs, and keep them.
 * This is a real render, not renderer.compile() alone: programs differ between the screen
 * and a render target (tone mapping, output colour space), the game always draws into the
 * post-processing `target`, and compile() skips the shadow-map depth shaders (compiled as
 * the shadow pass makes them, `compileShadows`, linked before the render). The render
 * waits for `before` too (the maps it uploads: compiling reads none of their pixels); the
 * maps are uploaded and the programs' links waited for first (`uploaded`, `linked`).
 */
export async function warmUp(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, target: THREE.WebGLRenderTarget, how: WarmUp = {}): Promise<WarmedUp> {
  if (WEBGPU) return warmUpWebGPU(renderer, scene, camera, target, how);
  const { objects = [], leaveOut = [], swap, before, progress, step } = how;
  const compiled = how.compile ?? [scene, ...objects];
  const prev = renderer.getRenderTarget();
  // compile in the background first where the browser can (KHR_parallel_shader_compile), so the
  // loading screen stays live; the target is set because program variants depend on it
  renderer.setRenderTarget(target);
  let compileMs = 0;
  const materials = new Set<THREE.Material>();
  for (const root of compiled) {
    const at = performance.now();
    const made = without(leaveOut, () => withoutUndrawn(root, () => renderer.compile(root, camera, scene)));
    const shadows = without(leaveOut, () => compileShadows(renderer, root, camera, scene));
    compileMs += performance.now() - at;
    for (const material of [...made, ...shadows]) materials.add(material);
    // (behind the lobby a root's programs a frame: each is brought in from the GPU's cache on its process's main
    // thread, which draws the lobby's frames too)
    if (step) {
      renderer.setRenderTarget(prev);
      await step();
      renderer.setRenderTarget(target);
    }
  }
  renderer.setRenderTarget(prev);
  for (const material of how.also?.() ?? []) materials.add(material);
  const textures = texturesOf(materials);
  let at = performance.now();
  await before?.(textures);
  const mapsMs = performance.now() - at;
  progress?.(MAPS_DONE);
  at = performance.now();
  await uploaded(renderer, textures, step ? UPLOAD_SLICE_BEHIND_MS : UPLOAD_SLICE_MS, step ?? nextTask);
  const uploadsMs = performance.now() - at;
  progress?.(UPLOADS_DONE);
  at = performance.now();
  const links = (share: number): void => progress?.(UPLOADS_DONE + share * (LINKS_DONE - UPLOADS_DONE));
  const poll = step ?? ((): Promise<void> => new Promise((r) => setTimeout(r, 4)));
  const ready = await linked(renderer, materials, { done: links, poll, step, giveUpMs: how.giveUpMs });
  const linksMs = performance.now() - at;
  pinPrograms(renderer);
  if (!ready) return { compileMs, mapsMs, uploadsMs, linksMs, drawMs: 0, cold: true };
  await step?.();
  renderer.setRenderTarget(target);
  at = performance.now();
  for (const o of objects) scene.add(o);
  how.show?.();
  // once: the shadow pass of a render sees the light setup of the one before, and shadow depth
  // programs are keyed by light counts, but the compile above set the scene's lights up
  if (swap) { swap.show.visible = true; swap.hide.visible = false; }
  const drawn = how.drawn && [...how.drawn, ...objects, ...(swap ? [swap.show] : [])];
  drawnAlone(scene, camera, target, drawn, () => without(leaveOut, () => renderer.render(scene, camera)));
  if (swap) { swap.show.visible = false; swap.hide.visible = true; }
  how.hide?.();
  const drawMs = performance.now() - at;
  renderer.setRenderTarget(prev);
  pinPrograms(renderer);
  for (const o of objects) scene.remove(o);
  progress?.(1);
  return { compileMs, mapsMs, uploadsMs, linksMs, drawMs, cold: false };
}

/**
 * `warmUp` on WebGPU: its draw's pipelines made by `compileAsync` first, on the GPU's threads, with the node builds a
 * slice a frame. Started with everything as the draw will have it (its objects in, its layer, unculled, the other
 * biomes out), as three keys each pipeline by the lights and target it's drawn with: compiled each root as the WebGL
 * code does, the draw built them all again on the main thread (3.8 s on a return). The scene's walk is synchronous,
 * so it's all put back before the compile's first wait, which the lobby's frames may draw through.
 */
async function warmUpWebGPU(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, target: THREE.WebGLRenderTarget, how: WarmUp): Promise<WarmedUp> {
  const { objects = [], leaveOut = [], swap, progress, step } = how;
  const gpu = renderer as unknown as { compileAsync: (scene: THREE.Object3D, camera: THREE.Camera) => Promise<void> };
  // (a look of its own keys every lit pipeline afresh, so all the scene is compiled and drawn in it, not its part)
  const drawn = swap?.look ? undefined : how.drawn && [...how.drawn, ...objects, ...(swap ? [swap.show] : [])];
  const asDrawn = (run: () => void): void => {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    for (const o of objects) scene.add(o);
    const unlook = swap?.look?.();
    if (swap) { swap.show.visible = true; swap.hide.visible = false; }
    try {
      drawnAlone(scene, camera, target, drawn, () => without(leaveOut, run));
    } finally {
      if (swap) { swap.show.visible = false; swap.hide.visible = true; }
      unlook?.();
      for (const o of objects) scene.remove(o);
      renderer.setRenderTarget(prev);
    }
  };
  const compile = (): Promise<void> => {
    let compiling: Promise<void> = Promise.resolve();
    asDrawn(() => {
      if (how.hide) how.show?.();
      try {
        compiling = gpu.compileAsync(scene, camera);
      } finally {
        how.hide?.();
      }
    });
    return compiling;
  };
  let at = performance.now();
  // (`?meshlets`: the walk asks the clusters of what has none, drawn as before till they come; once let in, a batch
  // draws them with materials of its own, compiled here before any frame can draw it: built at the lobby's draws,
  // they held its frames up to 270 ms)
  const release = holdClusters();
  let compiling: Promise<void>;
  try {
    compiling = compile();
  } catch (e) {
    release();
    throw e;
  }
  const compileMs = performance.now() - at;
  at = performance.now();
  try {
    await compiling;
    await clustersBack();
  } finally {
    if (release() > 0) await compile();
  }
  const linksMs = performance.now() - at;
  progress?.(LINKS_DONE);
  await step?.();
  at = performance.now();
  // (and taken out again: the fight's foes left in their crowds, the lobby's frames drew every kind as the other
  // biomes warmed after, 943 node builds at its draws, 0.6 s of its JS)
  how.show?.();
  try {
    asDrawn(() => renderer.render(scene, camera));
  } finally {
    how.hide?.();
  }
  const drawMs = performance.now() - at;
  progress?.(1);
  return { compileMs, mapsMs: 0, uploadsMs: 0, linksMs, drawMs, cold: false };
}
